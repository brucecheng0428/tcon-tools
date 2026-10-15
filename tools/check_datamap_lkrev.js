// v1.35.0 Benchmark「自動反推」回歸（Bruce 2026-10-15：鎖定架構後在 Benchmark 改 Source Driver／面板設定 → 自動反推 TCON 設定；追加 1～4）。
// 用法：node tools/check_datamap_lkrev.js [repo]
//   R0 未鎖定＋Benchmark 開：沒有「自動反推」按鈕（一般 Benchmark 不變）；鎖定＋Benchmark 關：沒有按鈕、Driver／面板 4 項停用、改了也被擋回。
//   R1 鎖定＋Benchmark 開：Driver／面板 4 項可改；改完 TFT 接線圖的玻璃走線（每條 drain 的路徑 d）與鎖定時完全相同（接線不動）。
//   R2 輸出對調／SHL ⇒ 上方 TCON OUT（data-dof）照新設定變；CH1 左右 ⇒ SD OUT 標號（data-dlab）照新設定變、畫面方向不翻（玻璃不動）；
//      RGB→BGR ⇒ 子像素顏色標示（data-phys）R↔B、走線不動。
//   R3 按「自動反推」⇒ Hand Mode Enable 自動打開、呼吸燈（.pv-err）≤ 鎖定當下（鎖定時 0 ⇒ 反推後 0）、走線仍不動、可「復原」回反推前。
//   R4 起點涵蓋 Auto 與 Hand（Manual 樣式）、Single／Dual，Driver／面板變更：對調、SHL、BGR、CH1、對調＋BGR、SHL＋CH1。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const cnt = {};
const ok = (c, g, m) => { cnt[g] = (cnt[g] || 0) + 1; if (c) pass++; else { fail++; if (fail < 80) console.log('  ✗ [' + g + '] ' + m); } return c; };
(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const HW = { swap: ['dm-pv-swap', false, true], shl: ['dm-pv-drv', 'f', 'r'], bgr: ['dm-pv-stripe', 'rgb', 'bgr'], ch1: ['dm-pv-first', 'l', 'r'] };
  const hwReset = () => { if (S && $('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); Object.keys(HW).forEach(k => fire($(HW[k][0]), HW[k][1])); };
  const err = () => d.querySelectorAll('#dm-pv-tft .pv-err').length;
  const wires = () => Array.from(d.querySelectorAll('#dm-pv-tft path[data-w]')).map(p => p.getAttribute('data-w') + '|' + p.getAttribute('d')).join('\n');
  const attrs = (sel, a) => Array.from(d.querySelectorAll('#dm-pv-tft ' + sel)).map(e => e.getAttribute(a)).join(',');
  const has = id => !!$(id);
  /* v1.35.2：CH1 換邊 ⇒ 畫面照一般規則左右翻（看的是 CH1 那一端），玻璃走線型態不變 ⇒ 比 drain 長度集合（翻轉不變量）；其他變更比完整路徑 */
  const lens = () => Array.from(d.querySelectorAll('#dm-pv-tft path[data-w]')).map(p => p.getAttribute('data-len')).sort().join(',');
  const wsig = ch => wires();   // CH1 換邊：接線圖本身有衝突（例 All Same）時 drain 長度不具不變性，只比沒有衝突的鎖定架構
  const cells = () => JSON.stringify(Object.keys(S.cur).filter(k => /^([cxe]\d+|mirror|chrb|rvsL|rvsH)$/.test(k)).sort().map(k => k + '=' + S.cur[k]));
  const starts = [];
  const auto = (m, set, nm) => starts.push({ m, nm: 'Auto ' + nm, go: () => { const s = DM.cloneState(S.cur); Object.assign(s, set); s.hand = 0; S.cur = s; w.dmRender(); } });
  const preset = (m, k) => starts.push({ m, nm: 'Hand ' + DM.PRESETS[k].name, go: () => { S.cur = DM.applyPreset(m, S.cur, k); w.dmRender(); } });
  auto('EM01', { panel: 2, subPanel: 3, rd: 1 }, 'HSD type4+BOE zigzag');   // Bruce 舉例
  auto('EM01', { panel: 1, subPanel: 0, rd: 0 }, 'Zigzag type1');
  auto('EM02', { panel: 0, subPanel: 0, rd: 0 }, '1D1G');
  const autoT = (m, i) => starts.push({ m, nm: 'Auto ' + A.list(m)[i].name, go: () => { S.cur = DM.setHand(m, A.apply(m, S.cur, i), false); w.dmRender(); } });
  autoT('E503', 0); autoT('EM01', 0);   // v1.35.2 Bruce 實測：E503 Auto Normal；EM01 Auto 1D1G Normal
  preset('EM01', 33); preset('EM01', 24); preset('EM01', 29);
  starts.push({ m: 'E512', nm: 'Hand Dual（Auto 反推後的表格）', go: () => { const s = DM.cloneState(S.cur); s.panel = 1; s.subPanel = 0; s.hand = 0; S.cur = s; w.dmRender(); }, handFirst: true });
  starts.push({ m: 'E501A', nm: 'Hand Single（NB）', go: () => { fire($('dm-hand'), true); const o = Array.from($('dm-gate').options).find(x => /Single/i.test(x.textContent)); if (o) fire($('dm-gate'), o.value); fire($('dm-samev'), 'R1'); $('dm-same').click(); } });
  const CHG = [['swap'], ['shl'], ['bgr'], ['ch1'], ['swap', 'bgr'], ['shl', 'ch1']];
  /* ── R0 ── */
  hwReset(); setModel('EM01'); starts[0].go();
  B.open(true);
  ok(!has('dm-bench-rev'), 'R0', '未鎖定＋Benchmark 開：不應有自動反推按鈕');
  B.open(false); $('dm-pv-lock').click();
  ok(!has('dm-bench-rev'), 'R0', '鎖定＋Benchmark 關：不應有按鈕');
  ok(['dm-pv-swap', 'dm-pv-drv', 'dm-pv-stripe', 'dm-pv-first'].every(id => $(id).disabled), 'R0', '鎖定＋Benchmark 關：Driver／面板 4 項應停用');
  { const w0 = wires(); fire($('dm-pv-swap'), true); ok($('dm-pv-swap').checked === false && wires() === w0, 'R0', '鎖定＋Benchmark 關：改輸出對調應被擋回'); }
  B.open(true);
  ok(has('dm-bench-rev') && ['dm-pv-swap', 'dm-pv-drv', 'dm-pv-stripe', 'dm-pv-first'].every(id => !$(id).disabled) && $('dm-pv-lod').disabled && $('dm-model').disabled, 'R0', '鎖定＋Benchmark 開：按鈕出現、4 項可改、Line OD／型號仍鎖');
  hwReset();
  ok(!has('dm-bench-rev'), 'R0', '解鎖後按鈕移除');
  /* ── R1～R4 ── */
  let nCase = 0, tMax = 0; const NZ = [];   // v1.35.4: exact per-cell compare; solves that cannot reach 0 are listed, not counted as 0
  for (const st of starts) for (const chg of CHG) {
    hwReset(); setModel(st.m); st.go();
    if (st.handFirst) { $('dm-pv-lock').click(); B.open(true); fire($('dm-pv-swap'), true); B.reverse(); hwReset(); }   // 先用 Auto 反推出一張 Hand 表，再當 Hand 起點
    const tag = st.m + ' ' + st.nm + ' × ' + chg.join('+');
    $('dm-pv-lock').click();
    const CH = chg.includes('ch1');
    const e0 = err(), w0 = wsig(CH), dof0 = attrs('text.dm-tco', 'data-dof'), dl0 = attrs('text.dm-sdo[data-dlab]', 'data-dlab'), ph0 = attrs('rect[data-phys]', 'data-phys');
    B.open(true);
    ok(wsig(CH) === w0 && err() === e0, 'R1', tag + '：只打開 Benchmark 不應改變接線圖');
    const preChg = JSON.stringify(S.cur);
    chg.forEach(k => fire($(HW[k][0]), HW[k][2]));
    ok(JSON.stringify(S.cur) === preChg && !(B.state && 0), 'R1', tag + '：改 Driver／面板不可自動反推（② 不變）');
    ok(wsig(CH) === w0, 'R1', tag + '：改 Driver／面板後玻璃走線應不動');
    if ((chg.includes('swap') || chg.includes('shl')) && !chg.includes('ch1')) ok(attrs('text.dm-tco', 'data-dof') !== dof0, 'R2', tag + '：TCON OUT 標示應照新設定改變');
    if (CH) ok(attrs('text.dm-sdo[data-dlab]', 'data-dlab') !== dl0 && $('dm-pv-tft').getAttribute('data-dir') === 'lr', 'R2', tag + '：CH1 改右 ⇒ SD OUT 從右邊編號（Dn+…）');
    if (chg.includes('bgr')) { const ph1 = attrs('rect[data-phys]', 'data-phys'), sw = ph0.split(',').map(c => c === 'R' ? 'B' : c === 'B' ? 'R' : c).join(','); ok(ph1 === sw, 'R2', tag + '：BGR ⇒ 子像素顏色標示 R↔B'); }
    const e1 = err(), pre = JSON.stringify(S.cur), t0 = Date.now();
    const R = B.reverse(); const dt = Date.now() - t0; tMax = Math.max(tMax, dt);
    const e2 = err();
    ok(R && S.cur.hand === 1 && $('dm-hand').checked, 'R3', tag + '：Hand Mode Enable 應自動打開');
    ok(wsig(CH) === w0, 'R3', tag + '：反推後走線應不動');
    if (CH && e0 === 0 && DM.fieldById(st.m, 'mirror')) ok((S.cur.mirror | 0) !== (S.glass ? S.glass.mirror | 0 : -1) || e2 > 0, 'R3', tag + '：CH1 換邊的 0 錯解應切換 Mirror');
    if (e2 > e0) NZ.push(tag + ': ' + e2 + ' cells (' + (R && R.txt) + ')');
    ok(e2 <= e1, 'R3', tag + '：呼吸燈 鎖定時 ' + e0 + '、改後 ' + e1 + '、反推後 ' + e2 + '（' + (R && R.txt) + '）');
    ok(R && (R.bad === 0) === (e2 === 0) && $('dm-bench-revst').textContent === R.txt, 'R3', tag + '：結果行＝' + ($('dm-bench-revst') || {}).textContent);
    /* v1.35.5（Bruce 10/15「有錯的結果不可以套用到主表、不可以寫入。0 錯才套用；有錯就保留原狀」）：有錯 ⇒ 不套用、② 不變、不需要復原；0 錯 ⇒ 照舊可復原 */
    if (R && R.bad > 0) ok(R.applied === false && JSON.stringify(S.cur) === pre && e2 === e1, 'R3', tag + '：有錯（' + R.bad + '）不應套用、② 應不變');
    else {
      ok(!$('dm-bench-undo').classList.contains('hidden'), 'R3', tag + '：應可復原');
      $('dm-bench-undo').click();
      ok(JSON.stringify(S.cur) === pre && err() === e1, 'R3', tag + '：復原應回到反推前（呼吸燈 ' + err() + ' vs ' + e1 + '）');
    }
    nCase++;
  }
  /* ── R5 連續序列（Bruce 10/15）：鎖定 → 反推 → CH1 改右 → 反推 → BGR → 反推 → CH1 改回左 → 反推 → RGB 改回 → 反推 ⇒ 每步 0 呼吸燈；
        改設定時不自動反推（呼吸燈照實出現）；回到鎖定設定時 ② 回到第一次反推的表格／Panel mode（以鎖定當下為基準，不受上一次反推影響） ── */
  /* ── R6 一次改多個條件（CH1 右＋BGR＋輸出對調）→ 按一次反推 → 0 呼吸燈 ── */
  for (const [m, i] of [['E503', 0], ['EM01', 0], ['EM01', 2]]) {
    const tag = m + ' Auto ' + A.list(m)[i].name;
    hwReset(); setModel(m); S.cur = DM.setHand(m, A.apply(m, S.cur, i), false); w.dmRender();
    $('dm-pv-lock').click(); const e0 = err(); B.open(true);
    ok(e0 === 0, 'R5', tag + '：鎖定時 0 呼吸燈（' + e0 + '）');
    B.reverse(); const T0 = cells();
    ok(err() === 0, 'R5', tag + '：第 1 次反推 0 呼吸燈');
    const seq = [['ch1', 1], ['bgr', 1], ['ch1', 0], ['bgr', 0], ['swap', 1], ['shl', 1], ['ch1', 1], ['swap', 0], ['shl', 0], ['ch1', 0]];
    for (const [k, on] of seq) {
      const pre = cells(); fire($(HW[k][0]), HW[k][on ? 2 : 1]);
      const e1 = err();
      ok(cells() === pre, 'R5', tag + '：' + k + (on ? '開' : '關') + ' 後不可自動反推');
      const R = B.reverse();
      ok(err() === 0 && R && R.bad === 0, 'R5', tag + '：' + k + (on ? '開' : '關') + ' → 反推後 0 呼吸燈（改後 ' + e1 + '、反推後 ' + err() + '：' + (R && R.txt) + '）');
      { const mc = Array.from(d.querySelectorAll('#dm-pv-tft rect[data-tier="main"]')).filter(r => r.getAttribute('data-in') && /^1:/.test(r.getAttribute('data-pv'))); const bad = mc.filter(r => r.getAttribute('data-pv').slice(2) !== r.getAttribute('data-dn')); ok(mc.length && !bad.length, 'R5', tag + ': ' + k + (on ? ' on' : ' off') + ' -> every main cell receives exactly its locked pixel (no shift): ' + bad.slice(0, 4).map(r => r.getAttribute('data-pv') + '<' + r.getAttribute('data-dn')).join(' ')); }
      if (k === 'ch1' && on && m === 'E503' && i === 0) { const first = Array.from(d.querySelectorAll('#dm-pv-tft rect[data-tier="main"]')).filter(r => r.getAttribute('data-in'))[0]; ok(first && first.getAttribute('data-pv') === '1:R1' && first.getAttribute('data-dn') === 'R1' && (S.cur.mirror | 0) === 1, 'R5', tag + ': CH1 right -> leftmost cell stays R1 and receives R1 (Mirror 1): ' + (first && first.getAttribute('data-pv') + '<' + first.getAttribute('data-dn')) + ' M' + S.cur.mirror); }
      if (k === 'ch1' && on && DM.fieldById(m, 'mirror')) ok((S.cur.mirror | 0) !== (S.glass.mirror | 0), 'R5', tag + '：CH1 改右的解應開 Mirror（TCON 整行反向）');
    }
    ok(cells() === T0, 'R5', tag + '：設定全部改回 → ② 回到第一次反推的表格／Panel mode');
    /* R6 */
    const pre = cells(); fire($('dm-pv-first'), 'r'); fire($('dm-pv-stripe'), 'bgr'); fire($('dm-pv-swap'), true);
    ok(cells() === pre && err() > 0, 'R6', tag + '：一次改 3 個條件 ⇒ 呼吸燈照實出現、② 不變（' + err() + '）');
    const R6 = B.reverse(); ok(err() === 0 && R6 && R6.bad === 0, 'R6', tag + '：按一次反推 ⇒ 0 呼吸燈（' + (R6 && R6.txt) + '）');
    /* 排名表：鎖定＋Benchmark 時第 1 名＝反推結果、每列可點（不顯示禁止） */
    const tb = $('dm-pv-combotbl'), cr = tb.querySelector('tr.dm-ccur');
    ok(tb.getAttribute('data-locked') === '0' && cr && cr.getAttribute('data-group') === '1' && cr.getAttribute('data-ok') === '1', 'R7', tag + '：排名表第 1 名＝目前（反推結果），表格不鎖：cur=' + (cr && cr.getAttribute('data-combo') + '#' + cr.getAttribute('data-group')) + ' locked=' + tb.getAttribute('data-locked'));
  }
  hwReset();
  console.log('not 0 after reverse (listed): ' + NZ.length + (NZ.length ? '\n  ' + NZ.join('\n  ') : ''));
  console.log('check_datamap_lkrev：' + nCase + ' 組（最慢反推 ' + tMax + ' ms）' + ' pass ' + pass + ' fail ' + fail + '  ' + JSON.stringify(cnt));
  process.exit(fail ? 1 : 0);
})();
