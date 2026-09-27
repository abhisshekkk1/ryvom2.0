import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const OPENSSL_MAGIC = Buffer.from("Salted__");
const PBKDF2_ITERATIONS = 100000;
const DIGEST = "sha256";
const KEY_LEN = 32; // 256 bits
const IV_LEN = 16;  // 128 bits

/**
 * Encrypt a buffer using AES-256-CBC with PBKDF2 and random salt,
 * exactly matching `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000`.
 */
export function encryptBackupBuffer(plainBuffer, passphrase) {
  if (!passphrase || typeof passphrase !== "string" || passphrase.length < 16) {
    throw new Error("Passphrase must be a strong string of at least 16 characters.");
  }

  const salt = crypto.randomBytes(8);
  const derived = crypto.pbkdf2Sync(
    Buffer.from(passphrase, "utf8"),
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN + IV_LEN,
    DIGEST
  );

  const key = derived.subarray(0, KEY_LEN);
  const iv = derived.subarray(KEY_LEN, KEY_LEN + IV_LEN);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);

  return Buffer.concat([OPENSSL_MAGIC, salt, encrypted]);
}

/**
 * Decrypt a buffer encrypted with `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000`.
 */
export function decryptBackupBuffer(encryptedBuffer, passphrase) {
  if (!passphrase) {
    throw new Error("Passphrase is required for decryption.");
  }
  if (encryptedBuffer.length < 16) {
    throw new Error("Invalid encrypted buffer: too short.");
  }

  const magic = encryptedBuffer.subarray(0, 8);
  if (!magic.equals(OPENSSL_MAGIC)) {
    throw new Error("Invalid encrypted backup header: missing OpenSSL 'Salted__' magic prefix.");
  }

  const salt = encryptedBuffer.subarray(8, 16);
  const ciphertext = encryptedBuffer.subarray(16);

  const derived = crypto.pbkdf2Sync(
    Buffer.from(passphrase, "utf8"),
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN + IV_LEN,
    DIGEST
  );

  const key = derived.subarray(0, KEY_LEN);
  const iv = derived.subarray(KEY_LEN, KEY_LEN + IV_LEN);

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Compute SHA-256 hex checksum of a buffer or file.
 */
export function computeSha256(dataOrPath) {
  const hash = crypto.createHash("sha256");
  if (Buffer.isBuffer(dataOrPath) || typeof dataOrPath === "string" && !fs.existsSync(dataOrPath)) {
    hash.update(dataOrPath);
  } else {
    hash.update(fs.readFileSync(dataOrPath));
  }
  return hash.digest("hex");
}

/**
 * Validates manifest structure and properties.
 */
export function validateManifest(manifest, expectedChecksum = null) {
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, error: "Manifest must be a valid JSON object." };
  }

  const requiredFields = [
    "version",
    "timestamp",
    "backup_filename",
    "backup_size_bytes",
    "sha256_checksum",
    "encryption",
    "retention_days",
    "verification_status",
  ];

  for (const field of requiredFields) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === "") {
      return { valid: false, error: `Manifest missing required field: ${field}` };
    }
  }

  if (expectedChecksum && manifest.sha256_checksum !== expectedChecksum) {
    return {
      valid: false,
      error: `Checksum mismatch! Manifest has ${manifest.sha256_checksum}, but target file has ${expectedChecksum}`,
    };
  }

  return { valid: true };
}

/**
 * Check if backup size exceeds threshold in MB.
 */
export function checkBackupSizeThreshold(sizeBytes, maxMb = 400) {
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb > maxMb) {
    return {
      exceeded: true,
      sizeMb: Number(sizeMb.toFixed(2)),
      maxMb,
      error: `Backup size (${sizeMb.toFixed(2)} MB) exceeds GitHub Free safety threshold of ${maxMb} MB.`,
    };
  }
  return {
    exceeded: false,
    sizeMb: Number(sizeMb.toFixed(2)),
    maxMb,
  };
}

/**
 * Validates the safety and structure of auth_data.sql.
 * Ensures:
 * - Contains data-only inserts for auth.users and auth.identities
 * - Does NOT contain DDL (CREATE TABLE, DROP, ALTER)
 * - Does NOT contain transient session or migration tables (auth.sessions, auth.refresh_tokens, auth.schema_migrations)
 */
export function validateAuthDataSql(sqlContent) {
  if (!sqlContent || typeof sqlContent !== "string") {
    return { valid: false, error: "SQL content is empty or invalid." };
  }

  // Safety check 1: Reject unauthorized DDL
  const ddlPattern = /\b(CREATE\s+(TABLE|SCHEMA|FUNCTION|VIEW|TRIGGER)|DROP\s+(TABLE|SCHEMA)|ALTER\s+(TABLE|SCHEMA))\b/i;
  if (ddlPattern.test(sqlContent)) {
    return { valid: false, error: "Security violation: auth_data.sql contains unauthorized DDL statements!" };
  }

  // Safety check 2: Reject transient session or internal migration tables
  const transientPattern = /\b(auth\.sessions|auth\.refresh_tokens|auth\.schema_migrations|auth\.audit_log_entries|auth\.flow_state|auth\.mfa_challenges)\b/i;
  if (transientPattern.test(sqlContent)) {
    return { valid: false, error: "Security violation: auth_data.sql contains transient session or internal migration tables!" };
  }

  // Count user and identity records
  const userMatches = sqlContent.match(/INSERT\s+INTO\s+auth\.users\b/gi) || [];
  const identityMatches = sqlContent.match(/INSERT\s+INTO\s+auth\.identities\b/gi) || [];

  return {
    valid: true,
    usersCount: userMatches.length,
    identitiesCount: identityMatches.length,
  };
}

/**
 * Inspects extracted backup directory and returns safe metadata ONLY.
 * Never returns emails, password hashes, identity payloads, tokens, or secrets.
 */
export function inspectExtractedBackup(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const dumpPath = path.join(dirPath, "ryvom_public.dump");
  const authMappingPath = path.join(dirPath, "auth_trainers_mapping.json");
  const authDataSqlPath = path.join(dirPath, "auth_data.sql");

  const metadata = {
    publicDumpExists: fs.existsSync(dumpPath),
    publicDumpSizeBytes: fs.existsSync(dumpPath) ? fs.statSync(dumpPath).size : 0,
    authMappingExists: fs.existsSync(authMappingPath),
    authMappingCount: 0,
    authDataSqlExists: fs.existsSync(authDataSqlPath),
    authUsersCount: 0,
    authIdentitiesCount: 0,
    authDataValid: false,
  };

  if (metadata.authMappingExists) {
    try {
      const parsed = JSON.parse(fs.readFileSync(authMappingPath, "utf8"));
      metadata.authMappingCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      metadata.authMappingCount = 0;
    }
  }

  if (metadata.authDataSqlExists) {
    const content = fs.readFileSync(authDataSqlPath, "utf8");
    const val = validateAuthDataSql(content);
    metadata.authDataValid = val.valid;
    metadata.authUsersCount = val.usersCount;
    metadata.authIdentitiesCount = val.identitiesCount;
  }

  return metadata;
}

/**
 * Safeguard for restoration. Never restores without explicit RYVOM_ALLOW_RESTORE=true.
 * Also checks that target database does not match the production database.
 */
export function checkRestorePermission(targetDbUrl = null) {
  if (process.env.RYVOM_ALLOW_RESTORE !== "true") {
    throw new Error(
      "SAFETY VIOLATION: Database restore is disabled by default.\n" +
      "To execute a restore, you MUST explicitly set the environment variable:\n" +
      "  RYVOM_ALLOW_RESTORE=true\n" +
      "Refusing to execute destructive action."
    );
  }

  // Safety check: Prevent targeting production
  const prodUrl = process.env.RYVOM_DB_URL;
  if (targetDbUrl && prodUrl && targetDbUrl.trim() === prodUrl.trim()) {
    throw new Error(
      "FATAL SAFETY VIOLATION: Target database URL exactly matches production database (RYVOM_DB_URL).\n" +
      "Restoration over the active production database is strictly prohibited!"
    );
  }

  return true;
}

// CLI handler if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [,, command, ...args] = process.argv;

  try {
    switch (command) {
      case "verify-manifest": {
        const [manifestPath, filePath] = args;
        if (!manifestPath) {
          console.error("Usage: node scripts/dr-backup-tools.mjs verify-manifest <manifest.json> [backup-file]");
          process.exit(1);
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const checksum = filePath ? computeSha256(filePath) : null;
        const result = validateManifest(manifest, checksum);
        if (!result.valid) {
          console.error(`Verification FAILED: ${result.error}`);
          process.exit(1);
        }
        console.log(`✓ Manifest valid. Status: ${manifest.verification_status}. Checksum: ${manifest.sha256_checksum}`);
        break;
      }

      case "decrypt": {
        const [encFilePath, outFilePath] = args;
        const key = process.env.RYVOM_BACKUP_ENCRYPTION_KEY;
        if (!encFilePath || !outFilePath) {
          console.error("Usage: node scripts/dr-backup-tools.mjs decrypt <encrypted-file> <output-file>");
          process.exit(1);
        }
        if (!key) {
          console.error("ERROR: RYVOM_BACKUP_ENCRYPTION_KEY environment variable is required.");
          process.exit(1);
        }
        const encrypted = fs.readFileSync(encFilePath);
        const decrypted = decryptBackupBuffer(encrypted, key);
        fs.writeFileSync(outFilePath, decrypted);
        console.log(`✓ Successfully decrypted to ${outFilePath} (${decrypted.length} bytes)`);
        break;
      }

      case "check-size": {
        const [filePath, maxMbStr] = args;
        if (!filePath) {
          console.error("Usage: node scripts/dr-backup-tools.mjs check-size <backup-file> [max-mb]");
          process.exit(1);
        }
        const maxMb = maxMbStr ? Number(maxMbStr) : 400;
        const stat = fs.statSync(filePath);
        const res = checkBackupSizeThreshold(stat.size, maxMb);
        if (res.exceeded) {
          console.error(`ERROR: ${res.error}`);
          process.exit(1);
        }
        console.log(`✓ Backup size OK: ${res.sizeMb} MB (threshold: ${maxMb} MB)`);
        break;
      }

      case "inspect": {
        const [dirPath] = args;
        if (!dirPath) {
          console.error("Usage: node scripts/dr-backup-tools.mjs inspect <extracted-backup-dir>");
          process.exit(1);
        }
        const meta = inspectExtractedBackup(dirPath);
        console.log("==> Extracted Backup Safe Inspection Summary:");
        console.log(`  - Public PostgreSQL Dump Exists: ${meta.publicDumpExists} (${meta.publicDumpSizeBytes} bytes)`);
        console.log(`  - Auth Trainers Mapping Exists: ${meta.authMappingExists} (${meta.authMappingCount} trainer identities)`);
        console.log(`  - Auth Data SQL Exists: ${meta.authDataSqlExists} (Valid: ${meta.authDataValid})`);
        console.log(`  - Auth Users Count: ${meta.authUsersCount}`);
        console.log(`  - Auth Identities Count: ${meta.authIdentitiesCount}`);
        console.log("✓ Safe inspection complete (zero sensitive credentials exposed).");
        break;
      }

      case "restore-check": {
        const [targetDbUrl] = args;
        checkRestorePermission(targetDbUrl);
        console.log("✓ RYVOM_ALLOW_RESTORE=true confirmed. Target database safety check passed.");
        break;
      }

      default:
        console.log("RYVOM Disaster Recovery Backup CLI Tools");
        console.log("Available commands: verify-manifest, decrypt, inspect, check-size, restore-check");
        break;
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}
