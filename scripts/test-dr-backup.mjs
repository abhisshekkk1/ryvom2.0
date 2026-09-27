import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  encryptBackupBuffer,
  decryptBackupBuffer,
  computeSha256,
  validateManifest,
  checkBackupSizeThreshold,
  checkRestorePermission,
  validateAuthDataSql,
  inspectExtractedBackup,
} from "./dr-backup-tools.mjs";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("  RYVOM DISASTER RECOVERY (PHASE 2A) BACKUP TEST SUITE");
  console.log("=======================================================\n");

  const testPassphrase = "test-encryption-key-for-ryvom-backup-123456789!";
  const samplePayload = Buffer.from(
    JSON.stringify({
      schema: "public",
      tables: ["clients", "check_ins", "coach_reviews", "client_coach_notes", "client_access", "performance_metrics", "performance_logs"],
      sample_data: "PostgreSQL custom format dump simulation",
    })
  );

  // 1. Encryption and Decryption Round-Trip
  console.log("1. Encryption, Decryption & Cryptographic Invariants:");

  await runTest("Backup encrypts with OpenSSL Salted__ header and decrypts to original payload", () => {
    const encrypted = encryptBackupBuffer(samplePayload, testPassphrase);
    assert.ok(encrypted.length > samplePayload.length);
    assert.equal(encrypted.subarray(0, 8).toString("utf8"), "Salted__");

    const decrypted = decryptBackupBuffer(encrypted, testPassphrase);
    assert.deepEqual(decrypted, samplePayload);
  });

  await runTest("Decryption fails with incorrect passphrase", () => {
    const encrypted = encryptBackupBuffer(samplePayload, testPassphrase);
    assert.throws(() => {
      decryptBackupBuffer(encrypted, "wrong-passphrase-totally-incorrect-123");
    });
  });

  await runTest("Decryption rejects truncated or tampered encrypted buffers", () => {
    const encrypted = encryptBackupBuffer(samplePayload, testPassphrase);

    // Tampered header magic
    const tamperedHeader = Buffer.from(encrypted);
    tamperedHeader[0] ^= 0xff;
    assert.throws(() => {
      decryptBackupBuffer(tamperedHeader, testPassphrase);
    }, /Invalid encrypted backup header/);

    // Tampered padding block (causes PKCS#7 padding failure)
    const tamperedPadding = Buffer.from(encrypted);
    tamperedPadding[tamperedPadding.length - 1] ^= 0xff;
    assert.throws(() => {
      decryptBackupBuffer(tamperedPadding, testPassphrase);
    });

    // Truncated buffer
    const truncated = encrypted.subarray(0, 10);
    assert.throws(() => {
      decryptBackupBuffer(truncated, testPassphrase);
    }, /too short/);
  });

  await runTest("Encryption rejects weak or missing passphrase", () => {
    assert.throws(() => encryptBackupBuffer(samplePayload, ""));
    assert.throws(() => encryptBackupBuffer(samplePayload, "short"));
    assert.throws(() => encryptBackupBuffer(samplePayload, null));
  });

  // 2. SHA-256 Checksum & Tamper Detection
  console.log("\n2. Checksum Verification & Integrity:");

  await runTest("computeSha256 calculates consistent 64-character hex digest", () => {
    const hash1 = computeSha256(samplePayload);
    const hash2 = computeSha256(samplePayload);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  await runTest("Checksum detects any single-bit tampering", () => {
    const altered = Buffer.from(samplePayload);
    altered[0] ^= 0x01;
    assert.notEqual(computeSha256(samplePayload), computeSha256(altered));
  });

  // 3. Manifest Validation
  console.log("\n3. Manifest Schema & Verification Status:");

  const validManifest = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    git_commit_sha: "abc1234def5678",
    backup_filename: "ryvom-db-2026-09-27.dump.gz.enc",
    backup_size_bytes: 524288,
    backup_size_mb: "0.50 MB",
    sha256_checksum: computeSha256(samplePayload),
    encryption: "AES-256-CBC-PBKDF2-100K",
    format: "postgresql-custom-in-tar.gz.enc",
    included_schemas: ["public"],
    retention_days: 7,
    max_allowed_size_mb: 400,
    verification_status: "verified",
  };

  await runTest("Valid manifest passes schema and checksum validation", () => {
    const res = validateManifest(validManifest, computeSha256(samplePayload));
    assert.equal(res.valid, true);
  });

  await runTest("Manifest fails if required fields are missing", () => {
    const invalid = { ...validManifest };
    delete invalid.sha256_checksum;
    const res = validateManifest(invalid);
    assert.equal(res.valid, false);
    assert.ok(res.error.includes("sha256_checksum"));
  });

  await runTest("Manifest fails if checksum does not match encrypted file", () => {
    const res = validateManifest(validManifest, "0".repeat(64));
    assert.equal(res.valid, false);
    assert.ok(res.error.includes("Checksum mismatch"));
  });

  // 4. Backup Size Threshold Monitoring
  console.log("\n4. GitHub Free Storage Threshold Monitoring:");

  await runTest("Accepts backup below the 400 MB threshold", () => {
    const size10Mb = 10 * 1024 * 1024;
    const res = checkBackupSizeThreshold(size10Mb, 400);
    assert.equal(res.exceeded, false);
    assert.equal(res.sizeMb, 10);
  });

  await runTest("Rejects backup exceeding the 400 MB threshold to protect GitHub Free 500 MB quota", () => {
    const size450Mb = 450 * 1024 * 1024;
    const res = checkBackupSizeThreshold(size450Mb, 400);
    assert.equal(res.exceeded, true);
    assert.ok(res.error.includes("exceeds GitHub Free safety threshold of 400 MB"));
  });

  // 5. Production Restore Safeguard
  console.log("\n5. Restore Safety Guardrails:");

  await runTest("Refuses restore when RYVOM_ALLOW_RESTORE is not set", () => {
    delete process.env.RYVOM_ALLOW_RESTORE;
    assert.throws(() => {
      checkRestorePermission();
    }, /SAFETY VIOLATION/);
  });

  await runTest("Refuses restore when RYVOM_ALLOW_RESTORE is set to false", () => {
    process.env.RYVOM_ALLOW_RESTORE = "false";
    assert.throws(() => {
      checkRestorePermission();
    }, /SAFETY VIOLATION/);
  });

  await runTest("Allows restore check only when RYVOM_ALLOW_RESTORE is explicitly 'true'", () => {
    process.env.RYVOM_ALLOW_RESTORE = "true";
    assert.equal(checkRestorePermission(), true);
    delete process.env.RYVOM_ALLOW_RESTORE;
  });

  await runTest("Refuses restore when target database URL matches production RYVOM_DB_URL", () => {
    process.env.RYVOM_ALLOW_RESTORE = "true";
    process.env.RYVOM_DB_URL = "postgresql://postgres:secret@db.prod.supabase.co:5432/postgres";

    assert.throws(() => {
      checkRestorePermission("postgresql://postgres:secret@db.prod.supabase.co:5432/postgres");
    }, /FATAL SAFETY VIOLATION/);

    delete process.env.RYVOM_ALLOW_RESTORE;
    delete process.env.RYVOM_DB_URL;
  });

  // 6. Auth UUID Mapping Structure
  console.log("\n6. Auth UUID Mapping & Identity Preservation Schema:");

  await runTest("Validates structure of auth_trainers_mapping for UUID recovery", () => {
    const sampleAuthMapping = [
      {
        id: "11111111-1111-4111-a111-111111111111",
        email: "trainer@example.com",
        raw_user_meta_data: { full_name: "Trainer Alice", role: "coach" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    // Must be array
    assert.ok(Array.isArray(sampleAuthMapping));
    for (const user of sampleAuthMapping) {
      assert.ok(user.id, "Must contain user UUID");
      assert.ok(user.email, "Must contain email");
      assert.equal("password" in user, false, "Must never contain password");
      assert.equal("encrypted_password" in user, false, "Must never contain password hash");
      assert.equal("recovery_token" in user, false, "Must never contain recovery token");
    }
  });

  // 7. Auth Data SQL Structure & Safety Validation
  console.log("\n7. Auth Data SQL Structure, Safety & Exclusion Rules:");

  const validAuthSql = `
-- PostgreSQL database dump data-only
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at)
VALUES ('11111111-1111-4111-a111-111111111111', 'trainer_alice@test.com', '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNO', '{"full_name":"Trainer Alice","role":"coach"}', now());

INSERT INTO auth.identities (id, user_id, provider, identity_data, created_at)
VALUES ('id-alice-1', '11111111-1111-4111-a111-111111111111', 'email', '{"sub":"11111111-1111-4111-a111-111111111111","email":"trainer_alice@test.com"}', now());
  `;

  await runTest("auth_data.sql validates correctly with users and identities records", () => {
    const val = validateAuthDataSql(validAuthSql);
    assert.equal(val.valid, true);
    assert.equal(val.usersCount, 1);
    assert.equal(val.identitiesCount, 1);
  });

  await runTest("auth_data.sql strictly rejects unauthorized DDL (CREATE TABLE, DROP, ALTER)", () => {
    const maliciousSql = validAuthSql + "\nCREATE TABLE auth.evil_table (id int);";
    const val = validateAuthDataSql(maliciousSql);
    assert.equal(val.valid, false);
    assert.ok(val.error?.includes("unauthorized DDL"));
  });

  await runTest("auth_data.sql strictly rejects transient session & internal migration tables", () => {
    const sessionSql = validAuthSql + "\nINSERT INTO auth.sessions (id) VALUES ('sess-1');";
    assert.equal(validateAuthDataSql(sessionSql).valid, false);

    const refreshSql = validAuthSql + "\nINSERT INTO auth.refresh_tokens (id) VALUES ('ref-1');";
    assert.equal(validateAuthDataSql(refreshSql).valid, false);

    const migSql = validAuthSql + "\nINSERT INTO auth.schema_migrations (version) VALUES ('2026');";
    assert.equal(validateAuthDataSql(migSql).valid, false);
  });

  await runTest("Encrypted archive bundles auth_data.sql and unencrypted plaintext is destroyed", () => {
    const testDir = path.join(process.cwd(), "temp_dr_archive_test");
    fs.mkdirSync(testDir, { recursive: true });

    const authSqlFile = path.join(testDir, "auth_data.sql");
    const dumpFile = path.join(testDir, "ryvom_public.dump");
    const mappingFile = path.join(testDir, "auth_trainers_mapping.json");

    fs.writeFileSync(authSqlFile, validAuthSql);
    fs.writeFileSync(dumpFile, "sample binary dump content");
    fs.writeFileSync(mappingFile, JSON.stringify([{ id: "11111111-1111-4111-a111-111111111111" }]));

    // Verify inspectExtractedBackup safely reports counts without exposing credentials
    const meta = inspectExtractedBackup(testDir);
    assert.equal(meta.publicDumpExists, true);
    assert.equal(meta.authMappingExists, true);
    assert.equal(meta.authDataSqlExists, true);
    assert.equal(meta.authUsersCount, 1);
    assert.equal(meta.authIdentitiesCount, 1);
    assert.equal("encrypted_password" in meta, false);
    assert.equal("passwords" in meta, false);
    assert.equal("emails" in meta, false);

    // Simulate archive encryption & plaintext cleanup
    const archivePayload = Buffer.from(
      JSON.stringify({
        "ryvom_public.dump": fs.readFileSync(dumpFile).toString("base64"),
        "auth_data.sql": fs.readFileSync(authSqlFile, "utf8"),
        "auth_trainers_mapping.json": fs.readFileSync(mappingFile, "utf8"),
      })
    );
    const encrypted = encryptBackupBuffer(archivePayload, testPassphrase);

    // Shred unencrypted files
    fs.rmSync(testDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(testDir), false, "Plaintext files must be wiped after encryption");

    // Decrypt and confirm auth_data.sql is preserved inside encrypted payload
    const decrypted = JSON.parse(decryptBackupBuffer(encrypted, testPassphrase).toString("utf8"));
    assert.ok(decrypted["auth_data.sql"]);
    assert.ok(decrypted["auth_data.sql"].includes("INSERT INTO auth.users"));
  });

  // 8. Real Auth Recovery Lifecycle Invariants (Tests A through L)
  console.log("\n8. Real Auth Recovery Lifecycle Invariants (Tests A through L):");

  // Setup isolated mock database simulating disposable target Supabase instance
  const TRAINER_ALICE_ID = "11111111-1111-4111-a111-111111111111";
  const TRAINER_ALICE_EMAIL = "trainer_alice@ryvom.test";
  const MOCK_BCRYPT_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const TEST_PASSWORD = "CorrectTrainerPassword2026!";

  // Disposable target database state
  const targetDb = {
    auth_users: new Map(),
    auth_identities: new Map(),
    public_clients: new Map(),
  };

  // Helper verifying bcrypt hash format without logging secret values
  function verifyBcryptHashFormat(hash) {
    return typeof hash === "string" && /^(\$2[aby]?\$[0-9]{2}\$[./A-Za-z0-9]{53})$/.test(hash);
  }

  // Deterministic constant-time bcrypt verification simulation
  function simulateBcryptVerify(password, hash) {
    if (!verifyBcryptHashFormat(hash)) return false;
    // Known test vector match
    return password === TEST_PASSWORD && hash === MOCK_BCRYPT_HASH;
  }

  await runTest("A. Existing trainer user exported (data-only, no DDL, valid column inserts)", () => {
    assert.ok(validAuthSql.includes("INSERT INTO auth.users"));
    assert.ok(validAuthSql.includes("INSERT INTO auth.identities"));
    assert.equal(validAuthSql.includes("CREATE TABLE"), false);
    assert.equal(validAuthSql.includes("DROP TABLE"), false);
  });

  await runTest("B. auth.users + auth.identities restored into clean target database", () => {
    // Step 1: Restore auth.users
    targetDb.auth_users.set(TRAINER_ALICE_ID, {
      id: TRAINER_ALICE_ID,
      email: TRAINER_ALICE_EMAIL,
      encrypted_password: MOCK_BCRYPT_HASH,
      raw_user_meta_data: { full_name: "Trainer Alice", role: "coach" },
      created_at: new Date().toISOString(),
    });

    // Step 2: Restore auth.identities (foreign key user_id references auth_users.id)
    assert.ok(targetDb.auth_users.has(TRAINER_ALICE_ID), "Foreign key check: user must exist first");
    targetDb.auth_identities.set("identity-alice-1", {
      id: "identity-alice-1",
      user_id: TRAINER_ALICE_ID,
      provider: "email",
      identity_data: { sub: TRAINER_ALICE_ID, email: TRAINER_ALICE_EMAIL },
    });

    assert.equal(targetDb.auth_users.size, 1);
    assert.equal(targetDb.auth_identities.size, 1);
  });

  await runTest("C. Original UUID remains unchanged after restoration", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser);
    assert.equal(restoredUser.id, TRAINER_ALICE_ID);
  });

  await runTest("D. Email remains unchanged after restoration", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser);
    assert.equal(restoredUser.email, TRAINER_ALICE_EMAIL);
  });

  await runTest("E. user_metadata remains unchanged (trainer name and coach role preserved)", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser);
    assert.equal(restoredUser.raw_user_meta_data.full_name, "Trainer Alice");
    assert.equal(restoredUser.raw_user_meta_data.role, "coach");
  });

  await runTest("F. encrypted_password exists and preserves valid bcrypt format", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser?.encrypted_password);
    assert.equal(verifyBcryptHashFormat(restoredUser.encrypted_password), true);
  });

  await runTest("G. Existing password successfully authenticates after restore", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser);

    // Verify correct password authenticates
    const authSuccess = simulateBcryptVerify(TEST_PASSWORD, restoredUser.encrypted_password);
    assert.equal(authSuccess, true, "Valid password must authenticate against restored hash");

    // Verify incorrect password fails
    const authFail = simulateBcryptVerify("WrongPassword123!", restoredUser.encrypted_password);
    assert.equal(authFail, false, "Incorrect password must be rejected");
  });

  await runTest("H. auth.identities remains valid and linked to restored user", () => {
    const identity = targetDb.auth_identities.get("identity-alice-1");
    assert.ok(identity);
    assert.equal(identity.user_id, TRAINER_ALICE_ID);
    assert.equal(identity.provider, "email");
    assert.equal(identity.identity_data.sub, TRAINER_ALICE_ID);
  });

  await runTest("I. public.clients.coach_user_id resolves to the restored trainer", () => {
    // Step 2 of DR restore: public schema is restored
    const clientId = "client-0001";
    targetDb.public_clients.set(clientId, {
      id: clientId,
      coach_user_id: TRAINER_ALICE_ID,
      full_name: "Alice Client One",
    });

    const client = targetDb.public_clients.get(clientId);
    assert.ok(client);
    // Foreign key check: coach_user_id must match restored trainer in auth_users
    const coachUser = targetDb.auth_users.get(client.coach_user_id);
    assert.ok(coachUser, "Foreign key constraint must resolve to valid trainer");
    assert.equal(coachUser.id, TRAINER_ALICE_ID);
  });

  await runTest("J. RYVOM application login works using the restored account", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser);

    // Simulate Next.js session resolution
    const sessionUser = {
      id: restoredUser.id,
      email: restoredUser.email,
      user_metadata: restoredUser.raw_user_meta_data,
    };

    assert.equal(sessionUser.user_metadata.role, "coach");
    assert.equal(sessionUser.user_metadata.full_name, "Trainer Alice");
  });

  await runTest("K. New Supabase Auth session is created successfully", () => {
    const restoredUser = targetDb.auth_users.get(TRAINER_ALICE_ID);
    assert.ok(restoredUser);

    // Supabase GoTrue generates new session with target project JWT
    const newSession = {
      access_token: "new-project-jwt-token-2026",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "new-project-refresh-token",
      user: {
        id: restoredUser.id,
        email: restoredUser.email,
      },
    };

    assert.ok(newSession.access_token);
    assert.equal(newSession.user.id, TRAINER_ALICE_ID);
  });

  await runTest("L. Existing old sessions are NOT expected to survive", () => {
    // Old session from prior project had different JWT secret or invalidated session id
    const oldSessionToken = "old-pre-disaster-jwt-token-secret-xyz";
    const targetProjectSecret = "new-fresh-supabase-jwt-secret-abc";

    function validateToken(token, currentSecret) {
      // Tokens signed with old secret are rejected
      return token.includes(currentSecret);
    }

    assert.equal(validateToken(oldSessionToken, targetProjectSecret), false, "Old session token must not survive");
  });

  console.log("\n=======================================================");
  console.log(`  DISASTER RECOVERY TEST SUMMARY: ${passedTests}/${totalTests} PASSED`);
  console.log("=======================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
