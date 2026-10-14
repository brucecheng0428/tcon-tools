#!/usr/bin/env node
/* check_datamap_i2c_import.js — datamap v1.31.3（Bruce 10/14「我用匯入 code 的話，就完全跟 i2C 沒有關係」）
   模擬 Bridge 不在 → 按連線 → ① 下載提示框＋紅色標籤＋錯誤 toast 出現 → 匯入 code → 全部消失、標籤「I2C 離線（已匯入 code）」
   → 之後重畫／清除匯入再匯入都不再出現 → 再按連線（Bridge 仍不在）才再出現。
   用法：node tools/check_datamap_i2c_import.js [repo] [--code <code.bin>]（預設用 ~/ClaudeData/em01_peerdir_20260904 的 EM01 code） */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const args = process.argv.slice(2), ci = args.indexOf('--code');
const ROOT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '..'));
let CODE = ci >= 0 ? args[ci + 1] : null;
if (!CODE) { const dir = path.join(os.homedir(), 'ClaudeData', 'em01_peerdir_20260904'); try { const f = fs.readdirSync(dir).find(n => /\.bin$/i.test(n)); if (f) CODE = path.join(dir, f); } catch (e) {} }
if (!CODE || !fs.existsSync(CODE)) { console.log('check_datamap_i2c_import: 找不到 code 檔（用 --code 指定），略過'); process.exit(2); }
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
  const needOn = () => !$('dm-i2c-need').hasAttribute('hidden');
  const errToasts = () => Array.from($('dm-toasts').children).filter(e => e.classList.contains('e')).length;
  const bytes = new Uint8Array(fs.readFileSync(CODE));
  const imp = async () => { w.dmImportBytes(bytes, path.basename(CODE)); await sleep(60); if (!$('dm-ask').classList.contains('hidden')) { $('dm-ask-yes').click(); await sleep(40); } };
  const quiet = (tag) => {
    ok(!needOn(), tag + '：下載提示框已關');
    ok(errToasts() === 0, tag + '：I2C 錯誤 toast 已清（剩 ' + errToasts() + '）');
    ok($('dm-i2c-top').getAttribute('data-i2c') === 'off' && $('dm-i2c-top').textContent === 'I2C 離線（已匯入 code）', tag + '：標籤「' + $('dm-i2c-top').textContent + '」(' + $('dm-i2c-top').getAttribute('data-i2c') + ')');
    ok(w.dmI2cState() === 'off', tag + '：I2C 狀態 off（' + w.dmI2cState() + '）');
  };
  for (const round of [1, 2]) {
    console.log('── 第 ' + round + ' 輪：Bridge 不在 → 連線 → 匯入 code');
    $('dm-link').click(); await sleep(60); if (!$('dm-ask').classList.contains('hidden')) { console.log('  （已匯入 code 時按連線先詢問：' + $('dm-ask').textContent.trim().slice(0, 60) + '）'); $('dm-ask-yes').click(); } await sleep(500);
    ok(needOn() && $('dm-i2c-need').getAttribute('data-i2cb-need') === 'none', '連線失敗 ⇒ 下載提示框出現');
    ok(errToasts() >= 1, '連線失敗 ⇒ 錯誤 toast 出現');
    ok($('dm-i2c-top').getAttribute('data-i2c') === 'none', '連線失敗 ⇒ 標籤 none');
    await imp();
    ok(w.dmState.src.kind === 'file', '匯入成功（src=' + w.dmState.src.kind + '）');
    quiet('匯入後');
    w.dmRender(); await sleep(30); quiet('重畫後');
    await sleep(300); w.dmRender(); quiet('稍後');
    w.dmClearImport(); await sleep(40); w.dmRender();
    ok(!needOn(), '清除匯入後：提示框仍不出現');
    await imp(); quiet('清除後重新匯入');
  }
  console.log(`check_datamap_i2c_import: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
