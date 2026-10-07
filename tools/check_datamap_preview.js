#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_preview.js — datamap.html「③ 面板排列預覽」回歸（jsdom，不需客戶 code）
   用法：node tools/check_datamap_preview.js [repo]（預設＝這支的上一層；jsdom 取 repo/node_modules）
   v1.4.0：卡片順序、Auto、Single 只畫 Line 1-1／2-1、改 ② 一格即時更新、Dual 上下線、TFT 跳線弧與實心點、Tri、切型號
   v1.4.2：「實驗」標示移出 SVG
   v1.4.3：只剩一張整列 TFT 圖；子像素順序／顏色固定，② 標在 drain 線上，不符 ⇒ 橘框＋!、X ⇒ 灰
   v1.4.1（實驗）：Data 1 固定在 R1 左邊；Single 間隔 1 顆、Dual 間隔 2 顆；Dual 每條 Data 的左右格依 ② 分給 Line x-1／x-2
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const rect = (row, pos) => d.querySelector('#dm-pv-tft rect[data-pv="' + row + ':' + pos + '"]');
  const cell = (row, pos) => { const r = rect(row, pos); return r ? r.getAttribute('data-c') + '/D' + r.getAttribute('data-d') + '/' + r.getAttribute('data-g') + '/' + r.getAttribute('data-st') : null; };
  const fills = () => Array.from(d.querySelectorAll('#dm-pv-tft rect[data-pv]')).map(r => r.getAttribute('data-pv') + '=' + r.getAttribute('fill')).join('|');
  const svgText = () => Array.from(d.querySelectorAll('#dm-pv-tft text')).map(t => t.textContent);
  const dlx = n => { const p = d.querySelector('#dm-pv-tft path[data-dl="' + n + '"]'); return p ? +p.getAttribute('data-x') : null; };
  const send = (row, pos) => { const t = d.querySelector('#dm-pv-tft text[data-send="' + row + ':' + pos + '"]'); return t ? t.textContent : null; };

  console.log('── 版面：只剩一張整列 TFT 圖');
  const cards = Array.from(d.querySelectorAll('.card.stp')).map(c => c.id);
  ok(cards.join(',') === 'card-src,card-dm,card-pv,card-out', '卡片順序 ①②③④：' + cards.join(','));
  ok(/③ 面板排列預覽/.test($('card-pv').textContent) && /④ 寫入 TCON/.test($('card-out').textContent), '③ 面板排列預覽、④ 寫入 TCON 或匯出 script');
  ok(/^v1\.4\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.4.x：' + w.TOOL_VERSIONS.datamap);
  ok(!$('dm-pv-rows') && $('card-pv').querySelectorAll('svg').length === 1 + $('dm-pv-legend').querySelectorAll('svg').length, '上半部兩列示意圖已拿掉，卡內只有一張 TFT 圖');

  console.log('── Auto（Hand Mode 關）');
  fire($('dm-model'), 'E503');
  ok(/Auto/.test($('dm-pvtag').textContent) && !$('dm-pvnote').classList.contains('hidden'), 'Hand 關 ⇒ 標 Auto 並顯示說明');
  ok(cell(1, 'R1') === 'R3/D1/up/bad', 'Auto 仍照暫存器值（全 0 ⇒ 送 R3，與 R1 不符）：' + cell(1, 'R1'));

  console.log('── Single Gate');
  fire($('dm-hand'), true); fire($('dm-gate'), 'Single-Gate');
  ok(!/Auto/.test($('dm-pvtag').textContent), 'Hand 開 ⇒ 不再標 Auto');
  let tx = svgText();
  ok(tx.includes('Line 1-1') && tx.includes('Line 2-1') && !tx.includes('Line 1-2') && !tx.includes('Line 2-2'), 'Single 只畫 Line 1-1、Line 2-1');
  ok(d.querySelectorAll('#dm-pv-tft rect[data-pv^="1:"]').length === 18 && d.querySelectorAll('#dm-pv-tft rect[data-pv^="2:"]').length === 18, '兩列各 18 格（R-2…B-1｜R1…B4）');
  ok(d.querySelectorAll('#dm-pv-tft circle[data-dot="gate"]').length === 36 && d.querySelectorAll('#dm-pv-tft circle[data-dot="source"]').length === 36, '每顆子像素都有 TFT：gate／source 實心點各 36');
  ok(Array.from(d.querySelectorAll('#dm-pv-tft rect[data-pv]')).every(r => r.getAttribute('data-g') === 'up'), 'Single 每顆的 TFT 都接 Line x-1');
  ok(!!d.querySelector('#dm-pv-tft line[data-sep]'), '前循環／主循環分隔線');
  const r1x = +rect(1, 'R1').getAttribute('x'), d1x = dlx(1);
  ok(d1x !== null && d1x < r1x && r1x - d1x <= 40, 'Data 1 在 R1 左邊：D1 x=' + d1x + '、R1 x=' + r1x);
  ok(dlx(2) - d1x === +rect(1, 'G1').getAttribute('x') - r1x && dlx(3) - dlx(2) === dlx(2) - d1x, 'Single 間隔 1 顆：Data 2 在 G1 左、Data 3 在 B1 左');
  ok((d.querySelector('#dm-pv-tft path[data-dl="1"]').getAttribute('d').match(/ A5 /g) || []).length === 2, 'Single：Data 線跨兩條 Gate 都是跳線弧');
  ['R1', 'G1', 'B1', 'R2', 'G2', 'B2'].forEach((x, i) => fire($('dm-c0-' + i), x)); ['R3', 'G3', 'B3', 'R4', 'G4', 'B4'].forEach((x, i) => fire($('dm-c2-' + i), x));
  ok(cell(1, 'G1') === 'G1/D2/up/ok' && cell(1, 'R3') === 'R3/D1/up/ok' && cell(2, 'R1') === 'R3/D1/up/bad', '標準排法 ⇒ 第一列全對上（第二組平移 2 pixel）；第二列 R1 位置收到 R3 ⇒ 不符：' + cell(2, 'R1'));
  ok(/實驗：Single/.test($('dm-pv-exp').textContent), '標「實驗」');

  console.log('── 改 ② 一格 ⇒ 子像素不變，只有送的資料／不符標示變');
  const f0 = fills(), bad0 = d.querySelectorAll('#dm-pv-tft [data-bad]').length;
  fire($('dm-c0-1'), 'B2');
  ok($('dm-c0-1').value === 'B2', '② Line 1-1 Data 2 = B2');
  ok(fills() === f0, '所有子像素的位置與顏色完全不變');
  ok(rect(1, 'G1').getAttribute('fill') === rect(1, 'G2').getAttribute('fill') && cell(1, 'G1') === 'B2/D2/up/bad' && send(1, 'G1') === 'B2', 'G1 仍是綠色 G1，線上標「B2」並標不符：' + cell(1, 'G1'));
  ok(d.querySelectorAll('#dm-pv-tft [data-bad]').length > bad0, '不符的驚嘆號變多');
  fire($('dm-c0-1'), 'X');
  ok(cell(1, 'G1') === 'X/D2/up/x', 'X ⇒ 標灰：' + cell(1, 'G1'));
  fire($('dm-c0-1'), 'G1');
  ok(cell(1, 'G1') === 'G1/D2/up/ok' && dlx(1) === d1x, '改回 G1 ⇒ 對上；Data 1 位置不變');

  console.log('── Dual Gate');
  fire($('dm-gate'), 'Dual-Gate');
  tx = svgText();
  ok(['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'].every(s => tx.includes(s)), 'Dual 畫四條 Gate（兩列各上下兩條）');
  const r1xD = +rect(1, 'R1').getAttribute('x'), d1xD = dlx(1);
  ok(d1xD < r1xD && r1xD - d1xD <= 40 && d1xD > +rect(1, 'B-1').getAttribute('x') + 38, 'Dual：Data 1 仍在 R1 左邊（B-1 與 R1 之間）');
  ok(dlx(2) - d1xD === +rect(1, 'B1').getAttribute('x') - r1xD && dlx(3) - d1xD === +rect(1, 'G2').getAttribute('x') - r1xD, 'Dual 間隔 2 顆：Data 2 在 B1 左、Data 3 在 G2 左');
  ok((d.querySelector('#dm-pv-tft path[data-dl="1"]').getAttribute('d').match(/ A5 /g) || []).length === 4, 'Dual：Data 線跨四條 Gate 都是跳線弧');
  ok(d.querySelectorAll('#dm-pv-tft circle[data-dot="gate"]').length === 36, 'Dual 每顆子像素仍各一顆 TFT（36）');
  const T = [['R1', 'B1', 'G2', 'R3', 'B3', 'G4'], ['G1', 'R2', 'B2', 'G3', 'R4', 'B4'], ['G-1', 'R1', 'B1', 'G2', 'R3', 'B3'], ['B-1', 'G1', 'R2', 'B2', 'G3', 'R4']];
  T.forEach((row, r) => row.forEach((x, c) => fire($('dm-c' + r + '-' + c), x)));
  ok(cell(1, 'R1') === 'R1/D1/up/ok' && cell(1, 'G1') === 'G1/D1/dn/ok' && cell(1, 'B1') === 'B1/D2/up/ok' && cell(1, 'B4') === 'B4/D6/dn/ok', '原廠樣式 23 第一列：R1↑ G1↓ B1↑ … 全對上');
  ok(cell(1, 'R-2') === 'R-2/D4/up/ok', '前循環平移 4 pixel 後也對上：' + cell(1, 'R-2'));
  fire($('dm-c0-0'), 'G1'); fire($('dm-c1-0'), 'R1');
  ok(cell(1, 'R1') === 'R1/D1/dn/ok' && cell(1, 'G1') === 'G1/D1/up/ok', '草圖：Line 1-1=G1、Line 1-2=R1 ⇒ G1 的 TFT 接上線、R1 接下線：' + cell(1, 'R1') + ' ' + cell(1, 'G1'));
  ok(/實驗：Dual/.test($('dm-pv-exp').textContent), 'Dual 標「實驗」');

  console.log('── 全部套用、Tri、切型號');
  const f1 = fills();
  fire($('dm-samev'), 'B2'); $('dm-same').click();
  ok(fills() === f1 && cell(1, 'R1') === 'B2/D1/up/bad' && cell(1, 'G1') === 'B2/D1/dn/bad', '全部套用 B2 ⇒ 子像素不變、送 B2 並標不符：' + cell(1, 'R1'));
  fire($('dm-gate'), 'Tri-Gate');
  ok($('dm-pvbody').classList.contains('hidden') && /Tri-Gate/.test($('dm-pvnote').textContent), 'Tri ⇒ 預覽顯示不支援');
  fire($('dm-model'), 'DAZ7353');
  ok($('dm-model').value === 'DAZ7353' && d.querySelectorAll('#dm-pv-tft rect[data-pv^="1:"]').length === 15, '切 DAZ7353 ⇒ 前循環只有 R-1…B-1（15 格）');

  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_preview ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
