#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_i2c_pages_sim.mjs — 每個 I2C 頁用模擬 I2C（假 I2C Bridge WebSocket）實際跑一遍：
     ① 連線後第一筆碰 I2C 的訊息一定是 M-Bus 導通 C-Bus（rawwrite 0x7E:0xAB ← CD），而且只送一次
     ② 板子是 EN01 ⇒ 頁面認成 EN01（不會是 DAZ6138／6139）；MNT 板子（沒有 0x7E，NACK）照常認得、照常讀寫
   Bruce 2026-10-22：「所有用到 I2C 的網頁都應該要修正喔，你有做到嗎？」（聊天室派工 238973630923444224）
   頁面：i2c.html（先手動讀一筆、再 Check T-CON；EEPROM 板）、datamap.html（連線＝自動 Check T-CON）、
         nbdebug.html（連線＝自動認 IC）、dg-selftest.html（連線＝通訊自檢＋0xFF00 掃描；只支援 MNT，EN01 板應「認不出」）。
   需要：PLAYWRIGHT_CORE＝playwright-core 資料夾；CHROME＝Chrome 執行檔（預設 macOS 路徑）。
   用法：PLAYWRIGHT_CORE=… node tools/check_i2c_pages_sim.mjs [repo 目錄，預設本 repo]
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const PWC = process.env.PLAYWRIGHT_CORE;
if (!PWC || !existsSync(PWC)) { console.error('🛑 需要 PLAYWRIGHT_CORE=<playwright-core 資料夾>'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PWC);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0; const fails = []; const table = [];
function check(name, ok, detail) { ok ? pass++ : fail++; if (!ok) fails.push(name + (detail ? '  ' + detail : '')); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail ? '  ' + detail : '')); return ok; }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = createServer(async (req, res) => {
  try { const p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* 板子：mem 鍵＝'slave:addr'（十進位）；nack＝不回應的 slave；ff00＝{ slave: [3 byte] } */
const BOARDS = {
  EN01: { mem: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x0A, '62:8318': 0x10 }, nack: [0x60, 0x61, 0x68, 0x69], ff00: {} },   // 7D:007D＝0A（不在 E503 表；舊流程判 DAZ613x）
  EM02: { mem: {}, nack: [0x7E, 0x7C, 0x7D, 0x3E, 0x60, 0x61, 0x69], ff00: { 0x68: [0x02, 0xEF, 0xA0] } },                          // MNT：沒有 0x7E（NACK）
  EEPROM: { mem: { '80:0': 0x5A, '80:1': 0xA5 }, nack: [0x7E, 0x7C, 0x7D, 0x3E, 0x60, 0x61, 0x68, 0x69], ff00: {} },              // 只有 24Cxx（0x50）
};
const FAKE = (board) => {
  const mem = board.mem, msgs = []; window.__msgs = msgs;
  function reply(ws, r) { setTimeout(() => { ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }); }, 2); }
  function FakeWS(url) {
    const ws = this; ws.readyState = 0; ws.url = url;
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); }, 5);
    ws.send = (s) => {
      const m = JSON.parse(s); msgs.push({ t: m.type, s: m.slave, a: m.addr, d: m.data, aw: m.awid, n: m.len });
      const r = { id: m.id, ok: true, type: 'result' };
      if (m.type === 'ping') Object.assign(r, { type: 'pong', helper: 'v9.9.9', proto: 99, busy: false });
      if (m.type === 'open') Object.assign(r, { channels: 1 });
      if (['read', 'rawwrite', 'write', 'batchwrite'].includes(m.type) && board.nack.includes(m.slave)) { Object.assign(r, { ok: false, err: 'NACK', status: 2 }); return reply(ws, r); }
      if (m.type === 'read') {
        if (m.addr === 0xFF00 && (m.len || 1) === 3 && board.ff00[m.slave]) r.data = board.ff00[m.slave].slice();
        else { r.data = []; for (let i = 0; i < (m.len || 1); i++) r.data.push(mem[m.slave + ':' + (m.addr + i)] ?? 0); }
      }
      if (m.type === 'rawwrite' || m.type === 'write') (m.data || []).forEach((b, i) => { mem[m.slave + ':' + (m.addr + i)] = b; });
      if (m.id === 0) return;
      reply(ws, r);
    };
    ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose({}), 1); };
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
};
const META = ['ping', 'open', 'close', 'note', 'abortwrite', 'chandiag'];
const is7E = x => x.t === 'rawwrite' && x.s === 0x7E && x.a === 0xAB && Array.isArray(x.d) && x.d.length === 1 && x.d[0] === 0xCD;
const fmt = x => x ? (x.t + ' ' + (x.s != null ? '0x' + x.s.toString(16).toUpperCase() : '') + (x.a != null ? ':0x' + x.a.toString(16).toUpperCase() : '') + (x.d ? ' <- ' + x.d.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ') : '')) : '(none)';
function analyze(msgs) {
  const lastOpen = msgs.map(m => m.t).lastIndexOf('open');
  const after = msgs.slice(lastOpen + 1).filter(m => !META.includes(m.t));
  const firstIdx = after.findIndex(m => true);
  const first = after[0];
  const firstNon7E = after.findIndex(m => !is7E(m));
  const n7Ebefore = after.slice(0, firstNon7E < 0 ? after.length : firstNon7E).filter(is7E).length;
  return { first, firstOk: !!first && is7E(first), n7Ebefore, n7E: after.filter(is7E).length, nI2C: after.length, firstIdx };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms = 20000) { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } }

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
async function open(file, boardKey) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(FAKE, BOARDS[boardKey]);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(BASE + file, { waitUntil: 'load' });
  return { ctx, page, errs };
}
function row(pageName, board, a, ident, note) { table.push({ page: pageName, board, first: fmt(a.first), firstOk: a.firstOk, n7E: a.n7E, ident, note }); }

/* ── i2c.html ── */
async function testI2c(boardKey) {
  console.log(`i2c.html × ${boardKey}`);
  const { ctx, page, errs } = await open('i2c.html', boardKey);
  await waitFor(page, () => typeof i2ctConnect === 'function' && typeof i2ctDoRead === 'function');
  await page.evaluate(() => i2ctConnect(false));
  await waitFor(page, () => i2ctLinked === true);
  const before = await page.evaluate(() => window.__msgs.filter(m => !['ping', 'open', 'close', 'note', 'abortwrite', 'chandiag'].includes(m.t)).length);
  check('i2c.html：連線本身不做 I2C 傳輸（Bruce 9/18「去 TCON 化」不變）', before === 0, `連線後已有 ${before} 筆`);
  const slave = { EEPROM: 0x50, EM02: 0x68, EN01: 0x3E }[boardKey], aw = boardKey === 'EEPROM' ? 1 : 2;
  const rd = await page.evaluate(([s, a]) => i2ctDoRead(s, a, 0, 2, true), [slave, aw]);
  check(`i2c.html：手動讀 0x${slave.toString(16).toUpperCase()} 成功`, rd && rd.ok !== false && (rd.bytes || rd.data || []).length >= 1, JSON.stringify(rd).slice(0, 120));
  if (boardKey === 'EEPROM') check('i2c.html：EEPROM 板讀到的值正確（5A A5）', JSON.stringify((rd.bytes || rd.data || []).slice(0, 2)) === '[90,165]', JSON.stringify(rd).slice(0, 120));
  let ident = '—';
  if (boardKey !== 'EEPROM') {
    await page.evaluate(() => i2ctCheckTconRun());
    ident = await page.evaluate(() => i2ctCkResult ? (i2ctCkResult.name + (i2ctCkResult.alts ? ' [' + i2ctCkResult.alts.join('/') + ']' : '')) : 'none');
    if (boardKey === 'EN01') check('i2c.html：Check T-CON 認成 EN01', /^EN01/.test(ident) && !/613/.test(ident), ident);
    if (boardKey === 'EM02') check('i2c.html：MNT 板（0x7E NACK）Check T-CON 認成 EM02', /^EM02/.test(ident), ident);
  }
  const msgs = await page.evaluate(() => window.__msgs);
  const a = analyze(msgs);
  check(`i2c.html：連線後第一筆 I2C 是 7E:AB←CD（實際：${fmt(a.first)}）`, a.firstOk);
  check('i2c.html：手動讀取前只送一次 7E', a.n7Ebefore === 1, `送了 ${a.n7Ebefore} 次`);
  check('i2c.html：沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 200));
  row('i2c.html', boardKey, a, ident, boardKey === 'EEPROM' ? '手動讀 EEPROM 0x50' : '手動讀一筆 → Check T-CON');
  await ctx.close();
}
/* ── datamap.html ── */
async function testDatamap(boardKey) {
  console.log(`datamap.html × ${boardKey}`);
  const { ctx, page, errs } = await open('datamap.html', boardKey);
  await waitFor(page, () => !!document.getElementById('dm-link'));
  await page.click('#dm-link');
  await waitFor(page, () => { const t = (document.getElementById('dm-ic') || {}).textContent || ''; return t.length > 0; }, null, 30000);
  await sleep(500);
  const ident = await page.evaluate(() => (document.getElementById('dm-ic') || {}).textContent || '');
  if (boardKey === 'EN01') check('datamap.html：連線（自動 Check T-CON）認成 EN01', /EN01/.test(ident) && !/DAZ613|6138|6139/.test(ident.replace(/DAZ6138／DAZ6139 不自動辨認.*$/, '')), ident.slice(0, 160));
  if (boardKey === 'EM02') check('datamap.html：MNT 板認成 EM02', /EM02/.test(ident), ident.slice(0, 160));
  const a = analyze(await page.evaluate(() => window.__msgs));
  check(`datamap.html：連線後第一筆 I2C 是 7E:AB←CD（實際：${fmt(a.first)}）`, a.firstOk);
  check('datamap.html：第一筆前沒有重複送 7E', a.n7Ebefore === 1, `送了 ${a.n7Ebefore} 次`);
  check('datamap.html：沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 200));
  row('datamap.html', boardKey, a, ident.slice(0, 60), '按連線（自動 Check T-CON＋讀回）');
  await ctx.close();
}
/* ── nbdebug.html ── */
async function testNbdebug(boardKey) {
  console.log(`nbdebug.html × ${boardKey}`);
  const { ctx, page, errs } = await open('nbdebug.html', boardKey);
  await waitFor(page, () => !!document.getElementById('nd-link'));
  await page.selectOption('#nd-icsel', 'E503').catch(() => {});
  await page.click('#nd-link');
  await waitFor(page, () => { const t = (document.getElementById('nd-ic') || {}).textContent || ''; return t.length > 0; }, null, 20000);
  const ident = await page.evaluate(() => document.getElementById('nd-icsel').value + ' | ' + document.getElementById('nd-ic').textContent);
  check('nbdebug.html：連線自動認成 EN01（下拉從 E503 切到 EN01）', /^EN01 \|/.test(ident) && !/613/.test(ident), ident.slice(0, 160));
  const a = analyze(await page.evaluate(() => window.__msgs));
  check(`nbdebug.html：連線後第一筆 I2C 是 7E:AB←CD（實際：${fmt(a.first)}）`, a.firstOk);
  check('nbdebug.html：第一筆前沒有重複送 7E', a.n7Ebefore === 1, `送了 ${a.n7Ebefore} 次`);
  check('nbdebug.html：沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 200));
  row('nbdebug.html', boardKey, a, ident.split(' | ')[0], '按連線（自動認 IC）');
  await ctx.close();
}
/* ── dg-selftest.html ── */
async function testDgself(boardKey) {
  console.log(`dg-selftest.html × ${boardKey}`);
  const { ctx, page, errs } = await open('dg-selftest.html', boardKey);
  await waitFor(page, () => !!document.getElementById('dst-lnsw-on'));
  await page.evaluate(() => document.getElementById('dst-lnsw-on').click());
  await waitFor(page, () => ((document.getElementById('dst-v-ic') || {}).textContent || '').trim().length > 0, null, 20000);
  await sleep(500);
  const ident = await page.evaluate(() => ((document.getElementById('dst-v-ic') || {}).textContent || '').trim());
  if (boardKey === 'EM02') check('dg-selftest.html：MNT 板（0x7E NACK）認成 EM02', /EM02/.test(ident), ident.slice(0, 160));
  if (boardKey === 'EN01') check('dg-selftest.html：EN01 板不會被認成 MNT／6138（本頁只支援 MNT）', ident.length > 0 && !/613|EM0|E512|V512|VM02|V007/.test(ident), ident.slice(0, 160));
  const a = analyze(await page.evaluate(() => window.__msgs));
  check(`dg-selftest.html：連線後第一筆 I2C 是 7E:AB←CD（實際：${fmt(a.first)}）`, a.firstOk);
  check('dg-selftest.html：第一筆前沒有重複送 7E', a.n7Ebefore === 1, `送了 ${a.n7Ebefore} 次`);
  check('dg-selftest.html：沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 200));
  row('dg-selftest.html', boardKey, a, ident.slice(0, 60), '按連線（通訊自檢＋掃描）');
  await ctx.close();
}

try {
  await testI2c('EN01'); await testI2c('EM02'); await testI2c('EEPROM');
  await testDatamap('EN01'); await testDatamap('EM02');
  await testNbdebug('EN01');
  await testDgself('EM02'); await testDgself('EN01');
} catch (e) { check('執行', false, String(e && e.stack || e).slice(0, 400)); }
await browser.close(); srv.close();
console.log('\n頁面 | 板子 | 連線後第一筆 I2C | 7E 次數 | 辨認 | 操作');
for (const r of table) console.log(`${r.page} | ${r.board} | ${r.firstOk ? '✓' : '✗'} ${r.first} | ${r.n7E} | ${r.ident} | ${r.note}`);
console.log(`\n${fail ? '✗' : '✓'} check_i2c_pages_sim（${REPO}）：${pass} pass / ${fail} fail`);
if (fail) { console.log('失敗：\n  - ' + fails.join('\n  - ')); process.exit(1); }
