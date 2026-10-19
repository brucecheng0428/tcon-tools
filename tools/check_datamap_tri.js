#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_tri.js — datamap v1.32.0 Tri-Gate（Bruce 2026-10-15 核可規劃方案 A）
   A. 核心：MNT 6 列 ↔ 暫存器（Line k-1／k-2＝主組 _(2k-2)／_(2k-1)，k-3＝第二組 _(2k-2)；第二組 _1／_3 永遠寫 0）；
      每列每格每個選項選了讀回相同、只改到那一格；RT7 (18)～(21) Hand 樣式的表格名稱與接線（wiringFromState）。
   B. 型號分流：NB（E503／E501A／E501B／DAZ6138／DAZ6139／DAZ6111／DAZ7353）Gate Type 不列 Tri；EN01、MNT 照舊；退回開關 TRI.on＝false ⇒ 與 v1.31.4 相同。
   C. 頁面：EM01／EM02／E512 Hand＋Tri ⇒ 6 列表取代 4 列表與第二組、③ TFT 圖有 3 條 gate（Mirror／CHRB 各組合）；選格寫入、匯出 script 含 r2..b3；
      E503 讀到 Tri ⇒ Gate Type 顯示 Tri（停用選項）＋一行說明；切回 Single／Dual ⇒ 4 列表回來。
   用法：node tools/check_datamap_tri.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const MNT = DM.MNT_KEYS, NB = DM.MODEL_KEYS.filter(k => DM.MODELS[k].kind === 'nb');
const TRI_PRESETS = DM.PRESETS.map((p, i) => ({ p, i })).filter(x => /^\((1[89]|2[01])\)/.test(x.p.name));
const handTri = (k, i) => { let s = DM.emptyState(k); s.hand = 1; s = DM.applyPreset(k, s, i); return s; };
const view = (k, s) => DM.TRI_ROWS.map((_, r) => Array.from({ length: 6 }, (_, c) => DM.triCellView(k, s, r, c).txt).join(' '));

console.log('A. 核心');
ok(TRI_PRESETS.length === 4, 'RT7 Hand Tri 樣式 (18)～(21) 共 4 個：' + TRI_PRESETS.map(x => x.p.name).join('、'));
ok(JSON.stringify(DM.TRI_ROWS.map(R => R.f + R.slot)) === '["c0","c1","x0","c2","c3","x2"]', '6 列對應：Line 1-1＝c_0、1-2＝c_1、1-3＝x_0、2-1＝c_2、2-2＝c_3、2-3＝x_2');
MNT.forEach(k => {
  TRI_PRESETS.forEach(({ p, i }) => {
    const s = handTri(k, i);
    ok(DM.triOn(k, s), k + ' ' + p.name + '：Hand＋Tri');
    const w = A.wiringFromState(k, s); ok(w.ok && w.t.g === 'tri' && w.t.rows[0].length === 3, k + ' ' + p.name + '：接線 3 條 gate（' + (w.why || '') + '）');
  });
  const boe = handTri(k, TRI_PRESETS[3].i);
  ok(view(k, boe).join('|') === 'R1 G1 B1 R2 G2 B2|R3 G3 B3 R4 G4 B4|R5 G5 B5 R6 G6 B6|R1 G1 B1 R2 G2 B2|R3 G3 B3 R4 G4 B4|R5 G5 B5 R6 G6 B6', k + ' (21) Tri+BOE 6 列名稱：' + view(k, boe).join('|'));
  const lr = handTri(k, TRI_PRESETS[0].i);   // v1.35.24：LTPS MUX3 zigzag 的 31 依 Pool 是 subpixel（第 5 欄＝B-1），不再顯示 X（Bruce 10/17 20:0x；派工 237187824600842240）
  ok(view(k, lr)[2] === 'B1 B2 B3 B4 B5 B6' && view(k, lr)[5] === 'B-1 B1 B2 B3 B4 B5', k + ' (18) Tri+ZZ+LR Line 1-3／2-3：' + view(k, lr)[2] + '｜' + view(k, lr)[5]);
  /* 每列每格每個選項：讀回相同、只改到那一格（＋第二組 _1／_3 清 0） */
  let n = 0, bad = 0;
  const s0 = boe;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) DM.triCellOptions(k, s0, r).forEach(o => {
    const res = DM.triPick(k, s0, r, c, o.name); n++;
    if (!res) { bad++; return; }
    const v = DM.triCellView(k, res.state, r, c);
    const ch = DM.fieldsOf(k).filter(f => (s0[f.id] | 0) !== (res.state[f.id] | 0)).map(f => f.id).filter(id => !/^x(6|7|8|9|10|11|18|19|20|21|22|23)$/.test(id));
    const id = DM.TRI_ROWS[r].f + (DM.TRI_ROWS[r].slot * 6 + c);
    let z = true; for (let q = 0; q < 6; q++) if (res.state['x' + (6 + q)] || res.state['x' + (18 + q)]) z = false;
    if (v.txt !== o.name || res.state[id] !== o.value || ch.some(x => x !== id) || !z) bad++;
  });
  ok(n > 500 && !bad, k + '：' + n + ' 次選格全部讀回相同、只改該格、第二組 _1／_3＝0（錯 ' + bad + '）');
  /* 每個選項選下去接線圖都畫得出來（v1.35.22 起選項＝code 0～29） */
  const s1 = handTri(k, TRI_PRESETS[3].i); let drawable = true;
  for (let r = 0; r < 6; r++) DM.triCellOptions(k, s1, r).forEach(o => { const st = DM.triPick(k, s1, r, 0, o.name).state; if (!A.wiringFromState(k, st).ok) drawable = false; });
  ok(drawable, k + '：任一選項選下去 TFT 接線都算得出來');
  ok(!DM.triPick(k, DM.setGate(k, Object.assign(DM.emptyState(k), { hand: 1 }), 'Dual-Gate'), 0, 0, 'R1'), k + '：Dual 時 triPick 不動作');
});

/* v1.35.22（Bruce 10/17「放寬到 0 至 29…Tri Gate 其實也有可能用到負數，都是一樣的」；派工 237015171729031168）：
   Tri 下拉＝code 0～29＋X，與 Single／Dual（mntInRange）、Auto（LOD.tName）同一政策；名稱＝linName(codeIdx(起始欄＋g, code))；
   Auto 接線每條 Data 線位置＝表格名稱位置；Pixel 範圍＝poolCov(MNT_POOL, c, 2)。矩陣：MNT 3 型號 × FORCE_DE_EN 0／1 × FORCE_DE_SEL（en0＝panel 等效、en1＝1～63）× 6 列 × 30 code。 */
console.log('A2. code 0～29（含負 pixel）');
{
  let combos = 0, bad = 0, wired = 0, wbad = 0; const badMsg = [];
  MNT.forEach(k => {
    const base0 = handTri(k, TRI_PRESETS[3].i);
    const sels = [[0, 0]].concat(Array.from({ length: 63 }, (_, i) => [1, i + 1]));
    sels.forEach(([en, ds]) => {
      const s = Object.assign(DM.cloneState(base0), { deEn: en, deSel: en ? ds : base0.deSel });
      if (!DM.triOn(k, s)) { bad++; badMsg.push(k + ' en' + en + ' 0x' + ds.toString(16) + ' 不是 Tri'); return; }
      for (let r = 0; r < 6; r++) {
        const T = DM.triT(s, r), opts = DM.triCellOptions(k, s, r), zz = DM.ltpsZzKind(k, s, r >= 3);   // v1.35.24：(21) Tri+BOE＝sub 2（LTPS MUX3 zigzag 同一組暫存器）⇒ 30／31 是 Pool subpixel、沒有 X
        const want = Array.from({ length: 30 }, (_, c) => DM.linName(DM.codeIdx(T, c))).concat(zz ? [DM.linName(DM.ltpsZzIdx(T, 30, zz)), DM.linName(DM.ltpsZzIdx(T, 31, zz))] : 'X');
        combos++;
        if (opts.map(o => o.name).join(' ') !== want.join(' ') || opts.map(o => o.value).join(',') !== Array.from({ length: 30 }, (_, c) => c).concat(zz ? [30, 31] : 31).join(',')) { bad++; if (badMsg.length < 5) badMsg.push(k + ' en' + en + ' 0x' + ds.toString(16) + ' 列' + r + '：' + opts.map(o => o.name).join(' ')); continue; }
        /* 每個 code 選到第 1 格 ⇒ 讀回同名、inTable、Auto 接線算得出來且位置＝名稱位置（負 pixel 也一樣） */
        for (let c = 0; c < 30; c++) {
          const st = DM.triPick(k, s, r, 0, want[c]).state, v = DM.triCellView(k, st, r, 0);
          if (v.txt !== want[c] || !v.inTable || st[DM.TRI_ROWS[r].f + DM.TRI_ROWS[r].slot * 6] !== c) { bad++; continue; }
          const w = A.wiringFromState(k, st); wired++;
          const R = DM.TRI_ROWS[r], line = R.slot >> 1, g = R.g;
          if (!w.ok || w.t.rows[line % w.t.rows.length][g][0] !== DM.linIdx(want[c])) { wbad++; if (badMsg.length < 8) badMsg.push(k + ' en' + en + ' 0x' + ds.toString(16) + ' 列' + r + ' ' + want[c] + ' 接線 ' + (w.ok ? w.t.rows[line % w.t.rows.length][g][0] : w.why) + ' vs ' + DM.linIdx(want[c])); }
        }
      }
    });
  });
  ok(!bad && combos === 3 * 64 * 6, 'Tri 下拉 code 0～29＋X（LTPS zigzag：＋30／31 subpixel）、名稱＝linName(codeIdx(起始欄＋g))、選了讀回同名：' + combos + ' 列組合（錯 ' + bad + '）' + (badMsg.length ? '｜' + badMsg.join('｜') : ''));
  ok(wired === combos * 30 && !wbad, 'Tri 每個 code（含負 pixel）Auto 接線算得出來、位置＝表格名稱位置：' + wired + ' 次（錯 ' + wbad + '）');
}
/* 負 pixel 具體案例：(21) Tri+BOE（起始欄 3）Line 1-1 改前只到 R-2～B-1，改後有 R-3～B-4；第 1 欄起（FORCE_DE_SEL 0x01）到 R-8 */
MNT.forEach(k => {
  const s = handTri(k, TRI_PRESETS[3].i), n11 = DM.triCellOptions(k, s, 0).map(o => o.name);
  ok(DM.triT(s, 0) === 3 && ['R-3', 'G-3', 'B-3', 'R-4', 'G-4', 'B-4'].every(n => n11.indexOf(n) >= 0) && n11.length === (DM.ltpsZzPool(k, s) ? 32 : 31), k + ' (21) Line 1-1（第 3 欄）下拉 32 項（v1.35.24：sub 2 的 30／31＝subpixel）含 R-3～B-4：' + n11.slice(18).join(' '));
  const st = DM.triPick(k, s, 0, 0, 'R-4').state, w = A.wiringFromState(k, st);
  ok(DM.triCellView(k, st, 0, 0).txt === 'R-4' && st.c0 === 24 && w.ok && w.t.rows[0][0][0] === DM.linIdx('R-4'), k + ' 選 Line 1-1 Data 1＝R-4 ⇒ code 24、讀回 R-4、Auto 接線在 R-4（' + (w.ok ? w.t.rows[0][0][0] : w.why) + '）');
  const s1 = Object.assign(DM.cloneState(s), { deEn: 1, deSel: 0x01 }), n1 = DM.triCellOptions(k, s1, 0).map(o => o.name);
  ok(DM.triT(s1, 0) === 1 && n1[29] === 'B-7' && n1[0] === 'R1' && n1.indexOf('R-8') >= 0, k + ' FORCE_DE_SEL 0x01 Line 1-1（第 1 欄）：R1…B-7（含 R-8）＋X（' + n1[0] + '…' + n1[29] + '）');
  const p = DM.pxForDeSel(k, s1);
  ok(p && p.from === -4 && p.to === 2, k + ' FORCE_DE_SEL 0x01 Tri Pixel 範圍 -4～2（改前 -2～2）：' + (p && p.from + '～' + p.to));
});
for (let c = 1; c <= 6; c++) ok(JSON.stringify(DM.triPxCov(c)) === JSON.stringify(DM.poolCov(DM.MNT_POOL, c, 2)), 'triPxCov(' + c + ')＝poolCov(MNT_POOL, ' + c + ', 2)＝' + JSON.stringify(DM.triPxCov(c)));
/* 與 Single／Dual 同一政策：同起始欄時 Tri 第 1 條 gate 的名稱集合＝MNT Dual 上 gate 列下拉 */
MNT.forEach(k => {
  const t = handTri(k, TRI_PRESETS[3].i), d = DM.setGate(k, DM.cloneState(t), 'Dual-Gate'); d.deEn = 1; d.deSel = 1 << (DM.triT(t, 0) - 1); const t2 = Object.assign(DM.cloneState(t), { deEn: 1, deSel: d.deSel });
  const a = DM.triCellOptions(k, t2, 0).filter(o => o.value < 30).map(o => o.name).sort().join(' '), b = DM.cellOptions(k, d, 0, 0).filter(o => o.value < 30).map(o => o.name).sort().join(' ');   // v1.35.24：比 code 0～29（Tri sub 2 的 30／31 是 LTPS zigzag Pool 專用）
  ok(a === b, k + ' Tri Line 1-1 下拉名稱集合＝Dual Line 1-1 下拉（同起始欄 ' + DM.triT(t2, 0) + '）' + (a === b ? '' : '｜Tri ' + a + '｜Dual ' + b));
});
console.log('B. 型號分流與退回開關');
NB.forEach(k => ok(DM.gateItems(k).join('|') === 'Single-Gate|Dual-Gate', k + ' Gate Type 不列 Tri：' + DM.gateItems(k).join('|')));
MNT.forEach(k => ok(DM.gateItems(k).join('|') === 'Single-Gate|Dual-Gate|Tri-Gate|MUX2|MUX3', k + ' Gate Type 列 Tri'));   // v1.35.29：MNT 選單多 MUX2／MUX3（派工 237801403670081536）
NB.forEach(k => { const s = Object.assign(DM.emptyState(k), { hand: 1, panel: 3, rd: 2 }); ok(!DM.triOn(k, s), k + ' 讀到 Tri：不走 6 列表'); });
DM.TRI.on = false;
ok(DM.gateItems('E503').join('|') === 'Single-Gate|Dual-Gate|Tri-Gate' && !DM.triOn('EM02', handTri('EM02', TRI_PRESETS[3].i)), 'TRI.on＝false：E503 照舊列 Tri、MNT 不走 6 列表（＝v1.31.4）');
DM.TRI.on = true;

(async () => {
  console.log('C. 頁面');
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; console.log('  ✗ jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), hid = id => $(id).classList.contains('hidden');
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const gates = () => Array.from($('dm-gate').options).map(o => o.value + (o.disabled ? '(停用)' : '')).join('|');
  const lines = () => Array.from(d.querySelectorAll('#dm-tftbody svg text')).map(t => t.textContent).filter(t => /^Line \d-\d$/.test(t));
  for (const k of MNT) {
    fire('dm-model', k);
    /* v1.35.30：換型號後是 Auto（Hand 關）⇒ Gate 項目＝DM.autoGateItems（Single／Dual／MUX2／MUX3）；Hand 開＝Single／Dual／Tri-Gate／MUX2／MUX3（不變） */
    ok(gates() === DM.autoGateItems(k).join('|') && gates() === 'Single-Gate|Dual-Gate|MUX2|MUX3', k + ' Auto Gate Type：' + gates());
    { const sh = DM.emptyState(k); sh.hand = 1; w.dmState.cur = sh; w.dmRender(); ok(gates() === 'Single-Gate|Dual-Gate|Tri-Gate|MUX2|MUX3', k + ' Hand Gate Type：' + gates()); }
    for (const mi of [0, 1]) for (const cb of [0, 1]) {
      const s = handTri(k, TRI_PRESETS[3].i); s.mirror = mi; s.chrb = cb;
      w.dmState.cur = s; w.dmRender();
      const svg = d.querySelector('#dm-tftbody svg');
      ok(!hid('dm-tribox') && hid('dm-gridbox') && hid('dm-xbox') && !hid('dm-tftbody') && svg && svg.getAttribute('data-ng') === '3' && lines().indexOf('Line 1-3') >= 0,
        k + ' Hand Tri (21) Mirror ' + mi + ' CHRB ' + cb + '：6 列表顯示、4 列表與第二組隱藏、TFT 圖 3 條 gate（' + (svg && svg.getAttribute('data-ng')) + '，' + lines().slice(0, 3).join(',') + '）');
    }
    const s = handTri(k, TRI_PRESETS[3].i); w.dmState.cur = s; w.dmRender();
    ok(Array.from(d.querySelectorAll('#dm-trigrid tbody th span:first-child')).map(e => e.textContent).join('|') === 'Line 1-1|Line 1-2|Line 1-3|Line 2-1|Line 2-2|Line 2-3', k + ' 列名 Line 1-1～2-3');
    ok($('dm-t2-0').value === 'R5' && !$('dm-t2-0').disabled, k + ' Line 1-3 Data 1＝R5、可選');
    w.dmTriPick(2, 0, 'R1');
    const x0 = DM.fieldById(k, 'x0').parts[0][0];
    ok($('dm-t2-0').value === 'R1' && w.dmState.cur.x0 === DM.triCellOptions(k, w.dmState.cur, 2).filter(o => o.name === 'R1')[0].value && w.dmState.xTouched, k + ' 選 Line 1-3 Data 1＝R1：寫進 force_sel_r2_0');
    ok(w.dmBuildScript().text.indexOf('write -m ' + DM.hex(x0, 4)) >= 0, k + ' 匯出 script 含 force_sel_r2_0（0x' + DM.hex(x0, 4) + '）');
    for (const g of ['Dual-Gate', 'Single-Gate']) { fire('dm-gate', g); ok(hid('dm-tribox') && !hid('dm-gridbox') && DM.gateOf(k, w.dmState.cur) === (g === 'Dual-Gate' ? 'dual' : 'single'), k + ' 切回 ' + g + '：4 列表回來、6 列表隱藏'); }
    fire('dm-gate', 'Tri-Gate'); ok(!hid('dm-tribox') && DM.gateOf(k, w.dmState.cur) === 'tri', k + ' 再切 Tri：6 列表');
  }
  for (const k of NB) {
    fire('dm-model', k);
    ok(gates() === DM.autoGateItems(k).join('|'), k + ' Auto Gate Type：' + gates());   // v1.35.30：e50x／DAZ613x 多 MUX2／MUX3（LTPS）
    { const sh = DM.emptyState(k); sh.hand = 1; w.dmState.cur = sh; w.dmRender(); ok(gates() === 'Single-Gate|Dual-Gate', k + ' Hand Gate Type：' + gates()); }
    const s = Object.assign(DM.emptyState(k), { hand: 1, panel: 3 }); if (DM.fieldById(k, 'rd')) s.rd = 2;
    w.dmState.cur = s; w.dmRender();
    ok(hid('dm-tribox') && !hid('dm-gridbox') && /Tri-Gate\(停用\)/.test(gates()) && $('dm-gate').value === 'Tri-Gate', k + ' 讀到 Tri：Gate Type 顯示 Tri（停用選項）、不顯示 6 列表：' + gates());
    if (DM.MODELS[k].sem === 'e50x') ok(/沒有第 3 條 gate/.test($('dm-gridnote').textContent), k + ' 說明：' + $('dm-gridnote').textContent);
  }
  fire('dm-model', 'EN01');
  ok(/Tri-Gate/.test(gates()) && hid('dm-tribox'), 'EN01 Gate Type 照舊（含 Tri／MUX4／MUX6）、不顯示 6 列表');
  console.log('Tri-Gate：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
