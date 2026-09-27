#!/usr/bin/env bash
# ==============================================================================
# RYVOM Disaster Recovery: Safe Backup Decryption & Validation Helper
# ==============================================================================
#
# IMPORTANT SAFETY NOTICE:
# This script is designed for VALIDATION, DECRYPTION, and EXTRACTION.
# It will NEVER automatically restore over production.
#
# RESTORATION TO A TEST DATABASE REQUIRES:
#   export RYVOM_ALLOW_RESTORE=true
#   export TARGET_DATABASE_URL="postgresql://postgres:[PASSWORD]@[TEST_HOST]:5432/postgres"
# ==============================================================================

set -euo pipefail

usage() {
  cat << 'EOF'
Usage:
  ./scripts/dr-restore-helper.sh verify          <encrypted_backup.enc> <manifest.json>
  ./scripts/dr-restore-helper.sh decrypt         <encrypted_backup.enc> <output_dir>
  ./scripts/dr-restore-helper.sh inspect         <extracted_dir>
  ./scripts/dr-restore-helper.sh restore-test-db <extracted_dir> <target_database_url>
  ./scripts/dr-restore-helper.sh decrypt-photos  <encrypted_photos.tar.enc> <output_dir>
  ./scripts/dr-restore-helper.sh inspect-photos  <extracted_photos_dir>
  ./scripts/dr-restore-helper.sh restore-photos  <extracted_photos_dir> <target_supabase_url> <target_service_role_key>

Required Environment Variables:
  RYVOM_BACKUP_ENCRYPTION_KEY     (Required for decrypt / decrypt-photos)
  RYVOM_ALLOW_RESTORE=true        (Required for restore-test-db)
  RYVOM_ALLOW_STORAGE_RESTORE=true (Required for restore-photos)

EOF
  exit 1
}

COMMAND="${1:-}"

case "$COMMAND" in
  verify)
    ENCRYPTED_FILE="${2:-}"
    MANIFEST_FILE="${3:-}"

    if [[ -z "$ENCRYPTED_FILE" || -z "$MANIFEST_FILE" ]]; then
      echo "Error: Missing arguments for verify."
      usage
    fi

    if [[ ! -f "$ENCRYPTED_FILE" ]]; then
      echo "Error: Encrypted backup file not found: $ENCRYPTED_FILE"
      exit 1
    fi

    if [[ ! -f "$MANIFEST_FILE" ]]; then
      echo "Error: Manifest file not found: $MANIFEST_FILE"
      exit 1
    fi

    echo "==> Verifying SHA-256 checksum..."
    CALCULATED_HASH=$(sha256sum "$ENCRYPTED_FILE" | awk '{print $1}')
    
    # Try reading checksum from manifest
    if command -v jq &> /dev/null; then
      EXPECTED_HASH=$(jq -r '.sha256_checksum' "$MANIFEST_FILE")
    else
      EXPECTED_HASH=$(grep -o '"sha256_checksum": "[^"]*"' "$MANIFEST_FILE" | cut -d'"' -f4)
    fi

    if [[ "$CALCULATED_HASH" != "$EXPECTED_HASH" ]]; then
      echo "ERROR: Checksum mismatch!"
      echo "  Calculated: $CALCULATED_HASH"
      echo "  Manifest:   $EXPECTED_HASH"
      exit 1
    fi

    echo "✓ Checksum MATCHES ($CALCULATED_HASH)"
    echo "✓ Manifest verified successfully."
    ;;

  decrypt)
    ENCRYPTED_FILE="${2:-}"
    OUTPUT_DIR="${3:-}"

    if [[ -z "$ENCRYPTED_FILE" || -z "$OUTPUT_DIR" ]]; then
      echo "Error: Missing arguments for decrypt."
      usage
    fi

    if [[ -z "${RYVOM_BACKUP_ENCRYPTION_KEY:-}" ]]; then
      echo "ERROR: Environment variable RYVOM_BACKUP_ENCRYPTION_KEY is required."
      exit 1
    fi

    mkdir -p "$OUTPUT_DIR"
    TEMP_TAR="$OUTPUT_DIR/temp_decrypted.tar.gz"

    echo "==> Decrypting backup using OpenSSL AES-256-CBC PBKDF2..."
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
      -in "$ENCRYPTED_FILE" \
      -out "$TEMP_TAR" \
      -pass env:RYVOM_BACKUP_ENCRYPTION_KEY

    echo "==> Unpacking decrypted archive..."
    tar -xzf "$TEMP_TAR" -C "$OUTPUT_DIR"
    rm -f "$TEMP_TAR"

    echo "✓ Successfully decrypted and extracted to: $OUTPUT_DIR"
    ls -lh "$OUTPUT_DIR"
    ;;

  inspect)
    EXTRACTED_DIR="${2:-}"

    if [[ -z "$EXTRACTED_DIR" || ! -d "$EXTRACTED_DIR" ]]; then
      echo "Error: Directory not found: $EXTRACTED_DIR"
      usage
    fi

    echo "==> Inspecting extracted backup directory: $EXTRACTED_DIR"
    
    DUMP_FILE="$EXTRACTED_DIR/ryvom_public.dump"
    AUTH_FILE="$EXTRACTED_DIR/auth_trainers_mapping.json"

    if [[ -f "$DUMP_FILE" ]]; then
      echo "✓ Found PostgreSQL dump: $DUMP_FILE ($(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE") bytes)"
      if command -v pg_restore &> /dev/null; then
        echo "==> PostgreSQL Dump Table of Contents (public tables):"
        pg_restore --list "$DUMP_FILE" | grep -E "TABLE DATA public|SEQUENCE SET public" || true
      else
        echo "Notice: pg_restore is not installed locally. Skipping TOC listing."
      fi
    else
      echo "Warning: ryvom_public.dump not found in $EXTRACTED_DIR"
    fi

    if [[ -f "$AUTH_FILE" ]]; then
      if command -v jq &> /dev/null; then
        TRAINER_COUNT=$(jq '. | length' "$AUTH_FILE" 2>/dev/null || echo "0")
        echo "✓ Found Auth Trainers Mapping: $TRAINER_COUNT trainer identities"
      fi
    else
      echo "Notice: auth_trainers_mapping.json not found in $EXTRACTED_DIR"
    fi

    AUTH_SQL="$EXTRACTED_DIR/auth_data.sql"
    if [[ -f "$AUTH_SQL" ]]; then
      USER_COUNT=$(grep -c "INSERT INTO auth\.users" "$AUTH_SQL" || true)
      ID_COUNT=$(grep -c "INSERT INTO auth\.identities" "$AUTH_SQL" || true)
      echo "✓ Found Auth Data SQL: $USER_COUNT user records, $ID_COUNT identity records"
    else
      echo "Notice: auth_data.sql not found in $EXTRACTED_DIR"
    fi
    echo "✓ Safe inspection complete (zero sensitive credentials exposed)."
    ;;

  restore-test-db)
    EXTRACTED_DIR="${2:-}"
    TARGET_URL="${3:-}"

    if [[ -z "$EXTRACTED_DIR" || -z "$TARGET_URL" ]]; then
      echo "Error: Missing arguments for restore-test-db."
      usage
    fi

    # SAFETY CHECK 1: Explicit confirmation required
    if [[ "${RYVOM_ALLOW_RESTORE:-}" != "true" ]]; then
      echo "================================================================="
      echo "FATAL: RESTORE BLOCKED BY SAFETY GUARD."
      echo "You must explicitly enable restoration by setting:"
      echo "  export RYVOM_ALLOW_RESTORE=true"
      echo "Refusing to proceed."
      echo "================================================================="
      exit 1
    fi

    # SAFETY CHECK 2: Block production database target
    if [[ -n "${RYVOM_DB_URL:-}" && "$TARGET_URL" == "$RYVOM_DB_URL" ]]; then
      echo "================================================================="
      echo "FATAL: RESTORE BLOCKED! Target URL matches production database (RYVOM_DB_URL)!"
      echo "Restoration over the production database is strictly prohibited."
      echo "================================================================="
      exit 1
    fi

    DUMP_FILE="$EXTRACTED_DIR/ryvom_public.dump"
    AUTH_SQL="$EXTRACTED_DIR/auth_data.sql"

    if [[ ! -f "$DUMP_FILE" ]]; then
      echo "Error: Dump file $DUMP_FILE not found."
      exit 1
    fi

    echo "==> SAFETY CHECK PASSED (RYVOM_ALLOW_RESTORE=true)"

    # Step 1: Restore Auth records first (preserves UUIDs before foreign keys are created)
    if [[ -f "$AUTH_SQL" ]]; then
      echo "==> Step 1: Restoring Auth users and identities into target database..."
      psql "$TARGET_URL" -f "$AUTH_SQL"
      echo "✓ Auth users and identities restored."
    fi

    # Step 2: Restore public schema using pg_restore
    echo "==> Step 2: Restoring public application schema to target database..."
    pg_restore \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
      --dbname="$TARGET_URL" \
      "$DUMP_FILE"

    echo "✓ Database restore to test target completed successfully."
    ;;

  decrypt-photos)
    ENCRYPTED_FILE="${2:-}"
    OUTPUT_DIR="${3:-}"

    if [[ -z "$ENCRYPTED_FILE" || -z "$OUTPUT_DIR" ]]; then
      echo "Error: Missing arguments for decrypt-photos."
      usage
    fi

    if [[ -z "${RYVOM_BACKUP_ENCRYPTION_KEY:-}" ]]; then
      echo "ERROR: Environment variable RYVOM_BACKUP_ENCRYPTION_KEY is required."
      exit 1
    fi

    mkdir -p "$OUTPUT_DIR"
    TEMP_TAR="$OUTPUT_DIR/temp_photos.tar"

    echo "==> Decrypting photo backup using OpenSSL AES-256-CBC PBKDF2..."
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
      -in "$ENCRYPTED_FILE" \
      -out "$TEMP_TAR" \
      -pass env:RYVOM_BACKUP_ENCRYPTION_KEY

    echo "==> Extracting photo archive..."
    tar -xf "$TEMP_TAR" -C "$OUTPUT_DIR"
    rm -f "$TEMP_TAR"

    echo "✓ Successfully decrypted and extracted photos to: $OUTPUT_DIR"
    ls -lh "$OUTPUT_DIR"
    ;;

  inspect-photos)
    EXTRACTED_DIR="${2:-}"

    if [[ -z "$EXTRACTED_DIR" || ! -d "$EXTRACTED_DIR" ]]; then
      echo "Error: Directory not found: $EXTRACTED_DIR"
      usage
    fi

    node scripts/dr-backup-tools.mjs inspect-photos "$EXTRACTED_DIR"
    ;;

  restore-photos)
    EXTRACTED_DIR="${2:-}"
    TARGET_URL="${3:-}"
    TARGET_KEY="${4:-}"
    FORCE_FLAG="${5:-}"

    if [[ -z "$EXTRACTED_DIR" || -z "$TARGET_URL" || -z "$TARGET_KEY" ]]; then
      echo "Error: Missing arguments for restore-photos."
      usage
    fi

    # SAFETY CHECK 1: Explicit confirmation required
    if [[ "${RYVOM_ALLOW_STORAGE_RESTORE:-}" != "true" ]]; then
      echo "================================================================="
      echo "FATAL: STORAGE RESTORE BLOCKED BY SAFETY GUARD."
      echo "You must explicitly enable storage restoration by setting:"
      echo "  export RYVOM_ALLOW_STORAGE_RESTORE=true"
      echo "Refusing to proceed."
      echo "================================================================="
      exit 1
    fi

    # SAFETY CHECK 2: Block production URL and project reference
    node scripts/dr-backup-tools.mjs storage-restore-check "$TARGET_URL"

    echo "==> SAFETY CHECKS PASSED (RYVOM_ALLOW_STORAGE_RESTORE=true)"
    echo "==> Executing storage photo restoration..."

    if [[ "$FORCE_FLAG" == "--force-clean-target" ]]; then
      export RYVOM_FORCE_STORAGE_RESTORE=true
    fi

    node scripts/dr-backup-tools.mjs restore-photos "$EXTRACTED_DIR" "$TARGET_URL" "$TARGET_KEY" $FORCE_FLAG
    ;;

  *)
    usage
    ;;
esac
