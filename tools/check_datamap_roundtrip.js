// Data Mapping ↔ TFT 接線圖 正反推一致性矩陣（Bruce 10/12「Data 4 的 Line 1-1 也改 R1 就異常」「要去看所有的演算法有沒有矛盾的地方」）
// 用法：node tools/check_datamap_roundtrip.js [repo] [--hex <Bruce 匯入的 code>] [--quick]
// 寫法照 10/9 去偶發：jsdom 同步重畫，不固定等待。
//
// A. 表格層（common/datamap-core.js，全部型號 × 全部 Preset × 每格 × 每個選項）：
//    A1 選 N 讀回就是 N（pickCell → cellView）；A2 改一格不會改到其他格的名稱；A3 全部套用 N 後每格都是 N；
//    A4 全部套用後再個別改一格：該格＝新值、其他格仍＝全部套用的值。
// B. 接線圖層（datamap.html，型號 × Preset × Mirror／CHRB 各組合）：
//    B1 鎖定當下（沒改任何格）：每個主循環格「收到的資料」＝面板位置名稱（不出現 ≠）。
//    B2 鎖定 → 全部套用 X：主循環沒有任何格收到資料。
//    B3 鎖定 → 全部 X → 單一格選 N（每格 × 每個選項）：只有這格的接線目標收到資料，且收到的＝N（CHRB＝1 ⇒ R↔B；Mirror＝1 只比一致性）；
//       目標位置與 N 無關（由鎖定接線決定）。
//    B4 多格組合（同 Line 多個 Data、同 Data 多條 Line、整列同值、全部套用後再個別改）：每格收到的資料＝它單獨設定時的結果（互不干擾）。
//    B5 「只送 R1」亮的格子＝收到 R1 的格子。
//    B6 未鎖定、Mirror 0、CHRB 0：選 N ⇒ 接線圖上有一格位置名稱＝N 且收到 N（正推）。
// C. Bruce 10/12 實際流程（--hex 指定時）：匯入 → 鎖定 → 只送 R1 → 全部 X → Data3 L1-1＝R1 → Data4 L1-1＝R1。
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2);
const ROOT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '..'));
const HEX = args.indexOf('--hex') >= 0 ? args[args.indexOf('--hex') + 1] : null;
const QUICK = args.indexOf('--quick') >= 0, ALL = args.indexOf('--all') >= 0;
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));

let pass = 0, fail = 0; const fails = {};
const ok = (c, grp, m) => { if (c) { pass++; return true; } fail++; (fails[grp] = fails[grp] || []).push(m); return false; };
const cnt = {}, T0 = Date.now();
const tick = g => { cnt[g] = (cnt[g] || 0) + 1; };

const KEYS = DM.SELECT_KEYS.filter(k => DM.MODELS[k].kind !== 'en01');
function bases() {
  const out = [];
  const hand = (k, s) => (s.hand | 0) ? s : (DM.setHand(k, s, true) || s);
  /* 每列依序填不同名稱（下拉選單前 6 個非 X），當作鎖定基準 */
  const fill = (k, s) => { let t = s; for (let r = 0; r < 4; r++) { const o = optsOf(k, t, r, 0).filter(n => n !== 'X'); for (let c = 0; c < 6; c++) { const t1 = o.length ? pick(k, t, r, c, o[c % o.length]) : null; if (t1) t = t1; } } return t; };
  KEYS.forEach(k => {
    if (DM.MODELS[k].kind === 'mnt') {
      DM.PRESETS.forEach((p, i) => {
        const s = hand(k, DM.applyPreset(k, hand(k, DM.emptyState(k)), i));
        const g = DM.gateOf(k, s); if (g !== 'single' && g !== 'dual') return;
        out.push({ k, name: k + ' ' + p.name, s });
      });
    } else {
      ['Single-Gate', 'Dual-Gate'].forEach(gt => {
        const s0 = DM.setGate(k, hand(k, DM.emptyState(k)), gt); if (!s0) return;
        const s = fill(k, hand(k, s0)), g = DM.gateOf(k, s); if (g !== 'single' && g !== 'dual') return;
        out.push({ k, name: k + ' ' + gt, s });
      });
    }
  });
  return out;
}
const txt = (k, s, r, c) => { const v = DM.cellView(k, s, r, c); return v.blank ? null : (v.std ? v.txt : '0x' + DM.hex(v.raw, 2)); };
const names24 = (k, s) => { const o = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) o.push(txt(k, s, r, c)); return o; };
const optsOf = (k, s, r, c) => DM.cellOptions(k, s, r, c).map(o => o.name);
/* 和頁面 commit 一樣：第一組有改 ⇒ 第二組依循環判定（DM.firstEdit） */
const fe = (k, s0, s1) => (s1 ? DM.firstEdit(k, s0, s1).state : null);
const pick = (k, s, r, c, n) => { const x = DM.pickCell(k, s, r, c, n); return x ? fe(k, s, x.state) : null; };
const same = (k, s, n) => { const x = DM.allSame(k, s, n); return x ? fe(k, s, x.state) : null; };
/* 長循環（第二組獨立：line58／row34／pix58）：All Same Pixel 照 PY 只改主組 24 格；接線圖測試要隔離主組 ⇒ 第二組也清成 X（31） */
const sameX = (k, s) => { const x = same(k, s, 'X'); if (!x || DM.MODELS[k].kind !== 'mnt' || DM.secondPolicy(k, x) !== 'preserve') return x; const y = DM.cloneState(x); for (let i = 0; i < 24; i++) if (DM.fieldById(k, 'x' + i)) y['x' + i] = 31; return y; };
/* 主要格：主循環，或前循環（負編號位置，只有主循環的線接得到） */
/* DAZ（非 E50x）Single：③ 只畫 Line 1-1／2-1（pvModel srcRows＝0、2），Line x-2 那兩列不畫 ⇒ 接線圖檢查跳過 */
const dark = (k, s, r) => DM.MODELS[k].sem !== 'e50x' && DM.MODELS[k].kind !== 'mnt' && DM.gateOf(k, s) === 'single' && (r & 1) === 1;
const prim = x => x.ins.length > 0 && (x.tier === 'main' || /-\d+$/.test(x.pos));

/* ───────── A. 表格層 ───────── */
function partA(B) {
  B.forEach(b => {
    const { k } = b;
    const X = same(k, b.s, 'X'); if (!ok(!!X, 'A3', b.name + ' 全部 X 失敗')) return;
    ok(names24(k, X).every((n, i) => n === null || n === 'X' || !DM.cellView(k, X, i / 6 | 0, i % 6).editable), 'A3', b.name + ' 全部 X 後仍有非 X：' + names24(k, X).join(','));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const opts = optsOf(k, X, r, c); if (!opts.length) continue;
      opts.forEach(n => {
        [['X', X], ['base', b.s]].forEach(([tag, s0]) => {
          const before = names24(k, s0), s1 = pick(k, s0, r, c, n); tick('A1');
          if (!ok(!!s1, 'A1', b.name + ' ' + tag + ' r' + r + 'c' + c + ' 選 ' + n + ' 被拒')) return;
          ok(txt(k, s1, r, c) === n, 'A1', b.name + ' ' + tag + ' r' + r + 'c' + c + ' 選 ' + n + ' 讀回 ' + txt(k, s1, r, c));
          const after = names24(k, s1), ch = [];
          after.forEach((x, i) => { if (i !== r * 6 + c && x !== before[i]) ch.push('r' + (i / 6 | 0) + 'c' + (i % 6) + ' ' + before[i] + '→' + x); });
          /* e50x Single：PY 規則 1-2＝1-1（寫一格會連動複本那格），不算干擾 */
          const twin = DM.MODELS[k].sem === 'e50x' && DM.MODELS[k].kind !== 'mnt' && DM.gateOf(k, s0) === 'single' ? (r ^ 1) * 6 + c : -1;
          const real = ch.filter(x => x.indexOf('r' + (twin / 6 | 0) + 'c' + (twin % 6) + ' ') !== 0 || twin < 0);
          tick('A2'); ok(!real.length, 'A2', b.name + ' ' + tag + ' r' + r + 'c' + c + ' 選 ' + n + ' 連帶改到 ' + real.slice(0, 4).join('；'));
        });
      });
    }
    /* A3／A4：全部套用每個選項，再個別改一格 */
    DM.allSameOptions(k, b.s).forEach(n0 => {
      const S0 = same(k, b.s, n0); tick('A3'); if (!ok(!!S0, 'A3', b.name + ' 全部套用 ' + n0 + ' 失敗')) return;
      const nm = names24(k, S0);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        const v = DM.cellView(k, S0, r, c); if (v.blank || !v.editable) continue;
        const want = optsOf(k, S0, r, c).indexOf(n0) >= 0 ? n0 : 'X';
        ok(nm[r * 6 + c] === want, 'A3', b.name + ' 全部套用 ' + n0 + ' r' + r + 'c' + c + '＝' + nm[r * 6 + c]);
      }
      const r = 0, c = 3, opts = optsOf(k, S0, r, c);
      opts.forEach(n => { const s1 = pick(k, S0, r, c, n); tick('A4'); if (!s1) return ok(false, 'A4', b.name + ' 全部 ' + n0 + ' 後 r0c3 選 ' + n + ' 被拒');
        const a = names24(k, s1); ok(a[3] === n, 'A4', b.name + ' 全部 ' + n0 + ' 後 r0c3 選 ' + n + ' 讀回 ' + a[3]);
        const bad = a.map((x, i) => i !== 3 && x !== nm[i] && !(DM.MODELS[k].sem === 'e50x' && DM.MODELS[k].kind !== 'mnt' && DM.gateOf(k, S0) === 'single' && i === 9) ? i : -1).filter(i => i >= 0);
        ok(!bad.length, 'A4', b.name + ' 全部 ' + n0 + ' 後 r0c3 選 ' + n + ' 改到其他格 ' + bad.join(',')); });
    });
  });
}

/* A-EN01：EN01 自己的名稱表（每列 T 階數，原廠 GenDataMappingDefine）——選 N 讀回 N、不影響其他格、全部套用後再個別改 */
function partAEn01() {
  let s = DM.setHand('EN01', DM.emptyState('EN01'), true) || DM.emptyState('EN01');
  if (DM.en01Gate(s) === 'off') { s = DM.cloneState(s); s.hand = 1; s.deEn = 1; }
  const rows = DM.en01Rows(null);
  for (let T = 1; T <= 10; T++) {
    const tabs = []; for (let r = 0; r < 24; r++) tabs.push(T);
    const X = DM.en01AllSame(s, 'X', rows, tabs).state;
    const defs = DM.en01Defs(T).map(d => d.name);
    for (const r of rows) for (let c = 0; c < 12; c++) for (const n of defs) {
      const p = DM.en01Pick(X, r, c, T, n); tick('AEN01');
      if (!ok(!!p, 'AEN01', 'EN01 T' + T + ' r' + r + 'c' + c + ' 選 ' + n + ' 被拒')) continue;
      ok(DM.en01CellView(p.state, r, c, T).txt === n, 'AEN01', 'EN01 T' + T + ' r' + r + 'c' + c + ' 選 ' + n + ' 讀回 ' + DM.en01CellView(p.state, r, c, T).txt);
      let other = 0; for (const r2 of rows) for (let c2 = 0; c2 < 12; c2++) if ((r2 !== r || c2 !== c) && (p.state['e' + (r2 * 12 + c2)] | 0) !== (X['e' + (r2 * 12 + c2)] | 0)) other++;
      ok(!other, 'AEN01', 'EN01 T' + T + ' r' + r + 'c' + c + ' 選 ' + n + ' 連帶改到 ' + other + ' 格');
    }
    for (const n0 of DM.en01SameOptions(rows, tabs)) {
      const A = DM.en01AllSame(s, n0, rows, tabs).state; tick('AEN01');
      ok(rows.every(r => [...Array(12).keys()].every(c => DM.en01CellView(A, r, c, T).txt === n0)), 'AEN01', 'EN01 T' + T + ' 全部套用 ' + n0 + ' 讀回不一致');
      const p = DM.en01Pick(A, 0, 3, T, defs[0]); if (p) ok(DM.en01CellView(p.state, 0, 3, T).txt === defs[0] && DM.en01CellView(p.state, 0, 2, T).txt === n0, 'AEN01', 'EN01 T' + T + ' 全部 ' + n0 + ' 後個別改不一致');
    }
  }
}

/* ───────── B. 接線圖層 ───────── */
async function openPage() {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { ok(false, 'jsdom', e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change')); };
  return { w, d, $, fire };
}
function rects(d) {
  const o = [];
  d.querySelectorAll('#dm-pv-tft rect[data-pv]').forEach(r => {
    const pv = r.getAttribute('data-pv'), i = pv.indexOf(':');
    o.push({ k: +pv.slice(0, i), pos: pv.slice(i + 1), dn: r.getAttribute('data-dn'), tier: r.getAttribute('data-tier'), col: r.getAttribute('data-col'),
      ins: (r.getAttribute('data-in') || '').split(',').filter(Boolean), ne: !!(r.nextSibling && r.nextSibling.getAttribute && r.nextSibling.getAttribute('data-glne')) });
  });
  return o;
}
const recvOf = R => { const m = {}; R.forEach(x => { if (x.tier === 'main') m[x.k + ':' + x.pos] = x.dn; }); return m; };
const rbSwap = n => n.replace(/^[RB]/, x => (x === 'R' ? 'B' : 'R'));

async function partB(B, P) {
  const { w, d, $, fire } = P, S = w.dmState;
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  /* 只重畫 ③（dmRenderPv；整頁 render 在 jsdom 慢 10 倍）。換型號、鎖定、送圖模式仍走真正的 UI 事件（整頁重畫） */
  const show = s => { S.cur = DM.cloneState(s); (w.dmRenderPv || w.dmRender)(); };
  const lockOn = () => { if (S.glass) $('dm-pv-lock').click(); $('dm-pv-lock').click(); };
  const lockOff = () => { if (S.glass) $('dm-pv-lock').click(); };
  const col = c => d.querySelector('#dm-pv-colmode button[data-col="' + c + '"]').click();
  const variants = [];
  B.forEach(b => {
    const m = DM.fieldById(b.k, 'mirror'), cb = DM.fieldById(b.k, 'chrb');
    [0, 1].forEach(mi => [0, 1].forEach(ch => {
      if ((mi && !m) || (ch && !cb)) return;
      if (QUICK && (mi || ch)) return;
      const s = DM.cloneState(b.s); if (m) s.mirror = mi; if (cb) s.chrb = ch;
      variants.push({ k: b.k, name: b.name + (m ? ' mir' + mi : '') + (cb ? ' chrb' + ch : ''), s, mi: m ? mi : (b.s.mirror | 0), ch: cb ? ch : 0 });
    }));
  });
  let nv = 0;
  /* 分片平行跑：RT_SHARD=i/n（i 從 0 起）只跑第 i 片；A、C 只在第 0 片跑 */
  const SH = (process.env.RT_SHARD || '0/1').split('/').map(Number);
  const ONLY = process.env.RT_ONLY || '';
  for (const v of variants.filter((x, i) => i % SH[1] === SH[0] && (!ONLY || x.name.indexOf(ONLY) >= 0))) {
    setModel(v.k); lockOff(); show(v.s);
    if ($('dm-pvbody').classList.contains('hidden') || !d.querySelector('#dm-pv-tft rect[data-pv]')) continue;
    nv++; if (process.env.RT_PROGRESS) process.stderr.write('[' + nv + '/' + variants.length + '] ' + v.name + ' ' + ((Date.now() - T0) / 1000).toFixed(0) + 's\n');
    /* B6 未鎖定正推（Mirror 0、CHRB 0） */
    const X = sameX(v.k, v.s);
    if (!v.mi && !v.ch) {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) if (!dark(v.k, X, r, c)) optsOf(v.k, X, r, c).forEach(n => {
        if (n === 'X') return; show(pick(v.k, X, r, c, n)); tick('B6');
        const R = rects(d), hit = R.filter(x => prim(x) && x.dn === n);
        ok(hit.length && hit.every(x => x.pos === n), 'B6', v.name + ' 未鎖定 r' + r + 'c' + c + '＝' + n + ' ⇒ ' + (hit.map(x => x.k + ':' + x.pos).join(',') || '沒有任何格收到'));
      });
    }
    /* B1 鎖定當下 */
    show(v.s); lockOn();
    const R0 = rects(d), main0 = R0.filter(prim);
    tick('B1'); ok(main0.every(x => x.dn === x.pos), 'B1', v.name + ' 鎖定當下 ≠：' + main0.filter(x => x.dn !== x.pos).slice(0, 4).map(x => x.k + ':' + x.pos + '←' + x.dn).join(','));
    /* B2 全部 X */
    show(X); tick('B2');
    ok(rects(d).filter(x => prim(x) && x.dn && x.dn !== 'X').length === 0, 'B2', v.name + ' 全部 X 後仍有格收到資料');
    /* B3 單格 × 每個選項 */
    const single = {};   // r:c:n → {pos:dn}
    const tgt = {};      // r:c → 目標位置集合（與 N 無關）
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const opts = dark(v.k, X, r, c) ? [] : optsOf(v.k, X, r, c).filter(n => n !== 'X'); if (!opts.length) continue;
      /* 完整模式：Mirror 0／CHRB 0 每個選項都跑；Mirror／CHRB 變化每 5 個取 1 個＋R1（--all 全跑） */
      const sub = QUICK || ((v.mi || v.ch) && !ALL);
      const list = sub ? opts.filter((n, i) => i % 5 === 0 || n === 'R1') : opts;
      for (const n of list) {
        show(pick(v.k, X, r, c, n)); col('R1');
        const R = rects(d), got = {}; R.forEach(x => { if (prim(x) && x.dn && x.dn !== 'X') got[x.k + ':' + x.pos] = x.dn; });
        single[r + ':' + c + ':' + n] = got; tick('B3');
        const ks = Object.keys(got).sort().join(' ');
        if (tgt[r + ':' + c] === undefined) tgt[r + ':' + c] = ks;
        else ok(tgt[r + ':' + c] === ks, 'B3', v.name + ' r' + r + 'c' + c + ' 目標位置隨選項改變：' + n + ' ⇒ ' + ks + '（先前 ' + tgt[r + ':' + c] + '）');
        if (!v.mi) {
          const want = v.ch ? rbSwap(n) : n;
          if (!ok(Object.values(got).every(x => x === want), 'B3', v.name + ' 鎖定 r' + r + 'c' + c + ' 選 ' + n + ' 收到 ' + Object.entries(got).map(e => e[0] + '=' + e[1]).join(',')) && process.env.RT_DEBUG)
            console.log('DEBUG first=' + $('dm-pv-first').value + ' shift? ' + JSON.stringify(R.filter(x => x.ins.length && x.dn !== 'X').slice(0, 12).map(x => x.k + ':' + x.pos + '<' + x.dn + '>' + x.tier + '[' + x.ins + ']')));
        }
        /* B5 只送 R1 */
        tick('B5');
        const litBad = R.filter(x => x.col && ((x.col === 'on') !== (x.dn === 'R1' && x.ins.length > 0)));
        ok(!litBad.length, 'B5', v.name + ' r' + r + 'c' + c + '=' + n + ' 只送 R1 亮暗不一致：' + litBad.slice(0, 3).map(x => x.k + ':' + x.pos + '/' + x.dn + '/' + x.col).join(','));
        /* B5b（Bruce 10/12「只送 R1＝第一條 V line 由最上到最下的所有 R」）：輸入是每一列都送 R1，所以每一列都要各自判斷；
           ② 表格定義的列數（data-vper）以下的列是垂直重複，同一位置收到的資料與亮暗必須和第 (k mod 週期) 列相同 */
        const T = d.getElementById('dm-pv-tft'), vp = +(T.getAttribute('data-vper') || T.getAttribute('data-nl')), byKP = {};
        R.forEach(x => { byKP[x.k + ':' + x.pos] = x; });
        const vBad = R.filter(x => x.k > vp && x.ins.length).filter(x => { const y = byKP[(((x.k - 1) % vp) + 1) + ':' + x.pos]; return !y || y.dn !== x.dn || (y.col === 'on') !== (x.col === 'on'); });
        tick('B5'); ok(!vBad.length, 'B5', v.name + ' r' + r + 'c' + c + '=' + n + ' 垂直重複列與原列不一致：' + vBad.slice(0, 3).map(x => x.k + ':' + x.pos + '/' + x.dn + '/' + x.col).join(','));
        col('');
      }
    }
    /* B4 多格組合 */
    const expectOf = cells => { const e = {}; cells.forEach(([r, c, n]) => { Object.assign(e, single[r + ':' + c + ':' + n] || {}); }); return e; };
    const combo = (cells, tag, base) => {
      let s = base || X; for (const [r, c, n] of cells) { const s1 = pick(v.k, s, r, c, n); if (!s1) return; s = s1; }
      show(s); tick('B4');
      const got = {}; rects(d).forEach(x => { if (prim(x) && x.dn && x.dn !== 'X') got[x.k + ':' + x.pos] = x.dn; });
      const want = base ? null : expectOf(cells);
      if (want) {
        const a = JSON.stringify(Object.keys(got).sort().map(k => k + '=' + got[k])), b = JSON.stringify(Object.keys(want).sort().map(k => k + '=' + want[k]));
        ok(a === b, 'B4', v.name + ' ' + tag + '：得到 ' + a.slice(0, 200) + ' 應為 ' + b.slice(0, 200));
      }
      return got;
    };
    const has = (r, c, n) => single[r + ':' + c + ':' + n] !== undefined;
    const pickN = (r, c, pref) => { for (const n of pref) if (has(r, c, n)) return n; const o = optsOf(v.k, X, r, c).filter(n => n !== 'X'); return o.find(n => has(r, c, n)); };
    for (let r = 0; r < 4; r++) for (let c1 = 0; c1 < 6; c1++) for (let c2 = c1 + 1; c2 < 6; c2++) {
      const n1 = pickN(r, c1, ['R1']), n2 = pickN(r, c2, ['R1']); if (!n1 || !n2) continue;
      combo([[r, c1, n1], [r, c2, n2]], '同 Line r' + r + ' Data' + (c1 + 1) + '＝' + n1 + '＋Data' + (c2 + 1) + '＝' + n2);
      const m1 = pickN(r, c1, ['G2', 'B1']), m2 = pickN(r, c2, ['B2', 'R2']);
      if (m1 && m2) combo([[r, c1, m1], [r, c2, m2]], '同 Line r' + r + ' Data' + (c1 + 1) + '＝' + m1 + '＋Data' + (c2 + 1) + '＝' + m2);
    }
    for (let c = 0; c < 6; c++) for (let r1 = 0; r1 < 4; r1++) for (let r2 = r1 + 1; r2 < 4; r2++) {
      const n1 = pickN(r1, c, ['R1']), n2 = pickN(r2, c, ['R1', 'R5']); if (!n1 || !n2) continue;
      combo([[r1, c, n1], [r2, c, n2]], '同 Data' + (c + 1) + ' r' + r1 + '＝' + n1 + '＋r' + r2 + '＝' + n2);
    }
    for (let r = 0; r < 4; r++) { const cells = []; for (let c = 0; c < 6; c++) { const n = pickN(r, c, ['R1']); if (n) cells.push([r, c, n]); } if (cells.length > 1) combo(cells, '整列 r' + r + ' 同值'); }
    /* 全部套用 N0 後再個別改：其餘格＝全部套用 N0 單獨的結果，改的那格＝它單獨的結果 */
    for (const n0 of DM.allSameOptions(v.k, v.s).filter(n => n !== 'X').slice(0, QUICK ? 2 : 99)) {
      const A0 = same(v.k, v.s, n0); if (!A0) continue;
      show(A0); const g0 = {}; rects(d).forEach(x => { if (prim(x) && x.dn && x.dn !== 'X') g0[x.k + ':' + x.pos] = x.dn; });
      const r = 0, c = 3, n = pickN(r, c, ['R1']); if (!n) continue;
      const got = combo([[r, c, n]], '', A0), mine = single[r + ':' + c + ':' + n] || {};
      const want = Object.assign({}, g0); Object.keys(tgt[r + ':' + c] ? tgt[r + ':' + c].split(' ').filter(Boolean).reduce((o, q) => (o[q] = 1, o), {}) : {}).forEach(q => { delete want[q]; }); Object.assign(want, mine);
      const a = JSON.stringify(Object.keys(got || {}).sort().map(q => q + '=' + got[q])), b = JSON.stringify(Object.keys(want).sort().map(q => q + '=' + want[q]));
      ok(a === b, 'B4', v.name + ' 全部套用 ' + n0 + ' 後 Data4 L1-1＝' + n + '：得到 ' + a.slice(0, 160) + ' 應為 ' + b.slice(0, 160));
    }
    lockOff();
  }
  return nv;
}

/* ───────── C. Bruce 10/12 實際流程 ───────── */
async function partC(P) {
  const { w, d, $ } = P;
  w.dmImportBytes(new Uint8Array(fs.readFileSync(HEX)), path.basename(HEX));
  if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click();
  if (w.dmState.glass) $('dm-pv-lock').click();
  $('dm-pv-lock').click(); d.querySelector('#dm-pv-colmode button[data-col="R1"]').click();
  $('dm-samev').value = 'X'; $('dm-same').click();
  const sel = (r, c, v) => { const s = d.querySelector('#dm-grid select[data-r="' + r + '"][data-c="' + c + '"]'); s.value = v; s.dispatchEvent(new w.Event('change')); };
  const lit = () => rects(d).filter(x => x.col === 'on').map(x => x.k + ':' + x.pos + '=' + x.dn).sort();
  ok(lit().length === 0, 'C', '全部 X 後不應有亮格：' + lit());
  sel(0, 2, 'R1'); const L1 = lit();
  ok(L1.join(' ') === '1:B2=R1 3:B2=R1', 'C', 'Data3 L1-1＝R1 應亮 1:B2、3:B2，得到 ' + L1.join(' '));
  sel(0, 3, 'R1'); const L2 = lit();
  ok(L2.length === 4 && L1.every(x => L2.indexOf(x) >= 0) && L2.every(x => /=R1$/.test(x)), 'C', '再設 Data4 L1-1＝R1：原本兩格要保留且新增兩格，全部收到 R1；得到 ' + L2.join(' '));
  ok(rects(d).every(x => !x.dn || !/^R[37]$/.test(x.dn) || x.tier !== 'main'), 'C', '選 R1 不可變成 R3／R7');
  console.log('C  Bruce 流程：Data3 ⇒ ' + L1.join(' ') + '｜＋Data4 ⇒ ' + L2.join(' '));
}

(async () => {
  const t0 = Date.now();
  const B = bases(), SH0 = (process.env.RT_SHARD || '0/1').split('/')[0] === '0';
  if (SH0 && !process.env.RT_ONLY) { partA(B); partAEn01(); }
  console.log('A  表格層：' + B.length + ' 組（型號×Preset），A1 ' + (cnt.A1 || 0) + '、A2 ' + (cnt.A2 || 0) + '、A3 ' + (cnt.A3 || 0) + '、A4 ' + (cnt.A4 || 0) + ' 次；EN01 ' + (cnt.AEN01 || 0) + ' 次');
  const P = await openPage();
  const nv = await partB(QUICK ? B.filter((b, i) => i % 4 === 0) : B, P);
  console.log('B  接線圖層：' + nv + ' 組（含 Mirror／CHRB 變化），B1 ' + (cnt.B1 || 0) + '、B2 ' + (cnt.B2 || 0) + '、B3 ' + (cnt.B3 || 0) + '、B4 ' + (cnt.B4 || 0) + '、B5 ' + (cnt.B5 || 0) + '、B6 ' + (cnt.B6 || 0) + ' 次');
  if (HEX && SH0) await partC(await openPage());
  Object.keys(fails).forEach(g => { console.log('✗ ' + g + '：' + fails[g].length + ' 項'); fails[g].slice(0, 12).forEach(m => console.log('   ' + m)); });
  console.log((fail ? 'FAIL' : 'ALL PASS') + ' pass=' + pass + ' fail=' + fail + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  process.exit(fail ? 1 : 0);
})();
