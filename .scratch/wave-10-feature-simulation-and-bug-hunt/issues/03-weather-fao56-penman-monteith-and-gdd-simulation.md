# 03: Worker 3 — Simulasi Engine Cuaca Open-Meteo, Evapotranspirasi FAO-56 & Akumulasi GDD

**What to test & simulate:**
Melakukan simulasi mendalam pada modul agrometeorologi dan model bio-fisik tanaman:
1. Uji integrasi Open-Meteo client: penanganan rate limiting, network timeout, format respons tidak lengkap (missing solar radiation, wind speed null).
2. Validasi rumus Evapotranspirasi Standar FAO-56 Penman-Monteith:
   - Persamaan tekanan uap jenuh dan aktual ($e_s, e_a$).
   - Radiasi netto ($R_n$) dan fluks panas tanah ($G$).
   - Konstanta psikrometrik ($\gamma$) dan gradien tekanan uap ($\Delta$).
   - Uji batas matematis: radiasi matahari = 0 (malam hari), RH = 100% ($e_s = e_a$), kecepatan angin = 0 m/s.
3. Simulasi perhitungan Growing Degree Days (GDD) dan fase fenologi:
   - GDD Padi: $T_{base} = 10^\circ	ext{C}$.
   - GDD Jagung: $T_{base} = 10^\circ	ext{C}, T_{opt} = 30^\circ	ext{C}, T_{max} = 34^\circ	ext{C}$.
   - Uji kondisi iklim ekstrem: suhu minimum < 10°C, suhu maksimum > 40°C, tanggal tanam lampau (> 150 HST), dan tanggal tanam di masa depan.
4. Edge cases & bug hunting: Pembagian dengan nol pada rumus Penman-Monteith, akumulasi GDD negatif, dan inkonsistensi penetapan fase pertumbuhan.

**Blocked by:** None (Worker 3 dapat langsung berjalan).

**Status:** ready-for-agent

- [ ] Bangun skrip simulasi `test_sim_weather_fao56_gdd.py` yang memuat skenario cuaca normal, ekstrem dingin, ekstrem panas, dan cuaca ekstrem basah.
- [ ] Audit numerik rumus FAO-56 Penman-Monteith terhadap kemungkinan ZeroDivisionError atau nilai tak terhingga (inf/nan).
- [ ] Uji transisi fase fenologi tanaman (Vegetatif Awal -> Pembungaan -> Pematangan) berdasarkan target akumulasi GDD.
- [ ] Uji penanganan tanggal tanam anomali (tanggal masa depan atau tanggal lebih dari 1 tahun lalu).
- [ ] Dokumentasikan temuan bug matematis dan rekomendasi perbaikan formula.
