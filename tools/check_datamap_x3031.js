#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_x3031.js — datamap v1.35.24：code 30／31（EN01 255）依模式判斷是 subpixel 還是 X
   （Bruce 10/17 20:0x「X 其實只是把它選到最後一個而已，並不是真的不送…31 跟 255，有可能也會對應到負的 subpixel…就要靠你網頁版的程式來判斷」；
     派工 237187824600842240）
   A. LTPS MUX3 zigzag（PANEL_MODE 3、SUB_PANEL_MODE 2／6）：Tri 6 列表名稱＝瑞鼎 同事A EM01A1_rt7_register_force_mapping.xlsx
      LTPS!K216:S217（type1；type2 K353:S354 相同）30＝B1,B3…、31＝B2,B4…；「Only for line=1, mirror=1」K250:S251 30＝G1…、31＝G2…；
      前 5 欄依決策 A5（空白＝負 pixel）延伸。選項含 30／31、不含 X；選了讀回相同。
   B. 其他模式（LTPS MUX3 normal、MUX2、1D1G、Zigzag、HSD）：31＝X、30＝未定義（與 v1.35.23 相同）。
   C. 接線：原廠 RT7 (18)～(20) Tri+ZZ 不再靠「X 補位」（filled＝0），接線與 Line OD Type 不變（18／19／20）。
   D. EN01 255：en01XApprox＝Pool 公式外推（負 subpixel，推論）。
   E. 頁面（jsdom）：圖例依模式切換、Tri 格子 hover 註明 Pool、EN01 X 格 hover 顯示「≈ …（推論）」、TFT 圖例 X 說明。
   用法：node tools/check_datamap_x3031.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const MNT = DM.MNT_KEYS;
/* Excel 原文（K～S 欄＝第 6～14 欄） */
const XL = {
  b30: 'B1 B3 B5 B7 B9 B11 B13 B15 B17', b31: 'B2 B4 B6 B8 B10 B12 B14 B16 B18',
  g30: 'G1 G3 G5 G7 G9 G11 G13 G15 G17', g31: 'G2 G4 G6 G8 G10 G12 G14 G16 G18'
};
const st = (k, o) => { const s = Object.assign(DM.emptyState(k), { hand: 1, panel: 3, deEn: 1 }, o); if (DM.fieldById(k, 'rd')) s.rd = s.panel <= 1 ? 0 : (s.panel === 2 ? 1 : 2); return s; };

console.log('A. LTPS MUX3 zigzag');
for (const k of MNT) for (const sub of [2, 6]) for (const mi of [0, 1]) {
  /* 第 6～14 欄：直接用 ltpsZzIdx 對 Excel */
  const nm = (T, c, kind) => DM.linName(DM.ltpsZzIdx(T, c, kind));
  const cols = Array.from({ length: 9 }, (_, i) => i + 6);
  ok(cols.map(T => nm(T, 30, 1)).join(' ') === XL.b30 && cols.map(T => nm(T, 31, 1)).join(' ') === XL.b31, 'B 版 30／31＝Excel LTPS!K216:S217');
  ok(cols.map(T => nm(T, 30, 2)).join(' ') === XL.g30 && cols.map(T => nm(T, 31, 2)).join(' ') === XL.g31, 'G 版 30／31＝Excel LTPS!K250:S251');
  /* Tri 6 列：起始欄 1～6（one-hot）× 每列；line 1（Line 2-x）＋Mirror ⇒ G 版 */
  for (let b = 0; b < 6; b++) {
    const s = st(k, { subPanel: sub, mirror: mi, deSel: 1 << b });
    ok(DM.ltpsZzPool(k, s) && DM.triOn(k, s), k + ' sub ' + sub + '：判定為 LTPS MUX3 zigzag＋Tri');
    for (let r = 0; r < 6; r++) {
      const T = DM.triT(s, r), kind = mi && r >= 3 ? 2 : 1, col = kind === 2 ? 'G' : 'B';
      for (const code of [30, 31]) {
        const s2 = DM.cloneState(s); s2[DM.TRI_ROWS[r].f + (DM.TRI_ROWS[r].slot * 6)] = code;
        const v = DM.triCellView(k, s2, r, 0), p = 2 * (T - 6) + (code === 31 ? 2 : 1), want = col + (p > 0 ? p : p - 1);
        ok(v.txt === want && v.std && v.inTable && v.zz === kind, k + ' sub ' + sub + ' mi ' + mi + ' 起始欄 ' + (b + 1) + ' ' + DM.TRI_ROWS[r].label + ' code ' + code + '：' + v.txt + '（應 ' + want + '）');
      }
      const o = DM.triCellOptions(k, s, r);
      ok(o.length === 32 && !o.some(x => x.name === 'X') && o[30].value === 30 && o[31].value === 31 && new Set(o.map(x => x.name)).size === 32, k + ' sub ' + sub + ' ' + DM.TRI_ROWS[r].label + '：選項 0～31 各有名稱、不含 X、不重名');
      o.filter(x => x.value >= 30).forEach(x => { const pk = DM.triPick(k, s, r, 0, x.name); ok(pk && DM.triCellView(k, pk.state, r, 0).raw === x.value && DM.triCellView(k, pk.state, r, 0).txt === x.name, k + ' 選 ' + x.name + ' 寫 ' + x.value + ' 讀回相同'); });
    }
    /* Excel 匯出入（名稱）來回不變 */
    const s3 = DM.cloneState(s); s3.c0 = 30; s3.c7 = 31; s3.x0 = 31; s3.c14 = 30; s3.x14 = 30;
    const back = DM.triApplyNames(k, s3, DM.triNames(k, s3));
    ok(['c0', 'c7', 'x0', 'c14', 'x14'].every(id => back[id] === s3[id]), k + ' sub ' + sub + ' mi ' + mi + '：triNames → triApplyNames 30／31 原值');
  }
}
console.log('B. 其他模式照舊');
const OTHER = [{ panel: 3, subPanel: 0 }, { panel: 3, subPanel: 4 }, { panel: 3, subPanel: 1 }, { panel: 0, subPanel: 0 }, { panel: 1, subPanel: 3 }, { panel: 2, subPanel: 0 }];
for (const k of MNT) for (const o of OTHER) for (const mi of [0, 1]) {
  const s = st(k, Object.assign({ mirror: mi, deSel: 4 }, o));
  ok(!DM.ltpsZzPool(k, s), k + ' panel ' + o.panel + ' sub ' + o.subPanel + '：不是 zigzag Pool');
  if (DM.triOn(k, s)) {
    for (let r = 0; r < 6; r++) {
      const s2 = DM.cloneState(s); const id = DM.TRI_ROWS[r].f + (DM.TRI_ROWS[r].slot * 6);
      s2[id] = 31; ok(DM.triCellView(k, s2, r, 0).txt === 'X', k + ' ' + JSON.stringify(o) + ' ' + DM.TRI_ROWS[r].label + ' 31＝X');
      s2[id] = 30; ok(!DM.triCellView(k, s2, r, 0).std, k + ' ' + JSON.stringify(o) + ' 30＝未定義');
      const op = DM.triCellOptions(k, s, r); ok(op.length === 31 && op[30].name === 'X' && !op.some(x => x.value === 30), k + ' 選項 0～29＋X');
    }
  } else {
    for (let r = 0; r < 4; r++) { const s2 = DM.cloneState(s); s2['c' + r * 6] = 31; const v1 = DM.cellView(k, s2, r, 0); if (v1.blank) continue; ok(v1.txt === 'X', k + ' ' + JSON.stringify(o) + ' 4 列表 31＝X：' + v1.txt); s2['c' + r * 6] = 30; ok(!DM.cellView(k, s2, r, 0).std, k + ' 4 列表 30 非標準'); }
  }
}
console.log('C. 原廠 RT7 Tri+ZZ 接線');
const TP = DM.PRESETS.map((p, i) => ({ p, i })).filter(x => /^\((1[89]|20)\)/.test(x.p.name));
const WANT = { '(18)': 'R1 R2 R3 R4 R5 R6|G-1 G1 G2 G3 G4 G5|B1 B2 B3 B4 B5 B6|R-1 R1 R2 R3 R4 R5|G1 G2 G3 G4 G5 G6|B-1 B1 B2 B3 B4 B5' };
for (const k of MNT) TP.forEach(({ p, i }) => {
  let s = DM.emptyState(k); s.hand = 1; s = DM.applyPreset(k, s, i);
  const w = A.wiringFromState(k, s), e = A.expectedLod(k, s), no = p.name.slice(0, 4);
  ok(w.ok && w.filled === 0, k + ' ' + p.name + '：接線不需 X 補位（filled＝' + w.filled + '）');
  if (A.lodSupported(k)) ok(e.ok && e.type === +p.name.slice(1, 3), k + ' ' + p.name + '：Line OD Type＝' + e.type);
  if (WANT[no]) { const v = DM.TRI_ROWS.map((_, r) => Array.from({ length: 6 }, (_, c) => DM.triCellView(k, s, r, c).txt).join(' ')).join('|'); ok(v === WANT[no], k + ' ' + p.name + ' 6 列名稱：' + v); }
});
console.log('D. EN01 255');
for (let t = 0; t <= DM.EN01_TMAX; t++) {
  const a = DM.en01XApprox(t), k = 12 * t - 252 + 3;
  ok(a && a.n === -k && a.name === DM.linName(k), 'T 欄 ' + t + '：≈ ' + (a && a.name) + '（負第 ' + (a && a.n) + ' 個）');
}
ok(DM.en01Name(DM.EN01_TDEF, 0xFF) === 'X', 'EN01 255 仍顯示 X、寫入值不變');

(async () => {
  let JSDOM, VirtualConsole;
  try { ({ JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'))); } catch (e) { console.log('E. 頁面：沒有 jsdom，略過'); return done(); }
  console.log('E. 頁面');
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; console.log('  ✗ jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const tftText = () => Array.from(d.querySelectorAll('#dm-tftbody svg text')).map(t => t.textContent);
  for (const k of MNT) {
    fire('dm-model', k);
    let s = DM.emptyState(k); s.hand = 1; s = DM.applyPreset(k, s, TP[0].i);
    w.dmState.cur = s; w.dmRender();
    ok(/LTPS MUX3 zigzag：合法 code 0～31/.test($('dm-legend').textContent), k + ' (18) 圖例：' + $('dm-legend').textContent);
    ok($('dm-t5-0').value === 'B-1' && /LTPS MUX3 zigzag Pool：code 31＝B-1/.test($('dm-t5-0').parentNode.title), k + ' Line 2-3 Data 1＝B-1，hover：' + $('dm-t5-0').parentNode.title);
    ok(tftText().indexOf('B-1') >= 0, k + ' ③ TFT 圖有 B-1');
    const s2 = DM.cloneState(s); s2.subPanel = 0; w.dmState.cur = s2; w.dmRender();
    ok(/X＝31（送 Pool 最後一格＝最負的 pixel，用於 benchmark）；30 未定義/.test($('dm-legend').textContent) && $('dm-t5-0').value === 'X', k + ' 改 MUX3 normal：圖例回 X 說明、格子＝X（' + $('dm-t5-0').value + '）');
    ok(/TCON 仍會送：Pool 最後一格/.test(d.body.textContent), k + ' TFT 圖例 X 說明');
  }
  fire('dm-model', 'EN01');
  const se = DM.emptyState('EN01'); se.hand = 1; se.deEn = 1; se.deSel = 0x0E; se.rd = 0; se.e0 = 0xFF;
  w.dmState.cur = se; w.dmRender();
  const td = $('dm-e0-0') && $('dm-e0-0').parentNode;
  ok(td && /^X = 255 ≈ R-\d+（負第 \d+ 個 subpixel，依 Pool 公式外推，推論）/.test(td.title), 'EN01 X 格 hover：' + (td && td.title));
  ok(/X＝255（0xFF，送 Pool 最後一格＝最負的 pixel，用於 benchmark）/.test($('dm-legend').textContent), 'EN01 圖例：' + $('dm-legend').textContent);
  done();
})();
function done() { console.log('x3031：' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0); }
