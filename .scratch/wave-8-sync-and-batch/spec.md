# Spec: Wave 8 — Auto-Centroid Estate GPS, Historical Satellite Backfill & Multi-Placemark Batch Import

## Problem Statement

Setelah sukses mengimplementasikan impor berkas geospasial KML/KMZ/GeoJSON tunggal (Wave 7) untuk petak lahan individu (`Bengkok 1`), manajer perkebunan dan surveyor agribisnis menghadapi tiga tantangan operasional lanjutan saat adopsi skala penuh di lapangan:

1. **Koordinat Cuaca Kurang Presisi Saat Estate Belum Memiliki Titik GPS:**
   Ketika sebuah Estate baru dibuat tanpa input GPS manual oleh admin, sistem cuaca Open-Meteo dan kalkulator $ET_0$ tidak dapat menarik prakiraan iklim presisi mikro karena koordinat estate kosong (`null`). Petak lahan yang didaftarkan seharusnya dapat membagikan titik sentroid geospasialnya ke Estate induk secara otomatis.

2. **Ketiadaan Data Tren Historis pada Petak yang Baru Didaftarkan:**
   Petak baru yang didaftarkan dari KML hanya memiliki observasi satelit pada hari H pendaftaran. Akibatnya, agronomist tidak dapat langsung menganalisis laju pertumbuhan tanaman beberapa minggu sebelumnya, mendeteksi tren kekeringan masa lalu, atau melihat grafik time-series NDVI yang bermakna sebelum siklus observasi satelit berikutnya tiba. Diperlukan penarikan otomatis citra historis 30 hari ke belakang (*historical backfill*) begitu petak selesai didaftarkan.

3. **Infrastruktur KML Multi-Placemark (Folder Google Earth):**
   Pada kenyataannya, surveyor perkebunan memetakan satu hamparan afdeling yang memuat 5 hingga 50 petak sekaligus dalam satu berkas `.kml` atau `.kmz` tunggal (contohnya: `Blok_Utara.kml` berisi `Bengkok 1`, `Bengkok 2`, `Bengkok 3`, dst). Mengunggah berkas tersebut satu per satu secara manual sangat melelahkan. Pengguna membutuhkan antarmuka *Batch Import Wizard* yang membaca seluruh Placemark sekaligus, memvalidasi poligon massal, memberikan opsi tinjauan metadata per petak, dan mendaftarkannya ke PostGIS secara bersamaan (*bulk registration*).

## Solution

Mengembangkan platform sinkronisasi otomatis dan alur impor massal geospasial yang komprehensif:

1. **Auto-Centroid Estate Geolocation:**
   - Ketika petak lahan pertama kali didaftarkan di suatu Estate yang belum memiliki koordinat GPS, sistem secara otomatis menghitung titik sentroid poligon petak tersebut dan memperbarui koordinat `location_point` pada entitas Estate.
   - Segera memicu sinkronisasi cuaca Open-Meteo & $ET_0$ untuk koordinat presisi tersebut, sehingga seluruh petak di estate langsung menikmati data agroklimat akurat.

2. **Historical Satellite Telemetry Backfill (Sentinel-2 & Sentinel-1 30 Hari Kebelakang):**
   - Menambahkan pipeline penarikan telemetri satelit historis (GEE / baseline cadence 5 harian selama 30 hari terakhir) yang dieksekusi secara asinkron setelah petak tersimpan.
   - Mengisi tabel `spectral_indices` dengan runtun waktu NDVI, NDRE, NDWI, SAVI, BSI, dan SAR VV/VH kebelakang, sehingga saat pengguna diarahkan ke `/petak/{id}`, grafik visualisasi sudah menampilkan kurva pertumbuhan yang lengkap.

3. **Multi-Placemark Batch Import Wizard & Bulk PostGIS Registration:**
   - Memperluas parser KML/KMZ untuk mengekstrak seluruh elemen `<Placemark>` yang memiliki `<Polygon>` dalam berkas, mengembalikan daftar array poligon beserta nama masing-masing.
   - Menyediakan endpoint API `POST /api/plots/batch-import-preview` dan `POST /api/plots/batch-create`.
   - Antarmuka pengguna *Batch Import Wizard* di frontend yang menampilkan tabel tinjauan seluruh petak terdeteksi, visualisasi poligon multi-lahan di peta Mapbox sekaligus (*multi-polygon bounds framing*), pengisian cepat varietas & tanggal tanam massal, dan eksekusi pendaftaran sekali klik.

## User Stories

1. Sebagai estate manager, saya ingin koordinat Estate otomatis terisi dari titik tengah petak KML pertama yang didaftarkan, agar saya tidak perlu memasukkan titik koordinat GPS estate secara manual.
2. Sebagai estate manager, saya ingin cuaca 16 hari langsung otomatis tersinkronisasi begitu petak pertama terdaftar, agar kalkulasi evapotranspirasi langsung aktif tanpa jeda.
3. Sebagai agronomist, saya ingin melihat grafik tren indeks vegetasi (NDVI & NDRE) 30 hari ke belakang pada petak yang baru didaftarkan, agar saya dapat mengevaluasi dinamika pertumbuhan tanaman sebelum petak masuk sistem.
4. Sebagai agronomist, saya ingin data kadar air tajuk (NDWI) historis 30 hari tersedia otomatis, agar risiko kekeringan masa lalu langsung terpetakan.
5. Sebagai surveyor, saya ingin mengunggah berkas KML/KMZ yang memuat banyak petak sekaligus (multi-placemark), agar pemetaan seluruh kebun selesai dalam hitungan detik.
6. Sebagai surveyor, saya ingin melihat daftar seluruh petak yang terdeteksi dalam berkas multi-placemark beserta luas masing-masing dalam tabel preview interaktif.
7. Sebagai estate manager, saya ingin kamera Mapbox otomatis memuat seluruh poligon petak yang ada di dalam berkas KML multi-placemark (*fit all bounds*).
8. Sebagai estate manager, saya ingin dapat memilih varietas tanaman dan tanggal tanam yang sama untuk seluruh petak dalam batch atau menyesuaikannya per baris petak.
9. Sebagai surveyor, saya ingin dapat mengecualikan (*uncheck*) petak tertentu dari daftar batch sebelum menekan tombol simpan, agar petak yang belum valid tidak ikut tersimpan.
10. Sebagai admin sistem, saya ingin pendaftaran batch dieksekusi secara transaksional di database PostGIS, agar tidak terjadi inkonsistensi data jika salah satu petak gagal divalidasi.
11. Sebagai agronomist, saya ingin proses penarikan satelit historis berjalan di latar belakang tanpa memperlambat respon antarmuka pengguna saat pendaftaran petak.
12. Sebagai estate manager, saya ingin menerima notifikasi ringkasan sukses setelah batch import selesai, menampilkan jumlah petak yang berhasil didaftarkan dan total luas hektar keseluruhan.

## Implementation Decisions

1. **Auto-Centroid Update Transaksional:**
   - Pada alur pembuatan plot (`_handle_create_plot` dan `_handle_bulk_create_plots`), cek status `estate.location_point`. Jika null atau berstatus default, kalkulasi sentroid dari poligon petak yang masuk dan simpan ke `Estate` dalam satu transaksi database.
   - Pemicu sinkronisasi cuaca Open-Meteo langsung menggunakan koordinat baru tersebut.

2. **Pipeline Asinkron Satellite Backfill:**
   - Modul `satellite_backfill_service` menghasilkan titik-titik observasi satelit historis dengan interval 5 hari selama 30 hari ke belakang (6 titik observasi).
   - Nilai spektral dihitung secara realistis berdasarkan fase fenologi dan HST tanaman saat tanggal observasi tersebut (kurva sigmoid NDVI standar tanaman padi/jagung), atau melalui query GEE jika API GEE aktif.
   - Disimpan secara *bulk insert* ke tabel `spectral_indices`.

3. **Multi-Placemark Extraction Engine:**
   - Parser KML diperkaya dengan fungsi `parse_multi_kml_content(xml_content)` yang menelusuri seluruh tag `<Placemark>` yang memiliki poligon.
   - Mengembalikan list of objects: `[ { name, geometry, area_hectares, area_m2, bounding_box, centroid, vertex_count }, ... ]` beserta `total_plots`, `total_area_hectares`, dan `unified_bounding_box`.

4. **Batch Import UI Flow:**
   - Komponen modal / tab "Impor Massal (Batch KML)" pada `/admin/petak-baru` yang menampilkan:
     - Dropzone berkas multi-placemark.
     - Ringkasan statistik (contoh: "12 petak terdeteksi, total luas 18.5 Ha").
     - Tabel interaktif dengan checkbox aktif/non-aktif per petak.
     - Batch controls (Set semua varietas & tanggal tanam sekaligus).
     - Tombol "Daftarkan Semua Petak Terpilih".

## Testing Decisions

1. **Kriteria Pengujian yang Baik:**
   - Unit test menguji perilaku ekstraksi berkas KML multi-placemark tanpa ketergantungan database.
   - Uji verifikasi kalkulasi luas gabungan (*total area*) dan penggabungan bounding box (*unified bounding box*).
   - Uji integritas penarikan backfill satelit 30 hari menghasilkan tepat 6 data observasi interval 5 harian tanpa pelanggaran unique constraint `(plot_id, observation_date, satellite)`.
   - API test untuk endpoint `POST /api/plots/batch-import-preview` dan `POST /api/plots/batch-create`.
2. **Prior Art:**
   - Memperluas suite test di `tests/test_kml_parser.py` dan `tests/test_import_preview_api.py` dengan mock multi-placemark fixture.

## Out of Scope

- Konversi format Shapefile `.shp` langsung di browser (tetap melalui konversi KML/GeoJSON).
- Penyuntingan topologi verteks antar petak yang bertumpuk (*polygon snapping/clipping*).
- Penarikan satelit historis lebih dari 180 hari ke belakang (dibatasi 30 hari untuk efisiensi ketersediaan data siklus tanam aktif).

## Further Notes

- Fitur ini merupakan lompatan efisiensi signifikan bagi agribisnis skala enterprise yang memetakan perkebunan berkapasitas ratusan hektar dalam satu berkas KML Google Earth.
