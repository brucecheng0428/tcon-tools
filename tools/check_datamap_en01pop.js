// 用法：node tools/check_datamap_en01pop.js [repo]
// v1.35.23（Bruce 10/17「EN01 的 Data Mapping 裡面，這個表格我點了以後，它的排列並不是像其他題卡一樣是 RGB 並列，而且越右邊的畫面上在越上方。請把它做成相同的 UI 介面。」）
// EN01 表格點格子 ⇒ 與 MNT／NB 同一個 R｜G｜B 面板（popOpen）：每列＝同一 pixel 的 R｜G｜B、pixel 由大到小（與 MNT 相同）、X 在最下面整列；
// 面板選項＝該格可選名稱（code 0～131＋X 0xFF，不多不少）；點選 ⇒ 格子值與 state（byte）＝en01Value；Benchmark 表同樣。MNT EM01／NB E503 面板版面不變（對照）。
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

function layout(p) {   // 面板 → [[R,G,B]…, ['X']]
  const rows = []; const ch = [].slice.call(p.children);
  for (let i = 0; i < ch.length;) {
    if (ch[i].classList.contains('dm-pop-x')) { rows.push([ch[i].getAttribute('data-v')]); i++; continue; }
    rows.push([0, 1, 2].map(k => ch[i + k] && ch[i + k].getAttribute ? (ch[i + k].getAttribute('data-v') || '') : '')); i += 3;
  }
  return rows;
}
function checkLayout(tag, rows, names) {
  const px = [], all = [];
  rows.forEach(r => r.forEach(v => v && all.push(v)));
  let good = true, last = Infinity;
  rows.forEach((r, i) => {
    if (r.length === 1) { if (r[0] !== 'X' || i !== rows.length - 1) good = false; return; }
    const m = r.map(v => /^([RGB])(-?\d+)$/.exec(v));
    const n = m.find(Boolean); if (!n) { good = false; return; }
    const p = +n[2];
    r.forEach((v, k) => { if (v && v !== 'RGB'[k] + p) good = false; });
    if (!(p < last)) good = false; last = p; px.push(p);
  });
  ok(good, tag + '：面板每列＝同一 pixel 的 R｜G｜B、pixel 由大到小、X 最後整列（' + JSON.stringify(rows.slice(0, 2)) + '…' + JSON.stringify(rows.slice(-2)) + '）');
  const a = all.slice().sort().join(','), b = names.slice().sort().join(',');
  ok(a === b, tag + '：面板選項＝格子可選名稱（面板 ' + all.length + '／下拉 ' + names.length + '）');
  return px;
}

(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; try { w.localStorage.clear(); } catch (e) {} } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), DM = w.TCONDataMap;
  const fire = (el, ev) => el.dispatchEvent(new w.Event(ev || 'change', { bubbles: true }));
  const setModel = m => { $('dm-model').value = m; fire($('dm-model')); };
  const hand = on => { const h = $('dm-hand'); if (h.checked !== on) { h.checked = on; fire(h); } };
  const clickTd = td => td.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const pop = () => $('dm-pop');

  // EN01：每種 Gate × 數個 FORCE_DE_SEL
  const T0 = Date.now();
  setModel('EN01'); hand(true);
  if (process.env.DMV) console.log('  · EN01 hand on ' + ((Date.now() - T0) / 1000).toFixed(1) + 's');
  const gates = [].map.call($('dm-gate').options, o => o.value);
  let cases = 0;
  for (const gv of gates) {
    $('dm-gate').value = gv; fire($('dm-gate'));
    for (const ds of (process.env.DM_FULL || gv === gates[0] ? [0x0E, 0x01, 0x80] : [0x0E])) {   // jsdom 每次換 FORCE_DE_SEL 要重建 288 格選項（數十秒）；預設只有第一個 Gate 跑 3 個值，DM_FULL=1 全跑（v1.35.23 交付時全跑過）
      { const s1 = DM.cloneState(w.dmState.cur); s1.deEn = 1; s1.deSel = ds; w.dmState.cur = s1; w.dmRender(); }   // 直接放暫存器值後重畫（f-deSel change 走 commit，jsdom 很慢）
      const tds = [].filter.call(d.querySelectorAll('#dm-grid.en01 td'), t => { const s = t.querySelector('select.dm-cell'); return s && !s.disabled; });
      if (!tds.length) { ok(false, 'EN01 gate=' + gv + ' 沒有可編輯格'); continue; }
      for (const td of [tds[0], tds[tds.length - 1]]) {
        const sel = td.querySelector('select.dm-cell'), r = +sel.dataset.r, c = +sel.dataset.c;
        const names = [].map.call(sel.options, o => o.value).filter(v => v && v !== '__ns');
        clickTd(td);
        const p = pop(); const tag = 'EN01 gate=' + gv + ' deSel=0x' + ds.toString(16) + ' r' + r + 'c' + c;
        ok(!!p, tag + '：點格子出現面板'); if (!p) continue;
        ok(p.classList.contains('dm-pop'), tag + '：面板 .dm-pop（與 MNT 同一個 CSS，3 欄 grid）');
        const px = checkLayout(tag, layout(p), names);
        ok(names.length === 133 && px.length === 44, tag + '：code 0～131＋X（' + names.length + ' 項、' + px.length + ' 列 pixel）');
        // 點一個非目前值 ⇒ 格子＋state 改變
        const btn = [].find.call(p.querySelectorAll('button[data-v]'), b => b.getAttribute('data-v') !== sel.value && b.getAttribute('data-v') !== 'X');
        const v = btn.getAttribute('data-v'); btn.click();
        const T = +sel.getAttribute('data-t');
        const sel2 = $('dm-e' + r + '-' + c);
        ok(!pop() && sel2.value === v && (w.dmState.cur['e' + (r * 12 + c)] | 0) === DM.en01Value(T, v), tag + '：點 ' + v + ' ⇒ 格子＝' + sel2.value + '、byte＝' + (w.dmState.cur['e' + (r * 12 + c)] | 0) + '（en01Value ' + DM.en01Value(T, v) + '）、面板關');
        // X ⇒ 0xFF
        clickTd(sel2.parentNode); const bx = pop() && pop().querySelector('button[data-v="X"]');
        if (bx) { bx.click(); ok(($('dm-e' + r + '-' + c).value === 'X') && (w.dmState.cur['e' + (r * 12 + c)] | 0) === 0xFF, tag + '：點 X ⇒ byte 0xFF（' + (w.dmState.cur['e' + (r * 12 + c)] | 0) + '）'); }
        else ok(false, tag + '：面板沒有 X');
        cases++; if (process.env.DMV) console.log('  · ' + tag + ' ' + ((Date.now() - T0) / 1000).toFixed(1) + 's');
      }
    }
  }
  $('dm-gate').value = gates[0]; fire($('dm-gate'));   // 收尾檢查回到 Single（列少，jsdom 重畫快）
  if (process.env.DMV) console.log('  · tail start ' + ((Date.now() - T0) / 1000).toFixed(1) + 's');
  // T 欄（唯讀）點了不開面板
  { const t = d.querySelector('#dm-grid.en01 .dm-en01t'); if (t) { clickTd(t.parentNode); ok(!pop(), 'EN01 T 欄（唯讀）點了不開面板'); } }
  // Esc 關閉
  { const td = [].find.call(d.querySelectorAll('#dm-grid.en01 td'), t => t.querySelector('select.dm-cell:not([disabled])')); clickTd(td); d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ok(!pop(), 'EN01 面板 Esc 關閉'); }
  // Hand 關 ⇒ 格子 disabled ⇒ 不開
  hand(false); { const td = [].find.call(d.querySelectorAll('#dm-grid.en01 td'), t => t.querySelector('select.dm-cell')); if (td) { clickTd(td); ok(!pop(), 'EN01 Hand 關 ⇒ 點格子不開面板'); } } hand(true);
  if (process.env.DMV) console.log('  · bench start ' + ((Date.now() - T0) / 1000).toFixed(1) + 's');
  // Benchmark 表（EN01）同樣
  { const tog = $('dm-bench-tog'); if (tog && $('dm-bench').classList.contains('hidden')) tog.click();
    const td = [].find.call(d.querySelectorAll('#dm-bgrid td'), t => { const s = t.querySelector('select.dm-cell'); return s && !s.disabled; });
    if (td) { const sel = td.querySelector('select.dm-cell'); const names = [].map.call(sel.options, o => o.value).filter(v => v && v !== '__ns'); clickTd(td); ok(!!pop(), 'EN01 Benchmark 表點格子出現面板'); if (pop()) { checkLayout('EN01 Benchmark', layout(pop()), names); d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } }
    else ok(false, 'EN01 Benchmark 表沒有可編輯格'); }

  // 對照：MNT EM01、NB E503 面板版面規則相同（沒被改壞）
  for (const m of ['EM01', 'E503']) {
    setModel(m); hand(true);
    const td = [].filter.call(d.querySelectorAll('#dm-grid td'), t => { const s = t.querySelector('select.dm-cell'); return s && !s.disabled && s.options.length > 3; })[0];
    if (!td) { ok(false, m + ' 沒有可編輯格'); continue; }
    const sel = td.querySelector('select.dm-cell'); const names = [].map.call(sel.options, o => o.value).filter(v => v && v !== '__ns');
    clickTd(td); ok(!!pop(), m + '：點格子出現面板'); if (pop()) { checkLayout(m, layout(pop()), names); d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  }
  console.log('EN01 格子案例 ' + cases + '（' + gates.length + ' Gate；' + (process.env.DM_FULL ? '每個 Gate 3 個' : '第一個 Gate 3 個、其他 1 個') + ' FORCE_DE_SEL；每次首末 2 格）');
  console.log(`check_datamap_en01pop: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
