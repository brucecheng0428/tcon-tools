#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_lod.js — v1.7.0「測試：Line OD Type」回歸
   用法：node tools/check_datamap_lod.js [repo] [--src <VCL_TV_TCON_EM02_Tool 目錄>]
     1) 反推接線算回的 Line OD 48 個值＝原廠表（33 個 Type 全部）；故意改錯的接線一定要被抓到。
     2) 給 --src：common/datamap-lod.js 的名稱與暫存器值和原廠 App/Table/RApp_Table.h stLOD_DataType[] 逐字比對（原廠檔只讀）。
     3) jsdom：下拉切換每個 Type 都畫得出來、不出錯；不改 ② 的值、不改匯出 script；選回「不使用」⇒ 預覽和切換前完全相同。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2), si = args.indexOf('--src'), SRC = si >= 0 ? args[si + 1] : null;
const pos = args.filter((a, i) => a !== '--src' && (si < 0 || i !== si + 1));
const ROOT = path.resolve(pos[0] || path.join(__dirname, '..'));
const LOD = require(path.join(ROOT, 'common/datamap-lod.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const diff = (t, d) => { const b = []; ['r', 'g', 'b'].forEach(c => { for (let i = 0; i < 16; i++) if (d.reg[c][i] !== t.reg[c][i]) b.push(c + i); }); return b; };

console.log('── 反推接線 → Line OD 暫存器值（逐 Type 48 格）');
ok(LOD.TYPES.length === 33 && LOD.TYPES.every((t, i) => t.no === i && new RegExp('^' + i + '\\.').test(t.name)), '33 個 Type、編號 0~32');
LOD.TYPES.forEach(t => { const d = LOD.deriveReg(t), b = diff(t, d); ok(!b.length && !d.clash.length, t.name + '：' + (b.length ? '不一致 ' + b.join(',') : '') + (d.clash.length ? ' 同格兩值 ' + d.clash.join(',') : '')); });
console.log('── 驗算本身會抓錯（反例）');
const mut = (t, f) => { const u = Object.assign({}, t); u.rows = f(t.rows.map(l => l.map(r => r.slice()))); return u; };
ok(diff(LOD.TYPES[1], LOD.deriveReg(mut(LOD.TYPES[1], r => [r[1], r[0]]))).length > 0, 'Type 1 的兩列對調（變成 RL）⇒ 不一致');
ok(diff(LOD.TYPES[23], LOD.deriveReg(mut(LOD.TYPES[23], r => { r[0][0] = r[0][0].map(x => x); const a = r[0][0]; [a[0], a[2]] = [a[2], a[0]]; return r; }))).length > 0, 'Type 23 上 gate D1↔D3 ⇒ 不一致');
ok(diff(LOD.TYPES[9], LOD.deriveReg(Object.assign({}, LOD.TYPES[9], { mir: 0 }))).length > 0, 'Type 9 拿掉 Mirror ⇒ 不一致（Mirror 與非 Mirror 的值確實不同）');
ok(diff(LOD.TYPES[31], LOD.deriveReg(Object.assign({}, LOD.TYPES[31], { rows: LOD.TYPES[30].rows }))).length > 0, 'Type 31 用 Type 30 的接線 ⇒ 不一致');
console.log('── ② 表格形式');
const t23 = LOD.lines12(LOD.TYPES[23]);
ok(t23.map(r => r.names.slice(0, 6).join(' ')).join('/') === 'R1 B1 G2 R3 B3 G4/G1 R2 B2 G3 R4 B4/G-1 R1 B1 G2 R3 B3/B-1 G1 R2 B2 G3 R4', 'Type 23 ＝ 原廠預設樣式 (23) 的 ② 值');
const t32 = LOD.lines12(LOD.TYPES[32]).map(r => r.names.slice(0, 6)), sw = a => [a[2], a[1], a[0], a[5], a[4], a[3]];
ok(t32.map(r => sw(r).join(' ')).join('/') === 'G2 B1 G1 G4 B3 G3/B2 R2 R1 B4 R4 R3/B1 G1 G-1 B3 G3 G2/R2 R1 B-1 R4 R3 B2', 'Type 32 做 D1↔D3、D4↔D6 ＝ 原廠預設樣式 (32)（＝蘇坤 code）');
ok(LOD.lines12(LOD.TYPES[17]) === null && LOD.lines12(LOD.TYPES[7]).length === 8, 'Tri 沒有 ② 形式；Type 7 有 8 條 line');

console.log('── v1.8.0 命名原理（設計者說明：L／R＝同一直行每列接左／右 Data 線；Tri 依 gate 列）');
const NC = LOD.TYPES.map(t => LOD.nameCheck(t));
LOD.TYPES.forEach((t, i) => { const c = NC[i]; if (c.ok === null) ok([27, 29].includes(i) && c.act.join('') === 'RRLL', t.name + '：名稱「2RRRL」無法逐列解讀，實際 RL（每條 line 上下 gate 同側）：' + c.act.join(''));
  else ok(c.ok && !c.act.includes('?'), t.name + '：名稱推出 ' + c.exp.join('') + '＝接線 ' + c.act.join('')); });
ok(LOD.expectSides(LOD.TYPES[19]).join('') === 'LLLRRR' && LOD.expectSides(LOD.TYPES[18]).join('') === 'LRLRLR' && LOD.expectSides(LOD.TYPES[5]).join('') === 'LRRL', '展開：19＝LLLRRR（逐 gate 列）、18 的 LR 循環成 LRLRLR、5＝LRRL（逐 line）');
ok(LOD.nameCheck(mut(LOD.TYPES[5], r => [r[0], r[1], r[1], r[1]])).ok === false && LOD.nameCheck(mut(LOD.TYPES[19], r => [r[1], r[0]])).ok === false, '反例：5 改成 LRRR、19 改成 RRRLLL ⇒ 命名原理抓得到');
console.log('── v1.8.0 重複週期');
const PER = LOD.TYPES.map(t => LOD.period(t));
ok(PER.every((p, i) => p && p.lines === (i === 29 ? 12 : 6)), '週期：只有 29 是 12 條 Data 線，其餘 32 個都是 6 條：' + PER.map(p => p.lines).join(','));
ok(PER[29].px === 8 && PER[31].px === 4 && PER[30].px === 4 && PER[0].px === 2 && PER[17].px === 6 && PER[21].px === 6, '平移量：29＝8 pixel、30／31＝4 pixel（Dual 6 條×2 顆）、Single 2、Tri 6');
ok([0, 1, 2, 3, 4, 5].every(c => [0, 1].every(g => LOD.at(LOD.TYPES[31], 0, g, c + 6) === LOD.at(LOD.TYPES[31], 0, g, c) + 12)) && [0, 1, 2, 3, 4, 5].some(c => LOD.at(LOD.TYPES[29], 0, 0, c + 6) !== LOD.at(LOD.TYPES[29], 0, 0, c) + 12), "31：D7~D12＝D1~D6＋4 pixel（6 條就重複）；29：D7~D12 不是 D1~D6＋4 pixel（例：D8 上 R5≠B-1＋4px）");

console.log('── v1.9.0 原廠 E512_V512 data mapping 圖解 xlsx 範例（T 表解碼）');
ok(LOD.tName(1, 0) === LOD.lin('R1') && LOD.tName(1, 6) === LOD.lin('R-2') && LOD.tName(2, 6) === LOD.lin('R1') && LOD.tName(2, 17) === LOD.lin('B-1') && LOD.tName(4, 18) === LOD.lin('R1') && LOD.tName(1, 12) === null, 'T 表：T1 0→R1、6→R-2；T2 6→R1、17→B-1；T4 18→R1；T1 沒有 12 以上');
LOD.XLSX_CASES.forEach(c => { const r = LOD.xlsxCheck(c);
  if (c.id === 'zz5' || c.id === 'zz6') { const sw = LOD.xlsxCheck(Object.assign({}, c, { lod: c.id === 'zz5' ? 6 : 5 }));
    ok(!r.ok && r.bad.every(b => / D[2-6] /.test(b)) && sw.bad.every(b => / D1 /.test(b)) && sw.bad.length === 8, 'xlsx ' + c.id + '：r0 欄＝' + (c.id === 'zz5' ? 'LRRL' : 'RLLR') + '，g0~b1 五欄是相反的序列（xlsx 本身不一致）'); }
  else ok(r.ok, 'xlsx ' + c.id + ' ＝ Line OD Type ' + c.lod + ' 逐格一致' + (r.ok ? '' : '：' + r.bad.slice(0, 4).join(', '))); });

if (SRC) {
  console.log('── 原廠原始碼逐字比對：' + SRC);
  const h = fs.readFileSync(path.join(SRC, 'App/Table/RApp_Table.h'), 'latin1');
  const a = h.indexOf('LOD_DataType_st stLOD_DataType['), b = h.indexOf('};', a), body = h.slice(a, b);
  const rows = body.split('\n').filter(l => /^\s*"/.test(l)).map(l => { const m = /^\s*"([^"]*)"\s*((?:,\s*\d+\s*)+)/.exec(l); return { name: m[1], v: m[2].split(',').map(x => x.trim()).filter(Boolean).map(Number) }; });
  ok(rows.length === 33, '原廠 stLOD_DataType 33 筆（User define 是第 34 格、註解掉）：' + rows.length);
  rows.forEach((r, i) => { const t = LOD.TYPES[i], R = t.reg, mine = [R.de, R.spec, R.line, R.pix].concat(R.r, R.g, R.b);
    ok(r.name === t.name && r.v.length === 52 && r.v.every((x, k) => x === mine[k]), 'Type ' + i + ' 名稱與 52 個值逐字相同：' + r.name); });
  const img = fs.readdirSync(path.join(SRC, 'Image/LineOD'));
  ok(LOD.TYPES.every(t => img.includes(t.img + '.png')), '每個 Type 的原廠圖檔都存在（Image/LineOD）');
  const cpp = fs.readFileSync(path.join(SRC, 'App/Table/RApp_Table.cpp'), 'latin1');
  ok(/ListBox_LOD_mapping_type->Items->Add\("User define"\)/.test(cpp), '原廠清單最後一項是 "User define"');
}

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
  const ui = () => [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value).join(' ')).join('/');
  ok(/^v1\.9\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.9.x：' + w.TOOL_VERSIONS.datamap);
  const sel = $('dm-pv-lod');
  ok(!!sel && sel.closest('#card-pv') && sel.options.length === 35 && sel.options[0].value === '-1' && sel.options[34].disabled && /User define/.test(sel.options[34].textContent), '下拉在 ③ 卡片：不使用＋Type 0~32＋User define（停用）');
  ok(Array.from(sel.options).slice(1, 34).every((o, i) => o.textContent === LOD.TYPES[i].name), '選項名稱照原廠');
  ok(/不與 code 連動/.test($('dm-lodbar').textContent), '旁邊註明「測試用：依原廠 Line OD Type 反推，不與 code 連動」');
  fire($('dm-model'), 'EM02'); fire($('dm-hand'), true); fire($('dm-gate'), 'Dual-Gate');
  [['G2', 'B1', 'G1', 'G4', 'B3', 'G3'], ['B2', 'R2', 'R1', 'B4', 'R4', 'R3'], ['B1', 'G1', 'G-1', 'B3', 'G3', 'G2'], ['R2', 'R1', 'B-1', 'R4', 'R3', 'B2']].forEach((row, r) => row.forEach((x, c) => fire($('dm-c' + r + '-' + c), x)));
  const cur0 = JSON.stringify(w.dmState.cur), sc0 = JSON.stringify(w.dmBuildScript()), ui0 = ui(), svg0 = $('dm-pv-tft').innerHTML, tag0 = $('dm-pvtag').textContent;
  ok(!$('dm-lodbar').classList.contains('on') && $('dm-lodinfo').classList.contains('hidden') && $('dm-lodgridbox').classList.contains('hidden'), '預設不使用：說明與反推表隱藏');
  for (const t of LOD.TYPES) {
    fire(sel, String(t.no));
    const nl = Math.max(2, t.rows.length), G = t.rows[0].length, per = LOD.period(t).lines, nD = 2 * per, NG = { single: 1, dual: 2, tri: 3 }[t.g];
    const ud = gi => NG === 3 ? 'g' + (gi + 1) : (gi ? 'd' : 'u');
    const lab = new RegExp('Line OD Type ' + t.no + '\\b');
    let good = lab.test($('dm-pvtag').textContent) && $('dm-lodchk').getAttribute('data-ok') === '1' && $('dm-lodgrid').querySelectorAll('tr[data-row]').length === nl * G;
    good = good && $('dm-lodname').getAttribute('data-ok') === ([27, 29].includes(t.no) ? 'na' : '1') && +$('dm-lodper').getAttribute('data-period') === per;
    good = good && Array.from($('dm-lodgrid').querySelectorAll('tr[data-row]')).every(tr => { const [li, gi] = tr.getAttribute('data-row').split(':').map(Number);
      return Array.from(tr.querySelectorAll('td')).every((td, c) => { const x = LOD.at(t, li, gi, c); return td.textContent === (x === null ? 'X' : LOD.name(x)); }); });
    const gates = QA('text[data-glabel]').map(x => x.textContent);
    const expG = []; for (let k = 0; k < nl; k++) for (let g = 0; g < NG; g++) { const q = k % 4; expG.push(NG > 1 ? 'Line ' + (k + 1) + '-' + (g + 1) : 'Line ' + ((q >> 1) + 1) + '-' + ((q & 1) + 1) + (k >= 4 ? '′' : '')); }
    good = good && !$('dm-pvbody').classList.contains('hidden') && gates.join(',') === expG.join(',') && QA('circle[data-dot="gate"]').length === nD * expG.length && QA('path[data-dl]').length === nD;
    good = good && +$('dm-pv-tft').getAttribute('data-plines') === per && +$('dm-pv-tft').getAttribute('data-ng') === NG;
    good = good && LOD.linesN(t, nD).every(r => r.names.every((nm, p) => nm === 'X' || !!Q('path[data-w="' + r.line + ':D' + (p + 1) + ':' + ud(r.gate - 1) + ':' + nm + '"]') || (Q('text[data-send="' + r.line + ':D' + (p + 1) + ud(r.gate - 1) + '"]') || {}).textContent === '!' + nm));
    good = good && !Q('[data-bad]');
    /* 三級亮度依週期：主循環（D1~D週期）接到的 ⇒ main；只有重複組接到 ⇒ rep */
    good = good && QA('rect[data-pv]').every(r => { const ins = r.getAttribute('data-in').split(',').filter(Boolean).map(x => +/^D(\d+)/.exec(x)[1]), pre = /-/.test(r.getAttribute('data-pv').split(':')[1]);
      return r.getAttribute('data-tier') === (!pre && ins.some(n => n <= per) ? 'main' : (ins.length ? 'rep' : 'dummy')); });
    good = good && JSON.stringify(w.dmState.cur) === cur0 && JSON.stringify(w.dmBuildScript()) === sc0 && ui() === ui0;
    ok(good, 'Type ' + t.name + '：' + t.g + '，' + nl + ' 條 line × ' + NG + ' gate，週期 ' + per + '（畫 D1~D' + nD + '），drain 照反推表、亮度依週期；驗算／命名一致；② 與匯出 script 不變');
  }
  console.log('── 代表 Type 細節');
  fire(sel, '1');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && !!Q('path[data-w="2:D1:u:B-1"]') && !!Q('path[data-w="2:D2:u:R1"]'), 'Type 1：2N 列 D1→R1；2N+1 列 D1→B-1、D2→R1');
  fire(sel, '23');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && !!Q('path[data-w="1:D1:d:G1"]') && !!Q('path[data-w="2:D1:u:G-1"]'), 'Type 23：D1 上→R1、下→G1；第二列 D1 上→G-1');
  fire(sel, '29');
  ok(!!Q('path[data-w="1:D7:u:G4"]') && !!Q('path[data-w="1:D12:d:B7"]') && !!Q('path[data-w="1:D13:u:G8"]') && !!Q('path[data-dl="24"][data-rep="1"]') && !!Q('path[data-dl="12"][data-rep="0"]'), 'Type 29（週期 12）：D1~D12 都是主循環、D13~D24 是重複組（D13 上→G8＝D1 的 G-1 往右 8 pixel）');
  ok(Q('rect[data-pv="1:B7"]').getAttribute('data-tier') === 'main' && Q('rect[data-pv="1:G9"]').getAttribute('data-tier') === 'rep', 'Type 29：D12 接到的 B7 高亮、D13 起接到的 G9 暗色');
  fire(sel, '31');
  ok(+$('dm-pv-tft').getAttribute('data-plines') === 6 && !!Q('path[data-w="1:D7:u:R5"]') && Q('rect[data-pv="1:R5"]').getAttribute('data-tier') === 'rep', 'Type 31（週期 6＝4 pixel）：D7 上→R5（D1 的 R1 往右 4 pixel），R5 是重複組');
  console.log('── Tri-Gate TFT 圖');
  fire(sel, '19');
  ok(['Line 1-1', 'Line 1-2', 'Line 1-3', 'Line 2-1', 'Line 2-2', 'Line 2-3'].every(x => !!Q('line[data-gate="' + x.slice(5) + '"]')), 'Type 19：每列三條 Gate（Line k-1、k-2、k-3）');
  ok(!!Q('path[data-w="1:D1:g1:R1"]') && !!Q('path[data-w="1:D1:g2:G1"]') && !!Q('path[data-w="1:D1:g3:B1"]') && !!Q('path[data-w="2:D2:g1:R1"]') && !!Q('path[data-w="2:D1:g1:R-1"]'), 'Type 19 LLLRRR：Line 1-1~1-3 的 R1／G1／B1 接 D1（左），Line 2-1 的 R1 接 D2（右）');
  const gys = { }; QA('circle[data-dot="gate"]').forEach(c => { const k = c.getAttribute('data-tft').split(':'); gys[k[0] + k[2]] = +c.getAttribute('data-gy'); });
  ok(gys['1g1'] < gys['1g2'] && gys['1g2'] < +Q('rect[data-pv="1:R1"]').getAttribute('y') && gys['1g3'] > +Q('rect[data-pv="1:R1"]').getAttribute('y'), 'TFT 接到對應的 gate：Line 1-1 在最上、1-2 在方格上方、1-3 在方格下方');
  ok(/ A4 4 0 0 1 /.test(Q('path[data-w="1:D1:g1:R1"]').getAttribute('d')) && +Q('path[data-w="1:D1:g1:R1"]').getAttribute('data-hops') >= 1, '外側 gate（Line 1-1）的 drain 跨內側 gate 處畫跳線');
  const tg = $('dm-pv-tft').getAttribute('data-gaps').split(',').map(Number);
  ok(tg.length === 12 && tg.every((g, i) => !i || g - tg[i - 1] === 3), 'Tri：Data 線間距 3 顆（每條管 3 顆）：' + tg.join(','));
  fire($('dm-pv-swap'), true);
  ok(/D3\(1-1\)/.test(Q('rect[data-pv="1:R1"]').parentNode.getAttribute('data-tip')) && Q('path[data-dl="1"]').getAttribute('data-src') === '3', 'Tri＋Source Driver 對調：R1 改由 D3 送（D1 送 D3 的資料）');
  fire($('dm-pv-swap'), false);
  fire(sel, '21');
  ok(!!Q('path[data-w="1:D1:g1:R1"]') && !!Q('path[data-w="1:D1:g2:R3"]') && !!Q('path[data-w="1:D1:g3:R5"]') && !Q('[data-bad]'), 'Type 21 BOE Tri：D1 經三條 gate 接 R1、R3、R5，沒有衝突');
  fire(sel, '32');
  ok(!!Q('path[data-w="1:D1:u:G1"]') && /D1↑/.test(Q('rect[data-pv="1:G1"]').parentNode.getAttribute('data-tip')), 'Type 32：D1 上→G1');
  fire($('dm-pv-swap'), true);
  ok(/D3↑/.test(Q('rect[data-pv="1:G1"]').parentNode.getAttribute('data-tip')) && JSON.stringify(w.dmBuildScript()) === sc0, 'Type 32＋對調：G1 改由 D3 送；匯出不變');
  fire($('dm-pv-swap'), false);
  fire(sel, '7');
  ok(QA('text[data-gsub]').map(x => x.textContent.split(' ')[0]).join(',') === 'G1,G2,G3,G4,G5,G6,G7,G8' && !!Q('line[data-gate="2-2′"]'), 'Type 7：Single 8 條 gate G1~G8（G5~G8＝第二組 Line 1-1′~2-2′，同原廠 xlsx Zigzag 圖）');
  fire(sel, '5');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && !!Q('path[data-w="2:D2:u:R1"]') && !!Q('path[data-w="3:D2:u:R1"]') && !!Q('path[data-w="4:D1:u:R1"]'), 'Type 5 LRRL：R1 在 Line 1~4 依序接 D1、D2、D2、D1');
  fire(sel, '-1');
  ok($('dm-pv-tft').innerHTML === svg0 && $('dm-pvtag').textContent === tag0 && $('dm-lodinfo').classList.contains('hidden') && $('dm-lodgridbox').classList.contains('hidden'), '選回「不使用」⇒ 預覽與標籤回到 ② 的結果（逐字相同）');
  fire($('dm-c0-0'), 'R1');
  ok($('dm-pv-tft').innerHTML !== svg0 && !!Q('path[data-w="1:D1:u:R1"]'), '不使用時仍跟著 ② 連動');
  fire(sel, '23'); fire($('dm-c0-0'), 'B2');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && $('dm-c0-0').value === 'B2', '測試 Type 中改 ②：預覽仍照 Type（不連動），② 照常改');
  console.log('── v1.9.0 ② 依 code 的模式套 xlsx 範例（暫存器原值 → 預覽接線＝Line OD Type）');
  fire(sel, '-1'); fire($('dm-model'), 'EM02'); fire($('dm-hand'), true);
  const putCase = (id, f) => { const c = LOD.XLSX_CASES.find(x => x.id === id), v = c.v.split(' ').map(Number), S = w.dmState;
    const ns = Object.assign({}, S.cur, f); for (let sl = 0; sl < 4; sl++) for (let ch = 0; ch < 6; ch++) { ns['c' + (sl * 6 + ch)] = v[sl * 12 + ch]; ns['x' + (sl * 6 + ch)] = v[sl * 12 + 6 + ch]; }
    S.cur = ns; fire($('dm-pv-swap'), false); return c; };
  const wiresOf = (t, rows, NGx) => rows.every(([k, gi, line]) => [0, 1, 2, 3, 4, 5].every(c => { const x = LOD.at(t, line, gi, c); return x === null || !!Q('path[data-w="' + (k + 1) + ':D' + (c + 1) + ':' + (NGx === 2 ? (gi ? 'd' : 'u') : 'u') + ':' + LOD.name(x) + '"]'); }));
  putCase('zz1', { panel: 1, rd: 0, subPanel: 0 });
  ok(QA('text[data-gsub]').length === 4 && wiresOf(LOD.TYPES[1], [[0, 0, 0], [1, 0, 1], [2, 0, 0], [3, 0, 1]], 1), 'xlsx zz1（Zigzag type1）：G1~G4 照暫存器原值畫＝LRLR，和 Line OD Type 1 一致（Python UI 的 1-2＝1-1 複本無法表示這種接法）');
  putCase('zz7', { panel: 1, rd: 0, subPanel: 6 });
  ok(QA('text[data-gsub]').length === 8 && wiresOf(LOD.TYPES[7], [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k, 0, k]), 1), 'xlsx zz7（Zigzag type7，sub 6）：8 條 gate、G5~G8 用第二組＝LLLLRRRR');
  putCase('hsd1', { panel: 2, rd: 1, subPanel: 0 });
  ok(+$('dm-pv-tft').getAttribute('data-plines') === 6 && wiresOf(LOD.TYPES[22], [[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1]], 2), 'xlsx hsd_type1 ＝ Line OD Type 22（Dual，週期 6＝4 pixel）');
  putCase('hsd3_5', { panel: 2, rd: 1, subPanel: 2 });
  ok(wiresOf(LOD.TYPES[27], [[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1]], 2), 'xlsx hsd_type3-5 ＝ Line OD Type 27');
  putCase('hsd8', { panel: 2, rd: 1, subPanel: 4 });
  ok(+$('dm-pv-tft').getAttribute('data-plines') === 12 && wiresOf(LOD.TYPES[29], [[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1]], 2) && !!Q('path[data-w="1:D7:u:G4"]') && !!Q('path[data-w="1:D12:d:B7"]'), 'xlsx hsd_8pixel：週期 12，D7~D12＝第二組（T3／T4 表）＝Line OD Type 29');
  console.log('── ② 依 code 的模式：週期／第二組自動判斷');
  fire(sel, '-1');
  const pval = n => Array.from($('dm-preset').options).find(o => o.textContent.indexOf('(' + n + ')') === 0).value;
  fire($('dm-preset'), pval(29)); $('dm-preset-apply').click();
  ok(+$('dm-pv-tft').getAttribute('data-plines') === 12 && !!Q('path[data-w="1:D7:u:G4"]') && !!Q('path[data-w="1:D12:d:B7"]') && !!Q('path[data-w="1:D13:u:G8"]'), '預設樣式 (29)（HSD 8-pixel）：週期 12，D7~D12＝第二組＋4 pixel（D7 上→G4、D12 下→B7），D13 起重複');
  fire($('dm-preset'), pval(31)); $('dm-preset-apply').click();
  ok(['3-1', '3-2', '4-1', '4-2'].every(x => !!Q('line[data-gate="' + x + '"]')) && +$('dm-pv-tft').getAttribute('data-plines') === 6 && !!Q('path[data-w="3:D1:u:G1"]') && !!Q('path[data-w="4:D1:u:G-1"]'), '預設樣式 (31)（HSD 4line,4pixel）：畫 4 條 line，Line 3、4＝第二組（＝Line OD Type 30 的 Line 3、4）');
  fire($('dm-preset'), pval(23)); $('dm-preset-apply').click();
  ok(+$('dm-pv-tft').getAttribute('data-plines') === 6 && !Q('line[data-gate="3-1"]') && !!Q('path[data-w="1:D7:u:R5"]'), '預設樣式 (23)：週期 6、2 條 line，D7＝D1＋4 pixel（不變）');
  fire($('dm-gate'), 'Tri-Gate');
  ok($('dm-pvbody').classList.contains('hidden') && /測試：Line OD Type/.test($('dm-pvnote').textContent), '② 選 Tri-Gate：依 code 不畫，提示改用測試 Type 17~21');
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_lod ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
