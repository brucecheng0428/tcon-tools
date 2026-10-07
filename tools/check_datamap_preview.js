#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_preview.js — datamap.html「③ 面板排列預覽」回歸（jsdom）
   用法：node tools/check_datamap_preview.js [repo] [--em02 <EM02 code.bin>]
     預設只跑合成情境（客戶 code 不進版控）；給 --em02 再加跑真實 code 的接線目標檢查。
   v1.4.5 邏輯：子像素固定（順序／顏色），Data 線位置固定（D1 在 R1 左；Single 間隔 1 顆、Dual 間隔 2 顆），
     ② 的「Data n × Line x-y ＝ 名稱」＝ Data n 經 Line x-y 的 TFT，drain 接到該名稱的實體子像素（可跨線，跨線處跳線弧）；
     警示只有衝突（同一顆被兩條以上接到）與畫面外（如 R5）；X／非標準不接線；前循環只在用到 -1／-2 時顯示。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2), ei = args.indexOf('--em02'), EM02 = ei >= 0 ? args[ei + 1] : null;
const pos = args.filter((a, i) => a !== '--em02' && (ei < 0 || i !== ei + 1));
const ROOT = path.resolve(pos[0] || path.join(__dirname, '..'));
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
  const Q = s => d.querySelector('#dm-pv-tft ' + s), QA = s => Array.from(d.querySelectorAll('#dm-pv-tft ' + s));
  const rect = (row, p) => Q('rect[data-pv="' + row + ':' + p + '"]');
  const st = (row, p) => { const r = rect(row, p); return r ? r.getAttribute('data-st') + '[' + r.getAttribute('data-in') + ']' : null; };
  const wire = (row, dn, ud, name) => Q('path[data-w="' + row + ':D' + dn + ':' + ud + ':' + name + '"]');
  const npre = () => +$('dm-pv-tft').getAttribute('data-npre');
  const fills = () => QA('rect[data-pv]').map(r => r.getAttribute('data-pv') + '=' + r.getAttribute('fill')).join('|');
  const svgText = () => QA('text').map(t => t.textContent);
  const dlx = n => { const p = Q('path[data-dl="' + n + '"]'); return p ? +p.getAttribute('data-x') : null; };
  const setRow = (r, names) => names.forEach((x, c) => fire($('dm-c' + r + '-' + c), x));

  console.log('── 版面');
  const cards = Array.from(d.querySelectorAll('.card.stp')).map(c => c.id);
  ok(cards.join(',') === 'card-src,card-dm,card-pv,card-out', '卡片順序 ①②③④：' + cards.join(','));
  ok(/^v1\.4\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.4.x：' + w.TOOL_VERSIONS.datamap);
  ok(!$('dm-pv-rows') && $('card-pv').querySelectorAll('svg').length === 1 + $('dm-pv-legend').querySelectorAll('svg').length, '卡內只有一張 TFT 圖');

  console.log('── Auto');
  fire($('dm-model'), 'E503');
  ok(/Auto/.test($('dm-pvtag').textContent) && !$('dm-pvnote').classList.contains('hidden'), 'Hand 關 ⇒ 標 Auto');

  console.log('── Single Gate：drain 接到 ② 指定的子像素');
  fire($('dm-hand'), true); fire($('dm-gate'), 'Single-Gate');
  let tx = svgText();
  ok(tx.includes('Line 1-1') && tx.includes('Line 2-1') && !tx.includes('Line 1-2') && !tx.includes('Line 2-2'), 'Single 只畫 Line 1-1、Line 2-1');
  ok(st(1, 'R3') === 'conflict[D1u,D2u,D3u,D4u,D5u,D6u]' && !!Q('[data-bad]'), '全 0（全部指 R3）⇒ R3 被 6 條接到 ⇒ 衝突');
  setRow(0, ['R1', 'G1', 'B1', 'R2', 'G2', 'B2']); setRow(2, ['R1', 'G1', 'B1', 'R2', 'G2', 'B2']);
  ok(npre() === 0 && QA('rect[data-pv^="1:"]').length === 12, '沒用到 -1／-2 ⇒ 前循環收起，從 R1 開始（12 格）');
  ok(QA('circle[data-dot="gate"]').length === 12 && QA('circle[data-dot="source"]').length === 12, 'Single：每列 6 顆 TFT（D1~D6），gate／source 實心點各 12');
  const r1x = +rect(1, 'R1').getAttribute('x'), d1x = dlx(1);
  ok(d1x < r1x && r1x - d1x <= 40 && dlx(2) - d1x === +rect(1, 'G1').getAttribute('x') - r1x, 'D1 在 R1 左邊、Single 間隔 1 顆（D2 在 G1 左）');
  ok(st(1, 'R1') === 'ok[D1u]' && st(1, 'B2') === 'ok[D6u]' && st(1, 'R3') === 'none[]', '標準排法：R1←D1 … B2←D6，R3 沒人接（淡）');
  ok(+wire(1, 1, 'u', 'R1').getAttribute('data-hops') === 0, 'D1→R1 就在旁邊，不跨線');
  const f0 = fills();
  fire($('dm-c0-0'), 'G2');
  ok(fills() === f0, '改 ② 後所有子像素位置與顏色完全不變');
  const wG2 = wire(1, 1, 'u', 'G2');
  ok(!!wG2 && +wG2.getAttribute('data-hops') >= 4, 'D1×Line 1-1＝G2 ⇒ drain 接到 G2，跨過 D2~D5 等線（跳線弧 ' + (wG2 && wG2.getAttribute('data-hops')) + '）');
  ok(/ A4 4 0 0 1 /.test(wG2.getAttribute('d')), '跨線處是半圓跳線');
  ok(st(1, 'G2') === 'conflict[D1u,D5u]' && st(1, 'R1') === 'none[]', 'G2 同時被 D1、D5 接到 ⇒ 衝突；R1 沒人接');
  fire($('dm-c0-0'), 'R-1');
  ok(npre() === 3 && !!rect(1, 'R-1') && !rect(1, 'R-2') && !!Q('line[data-sep]'), '改成 R-1 ⇒ 前循環 R-1…B-1 即時出現（-2 不出現）');
  ok(+wire(1, 1, 'u', 'R-1').getAttribute('data-hops') >= 1 && st(1, 'R-1') === 'ok[D1u]', 'D1 往左接到 R-1，跨過分隔處的線');
  fire($('dm-c0-0'), 'B-2');
  ok(npre() === 6 && !!rect(1, 'R-2'), '改成 B-2 ⇒ 前循環 R-2…B-1 全部出現');
  fire($('dm-c0-0'), 'X');
  ok(npre() === 0 && !wire(1, 1, 'u', 'X') && QA('circle[data-dot="gate"]').length === 12 && Q('text[data-send="1:D1u"]').textContent === 'X', 'X ⇒ TFT 還在、不接線、標 X；前循環收起');
  fire($('dm-c0-0'), 'R1');
  ok(/實驗：Single/.test($('dm-pv-exp').textContent), '標「實驗」');

  console.log('── Dual Gate');
  fire($('dm-gate'), 'Dual-Gate');
  tx = svgText();
  ok(['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'].every(s => tx.includes(s)), 'Dual 畫四條 Gate');
  ok(QA('circle[data-dot="gate"]').length === 24 && QA('circle[data-dot="source"]').length === 24, 'Dual：每條 Data 每列兩顆 TFT，gate／source 實心點各 24');
  const r1xD = +rect(1, 'R1').getAttribute('x'), d1xD = dlx(1);
  ok(d1xD < r1xD && dlx(2) - d1xD === +rect(1, 'B1').getAttribute('x') - r1xD && dlx(3) - d1xD === +rect(1, 'G2').getAttribute('x') - r1xD, 'D1 在 R1 左、Dual 間隔 2 顆（D2 在 B1 左、D3 在 G2 左）');
  ok((Q('path[data-dl="1"]').getAttribute('d').match(/ A5 /g) || []).length === 4, 'Data 線跨四條 Gate 都是跳線弧');
  const T = [['R1', 'B1', 'G2', 'R3', 'B3', 'G4'], ['G1', 'R2', 'B2', 'G3', 'R4', 'B4'], ['G-1', 'R1', 'B1', 'G2', 'R3', 'B3'], ['B-1', 'G1', 'R2', 'B2', 'G3', 'R4']];
  T.forEach((row, r) => setRow(r, row));
  ok(['R1', 'G1', 'B1', 'R2', 'G2', 'B2', 'R3', 'G3', 'B3', 'R4', 'G4', 'B4'].every(p => /^ok/.test(st(1, p))), '原廠樣式 23 第一列 12 顆各被一條接到');
  ok(st(1, 'R1') === 'ok[D1u]' && st(1, 'G1') === 'ok[D1d]', 'R1 ← D1 經 Line 1-1（上）、G1 ← D1 經 Line 1-2（下）');
  ok(npre() === 3 && st(2, 'G-1') === 'ok[D1u]' && st(2, 'B-1') === 'ok[D1d]', '第二列用到 G-1／B-1 ⇒ 前循環出現，D1 往左接到 G-1、B-1');
  fire($('dm-c1-5'), 'R5');
  const out = Q('path[data-w="1:D6:d:R5"]');
  ok(!!out && out.getAttribute('data-off') === '1' && Q('text[data-send="1:D6d"]').textContent === '!R5', 'Line 1-2 Data 6＝R5（畫面外）⇒ 線尾標 !R5');
  ok(/實驗：Dual/.test($('dm-pv-exp').textContent), 'Dual 標「實驗」');

  console.log('── Tri、切型號');
  fire($('dm-gate'), 'Tri-Gate');
  ok($('dm-pvbody').classList.contains('hidden') && /Tri-Gate/.test($('dm-pvnote').textContent), 'Tri ⇒ 預覽顯示不支援');
  fire($('dm-model'), 'DAZ7353');
  ok($('dm-model').value === 'DAZ7353' && npre() === 0 && QA('rect[data-pv^="1:"]').length === 12, '切 DAZ7353（全 0＝R1）⇒ 前循環收起');

  if (EM02) {
    console.log('── 真實 EM02 code：' + path.basename(EM02));
    fire($('dm-model'), 'EM02');
    w.dmImportBytes(new Uint8Array(fs.readFileSync(EM02)), path.basename(EM02));
    await new Promise(r => setTimeout(r, 50));
    ok($('dm-model').value === 'EM02' && $('dm-c0-0').value === 'G2', '匯入後 ② Line 1-1 Data 1＝G2：' + $('dm-c0-0').value);
    ok(/Dual/.test($('dm-pvtag').textContent), 'code 是 Dual Gate');
    const g2 = wire(1, 1, 'u', 'G2');
    ok(!!g2 && +g2.getAttribute('data-hops') >= 1 && /D1u/.test(rect(1, 'G2').getAttribute('data-in')), 'D1×Line 1-1 的 drain 接到 G2，跨線有跳線弧（' + (g2 && g2.getAttribute('data-hops')) + '）');
    const rows = [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value).join(' '));
    console.log('   ② ' + rows.join(' / '));
    const uses2 = rows.some(x => /-2/.test(x)), uses1 = rows.some(x => /-1\b/.test(x));
    ok(npre() === (uses2 ? 6 : (uses1 ? 3 : 0)), '前循環依 ② 是否用到 -1／-2：npre=' + npre() + '（用到 -2：' + uses2 + '、-1：' + uses1 + '）');
    ok(!Q('[data-bad]'), '沒有衝突');
  }

  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_preview ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
