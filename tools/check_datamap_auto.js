#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_auto.js — v1.10.0 ② Auto Mode（Hand Mode 關）Data Mapping Type 回歸
   用法：node tools/check_datamap_auto.js [repo] [--em02 <蘇坤 EM02 code.bin>]
     1) 純邏輯：各型號 Type 清單、套用→反查一致、NB 有 SUB_PANEL_MODE 欄位、隱藏表填錯修正（zz5／zz6 與 mirror 列）。
     2) jsdom：Hand 關時 ② 出現 Auto 下拉、選了寫入欄位與匯出 script、③ 依 Type 畫；Hand 開時停用；未知值顯示「未知（0xNN）」；
        EM01／EM02 原廠 UI 手動輸入對照；匯入蘇坤 EM02 code 自動選到 Type。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2), ei = args.indexOf('--em02'), EM02 = ei >= 0 ? args[ei + 1] : null;
const pos = args.filter((a, i) => a !== '--em02' && (ei < 0 || i !== ei + 1));
const ROOT = path.resolve(pos[0] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js'));
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');

console.log('── 各型號 Auto Type 清單（model 檔 SUB_PANEL_MODE 說明＋查詢表）');
const N = { E503: 21, E501A: 21, E501B: 21, DAZ6138: 16, DAZ6139: 16, DAZ6111: 10, DAZ7353: 20, EM01: 24, EM02: 24, E512: 24 };
for (const m of DM.MODEL_KEYS) ok(A.list(m).length === N[m], m + ' Type 數 ' + A.list(m).length + '（預期 ' + N[m] + '）');
ok(['E503', 'E501A', 'DAZ6138', 'DAZ6111', 'DAZ7353'].every(m => !!DM.fieldById(m, 'subPanel')), 'NB 型號都有 SUB_PANEL_MODE 欄位');
ok(JSON.stringify(DM.fieldById('E503', 'subPanel').parts) === '[[800,6,4]]' && JSON.stringify(DM.fieldById('E501A', 'subPanel').parts) === '[[1008,6,4]]' && JSON.stringify(DM.fieldById('DAZ7353', 'subPanel').parts) === '[[201,7,4]]', 'SUB_PANEL_MODE 位址：E503 0x320[6:4]、E501 0x3F0[6:4]、DAZ7353 0xC9[7:4]');
for (const m of DM.MODEL_KEYS) {
  const L = A.list(m); let good = true;
  L.forEach((e, i) => { let s = DM.emptyState(m); s = A.apply(m, s, i); if (A.match(m, s) !== i) good = false; if (s.hand) good = false; });
  ok(good, m + '：每個 Type 套用後反查回同一個 Type，且 Hand 維持關');
}
const E = A.list('E503');
ok(E.filter(e => /^LTPS/.test(e.name)).every((e, i) => e.set.panel === 3 && e.set.subPanel === i && e.set.rd === ((i & 1) ? 1 : 2)), 'LTPS 八種：sub bit0 MUX3/MUX2（rd 2/1）、bit1 Normal/Zigzag、bit2 Type1/Type2');
ok(E[5].name === 'Z-Zag Type 5' && E[5].lod === 5 && E[10].name === 'HSD Type 4' && E[10].lod === 24 && E[11].lod === 27 && E[12].lod === 25, 'E50x：Z-Zag Type 5→Line OD 5、HSD Type 4→24、Type 3-5→27、Type 4+Z-Zag(BOE)→25');
ok(A.list('EM02').every(e => DM.PRESETS[e.preset].set.hand === 0), 'MNT 清單＝原廠 RT7 清單中 force_sel_en＝0 的樣式');
{ const i29 = DM.PRESETS.findIndex(p => p.name.startsWith('(29)')); let s = DM.applyPreset('EM02', DM.emptyState('EM02'), i29); const r = A.manualMatch('EM02', s);
  ok(r && r.preset === i29 && r.diff.length === 0, 'Manual：套 (29) 後 force_sel 比對回 (29)、Panel Mode 全相同');
  s.subPanel = 0; const r2 = A.manualMatch('EM02', s); ok(r2 && r2.diff.join() === 'subPanel', 'Manual：(29) 的 force_sel 但 sub_panel 改成 0 ⇒ 指出 sub_panel_mode 應為 4'); }
console.log('── v1.11.0 Line OD 跟著 RT7');
ok(LOD.TYPES.every((t, i) => LOD.typeOfReg(LOD.autoReg(t)) === i), '由接線反推 Line OD（de／line／pix＋48 值）：原廠 33 個 Type 全部重算相同');
{ const WANT = { 30: 31, 31: 30 }; let good = 0, total = 0, det = [];
  DM.PRESETS.forEach((p, i) => { const m = /^\((\d+)\)/.exec(p.name); if (!m) return; total++; const n = +m[1], want = WANT[n] !== undefined ? WANT[n] : n;
    const s = DM.applyPreset('EM02', DM.emptyState('EM02'), i), e = A.expectedLod('EM02', s);
    if (e.ok && e.type === want && LOD.sameReg(e.reg, LOD.TYPES[want].reg)) good++; else det.push(p.name); });
  ok(good === total, '原廠 RT7 每個樣式算出的 Line OD＝對應 Line OD Type 的 52 個值（' + good + '/' + total + '；(30)(31) 照接線交叉、(32) 依 driver 對調後接線）' + (det.length ? ' ✗ ' + det.join(',') : '')); }
{ const i32 = DM.PRESETS.findIndex(p => p.name.startsWith('(32)')), s = DM.applyPreset('EM02', DM.emptyState('EM02'), i32), e = A.expectedLod('EM02', s), w = A.wiringFromState('EM02', s, false);
  ok(e.swap && e.type === 32 && LOD.typeOfReg(LOD.autoReg(w.t)) === 32, '(32)：依 driver 對調後的實際接線算出 Line OD 32；不對調算出來也是 32（Line OD 只看同一條 Data 線上前後送的子像素，整條線對調不影響）'); }
{ let s = Object.assign(DM.emptyState('EM02'), { hand: 1, panel: 2, rd: 1 }); const e = A.expectedLod('EM02', s);
  ok(e.ok && e.src === 'wiring', 'Hand 手填（全 0，不屬原廠樣式）也能由接線反推 Line OD：' + (e.ok ? (e.type >= 0 ? 'Type ' + e.type : '非原廠值 de=' + e.reg.de) : e.why));
  s = Object.assign(s, { panel: 3, rd: 1 }); ok(!A.expectedLod('EM02', s).ok, 'Gate 組合不符（panel 3＋rd 1）⇒ 無法自動對應、不寫'); }
ok(!A.lodSupported('EM01') && !A.lodSupported('E512') && A.lodSupported('EM02'), 'Line OD 只支援 EM02（EM01 格式不同、E512 bin 位置未確認）');
console.log('── 隱藏表填錯修正（依表格邏輯＋Pixel Structure 圖）');
const nf = id => (A.FIXES[id] || []).length;
ok(nf('6') === 40 && nf('7') === 40 && nf('27') === 38 && nf('28') === 38 && ['23', '24', '25', '26'].every(i => nf(i) === 2) && ['2', '3', '4', '5', '8', '9'].every(i => !nf(i)), '填錯格數：zz5／zz6 各 40、mirror zz5／zz6 各 38、mirror zz1~4 各 2（g2 欄）；其他 zigzag 列 0');
ok(A.FIXES['6'][0].cell === 'X13' && A.FIXES['6'][0].from === 6 && A.FIXES['6'][0].to === 7, 'zz5 第一筆：X13（g0_0）6→7');
/* 修正後 zz5：同一 slot 6 格互不相同，序列 LRRL（與查詢表 Z-Zag Type 5 圖、原廠 RT7 (5) ZZ+LRRL 一致） */
{ const h = A.HIDDEN['6'], v = h.v.slice(); A.FIXES['6'].forEach(f => { const i = h.cell.indexOf(f.cell); v[i] = f.to; });
  const dupFree = [0, 1, 2, 3].every(s => new Set(v.slice(s * 12, s * 12 + 6)).size === 6 && new Set(v.slice(s * 12 + 6, s * 12 + 12)).size === 6);
  const seq = [0, 1, 2, 3].map(s => v[s * 12] === 6 ? 'L' : 'R').join('');
  ok(dupFree && seq === 'LRRL', '修正後 zz5 每條 gate 6 格不重複、L／R＝' + seq); }
ok(A.wiring(A.list('E503').find(e => e.name === 'LTPS Type 1 Z-Zag MUX3')).g === 'tri', 'LTPS MUX3 用隱藏表解碼畫（Tri）');
{ const mx = A.list('E503').filter(e => / MUX2$/.test(e.name)).map(e => ({ e, t: A.wiring(e) }));
  ok(mx.length === 4 && mx.every(({ e, t }) => t && t.g === 'dual' && t.rows.every((ln, l) => { const a = ln[0].concat(ln[1]).sort((x, y) => x - y).join(); const z = / Z-Zag /.test(e.name) && l === 1; return a === (z ? [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).join(); })),
    'v1.12.0 LTPS MUX2 四種用隱藏表 T3／T4 兩時槽解碼（Dual）：每條 line 12 顆各一次（Z-Zag 第 2 條整體左移 1 顆）'); }
console.log('── v1.12.0 Hand 關 ③ 一定有圖或明確原因');
{ const T = {}; for (const m of DM.MODEL_KEYS) { const L = A.list(m); T[m] = { draw: L.filter(e => A.wiring(e)).length, est: L.filter(e => A.wiring(e) && e.est).length, none: L.filter(e => !A.wiring(e)).map(e => e.name) }; }
  ok(['E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139', 'EM01', 'EM02', 'E512'].every(m => T[m].none.length === 0), 'E50x／DAZ6138／6139／EM01／EM02／E512：每個 Auto Type 都有架構（含 MUX2）');
  ok(T.DAZ6111.none.length === 0 && T.DAZ7353.none.length === 0, 'v1.14.1 DAZ6111／DAZ7353 每個 Auto Type 都有架構（DAZ7353 Zinv type4~7 依同系列查詢表 Z-Zag Type 5~8 補上）');
  ok(['DAZ6111', 'DAZ7353'].every(m => A.list(m).filter(e => /^Zinv/.test(e.name)).every((e, z) => A.wiring(e) === LOD.TYPES[z + 1] && /查詢_20260424\.xlsx Z-Zag Type /.test(e.src))) && A.list('DAZ7353').filter(e => /^Zinv/.test(e.name)).length === 8,
    '查詢表交叉：Zinv type0~7＝Z-Zag Type 1~8（LR／RL／LLRR／RRLL／LRRL／RLLR／LLLLRRRR／RRRRLLLL＝Line OD 1~8），type0~3 也與 datasheet 一致');
  ok(['DAZ6111', 'DAZ7353'].every(m => ['HSD type0', 'HSD type3', 'HSD type 3-5'].every(n => /查詢_20260424\.xlsx HSD Type/.test(A.list(m).find(e => e.name === n).src) && /一致/.test(A.list(m).find(e => e.name === n).src))) && /查詢表沒有此 Type/.test(A.list('DAZ7353').find(e => e.name === 'HSD type1').src) && A.wiring(A.list('DAZ7353').find(e => e.name === 'HSD type1')) !== LOD.TYPES[22],
    '查詢表交叉：HSD type0／type3／type 3-5＝查詢表 HSD Type 1／4／3-5（與 datasheet 一致）；type1 不在查詢表、≠Line OD 22（0 起算命名）');
  ok(['DAZ6111', 'DAZ7353'].every(m => A.list(m).every(e => A.wiring(e) && !e.est && (/Datasheet/.test(e.src) || /查詢_20260424/.test(e.src)))), 'DAZ 每個 Type：都寫 datasheet 或查詢表出處（不再「推定」）');
  { const W = (m, n) => A.wiring(A.list(m).find(e => e.name === n)), R = t => JSON.stringify(t.rows), perm = t => t.rows.every(r => { const a = r.flat().sort((x, y) => x - y); return new Set(a).size === a.length && a[a.length - 1] - a[0] + 1 === a.length; });
    ok(['DAZ6111', 'DAZ7353'].every(m => [0, 1, 2, 3].every(z => W(m, 'Zinv type' + z) === LOD.TYPES[z + 1]) && W(m, 'HSD type0') === LOD.TYPES[22] && W(m, 'HSD type3') === LOD.TYPES[24] && W(m, 'HSD type 3-5') === LOD.TYPES[27]),
      'DAZ：Zinv type0~3＝ZIGZAG TYPE1~4（LR／RL／LLRR／RRLL＝Line OD 1~4）、HSD type0＝HSD0 (Z1 Type1)＝Line OD 22、type3＝HSD3 (Type4)＝24、type 3-5＝HSD4 (Type5)＝27');
    ok(R(W('DAZ7353', 'HSD type1')) === '[[[0,3,4,7,8,11],[1,2,5,6,9,10]]]' && R(W('DAZ7353', 'HSD type2')) === '[[[0,3,4,7,8,11],[1,2,5,6,9,10]],[[1,2,5,6,9,10],[0,3,4,7,8,11]]]', 'HSD1 (Type2)：上 r0 r1 g1 g2 b2 b3／下 g0 b0 b1 r2 r3 g3；HSD2 (Type3)：奇數列上下互換');
    ok(R(W('DAZ7353', 'HSD Z')) === '[[[0,2,4],[1,3,5]],[[1,3,5],[0,2,4]]]' && W('DAZ7353', 'HSD Z2').rows.length === 4, 'HSD5 (弓)：每列上下 gate 互換；HSD6 (Z2)：兩列一換');
    ok(R(W('DAZ7353', 'HSD N1')) === '[[[0,1,4,5,8,9],[2,3,6,7,10,11]],[[-1,0,3,4,7,8],[1,2,5,6,9,10]]]' && W('DAZ7353', 'HSD N3').P === 12, 'HSD7 (N1)：S0 上 R0 下 B0、S1 上 G0 下 R1，第 2 列往左 1 顆（X＝B-1）；N3／N4 週期 12 條 Data 線');
    ok(['HSD type1', 'HSD type2', 'HSD Z', 'HSD Z2', 'HSD N1', 'HSD N2', 'HSD N3', 'HSD N4'].every(n => perm(W('DAZ7353', n))), 'DAZ7353 新增 8 種 HSD：每條 line 的子像素都剛好一次、連續'); }
  const s = Object.assign(DM.emptyState('EM01'), { mirror: 1, chrb: 1 }), lo = A.matchLoose('EM01', s);
  ok(A.match('EM01', s) < 0 && lo && A.list('EM01')[lo.i].name === '(0) 1D1G(Mirror)' && lo.rb, '人工組合 panel 0／sub 0／mirror 1／chrb 1（不在清單；v1.17.0 更正：這不是 B19 全民 code，全民實際 0x0400＝02、0x0401＝81 ⇒ Hand 開、panel 1、mirror 1、chrb 0）⇒ 比照 (0) Mirror＋R↔B');
  ok(JSON.stringify(A.rbSwap(LOD.TYPES[25]).rows) === JSON.stringify(LOD.TYPES[26].rows), 'chrb＝R↔B 的依據：Line OD 25 做 R↔B ＝ Line OD 26（RB_chg）'); }

(async () => {
  console.log('── 網頁（jsdom）');
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const Q = s => d.querySelector('#dm-pv-tft ' + s), QA = s => Array.from(d.querySelectorAll('#dm-pv-tft ' + s));
  /* v1.12.0：MNT 的下拉＝單一 RT7 Type Select（值 'p'＋DM.PRESETS 索引、'u'＝User define）；NB 仍是 Auto 清單索引 */
  const av = (m, i) => A.fam(m) === 'mnt' ? 'p' + A.list(m)[i].preset : String(i);
  const pv = n => 'p' + DM.PRESETS.findIndex(p => p.name.startsWith('(' + n + ')'));
  const bytesOf = t => { const b = {}; t.split('\n').forEach(l => { const k = l.trim().split(/\s+/); if (k[0] === 'write' && k[1] === '-m') for (let j = 3; j < k.length; j++) b[parseInt(k[2], 16) + j - 3] = parseInt(k[j], 16); }); return b; };
  const fieldOk = (m, b, id, v) => { const p = DM.fieldById(m, id).parts[0]; return b[p[0]] !== undefined && ((b[p[0]] >> p[2]) & ((1 << (p[1] - p[2] + 1)) - 1)) === v; };
  ok(/^v1\.1\d\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.10 以上：' + w.TOOL_VERSIONS.datamap);
  for (const m of DM.MODEL_KEYS) {
    fire($('dm-model'), m); if (w.dmState.cur.hand) fire($('dm-hand'), false);
    const L = A.list(m), sel = $('dm-auto');
    let good = !$('dm-autorow').classList.contains('hidden') && !sel.disabled && (A.fam(m) === 'mnt' ? sel.options.length === DM.PRESETS.length + 1 && sel.options[sel.options.length - 1].value === 'u' : Array.from(sel.options).filter(o => o.value !== '-1').length === L.length);
    let drawn = 0, nopic = 0;
    for (let i = 0; i < L.length; i++) {
      fire(sel, av(m, i));
      const s = w.dmState.cur, e = L[i];
      good = good && Object.keys(e.set).every(k => !DM.fieldById(m, k) || (s[k] | 0) === (e.set[k] | 0)) && !s.hand && sel.value === av(m, i);
      /* 匯出：MNT 的 write -m 有 rt7+0x00；NB 的 SCRIPT 列有 SUB_PANEL_MODE */
      if (DM.MODELS[m].kind === 'mnt') { const t = w.dmBuildScript().text, b0 = DM.MODELS[m].rt7, line = t.split('\n').find(l => l.startsWith('write -m ' + hex(b0, 4)));
        const want = (((e.set.panel | 0) << 1) | ((e.set.ltpsZz | 0) << 3) | ((e.set.subPanel | 0) << 5)) & 0xFE;
        good = good && !!line && (parseInt(line.split(' ')[3], 16) & 0xFE) === want; }
      else { const rows = DM.pyScriptRows(m, s), sp = DM.fieldById(m, 'subPanel'), off = '0x' + hex(sp.parts[0][0], 3) + '[' + sp.parts[0][1] + ':' + sp.parts[0][2] + ']';
        const r = rows.find(x => x[4] === off); good = good && !!r && parseInt(r[6], 16) === (e.set.subPanel | 0); }
      if (A.wiring(e)) { drawn++; good = good && $('dm-pvtag').textContent === 'Auto · ' + e.name + (e.est ? '（推定）' : '') && QA('rect[data-pv]').length > 0 && !Q('[data-bad]'); }
      else { nopic++; good = good && /尚無架構定義，③ 無法畫圖。原因：.+/.test($('dm-pvnote').textContent) && !$('dm-pvnote').classList.contains('hidden') && $('dm-pv-tft').innerHTML === ''; }
      if (A.fam(m) === 'mnt' && m !== 'EM02') good = good && /依 EM02／查詢表定義推定/.test($('dm-pvnote').textContent);
    }
    ok(good, m + '：Hand 關 ⇒ Auto 下拉 ' + L.length + ' 項，逐項寫入欄位、匯出含對應位址；③ 畫 ' + drawn + ' 項、無圖 ' + nopic + ' 項（不出錯、無衝突）');
  }
  console.log('── Hand 開關、未知值、修正標示');
  fire($('dm-model'), 'E503'); fire($('dm-hand'), true);
  ok(!$('dm-auto').disabled && $('dm-auto').value === '-1' && !$('dm-c0-0').disabled && /Hand Mode 開啟中/.test($('dm-autonote').textContent), 'NB Hand 開 ⇒ Auto 下拉仍可選（顯示「Hand Mode 開」）、force_sel 表格可編輯');
  { const iz = A.list('E503').findIndex(e => e.name === 'Z-Zag Type 3'); fire($('dm-auto'), String(iz));
    ok(!w.dmState.cur.hand && $('dm-auto').value === String(iz) && w.dmState.cur.panel === 1 && w.dmState.cur.subPanel === 2, 'NB Hand 開時選 Z-Zag Type 3 ⇒ 自動關 Hand、寫入 panel 1／sub 2'); }
  fire($('dm-hand'), true); fire($('dm-hand'), false);
  ok(!$('dm-auto').disabled && $('dm-c0-0').disabled && !$('dm-gridnote').classList.contains('hidden'), 'Hand 關 ⇒ Auto 下拉可選、表格不顯示（同原本）');
  { const st = Object.assign(DM.emptyState('E503'), { panel: 2, subPanel: 7 }); const raw = A.rawByte('E503', st);
    ok(raw === 0x72 && A.match('E503', st) === -1, 'E503 panel 2＋sub 7 不在清單 ⇒ 未知（0x72）'); }

  fire($('dm-model'), 'EM02'); if (w.dmState.cur.hand) fire($('dm-hand'), false);
  const iL = A.list('EM02').findIndex(e => e.name === '(5) ZZ+LRRL');
  fire($('dm-auto'), av('EM02', iL));
  ok(+$('dm-pvnote').getAttribute('data-fix') === 40 && /已依邏輯修正/.test($('dm-pvnote').textContent) && /X13/.test($('dm-pvnote').textContent), 'EM02 選 (5) ZZ+LRRL ⇒ ③ 標「已依邏輯修正」（隱藏表 40 格，例 X13 6→7）');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && !!Q('path[data-w="2:D2:u:R1"]') && !!Q('path[data-w="3:D2:u:R1"]') && !!Q('path[data-w="4:D1:u:R1"]'), 'EM02 Auto (5) ZZ+LRRL：G1~G4 的 R1 依序接 D1、D2、D2、D1');
  fire($('dm-pv-lod'), '23');
  ok(/Line OD Type 23/.test($('dm-pvtag').textContent), '「測試：Line OD Type」仍優先（Hand 關也能用）');
  fire($('dm-pv-lod'), '-1');
  console.log('── EM01／EM02 原廠 UI 手動輸入對照');
  const manRows = () => Array.from($('dm-mantbl').querySelectorAll('tbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent));
  ok(!$('dm-manual').classList.contains('hidden'), 'EM02 顯示手動輸入對照');
  let mr = manRows();
  ok(mr[0][0] === 'Type_select:（ListBox）' && mr[0][1] === '(5) ZZ+LRRL' && mr.find(r => /^Panel_mode（/.test(r[0]))[1] === 'Zigzag' && mr.find(r => /^sub_panel/.test(r[0]))[1] === 'type5' && mr.find(r => /^Force_sel_en/.test(r[0]))[1] === 'Auto', 'EM02 Auto (5)：ListBox 選 (5) ZZ+LRRL、Panel_mode Zigzag、sub_panel type5、Force_sel_en Auto');
  fire($('dm-hand'), true); fire($('dm-c0-0'), 'G2');
  mr = manRows();
  const g01 = mr.filter(r => /^StringGrid_rt7_data_mapping_01 /.test(r[0])), g23 = mr.filter(r => /^StringGrid_rt7_data_mapping_23 /.test(r[0]));
  ok(g01.length === 24 && g23.length === 24 && g01[0][0].endsWith('r0_0') && g01[1][0].endsWith('g0_0') && g01[6][0].endsWith('r0_1') && g01[0][1] === String(w.dmState.cur.c0) && g01[0][2] === '0x' + hex(w.dmState.cur.c0, 2) && g01[0][3] === '0x0483', 'Hand：StringGrid_01／_23 各 24 列，順序 r0_i g0_i … b1_i（同原廠），r0_0 值＝② Line 1-1 Data 1、位址 0x0483');
  ok(mr.find(r => /^Force_sel_en/.test(r[0]))[1] === 'Manual' && /StringGrid_rt7_data_mapping_01 r0_0\t10\t0x0A/.test(w.dmState.manualText || ''), 'Force_sel_en＝Manual；複製文字含 r0_0＝10（G2）');
  fire($('dm-model'), 'EM01');
  ok(!$('dm-manual').classList.contains('hidden') && /EM01 原廠工具沒有 Type 清單/.test(manRows()[0][1]), 'EM01：手動對照沒有 Type_select（原廠工具沒有清單）');
  fire($('dm-model'), 'E503');
  ok($('dm-manual').classList.contains('hidden'), 'E503 不顯示 EM01／EM02 的手動對照');
  if (EM02) {
    console.log('── 匯入蘇坤 EM02 code：' + path.basename(EM02));
    fire($('dm-model'), 'EM02');
    w.dmImportBytes(new Uint8Array(fs.readFileSync(EM02)), path.basename(EM02));
    await new Promise(r => setTimeout(r, 50));
    const s = w.dmState.cur, i = A.match('EM02', s), sel = $('dm-auto');
    console.log('   force_sel_en=' + s.hand + ' panel=' + s.panel + ' sub=' + s.subPanel + ' rd=' + s.rd + ' mirror=' + s.mirror + ' chrb=' + s.chrb + ' ⇒ ' + (i >= 0 ? A.list('EM02')[i].name : '未知'));
    const mi = DM.PRESETS.findIndex(p => p.name === '(32) HSD BOE+GBG/RRB+LR'), mm = $('dm-automan');
    console.log('   Hand：' + mm.textContent);
    ok(+mm.getAttribute('data-preset') === mi && /panel_mode＝2/.test(mm.textContent) && /rd_mode＝1/.test(mm.textContent), '蘇坤 code（Hand 開）：force_sel＝原廠 Manual 樣式 (32)，顯示 Panel Mode 應設值（panel_mode＝2、rd_mode＝1…），差異 ' + mm.getAttribute('data-diff') + ' 項');
    ok(s.hand === 1 && !sel.disabled && sel.value === 'p' + mi && sel.options[sel.selectedIndex].textContent.startsWith('(32) HSD BOE+GBG/RRB+LR'), '匯入蘇坤 code 後 RT7 Type Select 自動選到 (32) HSD BOE+GBG/RRB+LR（Hand 開仍可選）');
  }
  console.log('── v1.12.0 EM01 Hand 關 ③');
  if (w.dmClearImport) w.dmClearImport();
  fire($('dm-model'), 'EM01'); if (w.dmState.cur.hand) fire($('dm-hand'), false);
  for (const n of ['(0) 1D1G(Normal)', '(1) ZZ+LR', '(2) ZZ+RL']) {
    fire($('dm-auto'), 'p' + DM.PRESETS.findIndex(p => p.name === n));
    ok(!w.dmState.cur.hand && $('dm-pvtag').textContent.startsWith('Auto · ' + n) && QA('rect[data-pv]').length > 0 && !$('dm-pvbody').classList.contains('hidden') && /依 EM02／查詢表定義推定/.test($('dm-pvnote').textContent), 'EM01 Hand 關選 ' + n + ' ⇒ ③ 有畫、註明依 EM02／查詢表定義推定');
  }
  fire($('dm-auto'), 'p0'); fire($('f-mirror'), true); fire($('f-chrb'), true);
  ok(!w.dmState.cur.hand && $('dm-auto').value === 'u' && QA('rect[data-pv]').length > 0 && /R↔B（推定）$/.test($('dm-pvtag').textContent) && /chrb 不同 ⇒ R、B 對換/.test($('dm-pvnote').textContent),
    'EM01 panel 0＋mirror 1＋chrb 1（人工組合，不在清單）⇒ ② 顯示 User define、③ 照 (0) Mirror＋R↔B 畫並標推定：' + $('dm-pvtag').textContent);
  console.log('── v1.12.0 單一 RT7 Type Select（EM02）');
  if (w.dmClearImport) w.dmClearImport();
  fire($('dm-model'), 'EM02'); if (w.dmState.cur.hand) fire($('dm-hand'), false);
  { const sel = $('dm-auto'), names = Array.from(sel.options).map(o => o.textContent);
    ok($('dm-autolbl').textContent === 'RT7 Type Select' && names.length === 35 && names[0].startsWith('(0) 1D1G(Normal)') && names[1].startsWith('(0) 1D1G(Mirror)') && names[33].startsWith('(32)') && names[34].startsWith('(33) User define'), 'RT7 Type Select 35 項：(0) Normal、(0) Mirror、(1)~(32)、(33) User define（同原廠 ListBox 順序）');
    ok(!$('dm-preset') && !$('dm-preset-apply'), '舊「原廠預設樣式」選單已併入（不再有第二個地方）');
    const k29 = DM.PRESETS.findIndex(p => p.name.startsWith('(29)')), P29 = DM.PRESETS[k29].set;
    fire(sel, pv(29));
    let s = w.dmState.cur, b = bytesOf(w.dmBuildScript().text);
    const ids = Object.keys(P29).filter(k => /^[cx]\d+$/.test(k));
    ok(s.hand === 1 && $('dm-hand').checked && ids.length === 48 && ids.every(k => (s[k] | 0) === P29[k]) && ['panel', 'subPanel', 'rd'].every(k => (s[k] | 0) === (P29[k] | 0)) && sel.value === pv(29) && !sel.disabled,
      'Hand 關時選 (29) ⇒ Hand 自動開、兩組 force_sel 48 格＋panel／sub／rd 照原廠表、下拉仍顯示 (29)');
    ok(ids.every(k => fieldOk('EM02', b, k, P29[k])) && fieldOk('EM02', b, 'hand', 1), '(29) 匯出 script：force_sel 兩組（0x0483 起、第二組 0x04DE 起）與 Force_sel_en 位元都正確');
    ok(!$('dm-c0-0').disabled && +$('dm-pv-tft').getAttribute('data-plines') === 12, '(29) 後表格可編輯、③ 週期 12（8-pixel 含第二組）');
    fire(sel, pv(22)); s = w.dmState.cur; b = bytesOf(w.dmBuildScript().text);
    ok(!s.hand && s.panel === 2 && s.subPanel === 0 && sel.value === pv(22) && fieldOk('EM02', b, 'panel', 2) && fieldOk('EM02', b, 'subPanel', 0) && fieldOk('EM02', b, 'hand', 0), 'Hand 開時選 (22) ⇒ Hand 自動關、panel 2（HSD）／sub 0、匯出一致');
    fire(sel, pv(29)); fire($('dm-c0-0'), 'B3');
    ok(w.dmState.cur.hand === 1 && sel.value === 'u' && +sel.getAttribute('data-rt7') === -1, '(29) 後手改一格 ⇒ 下拉變成 (33) User define（自訂）');
    fire(sel, pv(29)); fire($('dm-hand'), false);
    { const im = A.match('EM02', w.dmState.cur); ok(!w.dmState.cur.hand && im < 0 && sel.value === 'u', 'Hand 手動關（panel 2／sub 4 沒有對應的 Auto 樣式）⇒ 下拉顯示 User define'); }
    const before = JSON.stringify(w.dmState.cur); fire(sel, 'u');
    ok(JSON.stringify(w.dmState.cur) === before && sel.value === 'u', '選 (33) User define ⇒ 不改任何值，只顯示自訂');
    fire($('dm-hand'), true);
    ok(sel.value === pv(29), '再自己開 Hand（表格仍是 (29) 的 48 格、Panel Mode 相同）⇒ 下拉自動認出 (29)');
    fire(sel, pv(24));
    ok(!w.dmState.cur.hand && sel.value === pv(24), '選 (24) ⇒ Hand 關、顯示 (24)'); }
  console.log('── v1.11.0 ② Line OD 狀態（網頁）');
  if (w.dmClearImport) w.dmClearImport();
  fire($('dm-model'), 'EM02'); if (w.dmState.cur.hand) fire($('dm-hand'), false);
  fire($('dm-auto'), pv(5));
  { const t = w.dmBuildScript().text, l7 = t.split('\n').find(x => x.startsWith('write -m 09C7')), l9 = t.split('\n').find(x => x.startsWith('write -m 09C9'));
    ok($('dm-lodrow').getAttribute('data-state') === 'ok' && +$('dm-lodrow').getAttribute('data-cur') === 5 && !!l7 && !!l9 && parseInt(l9.split(' ')[3], 16) === LOD.TYPES[5].reg.r[0],
      'Auto 選 (5) ⇒ Line OD 自動寫成 Type 5、狀態一致；匯出 script 含 0x09C7、0x09C9（r_0＝' + LOD.TYPES[5].reg.r[0] + '）'); }
  fire($('dm-model'), 'EM01');
  ok($('dm-lodrow').getAttribute('data-state') === 'na' && /尚未支援/.test($('dm-lodstat').textContent), 'EM01：Line OD 尚未支援，請手動確認');
  fire($('dm-model'), 'E503');
  ok($('dm-lodrow').classList.contains('hidden'), 'NB 型號不顯示 Line OD');
  if (EM02) {
    console.log('── 蘇坤 code：一致／故意改壞／修正');
    fire($('dm-model'), 'EM02');
    const raw = new Uint8Array(fs.readFileSync(EM02));
    w.dmImportBytes(raw, path.basename(EM02)); await new Promise(r => setTimeout(r, 50));
    ok($('dm-lodrow').getAttribute('data-state') === 'ok' && +$('dm-lodrow').getAttribute('data-cur') === 32 && /一致（Type 32/.test($('dm-lodstat').textContent) && /對調/.test($('dm-loddiff').textContent), '蘇坤 code：✓ Line OD 與 RT7 一致（Type 32，依 driver 對調後接線）');
    { const lod0 = JSON.stringify(A.lodOf(w.dmState.cur)); fire($('f-chrb'), true);
      ok($('dm-lodrow').getAttribute('data-state') === 'ok' && JSON.stringify(A.lodOf(w.dmState.cur)) !== lod0, 'v1.17.0 CHRB 勾 ⇒ Line OD 跟著 RT7 自動改成 R↔B 後的接線（依原廠 (25)→(26) 只差 chrb、Line OD 25 R↔B＝26），狀態仍一致：' + $('dm-lodstat').textContent);
      const W1 = A.wiringFromState('EM02', w.dmState.cur, true), W0 = A.wiringFromState('EM02', Object.assign(DM.cloneState(w.dmState.cur), { chrb: 0 }), true);
      ok(W1.ok && W0.ok && JSON.stringify(W1.t.rows) === JSON.stringify(A.rbSwap({ rows: W0.t.rows, name: '' }).rows), 'CHRB＝1 的 Line OD 依據接線＝CHRB＝0 的接線做 R↔B（G 和位置不變）');
      fire($('f-chrb'), false);
      ok($('dm-lodrow').getAttribute('data-state') === 'ok' && JSON.stringify(A.lodOf(w.dmState.cur)) === lod0 && +$('dm-lodrow').getAttribute('data-cur') === 32, 'CHRB 取消 ⇒ Line OD 回到原本的 Type 32'); }
    const bad = raw.slice(), oL = bad[0x3B] | (bad[0x3C] << 8); bad[oL + 0xC9] = 8; bad[oL + 0xC8] = (bad[oL + 0xC8] & 0xF0) | 3;
    w.dmImportBytes(bad, 'broken_' + path.basename(EM02)); await new Promise(r => setTimeout(r, 50));
    ok($('dm-lodrow').getAttribute('data-state') === 'diff' && !$('dm-lodfix').classList.contains('hidden') && /不一致/.test($('dm-lodstat').textContent) && /r_0 8→25/.test($('dm-loddiff').textContent) && /line 3→1/.test($('dm-loddiff').textContent), '故意改壞 r_0 與 line ⇒ 醒目警示、列出差異（r_0 8→25、line 3→1）、出現修正按鈕');
    ok(w.dmState.cur.lodM0 === 8 && w.dmState.cur.lodLine === 3, '匯入時不自動改（code 裡的 Line OD 原樣保留，按了才改）');
    $('dm-lodfix').click();
    const t2 = w.dmBuildScript().text, l9 = t2.split('\n').find(x => x.startsWith('write -m 09C9')), l8 = t2.split('\n').find(x => x.startsWith('write -m 09C8'));
    ok($('dm-lodrow').getAttribute('data-state') === 'ok' && w.dmState.cur.lodM0 === 25 && w.dmState.cur.lodLine === 1 && parseInt(l9.split(' ')[3], 16) === 25 && (parseInt(l8.split(' ')[3], 16) & 0x0F) === 1, '按「依 RT7 修正 Line OD」⇒ 恢復一致，匯出 script 的 0x09C8／0x09C9 是修正後的值');
  }
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_auto ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
