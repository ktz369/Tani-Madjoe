# Tani — SaaS Platform Monitoring Pertanian & Analisis Satelit

Platform SaaS agrikultur presisi terpadu berbasis citra satelit Sentinel-2 (NDVI, NDWI, EVI), kalkulasi evapotranspirasi cuaca ($ET_0$), akumulasi fenologi tanaman (Growing Degree Days / GDD), dan sistem peringatan anomali lahan.

---

## 🚀 Arsitektur & Teknologi

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (Async), PostGIS (GeoAlchemy2), Alembic, Pydantic v2
- **Frontend:** Next.js 14 (App Router, TypeScript), Tailwind CSS, Lucide Icons, Axios, Recharts, Mapbox GL JS
- **Database:** PostgreSQL 16 + PostGIS 3.4
- **Reverse Proxy:** Nginx Alpine
- **Containerization:** Docker Compose

---

## 📁 Struktur Direktori

```
Tani/
├── backend/
│   ├── alembic/              # Database migrations
│   │   ├── versions/
│   │   │   └── 0001_initial_postgis.py
│   │   └── env.py
│   ├── app/
│   │   ├── api/              # API Route endpoints
│   │   │   ├── __init__.py
│   │   │   └── health.py     # /api/health endpoint
│   │   ├── models/           # SQLAlchemy DB Models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Business logic
│   │   ├── utils/            # Helper utilities
│   │   ├── config.py         # Application settings
│   │   ├── database.py       # Async SQLAlchemy session & engine
│   │   └── main.py           # FastAPI entry point
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx      # Dashboard placeholder
│   │   ├── components/       # UI Components
│   │   ├── lib/
│   │   │   └── api.ts        # Axios API Client
│   │   └── types/            # TypeScript interfaces
│   ├── Dockerfile
│   ├── next.config.mjs
│   ├── package.json
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── README.md
```

---

## 🛠️ Menjalankan Project

### 1. Salin Environment Variables
```bash
cp .env.example .env
```

### 2. Jalankan Seluruh Layanan dengan Docker Compose
```bash
docker compose up --build -d
```

### 3. Akses Layanan
- **Web Frontend:** [http://localhost](http://localhost) (atau port 3000 langsung)
- **API Health Endpoint:** [http://localhost/api/health](http://localhost/api/health)
- **API Interactive Swagger Docs:** [http://localhost/api/docs](http://localhost/api/docs)
- **PostGIS Database:** `localhost:5432`

---

## 🧪 Verifikasi Endpoint Health

```bash
curl http://localhost/api/health
```

Respon:
```json
{
  "status": "ok",
  "database": "connected"
}
```
