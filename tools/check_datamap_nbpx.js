#!/usr/bin/env node
/* check_datamap_nbpx.js — datamap v1.31.3（Bruce 10/14「NB的TCON也需要吧」「預設的情況其實就是 -2 到 4 吧，然後 force de SEL 就填 14」）
   所有型號（SELECT_KEYS）矩陣：不匯入 code → 勾 Hand Mode
   ・有 FORCE_DE_SEL 欄位的 NB（E503／E501A／E501B／DAZ6138／DAZ6139）與 MNT（EM01／EM02／E512）⇒ Pixel 列顯示、-2～4、FORCE_DE_EN＝1、FORCE_DE_SEL＝14
   ・沒有 FORCE_DE_SEL 的型號（DAZ6111／DAZ7353）⇒ 不顯示
   ・v1.35.15 NB（Bruce 10/16「預設 14，但是可以改」，取代 v1.31.4 唯讀）：輸入框可改、套用鈕在、FORCE_DE_SEL 欄位可改、提示「此型號預設 14（-6～4）」；
     手改 15 ⇒ deRev、輸入框／提示跟著變、改 Gate 後仍 15、改回 14 提示回預設；之後跑與 MNT 相同的套用矩陣與 round-trip；Hand 關 ⇒ 列隱藏
   ・v1.31.4 EN01（Bruce 10/14「EN01…跟 MNT TCON 一樣，可以改」）：Hand 開 ⇒ 顯示、可輸入、-2～4／14；5 種 Gate × 9 組範圍套用 ⇒ FORCE_DE_SEL＝DM.deSelForPx；
     FORCE_DE_SEL 1～255 全部純函式 round-trip；頁面手改代表值（每個起始欄、one-hot、常用值、0xFF/0xAA/0x55…）⇒ 輸入框＝DM.pxForDeSel
   ・MNT（EM01／EM02／E512）：輸入框可改、套用鈕在，同一矩陣（不受影響）
   用法：node tools/check_datamap_nbpx.js [repo] */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common', 'datamap-core.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const FAKE = require(path.join(ROOT, 'tools/fake_i2c_bridge.js'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/Could not load|Not implemented/.test(e.message)) { console.log('  jsdomError', e.message); fail++; } });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { FAKE.install(w, 'none'); const mem = {}; Object.defineProperty(w, 'localStorage', { configurable: true, get: () => ({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }) }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {}; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const keys = DM.SELECT_KEYS || Object.keys(DM.MODELS);
  let shown = 0;
  for (const k of keys) {
    const m = DM.MODELS[k], hasSel = !!DM.fieldById(k, 'deSel'), want = hasSel && (m.kind === 'nb' || m.kind === 'mnt' || m.kind === 'en01');
    $('dm-model').value = k; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(40);
    const S = w.dmState;
    ok($('dm-pxrow').classList.contains('hidden'), k + '：Hand 關 ⇒ Pixel 列隱藏');
    $('dm-hand').checked = true; $('dm-hand').dispatchEvent(new w.Event('change')); await sleep(40);
    const vis = !$('dm-pxrow').classList.contains('hidden');
    ok(vis === want, `${k}（${m.kind}${hasSel ? '' : '，無 FORCE_DE_SEL'}）Hand 開 ⇒ Pixel 列${want ? '顯示' : '不顯示'}（實際 ${vis ? '顯示' : '隱藏'}）`);
    if (!want) continue;
    shown++;
    const pf0 = m.kind === 'nb' ? DM.pxForDeSel(k, Object.assign({}, S.cur, { deEn: 1, deSel: 14 })) : { from: -2, to: 4 };   // v1.35.14：NB 0xE 涵蓋＝pxForDeSel（v1.35.7 起 Single -6～4）；MNT／EN01 沒匯入 code 預設 -2～4
    ok($('dm-pxlo').value === String(pf0.from) && $('dm-pxhi').value === String(pf0.to), `${k}：輸入框 ${pf0.from}～${pf0.to}（${$('dm-pxlo').value}～${$('dm-pxhi').value}）`);
    ok((S.cur.deEn | 0) === 1 && (S.cur.deSel | 0) === 14, `${k}：FORCE_DE_EN＝1、FORCE_DE_SEL＝14（${S.cur.deEn}/${S.cur.deSel}）`);
    ok(+$('f-deSel').value === 14, `${k}：FORCE_DE_SEL 欄位＝14（${$('f-deSel').value}）`);
    const fix = m.kind === 'nb';   // v1.35.15（Bruce 10/16「預設 14，但是可以改」）：NB e50x 與 MNT／EN01 一樣可輸入、可套用、FORCE_DE_SEL 可改
    ok(!$('dm-pxlo').disabled && !$('dm-pxhi').disabled && !$('dm-pxlo').readOnly && !$('dm-pxhi').readOnly, `${k}：輸入框可改（disabled ${$('dm-pxlo').disabled}／readOnly ${$('dm-pxlo').readOnly}）`);
    ok(!$('dm-pxapply').classList.contains('hidden') && !$('dm-pxapply').disabled, `${k}：套用鈕顯示可按`);
    ok(!$('f-deSel').disabled && !$('f-deSel').readOnly, `${k}：FORCE_DE_SEL 欄位可改（disabled ${$('f-deSel').disabled}／readOnly ${$('f-deSel').readOnly}）`);
    if (fix) {
      ok($('dm-pxres').textContent === `此型號預設 14（${pf0.from}～${pf0.to}）`, `${k}：提示「${$('dm-pxres').textContent}」`);
      // 手改 FORCE_DE_SEL 15 ⇒ deRev、輸入框＝pxForDeSel(15)、提示列出目前與預設；改 Gate（pyNormalize）後仍 15；改回 14 ⇒ 提示回預設
      $('f-deSel').value = '15'; $('f-deSel').dispatchEvent(new w.Event('change')); await sleep(10);
      const p15 = DM.pxForDeSel(k, S.cur);
      ok((S.cur.deSel | 0) === 15 && S.cur.deRev === 1 && $('dm-pxlo').value === String(p15.from) && $('dm-pxhi').value === String(p15.to), `${k}：手改 15 ⇒ FORCE_DE_SEL＝15、deRev、輸入框 ${p15.from}～${p15.to}（${S.cur.deSel}／${$('dm-pxlo').value}～${$('dm-pxhi').value}）`);
      ok($('dm-pxres').textContent === `目前 15（${p15.from}～${p15.to}）；此型號預設 14（${pf0.from}～${pf0.to}）`, `${k}：手改 15 提示「${$('dm-pxres').textContent}」`);
      const nm15 = DM.cellView(k, S.cur, 0, 0).txt, nm14 = DM.cellView(k, Object.assign({}, S.cur, { deRev: 0 }), 0, 0).txt;
      ok(nm15 !== nm14 || DM.cellView(k, S.cur, 0, 0).blank, `${k}：手改 15 ⇒ ② 第 1 格名稱跟著 T1 起始欄變（15：${nm15}／14：${nm14}）`);
      const gsel = $('dm-gate');
      if (gsel && gsel.options.length > 1) {
        const g0 = gsel.value, other = [].find.call(gsel.options, o => o.value !== g0 && !o.disabled);
        if (other) { gsel.value = other.value; gsel.dispatchEvent(new w.Event('change')); await sleep(15); gsel.value = g0; gsel.dispatchEvent(new w.Event('change')); await sleep(15);
          ok((S.cur.deSel | 0) === 15, `${k}：改 Gate ${g0}→${other.value}→${g0}（pyNormalize）後 FORCE_DE_SEL 仍 15（${S.cur.deSel}）`); }
      }
      $('f-deSel').value = '14'; $('f-deSel').dispatchEvent(new w.Event('change')); await sleep(10);
      ok((S.cur.deSel | 0) === 14 && $('dm-pxres').textContent === `此型號預設 14（${pf0.from}～${pf0.to}）` && $('dm-pxlo').value === String(pf0.from), `${k}：改回 14 ⇒ 提示回預設「${$('dm-pxres').textContent}」`);
    }
    {
      const gates = m.kind === 'en01' ? [['single', 0], ['dual', 1], ['tri', 2], ['mux4', 3], ['mux6', 5]] : [[DM.gateOf(k, S.cur), null]];
      for (const [gn, rd] of gates) {
        if (rd !== null) { S.cur.rd = rd; S.cur.deSel = 14; w.dmRender(); await sleep(10); }
        const gg = DM.gateOf(k, S.cur);
        ok(gg === gn && !$('dm-pxrow').classList.contains('hidden'), `${k} Gate ${gn} ⇒ 列顯示（${gg}）`);
        for (const [lo, hi] of [[1, 12], [-2, 4], [-8, 2], [0, 6], [4, -2], [-6, 4], [3, 9], [5, 14], [-4, 1]]) {
          $('dm-pxlo').value = String(lo); $('dm-pxhi').value = String(hi); $('dm-pxapply').click(); await sleep(10);
          const want = DM.deSelForPx(k, S.cur, lo, hi, gg).v;
          ok((S.cur.deEn | 0) === 1 && (S.cur.deSel | 0) === want && +$('dm-pxres').getAttribute('data-v') === want, `${k} ${gn} 套用 ${lo}～${hi} ⇒ FORCE_DE_SEL＝${want}（${S.cur.deSel}）`);
          ok(+$('f-deSel').value === want, `${k} ${gn} ${lo}～${hi} ⇒ FORCE_DE_SEL 欄位即時＝${want}（${$('f-deSel').value}）`);
        }
        const bits = DM.fieldById(k, 'deSel').bits, rtBad = [], full = 1 << bits;
        // 純函式：1～最大值全部 round-trip（pxForDeSel → deSelForPx 回同一起始欄、不 over）
        for (let v = 1; v < full; v++) { const st2 = Object.assign({}, S.cur, { deEn: 1, deSel: v }), pf = DM.pxForDeSel(k, st2, gg), bk = DM.deSelForPx(k, st2, pf.from, pf.to, gg); if (bk.base !== pf.base || bk.over) rtBad.push('fn ' + v); }
        // 頁面：代表值（每個起始欄、one-hot、常用值、全 1、交錯）手改欄位 ⇒ 輸入框＝pxForDeSel
        const sample = [...new Set([...Array(Math.min(full - 1, 16)).keys()].map(i => i + 1).concat([...Array(bits).keys()].map(b => 1 << b), DM.DE_COMMON, [full - 1, 0xAA & (full - 1), 0x55 & (full - 1), 0xF0 & (full - 1), 0xC0 & (full - 1)]).filter(v => v > 0 && v < full))];
        for (const v of sample) {
          $('f-deSel').value = String(v); $('f-deSel').dispatchEvent(new w.Event('change')); await sleep(0);
          const pf = DM.pxForDeSel(k, S.cur, gg);
          if ((S.cur.deSel | 0) !== v || $('dm-pxlo').value !== String(pf.from) || $('dm-pxhi').value !== String(pf.to)) { rtBad.push(v + ':框' + $('dm-pxlo').value + '～' + $('dm-pxhi').value); continue; }
          const back = DM.deSelForPx(k, S.cur, pf.from, pf.to, gg);
          if (back.base !== pf.base || back.over) rtBad.push(v + ':回推起始欄' + back.base + '≠' + pf.base);
        }
        ok(!rtBad.length, `${k} ${gn} FORCE_DE_SEL 1～${full - 1} round-trip＋頁面 ${sample.length} 個代表值手改 ⇒ 輸入框＝pxForDeSel${rtBad.length ? '：' + rtBad.slice(0, 5).join('；') : ''}`);
        S.cur.deSel = 14; w.dmRender(); await sleep(5);
      }
    }
    $('dm-hand').checked = false; $('dm-hand').dispatchEvent(new w.Event('change')); await sleep(30);
    ok($('dm-pxrow').classList.contains('hidden'), `${k} Hand 關 ⇒ 列隱藏`);
  }
  ok(shown === 9, '顯示 Pixel 列的型號數＝9（E503/E501A/E501B/DAZ6138/DAZ6139/EN01/EM01/EM02/E512；實際 ' + shown + '）');
  console.log(`check_datamap_nbpx: ${pass} pass, ${fail} fail（型號 ${keys.length}）`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
