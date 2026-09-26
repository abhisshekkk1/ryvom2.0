# RYVOM Disaster Recovery Architecture (Phase 2A)

> **Important Notice:**
> Phase 2A implements an **automated, encrypted database backup system** leveraging free GitHub Actions infrastructure (₹0 cost).
> **PHASE 2A DOES NOT BACK UP SUPABASE STORAGE OBJECTS.** Client transformation photos stored in the `client-photos` bucket remain outside this phase. Storage backups will be implemented in a subsequent phase.

---

## 1. Overview & System Architecture

```text
Supabase PostgreSQL (Production)
              │
              ▼ (Daily at 02:00 UTC via GitHub Actions)
  PostgreSQL Custom Dump (-Fc, schema=public)
  + Safe Auth UUID Mapping (auth.users id, email, metadata)
              │
              ▼
    tar.gz compression
              │
              ▼
  AES-256-CBC Encryption (PBKDF2, 100k iterations)
              │
              ▼
  SHA-256 Checksum + Non-Sensitive manifest.json
              │
              ▼
  GitHub Actions Artifact (7-day rolling retention)
```

---

## 2. What Is Backed Up vs What Is Not Backed Up

### Protected in Phase 2A:
1. **Public Schema Tables (`public.*`)**:
   - `public.clients` (client profiles, status, `deleted_at`, `is_self`)
   - `public.check_ins` (weekly check-in submissions, biometric metrics, adherence)
   - `public.coach_reviews` (coach feedback and reviews)
   - `public.client_coach_notes` (private coach timeline notes)
   - `public.client_access` (portal access tokens and hashes)
   - `public.performance_metrics` (custom strength and physique metrics)
   - `public.performance_logs` (historical metric logs)
   - All legacy and existing reconciled tables (`workout_logs`, `password_reset_requests`, etc.)
2. **Schema & Logic**:
   - PostgreSQL table structures, primary keys, foreign keys, and indexes.
   - Row Level Security (RLS) policies.
   - Stored functions (e.g. `get_dashboard_checkins()`).
   - Sequences and data types.
3. **Trainer Identity & UUID Mapping**:
   - `auth_trainers_mapping.json`: Preserves `id` (UUID), `email`, `raw_user_meta_data` (trainer display name, role), and `created_at` from `auth.users`.

### NOT Protected in Phase 2A:
- ❌ **Supabase Storage Objects / Photos**: Files stored in the `client-photos` bucket (e.g., front, side, and back progress photos) are **NOT backed up** in Phase 2A.
- ❌ **Auth Passwords & Tokens**: User password hashes, refresh tokens, active session cookies, and multi-factor authentication (MFA) secrets in `auth.users` cannot be exported or naively restored due to Supabase Auth managed service architecture.
- ❌ **External Backup Providers**: No paid cloud providers (AWS S3, Google Cloud, Backblaze B2, Cloudflare) are used.

---

## 3. GitHub Free Infrastructure & Storage Caps

GitHub Free accounts for private repositories provide:
- **500 MB** total shared artifact storage.
- **2,000 Actions minutes/month**.

### Storage & Retention Strategy:
- **Daily Schedule**: Runs once every 24 hours at `02:00 UTC` (`07:30 IST`).
- **Retention Period**: Set to **`7 days`** (`retention-days: 7`).
- **Safety Cap / Threshold**: Configured to **`400 MB`** (`MAX_BACKUP_SIZE_MB: 400`).
- **Cumulative Footprint**: Because the compressed database dump is currently small (< 5 MB), 7 daily backups consume approximately ~35 MB (< 7% of GitHub's 500 MB allowance). If the backup file ever exceeds 400 MB, the workflow aborts with an error rather than silently exhausting account quotas.

---

## 4. Encryption Architecture

The database backup contains confidential client progress and trainer notes. It is **never** uploaded to GitHub unencrypted.

- **Algorithm**: `AES-256-CBC` with random 8-byte salt.
- **Key Derivation**: `PBKDF2` with `SHA-256` and **100,000 iterations**.
- **Standard**: Fully compatible with NIST standards and standard OpenSSL command-line utilities.

### Generating a Strong Encryption Key
To generate a 256-bit high-entropy secret for GitHub Actions:
```bash
openssl rand -hex 32
```
Save this value securely in your password manager.

---

## 5. Required GitHub Secrets

Configure the following secrets in GitHub (**Settings > Secrets and variables > Actions**):

| Secret Name | Description | Example / Notes |
| :--- | :--- | :--- |
| `RYVOM_DB_URL` | Direct connection string to production Supabase PostgreSQL. | `postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres?sslmode=require` |
| `RYVOM_BACKUP_ENCRYPTION_KEY` | High-entropy passphrase for AES-256-CBC encryption. | Generated via `openssl rand -hex 32` (at least 16 characters). |

*Note: Never commit `.env` files with these secrets or print them in workflow scripts. Both secrets are automatically masked in workflow runs.*

---

## 6. How to Download, Decrypt, and Inspect a Backup

### Step 1: Download Artifact from GitHub Actions
1. Open the repository on GitHub.
2. Navigate to the **Actions** tab.
3. Select the latest run of **RYVOM Database Backup (Phase 2A)**.
4. Under **Artifacts**, download `ryvom-database-backup-YYYY-MM-DD.zip`.
5. Unzip the downloaded file:
   - `ryvom-db-YYYY-MM-DD.dump.gz.enc` (encrypted archive)
   - `manifest.json` (metadata and verification status)
   - `ryvom-db-YYYY-MM-DD.dump.gz.enc.sha256` (checksum)

### Step 2: Verify Checksum
```bash
# Using helper script:
./scripts/dr-restore-helper.sh verify ryvom-db-*.dump.gz.enc manifest.json

# Or manually:
sha256sum ryvom-db-*.dump.gz.enc
cat *.sha256
```

### Step 3: Decrypt the Backup
Set your decryption key in your shell:
```bash
export RYVOM_BACKUP_ENCRYPTION_KEY="<your-secret-encryption-key>"

# Using helper script:
./scripts/dr-restore-helper.sh decrypt ryvom-db-*.dump.gz.enc ./extracted_backup

# Or manually via OpenSSL:
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in ryvom-db-*.dump.gz.enc \
  -out decrypted.tar.gz \
  -pass env:RYVOM_BACKUP_ENCRYPTION_KEY

tar -xzf decrypted.tar.gz -C ./extracted_backup
```

### Step 4: Inspect the Decrypted Dump
```bash
./scripts/dr-restore-helper.sh inspect ./extracted_backup
```
This inspects the PostgreSQL dump table-of-contents without touching any database, listing public tables (`clients`, `check_ins`, `coach_reviews`, `performance_metrics`, etc.) and the trainer count in `auth_trainers_mapping.json`.

---

## 7. How to Restore into a TEST Supabase Project

> [!CAUTION]
> **Production Guardrail:**
> Restoration scripts strictly require `RYVOM_ALLOW_RESTORE=true`. Never run restore commands against the production database URL. Always restore into a designated test/staging Supabase project.

### Step 1: Reconstruct Trainer Auth Accounts (UUID Preservation)
In RYVOM, `public.clients.coach_user_id` has a foreign key constraint referencing `auth.users(id)`. To restore data cleanly without foreign key violations:
1. Open `extracted_backup/auth_trainers_mapping.json`.
2. For each trainer, recreate their account in the target Supabase project using their **exact preserved UUID**:
   ```javascript
   // Using Supabase Admin Client in a migration script:
   await supabaseAdmin.auth.admin.createUser({
     id: trainer.id, // Preserves the exact UUID referenced by public.clients
     email: trainer.email,
     user_metadata: trainer.raw_user_meta_data,
     email_confirm: true,
   });
   ```
3. Alternatively, defer foreign key checks during initial schema restoration if restoring without recreating users first.

### Step 2: Apply Database Schema Migrations
In the test Supabase project, execute existing migrations from `supabase/migrations/` in chronological order to initialize tables, types, and functions.

### Step 3: Restore Database Tables & Data
```bash
export RYVOM_ALLOW_RESTORE=true
export TARGET_TEST_DB="postgresql://postgres:[PASSWORD]@db.[TEST_PROJECT_REF].supabase.co:5432/postgres"

# Execute restoration using helper script:
./scripts/dr-restore-helper.sh restore-test-db ./extracted_backup "$TARGET_TEST_DB"

# Or manually via pg_restore:
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_TEST_DB" \
  ./extracted_backup/ryvom_public.dump
```

---

## 8. Auth Restoration Limitations

1. **Password Hashes Are Not Restored**:
   Because Supabase Auth manages encrypted password hashes internally, trainers will need to set a new password via the standard **"Forgot Password"** flow or receive an invitation link (`auth.admin.inviteUserByEmail`).
2. **Active Sessions Are Inactive**:
   All previous user sessions, JWTs, and refresh tokens are invalidated upon project recovery.
3. **MFA Secrets**:
   Any registered TOTP/authenticator devices must be re-enrolled.

---

## 9. Storage / Photos Status in Phase 2A

- **Existing Photo URLs**: Check-in records in `public.check_ins` contain paths such as `clients/<client_id>/photo.webp`. These database records **are fully restored**.
- **Photo Binary Files**: The actual `.webp`/`.jpeg` image objects stored in Supabase Storage (`client-photos`) are **NOT backed up** in Phase 2A.
- If a complete Supabase project recreation occurs before Phase 2B (Storage backups) is implemented, the database will point to photo paths that will need to be re-uploaded or restored from future Storage backups.
