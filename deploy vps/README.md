# TANDUR - Production Deployment Package (Linux VPS)

Direktori ini berisi seluruh skrip otomasi, file konfigurasi, template variabel lingkungan, dan panduan lengkap untuk melakukan deployment aplikasi **TANDUR** (Platform Pertanian Presisi & Digital Agronomy) pada server Linux VPS (Ubuntu 22.04 / 24.04 LTS).

---

## 📁 Struktur Berkas

| Berkas | Keterangan |
| :--- | :--- |
| [`PANDUAN_DEPLOY_VPS.md`](./PANDUAN_DEPLOY_VPS.md) | **Dokumen Panduan Utama**: Instruksi langkah-demi-langkah (A to Z) dari penyiapan server, database spasial, SSL HTTPS, hingga pemeliharaan. |
| [`setup_server.sh`](./setup_server.sh) | **Skrip Otomasi Server**: Hardening VPS, UFW firewall, fail2ban, alokasi Swap 4GB, instalasi Python 3.11/3.12, Node.js 20, PM2, PostgreSQL 16 + PostGIS, dan Nginx. |
| [`deploy_tandur.sh`](./deploy_tandur.sh) | **Skrip Otomasi Deployment/Update**: Git pull, update venv, migrasi database Alembic, Next.js production build, restart service, dan health check. |
| [`tandur_nginx.conf`](./tandur_nginx.conf) | **Konfigurasi Reverse Proxy Nginx**: Routing port 8000 (FastAPI) & port 3000 (Next.js), WebSocket upgrade, caching statis, HTTP/2, dan security headers. |
| [`tandur-backend.service`](./tandur-backend.service) | **Systemd Service Unit**: Pengelolaan background process FastAPI dengan 4 workers Uvicorn dan auto-restart. |
| [`tandur-frontend.service`](./tandur-frontend.service) | **Systemd Service Unit**: Pengelolaan background process Next.js frontend (alternatif jika tanpa PM2). |
| [`ecosystem.config.js`](./ecosystem.config.js) | **Konfigurasi PM2 Cluster**: Menjalankan frontend Next.js dalam mode cluster multi-core CPU dengan proteksi auto-restart memory limit. |
| [`backup_database.sh`](./backup_database.sh) | **Skrip Pencadangan Database**: Dump PostgreSQL + PostGIS terkompresi (.sql.gz) dengan rotasi retensi otomatis 7 hari. |
| [`.env.production.backend.example`](./.env.production.backend.example) | Template variabel lingkungan backend (Database URL, JWT Secret, GEE Service Account, Mapbox, SMTP). |
| [`.env.production.frontend.example`](./.env.production.frontend.example) | Template variabel lingkungan frontend (Next.js, Mapbox public token, API base URL). |
| [`.env.production.example`](./.env.production.example) | Ringkasan terpadu seluruh variabel lingkungan produksi. |
| [`docker-compose.yml`](./docker-compose.yml) | Konfigurasi Docker Compose multi-kontainer (PostgreSQL PostGIS, FastAPI, Next.js, Nginx) untuk opsi deployment kontainer. |
| [`Dockerfile.backend`](./Dockerfile.backend) | Multi-stage Dockerfile produksi backend FastAPI dengan library GDAL/GEOS C++. |
| [`Dockerfile.frontend`](./Dockerfile.frontend) | Multi-stage Dockerfile produksi frontend Next.js 14. |
| [`tandur_nginx_docker.conf`](./tandur_nginx_docker.conf) | Konfigurasi reverse proxy Nginx khusus jaringan internal Docker. |

---

## ⚡ Quick Start (Jalur Cepat)

### 1. Di Server VPS Baru (Login sebagai root)
```bash
# Upload atau clone folder 'deploy vps' ke server, lalu jalankan:
chmod +x setup_server.sh
sudo bash setup_server.sh
```

### 2. Konfigurasi Kunci & Environment
1. Masuk ke user `deploy`:
   ```bash
   su - deploy
   ```
2. Letakkan file kredensial Google Earth Engine:
   ```bash
   mkdir -p /var/www/tandur/backend/credentials
   # Salin file paci-x-a7a003954fc1.json ke folder di atas
   chmod 600 /var/www/tandur/backend/credentials/paci-x-a7a003954fc1.json
   ```
3. Salin dan sesuaikan file `.env`:
   ```bash
   cp "deploy vps/.env.production.backend.example" /var/www/tandur/backend/.env
   cp "deploy vps/.env.production.frontend.example" /var/www/tandur/frontend/.env.local
   ```

### 3. Deploy Aplikasi
```bash
chmod +x deploy_tandur.sh
bash deploy_tandur.sh main
```

### 4. Setup SSL Gratis & Nginx
```bash
# 1. Terbitkan sertifikat SSL Let's Encrypt (pastikan domain sudah diarahkan ke IP VPS)
sudo systemctl stop nginx
sudo certbot certonly --standalone -d tandur.yourdomain.com

# 2. Pasang konfigurasi Nginx dan sesuaikan domain Anda
sudo cp "deploy vps/tandur_nginx.conf" /etc/nginx/sites-available/tandur.conf
sudo sed -i 's/tandur.yourdomain.com/domain-anda.com/g' /etc/nginx/sites-available/tandur.conf
sudo ln -sf /etc/nginx/sites-available/tandur.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

Baca panduan selengkapnya di [`PANDUAN_DEPLOY_VPS.md`](./PANDUAN_DEPLOY_VPS.md).
