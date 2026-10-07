#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_preview.js — datamap.html「③ 面板排列預覽」回歸（jsdom）
   用法：node tools/check_datamap_preview.js [repo] [--em02 <EM02 code.bin>]
     預設只跑合成情境（客戶 code 不進版控）；給 --em02 再加跑真實 code 的接線目標檢查。
   v1.5.0：Source Driver 對調（D1↔D3、D4↔D6，只影響預覽）、TFT 放在 drain 目標那一側、Data 線位置依線長均衡自動排。
   v1.4.5 邏輯：子像素固定（順序／顏色），Data 線位置（v1.5.0 起改線長均衡），
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
  const svgA = k => $('dm-pv-tft').getAttribute('data-' + k);
  const gapsOk = () => { const g = svgA('gaps').split(',').map(Number); return g.every((x, i) => !i || x > g[i - 1]); };
  const sidesOk = () => QA('path[data-w]').filter(p => p.getAttribute('data-off') === '0').every(p => {
    const [row, D, ud, name] = p.getAttribute('data-w').split(':'), r = rect(row, name), dot = Q('circle[data-tft="' + row + ':' + D + ':' + ud + '"]');
    const tcx = +r.getAttribute('x') + 19, dx = dlx(+D.slice(1));
    return dot && dot.getAttribute('data-side') === (tcx > dx ? 'R' : 'L') && (dot.getAttribute('data-side') === 'R' ? +dot.getAttribute('cx') > dx : +dot.getAttribute('cx') < dx);
  });
  const balOk = () => +svgA('maxlen') <= +svgA('maxlen0') + 1e-9;

  console.log('── 版面');
  const cards = Array.from(d.querySelectorAll('.card.stp')).map(c => c.id);
  ok(cards.join(',') === 'card-src,card-dm,card-pv,card-out', '卡片順序 ①②③④：' + cards.join(','));
  ok(/^v1\.[45]\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.4.x／v1.5.x：' + w.TOOL_VERSIONS.datamap);
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
  ok(gapsOk() && sidesOk() && balOk(), 'D1~D6 保持順序、各在一個縫；TFT 在目標那一側；最長 drain ≤ 固定間距（' + svgA('maxlen0') + '→' + svgA('maxlen') + '）');
  ok(st(1, 'R1') === 'ok[D1u]' && st(1, 'B2') === 'ok[D6u]' && st(1, 'R3') === 'none[]', '標準排法：R1←D1 … B2←D6，R3 沒人接（淡）');
  ok(+svgA('maxlen') === 0.5, '標準排法：每條 Data 線緊貼自己的子像素（最長 0.5 格）');
  const f0 = fills();
  fire($('dm-c0-0'), 'G2');
  ok(fills() === f0, '改 ② 後所有子像素位置與顏色完全不變');
  const wG2 = wire(1, 1, 'u', 'G2');
  ok(!!wG2 && /D1u/.test(rect(1, 'G2').getAttribute('data-in')), 'D1×Line 1-1＝G2 ⇒ drain 接到 G2');
  ok(QA('path[data-w]').some(p => +p.getAttribute('data-hops') > 0 && / A4 4 0 0 [01] /.test(p.getAttribute('d'))), '有跨線的 drain，跨線處是半圓跳線');
  ok(sidesOk() && balOk(), '改 ② 後重排：TFT 側正確、最長 drain ≤ 固定間距（' + svgA('maxlen0') + '→' + svgA('maxlen') + '）');
  ok(st(1, 'G2') === 'conflict[D1u,D5u]' && st(1, 'R1') === 'none[]', 'G2 同時被 D1、D5 接到 ⇒ 衝突；R1 沒人接');
  fire($('dm-c0-0'), 'R-1');
  ok(npre() === 3 && !!rect(1, 'R-1') && !rect(1, 'R-2') && !!Q('line[data-sep]'), '改成 R-1 ⇒ 前循環 R-1…B-1 即時出現（-2 不出現）');
  ok(!!wire(1, 1, 'u', 'R-1') && st(1, 'R-1') === 'ok[D1u]' && sidesOk(), 'D1 接到 R-1，TFT 側正確');
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
  ok(gapsOk() && sidesOk() && balOk(), 'Dual：D1~D6 順序、TFT 側、最長 drain ≤ 固定間距（' + svgA('maxlen0') + '→' + svgA('maxlen') + '）');
  ok((Q('path[data-dl="1"]').getAttribute('d').match(/ A5 /g) || []).length === 4, 'Data 線跨四條 Gate 都是跳線弧');
  const T = [['R1', 'B1', 'G2', 'R3', 'B3', 'G4'], ['G1', 'R2', 'B2', 'G3', 'R4', 'B4'], ['G-1', 'R1', 'B1', 'G2', 'R3', 'B3'], ['B-1', 'G1', 'R2', 'B2', 'G3', 'R4']];
  T.forEach((row, r) => setRow(r, row));
  ok(['R1', 'G1', 'B1', 'R2', 'G2', 'B2', 'R3', 'G3', 'B3', 'R4', 'G4', 'B4'].every(p => /^ok/.test(st(1, p))), '原廠樣式 23 第一列 12 顆各被一條接到');
  ok(st(1, 'R1') === 'ok[D1u]' && st(1, 'G1') === 'ok[D1d]', 'R1 ← D1 經 Line 1-1（上）、G1 ← D1 經 Line 1-2（下）');
  ok(npre() === 3 && st(2, 'G-1') === 'ok[D1u]' && st(2, 'B-1') === 'ok[D1d]', '第二列用到 G-1／B-1 ⇒ 前循環出現，D1 往左接到 G-1、B-1');
  fire($('dm-pv-swap'), true);
  ok(st(1, 'R1') === 'ok[D3u]' && st(1, 'G2') === 'ok[D1u]' && svgA('swap') === '1' && sidesOk() && balOk(), '對調（合成）：② Data 1 的 R1 由實體 D3 送、② Data 3 的 G2 由 D1 送');
  fire($('dm-pv-swap'), false);
  ok(st(1, 'R1') === 'ok[D1u]', '取消對調 ⇒ R1 回到 D1');
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
    ok(!!g2 && /D1u/.test(rect(1, 'G2').getAttribute('data-in')), 'D1×Line 1-1 的 drain 接到 G2（跳線 ' + (g2 && g2.getAttribute('data-hops')) + '）');
    ok(sidesOk() && balOk() && gapsOk(), '真實 code：TFT 側正確、最長 drain ' + svgA('maxlen0') + '→' + svgA('maxlen') + ' 格、左右不均 ' + svgA('bal0') + '→' + svgA('bal') + '、位置 ' + svgA('gaps'));
    console.log('   未勾選：' + $('dm-pv-pos').textContent);
    console.log('── v1.5.0 Source Driver 對調（真實 code）');
    const cur0 = JSON.stringify(w.dmState.cur), sc0 = JSON.stringify(w.dmBuildScript()), ui0 = [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value).join(' ')).join('/');
    fire($('dm-pv-swap'), true);
    ok(svgA('swap') === '1' && /D3u/.test(rect(1, 'G2').getAttribute('data-in')) && /D1u/.test(rect(1, 'G1').getAttribute('data-in')), '勾選後：② Data 1 的 G2 改由實體 D3 送、② Data 3 的 G1 改由實體 D1 送');
    ok(/D2u/.test(rect(1, 'B1').getAttribute('data-in')) && /D6u/.test(rect(1, 'G4').getAttribute('data-in')) && /D4u/.test(rect(1, 'G3').getAttribute('data-in')), 'D2 不變（B1）、D4↔D6（G4 由 D6、G3 由 D4）');
    ok(Q('path[data-dl="1"]').getAttribute('data-src') === '3' && Q('path[data-dl="2"]').getAttribute('data-src') === '2', 'Data 線標示對調（D1 送 D3）');
    ok(JSON.stringify(w.dmState.cur) === cur0 && JSON.stringify(w.dmBuildScript()) === sc0 && [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value).join(' ')).join('/') === ui0, '勾選不改 ② 的值、也不改匯出 script 的內容');
    ok(sidesOk() && balOk() && gapsOk(), '勾選後重排：TFT 側正確、最長 drain ' + svgA('maxlen0') + '→' + svgA('maxlen') + ' 格、左右不均 ' + svgA('bal0') + '→' + svgA('bal') + '、位置 ' + svgA('gaps'));
    console.log('   勾選：' + $('dm-pv-pos').textContent);
    fire($('dm-gate'), 'Single-Gate');
    ok(sidesOk() && balOk() && /D3u/.test(rect(1, 'G2').getAttribute('data-in')), 'Single＋勾選：G2 由 D3、TFT 側正確、最長 ' + svgA('maxlen0') + '→' + svgA('maxlen'));
    console.log('   Single 勾選：' + $('dm-pv-pos').textContent);
    fire($('dm-pv-swap'), false); fire($('dm-gate'), 'Dual-Gate');
    ok(/D1u/.test(rect(1, 'G2').getAttribute('data-in')) && JSON.stringify(w.dmBuildScript()) === sc0, '取消勾選 ⇒ 回到 D1 送 G2，匯出仍相同');
    const rows = [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value).join(' '));
    console.log('   ② ' + rows.join(' / '));
    const uses2 = rows.some(x => /-2/.test(x)), uses1 = rows.some(x => /-1\b/.test(x));
    ok(npre() === (uses2 ? 6 : (uses1 ? 3 : 0)), '前循環依 ② 是否用到 -1／-2：npre=' + npre() + '（用到 -2：' + uses2 + '、-1：' + uses1 + '）');
    ok(!Q('[data-bad]'), '沒有衝突');
  }

  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_preview ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
