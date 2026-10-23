#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_bridge_version_gate.mjs — 所有會連 I2C and AUX Bridge 的頁面：版本檢查彈窗（真 Chrome＋假 Bridge）
   Bruce 2026-10-24：「如果使用者用的不是最新版本，就要跳出警告，請他關閉以後更換下載。最好是跳出彈窗的這種
   更新警告。如果他沒有下載最新的，就不讓他繼續使用。」
   頁面 × 情況：i2c.html／datamap.html／nbdebug.html／dg-selftest.html ×
     old   （Bridge exe 比 HELPER_PKG.exe 舊；另測 proto 較舊）⇒ 擋用彈窗、不送 open、頁面按鈕點不到、Esc 關不掉、
             下載鈕＝最新 zip；換成新版後按「我已更新，重新連線」⇒ 彈窗收掉、送 open
     cur   （＝HELPER_PKG）⇒ 沒有任何彈窗、照常 open
     stale （Bridge 比 HELPER_PKG 新＝分頁是舊的）⇒ 「請按 Ctrl+F5」彈窗、不擋連線
   另驗三語（i2c.html：en／zh-CN）。截圖存 SHOTS 資料夾（環境變數，可省略）。
   需要：PLAYWRIGHT_CORE＝playwright-core 資料夾；CHROME＝Chrome 執行檔（預設 macOS 路徑）。
   用法：PLAYWRIGHT_CORE=… [SHOTS=…] node tools/check_bridge_version_gate.mjs [repo 目錄]
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const PWC = process.env.PLAYWRIGHT_CORE;
if (!PWC || !existsSync(PWC)) { console.error('🛑 需要 PLAYWRIGHT_CORE=<playwright-core 資料夾>'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PWC);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) { ok ? pass++ : fail++; if (!ok) fails.push(name + (detail ? '  ' + detail : '')); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail ? '  ' + detail : '')); return ok; }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = createServer(async (req, res) => {
  try { const p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* 假 Bridge：window.__bv 決定 ping 回什麼（'old'／'oldproto'／'cur'／'stale'），可在測試中途改成 'cur' 模擬「已換新版」 */
const FAKE = (mode) => {
  window.__bv = mode; const msgs = []; window.__msgs = msgs;
  function older(v) { const p = String(v).split('.').map(n => parseInt(n, 10) || 0); for (let i = p.length - 1; i >= 0; i--) { if (p[i] > 0) { p[i]--; break; } } return p.join('.'); }
  function pongFor() {
    const P = window.HELPER_PKG || {}, m = window.__bv;
    if (m === 'old') return { helper: older(P.exe), proto: P.proto };
    if (m === 'oldproto') return { helper: P.exe, proto: P.proto - 1 };
    if (m === 'stale') return { helper: '99.0.0', proto: P.proto };
    return { helper: P.exe, proto: P.proto };
  }
  function reply(ws, r) { setTimeout(() => { ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }); }, 2); }
  function FakeWS(url) {
    const ws = this; ws.readyState = 0; ws.url = url;
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); }, 5);
    ws.send = (s) => {
      const m = JSON.parse(s); msgs.push(m.type);
      const r = { id: m.id, ok: true, type: 'result' };
      if (m.type === 'ping') Object.assign(r, { type: 'pong', busy: false }, pongFor());
      if (m.type === 'open') Object.assign(r, { channels: 1 });
      if (m.type === 'read') { r.data = new Array(m.len || 1).fill(0); r.status = 0; }
      if (m.id === 0) return;
      reply(ws, r);
    };
    ws.close = () => { if (ws.readyState === 3) return; ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose({}), 1); };
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms = 15000) { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } }
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

const PAGES = {
  'i2c.html':         { ready: () => typeof i2ctConnect === 'function', go: async (p) => p.evaluate(() => i2ctConnect(false)), btn: '#btn-link' },
  'datamap.html':     { ready: () => !!document.getElementById('dm-link'), go: async (p) => p.click('#dm-link'), btn: '#dm-link' },
  'nbdebug.html':     { ready: () => !!document.getElementById('nd-link'), go: async (p) => p.click('#nd-link'), btn: '#nd-link' },
  'dg-selftest.html': { ready: () => !!document.getElementById('dst-lnsw-on'), go: async (p) => p.evaluate(() => document.getElementById('dst-lnsw-on').click()), btn: '#dst-lnsw-on' }
};

async function open(file, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(FAKE, mode);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(BASE + file, { waitUntil: 'load' });
  await waitFor(page, PAGES[file].ready);
  await sleep(400);                       /* 頁面自己的自動連線計時器（i2c.html 250ms）先跑完 */
  return { ctx, page, errs };
}
const vis = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e || e.hasAttribute('hidden')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, id);
const nOpen = (page) => page.evaluate(() => window.__msgs.filter(t => t === 'open').length);

async function scenario(file, mode) {
  const tag = `${file} × ${mode}`;
  console.log(tag);
  const { ctx, page, errs } = await open(file, mode);
  const P = await page.evaluate(() => ({ exe: HELPER_PKG.exe, proto: HELPER_PKG.proto, file: HELPER_PKG.file, pkg: HELPER_PKG.pkg }));
  const open0 = await nOpen(page);
  if (!(await vis(page, 'i2cb-old')) && !(await vis(page, 'i2cb-stale'))) await PAGES[file].go(page);
  await sleep(600);
  if (mode === 'old' || mode === 'oldproto') {
    await waitFor(page, () => { const e = document.getElementById('i2cb-old'); return e && !e.hasAttribute('hidden'); }, null, 8000);
    check(`${tag}：跳擋用彈窗`, await vis(page, 'i2cb-old'));
    check(`${tag}：沒有送 open（讀寫與連線都不能用）`, (await nOpen(page)) === 0, 'open 次數 ' + (await nOpen(page)));
    const txt = await page.evaluate(() => document.getElementById('i2cb-old').innerText);
    check(`${tag}：彈窗一句話含「目前／最新」與「請關閉舊程式，下載最新版後重新開啟」`, /目前 .+，最新 .+），請關閉舊程式，下載最新版後重新開啟/.test(txt) && txt.indexOf(P.exe) >= 0, txt.slice(0, 120));
    const href = await page.evaluate(() => { const a = document.getElementById('i2cb-old-dl'); return a ? a.href : ''; });
    check(`${tag}：下載鈕指向最新 zip`, href.indexOf(P.file + '?v=' + P.pkg) >= 0, href);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#i2cb-old button')).map(b => b.id));
    check(`${tag}：只有「我已更新，重新連線」一顆按鈕（沒有略過）`, JSON.stringify(ids) === '["i2cb-old-re"]', JSON.stringify(ids));
    await page.keyboard.press('Escape'); await page.mouse.click(10, 10); await sleep(150);
    check(`${tag}：Esc、點背景都關不掉`, await vis(page, 'i2cb-old'));
    let clicked = true;
    try { await page.click(PAGES[file].btn, { timeout: 1200, trial: true }); } catch (e) { clicked = false; }
    check(`${tag}：頁面上的按鈕點不到（被彈窗擋住）`, !clicked);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, file.replace('.html', '') + '-' + mode + '.png') });
    /* 換成新版 Bridge ⇒ 按「我已更新，重新連線」 */
    await page.evaluate(() => { window.__bv = 'cur'; });
    await page.click('#i2cb-old-re');
    await waitFor(page, () => window.__msgs.indexOf('open') >= 0, null, 10000);
    await sleep(300);
    check(`${tag}：換新版後按「我已更新，重新連線」⇒ 彈窗收掉`, !(await vis(page, 'i2cb-old')));
    check(`${tag}：⇒ 真的連上（送了 open）`, (await nOpen(page)) >= 1);
    check(`${tag}：⇒ 背後頁面 inert 還原`, await page.evaluate(() => !document.querySelector('[data-i2cb-inert]')));
  } else if (mode === 'cur') {
    await waitFor(page, () => window.__msgs.indexOf('open') >= 0, null, 10000);
    check(`${tag}：沒有任何彈窗`, !(await vis(page, 'i2cb-old')) && !(await vis(page, 'i2cb-stale')));
    check(`${tag}：照常連線（送了 open）`, (await nOpen(page)) >= 1);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, file.replace('.html', '') + '-cur.png') });
  } else if (mode === 'stale') {
    await waitFor(page, () => { const e = document.getElementById('i2cb-stale'); return e && !e.hasAttribute('hidden'); }, null, 8000);
    const txt = await page.evaluate(() => (document.getElementById('i2cb-stale') || {}).innerText || '');
    check(`${tag}：跳「這個分頁是舊的，請按 Ctrl+F5」彈窗`, (await vis(page, 'i2cb-stale')) && /Ctrl\+F5/.test(txt) && txt.indexOf('99.0.0') >= 0, txt.slice(0, 100));
    check(`${tag}：不擋連線（送了 open）`, (await nOpen(page)) >= 1);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, file.replace('.html', '') + '-stale.png') });
    await page.click('#i2cb-stale-x');
    check(`${tag}：「先關閉」可關掉`, !(await vis(page, 'i2cb-stale')));
  }
  check(`${tag}：沒有 JS 錯誤`, errs.length === 0, errs.join(' | ').slice(0, 200));
  await ctx.close();
}

async function langs() {
  const { ctx, page } = await open('i2c.html', 'old');
  if (!(await vis(page, 'i2cb-old'))) { await PAGES['i2c.html'].go(page); await sleep(500); }
  await page.evaluate(() => { document.documentElement.lang = 'en'; }); await sleep(100);
  const en = await page.evaluate(() => document.getElementById('i2cb-old').innerText);
  check('三語：英文', /out of date \(current .+, latest .+\)\. Please close the old program, download the latest version and start it again\./.test(en) && /reconnect/i.test(en), en.slice(0, 160));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'i2c-old-en.png') });
  await page.evaluate(() => { document.documentElement.lang = 'zh-CN'; }); await sleep(100);
  const cn = await page.evaluate(() => document.getElementById('i2cb-old').innerText);
  check('三語：簡中', /版本过旧（目前 .+，最新 .+），请关闭旧程序，下载最新版后重新打开。/.test(cn) && /我已更新，重新连接/.test(cn), cn.slice(0, 120));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'i2c-old-zhcn.png') });
  await ctx.close();
}

try {
  for (const f of Object.keys(PAGES)) for (const m of ['old', 'oldproto', 'cur', 'stale']) await scenario(f, m);
  await langs();
} catch (e) { check('執行', false, String(e && e.stack || e).slice(0, 400)); }
await browser.close(); srv.close();
console.log(`\n${fail ? '✗' : '✓'} check_bridge_version_gate（${REPO}）：${pass} pass / ${fail} fail`);
if (fails.length) console.log(fails.map(s => '  · ' + s).join('\n'));
process.exit(fail ? 1 : 0);
