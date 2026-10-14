#!/usr/bin/env node
/* check_datamap_pxrange.js — datamap v1.30.0（Bruce 10/14）
   ① pixel 範圍 → FORCE_DE_SEL（DM.deSelForPx）Single／Dual：反推值、常用值優先、範圍太大
   ② 頁面（jsdom）：套用後 FORCE_DE_EN＝1、FORCE_DE_SEL、表格可選名稱即時更新；R｜G｜B 選擇面板欄列順序、點選後值正確；格內 T 標示隱藏；TFT 錯誤格呼吸燈 class
   用法：node tools/check_datamap_pxrange.js [repo] */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common', 'datamap-core.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const st = (p, r) => ({ hand: 1, deEn: 1, deSel: 0, panel: p, rd: r });
const SG = st(1, 0), DU = st(2, 1);
/* 每欄可選 pixel＝mntName 實際名稱（與表格下拉同一來源）：反推結果的起始欄要真的涵蓋輸入範圍 */
function names(s, base) { const g = DM.gateOf('EM02', s), out = []; for (const row of (g === 'dual' ? [0, 1] : [0])) { const set = new Set(); for (let c = 0; c < 30; c++) set.add(DM.mntName(g, row, c, 0, base)); out.push(set); } return out; }
function covers(s, base, lo, hi) { return names(s, base).every(set => { for (let p = lo; p <= hi; p++) { if (!p) continue; for (const c of 'RGB') if (!set.has(c + p)) return false; } return true; }); }
console.log('── ① deSelForPx');
const T = [
  // [狀態, lo, hi, 期望值, 常用, 超出]
  [SG, -2, 4, 0x0E, true, false], [DU, -2, 4, 0x0E, true, false],
  [SG, 1, 4, 0x0E, true, false], [DU, 1, 4, 0x0E, true, false],
  [SG, 1, 12, 0x10, false, true], [DU, 1, 12, 0x08, false, true],
  [SG, -4, 20, 0x0C, true, true], [DU, -4, 20, 0x0E, true, true],
  [SG, -8, 2, 0x1F, true, false], [SG, 5, 12, 0x20, false, false], [DU, 3, 10, 0x10, false, false], [SG, 0, 6, 0x0C, true, false],
];
for (const [s, lo, hi, v, cm, ov] of T) {
  const r = DM.deSelForPx('EM02', s, lo, hi), g = DM.gateOf('EM02', s);
  ok(r.v === v && r.common === cm && r.over === ov, `${g} ${lo}～${hi} ⇒ 0x${r.v.toString(16)}（期望 0x${v.toString(16)}）常用=${r.common} 超出=${r.over}`);
  const base = DM.deSelTs(r.v, 6)[0];
  if (!ov) ok(covers(s, base, lo, hi), `${g} ${lo}～${hi}：0x${r.v.toString(16)} 起始欄 ${base} 每列名稱都涵蓋 ${lo}～${hi}`);
  else ok(covers(s, base, r.from, r.to) && (r.to - r.from) >= 6, `${g} ${lo}～${hi} 範圍太大：最多 ${r.from}～${r.to} 確實可選`);
}

(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const FAKE = require(path.join(ROOT, 'tools/fake_i2c_bridge.js'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/Could not load|Not implemented/.test(e.message)) { console.log('  jsdomError', e.message); fail++; } });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { FAKE.install(w, 'none'); const mem = {}; Object.defineProperty(w, 'localStorage', { configurable: true, get: () => ({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }) }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {}; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(80);
  const S = w.dmState;
  for (const [nm, p, r] of [['Single', 1, 0], ['Dual', 2, 1]]) {
    console.log('── ② 頁面 ' + nm);
    Object.assign(S.cur, { hand: 1, deEn: 0, deSel: 0, panel: p, rd: r }); for (let i = 0; i < 24; i++) S.cur['c' + i] = i % 6; w.dmRender();
    ok(!$('dm-pxrow').classList.contains('hidden'), 'Pixel 範圍列顯示');
    $('dm-pxlo').value = '-2'; $('dm-pxhi').value = '4'; $('dm-pxapply').click(); await sleep(20);
    ok((S.cur.deEn | 0) === 1 && (S.cur.deSel | 0) === 0x0E, '-2～4 套用 ⇒ FORCE_DE_EN＝1、FORCE_DE_SEL＝0x0E（' + S.cur.deSel + '）');
    ok(/^→ 14 \(0x0E\)（常用）$/.test($('dm-pxres').textContent), '結果一行「' + $('dm-pxres').textContent + '」');
    ok(+$('f-deSel').value === 14 && /0x0E/.test($('f-deSelTs').textContent), 'FORCE_DE_SEL 欄位即時更新');
    const opts = Array.from($('dm-c0-0').options).map(o => o.value);
    ok(opts.includes('R-2') && opts.includes('B4') && !opts.includes('R5'), '表格可選名稱＝第 2 欄（含 R-2、B4，不含 R5）');
    $('dm-pxlo').value = '1'; $('dm-pxhi').value = '12'; $('dm-pxapply').click(); await sleep(20);
    ok($('dm-pxres').getAttribute('data-over') === '1' && /範圍太大/.test($('dm-pxres').textContent), '1～12 ⇒ 範圍太大提示「' + $('dm-pxres').textContent + '」');
    Object.assign(S.cur, { deEn: 1, deSel: 0x0E }); w.dmRender();
    // 面板
    $('dm-c0-2').parentNode.click(); await sleep(10);
    const pop = $('dm-pop');
    ok(!!pop, '點儲存格 ⇒ 開 R｜G｜B 面板');
    if (pop) {
      const bs = Array.from(pop.querySelectorAll('button')).map(b => b.getAttribute('data-v'));
      const cells = Array.from(pop.children).map(e => e.getAttribute('data-v') || '');
      const pxRows = []; for (let i = 0; i + 2 < cells.length && /^[RGB]/.test(cells[i] || cells[i + 1] || cells[i + 2]); i += 3) pxRows.push(cells.slice(i, i + 3));
      ok(pxRows.every(r3 => (!r3[0] || r3[0][0] === 'R') && (!r3[1] || r3[1][0] === 'G') && (!r3[2] || r3[2][0] === 'B')), '欄＝R｜G｜B');
      const nums = pxRows.map(r3 => +((r3[0] || r3[1] || r3[2]).slice(1)));
      ok(nums.every((n, i) => !i || n < nums[i - 1]) && nums[0] === 4 && nums[nums.length - 1] === -6, '列＝pixel 由大到小（最上 4、最下 -6）：' + nums.join(','));
      ok(pxRows.every(r3 => new Set(r3.filter(Boolean).map(x => x.slice(1))).size === 1), '同一列同一個 pixel');
      ok(bs[bs.length - 1] === 'X', '最下面一顆 X');
      ok(bs.length === Array.from($('dm-c0-2').options).filter(o => o.value && o.value !== '__ns').length, '面板只列可選範圍內的名稱（與原下拉同一份）');
      const want = bs.find(v => v !== $('dm-c0-2').value && /^G/.test(v));
      pop.querySelector('button[data-v="' + want + '"]').click(); await sleep(20);
      ok(!$('dm-pop') && $('dm-c0-2').value === want && DM.cellView('EM02', S.cur, 0, 2).txt === want, '點 ' + want + ' ⇒ 面板關閉、格子＝' + $('dm-c0-2').value);
      $('dm-c0-0').parentNode.click(); await sleep(10);
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ok(!$('dm-pop'), 'Esc 關閉');
      $('dm-c0-0').parentNode.click(); await sleep(10); d.body.click(); ok(!$('dm-pop'), '點外面關閉');
    }
  }
  console.log('── ② 格內只顯示名稱、錯誤格呼吸燈');
  const css = Array.from(d.querySelectorAll('style')).map(s => s.textContent).join('\n');
  ok(/\.dm-grid \.dm-tt, #dm-lg-tt \{ display: none !important; \}/.test(css), '格內 T／欄／gate 小字隱藏');
  ok(/@keyframes dmBreathe/.test(css) && /\.pv-err \{ animation: dmBreathe 2s/.test(css) && /prefers-reduced-motion: reduce\) \{ \.pv-err \{ animation: none/.test(css), '呼吸燈 2 秒循環＋reduced-motion 靜態');
  ok($('dm-c0-0').parentNode.title.length > 0, '格子 hover 有說明（title）');
  // 製造衝突：兩格同名 ⇒ TFT 有 pv-err
  Object.assign(S.cur, { panel: 1, rd: 0, deEn: 1, deSel: 0x0E }); for (let i = 0; i < 24; i++) S.cur['c' + i] = 0; w.dmRender(); await sleep(50);
  const errs = d.querySelectorAll('#dm-pv-tft rect.pv-err').length, bad = d.querySelectorAll('#dm-pv-tft rect[data-st="conflict"]').length;
  ok(bad > 0 && errs >= bad, 'TFT 衝突格加呼吸燈（conflict ' + bad + '、pv-err ' + errs + '）');
  console.log(`check_datamap_pxrange：${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
