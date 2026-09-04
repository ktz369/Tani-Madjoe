# Spec: SaaS Monitoring Pertanian Presisi — Padi & Jagung (Proyek "Tani")

## Problem Statement

Perusahaan agribisnis yang mengelola 500–5.000 hektar lahan padi dan jagung tersebar di 5–20 lokasi tidak memiliki cara terpusat untuk memantau fase fenologi tanaman secara presisi. Saat ini, deteksi stres nitrogen, kekeringan, serangan hama, dan waktu panen optimal bergantung sepenuhnya pada inspeksi lapangan manual yang lambat, subjektif, dan tidak skalabel. Data satelit dan agrometeorologi tersedia secara gratis (Sentinel-1/2, Open-Meteo) namun memerlukan keahlian remote sensing untuk mengolahnya. Akibatnya, keputusan pemupukan, irigasi, dan panen sering terlambat, menurunkan produktivitas dan meningkatkan risiko gagal panen.

## Solution

Membangun platform SaaS web (dashboard enterprise, bahasa Indonesia) yang secara otomatis:

1. Mengambil citra satelit (Sentinel-2 optik, Sentinel-1 SAR) via Google Earth Engine dan data cuaca via Open-Meteo setiap hari
2. Menghitung indeks spektral (NDVI, NDRE, NDWI, SAVI, BSI) dan variabel agrometeorologi (GDD, ET₀, ETc) per petak lahan
3. Melacak fase fenologi tanaman berdasarkan skala BBCH/IRRI (padi) dan V-R (jagung) menggunakan akumulasi GDD
4. Mengevaluasi 4 aturan deteksi anomali (stres nitrogen, stres air, serangan hama, panen optimal) dan mengirimkan peringatan dini
5. Menyajikan semua data tersebut dalam peta interaktif, grafik time-series, dan laporan otomatis yang bisa dipahami pengguna non-teknis

## User Stories

1. Sebagai admin perusahaan, saya ingin mendaftarkan perusahaan agribisnis baru ke sistem, agar data lahan terorganisir per perusahaan
2. Sebagai admin perusahaan, saya ingin membuat hierarki Estate → Divisi → Petak di bawah perusahaan, agar struktur lahan sesuai organisasi di lapangan
3. Sebagai estate manager, saya ingin menggambar poligon petak lahan langsung di peta interaktif, agar batas petak terekam secara geospasial
4. Sebagai estate manager, saya ingin mengisi atribut setiap petak (jenis tanaman, varietas, tanggal tanam, luas), agar sistem mengetahui konteks agronomis masing-masing petak
5. Sebagai estate manager, saya ingin memilih varietas tanaman dari database referensi yang dinamis, agar parameter GDD dan Kc otomatis diterapkan sesuai varietas
6. Sebagai admin, saya ingin menambah varietas baru beserta parameter GDD target per fase, Kc per fase, dan threshold alert via dashboard, agar sistem tetap relevan saat varietas baru digunakan
7. Sebagai estate manager, saya ingin melihat peta seluruh petak di satu estate dengan warna berdasarkan status kesehatan NDVI (heatmap), agar saya bisa mengetahui petak bermasalah secara sekilas
8. Sebagai agronomist, saya ingin melihat grafik time-series NDVI, NDRE, dan NDWI per petak (historis sejak tanam), agar saya bisa menganalisis tren pertumbuhan tanaman
9. Sebagai agronomist, saya ingin melihat fase fenologi saat ini untuk setiap petak (beserta progress bar menuju fase berikutnya), agar saya tahu tahap pertumbuhan tanaman tanpa inspeksi lapangan
10. Sebagai agronomist, saya ingin sistem menghitung GDD akumulatif harian berdasarkan data cuaca riil (bukan hari kalender), agar prediksi tanggal masuk fase berikutnya dan tanggal panen lebih akurat
11. Sebagai agronomist, saya ingin melihat prediksi tanggal panen berdasarkan GDD akumulatif vs target varietas, agar perencanaan logistik panen bisa dilakukan lebih awal
12. Sebagai agronomist, saya ingin sistem menghitung kebutuhan air harian (ETc = ET₀ × Kc) per petak berdasarkan fase tanaman, agar rekomendasi irigasi terukur
13. Sebagai estate manager, saya ingin menerima peringatan KUNING ketika NDVI > 0.60 namun NDRE turun 15% di bawah threshold fase, agar saya tahu petak kekurangan nitrogen sebelum daun menguning
14. Sebagai estate manager, saya ingin menerima peringatan ORANYE ketika ΔNDWI 7 hari < -0.15 dan curah hujan 7 hari < 10mm, agar saya bisa menjadwalkan irigasi dalam 48 jam sebelum daun layu permanen
15. Sebagai estate manager, saya ingin menerima peringatan MERAH ketika varians piksel dalam poligon > 25%, agar saya segera memeriksa titik koordinat yang dicurigai terkena serangan hama atau rebah
16. Sebagai estate manager, saya ingin menerima peringatan HIJAU TUA ketika GDD akumulatif ≥ target varietas dan NDVI ≤ 0.35, agar saya tahu tanaman sudah masak fisiologis dan siap dipanen
17. Sebagai estate manager, saya ingin melihat panel alert aktif di dashboard utama yang menampilkan semua peringatan terbaru beserta rekomendasi aksi, agar saya bisa merespons cepat
18. Sebagai estate manager, saya ingin menandai alert sebagai "sudah dibaca" atau "sudah ditangani", agar tracking tindak lanjut tercatat
19. Sebagai pengguna, saya ingin menerima notifikasi alert melalui in-app notification (bell icon), agar saya tahu ada peringatan saat membuka dashboard
20. Sebagai pengguna, saya ingin menerima ringkasan alert harian melalui email, agar saya tetap terinformasi meskipun tidak membuka dashboard
21. Sebagai agronomist, saya ingin melihat widget cuaca saat ini (suhu, kelembaban, curah hujan, angin) beserta prakiraan 16 hari ke depan per lokasi estate, agar keputusan di lapangan mempertimbangkan kondisi cuaca
22. Sebagai agronomist, saya ingin menggunakan timeline slider untuk melihat perubahan NDVI/NDRE/NDWI pada peta dari waktu ke waktu, agar saya bisa menelusuri kapan anomali mulai terjadi
23. Sebagai agronomist, saya ingin melihat overlay citra satelit (true color / false color) langsung di peta, agar saya bisa memvalidasi indeks dengan visual citra asli
24. Sebagai estate manager, saya ingin melihat tabel ringkasan status seluruh petak (nama, varietas, fase, NDVI terakhir, alert aktif) dengan sorting dan filtering, agar saya bisa menemukan petak kritis dengan cepat
25. Sebagai agronomist, saya ingin sistem mendeteksi genangan air di sawah padi melalui SAR Sentinel-1 (σ⁰_VV < -15 dB atau σ⁰_VH < -22 dB) menembus awan, agar monitoring fase olah tanah dan transplanting tetap berjalan di musim hujan
26. Sebagai agronomist, saya ingin SAVI digunakan untuk membaca vegetasi muda (0-20 HST) alih-alih NDVI yang terganggu bias tanah, agar akurasi deteksi pertumbuhan awal lebih tinggi
27. Sebagai manajemen, saya ingin mengunduh laporan ringkasan kesehatan lahan per estate/divisi dalam format PDF yang auto-generate mingguan, agar bisa dipresentasikan di rapat manajemen
28. Sebagai manajemen, saya ingin mengeksport data time-series (NDVI, cuaca, GDD) ke Excel/CSV, agar tim analitik bisa melakukan pengolahan data tambahan
29. Sebagai manajemen, saya ingin melihat laporan prediksi panen (estimasi yield berdasarkan NDVI peak + GDD) untuk perencanaan distribusi, agar logistik pasca-panen bisa disiapkan
30. Sebagai manajemen, saya ingin melihat laporan penggunaan air dan rekomendasi irigasi, agar efisiensi penggunaan air bisa dioptimalkan
31. Sebagai manajemen, saya ingin membandingkan historis kinerja antar musim tanam untuk petak yang sama, agar evaluasi varietas dan praktik agronomis bisa berbasis data
32. Sebagai pengguna, saya ingin login ke sistem dengan email dan password, agar akses ke dashboard terautentikasi
33. Sebagai pengguna, saya ingin sesi login tetap aktif selama beberapa hari (JWT token), agar tidak perlu login berulang kali
34. Sebagai pengguna, saya ingin sidebar navigasi yang jelas menampilkan menu Dashboard, Peta, Admin, Laporan, agar navigasi antar fitur mudah
35. Sebagai admin, saya ingin membuat akun pengguna baru (max 3 user untuk saat ini), agar tim kecil bisa mengakses sistem
36. Sebagai estate manager, saya ingin mencatat musim tanam (planting season) baru untuk setiap petak, agar histori produksi per petak terlacak
37. Sebagai agronomist, saya ingin melihat koefisien Kc per fase dalam tabel referensi varietas, agar saya memahami parameter yang digunakan sistem dalam menghitung kebutuhan air
38. Sebagai agronomist, saya ingin menyesuaikan threshold alert per varietas/lokasi, agar aturan deteksi anomali sesuai kondisi spesifik lahan
39. Sebagai pengguna, saya ingin dashboard dimuat dalam waktu < 3 detik, agar pengalaman pengguna tetap responsif
40. Sebagai DevOps, saya ingin menjalankan seluruh stack (PostgreSQL, FastAPI, Next.js, Nginx) dalam satu Docker Compose, agar deployment di VPS sederhana
41. Sebagai DevOps, saya ingin scheduled job GEE/cuaca berjalan harian secara otomatis tanpa intervensi manual, agar data selalu terkini
42. Sebagai pengguna, saya ingin semua teks UI dalam bahasa Indonesia, agar platform mudah dipahami oleh tim di lapangan

## Implementation Decisions

### Tech Stack
- **Frontend:** Next.js (React, App Router) dengan Mapbox GL JS untuk peta dan Recharts untuk grafik
- **Backend:** Python FastAPI sebagai REST API server
- **Database:** PostgreSQL + PostGIS (single database untuk relasional, geospatial, dan time-series)
- **Satelit:** Google Earth Engine via `earthengine-api` Python SDK, autentikasi menggunakan Service Account JSON key
- **Cuaca:** Open-Meteo API (gratis, tanpa API key), historical + forecast 16 hari
- **Deployment:** Docker Compose di VPS Ubuntu/Debian (8-16GB RAM, 4-8 vCPU), reverse proxy Nginx

### Hierarki Data
- Multi-level organisasi: Company → Estate → Division → Plot
- Setiap Plot memiliki poligon geospatial (PostGIS geometry), atribut agronomis (crop_type, variety, planting_date), dan referensi ke musim tanam aktif
- Varietas tanaman disimpan sebagai tabel referensi dinamis (crop_varieties) dengan parameter per fase fenologi (phenology_phases): GDD target, Kc, NDVI expected range, NDRE threshold

### Schema Shape (dari prototype)
```
COMPANIES → ESTATES → DIVISIONS → PLOTS → PLANTING_SEASONS
                                       ↘ CROP_VARIETIES → PHENOLOGY_PHASES
PLOTS → SPECTRAL_INDICES (time-series per observation_date)
ESTATES → WEATHER_DATA (time-series per observation_date)
PLOTS → GDD_ACCUMULATION (time-series per observation_date)
PLOTS → ALERTS (event log)
```

### Data Pipeline (Harian, Scheduled)
1. **GEE Processor:** Query Sentinel-2 (NDVI, NDRE, NDWI, SAVI, BSI) dan Sentinel-1 (SAR VV/VH backscatter) per poligon petak, simpan nilai rata-rata per petak
2. **Weather Fetcher:** Ambil data Open-Meteo (Tmax, Tmin, RH, wind, solar radiation, rainfall) per koordinat estate, hitung ET₀ (FAO-56 Penman-Monteith)
3. **GDD Calculator:** Hitung GDD harian (dengan capping suhu untuk jagung) dan akumulatif, hitung ETc, prediksi fase dan tanggal panen
4. **Alert Engine:** Evaluasi 4 aturan threshold-based (stres N, stres air, hama, panen) per petak, generate alert records

### Indeks Spektral
- NDVI = (B8−B4)/(B8+B4)
- NDRE = (B8−B5)/(B8+B5)
- NDWI = (B8−B11)/(B8+B11)
- SAVI = (B8−B4)×(1+0.5)/(B8+B4+0.5)
- BSI = ((B11+B4)−(B8+B2))/((B11+B4)+(B8+B2))
- SAR flooding: σ⁰_VV < -15 dB or σ⁰_VH < -22 dB

### Agrometeorologi
- GDD Jagung: Tbase=10°C, cap Tmax at 30°C and Tmin at 10°C
- GDD Padi: Tbase=10°C, no capping
- ET₀ via FAO-56 Penman-Monteith (suhu, RH, radiasi solar, kecepatan angin)
- ETc = ET₀ × Kc (Kc lookup dari phenology_phases berdasarkan fase aktif)

### Alert Engine
- Threshold-based rules, customizable per varietas/lokasi
- 4 tipe: nitrogen_stress (kuning), water_stress (oranye), pest_anomaly (merah), harvest_ready (hijau_tua)
- Notifikasi: in-app (bell icon) + email untuk MVP

### Autentikasi
- Sederhana: email + password, JWT token, 3 user maximum untuk tahap awal
- Tidak perlu RBAC kompleks; semua user memiliki akses penuh ke semua fitur

### Frontend
- Peta interaktif Mapbox GL JS: draw polygon, NDVI heatmap overlay, citra satelit overlay, timeline slider
- Recharts untuk time-series chart (NDVI, NDRE, NDWI historis per petak)
- Tabel ringkasan petak dengan sorting/filtering
- Weather widget per estate
- Fase fenologi sebagai progress bar
- Semua teks dalam bahasa Indonesia

### Reporting
- PDF auto-generate: kesehatan lahan (mingguan), penggunaan air (mingguan)
- On-demand: export CSV/Excel time-series, prediksi panen, historis musim
- Scheduled: report mingguan auto-generate + simpan, bisa juga on-demand

## Testing Decisions

### Testing Philosophy
- Tes menguji perilaku eksternal (input → output), bukan detail implementasi internal
- Setiap vertical slice harus memiliki tes yang memverifikasi end-to-end behavior-nya
- Prioritaskan tes pada service layer (business logic) karena di sinilah formula dan aturan kritis berada

### Seams untuk Testing
- **Satu seam utama: API endpoints** — seluruh perilaku sistem bisa diverifikasi melalui HTTP request ke FastAPI endpoints dan respons JSON yang dikembalikan
- **Service layer** sebagai seam internal: GEE service, weather service, GDD service, dan alert service masing-masing bisa di-mock dependency eksternalnya (GEE API, Open-Meteo API) dan ditest unit terhadap formula/aturan
- **Database:** Gunakan PostgreSQL test database (bisa via Docker container terpisah) untuk integration test

### Yang Dites
- **Formula indeks spektral:** Unit test untuk NDVI, NDRE, NDWI, SAVI, BSI — input band values → output index value
- **GDD calculator:** Unit test GDD harian dan akumulatif — input suhu → output GDD, termasuk capping logic untuk jagung
- **ET₀ Penman-Monteith:** Unit test — input variabel cuaca → output ET₀, validasi terhadap contoh FAO-56
- **Alert engine rules:** Unit test — input indeks + cuaca → output alert/no-alert, per aturan
- **API integration tests:** Endpoint CRUD (company, estate, division, plot, variety) → respons HTTP dan data di DB
- **Frontend:** Tidak dites secara automated di MVP — validasi visual manual

## Out of Scope

- Mobile app (React Native / Flutter) — hanya web dashboard
- WhatsApp, push notification, SMS — ditunda ke v1.1+
- Machine learning anomaly detection / yield prediction — ditunda ke v2.0
- Model monetisasi / billing system
- Multi-language (English) — hanya bahasa Indonesia
- CI/CD pipeline — manual deploy
- Domain & SSL certificate — menggunakan IP address
- Sensor IoT lapangan — hanya data satelit dan cuaca API
- SSO / OAuth / MFA / RBAC enterprise

## Further Notes

- **GEE Service Account JSON key sudah dimiliki** — siap digunakan
- **Mapbox API key perlu didaftarkan** di mapbox.com (free tier: 50K map loads/bulan, cukup untuk tahap awal)
- **Sentinel-2 revisit time = 5 hari** — pada hari tanpa citra baru, sistem menggunakan data terakhir yang tersedia. Cloud masking penting untuk menghindari data buruk.
- **Sentinel-1 SAR tembus awan** — digunakan khusus untuk deteksi genangan pada fase olah tanah/transplanting padi di musim hujan
- **Skala fenologi:** Padi menggunakan adaptasi BBCH/IRRI (P0, V1, V2, V3, R1, R2, R3, R4, P1). Jagung menggunakan skala V-R (P0, VE-V2, V3-V5, V6-V8, V10-V14, VT/R1, R2-R4, R5-R6, P1).
- **Koefisien Kc** disimpan per fase dalam database, bukan hardcoded, agar bisa disesuaikan per varietas
- **Scheduler:** Karena deployment di VPS sendiri (bukan GCP managed), scheduler akan diimplementasikan menggunakan APScheduler di dalam proses FastAPI atau crontab Linux
