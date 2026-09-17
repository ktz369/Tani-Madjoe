# TECHNICAL SPECIFICATION & IMPLEMENTATION BRIEF: FULL-CYCLE PRECISION AGRI-OPERATIONS & GEOLIBRE INTEGRATION

## 1. Executive Summary & Objective

Brief teknis ini menginstruksikan penambahan modul operasional siklus tanam penuh (*end-to-end*) pada platform **Tani**, melengkapi kapabilitas makro satelit (GEE + Sentinel-1/Sentinel-2) dengan modul mikro-operasional berbasis *client-side geoprocessing* menggunakan **GeoLibre** (WASM & DuckDB-WASM).

Tujuan utama:

1. Mengakomodasi kebutuhan lapangan riil (tata kelola air irigasi, tenaga kerja/HOK, inventaris saprotan & batas aman PHI, scouting hama lapang, HPP per petak, dan pasca-panen).

2. Mengintegrasikan pustaka/core engine GeoLibre (<https://github.com/opengeos/GeoLibre.git>) ke frontend (Next.js + Mapbox GL JS) untuk eksekusi komputasi medan (DEM), pembacaan raster drone (COG), dan query spasial lokal tanpa membebani backend FastAPI.
---

## 2. Arsitektur Komponen & Alur Data

```text
[Frontend: Next.js App Router]
   ├── Mapbox GL JS (Map Renderer & Canvas)
   ├── GeoLibre WASM Layer (Client-Side Engine):
   │     ├── Hydrology & Terrain Worker (DEM processing, flow accumulation, contours)
   │     ├── COG Tile Reader (Drone orthomosaic 2-5 cm resolution)
   │     └── DuckDB-WASM Spatial (Local spatial indexing, buffering, & aggregation)
   └── UI Forms & Dashboards (HOK, Saprotan, Scouting, Unit Economics, Post-Harvest)
            │ (REST API / GeoJSON)
[Backend: FastAPI + SQLAlchemy]
   ├── PostGIS Spatial Engine (Poligon Petak, Saluran Tersier, Titik Temuan)
   ├── Agronomic Engine (FAO-56, GDD, PHI Lock Engine)
   └── Financial & Operations Ledger (HOK, Cost-per-Plot, Inventaris Saprotan)

```

---

## 3. Ekstensi Skema Basis Data (PostgreSQL / PostGIS & SQLAlchemy)

Tambahkan skema tabel baru di backend (`backend/app/models/operations.py`):

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Date, Enum, Text
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.db.base_class import Base
import enum

class TaskType(str, enum.Enum):
    OLAH_TANAH = "olah_tanah"
    SEMAI = "semai"
    TANDUR = "tandur"
    PENYIANGAN = "penyiangan"
    PEMUPUKAN = "pemupukan"
    PENYEMPROTAN = "penyemprotan"
    PANEN = "panen"

class PlotLaborLog(Base):
    __tablename__ = "plot_labor_logs"
    id = Column(Integer, primary_key=True, index=True)
    plot_id = Column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    activity_date = Column(Date, nullable=False)
    task_type = Column(Enum(TaskType), nullable=False)
    labor_count = Column(Integer, nullable=False)  # Jumlah pekerja
    hours_worked = Column(Float, nullable=False)   # Jam kerja
    wage_rate_per_day = Column(Float, nullable=False)  # Upah satuan
    is_contract = Column(Boolean, default=False)  # Borongan atau harian
    total_cost = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)

class PlotIrrigationLog(Base):
    __tablename__ = "plot_irrigation_logs"
    id = Column(Integer, primary_key=True, index=True)
    plot_id = Column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    water_source = Column(String(50), nullable=False) # 'irigasi_tersier', 'pompa_diesel', 'sumur_dalam'
    water_volume_m3 = Column(Float, nullable=True)
    pump_duration_hours = Column(Float, nullable=True)
    fuel_liters = Column(Float, nullable=True)
    fuel_cost = Column(Float, nullable=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)

class SaprotanItem(Base):
    __tablename__ = "saprotan_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False) # 'benih', 'pupuk_makro', 'pupuk_mikro', 'pestisida'
    active_ingredient = Column(String(100), nullable=True)
    phi_days = Column(Integer, default=0) # Pre-Harvest Interval (Hari Tunggu Panen)
    unit = Column(String(20), nullable=False) # 'kg', 'liter', 'zak'
    unit_cost = Column(Float, nullable=False)
    stock_qty = Column(Float, default=0.0)

class PlotSaprotanApplication(Base):
    __tablename__ = "plot_saprotan_applications"
    id = Column(Integer, primary_key=True, index=True)
    plot_id = Column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("saprotan_items.id"), nullable=False)
    application_date = Column(Date, nullable=False)
    quantity_used = Column(Float, nullable=False)
    total_cost = Column(Float, nullable=False)

class PestScoutingReport(Base):
    __tablename__ = "pest_scouting_reports"
    id = Column(Integer, primary_key=True, index=True)
    plot_id = Column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    observation_date = Column(DateTime, nullable=False)
    pest_type = Column(String(100), nullable=False) # 'wereng_coklat', 'fa_armyworm', 'blas', dsb.
    severity = Column(String(20), nullable=False) # 'ringan', 'sedang', 'berat'
    location_point = Column(Geometry("POINT", srid=4326), nullable=False)
    photo_url = Column(String(255), nullable=True)
    action_taken = Column(Text, nullable=True)

class PostHarvestLog(Base):
    __tablename__ = "post_harvest_logs"
    id = Column(Integer, primary_key=True, index=True)
    plot_id = Column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    harvest_date = Column(Date, nullable=False)
    gross_yield_kg = Column(Float, nullable=False) # Bobot kotor
    moisture_content_pct = Column(Float, nullable=False) # Kadar Air (%) saat panen
    dockage_pct = Column(Float, default=0.0) # Potongan kotoran/hampa (%)
    net_yield_kg = Column(Float, nullable=False) # Bobot bersih tersesuaikan
    selling_price_per_kg = Column(Float, nullable=True)
    storage_location = Column(String(100), nullable=True) # Gudang / Lantai Jemur

```

---

## 4. Spesifikasi Modul Baru per Tahapan Siklus Tanam

### Modul A: Pra-Tanam — Analisis Medan & Saluran Mikro (GeoLibre WASM)

* **Lokasi UI:** Tab baru di `/admin/petak-baru` dan sub-menu di `/petak/[id]`.
* **Fungsionalitas:**

1. Menerima file DEM format GeoTIFF (input pengguna atau drone LiDAR/SRTM resolusi tinggi).
2. Eksekusi module GeoLibre via WebWorker di browser pengguna:

* Menjalankan `depression_filling` untuk mendeteksi cekungan tanah tak rata.
* Menjalankan `flow_accumulation` & `flow_direction` untuk mengekstrak vektor jalur air limpasan alami.

1. Overlay garis aliran air langsung di atas peta Mapbox GL dengan penandaan titik rawan genangan (*inundation hazard*).

2. Digitasi linier saluran tersier/kuarter dan menyimpan atribut arah buka pintu air ke PostGIS.

### Modul B: Fase Tanam & Vegetatif — Integrasi Orthomosaic Drone (COG)

* **Lokasi UI:** Toggle Layer di Kanvas Peta Spasial `/peta`.

* **Fungsionalitas:**

1. Mendukung pemuatan layer Cloud-Optimized GeoTIFF (COG) hasil penerbangan drone lokal via URL publik/S3 presigned URL.
2. GeoLibre merender band red-edge dan NIR langsung secara *client-side* tanpa re-tiling di backend.
3. Alat inspeksi poligon bolong: Deteksi vegetasi kosong pada usia 7–14 HST untuk memetakan titik kritis sulaman bibit.

### Modul C: Fase Pemeliharaan — Validasi Batas Aman PHI (*Pre-Harvest Interval*)

* **Lokasi UI:** Form Aplikasi Bahan Kimia di `/petak/[id]`.
* **Logika Sistem:**

1. Saat agronomis memilih pestisida kimia tertentu, sistem mengambil estimasi tanggal panen fisiologis berbasis akumulasi GDD yang sudah aktif di petak tersebut.

2. Hitung:

$$\Delta \text{Hari} = \text{Target Tanggal Panen GDD} - \text{Tanggal Rencana Semprot}$$

1. **Enforcement Rule:** Jika $\Delta \text{Hari} < \text{PHI Barang}$, form terkunci (*disabled*) dan memicu modal peringatan: *"Aplikasi dilarang: Bahan aktif memiliki batas waktu tunggu X hari sebelum panen. Residu kimia berisiko melebihi batas toleransi."*

### Modul D: Monitoring Hama Terpadu (Mobile Scouting & WASM Clustering)

* **Lokasi UI:** Sub-menu `/petak/[id]/scouting` dan tampilan titik insiden di `/peta`.

* **Fungsionalitas:**

1. Form input titik koordinat mandor (Geolocation HTML5 API / GPS perangkat).
2. Menampilkan titik temuan hama dengan klasifikasi warna tingkat keparahan (*ringan: kuning, sedang: oranye, berat: merah*).
3. **WASM Hotspot Engine:** Menggunakan DuckDB-WASM di browser untuk mengeksekusi buffer spasial ($R = 50\text{ m}$) di sekitar titik temuan berat, menghasilkan poligon "Zona Karantina" darurat untuk rekomendasi isolasi semprotan.

### Modul E: Finansial & HPP Berjalan (*Plot-Level Unit Economics*)

* **Lokasi UI:** Tab Finansial di `/petak/[id]` dan ringkasan eksekutif di `/laporan`.

* **Logika Perhitungan:**
* Akumulasi Biaya Berjalan:

$$\text{Total Biaya} = \sum \text{Upah HOK} + \sum \text{Biaya Saprotan} + \sum \text{BBM Irigasi} + \text{Alokasi Sewa Lahan}$$

* Estimasi HPP per Kilogram Gabah/Jagung:

$$\text{HPP Proyeksi} = \frac{\text{Total Biaya Berjalan}}{\text{Estimasi Hasil Tonase Panen (GDD Model)} \times 1000}$$

* Heatmap Finansial di `/dashboard`: Pewarnaan poligon petak berdasarkan rasio efisiensi biaya per hektar (Merah: *Over-budget*, Hijau: *Optimal*).

### Modul F: Pasca-Panen & Kalkulator Rafaksi Kadar Air

* **Lokasi UI:** Modal Input Panen di `/petak/[id]`.
* **Formula Standardisasi Gabah / Jagung:**
Mengonversi berat kotor basah ke berat standar simpan/giling (Kadar Air Acuan $KA_{\text{std}} = 14\%$):

$$\text{Net Yield (kg)} = \text{Gross Yield} \times \left(1 - \frac{\text{Dockage}\%}{100}\right) \times \left(\frac{100 - KA_{\text{aktual}}}{100 - KA_{\text{std}}}\right)$$

* Menyimpan rekonsiliasi akhir antara tonase estimasi GDD vs realisasi panen aktual di database.

---

## 5. Integrasi Frontend: Mengaktifkan GeoLibre & DuckDB-WASM

Instal paket dependensi di lingkungan frontend Next.js:

```bash
npm install @duckdb/duckdb-wasm @opengeos/geolibre

```

### Implementasi Worker Helper (`frontend/lib/geolibre-client.ts`)

```typescript
import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;

export async function getDuckDBSpatial(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db;

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.pthreadWorker);
  
  const conn = await db.connect();
  // Install & Load Spatial Extension di browser
  await conn.query(`INSTALL spatial; LOAD spatial;`);
  await conn.close();

  return db;
}

/**
 * Menghitung klaster buffer zona isolasi serangan hama via spatial SQL di browser
 */
export async function generatePestQuarantineBuffer(geoJsonPoints: any, bufferMeters = 50) {
  const database = await getDuckDBSpatial();
  const conn = await database.connect();

  await database.registerFileText('scouting_points.geojson', JSON.stringify(geoJsonPoints));
  
  const query = `
    SELECT 
      ST_AsGeoJSON(ST_Union(ST_Buffer(geom, ${bufferMeters / 111320}))) as quarantine_polygon
    FROM ST_Read('scouting_points.geojson')
    WHERE severity = 'berat';
  `;

  const result = await conn.query(query);
  await conn.close();
  
  return result.toArray().map(row => JSON.parse(row.quarantine_polygon));
}

```

---

## 6. Endpoints API Baru (FastAPI)

Tambahkan rute-rute berikut pada backend:

| Method | Endpoint | Deskripsi |
| --- | --- | --- |
| `GET/POST` | `/api/v1/plots/{plot_id}/labor` | Catat & rekap HOK tenaga kerja harian/borongan |
| `GET/POST` | `/api/v1/plots/{plot_id}/irrigation` | Log konsumsi bahan bakar, volume air, dan operasional pompa |
| `GET/POST` | `/api/v1/saprotan` | Manajemen inventaris pupuk, obat, dan acuan PHI |
| `POST` | `/api/v1/plots/{plot_id}/apply-saprotan` | Input pemakaian saprotan dengan validasi otomatis PHI terhadap GDD

 |
| `GET/POST` | `/api/v1/plots/{plot_id}/scouting` | Laporan pandangan mata sebaran serangan OPT |
| `GET` | `/api/v1/plots/{plot_id}/financial-summary` | Kalkulasi HPP riil per kg dan rekapitulasi beban berjalan |
| `POST` | `/api/v1/plots/{plot_id}/harvest-closing` | Tutup musim tanam, hitung rafaksi kadar air, dan arsipkan metrik |

---

## 7. Tahapan Implementasi & Kriteria Keberhasilan (Acceptance Criteria)

1. **Sprint 1 — Schema Migration & CRUD Operasional:**

* Eksekusi migration Alembic untuk seluruh model di Section 3.
* Hubungkan API FastAPI dengan UI Next.js untuk logging HOK, Bahan Kimia, dan Irigasi.

1. **Sprint 2 — Integrasi GeoLibre Engine:**

* Pastikan `@duckdb/duckdb-wasm` terinisialisasi bersih tanpa memicu SSR hydration error di Next.js (wajib dynamic import / client-side component).
* Verifikasi fitur pembacaan file DEM lokal dan visualisasi aliran drainase di atas Mapbox.

1. **Sprint 3 — Guardrail Agronomi & Keuangan:**

* Validasi PHI mengunci penginputan pestisida bila hari menuju panen GDD lebih kecil dari masa aktif zat.

* HPP per petak terkalkulasi akurat membagi seluruh biaya riil terhadap estimasi tonase.

* Kalkulator kadar air menghasilkan bobot netto yang terstandarisasi 14% secara matematis.
