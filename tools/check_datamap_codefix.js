#!/usr/bin/env node
/* check_datamap_codefix.js — datamap v1.35.21（派工 236884173342228480）矩陣測試
   1) MNT R-3～R-6：LOD.tName 與 DM.codeIdx（② 表格同一換算）在第 1～15 欄 × code −1～31 逐格相同；
      wiringFromState（Auto 接線換算）在 EM01／EM02／E512 × Single／Dual／Tri × FORCE_DE_SEL 1～63 × Mirror × CHRB × code 0～29 全部 ok，
      每條 Data 線的 subpixel 位置＝DM.codeIdx(起始欄＋gate, code)（round-trip：名稱 linName(idx) ＝ ② mntName）。
   2) NB e50x 起始欄單一來源：E501A／E501B／E503／DAZ6138／DAZ6139 × Single／Dual × FORCE_DE_EN 0/1 × FORCE_DE_SEL 0～15 × deRev 0/1 × Mirror 0/1：
      ② 名稱起始欄（rowDict）＝tWin.base＝pxForDeSel.base＝deSelTs(nbSel)[0]；Pixel 範圍＝② 每列可選名稱的 pixel 交集；
      每格下拉每個名稱 pickCell → cellView 讀回同名（round-trip）。
   3) 預設不變：E503 Hand、FORCE_DE_SEL 14 ⇒ 第 2 欄、Single -6～4、Dual -4～4；--old <舊 datamap-core.js 目錄> 時，舊版兩邊一致的組合新版結果必須與舊版相同。
   用法：node tools/check_datamap_codefix.js [repo] [--old <dir>] */
'use strict';
const path = require('path');
const args = process.argv.slice(2);
const ROOT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '..'));
const oi = args.indexOf('--old'), OLD = oi >= 0 ? path.resolve(args[oi + 1]) : null;
const DM = require(path.join(ROOT, 'common', 'datamap-core.js'));
const LOD = require(path.join(ROOT, 'common', 'datamap-lod.js'));
const AU = require(path.join(ROOT, 'common', 'datamap-auto.js'));
let pass = 0, fail = 0; const bad = {};
const ok = (c, tag, m) => { if (c) pass++; else { fail++; bad[tag] = (bad[tag] || 0) + 1; if (bad[tag] <= 3) console.log('  ✗ [' + tag + '] ' + m); } };
const cnt = {};
const tick = t => { cnt[t] = (cnt[t] || 0) + 1; };

/* ── 1a tName ≡ codeIdx */
for (let T = 1; T <= 15; T++) for (let code = -1; code <= 31; code++) { tick('1a'); const a = LOD.tName(T, code), b = code < 0 ? null : DM.codeIdx(T, code); ok(a === b, '1a', 'T' + T + ' code ' + code + ' tName=' + a + ' codeIdx=' + b); }

/* ── 1b wiringFromState（MNT Hand） */
const MNT = ['EM01', 'EM02', 'E512'], GATES = { single: 1, dual: 2, tri: 3 };
for (const m of MNT) {
  const bits = (DM.fieldById(m, 'deSel') || { bits: 6 }).bits;
  for (const g of Object.keys(GATES)) for (let ds = 1; ds < (1 << bits); ds++) for (const mir of [0, 1]) for (const chrb of [0, 1]) for (let code = 0; code < 30; code++) {
    tick('1b');
    const s = DM.emptyState(m); s.hand = 1; s.panel = g === 'single' ? 0 : (g === 'dual' ? 2 : 3); s.rd = g === 'tri' ? 2 : (g === 'dual' ? 1 : 0);
    s.deEn = 1; s.deSel = ds; s.mirror = mir; s.chrb = chrb;
    for (let i = 0; i < 24; i++) { s['c' + i] = code; s['x' + i] = code; }
    const gg = DM.gateOf(m, s); if (gg !== g) { ok(false, '1b-gate', m + ' ' + g + ' gateOf=' + gg); continue; }
    const w = AU.wiringFromState(m, s, false, g);
    ok(w.ok, '1b', m + ' ' + g + ' de_sel 0x' + ds.toString(16) + ' mir' + mir + ' chrb' + chrb + ' code ' + code + ' → ' + JSON.stringify(w.why));
    if (!w.ok) continue;
    const base = DM.mntBaseT(s, g).t;
    /* 第一列第 gi 條 gate 的 Data 1：位置＝codeIdx(base+gi, code)（CHRB 時 R↔B；Single 不加 gate） */
    const r0 = w.t.rows[0];
    for (let gi = 0; gi < r0.length; gi++) {
      let want = DM.codeIdx(base + (g === 'single' ? 0 : gi), code);
      if (chrb) { const px = Math.floor(want / 3), c = want - 3 * px; want = 3 * px + (c === 0 ? 2 : c === 2 ? 0 : 1); }
      ok(r0[gi][0] === want, '1b-idx', m + ' ' + g + ' gate' + gi + ' code ' + code + ' got ' + r0[gi][0] + ' want ' + want);
      if (!chrb && g !== 'tri') ok(DM.linName(r0[gi][0]) === DM.mntName(g, gi, code, mir, base), '1b-name', m + ' ' + g + ' name ' + DM.linName(r0[gi][0]) + ' vs ' + DM.mntName(g, gi, code, mir, base));
    }
  }
}

/* ── 2 NB e50x */
const NB = ['E501A', 'E501B', 'E503', 'DAZ6138', 'DAZ6139'];
function nameCol(key, s, g, row) {   // ② 名稱的起始欄：code 6 在第 c 欄＝位置 6(c−1)−6 ⇒ c＝idx/6＋2；下 gate 列再減 1
  const d = DM.rowDictOf ? null : null; const nm = DM.codeName(key, s, row, g, 6); const idx = DM.linIdx(nm);
  return idx / 6 + 2 - DM.mntRel(g, row);
}
function rowPx(key, s, g, row) { let a = Infinity, b = -Infinity; for (let v = 0; v < 30; v++) { const n = DM.codeName(key, s, row, g, v); const p = DM.linIdx(n); if (p === null) continue; const q = Math.floor(p / 3); a = Math.min(a, q); b = Math.max(b, q); } return [a, b]; }
const px1 = i => i >= 0 ? i + 1 : i;
let oldDM = null; if (OLD) { delete require.cache[require.resolve(path.join(OLD, 'datamap-core.js'))]; oldDM = require(path.join(OLD, 'datamap-core.js')); }
let oldSame = 0, oldDiffFixed = 0;
for (const m of NB) for (const g of ['single', 'dual']) for (const en of [0, 1]) for (let ds = 0; ds < 16; ds++) for (const rev of [0, 1]) for (const mir of [0, 1]) {
  tick('2');
  const s = DM.emptyState(m); s.hand = 1; s.panel = g === 'single' ? 0 : 2; s.rd = g === 'single' ? 0 : 1; s.deEn = en; s.deSel = ds; if (rev) s.deRev = 1; s.mirror = mir;
  if (DM.gateOf(m, s) !== g) { ok(false, '2-gate', m + ' ' + g); continue; }
  const want = DM.deSelTs(DM.nbSel(m, s), 4)[0];
  const cN = nameCol(m, s, g, 0), W = DM.tWin(m, s), P = DM.pxForDeSel(m, s);
  const tag = m + ' ' + g + ' en' + en + ' 0x' + ds.toString(16) + ' rev' + rev + ' mir' + mir;
  ok(cN === want && P && P.base === want, '2-col', tag + ' name ' + cN + ' px ' + (P && P.base) + ' want ' + want);
  /* tWin＝FORCE_DE_SEL 輸入框旁說明（描述暫存器本身的值）：頁面到得了的狀態（FORCE_DE_EN＝1，且 deRev＋值≠0 或值＝0xE）要和名稱同一欄 */
  if (en && (rev ? ds !== 0 : ds === 0xE)) ok(W.base === want, '2-twin', tag + ' tWin ' + W.base + ' want ' + want);
  if (g === 'dual') ok(nameCol(m, s, g, 1) === want, '2-col-low', tag + ' lower ' + nameCol(m, s, g, 1));
  /* Pixel 範圍＝各列名稱交集 */
  let lo = -Infinity, hi = Infinity; for (let r = 0; r < (g === 'dual' ? 2 : 1); r++) { const q = rowPx(m, s, g, r); lo = Math.max(lo, q[0]); hi = Math.min(hi, q[1]); }
  ok(P && P.from === px1(lo) && P.to === px1(hi), '2-px', tag + ' px ' + (P && P.from) + '~' + (P && P.to) + ' names ' + px1(lo) + '~' + px1(hi));
  /* round-trip：下拉每個名稱 → pickCell → 讀回 */
  /* deRev＋FORCE_DE_EN＝0＋Hand 開：頁面到不了（手改／套用都經 pyNormalize 寫 deEn＝Hand），下一次 pyNormalize 會把 deEn 改 1 ⇒ 起始欄合法地改變，不算 round-trip */
  if (!(rev && !en)) for (let row = 0; row < 4; row++) { const opts = DM.cellOptions(m, s, row, 0); for (const o of opts) { tick('2-rt'); const r = DM.pickCell(m, s, row, 0, o.name); const back = r ? DM.cellView(m, r.state, row, 0).txt : null; ok(r && back === o.name, '2-rt', tag + ' row' + row + ' ' + o.name + ' → ' + back); } }
  if (oldDM) {
    const oN = (() => { const nm = oldDM.codeName(m, s, 0, g, 6); return oldDM.linIdx(nm) / 6 + 2; })();
    const oPs = oldDM.cloneState(s); oPs.deEn = 1; oPs.deSel = s.deRev ? (s.deSel | 0) : 0xE;   // 舊頁面 nbDeSelNow
    const oP = oldDM.pxForDeSel(m, oPs);
    if (oP && oN === oP.base) { oldSame++; ok(oN === cN && oP.from === P.from && oP.to === P.to, '3-old', tag + ' old ' + oN + ' ' + oP.from + '~' + oP.to + ' new ' + cN + ' ' + P.from + '~' + P.to); }
    else oldDiffFixed++;
  }
}

/* ── 3 預設 */
for (const m of ['E503', 'E501A', 'DAZ6138']) {
  const s = DM.emptyState(m); s.hand = 1; s.deEn = 1; s.deSel = 0xE;
  const a = DM.pxForDeSel(m, s); ok(a.base === 2 && a.from === -6 && a.to === 4, '3-def', m + ' Single 14 → ' + a.base + ' ' + a.from + '~' + a.to);
  const d = DM.cloneState(s); d.panel = 2; d.rd = 1; const b = DM.pxForDeSel(m, d); ok(b.base === 2 && b.from === -4 && b.to === 4, '3-def', m + ' Dual 14 → ' + b.from + '~' + b.to);
  const r = DM.deSelForPx(m, s, -2, 4); ok(r.v === 14, '3-def', m + ' Pixel -2~4 → ' + r.v);
  const n = DM.pyNormalize(m, DM.cloneState(s)); ok(n.deSel === 0xE, '3-def', m + ' pyNormalize 0xE');
  const u = DM.cloneState(s); u.deSel = 0x1; u.deRev = 1; ok(DM.pyNormalize(m, u).deSel === 1 && DM.pxForDeSel(m, u).base === 1, '3-def', m + ' 改 1 保留');
}

console.log('組合數：' + Object.keys(cnt).map(k => k + '=' + cnt[k]).join('、') + (oldDM ? '；舊版兩邊一致 ' + oldSame + ' 組（須與新版相同）、舊版不一致 ' + oldDiffFixed + ' 組（本版修正）' : ''));
if (fail) console.log('失敗類別：' + JSON.stringify(bad));
console.log((fail ? '✗' : '✓') + ' check_datamap_codefix ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
