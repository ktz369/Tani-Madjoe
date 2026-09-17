# PANDUAN LENGKAP DEPLOYMENT VPS: PLATFORM TANDUR
### *Precision Agriculture & Digital Agronomy Platform*
**Sistem Operasi Target:** Ubuntu 22.04 LTS / Ubuntu 24.04 LTS  
**Arsitektur Aplikasi:** Next.js 14 (Frontend) + FastAPI Python 3.11/3.12 (Backend) + PostgreSQL 16 PostGIS + Nginx Reverse Proxy + GEE (Google Earth Engine)

---

## DAFTAR ISI
1. [Spesifikasi Server & Estimasi Biaya](#1-spesifikasi-server--estimasi-biaya)
2. [Persiapan Awal & Hardening Server (Security)](#2-persiapan-awal--hardening-server-security)
3. [Instalasi Runtime Lingkungan (Node.js, Python, GIS Libraries)](#3-instalasi-runtime-lingkungan)
4. [Instalasi & Konfigurasi PostgreSQL 16 + PostGIS 3.4](#4-instalasi--konfigurasi-postgresql-16--postgis-34)
5. [Deployment Backend (FastAPI + Systemd + GEE Credentials)](#5-deployment-backend-fastapi--systemd)
6. [Deployment Frontend (Next.js 14 + PM2 Cluster / Systemd)](#6-deployment-frontend-nextjs-14--pm2)
7. [Konfigurasi Reverse Proxy Nginx & Optimasi HTTP/2](#7-konfigurasi-reverse-proxy-nginx)
8. [Setup SSL / HTTPS Gratis (Certbot Let's Encrypt) & Auto-Renewal](#8-setup-ssl--https-gratis-certbot)
9. [Konfigurasi Domain & DNS Management](#9-konfigurasi-domain--dns-management)
10. [Manajemen Environment Variables (.env)](#10-manajemen-environment-variables-env)
11. [Opsi Deployment Berbasis Kontainer (Docker Compose)](#11-opsi-deployment-berbasis-kontainer-docker-compose)
12. [Pemeliharaan, Backup Database Spasial, & Log Rotation](#12-pemeliharaan-backup-database-spasial--log-rotation)
13. [Panduan Pemecahan Masalah (Troubleshooting Guide)](#13-panduan-pemecahan-masalah-troubleshooting-guide)

---

## 1. SPESIFIKASI SERVER & ESTIMASI BIAYA

Pemrosesan citra satelit (Sentinel-2, Sentinel-1 SAR), indeks vegetasi multispektral (NDVI, NDRE, NDWI, SAVI, BSI), akumulasi GDD, dan geometri poligon PostGIS memerlukan kapasitas memori dan I/O yang memadai.

| Kategori | Minimum (Staging / < 50 Petak) | Rekomendasi Produksi (Commercial) | Enterprise (> 1.000 Petak / Koperasi) |
| :--- | :--- | :--- | :--- |
| **CPU** | 2 vCPU | 4 vCPU | 8 vCPU |
| **RAM** | 4 GB | 8 GB | 16 GB |
| **Swap** | 4 GB (Wajib diaktifkan) | 4 GB | 4 GB |
| **Penyimpanan** | 40 GB NVMe SSD | 80 - 120 GB NVMe SSD | 250+ GB NVMe SSD |
| **Bandwidth** | 1 TB/bulan | 2 - 4 TB/bulan | 5+ TB/bulan |
| **OS** | Ubuntu 22.04 LTS (Jammy) | Ubuntu 24.04 LTS (Noble) | Ubuntu 22.04 / 24.04 LTS |
| **Provider Rekomendasi** | Hetzner Cloud (CPX21), DigitalOcean, Linode, AWS Lightsail, IDCloudHost | Hetzner (CPX31), Contabo Cloud VPS M, DigitalOcean 8GB Droplet | AWS EC2 (t4g.xlarge / c6g.xlarge), GCP Compute Engine |

> [!IMPORTANT]
> **Penting Mengenai Memori (RAM):**
> Proses kompilasi frontend Next.js (`npm run build`) dan kompilasi modul spasial C++ (`gdal`, `geos`, `shapely`) membutuhkan lonjakan memori (peak memory spike) saat instalasi. Selalu sediakan minimal **4 GB Swap** meskipun VPS Anda memiliki 4 GB RAM untuk mencegah proses terbunuh oleh kernel Linux (*Out-Of-Memory Killer*).

---

## 2. PERSIAPAN AWAL & HARDENING SERVER (SECURITY)

Langkah awal setelah menerima kredensial root VPS dari provider:

### 2.1. Update Sistem Operasi
Hubungkan ke server via SSH:
```bash
ssh root@IP_SERVER_ANDA
```
Jalankan pembaruan paket sistem:
```bash
apt update && apt upgrade -y
apt install -y curl wget git unzip htop ufw fail2ban rsync ca-certificates software-properties-common
```

### 2.2. Membuat User Non-Root (`deploy`)
Menjalankan aplikasi web langsung di bawah akun `root` sangat berisiko terhadap keamanan server.
```bash
# Buat user baru bernama deploy
adduser deploy

# Masukkan user deploy ke grup sudo
usermod -aG sudo deploy

# Salin SSH keys dari root ke user deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Berikan hak sudo tanpa password untuk kenyamanan otomasi skrip
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
chmod 0440 /etc/sudoers.d/deploy
```

### 2.3. Konfigurasi Swap Memory (4 GB)
Jika swap belum ada, buat swap file:
```bash
# Periksa status swap saat ini
swapon --show

# Jika kosong, buat file swap 4GB
fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Jadikan swap permanen saat server reboot
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Optimasi swappiness
sysctl vm.swappiness=20
echo 'vm.swappiness=20' >> /etc/sysctl.conf
```

### 2.4. Konfigurasi Firewall (UFW) & Fail2ban
Amankan port server dengan hanya membuka SSH, HTTP, dan HTTPS:
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp comment 'Nginx HTTP'
ufw allow 443/tcp comment 'Nginx HTTPS'

# Aktifkan UFW
ufw --force enable
ufw status verbose

# Aktifkan service Fail2ban untuk mencegah brute-force SSH
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 3. INSTALASI RUNTIME LINGKUNGAN

Platform TANDUR membutuhkan pustaka kompilasi spasial C/C++ untuk menangani format GeoJSON, WKT, dan perhitungan citra satelit.

### 3.1. Instalasi Pustaka Spasial & Kompiler C
```bash
sudo apt update
sudo apt install -y \
    build-essential \
    pkg-config \
    libpq-dev \
    libgeos-dev \
    gdal-bin \
    libgdal-dev \
    libffi-dev \
    libssl-dev \
    zlib1g-dev \
    libjpeg-dev
```

### 3.2. Instalasi Python 3 (3.11 / 3.12) & Virtual Environment
```bash
sudo apt install -y python3 python3-pip python3-venv python3-dev

# Verifikasi versi python
python3 --version
```

*(Opsional tapi sangat disarankan)* Instal `uv` untuk mempercepat instalasi pip hingga 10-100x lebih cepat:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.cargo/env
```

### 3.3. Instalasi Node.js 20 LTS & PM2
Next.js 14 memerlukan runtime Node.js v18.17+ atau v20 LTS.
```bash
# Tambahkan repo resmi NodeSource untuk Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi versi
node -v # Harus v20.x.x
npm -v

# Instal PM2 (Process Manager) secara global
sudo npm install -g pm2
```

---

## 4. INSTALASI & KONFIGURASI POSTGRESQL 16 + POSTGIS 3.4

TANDUR menggunakan tipe data geometri spasial (`GEOMETRY(POLYGON, 4326)`) via PostGIS untuk memetakan poligon petak lahan, batas zona manajemen, dan buffering radius stasiun cuaca.

### 4.1. Instalasi PostgreSQL 16 & PostGIS
```bash
# Tambahkan repository resmi PostgreSQL PGDG (kompatibel Ubuntu 22.04 & 24.04 LTS)
sudo install -d /etc/apt/keyrings
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor --yes -o /etc/apt/keyrings/postgresql.gpg
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

sudo apt update
sudo apt install -y postgresql-16 postgresql-16-postgis-3 postgresql-contrib-16

# Pastikan service aktif
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 4.2. Membuat Database & Mengaktifkan Ekstensi PostGIS
Masuk ke prompt psql postgres:
```bash
sudo -u postgres psql
```
Jalankan perintah SQL berikut (ganti password `GantiDenganPasswordKuat369!`):
```sql
-- 1. Buat user khusus aplikasi
CREATE ROLE tandur_admin WITH LOGIN PASSWORD 'GantiDenganPasswordKuat369!' CREATEDB;

-- 2. Buat database tandur_db
CREATE DATABASE tandur_db OWNER tandur_admin;

-- 3. Masuk ke database tandur_db
\c tandur_db

-- 4. Aktifkan ekstensi spasial PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 5. Berikan hak akses penuh kepada tandur_admin
GRANT ALL PRIVILEGES ON DATABASE tandur_db TO tandur_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tandur_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tandur_admin;

-- 6. Verifikasi versi PostGIS
SELECT PostGIS_Full_Version();

-- Keluar dari psql
\q
```

---

## 5. DEPLOYMENT BACKEND (FASTAPI + SYSTEMD)

### 5.1. Penyiapan Direktori Aplikasi
```bash
sudo mkdir -p /var/www/tandur
sudo chown -R deploy:deploy /var/www/tandur
```

### 5.2. Cloning Repository atau Salin Source Code
Jika menggunakan Git:
```bash
cd /var/www/tandur
git clone https://github.com/USERNAME/NAMA_REPO.git .
```
*(Atau jika menggunakan SFTP / rsync dari lokal ke VPS)*:
```bash
# Jalankan dari komputer lokal (PowerShell):
scp -r backend frontend deploy@IP_VPS:/var/www/tandur/
```

### 5.3. Penyiapan Kredensial Google Earth Engine (GEE)
Sistem satelit TANDUR memerlukan kunci Service Account Google Cloud / Earth Engine (`paci-x-a7a003954fc1.json`):
```bash
# Buat direktori credentials
mkdir -p /var/www/tandur/backend/credentials

# Pindahkan / upload file json ke direktori ini
# Contoh: /var/www/tandur/backend/credentials/paci-x-a7a003954fc1.json

# Batasi hak akses file kunci agar hanya deploy yang dapat membacanya:
chmod 600 /var/www/tandur/backend/credentials/paci-x-a7a003954fc1.json
```

### 5.4. Virtual Environment & Migrasi Database
```bash
cd /var/www/tandur/backend

# Buat virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Instal dependensi backend
pip install --upgrade pip setuptools wheel
pip install --no-cache-dir -r requirements.txt

# Buat file konfigurasi .env
cp /var/www/tandur/deploy\ vps/.env.production.backend.example /var/www/tandur/backend/.env
# Edit file .env dengan nano:
nano /var/www/tandur/backend/.env
```
Isi konfigurasi database dan kredensial:
```ini
DATABASE_URL=postgresql+asyncpg://tandur_admin:GantiDenganPasswordKuat369!@127.0.0.1:5432/tandur_db
SECRET_KEY=isi_dengan_hasil_dari_openssl_rand_hex_32
GEE_KEY_PATH=/var/www/tandur/backend/credentials/paci-x-a7a003954fc1.json
GEE_SERVICE_ACCOUNT=astral-monitor@paci-x.iam.gserviceaccount.com
GEE_PROJECT=paci-x
MAPBOX_TOKEN=pk.eyJ1IjoieW91ci4uLiJ9...
ENVIRONMENT=production
DEBUG=False
BACKEND_CORS_ORIGINS=["https://tandur.yourdomain.com"]
```

Jalankan migrasi database spasial (Alembic):
```bash
alembic upgrade head
deactivate
```

### 5.5. Konfigurasi Systemd Service untuk Backend FastAPI
Salin template systemd yang telah disediakan:
```bash
sudo cp /var/www/tandur/deploy\ vps/tandur-backend.service /etc/systemd/system/tandur-backend.service
```
Aktifkan dan jalankan service backend:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tandur-backend
sudo systemctl start tandur-backend

# Periksa status
sudo systemctl status tandur-backend
```
Uji koneksi backend lokal:
```bash
curl http://127.0.0.1:8000/
# Output diharapkan:
# {"message":"Selamat datang di API TANDUR...","docs":"/api/docs",...}
```

---

## 6. DEPLOYMENT FRONTEND (NEXT.JS 14 + PM2)

Frontend TANDUR dibangun dengan Next.js 14 App Router, DuckDB-WASM, Mapbox GL, dan Tailwind CSS.

### 6.1. Konfigurasi Environment Frontend
```bash
cd /var/www/tandur/frontend

# Salin template environment
cp /var/www/tandur/deploy\ vps/.env.production.frontend.example .env.local

# Edit .env.local
nano .env.local
```
Isikan nilai berikut:
```ini
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoieW91ci4uLiJ9...
NEXT_PUBLIC_API_BASE_URL=/api
```

### 6.2. Instalasi Dependensi & Build Produksi
```bash
cd /var/www/tandur/frontend

# Instal dependensi node
npm install

# Kompilasi Next.js (dialokasikan 2GB RAM untuk menghindari memory peak)
NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

### 6.3. Menjalankan Frontend dengan PM2 Cluster Mode
PM2 memastikan aplikasi frontend berjalan di background, me-restart otomatis jika crash, dan memanfaatkan multi-core CPU secara efisien.
```bash
# Salin konfigurasi ecosystem PM2
cp /var/www/tandur/deploy\ vps/ecosystem.config.js /var/www/tandur/frontend/ecosystem.config.js

# Jalankan via PM2
cd /var/www/tandur/frontend
pm2 start ecosystem.config.js

# Simpan konfigurasi PM2 agar otomatis berjalan saat VPS reboot
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```
Periksa status PM2:
```bash
pm2 status
pm2 logs tandur-frontend --lines 20
```
Uji koneksi frontend lokal:
```bash
curl -I http://127.0.0.1:3000/
# Harus mengembalikan HTTP/1.1 200 OK
```

---

## 7. KONFIGURASI REVERSE PROXY NGINX

Nginx berfungsi sebagai pintu gerbang utama (reverse proxy), menangani:
- Routing `/api/*` ke FastAPI (port 8000)
- Routing halaman web `/` ke Next.js (port 3000)
- WebSocket upgrade untuk push real-time & HMR
- Static cache untuk bundle Next.js (`/_next/static/`)
- Gzip compression & security headers (HSTS, CSP, TLS 1.2/1.3)

---

## 8. SETUP SSL / HTTPS GRATIS (CERTBOT) & AUTO-RENEWAL

> [!IMPORTANT]
> **PENTING - Urutan Pemasangan SSL & Nginx:**
> Konfigurasi produksi `tandur_nginx.conf` sudah menyertakan konfigurasi HTTPS modern (port 443) dengan path sertifikat Let's Encrypt. Agar perintah uji sintaks Nginx (`nginx -t`) tidak gagal karena sertifikat belum ada di server, **terbitkan sertifikat SSL terlebih dahulu** menggunakan Certbot sebelum mengaktifkan konfigurasi Nginx.

### 8.1. Mengajukan Sertifikat SSL via Certbot (Standalone Mode)
Pastikan DNS A Record domain Anda sudah mengarah ke IP Server VPS (cek dengan `ping domain-anda.com`):

```bash
# 1. Hentikan Nginx sementara agar port 80 bebas untuk verifikasi Certbot
sudo systemctl stop nginx

# 2. Terbitkan sertifikat SSL gratis Let's Encrypt (ganti dengan domain aktif Anda)
sudo certbot certonly --standalone -d tandur.yourdomain.com

# Certbot akan meminta alamat email untuk notifikasi expiry dan persetujuan ToS.
# Setelah berhasil, sertifikat akan tersimpan di:
#   /etc/letsencrypt/live/tandur.yourdomain.com/fullchain.pem
#   /etc/letsencrypt/live/tandur.yourdomain.com/privkey.pem
```

### 8.2. Verifikasi Auto-Renewal Sertifikat
Certbot menyertakan timer systemd otomatis untuk memperpanjang sertifikat setiap 60 hari. Uji mekanisme perpanjangan:
```bash
sudo certbot renew --dry-run
```
Jika output menampilkan `Congratulations, all simulated renewals succeeded`, maka SSL Anda otomatis diperpanjang selamanya tanpa intervensi manual!

---

## 7. KONFIGURASI REVERSE PROXY NGINX & AKTIVASI

Setelah sertifikat SSL Let's Encrypt berhasil diterbitkan, sekarang aktifkan konfigurasi Nginx produksi:

### 7.1. Pasang & Sesuaikan File Konfigurasi Nginx
```bash
# Salin template konfigurasi Nginx
sudo cp "/var/www/tandur/deploy vps/tandur_nginx.conf" /etc/nginx/sites-available/tandur.conf

# Ganti seluruh kemunculan tandur.yourdomain.com dengan nama domain asli Anda:
# (Contoh jika domain Anda adalah tani.kebunraya.id):
sudo sed -i 's/tandur.yourdomain.com/domain-anda.com/g' /etc/nginx/sites-available/tandur.conf

# Atau edit manual dengan nano:
sudo nano /etc/nginx/sites-available/tandur.conf
```

### 7.2. Aktifkan Virtual Host & Nonaktifkan Default Nginx
```bash
# Buat symlink ke sites-enabled
sudo ln -sf /etc/nginx/sites-available/tandur.conf /etc/nginx/sites-enabled/tandur.conf

# Nonaktifkan default site bawaan nginx
sudo rm -f /etc/nginx/sites-enabled/default

# Uji sintaks Nginx (sekarang sertifikat SSL sudah ada, sehingga lolos 100%)
sudo nginx -t
```
Jika muncul pesan:
```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```
Nyalakan kembali dan reload Nginx:
```bash
sudo systemctl restart nginx
sudo systemctl status nginx
```

## 9. KONFIGURASI DOMAIN & DNS MANAGEMENT

Untuk menghubungkan domain Anda (misalnya dibeli di Niagahoster, Namecheap, Cloudflare, DomaiNesia, dll) ke VPS:

1. Masuk ke Dashboard Penyedia Domain / DNS Manager (cth: Cloudflare).
2. Tambahkan **A Record**:
   - **Type:** `A`
   - **Name:** `tandur` (atau `@` jika menggunakan root domain)
   - **IPv4 Address:** `[IP_PUBLIC_VPS_ANDA]`
   - **TTL:** `Auto` atau `300` (5 menit)
   - **Proxy Status (Cloudflare):** *DNS Only* (abu-abu) saat pertama kali mengajukan Certbot SSL, setelah itu dapat diaktifkan ke *Proxied* (oranye).

Setelah menambahkan DNS, tunggu propagasi DNS (1-10 menit). Anda dapat mengeceknya di komputer Anda:
```bash
nslookup tandur.yourdomain.com
# atau
ping tandur.yourdomain.com
```

---

## 10. MANAJEMEN ENVIRONMENT VARIABLES (.ENV)

Berikut adalah daftar variabel lingkungan krusial yang wajib diperhatikan:

### Backend (`/var/www/tandur/backend/.env`):
| Variabel | Penjelasan | Contoh Nilai Produksi |
| :--- | :--- | :--- |
| `DATABASE_URL` | Koneksi async SQLAlchemy ke PostgreSQL | `postgresql+asyncpg://tandur_admin:Pass369!@127.0.0.1:5432/tandur_db` |
| `SECRET_KEY` | Kunci hash JWT token autentikasi pengguna | Dibuat dengan `openssl rand -hex 32` |
| `GEE_KEY_PATH` | Path file JSON Service Account Google Earth Engine | `/var/www/tandur/backend/credentials/paci-x-a7a003954fc1.json` |
| `GEE_SERVICE_ACCOUNT` | Email Service Account GCP | `astral-monitor@paci-x.iam.gserviceaccount.com` |
| `GEE_PROJECT` | ID Project GCP Earth Engine | `paci-x` |
| `MAPBOX_TOKEN` | Token Mapbox untuk tileset & kalkulasi spasial | `pk.eyJ1...` |
| `BACKEND_CORS_ORIGINS` | Daftar origin yang diperbolehkan CORS | `["https://tandur.yourdomain.com"]` |
| `ENVIRONMENT` | Lingkungan runtime FastAPI | `production` |
| `DEBUG` | Mode debug (Matikan di produksi) | `False` |

### Frontend (`/var/www/tandur/frontend/.env.local`):
| Variabel | Penjelasan | Contoh Nilai Produksi |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Token Mapbox publik client-side peta interaktif | `pk.eyJ1...` |
| `NEXT_PUBLIC_API_BASE_URL` | Base path API client | `/api` |
| `PORT` | Port internal Next.js server | `3000` |
| `NODE_ENV` | Mode Node | `production` |

---

## 11. OPSI DEPLOYMENT BERBASIS KONTAINER (DOCKER COMPOSE)

Jika Anda lebih memilih arsitektur berbasis kontainer Docker yang portabel dan terisolasi penuh:

### 11.1. Instal Docker & Docker Compose Plugin di VPS
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
newgrp docker
sudo apt install -y docker-compose-plugin
```

### 11.2. Menjalankan TANDUR dengan Docker Compose
1. Salin seluruh isi folder proyek ke VPS: `/var/www/tandur`.
2. Salin template `.env.production.example` menjadi `.env`:
   ```bash
   cd /var/www/tandur
   cp deploy\ vps/.env.production.example .env
   nano .env
   ```
3. Letakkan kredensial GEE di `/var/www/tandur/credentials/paci-x-a7a003954fc1.json`.
4. Jalankan stack container:
   ```bash
   cd /var/www/tandur
   docker compose -f deploy\ vps/docker-compose.yml up -d --build
   ```
5. Periksa status container:
   ```bash
   docker compose -f deploy\ vps/docker-compose.yml ps
   docker compose -f deploy\ vps/docker-compose.yml logs -f
   ```

---

## 12. PEMELIHARAAN, BACKUP DATABASE SPASIAL, & LOG ROTATION

### 12.1. Skrip Pembaruan Kode (Deploy / Update Git)
Kapan pun Anda melakukan push perubahan kode baru ke repositori Git (branch `main`), Anda cukup menjalankan satu perintah dari VPS:
```bash
bash /var/www/tandur/deploy\ vps/deploy_tandur.sh main
```
Skrip ini akan secara otomatis:
1. Menarik commit terbaru via `git pull`.
2. Memperbarui dependensi Python & menjalankan migrasi Alembic.
3. Mengompilasi Next.js (`npm run build`).
4. Merestart backend FastAPI & me-reload PM2 cluster.
5. Melakukan verifikasi HTTP status 200 healthcheck.

### 12.2. Otomasi Backup Harian Database PostGIS
Data poligon petak, riwayat vegetasi, dan sensor cuaca sangat bernilai. Pasang cron job harian:
```bash
# Buat script backup executable
chmod +x /var/www/tandur/deploy\ vps/backup_database.sh

# Pasang di crontab user deploy
crontab -e
```
Tambahkan baris berikut di baris paling bawah untuk mengeksekusi backup setiap jam 02:00 malam:
```cron
0 2 * * * /bin/bash /var/www/tandur/deploy\ vps/backup_database.sh >> /var/log/tandur/backup.log 2>&1
```

### 12.3. Log Rotation (Mencegah Hard Disk Penuh)
Buat konfigurasi rotasi log untuk Nginx, FastAPI, dan PM2:
```bash
sudo nano /etc/logrotate.d/tandur
```
Isikan:
```text
/var/log/tandur/*.log /var/log/pm2/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
}
```

---

## 13. PANDUAN PEMECAHAN MASALAH (TROUBLESHOOTING GUIDE)

### Masalah 1: 502 Bad Gateway pada Nginx
- **Penyebab:** Service Backend (port 8000) atau Frontend (port 3000) mati atau gagal start.
- **Pemeriksaan:**
  ```bash
  # Cek status backend FastAPI
  sudo systemctl status tandur-backend
  sudo journalctl -u tandur-backend -n 50 --no-pager

  # Cek status frontend Next.js
  pm2 status
  pm2 logs tandur-frontend --lines 50
  ```

### Masalah 2: Error `PostGIS extension not found` saat `alembic upgrade head`
- **Penyebab:** Ekstensi PostGIS belum diinstal di PostgreSQL host.
- **Solusi:**
  ```bash
  sudo apt install -y postgresql-16-postgis-3
  sudo -u postgres psql -d tandur_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
  ```

### Masalah 3: Next.js Build Gagal / Terhenti di "Collecting page data..."
- **Penyebab:** VPS kehabisan RAM (*OOM Killed*).
- **Solusi:**
  1. Pastikan swap 4GB sudah aktif (`free -h`).
  2. Tambahkan alokasi memori ke Node build:
     ```bash
     NODE_OPTIONS="--max-old-space-size=2048" npm run build
     ```

### Masalah 4: Citra Satelit GEE Tidak Muncul / Error Autentikasi
- **Penyebab:** File service account json hilang atau permission ditolak.
- **Solusi:**
  1. Pastikan path di `.env`: `GEE_KEY_PATH=/var/www/tandur/backend/credentials/paci-x-a7a003954fc1.json`.
  2. Periksa apakah file ada: `ls -la /var/www/tandur/backend/credentials/`.
  3. Uji autentikasi GEE via terminal python:
     ```bash
     cd /var/www/tandur/backend
     source .venv/bin/activate
     python -c "from app.services.gee_service import is_gee_available; print('GEE Status:', is_gee_available())"
     ```

---
*Dokumen ini disusun untuk deployment produksi standar industri. Simpan kredensial server dan API keys secara aman.*
