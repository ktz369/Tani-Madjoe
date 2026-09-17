#!/usr/bin/env bash
# ==============================================================================
# TANDUR - AUTOMATED POSTGRESQL + POSTGIS DATABASE BACKUP SCRIPT
# Menghasilkan backup dump terkompresi (.sql.gz) dan merotasi retensi 7 hari
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/var/backups/tandur"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="tandur_db"
DB_USER="tandur_admin"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Memulai proses pencadangan database $DB_NAME..."

# Baca password database dari environment atau file .env backend untuk cron non-interaktif
if [ -z "${PGPASSWORD:-}" ]; then
    ENV_FILE="/var/www/tandur/backend/.env"
    if [ -f "$ENV_FILE" ]; then
        POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)
        if [ -n "$POSTGRES_PASSWORD" ]; then
            export PGPASSWORD="$POSTGRES_PASSWORD"
        fi
    fi
fi

# Eksekusi pg_dump dengan kompresi gzip
# pg_dump akan menangkap seluruh skema spasial PostGIS dan data tabel
pg_dump -U "$DB_USER" -h 127.0.0.1 -d "$DB_NAME" | gzip > "$BACKUP_FILE"

# Atur hak akses agar hanya root/deploy yang dapat membaca file backup
chmod 600 "$BACKUP_FILE"

echo "[$(date)] Backup database berhasil dibuat: $BACKUP_FILE"
echo "[$(date)] Ukuran file: $(du -sh "$BACKUP_FILE" | cut -f1)"

# Hapus backup yang lebih lama dari $RETENTION_DAYS hari
echo "[$(date)] Membersihkan file backup yang berumur lebih dari $RETENTION_DAYS hari..."
find "$BACKUP_DIR" -type f -name "${DB_NAME}_backup_*.sql.gz" -mtime +$RETENTION_DAYS -exec rm -f {} \;

echo "[$(date)] Pemeliharaan backup selesai."
