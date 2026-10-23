#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_i2c_bridge_ui.js — 所有用 I2C and AUX Bridge 的頁面：下載入口與連線狀態（jsdom＋假 Bridge）
   Bruce 2026-10-12：「為什麼這一頁如果沒有 I2C and AUX Bridge 的話，沒有像其他要使用到 I2C 的做法一樣，
   可以去下載這個 I2C and AUX Bridge 的壓縮包？」
   頁面 × 狀態：i2c.html、dg-selftest.html、datamap.html（會連 Bridge）、dg.html（只放下載入口，連線在 dg-selftest）
     × ① 沒有 Bridge（按連線失敗）② Bridge 在、未連線 ③ 已連線
   每格驗：下載連結存在、href＝I2CBridge.dlHref()（common/i2c-bridge.js 單一來源）、指到的 zip 檔在 repo 裡；
           沒有 Bridge 時有明顯提示；已連線時狀態正確。另驗 dlHref() 在 127.0.0.1（Bridge 端出來的頁）改指線上網址。
   用法：node tools/check_i2c_bridge_ui.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const FAKE = require(path.join(ROOT, 'tools/fake_i2c_bridge.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const zipOf = href => { const f = (href || '').split('?')[0]; return f && /\.zip$/.test(f) && fs.existsSync(path.join(ROOT, f)) ? f : null; };

async function open(page, bridge) {
  const vc = new VirtualConsole();   // 頁面自己的 console 噪音不算失敗；未捕捉例外才算
  vc.on('jsdomError', e => { if (!/Could not load|Not implemented/.test(e.message)) { console.log('    jsdomError ' + page + ': ' + e.message.slice(0, 160)); } });
  /* 與 tools/dg_selftest_i2c.js 相同：把 <script src> 內嵌、用一般 https 網址（相對連結照樣解析成 data/…zip） */
  let html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => { const f = path.join(ROOT, src.split('?')[0]); return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>'; });
  const { TextEncoder, TextDecoder } = require('util');
  const dom = new JSDOM(html, { url: 'https://example.invalid/' + page, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      FAKE.install(w, bridge);
      const mem = {}; Object.defineProperty(w, 'localStorage', { configurable: true, get: () => ({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }) });
      Object.defineProperty(w, 'sessionStorage', { configurable: true, get: () => ({ getItem: () => null, setItem() {}, removeItem() {} }) });
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
      if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    } });
  if (dom.window.document.readyState !== 'complete') await new Promise(r => dom.window.addEventListener('load', r));
  await sleep(80);
  return dom;
}
const visible = (w, el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (e.hidden || e.hasAttribute('hidden')) return false; const cs = w.getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; if (/\b(hidden|dst-hidden)\b/.test(e.className && e.className.baseVal === undefined ? e.className : '')) return false; } return true; };

const PAGES = {
  'i2c.html': {
    dl: d => d.getElementById('dl'),
    connect: async w => { await w.i2ctConnect(); },
    linked: w => w.eval('i2ctLinked'),
    noBridgeHint: (w, d) => visible(w, d.getElementById('gethelper')) && visible(w, d.getElementById('dl'))
  },
  'dg-selftest.html': {
    dl: d => d.getElementById('dst-dl'),
    /* dg-selftest 的程式在 IIFE 內（v2.0.0 拿掉了 dstProbe）⇒ 照使用者操作按 I2C 的 ON 開關；連上時「I2C and AUX Bridge」欄會顯示 proto */
    connect: async w => { const b = w.document.getElementById('dst-lnsw-on'); if (b) b.click(); await sleep(600); },
    linked: w => /proto/.test((w.document.getElementById('dst-v-bridge') || {}).textContent || ''),
    noBridgeHint: (w, d) => visible(w, d.getElementById('dst-dl')) && /Bridge/i.test((d.getElementById('dst-say-link') || {}).textContent || '')
  },
  'datamap.html': {
    dl: d => d.getElementById('dm-i2c-dl'),
    connect: async w => { w.document.getElementById('dm-link').click(); await sleep(400); },
    linked: w => w.dmState.linked,
    noBridgeHint: (w, d) => visible(w, d.getElementById('dm-i2c-need')) && !!d.querySelector('#dm-i2c-need a[data-i2cb-dl]'),
    state: (w, d) => d.getElementById('dm-i2c-top').getAttribute('data-i2c')
  },
  'dg.html': { dl: d => d.getElementById('dg-pick-dl') }
};

(async () => {
  for (const page of Object.keys(PAGES)) {
    const P = PAGES[page];
    console.log('── ' + page);
    for (const st of ['none', 'off', 'on']) {
      const dom = await open(page, st === 'none' ? 'none' : 'ok'); const w = dom.window, d = w.document;
      const tag = page + ' [' + ({ none: '沒有 Bridge', off: 'Bridge 在、未連線', on: '已連線' })[st] + ']';
      ok(!!w.I2CBridge && w.I2CBridge.WS_URL === 'ws://127.0.0.1:8899/ws', tag + ' 載入共用 common/i2c-bridge.js');
      if (P.connect && st !== 'off') { try { await P.connect(w); } catch (e) { console.log('    connect threw: ' + e.message); } await sleep(100); }
      const a = P.dl(d), href = a && a.getAttribute('href');
      ok(a && href === w.I2CBridge.dlHref() && zipOf(href), tag + ' 下載連結 ' + href + ' ＝共用 dlHref()，壓縮包存在（' + (zipOf(href) ? fs.statSync(path.join(ROOT, zipOf(href))).size + ' bytes' : '缺') + '）');
      if (st === 'none' && P.noBridgeHint) ok(P.noBridgeHint(w, d), tag + ' 連不上時有明顯提示＋下載入口可見');
      if (st === 'none' && P.linked) ok(!P.linked(w), tag + ' 狀態＝未連線');
      if (st === 'on' && P.linked) ok(!!P.linked(w), tag + ' 假 Bridge 連線成功（linked）');
      if (P.state) ok(P.state(w, d) === ({ none: 'none', off: 'off', on: 'on' })[st], tag + ' 狀態徽章＝' + P.state(w, d));
      dom.window.close();
    }
  }
  /* Bridge 端出來的頁（127.0.0.1）：相對路徑在那裡不存在 ⇒ 一律指線上網址（i2c.html 原本就這樣，dg／dg-selftest／datamap 統一後也一樣） */
  {
    const src = fs.readFileSync(path.join(ROOT, 'common/i2c-bridge.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'common/version.js'), 'utf8');
    for (const [url, want] of [['http://127.0.0.1:8899/datamap.html', /^https:\/\/brucecheng0428\.github\.io\/tcon-tools\/data\/i2c(-aux)?-bridge-v[\d.]+\.zip\?v=v[\d.]+$/],
                               ['https://brucecheng0428.github.io/tcon-tools/datamap.html', /^data\/i2c(-aux)?-bridge-v[\d.]+\.zip\?v=v[\d.]+$/]]) {
      const dom = new JSDOM('<!doctype html><html><body></body></html>', { url, runScripts: 'outside-only' });
      dom.window.eval(src.replace(/^\s*(const|let) /gm, 'var '));
      ok(want.test(dom.window.I2CBridge.dlHref()), '頁面來源 ' + url + ' ⇒ dlHref ' + dom.window.I2CBridge.dlHref());
      dom.window.close();
    }
  }
  console.log((fail ? '✗' : '✓') + ' check_i2c_bridge_ui ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ' + (e && e.stack || e)); process.exit(1); });
