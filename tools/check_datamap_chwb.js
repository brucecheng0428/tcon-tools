#!/usr/bin/env node
/* check_datamap_chwb.js — datamap v1.33.0（Bruce 10/15「CHWB 按下去的那一刻，應該要可以實現在 TFT 接線圖上」）
   鎖定架構後 CHWB＝1 ⇒ TFT 接線圖每格亮暗反相（黑轉白、白轉黑），逐格依實際收到的資料計算；未鎖定時 CHWB 不改圖。
   語意出處：EM02A1_RegisterBank.model:18168-18174 reg_chwb「Inverse pixel R, pixel G and pixel B」。
   用法：node tools/check_datamap_chwb.js [repo] */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; console.log('  ✗ jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new w.Event('change')); };
  const cells = (root) => Array.from(d.querySelectorAll((root || '#dm-pv-tft') + ' rect[data-pv]')).filter(r => r.getAttribute('data-tier') !== 'dummy').map(r => ({ pv: r.getAttribute('data-pv'), dn: r.getAttribute('data-dn'), col: r.getAttribute('data-col'), cw: r.getAttribute('data-chwb'), fill: r.getAttribute('fill') }));
  const isOn = c => c.fill !== 'none';
  const colBtn = c => $('dm-pv-colmode').querySelector('button[data-col="' + c + '"]');
  for (const k of ['E503', 'EM02', 'EN01', 'DAZ6111']) {
    console.log(k);
    fire('dm-model', k); await sleep(30);
    if ($('dm-pv-lock') && $('card-pv').classList.contains('dm-locked')) { $('dm-pv-lock').click(); await sleep(30); }
    fire('f-chwb', false); await sleep(20);
    const v0 = $('dm-pv-tft').innerHTML, reg0 = JSON.stringify(Object.assign({}, w.dmState.cur, { chwb: 0 }));
    fire('f-chwb', true); await sleep(20);
    ok($('dm-pv-tft').innerHTML === v0, k + ' 未鎖定：CHWB 勾 ⇒ 接線圖不變');
    fire('f-chwb', false); await sleep(20);
    $('dm-pv-lock').click(); await sleep(40);
    const base = cells();
    colBtn('R').click(); await sleep(20);
    if (!cells().some(c => c.col)) { console.log('  · ' + k + '：鎖定後「只送紅」原本就不作用（EN01 暫不支援預覽、沒有 TFT 接線圖，v1.32.0 同樣）；不計'); colBtn('').click(); $('dm-pv-lock').click(); await sleep(30); continue; }
    colBtn('').click(); await sleep(20);
    ok(base.length >= 6, k + ' 鎖定後非 dummy 格數 ' + base.length);
    for (const m of ['', 'R', 'G', 'B']) {
      colBtn(m).click(); await sleep(20);
      fire('f-chwb', false); await sleep(20);
      const c0 = cells(), reg1 = JSON.stringify(Object.assign({}, w.dmState.cur, { chwb: 0 }));
      fire('f-chwb', true); await sleep(20);
      const c1 = cells();
      const same = c0.length === c1.length && c0.every((c, i) => c.pv === c1[i].pv && c.dn === c1[i].dn);
      const inv = same && c0.every((c, i) => isOn(c) !== isOn(c1[i]) && c1[i].cw === '1' && c1[i].col === (isOn(c1[i]) ? 'on' : 'off'));
      ok(inv, k + ' 樣式「' + (m || '全白') + '」CHWB 0→1：' + c1.length + ' 格逐格亮暗反相（0：亮 ' + c0.filter(isOn).length + '／1：亮 ' + c1.filter(isOn).length + '）');
      if (m) {
        ok(c0.every(c => isOn(c) === (c.dn.charAt(0) === m)) && c1.every(c => isOn(c) === (c.dn.charAt(0) !== m)), k + ' 只送' + m + '：CHWB 0 ⇒ 收到 ' + m + ' 的格亮、其餘暗；CHWB 1 ⇒ 收到 ' + m + ' 的格暗、其餘亮');
      } else ok(c0.every(isOn) && c1.every(c => !isOn(c)), k + ' 全白：CHWB 1 ⇒ 全暗');
      { const a = JSON.parse(reg1), b = Object.assign({}, w.dmState.cur, { chwb: 0 }), diff = Object.keys(Object.assign({}, a, b)).filter(x => JSON.stringify(a[x]) !== JSON.stringify(b[x])); ok(!diff.length && (w.dmState.cur.chwb | 0) === 1, k + ' 只動 chwb 欄位，其他暫存器不變' + (diff.length ? '（不同：' + diff.join(',') + '）' : '')); }
      fire('f-chwb', false); await sleep(20);
      const c2 = cells();
      ok(c2.every((c, i) => isOn(c) === isOn(c0[i])) && c2.every(c => !c.cw), k + ' 取消 CHWB ⇒ 回到原亮暗');
    }
    /* 預覽小窗（#dm-mini-svg 是 #dm-pv-tft 的複本）同步 */
    const mt = $('dm-mini-tog');
    if (mt) {
      colBtn('R').click(); await sleep(20);
      if (mt.getAttribute('aria-pressed') !== 'true') { mt.classList.remove('hidden'); mt.click(); await sleep(40); }
      fire('f-chwb', true); await sleep(40);
      const a = cells('#dm-pv-tft').map(c => c.pv + isOn(c)).join(','), b = cells('#dm-mini-svg').map(c => c.pv + isOn(c)).join(',');
      ok(b.length > 0 && a === b && cells('#dm-mini-svg').some(c => c.cw === '1'), k + ' 預覽小窗與接線圖同步（CHWB 1、只送紅）');
      fire('f-chwb', false); await sleep(40);
      ok(cells('#dm-pv-tft').map(c => c.pv + isOn(c)).join(',') === cells('#dm-mini-svg').map(c => c.pv + isOn(c)).join(','), k + ' 取消 CHWB 後小窗同步');
      mt.click(); await sleep(20);
    }
    $('dm-pv-lock').click(); await sleep(30);
  }
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_chwb ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
