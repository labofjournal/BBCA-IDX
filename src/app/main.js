/* ================================================================
   BCA IDX — Sales Console · MODE LIVE (ONLINE)
   main.js — versi online: data pasar real-time via API publik
   ----------------------------------------------------------------
   TERHUBUNG OTOMATIS saat halaman dibuka (tanpa konfigurasi).
   Sumber data (endpoint publik, CORS terbuka, tanpa registrasi):

     1. Kraken Public API          → riwayat harian & tick 24 jam
                                     BTC/USD dan PAXG/USD (emas token)
     2. ExchangeRate-API (open)    → kurs USD/IDR + silang EUR/SGD/JPY
     3. Gold-API                   → harga spot emas dunia XAU/USD

   Rantai cadangan (fallback otomatis):
     Kraken → Binance (data-api.binance.vision) → CoinGecko
     → mode simulasi offline (PRNG) bila semua API tak terjangkau.

   API KEY (OPSIONAL) — dashboard tetap LIVE tanpa key.
   Punya key pribadi? Isi kolom `apiKey` di LIVE_API di bawah;
   pola URL ber-key sudah disiapkan dan langsung dipakai otomatis:
     · ExchangeRate-API : https://v6.exchangerate-api.com/v6/<KEY>/latest/USD
     · CoinGecko        : header x-cg-demo-api-key / x-cg-pro-api-key
   ================================================================ */

const LIVE_API = {
    /* ---------- API KEY (opsional, boleh dibiarkan kosong) ---------- */
    erapiKey: '',      // contoh: 'isi-key-anda'  (exchangerate-api.com)
    coingeckoKey: '',  // contoh: 'CG-xxxxxxxx'   (coingecko.com)

    /* ---------- Tautan API (sudah terpasang langsung) ---------- */
    kraken: 'https://api.kraken.com/0/public',
    kurs: 'https://open.er-api.com/v6/latest/USD', // tanpa key: otomatis
    kursKeyed: 'https://v6.exchangerate-api.com/v6/{KEY}/latest/USD',
    gold: 'https://api.gold-api.com/price',
    binance: 'https://data-api.binance.vision/api/v3',
    coingecko: 'https://api.coingecko.com/api/v3',

    /* ---------- Pengaturan pembaruan ---------- */
    refreshMs: 60000,        // tick harga live tiap 60 detik
    seriesRefreshMs: 600000, // riwayat harian disegarkan tiap 10 menit
    timeoutMs: 12000
};

/* Skala volume model penjualan (Rp/hari) — pergerakan %-nya dari pasar nyata */
const SCALE_ONLINE = 30e6;  // kanal Online  ← sinyal harian BTC
const SCALE_STORE = 17e6;   // kanal Toko    ← sinyal harian PAXG (emas)

/* ============ katalog & wilayah ============ */
const CITIES = ['Jakarta', 'Bandung', 'Surabaya', 'Yogyakarta', 'Medan', 'Makassar', 'Denpasar', 'Semarang'];
const REGIONS = ['Jakarta', 'Surabaya', 'Bandung', 'Yogyakarta', 'Medan', 'Makassar', 'Denpasar'];
const PRODUCTS = [
    ['Kopi Gayo Premium', 118000],
    ['Batik Tulis Pekalongan', 425000],
    ['Kerajinan Rotan', 156000],
    ['Madu Hutan Murni', 98000],
    ['Teh Melati Grade A', 64000],
    ['Minyak Kelapa Virgin', 87000],
    ['Tenun Ikat Sumba', 680000],
    ['Keripik Singkong Balado', 28000]
];

/* ============ util dasar ============ */
const $ = s => document.querySelector(s);
const NF = new Intl.NumberFormat('id-ID');
const state = {
    days: 7,
    seed: Math.floor(Math.random() * 1e9),
    show: {
        online: true,
        store: true
    },
    paused: false,
    data: [],
    geo: null,
    todayRevenue: 0,
    ordersToday: 0,
    sessionTx: 0,
    txLog: [], // catatan semua transaksi sesi — ikut diekspor
    mode: 'connecting', // 'live' | 'live-cache' | 'sim'
    live: null,         // snapshot data pasar real-time
    series: null,       // riwayat harian mentah (BTC & PAXG)
    lastUpdate: null
};

/* PRNG berbasis seed — kini hanya dipakai untuk distribusi alokasi
   (produk/wilayah) dan sebagai mode fallback offline */
function mulberry32(a) {
    return function() {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

function fmtIDR(v) {
    if (v >= 1e9) return 'Rp ' + (v / 1e9).toLocaleString('id-ID', {
        maximumFractionDigits: 2
    }) + ' M';
    if (v >= 1e6) return 'Rp ' + (v / 1e6).toLocaleString('id-ID', {
        maximumFractionDigits: v < 1e7 ? 1 : 0
    }) + ' jt';
    if (v >= 1e3) return 'Rp ' + Math.round(v / 1e3) + ' rb';
    return 'Rp ' + NF.format(Math.round(v));
}
const fmtInt = v => NF.format(Math.round(v));
const fmtKurs = v => NF.format(Math.round(v));
const fmtPct = v => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';

/* angka yang "berjalan" naik/turun dengan easing */
function animateNumber(el, to, fmt, dur = 800) {
    const from = Number(el.dataset.raw || 0);
    el.dataset.raw = to;
    const t0 = performance.now();
    (function frame(t) {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(frame);
    })(t0);
}

const arrow = up => `<svg width="9" height="9" viewBox="0 0 10 10"><path d="M5 1.5 9 8H1z" fill="currentColor" transform="${up ? '' : 'rotate(180 5 5)'}"/></svg>`;

function setChip(el, pct, label) {
    const up = pct >= 0;
    el.innerHTML = `<span class="dchip ${up ? 'up' : 'down'}">${arrow(up)} ${Math.abs(pct).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span><span class="chip-note">${label}</span>`;
}

function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2850);
}

function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
    return m * p;
}

function sample(arr, m) {
    if (arr.length <= m) return arr;
    const step = arr.length / m,
        out = [];
    for (let i = 0; i < m; i++) out.push(arr[Math.floor(i * step)]);
    return out;
}

/* ================================================================
   LAPISAN DATA LIVE — koneksi ke API (otomatis, berantai fallback)
   ================================================================ */

async function fetchJSON(url, opt = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), LIVE_API.timeoutMs);
    try {
        const res = await fetch(url, { ...opt, signal: ctl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

/* ---------- 1. Kraken: riwayat harian (candle 1 hari) ---------- */
async function krakenOHLC(pair) {
    const r = await fetchJSON(`${LIVE_API.kraken}/OHLC?pair=${pair}&interval=1440`);
    if (r.error && r.error.length) throw new Error('Kraken: ' + r.error[0]);
    const key = Object.keys(r.result).find(k => k !== 'last');
    return r.result[key].map(c => ({
        t: c[0] * 1000,
        close: parseFloat(c[4])
    }));
}

/* ---------- 1b. Kraken: tick harga 24 jam ---------- */
async function krakenTicker(pairs) {
    const r = await fetchJSON(`${LIVE_API.kraken}/Ticker?pair=${pairs}`);
    if (r.error && r.error.length) throw new Error('Kraken: ' + r.error[0]);
    const out = {};
    for (const [k, v] of Object.entries(r.result)) {
        const o = parseFloat(v.o),
            last = parseFloat(v.c[0]),
            high = parseFloat(v.h[0]),
            low = parseFloat(v.l[0]);
        const item = { last, open: o, high, low, chg: (last / o - 1) * 100 };
        if (/XBT/i.test(k)) out.btc = item;
        else if (/ETH/i.test(k)) out.eth = item;
        else if (/PAXG/i.test(k)) out.paxg = item;
    }
    return out;
}

/* ---------- 2. Kurs (ExchangeRate-API) ---------- */
async function fetchKurs() {
    const url = LIVE_API.erapiKey
        ? LIVE_API.kursKeyed.replace('{KEY}', LIVE_API.erapiKey) // pola ber-key
        : LIVE_API.kurs;                                          // publik: otomatis
    const d = await fetchJSON(url);
    if (!d || !d.rates || !d.rates.IDR) throw new Error('Kurs tidak valid');
    return {
        usd: d.rates.IDR,
        eur: d.rates.IDR / d.rates.EUR,
        sgd: d.rates.IDR / d.rates.SGD,
        jpy: d.rates.IDR / d.rates.JPY,
        updated: d.time_last_update_utc || ''
    };
}

/* ---------- 3. Emas spot (Gold-API) ---------- */
async function fetchGold() {
    const d = await fetchJSON(`${LIVE_API.gold}/XAU`);
    if (!d || !d.price) throw new Error('Gold-API tidak valid');
    return { xau: d.price, updated: d.updatedAt || '' };
}

/* ---------- Fallback Binance (data-api.binance.vision) ---------- */
async function binanceSeries() {
    const q = s => fetchJSON(`${LIVE_API.binance}/klines?symbol=${s}&interval=1d&limit=120`);
    const [btc, paxg] = await Promise.all([q('BTCUSDT'), q('PAXGUSDT')]);
    const map = a => a.map(c => ({ t: c[0], close: parseFloat(c[4]) }));
    return { btc: map(btc), paxg: map(paxg) };
}

/* ---------- Fallback CoinGecko ---------- */
async function coingeckoSeries() {
    const h = LIVE_API.coingeckoKey ? { 'x-cg-demo-api-key': LIVE_API.coingeckoKey } : {};
    const q = id => fetchJSON(`${LIVE_API.coingecko}/coins/${id}/market_chart?vs_currency=usd&days=180`, { headers: h });
    const [btc, paxg] = await Promise.all([q('bitcoin'), q('pax-gold')]);
    const map = a => a.prices.map(p => ({ t: p[0], close: p[1] }));
    return { btc: map(btc), paxg: map(paxg) };
}

/* ---------- Muat seluruh data live (berantai) ---------- */
async function loadLiveSeries() {
    const tries = [
        async () => ({ btc: await krakenOHLC('XBTUSD'), paxg: await krakenOHLC('PAXGUSD'), src: 'Kraken' }),
        async () => ({ ...(await binanceSeries()), src: 'Binance' }),
        async () => ({ ...(await coingeckoSeries()), src: 'CoinGecko' })
    ];
    let lastErr;
    for (const fn of tries) {
        try {
            const s = await fn();
            if (!s.btc || s.btc.length < 8) throw new Error('seri terlalu pendek');
            return s;
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('semua sumber seri gagal');
}

async function loadLiveTicks() {
    const out = {};
    try {
        const tk = await krakenTicker('XBTUSD,ETHUSD,PAXGUSD');
        out.tickers = tk;
    } catch (e) { /* tick boleh gagal, seri tetap berlaku */ }
    try {
        out.kurs = await fetchKurs();
    } catch (e) {
        const c = readCache();
        if (c && c.kurs) out.kurs = c.kurs;
    }
    try {
        out.gold = await fetchGold();
    } catch (e) {
        const c = readCache();
        if (c && c.gold) out.gold = c.gold;
    }
    if (out.tickers && out.tickers.paxg) out.paxgTick = out.tickers.paxg;
    return out;
}

/* ---------- Cache lokal (tahan putus koneksi) ---------- */
const CACHE_KEY = 'bcaidx_live_cache_v1';
function writeCache() {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            ts: Date.now(),
            kurs: state.live && state.live.kurs,
            gold: state.live && state.live.gold
        }));
    } catch (e) { /* abaikan */ }
}
function readCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        return c && Date.now() - c.ts < 36e5 * 30 ? c : null; // berlaku 30 jam
    } catch (e) { return null; }
}

/* ---------- Status koneksi di header ---------- */
function setStatus(mode, detail) {
    state.mode = mode;
    const el = $('#liveBadge');
    if (!el) return;
    if (mode === 'live') {
        el.className = 'live-badge on';
        el.innerHTML = '<i class="dot"></i>LIVE';
        el.title = 'Data pasar real-time' + (detail ? ' · ' + detail : '');
    } else if (mode === 'live-cache') {
        el.className = 'live-badge on';
        el.innerHTML = '<i class="dot"></i>LIVE · cache';
        el.title = 'Menampilkan data tersimpan (API sedang tak terjangkau)';
    } else if (mode === 'connecting') {
        el.className = 'live-badge conn';
        el.innerHTML = '<i class="dot"></i>Menghubungkan…';
        el.title = 'Menyambungkan ke API pasar…';
    } else {
        el.className = 'live-badge off';
        el.innerHTML = '<i class="dot"></i>Simulasi offline';
        el.title = 'API tidak terjangkau — memakai simulasi (PRNG)';
    }
}

/* ---------- Bangun state.data dari seri pasar nyata ---------- */
function computeLiveSeries() {
    const s = state.series,
        live = state.live;
    if (!s || !s.btc) return;
    const n = Math.min(state.days, s.btc.length, s.paxg ? s.paxg.length : Infinity);
    const btc = s.btc.slice(-n),
        paxg = s.paxg ? s.paxg.slice(-n) : null;
    const bLast = btc[btc.length - 1].close;
    const gLast = paxg ? paxg[paxg.length - 1].close : bLast;
    const now = Date.now();
    state.data = btc.map((c, i) => {
        const online = SCALE_ONLINE * (c.close / bLast);
        let store;
        if (paxg) store = SCALE_STORE * (paxg[i].close / gLast);
        else store = SCALE_STORE * ((c.close / bLast) * (1 + 0.03 * Math.sin(i / 2.4)));
        return {
            date: new Date(c.t),
            online,
            store,
            total: online + store
        };
    });
    // snap 24 jam untuk hero & feed
    if (live && live.tickers) {
        const tk = live.tickers;
        state.live24 = {
            btc: tk.btc ? tk.btc.chg : 0,
            eth: tk.eth ? tk.eth.chg : 0,
            paxg: tk.paxg ? tk.paxg.chg : 0,
            btcDay: tk.btc || null
        };
    }
    state.lastUpdate = new Date();
}

/* ---------- Gerbang 24 jam: posisi harga hari ini (0..1) ---------- */
function dayProgress() {
    const d = state.live24 && state.live24.btcDay;
    if (!d || !(d.high > d.low)) return 0.5;
    return Math.min(1, Math.max(0, (d.last - d.low) / (d.high - d.low)));
}

/* ---------- pergerakan 7 hari nyata (untuk delta produk/wilayah) ---------- */
function realWeekMove(series) {
    if (!series || series.length < 8) return 0;
    const a = series[series.length - 8].close,
        b = series[series.length - 1].close;
    return (b / a - 1) * 100;
}

/* ============ data simulasi (fallback offline) ============ */
function genData() {
    const rng = mulberry32(state.seed + state.days * 1013);
    const n = state.days,
        now = Date.now(),
        out = [];
    for (let i = 0; i < n; i++) {
        const trend = 1 + 0.45 * i / Math.max(n - 1, 1);
        const wk = 1 + 0.13 * Math.sin(((i + 3) % 7) / 7 * Math.PI * 2);
        const wk2 = 1 + 0.10 * Math.sin(((i + 6) % 7) / 7 * Math.PI * 2);
        const online = 30e6 * trend * wk * (0.82 + rng() * 0.36);
        const store = 17e6 * trend * wk2 * (0.82 + rng() * 0.36);
        out.push({
            date: new Date(now - (n - 1 - i) * 864e5),
            online,
            store,
            total: online + store
        });
    }
    state.data = out;
}

/* ============ chart SVG ============ */
function renderChart() {
    const wrap = $('#chartWrap'),
        svg = $('#chartSvg');
    const W = wrap.clientWidth,
        H = 330;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const padL = 56,
        padR = 14,
        padT = 16,
        padB = 28;
    const innerW = W - padL - padR,
        innerH = H - padT - padB;
    const d = state.data,
        n = d.length;

    const vis = d.map(x => ({
        online: state.show.online ? x.online : 0,
        store: state.show.store ? x.store : 0
    }));
    vis.forEach(v => v.total = v.online + v.store);

    const yMax = niceCeil(Math.max(...vis.map(v => v.total), 1));
    const slot = innerW / n,
        barW = Math.min(slot * 0.6, 36);
    const y = v => padT + innerH * (1 - v / yMax);
    state.geo = {
        padL,
        slot,
        padT,
        innerH,
        yMax,
        W
    };

    let s = '';
    for (let k = 0; k <= 4; k++) {
        const vy = padT + innerH * (1 - k / 4);
        s += `<line class="gridline" x1="${padL}" y1="${vy}" x2="${W - padR}" y2="${vy}"/>`;
        s += `<text class="ax" x="${padL - 10}" y="${vy + 3.5}" text-anchor="end">${k ? fmtIDR(yMax * k / 4) : '0'}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 7));
    for (let i = 0; i < n; i++) {
        if (i % step === 0 || i === n - 1) {
            const lbl = d[i].date.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short'
            });
            s += `<text class="ax" x="${padL + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${lbl}</text>`;
        }
    }
    for (let i = 0; i < n; i++) {
        const x = padL + i * slot + (slot - barW) / 2,
            v = vis[i];
        let g = '';
        if (v.online > 0) {
            const h = v.online / yMax * innerH;
            g += `<rect class="b-on" x="${x.toFixed(1)}" y="${(padT + innerH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, h / 2).toFixed(1)}"/>`;
        }
        if (v.store > 0) {
            const h = v.store / yMax * innerH;
            const yTop = padT + innerH - (state.show.online ? v.online / yMax * innerH : 0) - h;
            g += `<rect class="b-st" x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, h / 2).toFixed(1)}"/>`;
        }
        s += `<g class="bar-g" style="animation-delay:${Math.round(i * 480 / n)}ms">${g}</g>`;
    }
    if (n >= 4) {
        const win = Math.min(7, Math.max(3, Math.round(n / 5)));
        const pts = vis.map((_, i) => {
            const a = vis.slice(Math.max(0, i - win + 1), i + 1);
            const m = a.reduce((s2, v) => s2 + v.total, 0) / a.length;
            return (padL + i * slot + slot / 2).toFixed(1) + ' ' + y(m).toFixed(1);
        });
        s += `<path class="ma-line" d="M${pts.join(' L ')}"/>`;
    }
    s += `<line class="xhair" x1="0" y1="${padT}" x2="0" y2="${padT + innerH}"/>`;
    for (let i = 0; i < n; i++) {
        s += `<rect class="hit" data-i="${i}" x="${(padL + i * slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${innerH}" fill="transparent"/>`;
    }
    svg.innerHTML = s;

    svg.querySelectorAll('.hit').forEach(r => {
        r.addEventListener('mouseenter', () => showTip(+r.dataset.i));
        r.addEventListener('mouseleave', hideTip);
    });
}

function showTip(i) {
    const {
        padL,
        slot,
        padT,
        innerH,
        yMax,
        W
    } = state.geo;
    const d = state.data[i],
        tip = $('#chartTip'),
        svg = $('#chartSvg');
    tip.innerHTML =
        `<div class="tt-date">${d.date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</div>` +
        `<div class="tt-row"><i class="sw on"></i>Online<b>${fmtIDR(d.online)}</b></div>` +
        `<div class="tt-row"><i class="sw st"></i>Toko<b>${fmtIDR(d.store)}</b></div>` +
        `<div class="tt-total">Total · ${fmtIDR(d.total)}</div>`;
    const cx = padL + i * slot + slot / 2;
    const top = padT + innerH * (1 - d.total / yMax);
    tip.style.left = Math.max(95, Math.min(W - 95, cx)) + 'px';
    if (top < 120) {
        tip.style.top = (top + 14) + 'px';
        tip.classList.add('below');
    } else {
        tip.style.top = (top - 8) + 'px';
        tip.classList.remove('below');
    }
    tip.classList.add('show');
    const xh = svg.querySelector('.xhair');
    xh.setAttribute('x1', cx);
    xh.setAttribute('x2', cx);
    xh.style.opacity = 1;
    svg.querySelectorAll('.bar-g').forEach((g, j) => g.style.opacity = j === i ? 1 : 0.35);
}

function hideTip() {
    $('#chartTip').classList.remove('show');
    const svg = $('#chartSvg');
    svg.querySelector('.xhair').style.opacity = 0;
    svg.querySelectorAll('.bar-g').forEach(g => g.style.opacity = '');
}

/* ============ KPI & sparkline ============ */
function sparkline(el, arr, color) {
    if (!arr.length) return;
    const w = 90,
        h = 30,
        min = Math.min(...arr),
        max = Math.max(...arr),
        r = (max - min) || 1;
    const pts = arr.map((v, i) =>
        `${(i / Math.max(1, arr.length - 1) * w).toFixed(1)},${(h - 3 - (v - min) / r * (h - 6)).toFixed(1)}`).join(' ');
    el.innerHTML = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
}

state.kpi = {};

function updateKPIs() {
    const d = state.data,
        n = d.length;
    const rev = d.reduce((a, x) => a + x.total, 0);

    /* nilai per transaksi & konversi merespons pergerakan pasar nyata */
    const b24 = (state.live24 && state.live24.btc) || 0;
    const aov = 245e3 * (1 + b24 / 100 * 0.35);

    /* delta pendapatan dari seri nyata (banding dua paruh periode) */
    const h = Math.max(1, n >> 1);
    const avg = a => a.reduce((s, x) => s + x.total, 0) / a.length;
    const first = avg(d.slice(0, h));
    const pct = first > 0 ? (avg(d.slice(h)) - first) / first * 100 : 0;

    const orders = Math.round(rev / aov);
    const conv = Math.min(5.5, Math.max(1.2, 2.2 + Math.abs(pct) / 6 + b24 / 200));

    state.kpi = {
        rev: Math.round(rev),
        orders,
        aov: Math.round(aov),
        conv: +conv.toFixed(1),
        dRev: pct,
        dOrd: pct * 0.9 + b24 * 0.1,
        dAov: b24 * 0.35,
        dCnv: (pct - b24 * 0.3) * 0.4
    };

    animateNumber($('#kRev'), rev, fmtIDR, 1000);
    animateNumber($('#kOrd'), orders, fmtInt, 1000);
    animateNumber($('#kAov'), aov, fmtIDR, 1000);
    animateNumber($('#kCnv'), conv, v => v.toLocaleString('id-ID', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }) + '%', 1000);

    setChip($('#dRev'), state.kpi.dRev, 'vs periode lalu');
    setChip($('#dOrd'), state.kpi.dOrd, 'vs periode lalu');
    setChip($('#dAov'), state.kpi.dAov, 'vs periode lalu');
    setChip($('#dCnv'), state.kpi.dCnv, 'vs periode lalu');

    const totals = d.map(x => x.total);
    sparkline($('#spRev'), sample(totals, 24), '#D14A1E');
    sparkline($('#spOrd'), sample(totals.map(x => x / aov), 24), '#1C1712');
    sparkline($('#spAov'), d.map(x => aov * (0.94 + 0.12 * (x.total / totals[totals.length - 1]) )), '#1C1712');
    sparkline($('#spCnv'), d.map(x => conv + (x.total / Math.max(...totals) - 0.5) * 0.8), '#1C1712');
}

/* ============ hero ============ */
function updateHero() {
    const d = state.data,
        last = d[d.length - 1],
        prev = d[d.length - 2] || last;
    /* posisi intraday nyata: seberapa jauh harga hari ini dari titik terendah */
    const prog = state.mode === 'live' || state.mode === 'live-cache' ? dayProgress() : 0.55 + Math.random() * 0.3;
    state.todayRevenue = last.total * (0.38 + 0.42 * prog);
    state.ordersToday = Math.max(1, Math.round(state.todayRevenue / (state.kpi.aov || 286e3)));
    animateNumber($('#revToday'), state.todayRevenue, fmtIDR, 900);
    $('#ordToday').textContent = fmtInt(state.ordersToday);
    $('#sessTx').textContent = state.sessionTx;

    /* chip delta: pergerakan pasar 24 jam nyata saat mode live */
    const isLive = state.mode === 'live' || state.mode === 'live-cache';
    const delta = isLive && state.live24 ? state.live24.btc : (state.todayRevenue / prev.total - 1) * 100;
    setChip($('#heroDelta'), delta, isLive ? 'vs kemarin · pasar' : 'vs kemarin');

    const peak = d.reduce((a, x) => x.total > a.total ? x : a, d[0]);
    $('#peakDay').innerHTML = `${fmtIDR(peak.total)}<span class="peak-date">${peak.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>`;
}

/* ============ produk & wilayah ============ */
/* Alokasi dihitung dari TOTAL pendapatan periode yang nyata;
   distribusi antar-item memakai bobot stabil per periode (model). */
state.products = [];
state.regions = [];

function renderProducts() {
    const rng = mulberry32(state.seed + state.days * 57);
    const idx = new Set();
    while (idx.size < 6) idx.add(Math.floor(rng() * PRODUCTS.length));
    const periodTotal = state.data.reduce((a, x) => a + x.total, 0);
    const wRaw = [...idx].map(() => 0.5 + rng());
    const wSum = wRaw.reduce((a, b) => a + b, 0);

    const btcWk = state.series ? realWeekMove(state.series.btc) : 0;
    const goldWk = state.series && state.series.paxg ? realWeekMove(state.series.paxg) : 0;

    state.products = [...idx].map((pi, k) => {
        const [name, price] = PRODUCTS[pi];
        const share = wRaw[k] / wSum;
        const rev = Math.round(periodTotal * share * 0.42); // produk teratas ≈ 42% penjualan
        const mix = k % 2 === 0 ? btcWk : goldWk;           // delta mengikuti pasar nyata
        return {
            name,
            rev,
            units: Math.max(1, Math.round(rev / price)),
            delta: mix * (0.55 + rng() * 0.5) + (rng() * 6 - 2),
            online: Math.round(55 + rng() * 35)
        };
    }).sort((a, b) => b.rev - a.rev);

    const max = state.products[0].rev;
    $('#prodList').innerHTML = state.products.map((p, i) => `
<div class="prod-row">
  <div class="prod-top">
    <span class="prod-name"><b class="rank">${String(i + 1).padStart(2, '0')}</b>${p.name}</span>
    <span class="mono prod-val">${fmtIDR(p.rev)}</span>
  </div>
  <div class="prod-meta">
    <span>${fmtInt(p.units)} unit · Online ${p.online}%</span>
    <span class="dchip ${p.delta >= 0 ? 'up' : 'down'}">${arrow(p.delta >= 0)} ${Math.abs(p.delta).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span>
  </div>
  <div class="track"><i style="width:${(p.rev / max * 100).toFixed(1)}%"></i></div>
</div>`).join('');
}

function renderRegions() {
    const rng = mulberry32(state.seed + 13);
    const periodTotal = state.data.reduce((a, x) => a + x.total, 0);
    const raw = REGIONS.map(() => 0.4 + rng());
    const sum = raw.reduce((a, b) => a + b, 0);
    const btcWk = state.series ? realWeekMove(state.series.btc) : 0;

    state.regions = REGIONS.map((name, i) => ({
        name,
        pct: raw[i] / sum * 100,
        delta: btcWk * (0.5 + rng() * 0.6) + (rng() * 8 - 3),
        rev: Math.round(periodTotal * raw[i] / sum)
    })).sort((a, b) => b.pct - a.pct);

    $('#regionList').innerHTML = state.regions.map(r => `
<div class="reg-row">
  <div class="reg-top">
    <span class="reg-name">${r.name}</span><i class="lead"></i>
    <span class="mono reg-pct">${r.pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span>
  </div>
  <div class="reg-sub">
    <span>${fmtIDR(r.rev)}</span>
    <span class="dchip ${r.delta >= 0 ? 'up' : 'down'}">${arrow(r.delta >= 0)} ${Math.abs(r.delta).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span>
  </div>
</div>`).join('');
}

/* ============ ticker (nilai pasar nyata) ============ */
function buildTicker() {
    let items = [];
    const live = state.live;

    if ((state.mode === 'live' || state.mode === 'live-cache') && live && live.kurs) {
        const k = live.kurs;
        const tk = (live.tickers || {});
        const fmtUsd = v => 'USD/IDR ' + fmtKurs(v);
        const row = (txt, chg, cls) =>
            `<span class="tk ${cls}">${chg === null ? '' : arrow(chg >= 0)} ${txt}${chg === null ? '' : ' ' + fmtPct(chg)}</span>`;

        items.push(`<span class="tk">KURS · ${k.updated ? 'REF ' + k.updated.slice(5, 16) : 'REF'}</span>`);
        items.push(row(fmtUsd(k.usd), null, ''));
        if (tk.btc) items.push(row('BTC ' + fmtKurs(tk.btc.last * k.usd), tk.btc.chg, tk.btc.chg >= 0 ? 'up' : 'down'));
        if (tk.eth) items.push(row('ETH ' + fmtKurs(tk.eth.last * k.usd), tk.eth.chg, tk.eth.chg >= 0 ? 'up' : 'down'));
        if (live.gold) {
            const gChg = tk.paxg ? tk.paxg.chg : null;
            items.push(row('EMAS ' + fmtKurs(live.gold.xau * k.usd), gChg, gChg === null ? '' : (gChg >= 0 ? 'up' : 'down')));
        }
        items.push(row('EUR/IDR ' + fmtKurs(k.eur), null, ''));
        items.push(row('SGD/IDR ' + fmtKurs(k.sgd), null, ''));
        items.push(row('JPY/IDR ' + k.jpy.toLocaleString('id-ID', { maximumFractionDigits: 2 }), null, ''));
        items.push(row('PAXG ' + (tk.paxg ? fmtKurs(tk.paxg.last * k.usd) : '—'), tk.paxg ? tk.paxg.chg : null, tk.paxg ? (tk.paxg.chg >= 0 ? 'up' : 'down') : ''));

        /* indeks komposit BCA-IDX — gabungan berbobot sinyal pasar nyata */
        const idxv = 100 * (1 + ((tk.btc ? tk.btc.chg : 0) * 0.6 + (tk.paxg ? tk.paxg.chg : 0) * 0.4) / 100);
        items.push(`<span class="tk ${idxv >= 100 ? 'up' : 'down'}">${arrow(idxv >= 100)} BCA-IDX ${idxv.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>`);
        items.push(`<span class="tk">JAM SESI 09.00–21.00 WIB</span>`);
    } else {
        /* mode offline — ticker simulasi (perilaku lama) */
        const rng = mulberry32(state.seed + 7);
        items = REGIONS.map(n => {
            const up = rng() > 0.32,
                v = rng() * 16 + 0.4;
            return `<span class="tk ${up ? 'up' : 'down'}">${arrow(up)} ${n.toUpperCase()} ${up ? '+' : '−'}${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span>`;
        });
        items.push(`<span class="tk up">${arrow(true)} BCA-IDX 214,8</span>`);
        items.push(`<span class="tk">JAM SESI 09.00–21.00 WIB</span>`);
    }

    const half = `<div class="tk-half">${items.join('')}</div>`;
    $('#tickerTrack').innerHTML = half + half;
}

/* ============ feed transaksi langsung ============ */
const icoPause = '<svg width="11" height="11" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg>';
const icoPlay = '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 1.8v8.4c0 .8.9 1.3 1.6.9l6.6-4.2c.6-.4.6-1.4 0-1.8L4.6.9C3.9.5 3 1 3 1.8z" fill="currentColor"/></svg>';

function pushTx(initial) {
    const p = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
    const qty = 1 + Math.floor(Math.random() * 3);
    /* nilai transaksi merespons pergerakan pasar 24 jam yang nyata */
    const mkt = 1 + ((state.live24 && state.live24.btc) || 0) / 100 * 0.15;
    const v = Math.round(p[1] * qty * mkt);
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const online = Math.random() < 0.68;
    const t = initial ? new Date(Date.now() - Math.random() * 36e5) : new Date();
    const time = t.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    state.txLog.push({
        time: t.toISOString(),
        product: p[0],
        city,
        channel: online ? 'Online' : 'Toko',
        qty,
        value: v
    });

    const li = document.createElement('div');
    li.className = 'feed-row' + (initial ? '' : ' new');
    li.innerHTML =
        `<span class="f-time mono">${time}</span>` +
        `<span class="f-main"><span class="f-name">${p[0]}</span>` +
        `<span class="f-meta mono">${city} · ${online ? 'Online' : 'Toko'} · ${qty} item</span></span>` +
        `<span class="f-val mono">${fmtIDR(v)}</span>`;
    const list = $('#feedList');
    list.prepend(li);
    while (list.children.length > 9) list.lastElementChild.remove();

    if (!initial) {
        state.sessionTx++;
        state.todayRevenue += v;
        state.ordersToday++;
        animateNumber($('#revToday'), state.todayRevenue, fmtIDR, 450);
        $('#ordToday').textContent = fmtInt(state.ordersToday);
        $('#sessTx').textContent = state.sessionTx;
        const el = $('#revToday');
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
    }
}

function feedLoop() {
    if (!state.paused) pushTx(false);
    setTimeout(feedLoop, 2200 + Math.random() * 2600);
}

function exportFileName(ext) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const dd = p(d.getDate()),
        mm = p(d.getMonth() + 1),
        yy = String(d.getFullYear()).slice(2);
    const hh = p(d.getHours()),
        mi = p(d.getMinutes()),
        ss = p(d.getSeconds());
    return `BCA_IDX_${dd}-${mm}-${yy}_${hh}-${mi}-${ss}.${ext}`;
}

function triggerDownload(blob, fname) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const exportWrap = $('#exportWrap'),
    exportMenu = $('#exportMenu');

function setMenu(open) {
    exportMenu.hidden = !open;
    exportWrap.classList.toggle('open', open);
    $('#exportBtn').setAttribute('aria-expanded', String(open));
}
$('#exportBtn').addEventListener('click', e => {
    e.stopPropagation();
    setMenu(exportMenu.hidden);
});
document.addEventListener('click', e => {
    if (!exportMenu.hidden && !exportWrap.contains(e.target)) setMenu(false);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !exportMenu.hidden) setMenu(false);
});
$('#optCsv').addEventListener('click', () => {
    setMenu(false);
    exportCSV();
});
$('#optXlsx').addEventListener('click', () => {
    setMenu(false);
    exportXLSX();
});

document.querySelectorAll('.seg button').forEach(b => {
    b.addEventListener('click', () => {
        if (state.days === +b.dataset.d) return;
        document.querySelectorAll('.seg button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.days = +b.dataset.d;
        refresh();
        toast(`Periode ${state.days} hari dimuat`);
    });
});

document.querySelectorAll('.lg[data-s]').forEach(b => {
    b.addEventListener('click', () => {
        const k = b.dataset.s;
        if (state.show[k] && (!state.show.online || !state.show.store) &&
            ((k === 'online' && !state.show.store) || (k === 'store' && !state.show.online))) return;
        state.show[k] = !state.show[k];
        b.classList.toggle('active', state.show[k]);
        renderChart();
    });
});

$('#pauseBtn').addEventListener('click', () => {
    state.paused = !state.paused;
    $('#pauseBtn').innerHTML = (state.paused ? icoPlay + '<span>Lanjut</span>' : icoPause + '<span>Jeda</span>');
    toast(state.paused ? 'Feed transaksi dijeda' : 'Feed transaksi dilanjutkan');
});

function tickClock() {
    const n = new Date();
    $('#clockDate').textContent = n.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    $('#clockTime').textContent = n.toLocaleTimeString('id-ID', {
        hour12: false
    });
}

function refresh() {
    if (state.mode === 'live' || state.mode === 'live-cache') {
        computeLiveSeries();
    } else {
        genData();
    }
    updateKPIs();
    renderChart();
    updateHero();
    renderProducts();
    renderRegions();
    buildTicker();
}

let rz;
window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(renderChart, 150);
});

/* ================================================================
   LOOP PEMBARUAN OTOMATIS (live)
   ================================================================ */
let tickTimer = null,
    seriesTimer = null;

function startTimers() {
    stopTimers();
    tickTimer = setInterval(async () => {
        if (state.paused || document.hidden) return;
        try {
            const t = await loadLiveTicks();
            Object.assign(state.live, t);
            if (t.kurs || t.gold) writeCache();
            buildTicker();
            updateKPIs();
            updateHero();
            const tm = state.lastUpdate && state.lastUpdate.toLocaleTimeString('id-ID', { hour12: false });
            setStatus(state.mode === 'live' ? 'live' : 'live-cache', 'pembaruan ' + (tm || ''));
        } catch (e) { /* biarkan mode saat ini */ }
    }, LIVE_API.refreshMs);

    seriesTimer = setInterval(async () => {
        if (document.hidden) return;
        try {
            state.series = await loadLiveSeries();
            computeLiveSeries();
            updateKPIs();
            renderChart();
            updateHero();
            renderProducts();
            renderRegions();
        } catch (e) { /* seri lama tetap dipakai */ }
    }, LIVE_API.seriesRefreshMs);
}

function stopTimers() {
    if (tickTimer) clearInterval(tickTimer);
    if (seriesTimer) clearInterval(seriesTimer);
    tickTimer = seriesTimer = null;
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (state.mode === 'live' || state.mode === 'live-cache')) {
        /* segarkan segera saat tab kembali aktif */
        if (state.series) refresh();
        if (!tickTimer) startTimers();
    }
});

/* ================================================================
   BOOT — sambungkan otomatis saat halaman dibuka
   ================================================================ */
function bootSim() {
    genData();
    renderProducts();
    renderRegions();
    updateKPIs();
    renderChart();
    updateHero();
    buildTicker();
}

(async function boot() {
    buildTicker();
    tickClock();
    setInterval(tickClock, 1000);
    $('#pauseBtn').innerHTML = icoPause + '<span>Jeda</span>';
    for (let i = 0; i < 6; i++) pushTx(true);
    setTimeout(feedLoop, 1600);

    setStatus('connecting');
    try {
        /* cache lama dipakai sebagai gambar awal (stale-while-revalidate) */
        const cached = readCache();
        state.live = {};
        if (cached) state.live = { kurs: cached.kurs, gold: cached.gold };

        const [series, ticks] = await Promise.all([
            loadLiveSeries(),
            loadLiveTicks().catch(() => ({}))
        ]);
        state.series = series;
        Object.assign(state.live, ticks);
        if (!state.live.kurs && cached) state.live.kurs = cached.kurs;
        if (!state.live.gold && cached) state.live.gold = cached.gold;
        if (state.live.kurs || state.live.gold) writeCache();

        /* status dipasang lebih dulu agar KPI/hero/ticker memakai jalur live */
        if (state.live.kurs) {
            setStatus('live', 'sumber: ' + series.src + ' · ExchangeRate-API · Gold-API');
        } else {
            setStatus('live-cache', 'sumber: ' + series.src + ' · kurs memakai cache');
        }

        computeLiveSeries();
        renderProducts();
        renderRegions();
        updateKPIs();
        renderChart();
        updateHero();
        buildTicker();
        startTimers();

        if (state.live.kurs) toast('Terhubung LIVE — data pasar real-time');
        else toast('LIVE (kurs dari cache) — sebagian API tak terjangkau');
    } catch (e) {
        bootSim();
        setStatus('off');
        toast('API tidak terjangkau — mode simulasi offline');
    }

    setTimeout(() => {
        if (state.mode === 'live') toast('Sumber live: Kraken · ExchangeRate-API · Gold-API');
    }, 4200);
})();
