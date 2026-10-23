#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_i2c_simul.mjs — i2c v1.36.0 × I2C and AUX Bridge 1.19.0：I2C 治具與 DP AUX **同時使用**（模擬層）
   Bruce 2026-10-23：「I2C 跟 AUX 還是要改成可以同時使用。不要因為怕麻煩就不做」
   🔴 對面是**出貨的 bridge 原始碼**（tools/i2c-bridge/i2c_bridge.c）用 test/shim.c 在本機原封跑起來的
      「模擬 bridge」（test/sim_server.c：假 libMPSSE 治具＋假 DLL_AUX_VC 顯示卡，一顆假 EN01 T-CON），
      網頁走真 WebSocket（ws://127.0.0.1:8899）。沒有真治具、沒有真顯示卡、不是 Windows。
   驗：① 兩個分頁：一頁 I2C 治具、一頁 DP AUX，同時連上，誰都不被踢、兩邊照常讀寫
       ② 同一頁切換連線方式：另一種保持連線（不重連），切回來沿用；連線資訊寫「…也連著」
       ③ 一頁關掉 ⇒ 另一頁照常
       ④ AUX 那頁仍不能直寫 EEPROM（一則都沒送）
       ⑤ 舊 bridge（proto 7，假 WebSocket）⇒ 換連線方式照舊中斷，並說明要 1.19.0 才能同時用；被佔住時也說
       ⑥ 三語文字齊全
   用法：PLAYWRIGHT_CORE=… SIM_BRIDGE=<sim_server 執行檔> node tools/check_i2c_simul.mjs [repo]
         退出碼 0 通過／1 失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';

const REPO = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const PWC = process.env.PLAYWRIGHT_CORE, SIM = process.env.SIM_BRIDGE;
if (!PWC || !existsSync(PWC)) { console.error('🛑 需要 PLAYWRIGHT_CORE=<playwright-core 資料夾>'); process.exit(2); }
if (!SIM || !existsSync(SIM)) { console.error('🛑 需要 SIM_BRIDGE=<tools/i2c-bridge/test/sim_server.c 編出來的執行檔>'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PWC);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) { ok ? pass++ : fail++; if (!ok) fails.push(name + (detail ? '  ' + detail : '')); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail ? '  ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 8899 不能被別的程式佔著（真 bridge 不會在 Mac 上跑；佔著就停，不猜） */
const busy = await new Promise(r => { const s = net.connect(8899, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
if (busy) { console.error('🛑 127.0.0.1:8899 已被佔用'); process.exit(2); }
const sim = spawn(SIM, ['8899'], { stdio: ['ignore', 'pipe', 'pipe'] });
let simOut = ''; sim.stdout.on('data', d => { simOut += d; }); sim.stderr.on('data', d => { simOut += d; });
for (let i = 0; i < 50 && !/Running in the background/.test(simOut); i++) await sleep(100);
if (!/Running in the background/.test(simOut)) { console.error('🛑 模擬 bridge 沒起來\n' + simOut.slice(-500)); sim.kill(); process.exit(2); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = createServer(async (req, res) => {
  try { const p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* 每一則送給 bridge 的訊息都記下來（真 WebSocket 外面包一層，不改行為） */
const SPY = () => {
  const W = window.WebSocket; window.__sent = [];
  function S(u, p) { const ws = p ? new W(u, p) : new W(u); const o = ws.send.bind(ws); ws.send = (d) => { try { window.__sent.push(JSON.parse(d)); } catch (e) {} return o(d); }; return ws; }
  S.prototype = W.prototype; S.CONNECTING = 0; S.OPEN = 1; S.CLOSING = 2; S.CLOSED = 3;
  window.WebSocket = S;
};
/* 舊 bridge（proto 7）替身：一個 busy、AUX 開啟會讓出治具（1.18 行為） */
const OLD = (opt) => {
  window.__sent = [];
  function reply(ws, r) { setTimeout(() => { ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }); }, 2); }
  function FakeWS(url) {
    const ws = this; ws.readyState = 0;
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); reply(ws, { type: 'hello', helper: '1.18.1', proto: 7, busy: !!opt.busy }); }, 5);
    ws.send = (s) => { const m = JSON.parse(s); window.__sent.push(m); const r = { id: m.id, ok: true, type: 'result', cmd: m.type };
      if (m.type === 'ping') Object.assign(r, { type: 'pong', helper: '1.18.1', proto: 7 });
      if (m.type === 'open') { if (opt.busy) Object.assign(r, { ok: false, busy: true, err: 'I2C channel is held by another page' });
        else if (m.mode === 4) Object.assign(r, { channels: 1, aux: true, card: 'INTEL', monitor: 2, projic: 1, admin: true, psrSupported: true, psrOn: false, psrTurnedOff: true, tconInit: true });
        else r.channels = 1; }
      if (m.type === 'read') { r.data = Array(m.len || 1).fill(0x11); }
      if (m.id === 0) return; reply(ws, r); };
    ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose({}), 1); };
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
};
async function waitFor(page, fn, arg, ms = 15000) { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } }
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
async function open(init, opt, ctxIn) {
  const ctx = ctxIn || await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (!ctxIn) { await ctx.addInitScript(init, opt); await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} }); }
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(BASE + 'i2c.html', { waitUntil: 'load' });
  await waitFor(page, () => typeof i2ctConnect === 'function' && !!document.getElementById('in-xport'));
  await sleep(300); await waitFor(page, () => !i2ctBusy, null, 5000); await sleep(200);   /* 載入時的自動連線先跑完 */
  return { ctx, page, errs };
}
const link = async (page) => { if (await page.evaluate(() => i2ctLinked && !i2ctChannelBusy)) return true; if (await page.evaluate(() => i2ctLinked)) { await page.evaluate(() => i2ctDisconnect()); await sleep(100); } await page.click('#btn-link'); return waitFor(page, () => i2ctLinked === true && !i2ctBusy, null, 10000); };
const rd = (page, s, aw, a, n) => page.evaluate(([s, aw, a, n]) => i2ctDoRead(s, aw, a, n, true).then(r => r, e => ({ ok: false, err: String(e && e.message) })), [s, aw, a, n]);
const wrt = (page, s, aw, a, d) => page.evaluate(([s, aw, a, d]) => i2ctDoWrite(s, aw, a, d).then(r => r, e => ({ ok: false, err: String(e && e.message) })), [s, aw, a, d]);
const okR = r => r && r.ok !== false;

try {
  console.log('A. 兩個分頁：一頁 I2C 治具、一頁 DP AUX（真 bridge 原始碼、模擬硬體）');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(SPY); await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    const J = await open(null, null, ctx);
    check('治具分頁連上（載入時自動連線）', await J.page.evaluate(() => i2ctLinked && !i2ctChannelBusy));
    const X = await open(null, null, ctx);
    check('🔴 第二個分頁打開時不搶走治具分頁的 I2C', await J.page.evaluate(() => i2ctLinked && !i2ctChannelBusy));
    check('第二個分頁提示可切成 DP AUX 同時用', /切成 DP AUX/.test(await X.page.$eval('#topbanner', e => e.textContent) + await X.page.$eval('#log', e => e.textContent)), await X.page.$eval('#topbanner', e => e.textContent));
    await X.page.focus('#in-xport'); await X.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(600);
    check('🔴 第二個分頁取得焦點也不搶（沒持有過）', await J.page.evaluate(() => i2ctLinked && !i2ctChannelBusy));
    await X.page.selectOption('#in-xport', 'aux'); await sleep(300);
    check('🔴 AUX 分頁也連上（治具分頁持有中）', await link(X.page));
    check('AUX 分頁沒有顯示「在另一個頁面」', await X.page.evaluate(() => i2ctChannelBusy === false && !/另一個頁面/.test(document.getElementById('linktext').textContent)));
    check('bridge 回報 proto 9（1.20.0；8 是 1.19.0）', await X.page.evaluate(() => i2ctHelperProto) === 9);
    const r1 = await rd(J.page, 0x68, 2, 0, 3);
    check('治具分頁照常讀（沒被 AUX 踢掉）', okR(r1), JSON.stringify(r1).slice(0, 120));
    const r2 = await rd(X.page, 0x3E, 2, 0x0059, 1);
    check('AUX 分頁讀 3E:0059', okR(r2) && JSON.stringify((r2.bytes || r2.data || []).slice(0, 1)) === '[30]', JSON.stringify(r2).slice(0, 120));
    for (let i = 0; i < 6; i++) {                               /* 交錯 */
      const a = await Promise.all([wrt(J.page, 0x68, 2, 0x100 + i, [i]), wrt(X.page, 0x3E, 2, 0x0059, [0x20 + i])]);
      if (!okR(a[0]) || !okR(a[1])) { check('交錯寫入第 ' + i + ' 輪', false, JSON.stringify(a).slice(0, 200)); break; }
    }
    const r3 = await rd(X.page, 0x3E, 2, 0x0059, 1);
    check('交錯 6 輪後 AUX 讀回最後寫的值 0x25', okR(r3) && (r3.bytes || r3.data || [])[0] === 0x25, JSON.stringify(r3).slice(0, 120));
    check('兩頁都還連著', await J.page.evaluate(() => i2ctLinked) && await X.page.evaluate(() => i2ctLinked));
    const e1 = await wrt(X.page, 0x50, 2, 0, [1]);
    check('🔴 AUX 分頁仍不能直寫 EEPROM', e1 && e1.ok === false && /EEPROM/.test(e1.err || ''), JSON.stringify(e1));
    check('🔴 0x50 一則都沒送到 bridge', await X.page.evaluate(() => !window.__sent.some(m => m.slave >= 0x50 && m.slave <= 0x57)));
    await J.page.close(); await sleep(400);
    const r4 = await rd(X.page, 0x3E, 2, 0x0059, 1);
    check('🔴 治具分頁關掉 ⇒ AUX 分頁照常', okR(r4) && await X.page.evaluate(() => i2ctLinked), JSON.stringify(r4).slice(0, 100));
    check('沒有 JS 錯誤', J.errs.length + X.errs.length === 0, J.errs.concat(X.errs).join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('B. 同一頁切換連線方式：另一種保持連線');
  {
    await sleep(300);
    const { ctx, page, errs } = await open(SPY, null);
    check('治具連上', await link(page));
    const opens0 = await page.evaluate(() => window.__sent.filter(m => m.type === 'open').length);
    await page.selectOption('#in-xport', 'aux'); await sleep(200);
    check('切到 DP AUX ⇒ 本頁這一種還沒連（等他按連線）', await page.evaluate(() => i2ctLinked === false));
    const bn = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    check('提示：I2C 治具保持連線中、這一種請按連線', /I2C 治具 保持連線中/.test(bn), bn.slice(0, 160));
    check('連線資訊寫「I2C 治具 也連著」', /I2C 治具 也連著/.test(await page.$eval('#conn-info', e => e.textContent)));
    check('AUX 連上', await link(page));
    const rA = await rd(page, 0x7C, 1, 0x95, 1);
    check('AUX 讀 7C:95 ＝ 0x22', okR(rA) && (rA.bytes || rA.data || [])[0] === 0x22, JSON.stringify(rA).slice(0, 120));
    await page.selectOption('#in-xport', 'jig'); await sleep(200);
    check('🔴 切回 I2C 治具 ⇒ 直接沿用（不重連）', await page.evaluate(() => i2ctLinked === true));
    const opens1 = await page.evaluate(() => window.__sent.filter(m => m.type === 'open').length);
    check('切回時沒有再送 open', opens1 === opens0 + 1, `${opens0}→${opens1}`);
    const rJ = await rd(page, 0x68, 2, 0, 2);
    check('切回後治具照常讀', okR(rJ), JSON.stringify(rJ).slice(0, 100));
    check('連線資訊寫「DP AUX（顯示卡） 也連著」', /DP AUX（顯示卡） 也連著/.test(await page.$eval('#conn-info', e => e.textContent)));
    await page.selectOption('#in-xport', 'aux'); await sleep(200);
    check('再切到 AUX ⇒ 也直接沿用', await page.evaluate(() => i2ctLinked === true && !!i2ctAuxInfo));
    const rA2 = await rd(page, 0x3E, 2, 0x207E, 1);
    check('AUX 照常讀 3E:207E', okR(rA2) && (rA2.bytes || rA2.data || [])[0] === 0x10, JSON.stringify(rA2).slice(0, 100));
    const log = await page.$eval('#log', e => e.textContent).catch(() => '');
    check('log 寫「保持連線」與「沿用原本的連線」', /保持連線/.test(log) && /沿用原本的連線/.test(log));
    /* 另一頁接手 I2C 治具 ⇒ 本頁停放的治具連線被放掉、AUX 不受影響 */
    const O = await open(null, null, ctx);
    check('另一頁打開時不搶（本頁的治具保持連線中）', await page.evaluate(() => !!i2ctParked.jig) && await O.page.evaluate(() => i2ctChannelBusy === true));
    await O.page.evaluate(() => i2ctTakeover());
    check('另一頁按「接手」拿到 I2C 治具', await waitFor(O.page, () => i2ctLinked && !i2ctChannelBusy, null, 8000));
    await sleep(500);
    check('🔴 本頁 AUX 不受影響', okR(await rd(page, 0x3E, 2, 0x0059, 1)) && await page.evaluate(() => i2ctLinked === true));
    check('本頁停放的治具連線已放掉（不再顯示也連著）', await page.evaluate(() => !i2ctParked.jig));
    check('log 說明保持連線的那條斷了', /保持連線的 I2C 治具 斷了/.test(await page.$eval('#log', e => e.textContent)));
    /* 三語 */
    for (const [lang, re] of [['en', /stays connected|also connected/], ['zh-CN', /也连着|保持连接/]]) {
      await page.evaluate(l => applyLang(l), lang); await sleep(150);
      const t = await page.evaluate(() => TconAux.text('parkedNote', { x: 'X' }) + '|' + TconAux.text('simulOld', { have: '1.18.1' }));
      check(`三語：${lang}`, re.test(t) && /1\.19\.0/.test(t), t.slice(0, 120));
    }
    await page.evaluate(() => applyLang('zh-TW'));
    check('沒有 JS 錯誤', errs.length + O.errs.length === 0, errs.concat(O.errs).join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('C. 新網頁 × 舊 bridge（1.18.1／proto 7）');
  {
    const { ctx, page, errs } = await open(OLD, {});
    check('連上舊 bridge（治具）', await link(page));
    await page.selectOption('#in-xport', 'aux');
    await waitFor(page, () => i2ctLinked === false && !i2ctWs);
    await sleep(300);
    const bn = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    check('舊 bridge ⇒ 換連線方式照舊中斷', await page.evaluate(() => i2ctLinked === false && !i2ctParked.jig),
          await page.evaluate(() => JSON.stringify({ l: i2ctLinked, ws: !!i2ctWs, pk: !!i2ctParked.jig, p: i2ctHelperProto }) + ' ' + document.getElementById('log').textContent.slice(-400)));
    const lg = await page.$eval('#log', e => e.textContent);
    check('提示寫明要 1.19.0 才能同時用（橫幅或 log）', /1\.19\.0.*不能同時用|不能同時用.*1\.19\.0/.test(bn + ' ' + lg), bn.slice(0, 200));
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
    const B = await open(OLD, { busy: true });
    await link(B.page); await sleep(400);
    const bn2 = await B.page.$eval('#topbanner', e => e.textContent).catch(() => '');
    const lg2 = await B.page.$eval('#log', e => e.textContent);
    check('舊 bridge 被另一頁佔住 ⇒ 也說明 1.19.0 起可同時用', /1\.19\.0/.test(bn2 + lg2) && /不能同時用/.test(bn2 + lg2), bn2.slice(0, 200));
    await B.ctx.close();
  }
} catch (e) { check('執行', false, String(e && e.stack || e).slice(0, 500)); }
await browser.close(); srv.close(); sim.kill();
console.log(`\n${fail ? '✗' : '✓'} check_i2c_simul（${REPO}；模擬 bridge＝出貨原始碼＋shim，非 Windows 實機）：${pass} pass / ${fail} fail`);
if (fail) { console.log('失敗：\n  - ' + fails.join('\n  - ')); process.exit(1); }
