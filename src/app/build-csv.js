/* ================================================================
   build-csv.js — modul ekspor CSV (rapi & konsisten)
   ----------------------------------------------------------------
   Prinsip:
     · Pemisah field : ";"   (aman untuk Excel locale Indonesia)
     · Encoding      : UTF-8 + BOM (agar Excel ID tidak salah baca)
     · Line ending   : CRLF
     · Escaping      : field yang memuat ";", '"', atau newline
                       dibungkus kutip-ganda; kutip-ganda di dalam
                       field di-double ("")
     · Angka uang    : ditulis sebagai angka murni (tanpa pemisah
                       ribuan) supaya dikenali Excel sebagai number
     · Persentase    : 1 desimal, koma (gaya Indonesia)
   Dipakai oleh main.js lewat tombol "Download (CSV/XLSX)".
   Membutuhkan (runtime): state, exportFileName, triggerDownload, toast
   ================================================================ */

/* Escape satu field CSV */
function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[";\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* Gabungkan array jadi satu baris CSV */
function csvRow(arr) {
  return arr.map(csvField).join(';');
}

/* Baris pemisah antar seksi */
const CSV_BLANK = '';

/* ============ EKSPOR CSV ============ */
function exportCSV() {
  const now = new Date();
  const num = v => Math.round(v);                                  // integer
  const pct = v => (Math.round(v * 10) / 10).toString().replace('.', ',');  // 1 desimal, koma

  const L = [];

  /* ---------- Metadata ---------- */
  L.push(csvRow([ 'BCA IDX — SALES CONSOLE' ]));
  L.push(csvRow([ 'Laporan', 'Data simulasi penjualan' ]));
  L.push(csvRow([ 'Diekspor', now.toLocaleString('id-ID') ]));
  L.push(csvRow([ 'Periode', `${state.days} hari terakhir` ]));
  L.push(CSV_BLANK);

  /* ---------- 1. Ringkasan ---------- */
  L.push(csvRow([ '1. RINGKASAN PERIODE' ]));
  L.push(csvRow([ 'Indikator', 'Nilai', 'Delta (%)' ]));
  L.push(csvRow([ 'Pendapatan periode (Rp)', num(state.kpi.rev), pct(state.kpi.dRev) ]));
  L.push(csvRow([ 'Total pesanan', num(state.kpi.orders), pct(state.kpi.dOrd) ]));
  L.push(csvRow([ 'Nilai per transaksi (Rp)', num(state.kpi.aov), pct(state.kpi.dAov) ]));
  L.push(csvRow([ 'Tingkat konversi (%)', pct(state.kpi.conv), pct(state.kpi.dCnv) ]));
  L.push(csvRow([ 'Pendapatan hari ini — live (Rp)', num(state.todayRevenue), '' ]));
  L.push(csvRow([ 'Pesanan hari ini — live', num(state.ordersToday), '' ]));
  L.push(csvRow([ 'Transaksi sesi ini', num(state.sessionTx), '' ]));
  L.push(CSV_BLANK);

  /* ---------- 2. Pendapatan Harian ---------- */
  L.push(csvRow([ '2. PENDAPATAN HARIAN' ]));
  L.push(csvRow([ 'No', 'Tanggal', 'Online (Rp)', 'Toko (Rp)', 'Total (Rp)' ]));
  let sumOn = 0, sumSt = 0, sumTot = 0;
  state.data.forEach((d, i) => {
    const o = num(d.online), s = num(d.store), t = num(d.total);
    sumOn += o; sumSt += s; sumTot += t;
    L.push(csvRow([ i + 1, d.date.toISOString().slice(0, 10), o, s, t ]));
  });
  L.push(csvRow([ '', 'TOTAL', sumOn, sumSt, sumTot ]));
  L.push(CSV_BLANK);

  /* ---------- 3. Produk Terlaris ---------- */
  L.push(csvRow([ '3. PRODUK TERLARIS' ]));
  L.push(csvRow([ 'Peringkat', 'Produk', 'Pendapatan (Rp)', 'Unit Terjual', 'Porsi Online (%)', 'Delta (%)' ]));
  state.products.forEach((p, i) => {
    L.push(csvRow([ i + 1, p.name, num(p.rev), p.units, num(p.online), pct(p.delta) ]));
  });
  L.push(CSV_BLANK);

  /* ---------- 4. Wilayah ---------- */
  L.push(csvRow([ '4. WILAYAH' ]));
  L.push(csvRow([ 'Wilayah', 'Porsi (%)', 'Pendapatan (Rp)', 'Delta (%)' ]));
  state.regions.forEach(r => {
    L.push(csvRow([ r.name, pct(r.pct), num(r.rev), pct(r.delta) ]));
  });
  L.push(CSV_BLANK);

  /* ---------- 5. Transaksi Sesi ---------- */
  L.push(csvRow([ '5. TRANSAKSI SESI' ]));
  L.push(csvRow([ 'No', 'Waktu', 'Produk', 'Kota', 'Kanal', 'Jumlah', 'Nilai (Rp)' ]));
  let sumTx = 0;
  state.txLog.forEach((t, i) => {
    sumTx += t.value;
    L.push(csvRow([ i + 1, t.time, t.product, t.city, t.channel, t.qty, num(t.value) ]));
  });
  L.push(csvRow([ '', 'TOTAL', '', '', '', '', sumTx ]));

  /* ---------- Tulis file ---------- */
  const fname = exportFileName('csv');
  triggerDownload(new Blob([ '\uFEFF' + L.join('\r\n') ], { type: 'text/csv;charset=utf-8' }), fname);
  toast(`Terunduh: ${fname}`);
}