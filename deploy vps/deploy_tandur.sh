#!/usr/bin/env bash
# ==============================================================================
# TANDUR - CONTINUOUS DEPLOYMENT & UPDATE AUTOMATION SCRIPT
# Menangani: Git Pull, Python Venv, Alembic Migration, Next.js Build, Service Restart
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

APP_DIR="/var/www/tandur"
BRANCH="${1:-main}"

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}       MEMULAI DEPLOYMENT TANDUR PLATFORM (Branch: $BRANCH)      ${NC}"
echo -e "${GREEN}==================================================================${NC}"

if [ ! -d "$APP_DIR" ]; then
    log_error "Direktori aplikasi $APP_DIR tidak ditemukan!"
    exit 1
fi

cd "$APP_DIR"

# 1. Update Kode dari Git (jika berupa git repository)
if [ -d ".git" ]; then
    log_info "Memperbarui source code dari Git branch '$BRANCH'..."
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    log_success "Kode repositori berhasil diperbarui."
else
    log_warn "Bukan git repository. Melewati git pull, melanjutkan deployment file lokal..."
fi

# 2. Deployment Backend (FastAPI)
log_info "--- MEMPROSES DEPLOYMENT BACKEND ---"
cd "$APP_DIR/backend"

# Buat virtual environment jika belum ada
if [ ! -d ".venv" ]; then
    log_info "Membuat virtual environment Python..."
    python3 -m venv .venv
fi

# Aktivasi Venv
source .venv/bin/activate

# Upgrade pip & install requirements
log_info "Menginstal & memperbarui dependensi Python..."
pip install --upgrade pip setuptools wheel
pip install --no-cache-dir -r requirements.txt

# Verifikasi file konfigurasi .env backend
if [ ! -f ".env" ]; then
    log_error "File $APP_DIR/backend/.env TIDAK DITEMUKAN!"
    log_warn "Silakan buat file .env berdasarkan .env.production.backend.example sebelum melanjutkan."
    exit 1
fi

# Verifikasi file kredensial Google Earth Engine (GEE)
GEE_CRED="$APP_DIR/backend/credentials/paci-x-a7a003954fc1.json"
if [ ! -f "$GEE_CRED" ]; then
    if [ -f "$APP_DIR/paci-x-a7a003954fc1.json" ]; then
        mkdir -p "$APP_DIR/backend/credentials"
        cp "$APP_DIR/paci-x-a7a003954fc1.json" "$GEE_CRED"
        log_info "Menyalin file GEE dari root ke $GEE_CRED"
    elif [ -f "$APP_DIR/credentials/paci-x-a7a003954fc1.json" ]; then
        mkdir -p "$APP_DIR/backend/credentials"
        cp "$APP_DIR/credentials/paci-x-a7a003954fc1.json" "$GEE_CRED"
        log_info "Menyalin file GEE dari credentials ke $GEE_CRED"
    fi
fi

if [ -f "$GEE_CRED" ]; then
    chmod 600 "$GEE_CRED"
    log_success "Kredensial GEE terverifikasi: $GEE_CRED"
else
    log_warn "File GEE ($GEE_CRED) belum ditemukan! Citra satelit akan menggunakan fallback mock."
fi

# Jalankan migrasi database PostgreSQL / PostGIS
log_info "Menjalankan migrasi database Alembic..."
alembic upgrade head
log_success "Migrasi skema database berhasil diterapkan."

deactivate

# 3. Deployment Frontend (Next.js 14)
log_info "--- MEMPROSES DEPLOYMENT FRONTEND ---"
cd "$APP_DIR/frontend"

# Verifikasi file environment frontend
if [ ! -f ".env.local" ] && [ ! -f ".env.production" ]; then
    log_warn "File .env.local atau .env.production tidak ditemukan di frontend."
    log_info "Membuat default .env.local untuk frontend..."
    echo "NODE_ENV=production" > .env.local
    echo "NEXT_PUBLIC_API_BASE_URL=/api" >> .env.local
fi

log_info "Menginstal dependensi Node.js..."
npm install --no-audit

log_info "Membangun Next.js untuk produksi (npm run build)..."
# Mengalokasikan memori node build hingga 2GB untuk stabilitas compilasi TypeScript & SWC
NODE_OPTIONS="--max-old-space-size=2048" npm run build
log_success "Build Next.js selesai."

# 4. Restart Services
log_info "--- RESTART APPLICATION SERVICES ---"

# Restart Backend Systemd
if systemctl is-active --quiet tandur-backend; then
    log_info "Me-restart systemd service tandur-backend..."
    sudo systemctl restart tandur-backend
else
    log_warn "Service tandur-backend belum aktif. Mencoba start..."
    sudo systemctl enable tandur-backend || true
    sudo systemctl start tandur-backend || true
fi

# Restart Frontend via PM2 atau Systemd
if command -v pm2 &> /dev/null; then
    log_info "Me-reload Next.js frontend via PM2..."
    if pm2 describe tandur-frontend &> /dev/null; then
        pm2 reload tandur-frontend
    else
        if [ -f "ecosystem.config.js" ]; then
            pm2 start ecosystem.config.js
        else
            pm2 start npm --name "tandur-frontend" -- start -- -p 3000
        fi
        pm2 save
    fi
    log_success "PM2 frontend berhasil di-reload."
elif systemctl is-active --quiet tandur-frontend; then
    log_info "Me-restart systemd service tandur-frontend..."
    sudo systemctl restart tandur-frontend
fi

# Reload Nginx jika ada perubahan
log_info "Menguji konfigurasi Nginx..."
if sudo nginx -t; then
    log_info "Me-reload Nginx..."
    sudo systemctl reload nginx
    log_success "Nginx berhasil di-reload."
else
    log_error "Konfigurasi Nginx memiliki kesalahan sintaks!"
fi

# 5. Verifikasi Health Check
log_info "--- VERIFIKASI HEALTH CHECK ---"
sleep 3

# Uji Backend API
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ || true)
if [ "$BACKEND_STATUS" = "200" ]; then
    log_success "Backend API beroperasi normal (HTTP 200 OK)."
else
    log_warn "Backend API mengembalikan status: $BACKEND_STATUS (Periksa: journalctl -u tandur-backend -n 50)"
fi

# Uji Frontend Next.js
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || true)
if [ "$FRONTEND_STATUS" = "200" ] || [ "$FRONTEND_STATUS" = "304" ]; then
    log_success "Frontend Next.js beroperasi normal (HTTP $FRONTEND_STATUS)."
else
    log_warn "Frontend Next.js mengembalikan status: $FRONTEND_STATUS (Periksa: pm2 logs tandur-frontend)"
fi

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}          DEPLOYMENT TANDUR SELESAI DENGAN SUKSES!                ${NC}"
echo -e "${GREEN}==================================================================${NC}"
