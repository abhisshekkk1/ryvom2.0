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
  ./scripts/dr-restore-helper.sh verify  <encrypted_backup.enc> <manifest.json>
  ./scripts/dr-restore-helper.sh decrypt <encrypted_backup.enc> <output_dir>
  ./scripts/dr-restore-helper.sh inspect <extracted_dir>
  ./scripts/dr-restore-helper.sh restore-test-db <extracted_dir> <target_database_url>

Required Environment Variables:
  RYVOM_BACKUP_ENCRYPTION_KEY   (Required for decrypt)
  RYVOM_ALLOW_RESTORE=true      (Required for restore-test-db)

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
      echo "✓ Found Auth Trainers Mapping: $AUTH_FILE"
      if command -v jq &> /dev/null; then
        TRAINER_COUNT=$(jq '. | length' "$AUTH_FILE" 2>/dev/null || echo "unknown")
        echo "  Trainer records found: $TRAINER_COUNT"
        echo "  Trainer UUIDs & emails:"
        jq -r '.[] | "    - \(.id) (\(.email))"' "$AUTH_FILE" 2>/dev/null || true
      fi
    else
      echo "Warning: auth_trainers_mapping.json not found in $EXTRACTED_DIR"
    fi
    ;;

  restore-test-db)
    EXTRACTED_DIR="${2:-}"
    TARGET_URL="${3:-}"

    if [[ -z "$EXTRACTED_DIR" || -z "$TARGET_URL" ]]; then
      echo "Error: Missing arguments for restore-test-db."
      usage
    fi

    # SAFETY CHECK
    if [[ "${RYVOM_ALLOW_RESTORE:-}" != "true" ]]; then
      echo "================================================================="
      echo "FATAL: RESTORE BLOCKED BY SAFETY GUARD."
      echo "You must explicitly enable restoration by setting:"
      echo "  export RYVOM_ALLOW_RESTORE=true"
      echo "Refusing to proceed."
      echo "================================================================="
      exit 1
    fi

    DUMP_FILE="$EXTRACTED_DIR/ryvom_public.dump"
    if [[ ! -f "$DUMP_FILE" ]]; then
      echo "Error: Dump file $DUMP_FILE not found."
      exit 1
    fi

    echo "==> SAFETY CHECK PASSED (RYVOM_ALLOW_RESTORE=true)"
    echo "==> Restoring public schema to target database..."
    
    # Run pg_restore with safety flags
    pg_restore \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
      --dbname="$TARGET_URL" \
      "$DUMP_FILE"

    echo "✓ Database restore to test target completed successfully."
    ;;

  *)
    usage
    ;;
esac
