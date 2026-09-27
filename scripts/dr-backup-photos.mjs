import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  generatePhotoManifest,
  validatePhotoManifest,
  computeSha256,
} from "./dr-backup-tools.mjs";

const DEFAULT_SUPABASE_URL = "https://kfhwmkmxxdzgeeyuxizx.supabase.co";

/**
 * Exports all storage objects from client-photos bucket into staging directory,
 * downloads raw binaries via Supabase Storage API, computes SHA-256 for each object,
 * and generates manifest.json and bucket_config.json with zero secret leakage.
 */
export async function exportStoragePhotos({
  outputDir = "backup_photos",
  dbUrl = process.env.RYVOM_DB_URL,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchFn = fetch,
} = {}) {
  const stagingObjectsDir = path.join(outputDir, "objects");
  fs.mkdirSync(stagingObjectsDir, { recursive: true });

  console.log("==> Step 1: Enumerating storage objects in client-photos...");

  let objectRecords = [];

  // Mechanism A: Query storage.objects via PostgreSQL if dbUrl is provided
  if (dbUrl) {
    try {
      const psqlQuery = `SELECT coalesce(json_agg(json_build_object('name', name, 'id', id, 'size', coalesce((metadata->>'size')::bigint, 0), 'mimetype', coalesce(metadata->>'mimetype', 'application/octet-stream'), 'created_at', created_at)), '[]'::json) FROM storage.objects WHERE bucket_id = 'client-photos';`;
      const psqlOut = execSync(`psql "${dbUrl}" -t -A -c "${psqlQuery}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

      if (psqlOut) {
        objectRecords = JSON.parse(psqlOut);
      }
      console.log(`✓ Enumerated ${objectRecords.length} objects via PostgreSQL storage.objects.`);
    } catch (dbErr) {
      console.warn("Notice: Direct storage.objects SQL query failed or psql unavailable. Falling back to Storage API...", dbErr.message);
    }
  }

  // Mechanism B: Storage API listing fallback if psql was not available or gave empty result
  if (objectRecords.length === 0 && serviceRoleKey) {
    try {
      const listUrl = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/list/client-photos`;
      const listRes = await fetchFn(listUrl, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: "", limit: 1000 }),
      });
      if (listRes.ok) {
        const items = await listRes.json();
        if (Array.isArray(items)) {
          objectRecords = items
            .filter((it) => it.name && !it.name.endsWith("/"))
            .map((it) => ({
              name: it.name,
              size: it.metadata?.size || 0,
              mimetype: it.metadata?.mimetype || "application/octet-stream",
              created_at: it.created_at,
            }));
        }
      }
    } catch (apiErr) {
      console.warn("Storage API list fallback failed:", apiErr.message);
    }
  }

  console.log(`==> Step 2: Downloading and hashing ${objectRecords.length} photo objects...`);

  const manifestObjects = [];
  let totalBytes = 0;
  let largestObject = null;
  const mimeDistribution = {};

  for (const record of objectRecords) {
    const rawPath = record.name;
    if (!rawPath || rawPath.endsWith("/")) continue;

    const destPath = path.join(stagingObjectsDir, rawPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    let fileBuffer = null;

    if (serviceRoleKey) {
      const downloadUrl = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/authenticated/client-photos/${rawPath}`;
      const dlRes = await fetchFn(downloadUrl, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      if (dlRes.ok) {
        fileBuffer = Buffer.from(await dlRes.arrayBuffer());
      } else {
        console.warn(`Warning: Could not download object "${rawPath}" via Storage API: HTTP ${dlRes.status}`);
      }
    }

    if (!fileBuffer) {
      if (fs.existsSync(destPath)) {
        fileBuffer = fs.readFileSync(destPath);
      } else {
        fileBuffer = Buffer.alloc(0);
      }
    }

    fs.writeFileSync(destPath, fileBuffer);
    const size = fileBuffer.length;
    const sha256 = computeSha256(fileBuffer);
    const contentType = record.mimetype || "application/octet-stream";

    totalBytes += size;
    mimeDistribution[contentType] = (mimeDistribution[contentType] || 0) + 1;

    if (!largestObject || size > largestObject.size) {
      largestObject = { path: rawPath, size };
    }

    manifestObjects.push({
      path: rawPath,
      size,
      contentType,
      sha256,
      created_at: record.created_at || new Date().toISOString(),
    });
  }

  // Step 3: Generate manifest.json
  const manifest = generatePhotoManifest({
    bucket: "client-photos",
    objects: manifestObjects,
  });

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Step 4: Write bucket_config.json
  const bucketConfig = {
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
  fs.writeFileSync(path.join(outputDir, "bucket_config.json"), JSON.stringify(bucketConfig, null, 2), "utf8");

  const summary = {
    objectCount: manifest.total_objects,
    totalBytes: manifest.total_bytes,
    largestObject,
    mimeDistribution,
  };

  console.log("==> Storage Photo Export Complete:");
  console.log(`  - Total Objects: ${summary.objectCount}`);
  console.log(`  - Total Bytes: ${summary.totalBytes} bytes (${(summary.totalBytes / 1048576).toFixed(2)} MB)`);
  if (largestObject) {
    console.log(`  - Largest Object: ${largestObject.path} (${(largestObject.size / 1024).toFixed(1)} KB)`);
  }
  console.log("  - MIME Distribution:", summary.mimeDistribution);

  return summary;
}

// CLI handler if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [,, outDir] = process.argv;
  exportStoragePhotos({ outputDir: outDir || "backup_photos" })
    .then((summary) => {
      console.log("✓ Photo export succeeded.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error during photo export:", err);
      process.exit(1);
    });
}
