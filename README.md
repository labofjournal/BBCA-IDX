# BCA IDX — Sales Dashboard (MODE LIVE / Online)

Dashboard penjualan bergaya *sales console* untuk BCA IDX — kini **terhubung
online**: angka pasar diambil **real-time dari API publik** begitu halaman
dibuka, tanpa konfigurasi apa pun.

> **URL:**  🔗 <https://labofjournal.github.io/BCA-IDX-Dashboard/>

---

## Mode Online (baru)

`src/app/main.js` kini memiliki lapisan data live. Saat halaman dibuka:

1. **Kraken Public API** — riwayat harian 120 hari + tick 24 jam untuk
   BTC/USD dan PAXG/USD (emas token) → membentuk seri pendapatan harian,
   chip delta, dan sebagian besar pergerakan KPI.
2. **ExchangeRate-API (open)** — kurs USD/IDR nyata + kurs silang
   EUR, SGD, JPY → men-drive nilai Rupiah pada ticker & konversi harga.
3. **Gold-API** — harga spot emas dunia XAU/USD → item **EMAS** di ticker.

Rantai cadangan otomatis bila satu sumber gagal:
**Kraken → Binance (data-api.binance.vision) → CoinGecko → simulasi offline**.
Status koneksi tampil sebagai badge di header:
`LIVE` (hijau berdenyut) · `LIVE · cache` · `Simulasi offline`.

### Cara kerja pemetaan data

- **Grafik Pendapatan Harian** — kanal *Online* mengikuti pergerakan harian
  nyata BTC; kanal *Toko* mengikuti PAXG (emas). Bentuk naik/turunnya 100%
  data pasar; levelnya diskalakan ke volume model penjualan
  (`SCALE_ONLINE` / `SCALE_STORE` di `main.js`).
- **Ticker** — USD/IDR, EUR/IDR, SGD/IDR, JPY/IDR, EMAS (XAU), BTC, ETH,
  PAXG, dan indeks komposit BCA-IDX: seluruhnya angka pasar nyata.
- **KPI, hero, produk, wilayah** — dihitung dari seri nyata yang sama;
  distribusi antar item memakai bobot stabil per periode (model).
- **Pembaruan otomatis** — tick harga tiap 60 detik, riwayat harian tiap
  10 menit, dijeda saat tab tidak aktif, cache `localStorage` tahan putus.

## API Key (opsional)

Dashboard **tetap LIVE tanpa key** — semua endpoint di atas publik & gratis.
Bila Anda memiliki key pribadi, cukup isi di bagian atas `src/app/main.js`:

```js
const LIVE_API = {
    erapiKey: '',      // ← key exchangerate-api.com (opsional)
    coingeckoKey: '',  // ← key CoinGecko demo/pro (opsional)
    ...
};
```

Pola URL ber-key sudah disiapkan otomatis:
`https://v6.exchangerate-api.com/v6/<KEY>/latest/USD` dan header
`x-cg-demo-api-key` untuk CoinGecko.

## Fitur Utama

- **Pendapatan Harian** — grafik SVG buatan sendiri (tanpa library) dengan
  dua seri (Online / Toko Fisik) plus garis rata-rata, tooltip *hover*, dan
  animasi angka *hero* (pendapatan hari ini, pesanan, transaksi sesi,
  puncak harian).
- **Periode 7H / 30H / 90H** — sakelar periode (riwayat nyata diambil
  sekali, dipotong lokal — tanpa permintaan ulang).
- **Ringkasan Periode** — KPI pendapatan, total pesanan, AOV, tingkat
  konversi, lengkap dengan *sparkline* dan chip perubahan naik/turun.
- **Produk Terlaris & Wilayah** — dialokasikan dari total pendapatan
  periode yang nyata.
- **Transaksi Langsung** — *feed* transaksi yang mengalir real-time,
  dapat dijeda/lanjut; nilai transaksi merespons pergerakan pasar 24 jam.
- **Ekspor CSV / XLSX** — CSV (pemisah `;`, UTF-8 + BOM, CRLF — aman Excel
  locale Indonesia) dan XLSX asli 5 sheet dengan chart native Excel.
- **Jam & ticker** — jam real-time dan *ticker* pasar berjalan.

## Tumpukan Teknologi

| Lapisan  | Teknologi                                        |
| -------- | ------------------------------------------------ |
| Markup   | HTML5 (satu halaman, `lang="id"`)                |
| Gaya     | CSS murni (`src/styles.css`), font Google Fonts  |
| Logika   | JavaScript vanilla (ES2020), tanpa framework     |
| Grafik   | SVG yang dirender manual lewat DOM               |
| Data     | Fetch API → Kraken, ExchangeRate-API, Gold-API (fallback: Binance, CoinGecko) |
| Ekspor   | Blob + data URI (CSV) dan ZIP/XML buatan sendiri (XLSX) |

## Menjalankan

Tidak ada proses *build*. Cukup salah satu dari:

```bash
# Opsi 1 — buka langsung
buka index.html di peramban (klik dua kali file-nya)

# Opsi 2 — lewat server statis (disarankan)
python3 -m http.server 8000
# lalu akses http://localhost:8000
```

> Menjalankan lewat `file://` tetap berfungsi — semua API di atas mengizinkan
> CORS dari origin apa pun. Bila jaringan memblokir keluar (outbound), badge
> otomatis berubah menjadi **Simulasi offline**.

## Struktur Proyek

```
BCA-IDX-Dashboard-main/
├── index.html          # Halaman utama dashboard
├── README.md           # Dokumen ini
├── logo/
│   └── icon_web.svg    # Logo & favicon
└── src/
    ├── styles.css      # Seluruh gaya tampilan (+ badge LIVE)
    └── app/
        ├── main.js         # State, lapisan API live, render chart & UI
        ├── build-csv.js    # Modul ekspor CSV (Excel-ID friendly)
        └── build-excel.js  # Modul ekspor XLSX (ZIP + XML manual)
```

## Catatan

- Pergerakan persentase, kurs, harga emas, dan harga kripto adalah **data
  pasar nyata** dari API di atas; level Rupiah pada panel penjualan adalah
  hasil penskalaan ke model toko — bukan laporan keuangan yang sebenarnya.
- Ekspor mengikuti nama file otomatis berformat `dd-mm-yy_hh-mm-ss`.
