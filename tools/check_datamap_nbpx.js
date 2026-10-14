#!/usr/bin/env node
/* check_datamap_nbpx.js — datamap v1.31.3（Bruce 10/14「NB的TCON也需要吧」「預設的情況其實就是 -2 到 4 吧，然後 force de SEL 就填 14」）
   所有型號（SELECT_KEYS）矩陣：不匯入 code → 勾 Hand Mode
   ・有 FORCE_DE_SEL 欄位的 NB（E503／E501A／E501B／DAZ6138／DAZ6139）與 MNT（EM01／EM02／E512）⇒ Pixel 列顯示、-2～4、FORCE_DE_EN＝1、FORCE_DE_SEL＝14
   ・沒有 FORCE_DE_SEL 的型號（DAZ6111／DAZ7353）與 EN01 ⇒ 不顯示
   ・NB：套用其他範圍 ⇒ 仍 14、提示「此型號固定 14（-2～4）」、輸入框回 -2～4；手改 FORCE_DE_SEL ⇒ 輸入框仍 -2～4，再套用回 14；Hand 關 ⇒ 列隱藏
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
    const m = DM.MODELS[k], hasSel = !!DM.fieldById(k, 'deSel'), want = hasSel && (m.kind === 'nb' || m.kind === 'mnt');
    $('dm-model').value = k; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(40);
    const S = w.dmState;
    ok($('dm-pxrow').classList.contains('hidden'), k + '：Hand 關 ⇒ Pixel 列隱藏');
    $('dm-hand').checked = true; $('dm-hand').dispatchEvent(new w.Event('change')); await sleep(40);
    const vis = !$('dm-pxrow').classList.contains('hidden');
    ok(vis === want, `${k}（${m.kind}${hasSel ? '' : '，無 FORCE_DE_SEL'}）Hand 開 ⇒ Pixel 列${want ? '顯示' : '不顯示'}（實際 ${vis ? '顯示' : '隱藏'}）`);
    if (!want) continue;
    shown++;
    ok($('dm-pxlo').value === '-2' && $('dm-pxhi').value === '4', `${k}：輸入框 -2～4（${$('dm-pxlo').value}～${$('dm-pxhi').value}）`);
    ok((S.cur.deEn | 0) === 1 && (S.cur.deSel | 0) === 14, `${k}：FORCE_DE_EN＝1、FORCE_DE_SEL＝14（${S.cur.deEn}/${S.cur.deSel}）`);
    ok(+$('f-deSel').value === 14, `${k}：FORCE_DE_SEL 欄位＝14（${$('f-deSel').value}）`);
    if (m.kind !== 'nb') continue;
    for (const [lo, hi] of [[1, 12], [-8, 2], [0, 6], [4, -2], [-2, 4]]) {
      $('dm-pxlo').value = String(lo); $('dm-pxhi').value = String(hi); $('dm-pxapply').click(); await sleep(15);
      const fixed = Math.min(lo, hi) === -2 && Math.max(lo, hi) === 4;
      ok((S.cur.deEn | 0) === 1 && (S.cur.deSel | 0) === 14, `${k} 套用 ${lo}～${hi} ⇒ 仍 14（${S.cur.deSel}）`);
      ok(fixed ? $('dm-pxres').textContent === '→ 14 (0x0E)' : $('dm-pxres').textContent === '此型號固定 14（-2～4）', `${k} 套用 ${lo}～${hi} 提示「${$('dm-pxres').textContent}」`);
      ok($('dm-pxlo').value === '-2' && $('dm-pxhi').value === '4', `${k} 套用 ${lo}～${hi} 後輸入框回 -2～4`);
    }
    // 手改 FORCE_DE_SEL ⇒ 列仍 -2～4；再套用 ⇒ 回 14（雙向一致：Pixel 列只對應 14）
    Object.assign(S.cur, { deSel: 3 }); w.dmRender(); await sleep(10);
    ok($('dm-pxlo').value === '-2' && $('dm-pxhi').value === '4' && !$('dm-pxrow').classList.contains('hidden'), `${k} 手改 FORCE_DE_SEL＝3 ⇒ 列仍 -2～4`);
    $('dm-pxapply').click(); await sleep(15);
    ok((S.cur.deSel | 0) === 14, `${k} 再套用 ⇒ FORCE_DE_SEL 回 14（${S.cur.deSel}）`);
    $('dm-hand').checked = false; $('dm-hand').dispatchEvent(new w.Event('change')); await sleep(30);
    ok($('dm-pxrow').classList.contains('hidden'), `${k} Hand 關 ⇒ 列隱藏`);
  }
  ok(shown === 8, '顯示 Pixel 列的型號數＝8（E503/E501A/E501B/DAZ6138/DAZ6139/EM01/EM02/E512；實際 ' + shown + '）');
  console.log(`check_datamap_nbpx: ${pass} pass, ${fail} fail（型號 ${keys.length}）`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
