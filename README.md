# BCA IDX — Live Market Console

Dashboard pasar bergaya *sales console* untuk BCA IDX (BBCA.JK + saham-saham
bank besar IDX). Antarmuka murni HTML/CSS/JS tanpa framework, sementara angka
dijemput **langsung dari API pasar** lewat proxy server ini — lengkap dengan
splash **"Loading Data..."** berlogo saat web dibuka.

> **URL:**  🔗 <https://bca-idx.space-z.ai/>

---

## Tentang Proyek

BCA IDX Live Market Console menampilkan aktivitas transaksi harian BBCA yang
dipisah per **Sesi I (09.00–12.00 WIB)** dan **Sesi II (13.30–16.00 WIB)** bursa
IDX. Nilai transaksi harian = estimasi **harga × volume**. Seluruh data dijemput
dari **Yahoo Finance (v8 chart API, publik & tanpa API key)** melalui endpoint
proxy `/api/market` (Next.js route handler) yang mengagregasi data intrahari per
hari bursa. Bila API tidak terjangkau, dashboard jatuh ke **MODE SIMULASI**
(PRNG `mulberry32`) yang dilabeli jujur pada lencana status — tampilan tetap
hidup tanpa mengelabui pengguna.

## Fitur Utama

- **Splash "Loading Data..."** — layar pemuat berlogo `icon_web.svg` muncul
  seketika saat web dibuka dan memudar begitu data pertama siap.
- **Nilai Transaksi Harian — BBCA** — grafik SVG buatan sendiri (tanpa
  library) dengan dua seri (Sesi I / Sesi II) plus garis rata-rata, tooltip
  *hover*, dan animasi angka *hero* (harga terkini, volume, update kutipan,
  puncak harian).
- **Periode 7H / 30H / 90H** — sakelar periode hari bursa; permintaan yang
  datang saat masih memuat otomatis diantrekan.
- **Ringkasan Periode** — KPI nilai transaksi, total volume, harga penutupan,
  dan porsi Sesi I, lengkap dengan *sparkline* serta chip perubahan
  naik/turun vs periode sebelumnya.
- **Saham Bank Teraktif** — peringkat BBCA, BBRI, BMRI, BBNI, ARTO, BRIS,
  BBTN berdasar nilai transaksi periode terpilih.
- **Komposisi Sesi** — distribusi Sesi I vs Sesi II beserta perubahan poin
  persentase.
- **Kutipan Langsung** — *feed* kutipan BBCA yang diperbarui tiap 8 detik,
  dapat dijeda/lanjut lewat tombol pause.
- **Ekspor CSV / XLSX** — tombol *Download (CSV/XLSX)*:
  - **CSV** — pemisah `;`, UTF-8 + BOM, CRLF, angka uang murni — aman
    langsung dibuka di Excel locale Indonesia.
  - **XLSX** — workbook `.xlsx` asli berisi 5 sheet terpisah (lengkap dengan
    CRC32, ZIP STORE, dan XML worksheet yang dibangun manual di JavaScript,
    termasuk chart native Excel).
- **Jam & ticker** — jam real-time di header, *ticker* berjalan di bawahnya,
  dan lencana status sumber data (LIVE / SIMULASI / MEMUAT).

## Tumpukan Teknologi

| Lapisan  | Teknologi                                        |
| -------- | ------------------------------------------------ |
| Markup   | HTML5 (satu halaman, `lang="id"`)                |
| Gaya     | CSS murni (`src/styles.css`), font Google Fonts  |
| Logika   | JavaScript vanilla (ES2020), tanpa framework     |
| Grafik   | SVG yang dirender manual lewat DOM               |
| Data     | Yahoo Finance v8 chart API via `/api/market` (Next.js route handler, tanpa API key) |
| Ekspor   | Blob + data URI (CSV) dan ZIP/XML buatan sendiri (XLSX) |

## Menjalankan

- **Online** — buka <https://bca-idx.space-z.ai/> (mode LIVE penuh).
- **Lokal dengan data live (disarankan)** — dari folder proyek:

  ```bash
  npm run dev
  # lalu akses http://localhost:3000
  ```

  Server Next.js menyediakan endpoint `/api/market` sebagai proxy data.
- **Lokal tanpa server** — klik dua kali `index.html` (atau
  `python3 -m http.server 8000`). Dashboard tetap tampil, namun karena
  endpoint API tidak ada, beralih otomatis ke MODE SIMULASI.

## Struktur Proyek

```
/ (root proyek)
├── index.html               # Halaman utama dashboard (root) — mirror public/index.html
├── README.md                # Dokumen ini
├── logo/
│   └── icon_web.svg         # Logo & favicon (dipakai splash + header)
├── src/
│   ├── styles.css           # Seluruh gaya tampilan dashboard
│   └── app/
│       ├── main.js          # State, fetch API live, render chart & UI
│       ├── build-csv.js     # Modul ekspor CSV (Excel-ID friendly)
│       └── build-excel.js   # Modul ekspor XLSX (ZIP + XML manual)
├── public/                  # Web root yang disajikan server (mirror dari di atas)
│   ├── index.html
│   ├── logo/icon_web.svg
│   └── src/…
├── src/app/api/market/route.ts   # Endpoint /api/market — proxy Yahoo Finance
└── bca-idx-extract/         # Arsip proyek awal (sebelum di-online-kan)
```

## Catatan

- Nilai transaksi harian = **estimasi harga × volume** (konvensi pasar yang
  umum) — bukan laporan keuangan resmi BCA maupun IDX.
- Saat API offline, dashboard beralih ke MODE SIMULASI dan menandainya
  jelas pada lencana status; tidak ada data pribadi yang dikumpulkan.
- Ekspor mengikuti nama file otomatis berformat `dd-mm-yy_hh-mm-ss`.
- Seluruh render dan pembuatan file ekspor terjadi lokal di peramban Anda.
