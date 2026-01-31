#!/bin/bash
# ===========================================
# Papyr.us PostgreSQL Backup Script
# ===========================================
# This script creates a full database backup with timestamps
# and manages backup retention (default: 7 days)
#
# Usage:
#   ./backup.sh                    # Manual backup
#   ./backup.sh --restore <file>   # Restore from backup
#
# Environment variables (from .env):
#   - DATABASE_URL or individual DB_* variables
#   - BACKUP_DIR (default: /backups)
#   - BACKUP_RETENTION_DAYS (default: 7)
#   - BACKUP_S3_BUCKET (optional: upload to S3)
# ===========================================

set -euo pipefail

# Load environment variables from .env if exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="papyrus_backup_${TIMESTAMP}.sql.gz"

# Parse DATABASE_URL or use individual variables
if [ -n "${DATABASE_URL:-}" ]; then
    # Parse: postgresql://user:password@host:port/database
    PROTO="$(echo $DATABASE_URL | grep :// | sed -e's,^\(.*://\).*,\1,g')"
    URL="$(echo ${DATABASE_URL/$PROTO/})"
    USERPASS="$(echo $URL | grep @ | cut -d@ -f1)"
    HOSTPORT="$(echo ${URL/$USERPASS@/} | cut -d/ -f1)"
    DB_NAME="$(echo $URL | grep / | cut -d/ -f2- | cut -d? -f1)"
    DB_USER="$(echo $USERPASS | cut -d: -f1)"
    DB_PASSWORD="$(echo $USERPASS | cut -d: -f2)"
    DB_HOST="$(echo $HOSTPORT | cut -d: -f1)"
    DB_PORT="$(echo $HOSTPORT | cut -d: -f2)"
    [ -z "$DB_PORT" ] && DB_PORT="5432"
else
    DB_HOST="${POSTGRES_HOST:-localhost}"
    DB_PORT="${POSTGRES_PORT:-5432}"
    DB_NAME="${POSTGRES_DB:-papyrus_db}"
    DB_USER="${POSTGRES_USER:-papyrus_user}"
    DB_PASSWORD="${POSTGRES_PASSWORD:-}"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Function: Create backup
create_backup() {
    log_info "Starting PostgreSQL backup..."
    log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    log_info "Backup file: $BACKUP_DIR/$BACKUP_FILE"

    # Set password for pg_dump
    export PGPASSWORD="$DB_PASSWORD"

    # Create backup with compression
    pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=custom \
        --compress=9 \
        --verbose \
        --file="$BACKUP_DIR/$BACKUP_FILE" \
        2>&1 | tee "$BACKUP_DIR/backup_${TIMESTAMP}.log"

    # Verify backup was created
    if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
        log_info "Backup completed successfully!"
        log_info "Backup size: $BACKUP_SIZE"
        
        # Create latest symlink
        ln -sf "$BACKUP_FILE" "$BACKUP_DIR/latest.sql.gz"
    else
        log_error "Backup failed! Check logs at $BACKUP_DIR/backup_${TIMESTAMP}.log"
        exit 1
    fi

    unset PGPASSWORD
}

# Function: Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    find "$BACKUP_DIR" -name "papyrus_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "backup_*.log" -type f -mtime +$RETENTION_DAYS -delete
    
    # List remaining backups
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "papyrus_backup_*.sql.gz" -type f | wc -l)
    log_info "Remaining backups: $BACKUP_COUNT"
}

# Function: Upload to S3 (if configured)
upload_to_s3() {
    if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
        log_info "Uploading backup to S3: $BACKUP_S3_BUCKET"
        
        if command -v aws &> /dev/null; then
            aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/$BACKUP_FILE"
            log_info "S3 upload completed!"
        else
            log_warn "AWS CLI not found, skipping S3 upload"
        fi
    fi
}

# Function: Restore from backup
restore_backup() {
    local RESTORE_FILE="$1"
    
    if [ ! -f "$RESTORE_FILE" ]; then
        log_error "Backup file not found: $RESTORE_FILE"
        exit 1
    fi
    
    log_warn "⚠️  This will OVERWRITE the current database!"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Restore cancelled."
        exit 0
    fi
    
    log_info "Restoring from: $RESTORE_FILE"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Restore
    pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --clean \
        --if-exists \
        --verbose \
        "$RESTORE_FILE"
    
    unset PGPASSWORD
    
    log_info "Database restored successfully!"
}

# Function: List backups
list_backups() {
    log_info "Available backups in $BACKUP_DIR:"
    echo ""
    ls -lh "$BACKUP_DIR"/papyrus_backup_*.sql.gz 2>/dev/null || echo "No backups found."
    echo ""
}

# Main execution
case "${1:-backup}" in
    --restore|-r)
        if [ -z "${2:-}" ]; then
            log_error "Usage: $0 --restore <backup_file>"
            exit 1
        fi
        restore_backup "$2"
        ;;
    --list|-l)
        list_backups
        ;;
    --cleanup|-c)
        cleanup_old_backups
        ;;
    backup|*)
        create_backup
        cleanup_old_backups
        upload_to_s3
        ;;
esac

log_info "Done!"
