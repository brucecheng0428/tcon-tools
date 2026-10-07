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
  ok(/^v1\.7\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.7.x：' + w.TOOL_VERSIONS.datamap);
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
    const tri = t.g === 'tri', nl = Math.max(2, t.rows.length), G = t.rows[0].length;
    const lab = new RegExp('Line OD Type ' + t.no + '\\b');
    let good = lab.test($('dm-pvtag').textContent) && $('dm-lodchk').getAttribute('data-ok') === '1' && $('dm-lodgrid').querySelectorAll('tr[data-row]').length === nl * G;
    good = good && Array.from($('dm-lodgrid').querySelectorAll('tr[data-row]')).every(tr => { const [li, gi] = tr.getAttribute('data-row').split(':').map(Number);
      return Array.from(tr.querySelectorAll('td')).every((td, c) => { const x = LOD.at(t, li, gi, c); return td.textContent === (x === null ? 'X' : LOD.name(x)); }); });
    if (tri) good = good && $('dm-pvbody').classList.contains('hidden') && /Tri-Gate/.test($('dm-pvnote').textContent);
    else {
      const gates = QA('text').map(x => x.textContent).filter(x => /^Line \d-\d$/.test(x));
      const expG = []; for (let k = 1; k <= nl; k++) { expG.push('Line ' + k + '-1'); if (t.g === 'dual') expG.push('Line ' + k + '-2'); }
      good = good && !$('dm-pvbody').classList.contains('hidden') && gates.join(',') === expG.join(',') && QA('circle[data-dot="gate"]').length === 12 * expG.length;
      const L12 = LOD.lines12(t);
      good = good && L12.every((r, ri) => r.names.every((nm, p) => nm === 'X' || !!Q('path[data-w="' + (r.line) + ':D' + (p + 1) + ':' + (r.gate === 1 ? 'u' : 'd') + ':' + nm + '"]') || (Q('text[data-send="' + r.line + ':D' + (p + 1) + (r.gate === 1 ? 'u' : 'd') + '"]') || {}).textContent === '!' + nm));
      good = good && !Q('[data-bad]');
    }
    good = good && JSON.stringify(w.dmState.cur) === cur0 && JSON.stringify(w.dmBuildScript()) === sc0 && ui() === ui0;
    ok(good, 'Type ' + t.name + '：' + (tri ? 'Tri 只畫反推表' : t.g + '，' + nl + ' 條 line，D1~D12 的 drain 照反推表') + '；驗算一致；② 與匯出 script 不變');
  }
  console.log('── 代表 Type 細節');
  fire(sel, '1');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && !!Q('path[data-w="2:D1:u:B-1"]') && !!Q('path[data-w="2:D2:u:R1"]'), 'Type 1：2N 列 D1→R1；2N+1 列 D1→B-1、D2→R1');
  fire(sel, '23');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && !!Q('path[data-w="1:D1:d:G1"]') && !!Q('path[data-w="2:D1:u:G-1"]'), 'Type 23：D1 上→R1、下→G1；第二列 D1 上→G-1');
  fire(sel, '29');
  ok(!!Q('path[data-w="1:D7:u:G4"]') && !!Q('path[data-w="1:D12:d:B7"]'), 'Type 29（12 條一循環）：D7~D12 照反推表（D7 上→G4、D12 下→B7），不是 D1~D6＋週期');
  fire(sel, '32');
  ok(!!Q('path[data-w="1:D1:u:G1"]') && /D1↑/.test(Q('rect[data-pv="1:G1"]').parentNode.getAttribute('data-tip')), 'Type 32：D1 上→G1');
  fire($('dm-pv-swap'), true);
  ok(/D3↑/.test(Q('rect[data-pv="1:G1"]').parentNode.getAttribute('data-tip')) && JSON.stringify(w.dmBuildScript()) === sc0, 'Type 32＋對調：G1 改由 D3 送；匯出不變');
  fire($('dm-pv-swap'), false);
  fire(sel, '7');
  ok(QA('text').filter(x => /^Line 8-1$/.test(x.textContent)).length === 1 && !QA('text').some(x => /^Line \d-2$/.test(x.textContent)), 'Type 7：Single，畫 Line 1-1~8-1');
  fire(sel, '-1');
  ok($('dm-pv-tft').innerHTML === svg0 && $('dm-pvtag').textContent === tag0 && $('dm-lodinfo').classList.contains('hidden') && $('dm-lodgridbox').classList.contains('hidden'), '選回「不使用」⇒ 預覽與標籤回到 ② 的結果（逐字相同）');
  fire($('dm-c0-0'), 'R1');
  ok($('dm-pv-tft').innerHTML !== svg0 && !!Q('path[data-w="1:D1:u:R1"]'), '不使用時仍跟著 ② 連動');
  fire(sel, '23'); fire($('dm-c0-0'), 'B2');
  ok(!!Q('path[data-w="1:D1:u:R1"]') && $('dm-c0-0').value === 'B2', '測試 Type 中改 ②：預覽仍照 Type（不連動），② 照常改');
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_lod ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
