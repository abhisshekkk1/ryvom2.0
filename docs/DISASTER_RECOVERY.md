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

### NOT Protected in Phase 2A:
- ❌ **Supabase Storage Objects / Photos**: Files stored in the `client-photos` bucket (e.g., front, side, and back progress photos) are **NOT backed up** in Phase 2A. They will be addressed separately in Phase 2B.
- ❌ **Transient Session State**: Active user sessions (`auth.sessions`), refresh tokens (`auth.refresh_tokens`), flow states, and audit logs are intentionally excluded. Trainers simply sign in once with their existing passwords upon project recovery.
- ❌ **External Backup Providers**: No paid cloud providers (AWS S3, Google Cloud, Backblaze B2, Cloudflare) are used. Target cost remains ₹0.

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

## 7. How to Restore into a Fresh / Test Supabase Project

> [!CAUTION]
> **Production Guardrail:**
> Restoration scripts strictly require `RYVOM_ALLOW_RESTORE=true`. Never run restore commands against the production database URL. Always restore into a designated clean test/staging Supabase project.

### Step 1: Initialize Clean Target Project
1. Create a fresh Supabase project. Supabase will automatically provision the default `auth` and `storage` schemas.
2. Ensure the project is clean (do not manually create users in the dashboard prior to restore, to avoid primary key or email collisions).

### Step 2: Restore Auth Records (`auth_data.sql`)
Because `public.clients.coach_user_id` has a foreign key constraint referencing `auth.users(id)`, Auth user records must be restored first:
```bash
export RYVOM_ALLOW_RESTORE=true
export TARGET_TEST_DB="postgresql://postgres:[PASSWORD]@db.[TEST_REF].supabase.co:5432/postgres"

# Step 2a: Restore Auth users and identities
psql "$TARGET_TEST_DB" -f ./extracted_backup/auth_data.sql
```
*Note: This preserves original UUIDs, emails, coach metadata, and bcrypt password hashes.*

### Step 3: Restore Public Application Schema & Data
```bash
# Step 3a: Restore public tables and data
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_TEST_DB" \
  ./extracted_backup/ryvom_public.dump
```
Because `auth.users` is already populated with the preserved trainer UUIDs, foreign key constraints in `public.clients` resolve seamlessly.

*Alternatively, the helper script automates both steps safely:*
```bash
./scripts/dr-restore-helper.sh restore-test-db ./extracted_backup "$TARGET_TEST_DB"
```

### Step 4: Update Application Configuration
1. Update `.env.local` or environment variables with the new Supabase Project URL, Anon Key, and Service Role Key.
2. Trainers can immediately sign in using their **existing email and password** (the bcrypt hashes in `auth.users` authenticate directly with Supabase GoTrue).

---

## 8. Auth Restoration Invariants & Limitations

1. **Password Hashes Are Preserved**:
   Because `encrypted_password` is preserved in `auth_data.sql`, users can log in with their existing passwords immediately.
2. **Active Sessions Are Terminated**:
   Old JWTs and session cookies signed with the previous project's JWT secret are not restored. Users must authenticate once to receive a new session.
3. **MFA Enrolments**:
   If multi-factor authentication was configured, TOTP devices must be re-registered.
4. **Target Project Cleanliness**:
   The target Supabase project must be fresh. Do not pre-create users with matching emails or UUIDs before running the restore.

---

## 9. Storage / Photos Status in Phase 2A

- **Database References Restored**: Check-in rows in `public.check_ins` contain paths like `clients/<client_id>/front.webp`. These records **are fully restored**.
- **Photo Binary Files**: The actual `.webp`/`.jpeg` image objects stored in the `client-photos` Supabase Storage bucket are **NOT backed up in Phase 2A**. Storage backups will be implemented in Phase 2B.
