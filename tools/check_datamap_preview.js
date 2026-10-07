#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_preview.js — datamap.html v1.4.0「③ 面板排列預覽」回歸（jsdom，不需客戶 code）
   用法：node tools/check_datamap_preview.js [repo]（預設＝這支的上一層；jsdom 取 repo/node_modules）
   測：預覽卡在 ② 與 ④ 之間；Auto 標註；Single 只畫 Line 1-1／2-1、全部方格接上線；
       改 ② 一格 ⇒ 預覽對應方格即時改變；Dual 兩列各上下兩條 Gate、Line x-2 的格接下線；
       補充圖有跳線弧、TFT gate／source 實心點；Tri 顯示不支援；切型號、全部套用也跟著更新。
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
  const rect = (row, nm) => d.querySelector('#dm-pv-rows rect[data-pv="' + row + ':' + nm + '"]');
  const rowsText = () => Array.from(d.querySelectorAll('#dm-pv-rows text')).map(t => t.textContent);

  console.log('── 版面');
  const cards = Array.from(d.querySelectorAll('.card.stp')).map(c => c.id);
  ok(cards.join(',') === 'card-src,card-dm,card-pv,card-out', '卡片順序 ①②③④：' + cards.join(','));
  ok(/③ 面板排列預覽/.test($('card-pv').textContent) && /④ 寫入 TCON/.test($('card-out').textContent), '③ 面板排列預覽、④ 寫入 TCON 或匯出 script');
  ok(/v1\.4\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.4.x：' + w.TOOL_VERSIONS.datamap);

  console.log('── Auto（Hand Mode 關）');
  fire($('dm-model'), 'E503');
  ok(/Auto/.test($('dm-pvtag').textContent) && !$('dm-pvnote').classList.contains('hidden'), 'Hand 關 ⇒ 標 Auto 並顯示說明');
  ok(!!rect(1, 'R3'), 'Auto 仍畫出暫存器目前的排列（全 0 ⇒ R3）');

  console.log('── Single Gate');
  fire($('dm-hand'), true); fire($('dm-gate'), 'Single-Gate');
  ok(!/Auto/.test($('dm-pvtag').textContent), 'Hand 開 ⇒ 不再標 Auto');
  let tx = rowsText();
  ok(tx.includes('Line 1-1') && tx.includes('Line 2-1') && !tx.includes('Line 1-2') && !tx.includes('Line 2-2'), 'Single 只畫 Line 1-1、Line 2-1');
  const allPos = Array.from(d.querySelectorAll('#dm-pv-rows rect[data-pv^="1:"]'));
  ok(allPos.length === 18, '第一列 18 格（R-2…B-1｜R1…B4）：' + allPos.length);
  ok(d.querySelectorAll('#dm-pv-rows circle').length === 36, 'Single 每格都接上線（2 列 × 18 個接點）：' + d.querySelectorAll('#dm-pv-rows circle').length);
  ok(rect(1, 'R3').getAttribute('data-up') === '1,2,3,4,5,6', '全 R3 ⇒ 第一列 R3 由 D1~D6：' + rect(1, 'R3').getAttribute('data-up'));

  console.log('── 改 ② 一格 ⇒ 預覽即時改');
  ok(rect(1, 'G1').getAttribute('data-up') === '', '改前 G1 沒有 Data');
  fire($('dm-c0-0'), 'G1');
  ok($('dm-c0-0').value === 'G1', '② Line 1-1 Data 1 = G1');
  ok(rect(1, 'G1').getAttribute('data-up') === '1', '改後第一列 G1 ⇐ D1：' + rect(1, 'G1').getAttribute('data-up'));
  ok(rect(1, 'R3').getAttribute('data-up') === '2,3,4,5,6', '第一列 R3 少了 D1：' + rect(1, 'R3').getAttribute('data-up'));
  ok(rect(2, 'R3').getAttribute('data-up') === '1,2,3,4,5,6', '第二列不受影響');
  fire($('dm-c2-5'), 'X');
  ok(rowsText().some(t => /^D6 X（Line 2-1/.test(t)), 'X ⇒ 列尾標 D6 X 不輸出');

  console.log('── Dual Gate');
  fire($('dm-gate'), 'Dual-Gate');
  tx = rowsText();
  ok(['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'].every(s => tx.includes(s)), 'Dual 畫四條 Gate（兩列各上下兩條）');
  fire($('dm-c1-0'), 'R1');
  ok(rect(1, 'R1').getAttribute('data-dn') === '1' && rect(1, 'R1').getAttribute('data-up') === '', 'Line 1-2 Data 1 = R1 ⇒ 第一列 R1 接下線、D1');
  ok(rect(1, 'G1').getAttribute('data-up') === '1', '第一列 G1 仍接上線（草圖：Data 1 經 1-1 充 G1、經 1-2 充 R1）');
  const tft = d.querySelector('#dm-pv-tft rect[data-tft="1:1:G1"]') && d.querySelector('#dm-pv-tft rect[data-tft="1:1:R1"]');
  ok(!!tft, '補充圖 Data 1 第一列有 G1 與 R1 兩顆');
  const arcs = Array.from(d.querySelectorAll('#dm-pv-tft path')).filter(p => / A5 5 0 0 1 /.test(p.getAttribute('d')));
  ok(arcs.length === 6 && (arcs[0].getAttribute('d').match(/ A5 /g) || []).length === 4, 'Data 線跨四條 Gate 都是跳線弧：' + arcs.length);
  ok(d.querySelectorAll('#dm-pv-tft circle[data-dot="gate"]').length === 24 && d.querySelectorAll('#dm-pv-tft circle[data-dot="source"]').length === 24, 'TFT gate／source 實心點各 24');

  console.log('── 全部套用、Tri、切型號');
  fire($('dm-samev'), 'B2'); $('dm-same').click();
  ok(rect(1, 'B2').getAttribute('data-up') === '1,2,3,4,5,6' && rect(1, 'B2').getAttribute('data-dn') === '1,2,3,4,5,6', '全部套用 B2 ⇒ 預覽 B2 上下線都 D1~6');
  fire($('dm-gate'), 'Tri-Gate');
  ok($('dm-pvbody').classList.contains('hidden') && /Tri-Gate/.test($('dm-pvnote').textContent), 'Tri ⇒ 預覽顯示不支援');
  fire($('dm-model'), 'DAZ7353');
  ok($('dm-model').value === 'DAZ7353' && d.querySelectorAll('#dm-pv-rows rect[data-pv^="1:"]').length === 15, '切 DAZ7353 ⇒ 前循環只有 R-1…B-1（15 格）：' + d.querySelectorAll('#dm-pv-rows rect[data-pv^="1:"]').length);

  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_preview ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
