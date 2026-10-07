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
  const CH3 = ['R', 'G', 'B'], lin = n => { const m = /^([RGB])(-?\d+)$/.exec(n); if (!m) return null; const p = +m[2]; return (p > 0 ? p - 1 : p) * 3 + CH3.indexOf(m[1]); };
  const nm = l => { const px = Math.floor(l / 3), c = l - px * 3; return CH3[c] + (px >= 0 ? px + 1 : px); };
  /* v1.6.0：D(n+6) 的 drain 目標＝D(n) 的目標＋週期；縫＝D(n) 的縫＋週期 */
  const repOk = () => { const per = +svgA('period'), g = svgA('gaps').split(',').map(Number);
    if (g.length !== 12 || !g.slice(0, 6).every((x, i) => g[i + 6] === x + per)) return false;
    return QA('path[data-w]').map(p => p.getAttribute('data-w').split(':')).filter(a => +a[1].slice(1) <= 6 && lin(a[3]) !== null)
      .every(a => !!Q('path[data-w="' + a[0] + ':D' + (+a[1].slice(1) + 6) + ':' + a[2] + ':' + nm(lin(a[3]) + per) + '"]')); };
  /* 三級亮度：有 D1~D6 ⇒ main；只有 D7~D12 ⇒ rep；沒有 ⇒ dummy（所有 dummy 同一個灰色，非 dummy 的顏色照實體位置） */
  const tierOk = () => { const rs = QA('rect[data-pv]'), fills = {}; let ok2 = true;
    rs.forEach(r => { const ins = r.getAttribute('data-in').split(',').filter(Boolean).map(x => +x.slice(1, -1)), tr = r.getAttribute('data-tier');
      const pre = /-/.test(r.getAttribute('data-pv').split(':')[1]), exp = !pre && ins.some(n => n <= 6) ? 'main' : (ins.length ? 'rep' : 'dummy'); if (tr !== exp) ok2 = false;
      const key = tr === 'dummy' ? 'dummy' : r.getAttribute('data-pv').split(':')[1][0]; (fills[key] = fills[key] || new Set()).add(r.getAttribute('fill'));
      if (tr === 'rep' && +r.getAttribute('fill-opacity') >= 1) ok2 = false; });
    return ok2 && Object.values(fills).every(s => s.size === 1) && (!fills.dummy || [...fills.dummy][0] === '#262c36') && (!fills.R || [...fills.R][0] !== '#262c36'); };
  /* v1.6.2：格內只寫實體名稱（衝突時加 !），來源放在 <title> */
  const nameOnly = () => QA('g[data-tip]').every(g => { const r = g.querySelector('rect[data-pv]'), ph = r.getAttribute('data-pv').split(':')[1];
    const tx = Array.from(g.querySelectorAll('text')).map(x => x.textContent); return tx[0] === ph && tx.slice(1).every(x => x === '!') && g.querySelector('title').textContent === g.getAttribute('data-tip'); });
  const balOk = () => +svgA('maxlen') <= +svgA('maxlen0') + 1e-9;

  console.log('── 版面');
  const cards = Array.from(d.querySelectorAll('.card.stp')).map(c => c.id);
  ok(cards.join(',') === 'card-src,card-dm,card-pv,card-out', '卡片順序 ①②③④：' + cards.join(','));
  ok(/^v1\.[4-8]\./.test(w.TOOL_VERSIONS.datamap), 'datamap 版號 v1.4～v1.8：' + w.TOOL_VERSIONS.datamap);
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
  ok(QA('circle[data-dot="gate"]').length === 24 && QA('circle[data-dot="source"]').length === 24, 'Single：每列 12 顆 TFT（D1~D12），gate／source 實心點各 24');
  ok(repOk() && tierOk(), 'D7~D12＝D1~D6 平移 ' + svgA('period') + ' 格；三級亮度分類正確、dummy 是暗灰');
  ok(nameOnly() && !QA('g[data-tip] text').some(x => /^D\d|[↑↓]/.test(x.textContent)), '方格內只寫實體名稱，沒有 D n／箭號');
  ok(gapsOk() && sidesOk() && balOk(), 'D1~D6 保持順序、各在一個縫；TFT 在目標那一側；最長 drain ≤ 固定間距（' + svgA('maxlen0') + '→' + svgA('maxlen') + '）');
  ok(st(1, 'R1') === 'ok[D1u]' && st(1, 'B2') === 'ok[D6u]' && st(1, 'R3') === 'ok[D7u]' && rect(1, 'R3').getAttribute('data-tier') === 'rep', '標準排法：R1←D1 … B2←D6，R3←D7（重複組，暗色）');
  ok(+svgA('maxlen') === 0.5, '標準排法：每條 Data 線緊貼自己的子像素（最長 0.5 格）');
  const pos = () => { const m = {}; QA('rect[data-pv]').forEach(r => { m[r.getAttribute('data-pv')] = r.getAttribute('x'); }); return m; }, f0 = pos();
  fire($('dm-c0-0'), 'G2');
  ok((m => Object.keys(m).every(k => !(k in f0) || f0[k] === m[k]))(pos()) && tierOk(), '改 ② 後子像素位置不變、顏色仍照實體位置（只有亮度分級跟著接線變）');
  const wG2 = wire(1, 1, 'u', 'G2');
  ok(!!wG2 && /D1u/.test(rect(1, 'G2').getAttribute('data-in')), 'D1×Line 1-1＝G2 ⇒ drain 接到 G2');
  ok(!svgText().some(x => /^→/.test(x)) && !Q('text[data-send="1:D1u"]'), 'TFT 旁不再有「→G2」目標標籤');
  ok(QA('path[data-w]').some(p => +p.getAttribute('data-hops') > 0 && / A4 4 0 0 [01] /.test(p.getAttribute('d'))), '有跨線的 drain，跨線處是半圓跳線');
  ok(sidesOk() && balOk(), '改 ② 後重排：TFT 側正確、最長 drain ≤ 固定間距（' + svgA('maxlen0') + '→' + svgA('maxlen') + '）');
  ok(st(1, 'G2') === 'conflict[D1u,D5u]' && st(1, 'R1') === 'none[]', 'G2 同時被 D1、D5 接到 ⇒ 衝突；R1 沒人接');
  const cg = rect(1, 'G2').parentNode, ctl = cg.querySelector('title') && cg.querySelector('title').textContent;
  ok(/衝突/.test(ctl) && /D1、D5/.test(ctl) && cg.getAttribute('data-tip') === ctl && cg.querySelectorAll('text').length === 2, '衝突格：格內只有 G2 和 !，title 寫出來源：' + ctl);
  fire($('dm-c0-0'), 'R-1');
  ok(npre() === 3 && !!rect(1, 'R-1') && !rect(1, 'R-2') && !!Q('line[data-sep]'), '改成 R-1 ⇒ 前循環 R-1…B-1 即時出現（-2 不出現）');
  ok(rect(1, 'R-1').getAttribute('data-tier') === 'rep' && rect(1, 'G-1').getAttribute('data-tier') === 'dummy' && tierOk(), '前循環有接到（R-1←D1）也只用暗色；沒接到（G-1）是暗灰');
  ok(!!wire(1, 1, 'u', 'R-1') && st(1, 'R-1') === 'ok[D1u]' && sidesOk(), 'D1 接到 R-1，TFT 側正確');
  fire($('dm-c0-0'), 'B-2');
  ok(npre() === 6 && !!rect(1, 'R-2'), '改成 B-2 ⇒ 前循環 R-2…B-1 全部出現');
  fire($('dm-c0-0'), 'X');
  ok(npre() === 0 && !wire(1, 1, 'u', 'X') && QA('circle[data-dot="gate"]').length === 24 && Q('text[data-send="1:D1u"]').textContent === 'X', 'X ⇒ TFT 還在、不接線、標 X；前循環收起');
  fire($('dm-c0-0'), 'R1');
  ok(/實驗：Single/.test($('dm-pv-exp').textContent), '標「實驗」');

  console.log('── Dual Gate');
  fire($('dm-gate'), 'Dual-Gate');
  tx = svgText();
  ok(['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'].every(s => tx.includes(s)), 'Dual 畫四條 Gate');
  ok(QA('circle[data-dot="gate"]').length === 48 && QA('circle[data-dot="source"]').length === 48, 'Dual：D1~D12 每列兩顆 TFT，gate／source 實心點各 48');
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
  ok(repOk() && tierOk() && rect(1, 'R5').getAttribute('data-tier') === 'rep' && st(1, 'R5') === 'ok[D7u]', 'Dual：D7~D12 平移 12 格（R1→R5）、R5 是暗色重複組');
  fire($('dm-pv-swap'), true);
  ok(Q('path[data-dl="7"]').getAttribute('data-src') === '9' && Q('path[data-dl="10"]').getAttribute('data-src') === '12' && Q('path[data-dl="8"]').getAttribute('data-src') === '8' && st(1, 'R5') === 'ok[D9u]' && repOk(), '對調延伸：D7↔D9、D10↔D12（R5 改由 D9 送）');
  fire($('dm-pv-swap'), false);
  fire($('dm-c1-5'), 'R5');
  ok(!!Q('path[data-w="1:D6:d:R5"]') && /^conflict\[(D6d,D7u|D7u,D6d)\]$/.test(st(1, 'R5')) && !!Q('[data-bad]'), 'Line 1-2 Data 6＝R5 ⇒ 和重複組 D7 撞在 R5（衝突標示）');
  ok(/實驗：Dual/.test($('dm-pv-exp').textContent), 'Dual 標「實驗」');

  console.log('── v1.6.2 拖曳捲動');
  const wr = $('dm-pv-wrap'); let SL = 100; Object.defineProperty(wr, 'scrollLeft', { get: () => SL, set: v => { SL = v; }, configurable: true });
  ok(w.getComputedStyle(wr).cursor === 'grab', '預覽區游標＝grab：' + w.getComputedStyle(wr).cursor);
  wr.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 500 }));
  ok(wr.classList.contains('dragging') && w.getComputedStyle(wr).cursor === 'grabbing', '按下 ⇒ grabbing');
  w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 380 }));
  ok(SL === 220, '往左拖 120px ⇒ scrollLeft 100→' + SL);
  w.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true }));
  w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 100 }));
  ok(SL === 220 && !wr.classList.contains('dragging'), '放開後不再跟著動');
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
    ok(sidesOk() && balOk() && gapsOk() && repOk() && tierOk() && /D3u/.test(rect(1, 'G2').getAttribute('data-in')), 'Single＋勾選：G2 由 D3、D1~D12 各占一縫（不重疊）、TFT 側正確、最長 ' + svgA('maxlen0') + '→' + svgA('maxlen') + '、位置 ' + svgA('gaps'));
    console.log('   Single 勾選：' + $('dm-pv-pos').textContent);
    fire($('dm-pv-swap'), false); fire($('dm-gate'), 'Dual-Gate');
    ok(/D1u/.test(rect(1, 'G2').getAttribute('data-in')) && JSON.stringify(w.dmBuildScript()) === sc0, '取消勾選 ⇒ 回到 D1 送 G2，匯出仍相同');
    const rows = [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => $('dm-c' + r + '-' + c).value).join(' '));
    console.log('   ② ' + rows.join(' / '));
    ok(repOk() && tierOk() && nameOnly(), '真實 code：D7~D12 平移正確、三級亮度正確、方格只寫名稱');
    ok(rect(2, 'G-1').getAttribute('data-tier') === 'rep' && rect(2, 'B-1').getAttribute('data-tier') === 'rep' && rect(2, 'R1').getAttribute('data-tier') === 'main', '真實 code：第二列前循環 G-1／B-1 有接到但只用暗色，R1 高亮');
    const uses2 = rows.some(x => /-2/.test(x)), uses1 = rows.some(x => /-1\b/.test(x));
    ok(npre() === (uses2 ? 6 : (uses1 ? 3 : 0)), '前循環依 ② 是否用到 -1／-2：npre=' + npre() + '（用到 -2：' + uses2 + '、-1：' + uses1 + '）');
    ok(!Q('[data-bad]'), '沒有衝突');
  }

  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_preview ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
