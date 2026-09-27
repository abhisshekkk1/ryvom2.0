# RYVOM Disaster Recovery Architecture (Phase 2A + 2B)

> **Important Notice:**
> Phase 2A and Phase 2B implement an **automated, encrypted disaster recovery backup system** leveraging free GitHub Actions infrastructure (₹0 cost).
> - **Phase 2A**: Daily automated backup of PostgreSQL database + Auth users/identities (7-day retention).
> - **Phase 2B**: Daily automated backup of private `client-photos` Supabase Storage bucket (1-day retention).
>
> ⚠️ **Photo Retention Policy**: Photo backups currently use 1-day GitHub artifact retention as a temporary ₹0/month beta DR solution. This is not the final long-term photo archival strategy.

---

## 1. Overview & System Architecture

```text
                               Production Supabase Project
                                     │            │
             ┌───────────────────────┘            └────────────────────────┐
             ▼ (PostgreSQL & Auth)                                         ▼ (Storage API)
   PostgreSQL Dump (-Fc, schema=public)                         client-photos Binary Objects
   + auth_data.sql (auth.users, identities)                     + manifest.json (SHA-256 hashes)
   + auth_trainers_mapping.json                                 + bucket_config.json (private)
             │                                                             │
             ▼                                                             ▼
     tar.gz compression                                            Uncompressed tar packaging
             │                                                             │
             ▼                                                             ▼
   AES-256-CBC Encryption (PBKDF2, 100k iter)                   AES-256-CBC Encryption (PBKDF2, 100k iter)
             │                                                             │
             ▼                                                             ▼
   ryvom-db-YYYY-MM-DD.dump.gz.enc                              ryvom_photos.tar.enc
   (7-day rolling retention)                                    (1-day beta rolling retention)
```

---

## 2. What Is Backed Up vs What Is Not Backed Up

### Protected in Phase 2A & 2B:
1. **Public Schema Tables (`public.*`)**:
   - `public.clients` (client profiles, status, `deleted_at`, `is_self`)
   - `public.check_ins` (weekly check-in submissions, biometric metrics, adherence)
   - `public.coach_reviews` (coach feedback and reviews)
   - `public.client_coach_notes` (private coach timeline notes)
   - `public.client_access` (portal access tokens and hashes)
   - `public.performance_metrics` (custom strength and physique metrics)
   - `public.performance_logs` (historical metric logs)
   - All legacy and existing reconciled tables (`workout_logs`, `password_reset_requests`, etc.)
2. **Database Schema & Logic**:
   - PostgreSQL table structures, primary keys, foreign keys, and indexes.
   - Row Level Security (RLS) policies.
   - Stored functions (e.g. `get_dashboard_checkins()`).
   - Sequences and data types.
3. **Trainer Authentication & Credential Records (`auth_data.sql`)**:
   - `auth.users`: Preserves original `id` (UUID), `email`, `raw_user_meta_data`, and `encrypted_password` (bcrypt password hash).
   - `auth.identities`: Preserves authentication provider identity linkages (`provider: 'email'`, identity data).
4. **Trainer Identity Fallback Mapping (`auth_trainers_mapping.json`)**:
   - Preserves non-sensitive mapping of `id`, `email`, `raw_user_meta_data`, and `created_at` as an immutable secondary fallback.
5. **Private Supabase Storage Objects (`ryvom_photos.tar.enc`)**:
   - All client transformation photos stored in the private `client-photos` bucket (`clients/<clientId>/<filename>`).
   - `manifest.json`: Exact relative paths, byte counts, MIME types, and SHA-256 integrity checksums.
   - `bucket_config.json`: Preserves bucket privacy (`public: false`), 10 MB limit, and allowed MIME types.

### NOT Protected:
- ❌ **Transient Session State**: Active user sessions (`auth.sessions`), refresh tokens (`auth.refresh_tokens`), flow states, and audit logs are intentionally excluded. Trainers sign in with their existing passwords upon project recovery.
- ❌ **Paid External Storage**: No paid cloud providers (AWS S3, Google Cloud, Backblaze B2) are required. Target cost remains ₹0/month.

---

## 3. GitHub Free Infrastructure & Storage Caps

GitHub Free accounts for private repositories provide:
- **500 MB** total shared artifact storage.
- **2,000 Actions minutes/month**.

### Storage & Retention Strategy:
- **Daily Schedule**: Runs once every 24 hours at `02:00 UTC` (`07:30 IST`).
- **Retention Period**: Set to **`7 days`** (`retention-days: 7`).
- **Safety Cap / Threshold**: Configured to **`400 MB`** (`MAX_BACKUP_SIZE_MB: 400`).
- **Cumulative Footprint**: The compressed database dump and auth data currently total < 5 MB. 7 daily backups consume approximately ~35 MB (< 7% of GitHub's 500 MB allowance). If the backup file ever exceeds 400 MB, the workflow aborts with an error rather than silently exhausting account quotas.

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
This safely inspects the contents and prints summary metrics (public tables, trainer identity count, auth user count) **without printing sensitive credentials, emails, or password hashes**.

---

## 7. Complete Catastrophic Disaster Recovery Sequence (11 Steps)

In the event of total project destruction, follow this exact sequential recovery procedure:

```text
Fresh Supabase Project
       │
       ▼
1. Run Database Migrations
       │
       ▼
2. Restore Auth Users & Identities (auth_data.sql)
       │
       ▼
3. Restore Public Schema (ryvom_public.dump)
       │
       ▼
4. Create Private client-photos Bucket
       │
       ▼
5. Restore Photos via Storage API (restore-photos)
       │
       ▼
6. SHA-256 Integrity Verification (against manifest.json)
       │
       ▼
7. Update Vercel Environment Variables
       │
       ▼
8. Configure Supabase Auth Settings
       │
       ▼
9. Verify Trainer Login (Existing Passwords Authenticate)
       │
       ▼
10. Verify Photo Signing & PhotoCompareView Rendering
```

### Detailed Step-by-Step Instructions:

#### Step 1: Initialize Clean Target Project
Create a fresh Supabase project. Supabase provisions default `auth` and `storage` schemas.

#### Step 2: Apply Database Schema Migrations
Apply migrations in `supabase/migrations/` to establish base schema, types, and functions.

#### Step 3: Restore Auth Records (`auth_data.sql`)
Because `public.clients.coach_user_id` has a foreign key constraint referencing `auth.users(id)`, Auth user records must be restored first:
```bash
export RYVOM_ALLOW_RESTORE=true
export TARGET_TEST_DB="postgresql://postgres:[PASSWORD]@db.[TEST_REF].supabase.co:5432/postgres"

psql "$TARGET_TEST_DB" -f ./extracted_backup/auth_data.sql
```
*Preserves original UUIDs, emails, coach metadata, and bcrypt password hashes.*

#### Step 4: Restore Public Application Database (`ryvom_public.dump`)
```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_TEST_DB" \
  ./extracted_backup/ryvom_public.dump
```
*Or execute automated helper:*
```bash
./scripts/dr-restore-helper.sh restore-test-db ./extracted_backup "$TARGET_TEST_DB"
```

#### Step 5: Configure Private `client-photos` Storage Bucket
Ensure the bucket is configured as strictly private (`public: false`, 10 MB limit, allowed MIME types).

#### Step 6: Restore Storage Photos via Supabase Storage API
```bash
export RYVOM_ALLOW_STORAGE_RESTORE=true
export TARGET_SUPABASE_URL="https://[TEST_REF].supabase.co"
export TARGET_SERVICE_ROLE_KEY="eyJhbGciOi..."

./scripts/dr-restore-helper.sh restore-photos ./extracted_photos "$TARGET_SUPABASE_URL" "$TARGET_SERVICE_ROLE_KEY"
```
> [!CAUTION]
> **Do NOT insert directly into `storage.objects` via SQL.**
> Inserting metadata into PostgreSQL without uploading raw binaries via the Storage API causes S3 404 missing object errors. `restore-photos` uploads via the supported Storage REST API with original paths and MIME types.

#### Step 7: SHA-256 Post-Restore Integrity Verification
The restore tooling automatically compares SHA-256 hashes of all restored objects against `manifest.json`. Restoration fails if any file is missing or corrupted.

#### Step 8: Update Application Environment Variables
Update Vercel deployment or `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Step 9: Configure Supabase Auth Settings
Configure Site URL and Redirect URLs (`/auth/callback`, `/auth/confirm`, `/auth/accept-invite`) in Supabase Dashboard.

#### Step 10: Verify Trainer Login
Trainers sign in with their **existing email and password**. GoTrue verifies bcrypt hashes directly without password resets.

#### Step 11: Verify Photo Signing & Rendering
Open client check-ins and the Photo Compare View. Verify that `signPhotoUrl()` produces valid 2-hour signed URLs and photos render correctly.

---

## 8. Photo Storage Quota & Retention Policy

- **Current Retention**: Photo backups currently use **1-day GitHub Actions artifact retention** as a temporary ₹0/month beta DR solution.
- **Quota Limit**: GitHub Free provides **500 MB** total shared artifact storage. Holding 7 daily photo archives would exhaust this free cap once photo storage exceeds 50 MB.
- **Long-Term Strategy**: 1-day retention keeps artifact usage strictly within the 500 MB limit for up to ~400 MB of photos. Future phases will evaluate sustainable object storage archiving (such as Cloudflare R2's 10 GB free tier) for multi-year retention.
