#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_tri_tools.js — datamap v1.34.0：MNT Hand＋Tri 下的整批功能（Bruce 2026-10-15「all same pixel…benchmark 反推表…應該都要可以用才對」）
   A. 核心矩陣：EM01／EM02／E512 × RT7 (18)～(21) × Mirror 0/1 × CHRB 0/1 × FORCE_DE（Auto／one-hot 0x01~0x20／0x0E／0x1F）
      ・All Same Pixel：每個選項＋X ⇒ 36 格＝該名稱（該列沒有 ⇒ X），只改 force_sel、第二組 _1／_3＝0
      ・Excel：triExcelRows → xlsx → readXlsxRows → triExcelToNames → triApplyNames 讀回相同（隨機 6 列狀態）
      ・Pixel 範圍：deSelForPx(Tri) 選出的設定，範圍內每個 pixel 在 6 列都選得到；pxForDeSel 與 deSelForPx 互為反向
      ・EN01 的 Tri、MNT Single／Dual 的 Pixel 範圍公式不變
   B. 頁面（jsdom）：All Same 套 X／R1、Benchmark 6 列填格＋套用＋復原、Excel 匯出→匯入、Pixel 套用、鎖定＋只送紅＋CHWB
   用法：node tools/check_datamap_tri_tools.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), zlib = require('zlib');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
const XL = (function () { const c = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'common', 'xlsx.js'), 'utf8') + '\nthis.TCONXlsx = TCONXlsx;', c); return c.TCONXlsx; })();
const inflateRaw = async u8 => new Uint8Array(zlib.inflateRawSync(Buffer.from(u8)));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const MNT = DM.MNT_KEYS;
const TRI_PRESETS = DM.PRESETS.map((p, i) => ({ p, i })).filter(x => /^\((1[89]|2[01])\)/.test(x.p.name));
const DE = [{ en: 0, v: 0 }, { en: 1, v: 0x01 }, { en: 1, v: 0x02 }, { en: 1, v: 0x04 }, { en: 1, v: 0x08 }, { en: 1, v: 0x10 }, { en: 1, v: 0x20 }, { en: 1, v: 0x0E }, { en: 1, v: 0x1F }];
let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const triIds = () => DM.TRI_ROWS.flatMap(R => Array.from({ length: 6 }, (_, c) => R.f + (R.slot * 6 + c)));
const ZERO = ['x6', 'x7', 'x8', 'x9', 'x10', 'x11', 'x18', 'x19', 'x20', 'x21', 'x22', 'x23'];
function states(k) {
  const out = [];
  TRI_PRESETS.forEach(({ p, i }) => [0, 1].forEach(mi => [0, 1].forEach(cb => DE.forEach(de => {
    if (de.v && (de.v & ~((1 << DM.fieldById(k, 'deSel').bits) - 1))) return;
    let s = DM.emptyState(k); s.hand = 1; s = DM.applyPreset(k, s, i); s.mirror = mi; s.chrb = cb; s.deEn = de.en; if (de.en) s.deSel = de.v;
    if (DM.triOn(k, s)) out.push({ s, tag: k + ' ' + p.name.slice(0, 4) + ' M' + mi + ' C' + cb + ' de' + de.en + '/0x' + de.v.toString(16) });
  }))));
  return out;
}
const onlyIds = (k, a, b, allow) => DM.fieldsOf(k).filter(f => (a[f.id] | 0) !== (b[f.id] | 0)).every(f => allow.indexOf(f.id) >= 0);

(async () => {
  console.log('A. 核心矩陣');
  let nS = 0, nSame = 0, badSame = 0, nX = 0, badX = 0, nPx = 0, badPx = 0, nInv = 0, badInv = 0;
  for (const k of MNT) {
    const ST = states(k); nS += ST.length;
    for (const { s, tag } of ST) {
      /* All Same Pixel */
      const opts = DM.triAllSameOptions(k, s);
      if (opts[opts.length - 1] !== 'X' || opts.length < 2) { badSame++; console.log('    ' + tag + ' 選項 ' + opts.join(',')); }
      for (const n of opts) {
        nSame++;
        const r = DM.triAllSame(k, s, n), st = r && r.state;
        let good = !!st && r.text === n && onlyIds(k, s, st, triIds().concat(ZERO)) && ZERO.every(id => (st[id] | 0) === 0);
        if (good) for (let row = 0; row < 6; row++) {
          const has = DM.triCellOptions(k, s, row).some(o => o.name === n);
          for (let c = 0; c < 6; c++) { const v = DM.triCellView(k, st, row, c); if (v.txt !== (has ? n : 'X') || !v.inTable) good = false; }
        }
        if (!good) { badSame++; if (badSame < 5) console.log('    ' + tag + ' All Same ' + n + ' ✗'); }
      }
      ok(DM.triAllSame(k, s, 'R99').text === 'X', tag + '：表外名稱 ⇒ X');
      /* Excel round-trip（隨機 6 列） */
      for (let t = 0; t < 3; t++) {
        let st = s;
        for (let row = 0; row < 6; row++) for (let c = 0; c < 6; c++) { const o = DM.triCellOptions(k, st, row); st = DM.triPick(k, st, row, c, o[rnd(o.length)].name).state; }
        const rows = DM.triExcelRows(k, st), u8 = XL.build([{ name: 'Data Mapping', rows }]);
        const back = DM.triExcelToNames(await DM.readXlsxRows(u8, inflateRaw)); nX++;
        const ns = back.ok ? DM.triApplyNames(k, s, back.names) : null;
        const same = ns && triIds().concat(ZERO).every(id => (ns[id] | 0) === (st[id] | 0)) && DM.triNames(k, ns).join() === DM.triNames(k, st).join();
        if (!same) { badX++; if (badX < 5) console.log('    ' + tag + ' Excel ✗ ' + (back.reason || '')); }
      }
      /* Pixel 範圍 */
      for (let lo = -8; lo <= 12; lo++) for (let hi = lo; hi <= Math.min(12, lo + 8); hi++) {
        if (lo === 0 || hi === 0) continue;
        const r = DM.deSelForPx(k, s, lo, hi); nPx++;
        const ns = Object.assign(DM.cloneState(s), { deEn: 1, deSel: r.v });
        const cov = DM.pxForDeSel(k, ns);
        let good = cov && cov.base === r.base && cov.from === r.from && cov.to === r.to;
        if (good && !r.over) for (let row = 0; row < 6 && good; row++) {
          const names = DM.triCellOptions(k, ns, row).map(o => o.name);
          for (let p = lo; p <= hi; p++) if (p !== 0 && ['R', 'G', 'B'].some(ch => names.indexOf(ch + p) < 0)) good = false;
        }
        if (!good) { badPx++; if (badPx < 5) console.log('    ' + tag + ' Pixel ' + lo + '～' + hi + ' ✗ ' + JSON.stringify(r) + ' ' + JSON.stringify(cov)); }
      }
    }
    /* 反向：每個 one-hot 起始欄的涵蓋範圍套回去得到同一欄 */
    for (let c = 1; c <= DM.fieldById(k, 'deSel').bits; c++) {
      const s = Object.assign(states(k)[0].s, { deEn: 1, deSel: 1 << (c - 1) }), cv = DM.pxForDeSel(k, s); nInv++;
      if (cv.from > cv.to) continue;
      const r = DM.deSelForPx(k, s, cv.from, cv.to);
      if (r.over) badInv++;
    }
  }
  ok(nS >= 300, 'Tri 狀態數 ' + nS);
  ok(!badSame, 'All Same Pixel ' + nSame + ' 次（錯 ' + badSame + '）');
  ok(!badX, 'Excel 匯出→xlsx→匯入 ' + nX + ' 次讀回相同（錯 ' + badX + '）');
  ok(!badPx, 'Pixel 範圍 ' + nPx + ' 組：設定可反算、範圍內每列都選得到（錯 ' + badPx + '）');
  ok(!badInv, '起始欄涵蓋範圍 ' + nInv + ' 組可再套回（錯 ' + badInv + '）');
  /* 非 Tri 不變 */
  let sdBad = 0, sdN = 0;
  /* v1.33.0 的公式（pxCovIdx 非 Tri 分支）：起始欄 c ⇒ [2(c+mntRel(gate,1))−10, 2c−1] */
  const idx = i => i >= 0 ? i + 1 : i;
  const sdCases = [];
  for (const k of MNT) for (const g of ['Single-Gate', 'Dual-Gate']) sdCases.push([k, DM.setGate(k, Object.assign(DM.emptyState(k), { hand: 1 }), g)]);
  DM.EN01_GATES.forEach(G => sdCases.push(['EN01', DM.setGate('EN01', DM.setHand('EN01', DM.emptyState('EN01'), 1), G[0])]));
  for (const [k, s0] of sdCases) for (let c = 1; c <= DM.fieldById(k, 'deSel').bits; c++) {
    const s = Object.assign(DM.cloneState(s0), { deEn: 1, deSel: 1 << (c - 1) }), rel = DM.mntRel(DM.gateOf(k, s), 1), cv = DM.pxForDeSel(k, s); sdN++;
    if (!cv || cv.from !== idx(2 * (c + rel) - 10) || cv.to !== idx(2 * c - 1)) { sdBad++; console.log('    ' + k + ' ' + DM.gateOf(k, s) + ' c' + c + ' ' + JSON.stringify(cv)); }
    for (let lo = -8; lo <= 10; lo += 3) { const r = DM.deSelForPx(k, s, lo, lo + 4); const rr = DM.pxCovIdx(r.base, DM.gateOf(k, s)); if (r.from !== idx(rr[0]) || r.to !== idx(rr[1])) sdBad++; }
  }
  ok(sdN > 60 && !sdBad, 'MNT Single／Dual、EN01 各 Gate 的 Pixel 範圍仍是 v1.33.0 公式 ' + sdN + ' 組（錯 ' + sdBad + '）');
  ok(DM.triAllSame('EM02', DM.setGate('EM02', Object.assign(DM.emptyState('EM02'), { hand: 1 }), 'Dual-Gate'), 'X') === null && DM.triApplyNames('EM02', DM.emptyState('EM02'), new Array(36).fill('X')) === null, 'Single／Dual／Hand off 時 Tri 函式不動作');

  console.log('B. 頁面');
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; console.log('  ✗ jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; w.DecompressionStream = DecompressionStream; w.Response = Response; w.Blob = Blob; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), hid = id => $(id).classList.contains('hidden');
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const page = () => DM.triNames(w.dmState.cur ? 'EM02' : '', w.dmState.cur);
  const dl = []; w.URL.createObjectURL = b => { dl.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
  for (const k of MNT) {
    fire('dm-model', k);
    let s = DM.emptyState(k); s.hand = 1; s = DM.applyPreset(k, s, TRI_PRESETS[3].i);
    w.dmState.cur = s; w.dmState.xTouched = false; w.dmRender();
    const tn = () => DM.triNames(k, w.dmState.cur).join(' ');
    /* All Same */
    ok(!$('dm-same').disabled && !$('dm-samev').disabled && Array.from($('dm-samev').options).some(o => o.value === 'X'), k + ' All Same Pixel 可用');
    fire('dm-samev', 'X'); $('dm-same').click();
    ok(tn() === new Array(36).fill('X').join(' ') && d.querySelectorAll('#dm-trigrid select').length === 36 && Array.from(d.querySelectorAll('#dm-trigrid select')).every(e => e.value === 'X'), k + ' All Same X：36 格全 X（表格也顯示 X）');
    fire('dm-samev', 'R1'); $('dm-same').click();
    ok(Array.from(d.querySelectorAll('#dm-trigrid select')).every(e => e.value === 'R1') && w.dmState.xTouched, k + ' All Same R1：36 格 R1（含 Line x-3）');
    ok(w.dmBuildScript().text.indexOf('write -m ' + DM.hex(DM.fieldById(k, 'x0').parts[0][0], 4)) >= 0, k + ' All Same 後 script 含 Line 1-3（force_sel_r2_0）');
    /* Benchmark */
    w.dmState.cur = s; w.dmRender(); w.dmBench.clear(); w.dmBench.open(true);
    ok(!hid('dm-bench') && $('dm-bgrid').dataset.kind === 'tri' && d.querySelectorAll('#dm-bgrid tbody tr').length === 6 && w.dmBench.cells(w.dmState.cur).length === 36, k + ' Benchmark 6 列 36 格');
    const want = {}; let ws = s;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { const o = DM.triCellOptions(k, s, r).filter(x => x.name !== 'X'); const n = o[(r * 7 + c * 5) % o.length].name; want[r + '-' + c] = n; }
    for (const key in want) { const [r, c] = key.split('-').map(Number); w.dmBench.pick(r, c, want[key]); ws = DM.triPick(k, ws, r, c, want[key]).state; }
    ok(Object.keys(w.dmBench.names()).length === 36 && $('dm-bt5-5').value === want['5-5'], k + ' Benchmark 36 格填入、表格顯示（Line 2-3 Data 6＝' + $('dm-bt5-5').value + '）');
    const before = DM.cloneState(w.dmState.cur), ar = w.dmBench.apply(false);
    ok(ar && ar.n === 36 && !ar.bad.length && tn() === DM.triNames(k, ws).join(' ') && triIds().concat(ZERO).every(id => (w.dmState.cur[id] | 0) === (ws[id] | 0)), k + ' Benchmark 套用到主表：36 格與反推表相同（含 Line x-3）');
    w.dmBench.undo();
    ok(triIds().every(id => (w.dmState.cur[id] | 0) === (before[id] | 0)), k + ' Benchmark 復原');
    w.dmBench.clear(); w.dmBench.open(false);
    fire('dm-gate', 'Dual-Gate'); w.dmBench.open(true);
    ok($('dm-bgrid').dataset.kind === 'py' && d.querySelectorAll('#dm-bgrid tbody tr').length === 4, k + ' 切回 Dual：Benchmark 回 4 列');
    w.dmBench.open(false);
    /* Excel 匯出 → 匯入 */
    w.dmState.cur = ws; w.dmRender(); $('dm-glass').value = 'TRI';
    dl.length = 0; $('dm-expx').click();
    const blob = dl[0]; ok(!!blob, k + ' Export Excel 有下載');
    if (blob) {
      const u8 = new Uint8Array(await blob.arrayBuffer()), rows = await DM.readXlsxRows(u8, inflateRaw);
      ok(rows.filter(r => /^Line \d-\d$/.test(r[0])).map(r => r[0]).join('|') === 'Line 1-1|Line 1-2|Line 1-3|Line 2-1|Line 2-2|Line 2-3', k + ' 匯出 6 列 Line 1-1～2-3');
      w.dmState.cur = s; w.dmRender();
      await w.dmImportExcel(u8, 'tri.xlsx');
      ok(tn() === DM.triNames(k, ws).join(' ') && triIds().every(id => (w.dmState.cur[id] | 0) === (ws[id] | 0)), k + ' 匯入回來 36 格相同');
    }
    /* Pixel 範圍 */
    w.dmState.cur = s; w.dmRender();
    ok(!hid('dm-pxrow') && !$('dm-pxapply').disabled, k + ' Pixel 列顯示可套用');
    $('dm-pxlo').value = 1; $('dm-pxhi').value = 5; $('dm-pxapply').click();
    const pr = DM.deSelForPx(k, s, 1, 5);
    ok(w.dmState.cur.deEn === 1 && w.dmState.cur.deSel === pr.v && !pr.over, k + ' Pixel 1～5 → FORCE_DE_SEL 0x' + DM.hex(pr.v, 2));
    /* 鎖定＋只送紅＋CHWB */
    w.dmState.cur = s; w.dmRender();
    $('dm-pv-lock').click();
    ok($('dm-pv-lock').getAttribute('data-locked') === '1' && $('dm-pv-lockst').getAttribute('data-ok') === '36/36', k + ' 鎖定：' + $('dm-pv-lockst').getAttribute('data-ok'));
    d.querySelector('#dm-pv-colmode button[data-col="R"]').click();
    const cells = () => Array.from(d.querySelectorAll('#dm-tftbody svg [data-col]'));
    const onR = cells().filter(e => e.getAttribute('data-col') === 'on').length, all = cells().length;
    ok(all > 0 && onR > 0 && onR < all, k + ' 只送紅：亮 ' + onR + '／' + all);
    const f = $('f-chwb'); if (f) { f.checked = true; f.dispatchEvent(new w.Event('change')); }
    const onC = cells().filter(e => e.getAttribute('data-col') === 'on').length;
    ok(f && w.dmState.cur.chwb === 1 && onC === all - onR && cells().some(e => e.getAttribute('data-chwb') === '1'), k + ' CHWB＝1 反相：亮 ' + onC + '／' + all);
    if (f) { f.checked = false; f.dispatchEvent(new w.Event('change')); }
    w.dmTriPick(0, 0, DM.triCellOptions(k, w.dmState.cur, 0).filter(o => o.name !== DM.triCellView(k, w.dmState.cur, 0, 0).txt && o.name !== 'X')[0].name);
    ok($('dm-pv-lockst').getAttribute('data-ok') === '35/36', k + ' 鎖定後改 1 格：35/36');
    $('dm-pv-lock').click();
  }
  console.log('Tri 工具：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
