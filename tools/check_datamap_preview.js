#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_preview.js — datamap.html「③ 面板排列預覽」回歸（jsdom，不需客戶 code）
   用法：node tools/check_datamap_preview.js [repo]（預設＝這支的上一層；jsdom 取 repo/node_modules）
   v1.4.0：卡片順序、Auto、Single 只畫 Line 1-1／2-1、改 ② 一格即時更新、Dual 上下線、TFT 跳線弧與實心點、Tri、切型號
   v1.4.2：「實驗」標示移出 SVG
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
  const rect = (row, pos) => d.querySelector('#dm-pv-rows rect[data-pv="' + row + ':' + pos + '"]');
  const cell = (row, pos) => { const r = rect(row, pos); return r ? r.getAttribute('data-c') + '/D' + r.getAttribute('data-d') + '/' + r.getAttribute('data-g') : null; };
  const rowsText = () => Array.from(d.querySelectorAll('#dm-pv-rows text')).map(t => t.textContent);
  const dlx = n => { const p = d.querySelector('#dm-pv-rows path[data-dl="' + n + '"]'); return p ? +p.getAttribute('data-x') : null; };

  console.log('── 版面');
  const cards = Array.from(d.querySelectorAll('.card.stp')).map(c => c.id);
  ok(cards.join(',') === 'card-src,card-dm,card-pv,card-out', '卡片順序 ①②③④：' + cards.join(','));
  ok(/③ 面板排列預覽/.test($('card-pv').textContent) && /④ 寫入 TCON/.test($('card-out').textContent), '③ 面板排列預覽、④ 寫入 TCON 或匯出 script');
  ok(/^v1\.4\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.4.x：' + w.TOOL_VERSIONS.datamap);

  console.log('── Auto（Hand Mode 關）');
  fire($('dm-model'), 'E503');
  ok(/Auto/.test($('dm-pvtag').textContent) && !$('dm-pvnote').classList.contains('hidden'), 'Hand 關 ⇒ 標 Auto 並顯示說明');
  ok(cell(1, 'R1') === 'R3/D1/up', 'Auto 仍畫出暫存器目前的值（全 0 ⇒ R3）：' + cell(1, 'R1'));

  console.log('── Single Gate');
  fire($('dm-hand'), true); fire($('dm-gate'), 'Single-Gate');
  ok(!/Auto/.test($('dm-pvtag').textContent), 'Hand 開 ⇒ 不再標 Auto');
  let tx = rowsText();
  ok(tx.includes('Line 1-1') && tx.includes('Line 2-1') && !tx.includes('Line 1-2') && !tx.includes('Line 2-2'), 'Single 只畫 Line 1-1、Line 2-1');
  ok(d.querySelectorAll('#dm-pv-rows rect[data-pv^="1:"]').length === 18, '第一列 18 格（R-2…B-1｜R1…B4）');
  ok(Array.from(d.querySelectorAll('#dm-pv-rows rect[data-pv]')).every(r => r.getAttribute('data-g') === 'up'), 'Single 每格都接上線');
  const r1x = +rect(1, 'R1').getAttribute('x'), d1x = dlx(1);
  ok(d1x !== null && d1x < r1x && r1x - d1x <= 16, 'Data 1 在 R1 左邊：D1 x=' + d1x + '、R1 x=' + r1x);
  ok(dlx(2) - d1x === +rect(1, 'G1').getAttribute('x') - r1x && dlx(3) - dlx(2) === dlx(2) - d1x, 'Single 間隔 1 顆：Data 2 在 G1 左、Data 3 在 B1 左');
  ok(cell(1, 'G1') === 'R3/D2/up' && cell(1, 'R2') === 'R3/D4/up', 'Single：G1 歸 D2、R2 歸 D4');
  ok(/實驗：Single/.test($('dm-pv-exp').textContent) && $('dm-pv-exp').getAttribute('data-exp') === 'single', '標「實驗」（SVG 外，不壓標頭）');

  console.log('── 改 ② 一格 ⇒ 預覽即時改');
  fire($('dm-c0-0'), 'G1');
  ok($('dm-c0-0').value === 'G1', '② Line 1-1 Data 1 = G1');
  ok(cell(1, 'R1') === 'G1/D1/up', '改後第一列 R1 那格內容＝G1：' + cell(1, 'R1'));
  ok(cell(2, 'R1') === 'R3/D1/up', '第二列不受影響');
  ok(dlx(1) === d1x, 'Data 1 位置不變');

  console.log('── Dual Gate');
  fire($('dm-gate'), 'Dual-Gate');
  tx = rowsText();
  ok(['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'].every(s => tx.includes(s)), 'Dual 畫四條 Gate（兩列各上下兩條）');
  ok(dlx(1) === d1x, 'Dual：Data 1 仍在 R1 左邊');
  ok(dlx(2) - d1x === +rect(1, 'B1').getAttribute('x') - r1x && dlx(3) - d1x === +rect(1, 'G2').getAttribute('x') - r1x, 'Dual 間隔 2 顆：Data 2 在 B1 左、Data 3 在 G2 左');
  fire($('dm-c0-0'), 'R1'); fire($('dm-c1-0'), 'G1');
  ok(cell(1, 'R1') === 'R1/D1/up' && cell(1, 'G1') === 'G1/D1/dn', 'Line 1-1=R1、Line 1-2=G1 ⇒ R1 接上線、G1 接下線：' + cell(1, 'R1') + ' ' + cell(1, 'G1'));
  fire($('dm-c0-0'), 'G1'); fire($('dm-c1-0'), 'R1');
  ok(cell(1, 'R1') === 'R1/D1/dn' && cell(1, 'G1') === 'G1/D1/up', '草圖：Line 1-1=G1、Line 1-2=R1 ⇒ R1 接下線、G1 接上線：' + cell(1, 'R1') + ' ' + cell(1, 'G1'));
  ok(!!d.querySelector('#dm-pv-tft rect[data-tft="1:1:G1"]') && !!d.querySelector('#dm-pv-tft rect[data-tft="1:1:R1"]'), '補充圖 Data 1 第一列有 G1 與 R1 兩顆');
  const arcs = Array.from(d.querySelectorAll('#dm-pv-tft path')).filter(p => / A5 5 0 0 1 /.test(p.getAttribute('d')));
  ok(arcs.length === 6 && (arcs[0].getAttribute('d').match(/ A5 /g) || []).length === 4, '補充圖 Data 線跨四條 Gate 都是跳線弧');
  ok((d.querySelector('#dm-pv-rows path[data-dl="1"]').getAttribute('d').match(/ A5 /g) || []).length === 4, '兩列圖 Data 線跨四條 Gate 也是跳線弧');
  ok(d.querySelectorAll('#dm-pv-tft circle[data-dot="gate"]').length === 24 && d.querySelectorAll('#dm-pv-tft circle[data-dot="source"]').length === 24, 'TFT gate／source 實心點各 24');
  ok(/實驗：Dual/.test($('dm-pv-exp').textContent), 'Dual 標「實驗」');

  console.log('── 全部套用、Tri、切型號');
  fire($('dm-samev'), 'B2'); $('dm-same').click();
  ok(cell(1, 'R1') === 'B2/D1/up' && cell(1, 'G1') === 'B2/D1/dn', '全部套用 B2 ⇒ 預覽跟著變：' + cell(1, 'R1'));
  fire($('dm-gate'), 'Tri-Gate');
  ok($('dm-pvbody').classList.contains('hidden') && /Tri-Gate/.test($('dm-pvnote').textContent), 'Tri ⇒ 預覽顯示不支援');
  fire($('dm-model'), 'DAZ7353');
  ok($('dm-model').value === 'DAZ7353' && d.querySelectorAll('#dm-pv-rows rect[data-pv^="1:"]').length === 15, '切 DAZ7353 ⇒ 前循環只有 R-1…B-1（15 格）');

  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_preview ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
