#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_i2c_aux.mjs — i2c.html「連線方式：DP AUX」互動測試（模擬層，沒有 Windows 實機）
   Bruce 2026-10-23：「AUX bridge 可以的話跟 i2c bridge 做在一起，用一套轉發就好」
                     「先用 I2C 網頁加入 AUX 控制（但一定要透過 tcon 來控制 i2c，不能直接對 eeprom 也寫入）」
   假 I2C and AUX Bridge 1.18.0（WebSocket 替身）照 bridge 的 AUX 規則回覆：open mode 4 回 card／monitor／admin／PSR；
   只有 0x3E／0x7C／0x7D／0x7E 回應；EEPROM 0x50–0x57 若有任何一則送到「bridge」就記下來（必須是 0 則）。
   驗：① 選 DP AUX ⇒ EEPROM 功能停用、slave 改 0x3E ② 連線送 mode 4、連線資訊顯示顯示卡 ③ 第一筆是 7E:AB←CD、
       Check T-CON 認成 EN01 ④ 一般暫存器讀寫走同一組訊息 ⑤ 🔴 直接讀寫 EEPROM（單筆、整批）一則都沒送出
       ⑥ 舊 bridge（proto 6）⇒ 叫他下載新版 ⑦ 非系統管理員（Intel）⇒ 提示 ⑧ 切回 I2C 治具 ⇒ 一切照舊
       ⑨ 三語 ⑩ 網頁與 bridge 的白名單一致（i2c_bridge_aux.h 對 common/i2c-aux.js）⑪ 375 寬不破版
   用法：PLAYWRIGHT_CORE=… node tools/check_i2c_aux.mjs [repo]　退出碼 0 通過／1 失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const PWC = process.env.PLAYWRIGHT_CORE;
if (!PWC || !existsSync(PWC)) { console.error('🛑 需要 PLAYWRIGHT_CORE=<playwright-core 資料夾>'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PWC);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.SHOTS || '';
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) { ok ? pass++ : fail++; if (!ok) fails.push(name + (detail ? '  ' + detail : '')); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail ? '  ' + detail : '')); return ok; }

/* ⑩ 兩份白名單一致 */
{
  const h = readFileSync(join(REPO, 'tools/i2c-bridge/i2c_bridge_aux.h'), 'utf8');
  const js = createRequire(import.meta.url)(join(REPO, 'common/i2c-aux.js'));
  const m = h.match(/dgh_aux_slave_ok\(uint32_t slave\)\{\s*return ([^;]+);/);
  const cs = m ? [...m[1].matchAll(/0x([0-9A-F]{2})u/gi)].map(x => parseInt(x[1], 16)).sort() : [];
  /* v1.38.1 臨時止血：網頁只放行 0x3E（7C／7D／7E 要經 M-Bus，暫停）；bridge 白名單較寬，網頁必須是它的子集 */
  check('網頁白名單是 bridge 白名單的子集，且只剩 0x3E', js.SLAVES.length === 1 && js.SLAVES[0] === 0x3E && js.SLAVES.every(x => cs.includes(x)), cs + ' vs ' + js.SLAVES);
  check('EEPROM 區間一致（0x50–0x57）', /slave>=0x50u && slave<=0x57u/.test(h) && js.EE_LO === 0x50 && js.EE_HI === 0x57);
  check('DPCD EEPROM 控制窗一致（0x480–0x48F）', /DGH_AUX_EE_LO 0x480u/.test(h) && /DGH_AUX_EE_HI 0x48Fu/.test(h) && js.DPCD_EE_LO === 0x480 && js.DPCD_EE_HI === 0x48F);
  let all = 0; for (let s = 0; s < 128; s++) if (js.check({ type: 'rawwrite', slave: s, awid: js.awidFor(s) || 2 }) === null) all++;
  check('網頁端 0x00–0x7F 寫入只放行 2 個 slave（0x3E、0x7C）', all === 2, String(all));
  check('7D／7E 讀寫在網頁端擋下；7C 的 bridge read 擋（讀走 DPCD）、7C 寫入放行', [0x7D, 0x7E].every(x => js.check({ type: 'read', slave: x, awid: 2 }) && js.check({ type: 'rawwrite', slave: x, awid: 1 })) && js.check({ type: 'read', slave: 0x7C, awid: 1 }) && js.check({ type: 'rawwrite', slave: 0x7C, awid: 1 }) === null);
  check('dpcdWriteOk 擋 0x482、放 0x100', !js.dpcdWriteOk(0x482, 1) && js.dpcdWriteOk(0x100, 1) && !js.dpcdWriteOk(0x47E, 4));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = createServer(async (req, res) => {
  try { const p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

/* 假 bridge：opt.proto、opt.admin、opt.card；EN01 板（7C:95=22、3E:207E=10…） */
const FAKE = (opt) => {
  const mem = { '124:149': 0x22, '124:152': 0x00, '125:125': 0x0A, '62:8318': 0x10, '62:89': 0x1E };
  const msgs = []; window.__msgs = msgs; window.__ee = []; window.__mem = mem;
  let aux = false;
  function reply(ws, r) { setTimeout(() => { ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }); }, 2); }
  function FakeWS(url) {
    const ws = this; ws.readyState = 0; ws.url = url;
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); }, 5);
    ws.send = (s) => {
      const m = JSON.parse(s); msgs.push({ t: m.type, s: m.slave, a: m.addr, d: m.data, aw: m.awid, n: m.len, mode: m.mode });
      if (m.type === 'dpcdread' || m.type === 'dpcdwrite') window.__dpcd = (window.__dpcd || []).concat([{ t: m.type, a: m.addr, d: m.data, n: m.len }]);
      const r = { id: m.id, ok: true, type: 'result', cmd: m.type };
      if (m.type === 'ping') Object.assign(r, { type: 'pong', helper: opt.proto >= 9 ? '1.20.0' : opt.proto >= 7 ? '1.18.0' : '1.17.0', proto: opt.proto, busy: false });
      if (m.type === 'open') {
        aux = (m.mode === 4);
        if (aux) Object.assign(r, { channels: 1, aux: true, card: opt.card || 'INTEL', monitor: 2, projic: 1, admin: opt.admin !== false, psrSupported: true, psrOn: false, psrTurnedOff: true, tconInit: opt.tconInit !== false },
                               opt.proto >= 9 ? { regPath: 'auto', eeRead: true } : {});
        else Object.assign(r, { channels: 1 });
      }
      if (['read', 'rawwrite', 'write', 'batchwrite'].includes(m.type)) {
        if (m.slave >= 0x50 && m.slave <= 0x57) { window.__ee.push(m.type); }
        /* bridge 1.20.0（proto 9）：AUX 模式 EEPROM 只放行 read（I2C over AUX），寫入擋 */
        const eeRd = aux && opt.proto >= 9 && m.type === 'read' && m.slave >= 0x50 && m.slave <= 0x57;
        if (eeRd) { r.data = []; const ed = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x51, 0xA1]; for (let i = 0; i < (m.len || 1); i++) r.data.push(ed[m.addr + i] ?? 0x5A); r.want = m.len; r.got = m.len;
          /* v1.39.4：實機 bridge 每 8 byte 一段（480=FF＋IOA＋sleep 10 ms），4 KB 一則超過頁面 8 秒逾時 ⇒ 假 bridge 對 >256 byte 的 AUX EEPROM 讀 9 秒才回 */
          if ((m.len || 1) > 256) { window.__eeBig = (window.__eeBig || 0) + 1; setTimeout(() => reply(ws, r), 9000); return; }
          return reply(ws, r); }
        if (aux && opt.auxRegFail && m.type === 'read' && (m.slave === 0x3E || m.slave === 0x7C)) { Object.assign(r, { ok: false, err: 'AUX DPCD_Write 0x430 failed (3E:207E)' }); return reply(ws, r); }
        if (aux && ![0x3E, 0x7C, 0x7D, 0x7E].includes(m.slave)) { Object.assign(r, { ok: false, err: 'DP AUX mode: not a T-CON slave' }); return reply(ws, r); }
        if (!aux && [0x60, 0x61, 0x68, 0x69].includes(m.slave)) { Object.assign(r, { ok: false, err: 'NACK', status: 2 }); return reply(ws, r); }
      }
      if (m.type === 'read') { r.data = []; for (let i = 0; i < (m.len || 1); i++) r.data.push(mem[m.slave + ':' + (m.addr + i)] ?? 0); r.want = m.len; r.got = m.len; }
      if (m.type === 'rawwrite' || m.type === 'write') { (m.data || []).forEach((b, i) => { mem[m.slave + ':' + (m.addr + i)] = b; }); r.transferred = (m.data || []).length; }
      if (m.type === 'batchwrite') Object.assign(r, { segs: 1, segsDone: 1, done: m.len, total: m.len });
      /* v1.39.0：DPCD 視窗（431＝7C 位址 → 434 讀 7C；43C＝Tcon Name）。auxRegFail ⇒ DPCD 也讀不到 */
      if (m.type === 'dpcdwrite') { if (opt.auxRegFail) Object.assign(r, { ok: false, err: 'DPCD_Write failed' }); else if (m.addr === 0x431) window.__p431 = m.data[0]; }
      if (m.type === 'dpcdread') { if (opt.auxRegFail) Object.assign(r, { ok: false, err: 'DPCD_Read failed' });
        else if (m.addr === 0x434) r.data = [mem['124:' + (window.__p431 | 0)] ?? 0];
        else if (m.addr === 0x43C) r.data = (opt.n43c || [0xE5, 0x03]).slice(0, m.len || 2);
        else if (m.addr === 0x700) r.data = [opt.edp | 0];
        else r.data = new Array(m.len || 1).fill(0); }
      if (m.id === 0) return;
      reply(ws, r);
    };
    ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose({}), 1); };
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms = 15000) { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } }
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
async function open(opt, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(FAKE, opt);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(BASE + 'i2c.html', { waitUntil: 'load' });
  await waitFor(page, () => typeof i2ctConnect === 'function' && !!document.getElementById('in-xport'));
  return { ctx, page, errs };
}

try {
  console.log('A. 選 DP AUX → 連線 → Check T-CON → 讀寫 T-CON → 擋 EEPROM');
  {
    const { ctx, page, errs } = await open({ proto: 7 });
    check('連線方式下拉存在，預設 I2C 治具', await page.$eval('#in-xport', e => e.value) === 'jig');
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    check('選 DP AUX ⇒ EEPROM 分段鈕停用', await page.$eval('#mode-seg [data-mode="ee"]', b => b.disabled));
    check('選 DP AUX ⇒ slave 改成 0x3E', /^0x3E$/i.test(await page.$eval('#in-slave', e => e.value.trim())), await page.$eval('#in-slave', e => e.value));
    check('slave 常用下拉的 0x50 停用', await page.$eval('#in-slave-sel option[value="0x50"]', o => o.disabled));
    await page.click('#btn-link');
    await waitFor(page, () => i2ctLinked === true);
    const op = await page.evaluate(() => window.__msgs.filter(m => m.t === 'open').pop());
    check('open 送 mode 4（DP AUX）', op && op.mode === 4, JSON.stringify(op));
    const ci = await page.$eval('#conn-info', e => e.textContent);
    check('v1.41.0：連線資訊顯示 GPU 廠牌（INTEL ⇒ Intel）', /GPU Intel/.test(ci), ci);
    check('v1.41.0：DPCD 0x700 讀不到／00 ⇒ 螢幕「未知」（不猜）', /螢幕 未知/.test(ci) && !/PSR/.test(ci), ci);
    await page.evaluate(() => i2ctCheckTconRun());
    const ident = await page.evaluate(() => i2ctCkResult ? i2ctCkResult.name : 'none');
    check('v1.39.0：Check T-CON（AUX，只走 DPCD）認成 EN01（3E:207E＝10）', /^EN01/.test(ident), ident);
    check('v1.39.0：AUX 模式 Check T-CON 鈕可按、提示只走 DPCD', await page.$eval('#btn-checktcon', b => !b.disabled && /只走 DPCD/.test(b.title)));
    const bus = await page.evaluate(() => window.__msgs.filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)));
    { const is7E = m => m.t === 'rawwrite' && m.s === 0x7E && m.a === 0xAB && JSON.stringify(m.d) === '[205]';
      /* v1.38.0：AUX 序列和 I2C 一模一樣（先 7E:AB←CD，再 TconDetect）；7E 只送這一筆（不經共用 session 再補一筆） */
      check('v1.39.0：AUX Check T-CON 沒有 IOA：0 筆寫入（沒有 7E:AB←CD）、bridge 的 read 只有 3E', bus.filter(m => m.t !== 'read').length === 0 && bus.every(m => m.s === 0x3E) && !bus.some(is7E), JSON.stringify(bus.slice(0, 4)));
      const dp = await page.evaluate(() => window.__dpcd || []);
      check('v1.39.0：7C 走 DPCD 431→434（IdentifyChipId 讀法）', dp.some(x => x.t === 'dpcdwrite' && x.a === 0x431 && x.d[0] === 0x95) && dp.some(x => x.t === 'dpcdread' && x.a === 0x434), JSON.stringify(dp.slice(0, 4))); }
    const rd = await page.evaluate(() => i2ctDoRead(0x3E, 2, 0x0059, 1, true));
    check('讀 3E:0059（一般暫存器，同一組 read 訊息）', rd && rd.ok !== false && JSON.stringify((rd.bytes || rd.data || []).slice(0, 1)) === '[30]', JSON.stringify(rd).slice(0, 100));
    const wr = await page.evaluate(() => i2ctDoWrite(0x3E, 2, 0x0059, [0x22]));
    check('寫 3E:0059 ← 22 成功', wr && wr.ok !== false && await page.evaluate(() => window.__mem['62:89'] === 0x22), JSON.stringify(wr));
    const n0 = await page.evaluate(() => window.__msgs.length);
    const e1 = await page.evaluate(() => i2ctDoWrite(0x50, 2, 0, [1, 2, 3]));
    check('🔴 直接寫 EEPROM 0x50 被擋（回錯誤）', e1 && e1.ok === false && /EEPROM/.test(e1.err), JSON.stringify(e1));
    const e2 = await page.evaluate(() => i2ctDoRead(0x50, 2, 0, 8, true).catch(e => ({ ok: false, err: String(e.message) })));
    check('🔴 直接讀 EEPROM 0x50 也擋', !e2 || e2.ok === false || !(e2.bytes || e2.data), JSON.stringify(e2).slice(0, 120));
    const e3 = await page.evaluate(() => i2ctSendLong({ type: 'batchwrite', slave: 0x57, addr: 0, awid: 2, page: 16, twr: 5, len: 2, data: [1, 2] }, null).then(r => r, e => ({ ok: false, err: String(e.message) })));
    check('🔴 整批寫入 EEPROM（0x57）也擋', e3 && e3.ok === false && /EEPROM/.test(e3.err), JSON.stringify(e3));
    const e4 = await page.evaluate(() => i2ctDoWrite(0x68, 2, 0x1200, [1]));
    check('非 T-CON slave（0x68）擋', e4 && e4.ok === false && /0x3E/.test(e4.err), JSON.stringify(e4));
    const sentEE = await page.evaluate(() => window.__ee.length);
    const n1 = await page.evaluate(() => window.__msgs.filter(m => m.s >= 0x50 && m.s <= 0x57).length);
    check('🔴 EEPROM 那幾筆一則都沒送到 bridge', sentEE === 0 && n1 === 0, `ee=${sentEE} msgs=${n1}`);
    const log = await page.$eval('#log', e => e.textContent).catch(() => '');
    check('log 寫出被擋的原因', /不能直接存取 EEPROM/.test(log));
    await page.click('#mode-seg [data-mode="ee"]', { force: true }).catch(() => {});
    check('按停用的 EEPROM 鈕不會切過去', await page.$eval('#in-devtype', e => e.value) !== 'ee');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/aux_1280.png', fullPage: false });
    /* ⑨ 三語 */
    for (const [lang, re] of [['en', /Connection/], ['zh-CN', /连接方式/], ['zh-TW', /連線方式/]]) {
      await page.evaluate(l => applyLang(l), lang);
      await sleep(150);
      const lbl = await page.$eval('#xport-lbl', e => e.textContent);
      check(`三語：${lang} 標籤`, re.test(lbl), lbl);
    }
    /* ⑧ 切回治具 */
    await page.click(`#xport-seg [data-x="${'jig'}"]`);
    await waitFor(page, () => i2ctLinked === false);
    check('換連線方式 ⇒ 先中斷', await page.evaluate(() => i2ctLinked === false));
    check('切回治具 ⇒ EEPROM 鈕恢復', !(await page.$eval('#mode-seg [data-mode="ee"]', b => b.disabled)));
    await page.click('#btn-link');
    await waitFor(page, () => i2ctLinked === true);
    const op2 = await page.evaluate(() => window.__msgs.filter(m => m.t === 'open').pop());
    check('治具模式 open 不是 mode 4（回產品預設 0）', op2 && op2.mode === 0, JSON.stringify(op2));
    const ee = await page.evaluate(() => i2ctDoRead(0x50, 2, 0, 2, true));
    check('治具模式照常能讀 EEPROM（原本功能不受影響）', ee && ee.ok !== false, JSON.stringify(ee).slice(0, 100));
    const ci2 = await page.$eval('#conn-info', e => e.textContent);
    check('治具模式連線資訊回到 I2C 時脈', !/DP AUX/.test(ci2) && /kHz/.test(ci2), ci2);
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('B. 舊 I2C and AUX Bridge（proto 6）選 DP AUX');
  {
    const { ctx, page, errs } = await open({ proto: 6 });
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await sleep(800);
    check('舊 bridge 不連（不會送 mode 4）', await page.evaluate(() => i2ctLinked === false && !window.__msgs.some(m => m.t === 'open' && m.mode === 4)));
    const shown = await page.evaluate(() => { const g = document.getElementById('gethelper'); return !!g && g.style.display !== 'none'; });
    check('舊 bridge ⇒ 出現下載新版 I2C and AUX Bridge', shown);
    const log = await page.$eval('#log', e => e.textContent).catch(() => '');
    check('訊息講出要 1.18.0 以上', /1\.18\.0/.test(log), log.slice(-200));
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('C. Intel、不是系統管理員');
  {
    const { ctx, page, errs } = await open({ proto: 7, admin: false });
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const bn = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    check('提示用系統管理員執行', /以系統管理員身分執行/.test(bn), bn.slice(0, 120));
    check('連線資訊寫「不是系統管理員」', /不是系統管理員/.test(await page.$eval('#conn-info', e => e.textContent)));
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E. bridge 1.20.0（proto 9）：AMD、非系統管理員、T-CON init 失敗；IOA 讀 EEPROM 0x50、寫入仍擋；Flash 不下 M-Bus');
  {
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD', admin: false, tconInit: false });
    await page.evaluate(() => { try { TconMbus.setRom('flash'); } catch (e) {} });
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const bn = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    check('AMD＋T-CON init 失敗 ⇒ 橫幅講 T-CON 初始化沒成功＋系統管理員', /T-CON 初始化沒成功/.test(bn) && /AMD/.test(bn) && /系統管理員/.test(bn), bn.slice(0, 160));
    check('連上 1.20.0 ⇒ EEPROM 分段鈕開放', !(await page.$eval('#mode-seg [data-mode="ee"]', b => b.disabled)));
    check('連上 1.20.0 ⇒ slave 下拉 0x50 開放', !(await page.$eval('#in-slave-sel option[value="0x50"]', o => o.disabled)));
    await page.evaluate(() => i2ctCheckTconRun());
    const ident = await page.evaluate(() => i2ctCkResult ? i2ctCkResult.name : 'none');
    check('v1.39.0：Check T-CON（AUX）認成 EN01', /^EN01/.test(ident), ident);
    const bus0 = await page.evaluate(() => window.__msgs.filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)));
    /* i2c-mbus 1.2.2（a6a3d85）：ROM 類型不影響共用 M-Bus 導通；AUX 走同一份 session／TconDetect ⇒ 與 I2C 治具送出的序列相同 */
    const rd0 = bus0.filter(m => m.t === 'read');
    { const is7E = m => m.t === 'rawwrite' && m.s === 0x7E && m.a === 0xAB && JSON.stringify(m.d) === '[205]';
      check('v1.39.0：AUX Check T-CON 0 筆寫入、bridge 的 read 只有 3E', bus0.filter(m => m.t !== 'read').length === 0 && rd0.every(m => m.s === 0x3E) && !bus0.some(is7E), JSON.stringify(bus0.slice(0, 4))); }
    const rd = await page.evaluate(() => i2ctDoRead(0x50, 2, 0, 8, true));
    const rb = (rd && (rd.bytes || rd.data)) || [];
    check('IOA 讀 EEPROM 0x50（2-byte offset）拿到 EDID 開頭 00 FF FF FF FF FF FF 00', rd && rd.ok !== false && JSON.stringify(Array.from(rb).slice(0, 8)) === '[0,255,255,255,255,255,255,0]', JSON.stringify(rd).slice(0, 140));
    const n0 = await page.evaluate(() => window.__msgs.length);
    const e1 = await page.evaluate(() => i2ctDoWrite(0x50, 2, 0, [1]));
    check('🔴 寫 EEPROM 0x50 仍擋（訊息：只能讀）', e1 && e1.ok === false && /只能讀/.test(e1.err), JSON.stringify(e1));
    const e3 = await page.evaluate(() => i2ctWriteSegsRun(0x50, 2, [{ addr: 0, data: [1, 2] }], 'test').catch(e => ({ ok: false, err: String(e.message) })));
    check('🔴 整批寫入 EEPROM 在 WP 拉低之前就擋', e3 && e3.ok === false, JSON.stringify(e3).slice(0, 120));
    const after = await page.evaluate((n) => window.__msgs.slice(n).filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)), n0);
    check('🔴 寫入那幾筆一則都沒送（含 7C WP）', after.length === 0, JSON.stringify(after).slice(0, 200));
    const eeW = await page.evaluate(() => window.__ee.filter(t => t !== 'read').length);
    check('🔴 bridge 沒收到任何 EEPROM 寫入', eeW === 0, String(eeW));
    await page.click('#mode-seg [data-mode="ee"]'); await sleep(200);
    check('EEPROM 模式下寫入鈕停用（AUX 只能讀）', await page.$eval('#btn-write', b => b.disabled));
    const tip = await page.$eval('#mode-seg [data-mode="ee"]', b => b.title);
    check('EEPROM 鈕提示「只能讀」', /只能讀/.test(tip), tip);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/aux_ioa_1280.png', fullPage: false });
    /* v1.39.4：照使用者在頁面上的實際操作 —— EEPROM 模式選 24C32、總 byte 4096、按「讀取」（不直接呼叫 i2ctDoRead） */
    { const v = await page.$$eval('#in-eemodel option', os => (os.find(o => /24C32/.test(o.textContent)) || {}).value);
      if (v) await page.selectOption('#in-eemodel', v);
      await sleep(150);
      await page.evaluate(() => { const e = document.getElementById('in-len'); e.value = '4096'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      const m0 = await page.evaluate(() => window.__msgs.length);
      await page.click('#btn-read');
      await waitFor(page, () => !i2ctBusy && i2ctLastRead, null, 20000);
      const lr = await page.evaluate(() => i2ctLastRead);
      const rds = await page.evaluate((n) => window.__msgs.slice(n).filter(m => m.t === 'read'), m0);
      const bnr = await page.$eval('#readbanner', e => e.textContent).catch(() => '');
      check('v1.39.4：AUX 按「讀取」EEPROM 4096 byte ⇒ 分 16 則、每則 ≤256', rds.length === 16 && rds.every(m => m.n <= 256 && m.s >= 0x50 && m.s <= 0x57), JSON.stringify(rds.slice(0, 3)));
      check('v1.39.4：4096 byte 全部讀到、沒有逾時', lr && lr.got === 4096 && !/逾時/.test(bnr), JSON.stringify(lr).slice(0, 120) + ' | ' + bnr.slice(0, 80));
      check('v1.39.4：沒有送出 >256 byte 的 AUX EEPROM 讀取', !(await page.evaluate(() => window.__eeBig)), '');
      const lg = await page.$eval('#log', e => e.textContent).catch(() => '');
      check('v1.39.4：log 寫出 AUX 分段原因', /AUX 每 8 byte 一段讀/.test(lg), ''); }
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E4. DP AUX：E503 板（7C:95＝24、3E:207E＝00、DPCD 43C＝E5 03）⇒「E503」，不分版本、0 筆 IOA');
  {
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD', admin: false, n43c: [0xE5, 0x03], edp: 0x05 });
    await page.evaluate(() => { window.__mem['124:149'] = 0x24; window.__mem['62:8318'] = 0x00; });
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const n0 = await page.evaluate(() => window.__msgs.length);
    await page.evaluate(() => i2ctCheckTconRun());
    const r = await page.evaluate(() => i2ctCkResult && { name: i2ctCkResult.name, family: i2ctCkResult.family, unknown: !!i2ctCkResult.unknown, alts: i2ctCkResult.alts });
    { const ci0 = await page.$eval('#conn-info', e => e.textContent);
      check('v1.41.0：AUX 連上 ⇒ GPU AMD · 螢幕 內建（eDP 1.4b）', /GPU AMD/.test(ci0) && /螢幕 內建（eDP 1\.4b）/.test(ci0), ci0);
      const seg = await page.$$eval('#xport-seg .xseg-b', bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|'));
      check('v1.41.0：連線方式是 I2C｜AUX 分段鈕，AUX 亮', seg === 'I2C|AUX*', seg);
      check('v1.41.0：AUX ⇒ ① 叫「連接 AUX」', /① 連接 AUX/.test(await page.$eval('#stp-t-link', e => e.textContent)));
      check('v1.41.0：AUX ⇒ 狀態「已連線（AUX）」、沒有「本頁持有」', await page.$eval('#linktext', e => e.textContent === '已連線（AUX）'));
      check('v1.41.0：AUX ⇒ EEPROM 鈕標「（I2C over AUX）」', /EEPROM（I2C over AUX）/.test(await page.$eval('#mode-seg [data-mode="ee"]', b => b.textContent)));
      await page.click('#xport-seg [data-x="jig"]'); await sleep(200);
      { const nm = await page.$eval('#tcon-name', e => e.textContent); const ci1 = await page.$eval('#conn-info', e => e.textContent);
        check('v1.41.0：換連線方式（AUX 停放）⇒ ② 型號同步清空、① 不再寫 T-CON', nm === '—' && !/T-CON：/.test(ci1), nm + ' | ' + ci1); }
      check('v1.41.0：切回 I2C ⇒ ① 叫「連接 I2C 治具」、EEPROM 鈕只寫 EEPROM', /① 連接 I2C 治具/.test(await page.$eval('#stp-t-link', e => e.textContent)) && (await page.$eval('#mode-seg [data-mode="ee"]', b => b.textContent)) === 'EEPROM');
      await page.click('#xport-seg [data-x="aux"]'); await waitFor(page, () => i2ctLinked === true); await sleep(200); }
    check('E503 板 ⇒「E503」（不分 A1／A2／A3、不給版本下拉）', r && r.name === 'E503' && r.family === 'E503' && !r.unknown && !r.alts, JSON.stringify(r));
    const after = await page.evaluate((n) => window.__msgs.slice(n), n0);
    check('E503 板：0 筆寫入、沒有 7D／7E、bridge 的 read 只有 3E', !after.some(m => ['rawwrite', 'write', 'batchwrite'].includes(m.t)) && after.filter(m => m.t === 'read').every(m => m.s === 0x3E), JSON.stringify(after.slice(0, 8)));
    check('E503 板：讀了 DPCD 43C', after.some(m => m.t === 'dpcdread' && m.a === 0x43C));
    /* v1.39.1：一般暫存器頁讀 7C（DPCD 431→434，只讀）；7C 寫、7D、7E 擋 */
    const m0 = await page.evaluate(() => window.__msgs.length);
    const g95 = await page.evaluate(() => i2ctDoRead(0x7C, 1, 0x95, 1, false));
    const g98 = await page.evaluate(() => i2ctDoRead(0x7C, 1, 0x98, 1, false));
    check('v1.39.1：AUX 讀 7C:95＝24、7C:98＝00', g95.ok && g95.bytes[0] === 0x24 && g98.ok && g98.bytes[0] === 0x00, JSON.stringify([g95.bytes, g98.bytes]));
    const m1 = await page.evaluate((n) => window.__msgs.slice(n), m0);
    check('v1.39.1：讀 7C 只送 dpcdwrite 0x431＋dpcdread 0x434，沒有 bridge read／rawwrite', m1.length === 4 && m1.every(m => (m.t === 'dpcdwrite' && m.a === 0x431) || (m.t === 'dpcdread' && m.a === 0x434)), JSON.stringify(m1));
    const w7 = await page.evaluate(() => i2ctDoWrite(0x7C, 1, 0x0F, [0x80]));
    check('v1.39.3：AUX 寫 7C 放行（交給 bridge 照原廠流程）', w7 && w7.ok !== false, JSON.stringify(w7).slice(0, 160));
    const r7d = await page.evaluate(() => i2ctDoRead(0x7D, 2, 0x007D, 1, true).then(r => r, e => ({ ok: false, err: String(e.message) })));
    check('v1.39.1：AUX 讀 7D 擋下（原因：要經 M-Bus）', r7d && r7d.ok === false && /M-Bus/.test(r7d.err || ''), JSON.stringify(r7d).slice(0, 160));
    const w7e = await page.evaluate(() => i2ctDoWrite(0x7E, 1, 0xAB, [0xCD]));
    check('v1.39.1：AUX 寫 7E 擋下', w7e && w7e.ok === false && /M-Bus/.test(w7e.err || ''), JSON.stringify(w7e).slice(0, 160));
    const m2 = await page.evaluate((n) => window.__msgs.slice(n), m0);
    check('v1.39.3：7C 寫入送 1 筆 rawwrite 7C:0F（awid 1）；7D、7E 一筆都沒送出', m2.length === 5 && m2[4].t === 'rawwrite' && m2[4].s === 0x7C && m2[4].a === 0x0F && m2[4].aw === 1 && !m2.some(m => m.s === 0x7D || m.s === 0x7E), JSON.stringify(m2));
    const opt = await page.evaluate(() => ({ c: document.querySelector('#in-slave-sel option[value="0x7C"]').disabled, d: document.querySelector('#in-slave-sel option[value="0x7D"]').disabled }));
    check('v1.39.1：slave 下拉 0x7C 可選、0x7D 停用', !opt.c && opt.d, JSON.stringify(opt));
    await page.selectOption('#in-slave-sel', '0x7C'); await sleep(200);
    const aw7 = await page.$eval('#in-awid', e => e.value);
    const g7 = await page.evaluate(() => i2ctDoRead(0x7C, parseInt(document.getElementById('in-awid').value, 10), 0x95, 1, true));
    await page.selectOption('#in-slave-sel', '0x3E'); await sleep(200);
    const aw3 = await page.$eval('#in-awid', e => e.value);
    check('v1.39.2：AUX 選 0x7C ⇒ offset 1 byte（直接讀得到 7C:95）；選 0x3E ⇒ 2 byte', aw7 === '1' && aw3 === '2' && g7.ok && g7.bytes[0] === 0x24, aw7 + '/' + aw3 + ' ' + JSON.stringify(g7.bytes));
    const ci = await page.$eval('#conn-info', e => e.textContent);
    check('v1.39.3：連線資訊註明 AUX 範圍（7C 讀寫、7D／7E 不開放）', /3E、7C 讀寫（AUX）/.test(ci) && /EEPROM 唯讀（I2C over AUX）/.test(ci) && /7D、7E 不開放/.test(ci), ci.slice(0, 200));
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  /* v1.40.0：照 Bruce 的操作 —— 先選「外部 Flash」→ 接 E503 → 按「自動判斷」／「重新判斷」⇒ 警示並擋下；之後「外部 Flash」停用。I2C、AUX 兩種都驗。 */
  for (const xp of ['i2c', 'aux']) {
    console.log(`F. ${xp === 'aux' ? 'AUX' : 'I2C'}：外部 Flash × E503 ⇒ 警示、擋 Flash 操作、選項停用`);
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD', admin: false, n43c: [0xE5, 0x03] });
    await page.evaluate(() => { Object.assign(window.__mem, { '124:149': 0x24, '124:152': 0x00, '125:125': 0x04, '62:8318': 0x00 }); });
    if (xp === 'aux') await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    await page.click('#mode-seg [data-mode="sf"]'); await sleep(200);
    check(`${xp}：還沒辨認時可以選外部 Flash（照原本行為）`, await page.$eval('#in-devtype', e => e.value) === 'sf');
    await page.click('#sf-auto'); await waitFor(page, () => !!i2ctCkResult && !i2ctBusy);
    await sleep(200);
    const nm = await page.evaluate(() => i2ctCkResult && i2ctCkResult.name);
    const tb = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    const ck = await page.$eval('#sf-cknote', e => ({ t: e.textContent, bad: e.classList.contains('bad') }));
    check(`${xp}：自動判斷認出 E503`, /^E503/.test(nm || ''), String(nm));
    check(`${xp}：自動判斷後跳警示「E503 不支援 Flash」`, /E503[A-Z0-9]* 不支援 Flash/.test(tb) && ck.bad && /只支援 EEPROM/.test(ck.t), tb.slice(0, 80) + ' | ' + ck.t);
    const dis = await page.evaluate(() => ['sf-model', 'sf-detect', 'sf-read', 'sf-write'].map(id => document.getElementById(id).disabled));
    check(`${xp}：Flash 操作全部停用（型號、讀 ID、讀出、寫入）`, dis.every(Boolean), JSON.stringify(dis));
    const n0 = await page.evaluate(() => window.__msgs.length);
    await page.evaluate(() => i2ctSfDetect());
    const sent = await page.evaluate((n) => window.__msgs.slice(n).filter(m => ['read', 'rawwrite', 'write', 'batchwrite', 'dpcdwrite'].includes(m.t)), n0);
    check(`${xp}：強制呼叫讀 Flash ID 也被擋（0 則送出）`, sent.length === 0, JSON.stringify(sent).slice(0, 160));
    await page.evaluate(() => { document.getElementById('topbanner').innerHTML = ''; });
    await page.click('#sf-recheck'); await waitFor(page, () => !i2ctBusy); await sleep(300);
    check(`${xp}：重新判斷也觸發警示`, /E503[A-Z0-9]* 不支援 Flash/.test(await page.$eval('#topbanner', e => e.textContent)));
    await page.click('#mode-seg [data-mode="gen"]'); await sleep(200);
    const sfb = await page.$eval('#mode-seg [data-mode="sf"]', b => ({ d: b.disabled, t: b.title }));
    const note = await page.$eval('#stp-mode-note', e => e.textContent);
    check(`${xp}：離開後「外部 Flash」停用並寫原因`, sfb.d && /E503[A-Z0-9]* 不支援 Flash/.test(sfb.t) && /E503[A-Z0-9]* 不支援 Flash/.test(note), JSON.stringify(sfb) + ' | ' + note);
    await page.click('#mode-seg [data-mode="sf"]', { force: true }).catch(() => {}); await sleep(150);
    check(`${xp}：按停用的外部 Flash 不會切過去`, await page.$eval('#in-devtype', e => e.value) !== 'sf');
    check(`${xp}：EEPROM 照常可選`, !(await page.$eval('#mode-seg [data-mode="ee"]', b => b.disabled)));
    if (SHOTS) await page.screenshot({ path: SHOTS + `/sf_e503_${xp}.png`, fullPage: false });
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E3. DP AUX：3E／7C 讀不到 ⇒ 認不出（不錯判 E503）、序列同 I2C、log 有 bridge 的錯誤；IOA 讀 EEPROM 照常');
  {
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD', admin: false, tconInit: false, auxRegFail: true });
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const n0 = await page.evaluate(() => window.__msgs.length);
    await page.evaluate(() => i2ctCheckTconRun());
    const r = await page.evaluate(() => i2ctCkResult && { name: i2ctCkResult.name, isE503: i2ctCkResult.isE503, unknown: !!i2ctCkResult.unknown, family: i2ctCkResult.family || null });
    check('v1.39.0：DPCD 讀不到 ⇒ 認不出＝手動選擇、不是 E503', r && r.unknown && /手動選擇/.test(r.name) && !r.isE503 && r.family !== 'E503', JSON.stringify(r));
    const after = await page.evaluate((n) => window.__msgs.slice(n).filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)), n0);
    { const is7E = m => m.t === 'rawwrite' && m.s === 0x7E && m.a === 0xAB && JSON.stringify(m.d) === '[205]';
      check('v1.39.0：讀不到也不寫：0 筆寫入、bridge 的 read 只有 3E', after.filter(m => m.t !== 'read').length === 0 && after.every(m => m.s === 0x3E) && !after.some(is7E), JSON.stringify(after)); }
    const lg = await page.$eval('#log', e => e.textContent);
    const bn3 = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    check('認不出 ⇒ 橫幅請手動選擇 TCON（三語文案）', /手動選擇/.test(bn3) && /AUX 認不出/.test(bn3), bn3.slice(0, 160));
    const r3 = await page.evaluate(() => i2ctDoRead(0x7C, 1, 0x95, 1, true).then(r => r, e => ({ ok: false, err: String(e.message) })));
    check('v1.39.1：AUX 讀 7C 走 DPCD；DPCD 失敗 ⇒ 回錯誤、不改走 bridge read', r3 && r3.ok === false && /DPCD/.test(r3.err || '') && !(await page.evaluate(() => window.__msgs.some(m => m.t === 'read' && m.s === 0x7C))), JSON.stringify(r3).slice(0, 160));
    const rd = await page.evaluate(() => i2ctDoRead(0x50, 1, 0, 8, true));
    check('IOA 讀 EEPROM 0x50 照常', rd && rd.ok !== false && (rd.bytes || rd.data).length === 8, JSON.stringify(rd).slice(0, 100));
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E2. 375 寬：proto 9 EEPROM 分段鈕可按、不破版');
  {
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD' }, 375);
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    await page.click('#mode-seg [data-mode="ee"]'); await sleep(200);
    check('375：切到 EEPROM 模式', await page.$eval('#in-devtype', e => e.value) === 'ee');
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('375：沒有水平捲動', ov <= 1, 'overflow ' + ov);
    const cov = await page.evaluate(() => { const b = document.getElementById('btn-read'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === b || b.contains(el) ? '' : (el && el.className); });
    check('375：讀取鈕沒有被步驟列或其他東西蓋住', cov === '', cov);
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('D. 375 寬');
  {
    const { ctx, page, errs } = await open({ proto: 7 }, 375);
    await page.click(`#xport-seg [data-x="${'aux'}"]`);
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('375 寬沒有水平捲動', ov <= 1, 'overflow ' + ov);
    const r = await page.$eval('#xport-seg', e => { const b = e.getBoundingClientRect(); return b.right <= window.innerWidth && b.width > 40; });
    check('連線方式下拉在畫面內', r);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/aux_375.png', fullPage: false });
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
} catch (e) { check('執行', false, String(e && e.stack || e).slice(0, 400)); }
await browser.close(); srv.close();
console.log(`\n${fail ? '✗' : '✓'} check_i2c_aux（${REPO}）：${pass} pass / ${fail} fail`);
if (fail) { console.log('失敗：\n  - ' + fails.join('\n  - ')); process.exit(1); }
