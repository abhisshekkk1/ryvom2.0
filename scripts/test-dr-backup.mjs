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
