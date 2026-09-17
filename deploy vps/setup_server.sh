#!/usr/bin/env bash
# ==============================================================================
# TANDUR - SERVER INITIAL SETUP AUTOMATION SCRIPT
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
# Menyiapkan: Hardening, UFW, Fail2ban, Swap, Python 3.11/3.12 + dev + geos,
#             Node.js 20 LTS, PM2, PostgreSQL 16 + PostGIS 3.4, Nginx, Certbot.
# ==============================================================================

set -euo pipefail

# Warna untuk output terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 1. Pastikan script dijalankan sebagai root / sudo
if [ "$EUID" -ne 0 ]; then
    log_error "Skrip ini wajib dijalankan sebagai root (atau gunakan sudo bash setup_server.sh)."
    exit 1
fi

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}    TANDUR - Precision Agriculture & Agronomy VPS Setup          ${NC}"
echo -e "${GREEN}==================================================================${NC}"

# Konfigurasi Default (Dapat disesuaikan jika dibutuhkan)
DEPLOY_USER="deploy"
APP_DIR="/var/www/tandur"
DB_NAME="tandur_db"
DB_USER="tandur_admin"
DB_PASS="TandurAgronomy369SecurePass!" # Ganti password ini sesuai kebutuhan Anda

# 2. Update & Upgrade Sistem
log_info "Memperbarui katalog paket apt dan dependensi OS..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
    curl wget git unzip gnupg lsb-release ca-certificates \
    software-properties-common ufw fail2ban htop rsync \
    build-essential pkg-config libpq-dev libgeos-dev gdal-bin libgdal-dev \
    libffi-dev libssl-dev zlib1g-dev libjpeg-dev

# 3. Setup Swap Memory (Sangat penting agar build Next.js & GDAL tidak OOM-Killed pada VPS < 4GB RAM)
log_info "Memeriksa alokasi Swap memory..."
if [ "$(swapon --show | wc -l)" -le 1 ]; then
    log_info "Swap belum tersedia. Membuat swap file sebesar 4GB..."
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    sysctl vm.swappiness=20
    echo 'vm.swappiness=20' >> /etc/sysctl.conf
    log_success "Swap 4GB berhasil diaktifkan."
else
    log_info "Swap sudah aktif. Melewati langkah ini."
fi

# 4. Pembuatan Deploy User Non-Root
log_info "Memeriksa deploy user: $DEPLOY_USER..."
if ! id "$DEPLOY_USER" &>/dev/null; then
    log_info "Membuat user non-root '$DEPLOY_USER' dengan hak sudo..."
    useradd -m -s /bin/bash "$DEPLOY_USER"
    usermod -aG sudo "$DEPLOY_USER"
    echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$DEPLOY_USER"
    chmod 0440 "/etc/sudoers.d/$DEPLOY_USER"
    
    # Salin SSH keys jika root memiliki authorized_keys
    if [ -f /root/.ssh/authorized_keys ]; then
        mkdir -p "/home/$DEPLOY_USER/.ssh"
        cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/"
        chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
        chmod 700 "/home/$DEPLOY_USER/.ssh"
        chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
    fi
    log_success "User $DEPLOY_USER berhasil dibuat."
else
    log_info "User $DEPLOY_USER sudah ada."
fi

# 5. Konfigurasi Firewall (UFW) & Fail2ban
log_info "Mengonfigurasi UFW Firewall & Fail2ban..."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp comment "HTTP Web"
ufw allow 443/tcp comment "HTTPS Web"
ufw --force enable
systemctl enable fail2ban
systemctl restart fail2ban
log_success "Firewall UFW aktif: Port 22 (SSH), 80 (HTTP), 443 (HTTPS) terbuka."

# 6. Instalasi Python & Tooling
log_info "Menginstal Python 3 (venv, pip, dev)..."
apt-get install -y python3 python3-pip python3-venv python3-dev
log_info "Python version: $(python3 --version)"

# 7. Instalasi Node.js 20 LTS & PM2
log_info "Mengonfigurasi repository NodeSource Node.js 20 LTS..."
if ! command -v node &> /dev/null || [[ "$(node -v)" != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
log_success "Node.js $(node -v) & npm $(npm -v) berhasil diinstal."

log_info "Menginstal PM2 process manager secara global..."
npm install -g pm2
pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" || true

# 8. Instalasi PostgreSQL 16 + PostGIS 3.4
log_info "Mengonfigurasi repository resmi PostgreSQL..."
install -d /etc/apt/keyrings
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor --yes -o /etc/apt/keyrings/postgresql.gpg
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update -y
apt-get install -y postgresql-16 postgresql-16-postgis-3 postgresql-contrib-16

systemctl enable postgresql
systemctl start postgresql

# Buat Database, User, dan Aktifkan Ekstensi PostGIS
log_info "Menyiapkan database '$DB_NAME' dan user '$DB_USER'..."
sudo -u postgres psql <<EOF
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
      CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' CREATEDB;
   ELSE
      ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';
   END IF;
END
\$\$;

SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

\c $DB_NAME
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
EOF
log_success "Database PostgreSQL 16 + PostGIS berhasil dikonfigurasi."

# 9. Instalasi Nginx & Certbot
log_info "Menginstal Nginx & Certbot SSL Let's Encrypt..."
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx
mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot

# 10. Persiapan Direktori Aplikasi TANDUR
log_info "Menyiapkan direktori aplikasi di $APP_DIR..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/backend/credentials"
mkdir -p "/var/log/pm2"
mkdir -p "/var/log/tandur"
mkdir -p "/var/backups/tandur"

chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/var/log/pm2"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/var/log/tandur"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/var/backups/tandur"
chmod 755 "$APP_DIR"

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}       SETUP SERVER SELESAI DENGAN SUKSES!                        ${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo -e "Informasi Akses Database:"
echo -e "  - Host: 127.0.0.1"
echo -e "  - Port: 5432"
echo -e "  - Database: ${YELLOW}$DB_NAME${NC}"
echo -e "  - User: ${YELLOW}$DB_USER${NC}"
echo -e "  - Password: ${YELLOW}$DB_PASS${NC}"
echo -e "  - PostGIS Extension: Terpasang (PostGIS 3)"
echo -e ""
echo -e "Langkah Selanjutnya:"
echo -e "  1. Salin kode proyek TANDUR ke folder: ${YELLOW}$APP_DIR${NC}"
echo -e "  2. Masukkan file service account GEE (${YELLOW}paci-x-a7a003954fc1.json${NC}) ke ${YELLOW}$APP_DIR/backend/credentials/${NC}"
echo -e "  3. Konfigurasi ${YELLOW}.env${NC} pada backend dan frontend"
echo -e "  4. Jalankan script deployment: ${YELLOW}bash deploy_tandur.sh${NC}"
echo -e "=================================================================="
