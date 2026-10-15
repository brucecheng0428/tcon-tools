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
  const lr = handTri(k, TRI_PRESETS[0].i);
  ok(view(k, lr)[2] === 'B1 B2 B3 B4 B5 B6' && view(k, lr)[5] === 'X B1 B2 B3 B4 B5', k + ' (18) Tri+ZZ+LR Line 1-3／2-3：' + view(k, lr)[2] + '｜' + view(k, lr)[5]);
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
  /* 選項只列該列 T 表有定義的 code（接線圖畫得出來） */
  const s1 = handTri(k, TRI_PRESETS[3].i); let drawable = true;
  for (let r = 0; r < 6; r++) DM.triCellOptions(k, s1, r).forEach(o => { const st = DM.triPick(k, s1, r, 0, o.name).state; if (!A.wiringFromState(k, st).ok) drawable = false; });
  ok(drawable, k + '：任一選項選下去 TFT 接線都算得出來');
  ok(!DM.triPick(k, DM.setGate(k, Object.assign(DM.emptyState(k), { hand: 1 }), 'Dual-Gate'), 0, 0, 'R1'), k + '：Dual 時 triPick 不動作');
});

console.log('B. 型號分流與退回開關');
NB.forEach(k => ok(DM.gateItems(k).join('|') === 'Single-Gate|Dual-Gate', k + ' Gate Type 不列 Tri：' + DM.gateItems(k).join('|')));
MNT.forEach(k => ok(DM.gateItems(k).join('|') === 'Single-Gate|Dual-Gate|Tri-Gate', k + ' Gate Type 列 Tri'));
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
    ok(gates() === 'Single-Gate|Dual-Gate|Tri-Gate', k + ' Gate Type：' + gates());
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
    ok(gates() === 'Single-Gate|Dual-Gate', k + ' Gate Type：' + gates());
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
