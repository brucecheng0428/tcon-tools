#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_kickoff.js — v1.15.0 RM81010 Kick Off「Data hand mode」分頁 ⇔ 網頁 ②③ 回歸
   用法：node tools/check_datamap_kickoff.js [repo] [--qm <全民 EM01 code.bin>]
   出處（只讀）：~/TCON/Kick Off/RM81010_Kick_Off_Check_20210805.xlsx「Data hand mode」
     ・code 表 D2:R31（code 0~29 × 欄位；每往右一欄＝往右 2 pixel）；輸出 E36:R51＝INDIRECT(ADDRESS(code+2, COLUMN()))，
       偶數欄用 _0（line 1 用 _2）、奇數欄用 _1（_3）；Normal & Zigzag 只填第一行；HSD 兩行（上／下 gate）。
     ・範例：mirror＝0 Zigzag（C36:D51）、mirror＝1 HSD（U36:V51）、HSD 圖（C95:Q113 的 image87.png，code 抄錄、輸出用同一公式算）。
   下方 FX 由 openpyxl 讀公式與值產生（data_only 不用；公式照 Excel 規則算出）。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2), qi = args.indexOf('--qm'), QM = qi >= 0 ? args[qi + 1] : null;
const pos = args.filter((a, i) => a !== '--qm' && (qi < 0 || i !== qi + 1));
const ROOT = path.resolve(pos[0] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const FX = {"src": "~/TCON/Kick Off/RM81010_Kick_Off_Check_20210805.xlsx「Data hand mode」", "table": [["R1", "R3", "R5", "R7", "R9", "R11", "R13", "R15", "R17", "R19", "R21", "R23", null, null, null], ["G1", "G3", "G5", "G7", "G9", "G11", "G13", "G15", "G17", "G19", "G21", "G23", null, null, null], ["B1", "B3", "B5", "B7", "B9", "B11", "B13", "B15", "B17", "B19", "B21", "B23", null, null, null], ["R2", "R4", "R6", "R8", "R10", "R12", "R14", "R16", "R18", "R20", "R22", "R24", null, null, null], ["G2", "G4", "G6", "G8", "G10", "G12", "G14", "G16", "G18", "G20", "G22", "G24", null, null, null], ["B2", "B4", "B6", "B8", "B10", "B12", "B14", "B16", "B18", "B20", "B22", "B24", null, null, null], [null, "R1", "R3", "R5", "R7", "R9", "R11", "R13", "R15", "R17", "R19", "R21", "R23", null, null], [null, "G1", "G3", "G5", "G7", "G9", "G11", "G13", "G15", "G17", "G19", "G21", "G23", null, null], [null, "B1", "B3", "B5", "B7", "B9", "B11", "B13", "B15", "B17", "B19", "B21", "B23", null, null], [null, "R2", "R4", "R6", "R8", "R10", "R12", "R14", "R16", "R18", "R20", "R22", "R24", null, null], [null, "G2", "G4", "G6", "G8", "G10", "G12", "G14", "G16", "G18", "G20", "G22", "G24", null, null], [null, "B2", "B4", "B6", "B8", "B10", "B12", "B14", "B16", "B18", "B20", "B22", "B24", null, null], [null, null, "R1", "R3", "R5", "R7", "R9", "R11", "R13", "R15", "R17", "R19", "R21", "R23", null], [null, null, "G1", "G3", "G5", "G7", "G9", "G11", "G13", "G15", "G17", "G19", "G21", "G23", null], [null, null, "B1", "B3", "B5", "B7", "B9", "B11", "B13", "B15", "B17", "B19", "B21", "B23", null], [null, null, "R2", "R4", "R6", "R8", "R10", "R12", "R14", "R16", "R18", "R20", "R22", "R24", null], [null, null, "G2", "G4", "G6", "G8", "G10", "G12", "G14", "G16", "G18", "G20", "G22", "G24", null], [null, null, "B2", "B4", "B6", "B8", "B10", "B12", "B14", "B16", "B18", "B20", "B22", "B24", null], [null, null, null, "R1", "R3", "R5", "R7", "R9", "R11", "R13", "R15", "R17", "R19", "R21", "R23"], [null, null, null, "G1", "G3", "G5", "G7", "G9", "G11", "G13", "G15", "G17", "G19", "G21", "G23"], [null, null, null, "B1", "B3", "B5", "B7", "B9", "B11", "B13", "B15", "B17", "B19", "B21", "B23"], [null, null, null, "R2", "R4", "R6", "R8", "R10", "R12", "R14", "R16", "R18", "R20", "R22", "R24"], [null, null, null, "G2", "G4", "G6", "G8", "G10", "G12", "G14", "G16", "G18", "G20", "G22", "G24"], [null, null, null, "B2", "B4", "B6", "B8", "B10", "B12", "B14", "B16", "B18", "B20", "B22", "B24"], [null, null, null, null, "R1", "R3", "R5", "R7", "R9", "R11", "R13", "R15", "R17", "R19", "R21"], [null, null, null, null, "G1", "G3", "G5", "G7", "G9", "G11", "G13", "G15", "G17", "G19", "G21"], [null, null, null, null, "B1", "B3", "B5", "B7", "B9", "B11", "B13", "B15", "B17", "B19", "B21"], [null, null, null, null, "R2", "R4", "R6", "R8", "R10", "R12", "R14", "R16", "R18", "R20", "R22"], [null, null, null, null, "G2", "G4", "G6", "G8", "G10", "G12", "G14", "G16", "G18", "G20", "G22"], [null, null, null, null, "B2", "B4", "B6", "B8", "B10", "B12", "B14", "B16", "B18", "B20", "B22"]], "zz": {"mirror": 0, "line0": {"c0": [6, 7, 8, 9, 10, 11], "c1": [6, 7, 8, 9, 10, 11], "cols": [["R1", "G1", "B1", "R2", "G2", "B2"], ["R3", "G3", "B3", "R4", "G4", "B4"], ["R5", "G5", "B5", "R6", "G6", "B6"], ["R7", "G7", "B7", "R8", "G8", "B8"], ["R9", "G9", "B9", "R10", "G10", "B10"], ["R11", "G11", "B11", "R12", "G12", "B12"], ["R13", "G13", "B13", "R14", "G14", "B14"], ["R15", "G15", "B15", "R16", "G16", "B16"], ["R17", "G17", "B17", "R18", "G18", "B18"], ["R19", "G19", "B19", "R20", "G20", "B20"], ["R21", "G21", "B21", "R22", "G22", "B22"], ["R23", "G23", "B23", "R24", "G24", "B24"], [null, null, null, null, null, null], [null, null, null, null, null, null]]}, "line1": {"c0": [17, 6, 7, 8, 9, 10], "c1": [17, 6, 7, 8, 9, 10], "cols": [[null, "R1", "G1", "B1", "R2", "G2"], ["B2", "R3", "G3", "B3", "R4", "G4"], ["B4", "R5", "G5", "B5", "R6", "G6"], ["B6", "R7", "G7", "B7", "R8", "G8"], ["B8", "R9", "G9", "B9", "R10", "G10"], ["B10", "R11", "G11", "B11", "R12", "G12"], ["B12", "R13", "G13", "B13", "R14", "G14"], ["B14", "R15", "G15", "B15", "R16", "G16"], ["B16", "R17", "G17", "B17", "R18", "G18"], ["B18", "R19", "G19", "B19", "R20", "G20"], ["B20", "R21", "G21", "B21", "R22", "G22"], ["B22", "R23", "G23", "B23", "R24", "G24"], ["B24", null, null, null, null, null], [null, null, null, null, null, null]]}}, "mir": {"mirror": 1, "line0": {"c0": [6, 16, 14, 12, 22, 20], "c1": [13, 23, 21, 19, 29, 27], "cols": [["R1", null, null, null, null, null], ["G1", null, null, null, null, null], ["R5", "G4", "B3", "R3", "G2", "B1"], ["G5", "B4", "R4", "G3", "B2", "R2"], ["R9", "G8", "B7", "R7", "G6", "B5"], ["G9", "B8", "R8", "G7", "B6", "R6"], ["R13", "G12", "B11", "R11", "G10", "B9"], ["G13", "B12", "R12", "G11", "B10", "R10"], ["R17", "G16", "B15", "R15", "G14", "B13"], ["G17", "B16", "R16", "G15", "B14", "R14"], ["R21", "G20", "B19", "R19", "G18", "B17"], ["G21", "B20", "R20", "G19", "B18", "R18"], [null, "G24", "B23", "R23", "G22", "B21"], [null, "B24", "R24", "G23", "B22", "R22"]]}, "line1": {"c0": [16, 14, 12, 22, 20, 18], "c1": [23, 21, 19, 29, 27, 25], "cols": [[null, null, null, null, null, null], [null, null, null, null, null, null], ["G4", "B3", "R3", "G2", "B1", "R1"], ["B4", "R4", "G3", "B2", "R2", "G1"], ["G8", "B7", "R7", "G6", "B5", "R5"], ["B8", "R8", "G7", "B6", "R6", "G5"], ["G12", "B11", "R11", "G10", "B9", "R9"], ["B12", "R12", "G11", "B10", "R10", "G9"], ["G16", "B15", "R15", "G14", "B13", "R13"], ["B16", "R16", "G15", "B14", "R14", "G13"], ["G20", "B19", "R19", "G18", "B17", "R17"], ["B20", "R20", "G19", "B18", "R18", "G17"], ["G24", "B23", "R23", "G22", "B21", "R21"], ["B24", "R24", "G23", "B22", "R22", "G21"]]}}, "hsd": {"note": "codes 從 Data hand mode 分頁 C95:Q113 的圖（xl/media/image87.png）抄錄；輸出用同一個公式（E36 的 INDIRECT）算", "codes": {"c0": [16, 17, 7, 10, 11, 1], "c1": [21, 12, 14, 15, 6, 8], "c2": [17, 7, 10, 11, 1, 4], "c3": [12, 14, 15, 6, 8, 9]}, "line0": [[null, null, "G1", "G2", "B2", "G3"], [null, "R1", "B1", "R2", "R3", "B3"], ["G4", "B4", "G5", "G6", "B6", "G7"], ["R4", "R5", "B5", "R6", "R7", "B7"], ["G8", "B8", "G9", "G10", "B10", "G11"], ["R8", "R9", "B9", "R10", "R11", "B11"], ["G12", "B12", "G13", "G14", "B14", "G15"], ["R12", "R13", "B13", "R14", "R15", "B15"], ["G16", "B16", "G17", "G18", "B18", "G19"], ["R16", "R17", "B17", "R18", "R19", "B19"], ["G20", "B20", "G21", "G22", "B22", "G23"], ["R20", "R21", "B21", "R22", "R23", "B23"], ["G24", "B24", null, null, null, null], ["R24", null, null, null, null, null]], "line1": [[null, "G1", "G2", "B2", "G3", "G4"], ["R1", "B1", "R2", "R3", "B3", "R4"], ["B4", "G5", "G6", "B6", "G7", "G8"], ["R5", "B5", "R6", "R7", "B7", "R8"], ["B8", "G9", "G10", "B10", "G11", "G12"], ["R9", "B9", "R10", "R11", "B11", "R12"], ["B12", "G13", "G14", "B14", "G15", "G16"], ["R13", "B13", "R14", "R15", "B15", "R16"], ["B16", "G17", "G18", "B18", "G19", "G20"], ["R17", "B17", "R18", "R19", "B19", "R20"], ["B20", "G21", "G22", "B22", "G23", "G24"], ["R21", "B21", "R22", "R23", "B23", "R24"], ["B24", null, null, null, null, null], [null, null, null, null, null, null]]}};
const nm = x => { const px = Math.floor(x / 3), c = ((x % 3) + 3) % 3; return 'RGB'[c] + (px >= 0 ? px + 1 : px); };
console.log('── code 表（D2:R31）＝網頁 T 表解碼');
{ let good = 0, total = 0, bad = [];
  for (let code = 0; code < 30; code++) for (let k = 0; k < 15; k++) {
    const ex = FX.table[code][k], t = LOD.tName(k + 1, code), mine = t === null || t < 0 || t >= 72 ? null : nm(t);
    total++; if (ex === mine) good++; else bad.push(code + '@' + k + ':' + ex + '/' + mine);
  }
  ok(good === total, 'Excel code 表 30×15 格＝tName(欄+1, code)（Excel 空白＝前循環或超過表上的 24 pixel）：' + good + '/' + total + (bad.length ? ' ✗ ' + bad.slice(0, 6).join(' ') : ''));
  ok(FX.zz.mirror === 0 && FX.mir.mirror === 1, 'mirror＝0／1 兩組範例的公式相同，只差填的 code（左 C:R、右 U:AJ 的 code 表逐格相同）'); }
(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const Q = s => d.querySelector('#dm-pv-tft ' + s), QA = s => Array.from(d.querySelectorAll('#dm-pv-tft ' + s)); const QA2 = s => Array.from(d.querySelectorAll(s));
  const put = (m, set, rows) => { fire($('dm-model'), m); const s = Object.assign(DM.emptyState(m), set); rows.forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; })); w.dmState.cur = s; w.dmRender(); };
  const slots = row => { const out = {}; QA('rect[data-pv^="' + row + ':"]').forEach((r, i) => r.getAttribute('data-in').split(',').filter(Boolean).forEach(x => { out[x] = i; })); return out; };
  const glabels = () => QA('text[data-glabel]').map(t => t.textContent);
  console.log('── Zigzag 範例（mirror 0，C36:R51）＝E501A（RM81010）③');
  { const z = FX.zz; put('E501A', { hand: 1, panel: 1, subPanel: 0, rd: 0 }, [z.line0.c0, z.line0.c1, z.line1.c0, z.line1.c1]);
    let good = true, why = '';
    [z.line0, z.line1].forEach((L, li) => { for (let p = 0; p < 12; p++) { const ex = L.cols[Math.floor(p / 6)][p % 6];
      const hit = ex ? !!Q('path[data-w="' + (li + 1) + ':D' + (p + 1) + ':u:' + ex + '"]') : QA('path[data-w^="' + (li + 1) + ':D' + (p + 1) + ':u:"]').some(e => /-\d$/.test(e.getAttribute('data-w')));
      if (!hit) { good = false; why = 'Line ' + (li + 1) + ' D' + (p + 1) + '≠' + ex; } } });
    ok(good, 'Line 1／Line 2 的 D1~D12＝Excel E36:F41／E46:F51（D1~6＝E 欄、D7~12＝F 欄）' + why);
    ok(glabels().join(',') === 'Line 1,Line 2', 'NB Single：③ 只有 Line 1、Line 2（line 0／line 1），不是 Line 1-1／1-2：' + glabels().join(','));
    ok([0, 1, 2, 3].map(r => $('dm-rh' + r).textContent).join('|') === 'Line 1（_0）|Line 1′（_1）|Line 2（_2）|Line 2′（_3）', '② 列名：Line 1、Line 1′、Line 2、Line 2′（括號＝暫存器尾碼）'); }
  console.log('── HSD 範例（mirror 0，圖 C95:Q113）＝E501A Dual ③');
  { const h = FX.hsd; put('E501A', { hand: 1, panel: 2, subPanel: 0, rd: 1 }, [h.codes.c0, h.codes.c1, h.codes.c2, h.codes.c3]);
    let good = true, why = '';
    [h.line0, h.line1].forEach((L, li) => { for (let p = 0; p < 12; p++) for (let gi = 0; gi < 2; gi++) { const ex = L[2 * Math.floor(p / 6) + gi][p % 6];
      if (!ex) continue; if (!Q('path[data-w="' + (li + 1) + ':D' + (p + 1) + ':' + (gi ? 'd' : 'u') + ':' + ex + '"]')) { good = false; why = ' L' + (li + 1) + ' D' + (p + 1) + (gi ? 'd' : 'u') + '≠' + ex; } } });
    ok(good, 'Line 1-1／1-2、2-1／2-2 的 D1~D12＝Excel 圖的上／下半行（E/F、G/H 欄）' + why);
    ok(glabels().join(',') === 'Line 1-1,Line 1-2,Line 2-1,Line 2-2', 'Dual：Line x-1／x-2'); }
  console.log('── Mirror＝1 範例（U36:AJ51，HSD）＝EM02 Dual＋mirror ③');
  { const mr = FX.mir; const codes = [mr.line0.c0, mr.line0.c1, mr.line1.c0, mr.line1.c1];
    put('EM02', { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 0 }, codes);
    const s0 = slots(1);
    put('EM02', { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 1 }, codes);
    const s1 = slots(1), seq = [1, 2, 3, 4, 5, 6].map(n => [s1['D' + n + 'u'], s1['D' + n + 'd']]);
    const straight = seq.every((p, i) => Math.abs(p[0] - p[1]) === 1 && (i === 0 || Math.min(p[0], p[1]) === Math.min(seq[i - 1][0], seq[i - 1][1]) + 2));
    ok(straight && !Q('[data-bad]') && /Mirror＝1/.test($('dm-pvnote').textContent), 'mirror＝1：每條 Data 線接正下方相鄰兩顆、往右每條 +2（Dual 直下），無衝突、③ 註明 Mirror：' + JSON.stringify(seq));
    ok(JSON.stringify(s0) !== JSON.stringify(s1), '同一組 code 不勾 mirror 時接法不同（mirror 位元會改變 ③）'); }
  console.log('── Line 標示：各型號');
  { let good = true, why = '';
    for (const m of DM.MODEL_KEYS) { fire($('dm-model'), m);
      for (const [gate, re] of [['Single-Gate', /^Line \d$/], ['Dual-Gate', /^Line \d-[12]$/]]) {
        const s = Object.assign(DM.emptyState(m), { hand: 1, panel: gate === 'Single-Gate' ? 1 : 2, rd: gate === 'Single-Gate' ? 0 : 1 }); w.dmState.cur = s; w.dmRender();
        const g = glabels(); if (!g.length || !g.every(x => re.test(x))) { good = false; why += ' ' + m + '/' + gate + ':' + g.join(','); } } }
    ok(good, '所有型號：Single／Normal／Zigzag＝Line 1~N、Dual＝Line x-1／x-2' + why); }
  if (QM) {
    console.log('── 全民 EM01 code：' + path.basename(QM));
    if (w.dmClearImport) w.dmClearImport();
    fire($('dm-model'), 'EM01');
    w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM));
    await new Promise(r => setTimeout(r, 80));
    const s = w.dmState.cur;
    ok(s.hand === 1 && s.panel === 1 && s.mirror === 1 && [17, 16, 15, 14, 13, 12].every((v, i) => s['c' + i] === v), '匯入：Hand 開、Zigzag、mirror 1、_0＝17,16,15,14,13,12');
    ok($('dm-pv-first').value === 'l' && $('dm-pv-drv').value === 'f' && $('dm-pv-stripe').value === 'rgb' && !$('dm-pv-swap').checked && +$('dm-pv-tft').getAttribute('data-mis') > 0
      && !$('dm-pv-sugbtn').classList.contains('hidden') && /建議：CH1 在最右＋正向＋RGB/.test($('dm-pv-sugbtn').textContent),
      'v1.17.3 匯入全民 code ⇒ ③ 回預設（不對調、CH1 在最左、RGB），Driver 方向照 code SHL＝1 帶入正向；不自動改 CH1，建議區顯示：' + $('dm-pv-sugbtn').textContent);
    $('dm-pv-sugbtn').click();
    ok($('dm-pv-first').value === 'r' && +$('dm-pv-tft').getAttribute('data-mis') === 0 && $('dm-pv-sugbtn').classList.contains('hidden'), '按「套用建議」⇒ CH1 在最右＋正向＋RGB，24/24 相符');
    ok(QA('text[data-dlab="Dn+6"]').length === 1 && QA('text[data-dlab="Dn+1"]').length === 1 && QA('text[data-dlab="Dn"]').length === 1 && QA('text[data-dlab="Dn−5"]').length === 1
      && Q('path[data-dl="7"]').getAttribute('data-rep') === '0' && Q('path[data-dl="1"]').getAttribute('data-rep') === '1' && QA('text[data-dof]').length === 12,
      'v1.17.1 CH1 在右：主循環畫在最左（標 Dn+6…Dn+1、亮），右邊靠 CH1 的一組是重複組（Dn…Dn−5、暗），每條線下方小字標對應 code 的 Data k');
    ok(glabels().join(',') === 'Line 1,Line 2,Line 3,Line 4', '③ Line 1~4（Single 4 條 gate），不是 Line 1-1／1-2：' + glabels().join(','));
    const a = slots(1), b = slots(2);
    ok([1, 2, 3, 4, 5, 6].every(n => a['D' + n + 'u'] === a.D1u + n - 1), 'Line 1：D1~D6 直下（每條接正下方）：' + JSON.stringify(a));
    ok([1, 2, 3, 4, 5, 6].every(n => b['D' + n + 'u'] === a['D' + n + 'u'] + 1), 'Line 2：整排往右錯一條（Zigzag LR）：' + JSON.stringify(b));
    ok(['B2', 'G2', 'R2', 'B1', 'G1', 'R1'].every((x, i) => !!Q('path[data-w="1:D' + (i + 1) + ':u:' + x + '"]')), 'Mirror 解碼後 Line 1 的 D1~D6＝B2 G2 R2 B1 G1 R1（資料顏色＝code 的顏色）');
    const gridTxt = r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value);
    ok(gridTxt(0).join(' ') === 'B2 G2 R2 B1 G1 R1' && gridTxt(1).join(' ') === 'G2 R2 B1 G1 R1 B-1' && gridTxt(3).join(' ') === 'G2 R2 B1 G1 R1 B-1' && [0, 1, 2, 3].every(r => gridTxt(r).every(v => v !== '__ns')),
      'v1.17.1 ②：Mirror＝1 名稱整行反轉，Line 2／4 的 Data 6（0x17）＝B-1（和 D5 的 R1 相鄰，Bruce 10/8），不再是 B4：' + gridTxt(1).join(' '));
    ok(!!Q('path[data-w="2:D6:u:B-1"]') && !Q('path[data-w="2:D6:u:B4"]') && slots(2).D6u === slots(2).D5u + 1, '③ TFT 接線圖：Line 2 的 D6 接 B-1，位置緊鄰 D5（相鄰、Zigzag 錯一條）');
    ok(QA2('.dm-grid select.dm-oor').length === 0, '全民 24 格都在 code 表定義範圍內（Mirror 名稱整行反轉後，範圍照基準＋1 張表）');
    ok([0, 1, 2, 3].every(r => [0, 1, 2, 3, 4, 5].every(c => $('dm-c' + r + '-' + c).getAttribute('data-t') === '2')) && /0x1F/.test($('dm-tsum').textContent)
      && /基準未確定/.test($('dm-tsum').textContent) && /依已點亮 code 反推/.test($('dm-tsum').textContent) && /最低那張/.test($('dm-tsum').textContent) && /T1 2 格超出、T2 全在範圍內、T3 全在範圍內、T4 全在範圍內、T5 全在範圍內/.test($('dm-tsum').textContent)
      && !/預設|當 T2|暫以 T2|與 T2 一致/.test($('dm-tsum').textContent) && /依據：EM01 原始碼/.test($('dm-tsum').textContent)
      && QA2('.dm-tt').every(e => e.textContent === 'T2?'),
      'v1.17.1：0x1F 多 bit ⇒ 標「基準未確定」，依已點亮 code 反推（有設的 bit 中 24 格全在範圍內的最低那張＝T2），列出候選 T1~T5；不再說預設 T2；標示型號依據：' + $('dm-tsum').textContent);
    ok(!$('dm-pmrow').classList.contains('hidden') && $('f-mirror').checked && !$('f-chrb').checked && $('dm-pvflags').textContent.indexOf('Mirror＝1') === 0, 'Mirror／CHRB 等設定在 ② 上方（和 Hand Mode 同層）可見；③ 標示 Mirror＝1');
    const sc0 = w.dmBuildScript().text;
    fire($('f-mirror'), false);
    ok(gridTxt(0).join(' ') === 'B2 G2 R2 B1 G1 R1' && $('dm-c0-0').getAttribute('data-t') === '3' && (m01 => !!m01 && (parseInt(m01[1], 16) & 1) === 0 && (parseInt(m01[2], 16) & 1) === 1)(/write -m 0401 ([0-9A-F]{2}) ([0-9A-F]{2})/.exec(w.dmBuildScript().text)) && w.dmState.cur.mirror === 0, 'Mirror 改 0 ⇒ 範圍改照基準本身，0x1F 有設的 bit 中最低全在範圍內的是 T3，名稱同為 B2 G2 R2 B1 G1 R1（code 原值不變）、匯出 script 有 0401 bit0＝0');
    fire($('f-mirror'), true);
    ok(gridTxt(0).join(' ') === 'B2 G2 R2 B1 G1 R1' && w.dmBuildScript().text === sc0 && [17, 16, 15, 14, 13, 12].every((v, i) => w.dmState.cur['c' + i] === v), 'Mirror 改回 1 ⇒ ② 名稱回來、匯出 script 和匯入時逐字相同、code 原值沒變');
    fire($('f-mirror'), false);
    const sOff = w.dmState.cur, scOff = w.dmBuildScript().text;
    ok(sOff.rvsL === 0 && sOff.rvsH === 0 && /write -m 0446 00 FF/.test(scOff) && /write -m 0447 00 FF/.test(scOff) && $('dm-tsum').getAttribute('data-rvswarn') === '0', 'v1.17.2 Mirror 改 0 ⇒ READ_RVS 跟著寫 0x0000（照原廠工具 RApp_TX.cpp:8859-8880），匯出 script 有 0446／0447＝00');
    fire($('f-mirror'), true);
    ok(w.dmState.cur.rvsL === 0xFF && w.dmState.cur.rvsH === 0xFF && w.dmBuildScript().text === sc0 && $('dm-tsum').getAttribute('data-rvswarn') === '0', 'Mirror 改回 1 ⇒ READ_RVS 回 0xFFFF，匯出 script 和匯入時逐字相同');
    w.dmState.cur = Object.assign(DM.cloneState(w.dmState.cur), { rvsL: 0, rvsH: 1 }); w.dmRender();
    ok($('dm-tsum').getAttribute('data-rvswarn') === '1' && /READ_RVS＝0x0100/.test($('dm-tsum').textContent) && /0xFFFF/.test($('dm-tsum').textContent), 'Mirror＝1 但 READ_RVS＝0x0100 ⇒ ② 提示和原廠工具寫入值（0xFFFF）不同');
    w.dmState.cur = Object.assign(DM.cloneState(w.dmState.cur), { rvsL: 0xFF, rvsH: 0xFF }); w.dmRender();
    fire($('f-tsel'), '3');
    ok(w.dmState.cur.deEn === 1 && w.dmState.cur.deSel === 4 && $('dm-c0-0').getAttribute('data-t') === '3', 'T 表選 T3 ⇒ 寫 FORCE_DE_EN＝1、FORCE_DE_SEL＝0x04，每格標 T3');
    fire($('dm-hand'), true);
    w.dmState.cur = Object.assign(DM.cloneState(w.dmState.cur), { deEn: 1, deSel: 31 }); w.dmRender();
    const T = $('dm-pv-tft');
    fire($('dm-pv-first'), 'l');
    ok(!$('dm-pv-shlsrc') && $('dm-pv-drv').value === 'f' && /不從 TCON code 讀取/.test(d.querySelector('[data-i18n-title="dm.hDrvT"]').getAttribute('title')), 'v1.18.5 Driver 輸出方向不從 code 讀取：匯入全民後預設正向，不顯示 iSP REG 帶入說明，ⓘ 寫明手動設定');
    ok(QA('[data-misk]').length > 0 && T.getAttribute('data-sug') === 'rfgn' && T.getAttribute('data-sugcombo') === 'rfgn' && !$('dm-pv-sugbtn').classList.contains('hidden'), '預設（CH1 在最左＋正向＋RGB）顏色不符 ⇒ 建議：CH1 在最右＋正向（和 code SHL 一致）＋RGB＋無對調');
    ok(d.querySelectorAll('#dm-pv-combotbl tbody tr').length === 16 && new Set(Array.from(d.querySelectorAll('#dm-pv-combotbl tbody tr')).map(r => r.getAttribute('data-group'))).size === 16, 'v1.17.2：16 種組合各自獨立（CH1 位置與 SHL 不再互為等效）');
    const dlPos = () => QA('path[data-dl]').map(p => p.getAttribute('data-dl') + '@' + p.getAttribute('data-x')).join(',') + '|' + QA('text[data-dlab]').map(e => e.getAttribute('data-dlab')).join(',');
    const cells = r => QA('rect[data-pv^="' + r + ':"][data-tier="main"]').map(e => e.getAttribute('data-dn')).join(' ');
    fire($('dm-pv-first'), 'r');
    const a2 = slots(1);
    ok(d.querySelector('#dm-pv-tft [data-flip]') && +T.getAttribute('data-mis') === 0 && QA('[data-misk]').length === 0 && $('dm-pv-sugbtn').classList.contains('hidden') && JSON.stringify(a2) === JSON.stringify(a) && /CH1 在最右/.test($('dm-pv-eq').textContent) && /SHL 正向/.test($('dm-pv-eq').textContent),
      'CH1 在最右＋正向＋RGB：主循環置左、資料顏色＝玻璃顏色 24/24、不再出建議');
    const posR = dlPos(), cellR = cells(1) + '/' + cells(2);
    ok(QA('text[data-dof]').filter(f => f.getAttribute('x') === QA('text[data-dlab="Dn+6"]')[0].getAttribute('x'))[0].getAttribute('data-dof') === '6', 'SHL 正向：Dn+6 那條的小字是 Data 6（對應 ② 表格 Data 6）');
    fire($('dm-pv-drv'), 'r');
    ok(dlPos() === posR && cells(1) + '/' + cells(2) !== cellR && T.getAttribute('data-dir') === 'rl' && +T.getAttribute('data-mis') > 0 && /SHL 反向/.test($('dm-pv-eq').textContent) && !/反＋反|等效/.test($('dm-pv-eq').textContent),
      'v1.17.2 切換 SHL（CH1 在右）：Data 線位置與標號完全不變，只有格內收到的資料改變（' + cellR + ' → ' + cells(1) + '/' + cells(2) + '）、顏色不符 ' + T.getAttribute('data-mis') + ' 格');
    { const dof = lab => { const e = QA('text[data-dlab="' + lab + '"]')[0]; const x = e && e.getAttribute('x'); const sm = QA('text[data-dof]').filter(f => f.getAttribute('x') === x)[0]; return sm ? sm.getAttribute('data-dof') : null; };
      const cellOf = dl => { const r = QA('rect[data-pv^="1:"][data-tier="main"]').filter(e => (e.getAttribute('data-in') || '').split(',').indexOf(dl + 'u') >= 0)[0]; return r ? r.getAttribute('data-dn') : null; };
      ok(dof('Dn+6') === '1' && dof('Dn+1') === '6' && cellOf('D12') === gridTxt(0)[0] && cellOf('D7') === gridTxt(0)[5],
        'v1.17.4 SHL 反向：大字位置不變，小字跟著倒過來（Dn+6 那條收 Data 1、Dn+1 收 Data 6），且格內資料＝② 表格同一個 Data k（Data 1＝' + gridTxt(0)[0] + '）'); }
    ok(QA('[data-rowhead="sd"] title').length === 1 && QA('[data-rowhead="tc"] title').length === 1 && /SD Out/.test(Q('[data-rowhead="sd"]').textContent) && /TCON Out/.test(Q('[data-rowhead="tc"]').textContent) && /② Data Mapping 表格/.test(Q('[data-rowhead="tc"] title').textContent),
      'TFT 接線圖上方兩列有英文列頭「SD Out」「TCON Out」，滑鼠提示寫完整說明');
    { fire($('dm-pv-drv'), 'f');
      const sd = () => QA('text[data-dlab]').map(e => e.getAttribute('data-dlab') + '@' + e.getAttribute('x')).join(','), tc = () => QA('text[data-dof]').map(e => e.getAttribute('data-dof')).join(','), pth = () => QA('path[data-dl]').map(p => p.getAttribute('d')).join('|');
      const sd0 = sd(), tc0 = tc(), p0 = pth(), scS = w.dmBuildScript().text;
      fire($('dm-pv-swap'), true);
      const m = { 1: 3, 3: 1, 4: 6, 6: 4, 2: 2, 5: 5 };
      ok(sd() === sd0 && pth() === p0 && tc() === tc0.split(',').map(k => String(m[k])).join(',') && w.dmBuildScript().text === scS,
        'v1.17.4 勾「輸出對調」⇒ SD Out 列（亮字、線位置）完全不變，TCON Out 列 1↔3、4↔6 對調（' + tc0 + ' → ' + tc() + '），匯出 script 不變');
      fire($('dm-pv-swap'), false);
      ok(tc() === tc0 && sd() === sd0, '取消對調 ⇒ TCON Out 回原樣'); }
    fire($('dm-pv-first'), 'l');
    ok(dlPos() !== posR && T.getAttribute('data-dir') === 'lr' && !d.querySelector('#dm-pv-tft [data-flip]') && QA('text[data-dlab="D1"]').length === 1, 'v1.17.2 切換 CH1 位置：Data 線位置與標號改變（D1…D6 從左排）');
    fire($('dm-pv-drv'), 'f'); fire($('dm-pv-first'), 'r'); fire($('dm-pv-stripe'), 'bgr');
    ok(+T.getAttribute('data-mis') > 0 && T.getAttribute('data-sugcombo') === 'lfbn', '子像素選 BGR ⇒ 顏色不符，建議 CH1 在最左＋正向＋BGR（＝RGB 正解的鏡像，僅驗證計算）');
    fire($('dm-pv-first'), 'l');
    ok(+T.getAttribute('data-mis') === 0 && QA('[data-misk]').length === 0 && $('dm-pv-sugbtn').classList.contains('hidden'), 'CH1 在最左＋正向＋BGR：鏡像組合也 24/24（計算驗證）');
    fire($('dm-pv-stripe'), 'rgb'); fire($('dm-pv-first'), 'r'); fire($('dm-pv-drv'), 'f');
    ok(+T.getAttribute('data-mis') === 0, '回到全民正確配置 CH1 最右＋正向＋RGB：24/24');
    /* v1.17.0 Panel mode 欄位逐一切換 ⇒ ③ 是否反應（Bruce 10/7「把 CHRB 打勾，③ 沒有任何變化」） */
    { const svg = () => T.innerHTML, g0 = [0, 1, 2, 3].map(gridTxt).join('|'), v0 = svg(), st0 = DM.cloneState(w.dmState.cur);
      const reg01 = () => /write -m 0401 ([0-9A-F]{2}) ([0-9A-F]{2})/.exec(w.dmBuildScript().text);
      fire($('f-chrb'), true);
      ok(w.dmState.cur.chrb === 1 && svg() !== v0 && [0, 1, 2, 3].map(gridTxt).join('|') === g0 && +T.getAttribute('data-mis') > 0 && !!Q('path[data-w="1:D1:u:R2"]') && !Q('path[data-w="1:D1:u:B2"]') && QA('[data-misk]').length > 0 && QA('rect[data-pv="1:B2"][data-dn="R2"]').length > 0,
        'CHRB 勾 ⇒ ③ 即時改：D1 收到的資料 B2→R2（R↔B，接線位置不變）、格內改寫收到的資料（B2 位置寫 R2）、面板顏色出現 ≠（' + T.getAttribute('data-mis') + ' 格）；② 仍顯示暫存器原值');
      ok(/CHRB＝1（R↔B）/.test($('dm-pvflags').textContent) && /CHRB＝1/.test($('dm-tsum').textContent) && (m => !!m && (parseInt(m[1], 16) & 8) === 8 && (parseInt(m[2], 16) & 8) === 8)(reg01()), 'CHRB 勾 ⇒ ③ 標示 CHRB＝1（R↔B）、② 摘要註明、匯出 script 0401 bit3＝1');
      fire($('f-chrb'), false);
      ok(svg() === v0 && +T.getAttribute('data-mis') === 0, 'CHRB 取消 ⇒ ③ 回到原圖、顏色 24/24 相符');
      fire($('f-chwb'), true);
      ok(svg() === v0 && /CHWB＝1/.test($('dm-pvflags').textContent), 'CHWB 勾 ⇒ ③ 接線與顏色不變（只反相灰階），③ 標示 CHWB＝1');
      fire($('f-chwb'), false);
      const rv = $('f-rvs').value; fire($('f-rvs'), '0x0000');
      ok(svg() === v0 && /READ_RVS＝0x0000/.test($('dm-pvflags').textContent), 'READ_RVS 改 0x0000 ⇒ ③ 不變（原廠未定義它和 force_sel 名稱的關係，不模擬），③ 標示目前值');
      fire($('f-rvs'), rv);
      fire($('f-tsel'), '3');
      ok(svg() !== v0 && $('dm-c0-0').getAttribute('data-t') === '3' && [0, 1, 2, 3].map(gridTxt).join('|') !== g0, 'T 表改 T3 ⇒ ② 名稱與 ③ 接線一起變');
      w.dmState.cur = Object.assign(DM.cloneState(w.dmState.cur), { deEn: st0.deEn, deSel: st0.deSel }); w.dmRender();
      ok(svg() === v0, 'T 表改回（FORCE_DE_SEL 0x1F）⇒ ③ 回到原圖');
      fire($('f-mirror'), false);
      ok(svg() !== v0, 'Mirror 改 0 ⇒ ③ 接線改變');
      fire($('f-mirror'), true);
      ok(svg() === v0 && [0, 1, 2, 3].map(gridTxt).join('|') === g0, 'Mirror 改回 1 ⇒ ②③ 回到原樣'); }
    fire($('dm-pv-stripe'), 'rgb');
    ok([0, 1, 2, 3].map(r => $('dm-rh' + r).textContent).join('|') === 'Line 1（_0）|Line 2（_1）|Line 3（_2）|Line 4（_3）' && $('dm-c1-5').value !== $('dm-c0-5').value, '② 列名 Line 1~4，Line 2 顯示 _1 原值（不是 Line 1 的複本）');
    /* v1.18.1 ③「確定此架構（鎖定接線）」：Mirror＝1 鎖定 ⇒ 改 Mirror＝0：接線不動、格內資料變、出現 ≠ ⇒ 改回 1 全部一致 ⇒ 解除鎖定回到原行為；匯入新 code 自動解除 */
    { const sum = () => $('dm-pv-lockst').getAttribute('data-ok'), svgU = $('dm-pv-tft').innerHTML, scU = w.dmBuildScript().text;
      ok($('dm-pv-lock').getAttribute('data-locked') === '0' && /未鎖定/.test($('dm-pv-lockst').textContent) && QA('[data-glne]').length === 0, '預設未鎖定：③ 照 v1.17.5 畫法，卡片標「未鎖定」');
      $('dm-pv-lock').click();
      const wires = () => QA('path[data-w]').map(p => p.getAttribute('data-w') + '|' + p.getAttribute('d')).join('\n'), wire0 = wires(), dn0 = QA('rect[data-dn]').map(r => r.getAttribute('data-dn')).join(',');
      ok($('dm-pv-lock').getAttribute('data-locked') === '1' && /已鎖定/.test($('dm-pv-lockst').textContent) && sum() === '24/24' && $('dm-pv-tft').innerHTML === svgU && $('dm-pv-lock').textContent === '解除鎖定',
        'v1.18.1 按「確定此架構（鎖定接線）」⇒ 卡片標「🔒 已鎖定」、和 ② 一致 24/24，③ 畫面和鎖定前逐字相同：' + $('dm-pv-lockst').textContent);
      const dofs = () => QA('text[data-dof]').map(e => e.getAttribute('data-dof')).join(','), reps = () => QA('path[data-dl]').map(p => p.getAttribute('data-rep')).join(','), dof0 = dofs(), rep0 = reps();
      const mainCellOf = dl => { const r = QA('rect[data-pv^="1:"]').filter(e => (e.getAttribute('data-in') || '').split(',').indexOf('D' + dl + 'u') >= 0)[0]; return r ? r.getAttribute('data-dn') : null; };
      const mainLines = () => QA('path[data-dl][data-rep="0"]').map(p => +p.getAttribute('data-dl'));
      const kOf = dl => +QA('text[data-dof]')[dl - 1].getAttribute('data-dof');
      const endNm = (n, u) => { const m = /^([RGB])(-?\d+)$/.exec(n); let p = +m[2]; if (u === 2) { const z = p > 0 ? p - 1 : p, g = Math.floor(z / 2), z2 = 2 * g + (1 - (z - 2 * g)); p = z2 >= 0 ? z2 + 1 : z2; } return m[1] + '末' + p; };
      fire($('f-mirror'), false);
      const g0 = gridTxt(0), cellsM0 = mainLines().map(dl => mainCellOf(dl)).join(' ');
      ok(wires() === wire0 && QA('rect[data-dn]').map(r => r.getAttribute('data-dn')).join(',') !== dn0 && QA('[data-glne]').length > 0 && sum() !== '24/24' && /面板要 .+、收到 /.test(Q('[data-glne]').parentNode.getAttribute('data-tip') || '') && w.dmBuildScript().text !== scU,
        '鎖定後 Mirror 改 0 ⇒ 線位置與 drain 目標完全不動，只有格內收到的資料改變，' + QA('[data-glne]').length + ' 格標紅虛框＋「≠」並寫「面板要 X、收到 Y」（' + sum() + '）；匯出照 ② 改變（鎖定不影響匯出）');
      ok(dofs() === dof0 && reps() === rep0 && mainLines().length === 6 && mainLines().every(dl => mainCellOf(dl) === endNm(g0[kOf(dl) - 1], 1)) && /^Data \d・P末/.test(Q('[data-glne]').parentNode.getAttribute('data-tip') || ''),
        'v1.18.4 方案 A：鎖定後 Mirror 改 0 ⇒ TCON Out 小字與亮的主循環不變；主循環每條線格內＝「末」＋② 同一個 Data k 的名稱（' + cellsM0 + '），提示寫 Data k・P末j');
      fire($('dm-mir-unit'), '2');
      ok(mainLines().every(dl => mainCellOf(dl) === endNm(g0[kOf(dl) - 1], 2)) && wires() === wire0 && dofs() === dof0 && /2 pixel 一組/.test($('dm-mir-unit').selectedOptions[0].textContent),
        'v1.18.4 反轉單位選「2 pixel 一組」⇒ 末1／末2 組內對調（' + mainLines().map(dl => mainCellOf(dl)).join(' ') + '），接線與 TCON Out 不動');
      fire($('dm-mir-unit'), '1');
      ok(QA('rect[data-glne]').length === QA('[data-glne]').length && QA('rect[data-glne][stroke-dasharray]').length > 0 && !/≠鎖定/.test($('dm-pv-tft').textContent) && $('card-pv').classList.contains('dm-locked') && /接線已鎖定/.test($('dm-pv-wrap').getAttribute('data-locktag')) && /紅虛框的判斷條件/.test(d.querySelector('[data-i18n-title="dm.hLockT"]').getAttribute('title')),
        'v1.18.2 鎖定提示：TFT 接線圖外框 highlight＋「🔒 接線已鎖定」標籤；不一致的格子保留紅虛框（字縮成「≠」），ⓘ 寫出判斷條件');
      fire($('f-mirror'), true);
      ok(sum() === '24/24' && QA('[data-glne]').length === 0 && w.dmBuildScript().text === scU, 'Mirror 改回 1 ⇒ 全部一致，匯出和鎖定前逐字相同');
      $('dm-pv-lock').click();
      ok($('dm-pv-lock').getAttribute('data-locked') === '0' && $('dm-pv-tft').innerHTML === svgU, '解除鎖定 ⇒ 回到 v1.17.5 畫法（和鎖定前逐字相同）');
      /* v1.18.6（Bruce 10/8）：鎖定後 Driver／面板／型號停用，TCON（② 全部）可改；同型號匯入只改 TCON 值、保留鎖定；清除匯入保留鎖定；換型號要先解鎖 */
      const HW = ['dm-model', 'dm-pv-swap', 'dm-pv-first', 'dm-pv-drv', 'dm-pv-stripe', 'dm-pv-lod'], TC = ['f-mirror', 'f-chrb', 'f-chwb', 'dm-hand', 'f-deEn', 'f-tsel', 'f-rvs'];
      const first0 = $('dm-pv-first').value, stripe0 = $('dm-pv-stripe').value;
      $('dm-pv-lock').click();
      ok(HW.every(id => $(id).disabled) && TC.every(id => !$(id).disabled) && QA2('.dm-locknote:not(.hidden)').length === 2 && $('dm-drv-form').classList.contains('dm-hwlocked') && $('dm-pan-form').classList.contains('dm-hwlocked') && /解除鎖定後才能改/.test($('dm-pv-drv').title),
        'v1.18.6 鎖定後：型號、Driver 區（對調、CH1、SHL）、面板區（子像素排列）、Line OD 測試來源停用並標「已鎖定，解鎖後才能改」；TCON 欄位（Mirror、CHRB、CHWB、Hand、FORCE_DE、T 表、READ_RVS）可改');
      const m0 = w.dmState.model || $('dm-model').value; fire($('dm-pv-first'), first0 === 'r' ? 'l' : 'r'); fire($('dm-pv-stripe'), stripe0 === 'rgb' ? 'bgr' : 'rgb'); fire($('dm-model'), 'EM02');
      ok($('dm-pv-first').value === first0 && $('dm-pv-stripe').value === stripe0 && $('dm-model').value === m0 && $('dm-pv-lock').getAttribute('data-locked') === '1', 'v1.18.6 鎖定中強行改 CH1／子像素排列／型號 ⇒ 被擋下、值不變、仍鎖定');
      w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM)); await new Promise(r => setTimeout(r, 80));
      ok($('dm-pv-lock').getAttribute('data-locked') === '1' && $('dm-pv-first').value === first0 && $('dm-pv-stripe').value === stripe0, 'v1.18.6 鎖定中匯入同型號 code ⇒ 只改 TCON 值，鎖定與 Driver／面板設定保留');
      if (w.dmClearImport) { w.dmClearImport(); await new Promise(r => setTimeout(r, 30)); ok($('dm-pv-lock').getAttribute('data-locked') === '1' && $('dm-pv-first').value === first0, 'v1.18.6 鎖定中清除匯入 ⇒ TCON 值回預設，鎖定與 Driver／面板設定保留'); }
      $('dm-pv-lock').click();
      ok($('dm-pv-lock').getAttribute('data-locked') === '0' && HW.every(id => !$(id).disabled) && QA2('.dm-locknote:not(.hidden)').length === 0, 'v1.18.6 解除鎖定 ⇒ Driver／面板／型號恢復可改');
      w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM)); await new Promise(r => setTimeout(r, 80)); }
    /* v1.17.3：匯入 A 後手動改 ③，再匯入 B ⇒ ③ 回預設、SHL 依 B 帶入（B＝全民 code 去掉 iSP 設定，0x0F00＝0 ⇒ 沒有 SHL ⇒ 正向） */
    fire($('dm-pv-swap'), true); fire($('dm-pv-first'), 'r'); fire($('dm-pv-stripe'), 'bgr'); fire($('dm-pv-drv'), 'r');
    { const b = new Uint8Array(fs.readFileSync(QM)); b[0x0F00] = 0; w.dmImportBytes(b, 'B_noISP_' + path.basename(QM)); await new Promise(r => setTimeout(r, 80)); }
    ok(!$('dm-pv-swap').checked && $('dm-pv-first').value === 'l' && $('dm-pv-stripe').value === 'rgb' && $('dm-pv-drv').value === 'f', 'v1.17.3 改過 ③ 後匯入 B（沒有 iSP SHL）⇒ ③ 全部回預設、Driver 方向用預設正向');
    fire($('dm-pv-drv'), 'r'); fire($('dm-pv-first'), 'r');
    w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM)); await new Promise(r => setTimeout(r, 80));
    ok($('dm-pv-first').value === 'l' && $('dm-pv-drv').value === 'f', '再匯入全民 code ⇒ ③ 回預設，Driver 方向正向');
    /* v1.18.5（Bruce 10/8）：Driver 設定和 code 脫鉤：code 的 iSP REG_1 SHL＝0 也不帶入反向；換型號、清除匯入都回正向 */
    { const b = new Uint8Array(fs.readFileSync(QM)); for (let i = 0; i < 16; i++) b[0x1001 + 4 * i] &= ~4;
      fire($('dm-pv-drv'), 'r'); w.dmImportBytes(b, 'SHL0_' + path.basename(QM)); await new Promise(r => setTimeout(r, 80));
      ok($('dm-pv-drv').value === 'f', 'v1.18.5 匯入 iSP REG_1 SHL＝0 的 code ⇒ Driver 仍預設正向（不連動 code）');
      fire($('dm-pv-drv'), 'r'); if (w.dmClearImport) w.dmClearImport(); else { fire($('dm-model'), 'EM02'); }
      ok($('dm-pv-drv').value === 'f', 'v1.18.5 手動改反向後清除匯入 ⇒ 回正向');
      fire($('dm-pv-drv'), 'r'); fire($('dm-model'), 'EM02'); await new Promise(r => setTimeout(r, 30));
      ok($('dm-pv-drv').value === 'f', 'v1.18.5 手動改反向後換型號 ⇒ 回正向'); }
    /* v1.18.5（Bruce 10/8「不是 Hand Mode…按接線鎖定以後全部都是灰的」）：Auto Mode 也能鎖定：鎖定瞬間 ③ 逐字不變、沒有變灰；切 Mirror 接線不動 */
    { let bad = [], n = 0;
      for (const m of ['EM01', 'EM02', 'E512', 'E503', 'DAZ6138', 'DAZ6111', 'DAZ7353']) {
        if (![...$('dm-model').options].some(o => o.value === m)) continue;
        fire($('dm-model'), m); await new Promise(r => setTimeout(r, 20));
        if ($('dm-hand').checked) fire($('dm-hand'), false);
        if ($('dm-autorow').classList.contains('hidden')) continue;
        const A = $('dm-auto');
        for (let i = 0; i < A.options.length; i++) {
          A.selectedIndex = i; A.dispatchEvent(new w.Event('change')); if ($('dm-hand').checked) fire($('dm-hand'), false);
          const T = $('dm-pv-tft'), svg0 = T.innerHTML, dum0 = QA('rect[data-tier="dummy"]').length;
          $('dm-pv-lock').click(); n++;
          if (T.innerHTML !== svg0 || QA('rect[data-tier="dummy"]').length !== dum0 || $('dm-pv-lock').getAttribute('data-locked') !== '1') bad.push(m + ':' + A.options[i].text.slice(0, 20));
          $('dm-pv-lock').click();
        }
      }
      ok(n > 50 && bad.length === 0, 'v1.18.5 Auto Mode 鎖定：' + n + ' 種 Auto Type（各型號）鎖定瞬間 ③ 逐字不變、不變灰' + (bad.length ? '；有問題：' + bad.slice(0, 5).join('、') : ''));
      fire($('dm-model'), 'EM02'); if ($('dm-hand').checked) fire($('dm-hand'), false); $('dm-auto').selectedIndex = 0; $('dm-auto').dispatchEvent(new w.Event('change')); if ($('dm-hand').checked) fire($('dm-hand'), false);
      const wiresA = () => QA('path[data-w]').map(p => p.getAttribute('data-w') + '|' + p.getAttribute('d')).join('\n');
      $('dm-pv-lock').click(); const wa = wiresA(), sa = $('dm-pv-lockst').getAttribute('data-ok');
      fire($('f-mirror'), !$('f-mirror').checked);
      ok(wiresA() === wa && /^(\d+)\/\1$/.test(sa) && QA('rect[data-dn]').some(r => /末/.test(r.getAttribute('data-dn'))), 'v1.18.5 EM02 Auto（' + $('dm-auto').options[0].text.slice(0, 16) + '）鎖定後切 Mirror：接線不動、格內改「末」編號（和 Hand 相同行為）');
      fire($('f-mirror'), !$('f-mirror').checked); $('dm-pv-lock').click(); }
    /* v1.18.7（Bruce 10/8）：鎖定後的畫面樣式：全白（預設）／只送紅／綠／藍：依收到的資料亮、亮的用實體子像素顏色 */
    { const cm = $('dm-pv-colmode'), btn = c => cm.querySelector('button[data-col="' + c + '"]'), cells = () => QA('rect[data-tier="main"], rect[data-tier="rep"]');
      const svgU = $('dm-pv-tft').innerHTML;
      ok(cm.classList.contains('hidden'), 'v1.18.7 未鎖定時不顯示畫面樣式按鈕');
      w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM)); await new Promise(r => setTimeout(r, 80));
      $('dm-pv-lock').click();
      ok(!cm.classList.contains('hidden') && btn('').getAttribute('aria-pressed') === 'true' && QA('[data-col]').length === 0, 'v1.18.7 鎖定後出現「全白／只送紅／只送綠／只送藍」，預設全白（全都送，畫面和鎖定時相同）');
      const chk = c => { const on = QA('rect[data-col="on"]'), off = QA('rect[data-col="off"]'); return on.length > 0 && off.length > 0 && on.every(r => r.getAttribute('data-dn')[0] === c && r.getAttribute('fill') !== 'none') && off.every(r => r.getAttribute('fill') === 'none' && r.getAttribute('data-dn')[0] !== c); };
      btn('R').click(); const okR = chk('R'); btn('G').click(); const okG = chk('G'); btn('B').click(); const okB = chk('B');
      ok(okR && okG && okB && btn('B').getAttribute('aria-pressed') === 'true', 'v1.18.7 Hand（全民）只送紅／綠／藍：收到該色資料的格子亮、其餘透明只留虛框');
      fire($('f-chrb'), true); btn('R').click();
      const onR = QA('rect[data-col="on"]'), onB = onR.filter(r => r.getAttribute('data-phys') === 'B');
      ok(onR.length > 0 && onB.length > 0 && onB.every(r => r.getAttribute('data-dn')[0] === 'R') && onB.every(r => /^rgb\(\s*\d+,\s*\d+,\s*(\d+)\)/.exec(r.getAttribute('fill')) && +/(\d+)\)$/.exec(r.getAttribute('fill'))[1] > 150),
        'v1.18.7 鎖定後改 CHRB（R↔B）再只送紅：收到 R 資料的格子落在實體 B 位置，亮藍色（實體子像素顏色）：' + onB.length + ' 格');
      fire($('f-chrb'), false);
      $('dm-pv-lock').click();
      ok(cm.classList.contains('hidden') && $('dm-pv-tft').innerHTML === svgU, 'v1.18.7 解鎖 ⇒ 畫面樣式按鈕隱藏並重設，③ 回到未鎖定畫法');
      $('dm-pv-lock').click();
      ok(btn('').getAttribute('aria-pressed') === 'true' && QA('[data-col]').length === 0, 'v1.18.7 再次鎖定 ⇒ 回到全白');
      $('dm-pv-lock').click();
      /* Auto：EM02 Auto (0) 鎖定後換 RT7 Type 再只送綠：亮的格子＝收到 G 的格子，顏色＝實體子像素顏色 */
      fire($('dm-model'), 'EM02'); if ($('dm-hand').checked) fire($('dm-hand'), false); $('dm-auto').selectedIndex = 0; $('dm-auto').dispatchEvent(new w.Event('change')); if ($('dm-hand').checked) fire($('dm-hand'), false);
      $('dm-pv-lock').click();
      $('dm-auto').selectedIndex = Math.min(2, $('dm-auto').options.length - 1); $('dm-auto').dispatchEvent(new w.Event('change')); if ($('dm-hand').checked) fire($('dm-hand'), false);
      btn('G').click();
      const onG = QA('rect[data-col="on"]'), physOf = r => r.getAttribute('data-phys');
      ok($('dm-pv-lock').getAttribute('data-locked') === '1' && onG.length > 0 && onG.every(r => r.getAttribute('data-dn')[0] === 'G') && onG.every(r => { const f = r.getAttribute('fill'); const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(f); if (!m) return false; const v = [+m[1], +m[2], +m[3]], i = 'RGB'.indexOf(physOf(r)); return v[i] === Math.max(...v); }),
        'v1.18.7 Auto（EM02，鎖定後換 RT7 Type「' + $('dm-auto').options[$('dm-auto').selectedIndex].text.slice(0, 18) + '」）只送綠：亮 ' + onG.length + ' 格，都是收到 G 的格子，顏色依實體子像素（實體非 G 的有 ' + onG.filter(r => physOf(r) !== 'G').length + ' 格）');
      $('dm-pv-lock').click(); }
  }
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_kickoff ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
