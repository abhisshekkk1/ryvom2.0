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

/**
 * Known production references to strictly block in restoration guardrails.
 */
export const KNOWN_PRODUCTION_HOSTS = [
  "kfhwmkmxxdzgeeyuxizx.supabase.co",
  "kfhwmkmxxdzgeeyuxizx",
];

/**
 * Generate photo manifest adhering strictly to Phase 2B DR specifications.
 * Ensures zero secret exposure (no signed URLs, tokens, keys, passwords).
 */
export function generatePhotoManifest({
  bucket = "client-photos",
  objects = [],
  timestamp = null,
} = {}) {
  if (!Array.isArray(objects)) {
    throw new Error("Objects must be an array.");
  }

  const sanitizedObjects = objects.map((obj, idx) => {
    if (!obj || typeof obj !== "object") {
      throw new Error(`Object at index ${idx} must be a valid object.`);
    }
    const rawPath = String(obj.path || "").trim();
    if (!rawPath) {
      throw new Error(`Object at index ${idx} is missing a path.`);
    }
    // Security check: reject signed URLs, query parameters, absolute URLs
    if (
      rawPath.includes("?") ||
      rawPath.includes("&") ||
      rawPath.includes("token=") ||
      rawPath.startsWith("http://") ||
      rawPath.startsWith("https://")
    ) {
      throw new Error(
        `Security violation: Object path at index ${idx} contains URL parameters or secrets: "${rawPath}"`
      );
    }
    // Path traversal check
    if (rawPath.includes("..") || rawPath.startsWith("/")) {
      throw new Error(`Security violation: Invalid object path: "${rawPath}"`);
    }

    const size = Number(obj.size);
    if (isNaN(size) || size < 0) {
      throw new Error(`Invalid size for object "${rawPath}": ${obj.size}`);
    }

    const sha256 = String(obj.sha256 || "").toLowerCase().trim();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`Invalid SHA-256 hash for object "${rawPath}": "${obj.sha256}"`);
    }

    return {
      path: rawPath,
      size,
      contentType: String(obj.contentType || "application/octet-stream").trim().toLowerCase(),
      sha256,
      created_at: obj.created_at || null,
    };
  });

  const totalBytes = sanitizedObjects.reduce((acc, o) => acc + o.size, 0);

  return {
    version: "1.0",
    bucket,
    backup_timestamp: timestamp || new Date().toISOString(),
    total_objects: sanitizedObjects.length,
    total_bytes: totalBytes,
    objects: sanitizedObjects,
  };
}

/**
 * Validates photo manifest structure, checksums, and secret-free invariant.
 */
export function validatePhotoManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, error: "Manifest must be a non-null object." };
  }
  if (manifest.version !== "1.0") {
    return { valid: false, error: `Unsupported manifest version: ${manifest.version}` };
  }
  if (manifest.bucket !== "client-photos") {
    return { valid: false, error: `Invalid bucket in manifest: ${manifest.bucket}` };
  }
  if (!manifest.backup_timestamp) {
    return { valid: false, error: "Missing backup_timestamp." };
  }
  if (!Array.isArray(manifest.objects)) {
    return { valid: false, error: "Manifest objects must be an array." };
  }
  if (manifest.total_objects !== manifest.objects.length) {
    return {
      valid: false,
      error: `Manifest total_objects (${manifest.total_objects}) does not match objects length (${manifest.objects.length}).`,
    };
  }

  let calculatedBytes = 0;
  for (let i = 0; i < manifest.objects.length; i++) {
    const o = manifest.objects[i];
    if (!o.path || typeof o.path !== "string") {
      return { valid: false, error: `Object at index ${i} is missing valid path.` };
    }
    if (
      o.path.includes("?") ||
      o.path.includes("token=") ||
      o.path.startsWith("http://") ||
      o.path.startsWith("https://")
    ) {
      return { valid: false, error: `Security violation: Object path contains URL parameters/secrets: ${o.path}` };
    }
    if (typeof o.size !== "number" || o.size < 0) {
      return { valid: false, error: `Object at index ${i} has invalid size: ${o.size}` };
    }
    calculatedBytes += o.size;
    if (!o.sha256 || !/^[a-f0-9]{64}$/i.test(o.sha256)) {
      return { valid: false, error: `Object at index ${i} has invalid SHA-256 hash.` };
    }
  }

  if (manifest.total_bytes !== calculatedBytes) {
    return {
      valid: false,
      error: `Manifest total_bytes (${manifest.total_bytes}) does not match calculated byte sum (${calculatedBytes}).`,
    };
  }

  return {
    valid: true,
    totalObjects: manifest.total_objects,
    totalBytes: manifest.total_bytes,
  };
}

/**
 * Verifies photo integrity by validating byte counts and SHA-256 hashes against manifest.
 */
export function verifyPhotoIntegrity(manifest, getObjectBufferFn) {
  const validation = validatePhotoManifest(manifest);
  if (!validation.valid) {
    return { success: false, error: `Invalid manifest: ${validation.error}` };
  }

  let verifiedCount = 0;
  let verifiedBytes = 0;

  for (const obj of manifest.objects) {
    const buffer = getObjectBufferFn(obj.path);
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return { success: false, error: `Missing or invalid buffer for object: ${obj.path}` };
    }
    if (buffer.length !== obj.size) {
      return {
        success: false,
        error: `Byte size mismatch for "${obj.path}": expected ${obj.size}, got ${buffer.length}`,
      };
    }
    const computedHash = computeSha256(buffer);
    if (computedHash.toLowerCase() !== obj.sha256.toLowerCase()) {
      return {
        success: false,
        error: `SHA-256 hash mismatch for "${obj.path}": expected ${obj.sha256}, got ${computedHash}`,
      };
    }
    verifiedCount++;
    verifiedBytes += buffer.length;
  }

  return {
    success: true,
    verifiedCount,
    verifiedBytes,
  };
}

/**
 * Safeguard for storage restoration.
 * Strictly blocks production target, requires explicit RYVOM_ALLOW_STORAGE_RESTORE=true.
 */
export function checkStorageRestorePermission(targetUrl = null, targetProjectRef = null) {
  if (process.env.RYVOM_ALLOW_STORAGE_RESTORE !== "true") {
    throw new Error(
      "SAFETY VIOLATION: Storage photo restore is disabled by default.\n" +
      "To execute a restore, you MUST explicitly set the environment variable:\n" +
      "  RYVOM_ALLOW_STORAGE_RESTORE=true\n" +
      "Refusing to execute destructive or restorative storage action."
    );
  }

  // Safety check: Prevent targeting production URL or known production hosts
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kfhwmkmxxdzgeeyuxizx.supabase.co";
  const checks = [targetUrl, targetProjectRef].filter(Boolean);

  for (const val of checks) {
    const trimmed = String(val).toLowerCase().trim();
    if (trimmed === prodUrl.toLowerCase().trim()) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Target Storage URL matches production (${prodUrl}).\n` +
        "Restoration over the active production Storage bucket is strictly prohibited!"
      );
    }
    for (const prodHost of KNOWN_PRODUCTION_HOSTS) {
      if (trimmed.includes(prodHost.toLowerCase())) {
        throw new Error(
          `FATAL SAFETY VIOLATION: Target Storage URL contains production host/ref "${prodHost}".\n` +
          "Restoration over the active production Storage bucket is strictly prohibited!"
        );
      }
    }
  }

  return true;
}

/**
 * Safe inspection of extracted photo backup directory.
 * Reports metadata ONLY (object count, total bytes, largest file, MIME distribution).
 * NEVER outputs raw image bytes, signed URLs, or tokens.
 */
export function inspectPhotoBackup(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const manifestPath = path.join(dirPath, "manifest.json");
  const bucketConfigPath = path.join(dirPath, "bucket_config.json");
  const objectsDir = path.join(dirPath, "objects");

  const meta = {
    manifestExists: fs.existsSync(manifestPath),
    manifestValid: false,
    bucketConfigExists: fs.existsSync(bucketConfigPath),
    bucketConfigValid: false,
    objectsDirExists: fs.existsSync(objectsDir),
    objectCount: 0,
    totalBytes: 0,
    largestObject: null,
    mimeDistribution: {},
    allFilesPresent: false,
  };

  if (meta.bucketConfigExists) {
    try {
      const cfg = JSON.parse(fs.readFileSync(bucketConfigPath, "utf8"));
      meta.bucketConfigValid = cfg.id === "client-photos" && cfg.public === false;
    } catch {
      meta.bucketConfigValid = false;
    }
  }

  if (meta.manifestExists) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const val = validatePhotoManifest(manifest);
      meta.manifestValid = val.valid;
      if (val.valid) {
        meta.objectCount = manifest.total_objects;
        meta.totalBytes = manifest.total_bytes;

        let maxObj = null;
        const mimes = {};
        let allPresent = true;

        for (const obj of manifest.objects) {
          if (!maxObj || obj.size > maxObj.size) {
            maxObj = { path: obj.path, size: obj.size };
          }
          mimes[obj.contentType] = (mimes[obj.contentType] || 0) + 1;

          if (meta.objectsDirExists) {
            const filePath = path.join(objectsDir, obj.path);
            if (!fs.existsSync(filePath)) {
              allPresent = false;
            }
          } else {
            allPresent = false;
          }
        }

        meta.largestObject = maxObj;
        meta.mimeDistribution = mimes;
        meta.allFilesPresent = allPresent;
      }
    } catch {
      meta.manifestValid = false;
    }
  }

  return meta;
}

/**
 * Restores storage photos into a fresh target Supabase project using supported Storage API.
 * Validates integrity, hashes, and signed URLs post-restoration.
 */
export async function restoreStoragePhotos({
  extractedDir,
  targetUrl,
  targetServiceKey,
  forceClean = false,
  fetchFn = fetch,
}) {
  checkStorageRestorePermission(targetUrl);

  if (!extractedDir || !fs.existsSync(extractedDir)) {
    throw new Error(`Extracted photos directory not found: ${extractedDir}`);
  }
  if (!targetUrl) {
    throw new Error("Target Supabase URL is required.");
  }
  if (!targetServiceKey) {
    throw new Error("Target Supabase Service Role Key is required for storage restoration.");
  }

  const manifestPath = path.join(extractedDir, "manifest.json");
  const bucketConfigPath = path.join(extractedDir, "bucket_config.json");
  const objectsDir = path.join(extractedDir, "objects");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${extractedDir}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const validation = validatePhotoManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid photo manifest: ${validation.error}`);
  }

  const headers = {
    apikey: targetServiceKey,
    Authorization: `Bearer ${targetServiceKey}`,
  };

  // 1. Check or Create Target Bucket as PRIVATE
  const baseUrl = targetUrl.replace(/\/+$/, "");
  const bucketUrl = `${baseUrl}/storage/v1/bucket`;
  const bucketRes = await fetchFn(`${bucketUrl}/client-photos`, { headers });
  
  if (bucketRes.status === 404 || bucketRes.status === 400) {
    let bucketConfig = {
      id: "client-photos",
      name: "client-photos",
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/jpg",
      ],
    };
    if (fs.existsSync(bucketConfigPath)) {
      try {
        bucketConfig = JSON.parse(fs.readFileSync(bucketConfigPath, "utf8"));
      } catch {}
    }
    const createRes = await fetchFn(bucketUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(bucketConfig),
    });
    if (!createRes.ok && createRes.status !== 409) {
      const errText = await createRes.text();
      throw new Error(`Failed to create target client-photos bucket: ${errText}`);
    }
  }

  // 2. Check Target Bucket Emptiness (Safety Check)
  if (!forceClean && process.env.RYVOM_FORCE_STORAGE_RESTORE !== "true") {
    const listRes = await fetchFn(`${baseUrl}/storage/v1/object/list/client-photos`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 5 }),
    });
    if (listRes.ok) {
      const existingObjects = await listRes.json();
      if (Array.isArray(existingObjects) && existingObjects.length > 0) {
        throw new Error(
          `SAFETY VIOLATION: Target bucket "client-photos" is not empty (found ${existingObjects.length}+ objects).\n` +
          "Refusing to restore over existing files without explicit force flag (--force-clean-target or RYVOM_FORCE_STORAGE_RESTORE=true)."
        );
      }
    }
  }

  // 3. Upload every object from manifest
  let restoredCount = 0;
  let restoredBytes = 0;

  for (const obj of manifest.objects) {
    const filePath = path.join(objectsDir, obj.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object file missing on disk: ${filePath}`);
    }
    const fileBuffer = fs.readFileSync(filePath);
    if (fileBuffer.length !== obj.size) {
      throw new Error(`Size mismatch on disk for ${obj.path}`);
    }
    const diskHash = computeSha256(fileBuffer);
    if (diskHash.toLowerCase() !== obj.sha256.toLowerCase()) {
      throw new Error(`SHA-256 mismatch before upload for ${obj.path}`);
    }

    const uploadUrl = `${baseUrl}/storage/v1/object/client-photos/${obj.path}`;
    const uploadRes = await fetchFn(uploadUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": obj.contentType || "application/octet-stream",
        "x-upsert": "true",
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload object "${obj.path}": ${errText}`);
    }

    restoredCount++;
    restoredBytes += fileBuffer.length;
  }

  // 4. Post-Restoration Integrity Verification (Re-download & verify SHA-256)
  for (const obj of manifest.objects) {
    const downloadUrl = `${baseUrl}/storage/v1/object/authenticated/client-photos/${obj.path}`;
    const downloadRes = await fetchFn(downloadUrl, { headers });
    if (!downloadRes.ok) {
      throw new Error(`Integrity verification failed: Could not download restored object "${obj.path}"`);
    }
    const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
    const downloadedHash = computeSha256(downloadedBuf);
    if (downloadedHash.toLowerCase() !== obj.sha256.toLowerCase()) {
      throw new Error(
        `POST-RESTORE INTEGRITY FAILURE: SHA-256 mismatch for "${obj.path}". Expected ${obj.sha256}, got ${downloadedHash}`
      );
    }
  }

  // 5. Signed URL Verification for representative image
  let signedUrlVerified = false;
  if (manifest.objects.length > 0) {
    const sampleObj = manifest.objects[0];
    const signEndpoint = `${baseUrl}/storage/v1/object/sign/client-photos/${sampleObj.path}`;
    const signRes = await fetchFn(signEndpoint, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    if (signRes.ok) {
      const signJson = await signRes.json();
      const signedUrl = signJson.signedUrl || signJson.url;
      if (signedUrl) {
        const fullSignedUrl = signedUrl.startsWith("http")
          ? signedUrl
          : `${baseUrl}${signedUrl.startsWith("/") ? "" : "/"}${signedUrl}`;
        const fetchImgRes = await fetchFn(fullSignedUrl);
        if (fetchImgRes.ok) {
          const imgBuf = Buffer.from(await fetchImgRes.arrayBuffer());
          const imgHash = computeSha256(imgBuf);
          if (imgHash.toLowerCase() === sampleObj.sha256.toLowerCase()) {
            signedUrlVerified = true;
          }
        }
      }
    }
  }

  return {
    success: true,
    restoredCount,
    restoredBytes,
    signedUrlVerified,
  };
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

      case "inspect-photos": {
        const [dirPath] = args;
        if (!dirPath) {
          console.error("Usage: node scripts/dr-backup-tools.mjs inspect-photos <extracted-photos-dir>");
          process.exit(1);
        }
        const meta = inspectPhotoBackup(dirPath);
        console.log("==> Extracted Photo Backup Safe Inspection Summary:");
        console.log(`  - Manifest Exists: ${meta.manifestExists} (Valid: ${meta.manifestValid})`);
        console.log(`  - Bucket Config Exists: ${meta.bucketConfigExists} (Valid: ${meta.bucketConfigValid})`);
        console.log(`  - Objects Directory Exists: ${meta.objectsDirExists} (All files present: ${meta.allFilesPresent})`);
        console.log(`  - Total Objects: ${meta.objectCount}`);
        console.log(`  - Total Bytes: ${meta.totalBytes} bytes (${(meta.totalBytes / 1048576).toFixed(2)} MB)`);
        if (meta.largestObject) {
          console.log(`  - Largest Object: ${meta.largestObject.path} (${(meta.largestObject.size / 1024).toFixed(1)} KB)`);
        }
        console.log("  - MIME Distribution:");
        for (const [mime, count] of Object.entries(meta.mimeDistribution)) {
          console.log(`      * ${mime}: ${count}`);
        }
        console.log("✓ Safe photo inspection complete (zero private image payloads exposed).");
        break;
      }

      case "verify-photos": {
        const [manifestPath, objectsDir] = args;
        if (!manifestPath || !objectsDir) {
          console.error("Usage: node scripts/dr-backup-tools.mjs verify-photos <manifest.json> <objects-dir>");
          process.exit(1);
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const result = verifyPhotoIntegrity(manifest, (relPath) => {
          const full = path.join(objectsDir, relPath);
          return fs.existsSync(full) ? fs.readFileSync(full) : null;
        });
        if (!result.success) {
          console.error(`Verification FAILED: ${result.error}`);
          process.exit(1);
        }
        console.log(`✓ Photo integrity verified: ${result.verifiedCount} objects, ${result.verifiedBytes} bytes matching all SHA-256 hashes.`);
        break;
      }

      case "restore-check": {
        const [targetDbUrl] = args;
        checkRestorePermission(targetDbUrl);
        console.log("✓ RYVOM_ALLOW_RESTORE=true confirmed. Target database safety check passed.");
        break;
      }

      case "storage-restore-check": {
        const [targetUrl, targetRef] = args;
        checkStorageRestorePermission(targetUrl, targetRef);
        console.log("✓ RYVOM_ALLOW_STORAGE_RESTORE=true confirmed. Target storage safety check passed.");
        break;
      }

      case "restore-photos": {
        const [extractedDir, targetUrl, targetKey] = args;
        if (!extractedDir || !targetUrl || !targetKey) {
          console.error("Usage: node scripts/dr-backup-tools.mjs restore-photos <extracted-photos-dir> <target-supabase-url> <target-service-key>");
          process.exit(1);
        }
        const force = process.env.RYVOM_FORCE_STORAGE_RESTORE === "true" || args.includes("--force-clean-target");
        const res = await restoreStoragePhotos({
          extractedDir,
          targetUrl,
          targetServiceKey: targetKey,
          forceClean: force,
        });
        console.log(`✓ Restored ${res.restoredCount} objects (${res.restoredBytes} bytes). Integrity verified.`);
        if (res.signedUrlVerified) {
          console.log("✓ Representative signed photo URL verified successfully.");
        }
        break;
      }

      default:
        console.log("RYVOM Disaster Recovery Backup CLI Tools");
        console.log("Available commands: verify-manifest, decrypt, inspect, inspect-photos, verify-photos, check-size, restore-check, storage-restore-check, restore-photos");
        break;
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}
