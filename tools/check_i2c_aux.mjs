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
  /* 2026-10-24：這支專測舊 bridge（proto 6／7／9）時頁面怎麼退；產品上它們現在會被版本過舊彈窗擋住（common/i2c-bridge.js gate，另由 check_bridge_version_gate 驗），這裡關掉 gate 照舊驗退路 */
  window.__I2CB_TEST_NO_GATE__ = true;
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
      if (m.type === 'auxlist') {
        Object.assign(r, { ok: true, displays: (opt.displays || []).map(d => Object.assign({}, d, { tcon43c: m.tcon ? (d.tcon43c || [0, 0]) : null })), windows: opt.windows || [] });
        return reply(ws, r); }
      if (m.type === 'i2craw' || m.type === 'ioaread') {
        if (m.type === 'i2craw' && m.dir === 'r' && /AMD/.test(opt.card || '')) Object.assign(r, { ok: false, amd: true, err: 'AMD stub' });
        else if (m.type === 'i2craw' && m.dir === 'w') Object.assign(r, { ok: true });
        else { r.data = []; for (let i = 0; i < (m.len || 1); i++) r.data.push(0x5A); }
        return reply(ws, r); }
      if (m.type === 'open') {
        aux = (m.mode === 4);
        window.__rawOpen = m.raw ? { card: m.card, monitor: m.monitor } : null;
        if (aux) Object.assign(r, { channels: 1, aux: true, card: opt.card || 'INTEL', monitor: m.raw ? m.monitor : 2, projic: 1, admin: opt.admin !== false, psrSupported: true, psrOn: false, psrTurnedOff: true, tconInit: opt.tconInit !== false, raw: !!m.raw },
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
    check('v1.41.1：不顯示螢幕內建／外接（沒有可靠依據）、不顯示 PSR', !/螢幕|內建|外接/.test(ci) && !/PSR/.test(ci), ci);
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
      check('v1.41.1：AUX 連上 ⇒ GPU AMD；eDP 0x700＝05 也不顯示內建（不讀 0x700）', /GPU AMD/.test(ci0) && !/螢幕|內建/.test(ci0), ci0);
      check('v1.41.1：不送 DPCD 0x700', !(await page.evaluate(() => (window.__dpcd || []).some(d => d.a === 0x700))));
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
  /* v1.42.0：DPCD／IOA 工具（照 AUX_GUI 1.48.0 DPCD 分頁）—— 照使用者操作：切 AUX → 分頁「DPCD／IOA 工具」→ 列出螢幕 → 選 → 連線（不初始化）→ 加入／執行 */
  console.log('G. DPCD／IOA 工具');
  {
    const displays = [
      { card: 1, cardName: 'AMD', monitor: 0, dpcdRev: 0x14, oui: '00001C', devId: 'eDP', edid: { mfg: 'BOE', prod: '09E5', name: 'NE160' }, win: { gdi: '\\\\.\\DISPLAY1', name: '', tech: 'DISPLAYPORT_EMBEDDED', techId: 11 } },
      { card: 1, cardName: 'AMD', monitor: 1, dpcdRev: 0x12, oui: '000000', devId: '', edid: { mfg: 'BOE', prod: '0B21', name: '' }, win: { gdi: '\\\\.\\DISPLAY2', name: 'E503 board', tech: 'DISPLAYPORT_EXTERNAL', techId: 10 }, tcon43c: [0xE5, 0x03] }
    ];
    const { ctx, page, errs } = await open({ proto: 10, card: 'AMD', admin: false, displays, windows: [{ gdi: '\\\\.\\DISPLAY1', tech: 'DISPLAYPORT_EMBEDDED', techId: 11 }, { gdi: '\\\\.\\DISPLAY2', tech: 'DISPLAYPORT_EXTERNAL', techId: 10 }] });
    check('I2C 模式沒有 DPCD 分頁', await page.$eval('#aux-tabs', e => e.style.display === 'none'));
    await page.click('#xport-seg [data-x="aux"]'); await sleep(150);
    check('AUX 模式出現「讀寫流程｜DPCD／IOA 工具」', await page.$eval('#aux-tabs', e => e.style.display !== 'none' && /讀寫流程/.test(e.textContent) && /DPCD／IOA 工具/.test(e.textContent)));
    await page.click('#aux-tabs [data-tab="tool"]'); await sleep(150);
    check('切到工具 ⇒ 讀寫流程的步驟藏起來、工具出現', await page.evaluate(() => document.getElementById('card-conn').style.display === 'none' && document.getElementById('dpcd-panel').style.display !== 'none'));
    const m0 = await page.evaluate(() => window.__msgs.length);
    await page.click('#dp-list'); await waitFor(page, () => document.querySelectorAll('input[name="dp-sel"]').length === 2);
    const sel = await page.evaluate(() => { const r = document.querySelector('input[name="dp-sel"]:checked'); return r ? r.value : null; });
    check('列出 2 台；沒 Check 時不替使用者選（不猜內建／外接）', sel === null, String(sel));
    const tx = await page.$eval('#dpcd-panel', e => e.textContent);
    check('清單只列事實：\\\\.\\DISPLAYn、EDID、Windows 回報接口原話（DisplayPort／內嵌 DisplayPort（eDP））', /\\\\\.\\DISPLAY2/.test(tx) && /BOE 09E5/.test(tx) && /E503 board/.test(tx) && /Windows 回報接口/.test(tx) && /內嵌 DisplayPort（eDP）/.test(tx) && /DISPLAYPORT_EXTERNAL/.test(tx), tx.slice(0, 300));
    check('沒有「內建／外接」結論字樣', !/內建|外接|電腦本身/.test(tx));
    const sent0 = await page.evaluate((n) => window.__msgs.slice(n).map(m => m.t), m0);
    check('列出螢幕：只送 auxlist（沒有 open／寫入）', sent0.length === 1 && sent0[0] === 'auxlist', JSON.stringify(sent0));
    await page.evaluate(() => { window.__cf = []; window.__cfAns = true; window.confirm = (m) => { window.__cf.push(m); return window.__cfAns; }; });
    await page.click('input[name="dp-sel"][value="0"]'); await sleep(150);
    check('手動選 monitor 0：直接選得到、不跳確認、不加結論', await page.evaluate(() => document.querySelector('input[name="dp-sel"]:checked').value === '0' && window.__cf.length === 0 && !/電腦本身/.test(document.getElementById('dpcd-panel').textContent)));
    await page.click('#dp-check'); await waitFor(page, () => /RAD TCON 有回應：/.test(document.getElementById('dp-msg').textContent));
    check('Check RAD TCON：0x43C＝E5 03 那台自動選、標「RAD TCON 有回應（E503）」', await page.evaluate(() => document.querySelector('input[name="dp-sel"]:checked').value === '1' && /RAD TCON 有回應（E503）/.test(document.getElementById('dpcd-panel').textContent)));
    await page.click('#dp-conn'); await waitFor(page, () => i2ctAuxIsRaw());
    const ro = await page.evaluate(() => window.__rawOpen);
    check('連線（不初始化）⇒ open 帶 raw:1、card 1、monitor 1', ro && ro.card === 1 && ro.monitor === 1, JSON.stringify(ro));
    check('raw 連線狀態寫出目標螢幕', /已連線（AUX · AMD · 螢幕 1/.test(await page.$eval('#dp-state', e => e.textContent)));
    /* 加入一筆 DPCD read 0x00000 ×1 */
    await page.selectOption('#dp-op', 'dr'); await page.fill('#dp-addr', '00000'); await page.selectOption('#dp-n', '1'); await page.click('#dp-add');
    check('＋加入 ⇒ script「90 00 00 00」', /^90 00 00 00\n$/.test(await page.$eval('#dp-script', e => e.value)));
    await page.fill('#dp-script', '// test\n90 00 00 00\n40 00 50 00 00\n10 00 50 07\nSleep 1 ms\n');
    const m1 = await page.evaluate(() => window.__msgs.length);
    await page.evaluate(() => { window.__cf = []; window.__cfAns = true; });
    await page.click('#dp-run'); await waitFor(page, () => /完成/.test(document.getElementById('dp-msg').textContent), null, 8000);
    const sent1 = await page.evaluate((n) => window.__msgs.slice(n).map(m => m.t), m1);
    const dlg = await page.evaluate(() => window.__cf[0] || null);
    check('有寫入（IOA write）⇒ 先確認，確認框只列事實：螢幕、\\\\.\\DISPLAY2、EDID、Windows 回報接口、我家 TCON 回應', dlg && /AMD · 螢幕 1/.test(dlg) && /DISPLAY2/.test(dlg) && /EDID BOE 0B21/.test(dlg) && /Windows 回報接口：DisplayPort/.test(dlg) && /RAD TCON 有回應（E503）/.test(dlg) && !/內建|外接/.test(dlg) && /40 00 50 00 00/.test(dlg), dlg);
    check('AMD：IOA 寫 offset＋讀 合併成一次 ioaread（照 AUX_GUI ScriptAmdRun）', JSON.stringify(sent1) === JSON.stringify(['dpcdread', 'ioaread']), JSON.stringify(sent1));
    const lg = await page.$eval('#dp-log', e => e.textContent);
    check('log：SYS DPCD RD、I2C over AUX、ACK', /SYS DPCD RD 1 bytes from \[0x00000\]/.test(lg) && /I2C over AUX/.test(lg) && /ACK \+ 0x/.test(lg), lg.slice(0, 200));
    check('讀寫流程的 T-CON 操作在 raw 連線下停用', await page.evaluate(() => document.getElementById('btn-checktcon').disabled && document.getElementById('btn-read').disabled));
    await page.fill('#dp-script', '80 00 01 00 0A\n');
    await page.evaluate(() => { window.__cfAns = false; });
    const m2 = await page.evaluate(() => window.__msgs.length);
    await page.click('#dp-run'); await sleep(300);
    check('寫入確認按取消 ⇒ 一筆都沒送', (await page.evaluate((n) => window.__msgs.length - n, m2)) === 0);
    await page.fill('#dp-script', '90 00 00\n');
    await page.click('#dp-run'); await sleep(150);
    check('格式錯 ⇒ 指出第幾筆、不送', /第 1 筆 Script 格式不正確/.test(await page.$eval('#dp-msg', e => e.textContent)));
    const pl = await page.evaluate(() => [AuxDpcd.parseLine('90 07 00 0F').n, AuxDpcd.parseLine('80 04 D2 00 AD').data[0], AuxDpcd.parseLine('81 00 00 01 AA'), AuxDpcd.makeLine('iwm', 0x50, 2, [0, 0])]);
    check('script 規則：長度＝碼值＋1、寫入資料數要等於長度、ADD 格式', pl[0] === 16 && pl[1] === 0xAD && pl[2] === null && pl[3] === '40 00 50 01 00 00', JSON.stringify(pl));
    await page.click('#aux-tabs [data-tab="flow"]'); await sleep(150);
    check('回讀寫流程 ⇒ 步驟回來、連線資訊說明是工具的連線', await page.evaluate(() => document.getElementById('card-conn').style.display !== 'none' && /DPCD／IOA 工具的連線/.test(document.getElementById('conn-info').textContent)));
    await page.click('#xport-seg [data-x="jig"]'); await sleep(150);
    check('切回 I2C ⇒ 分頁切換消失', await page.$eval('#aux-tabs', e => e.style.display === 'none'));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/dpcd_tool.png', fullPage: true });
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E2b. DPCD／IOA 工具（Bruce 2026-10-24）：沒連線前「依序執行」按不下去；連上才能執行、斷線又停用；第一步完成綠框；log 的 DPCD 位址連到 aux.html 說明');
  {
    const displays = [
      { card: 1, cardName: 'AMD', monitor: 0, dpcdRev: 0x14, oui: '00001C', devId: 'eDP', edid: { mfg: 'BOE', prod: '09E5', name: 'NE160' }, win: { gdi: '\\\\.\\DISPLAY1', name: '', tech: 'DISPLAYPORT_EMBEDDED', techId: 11 } },
      { card: 1, cardName: 'AMD', monitor: 1, dpcdRev: 0x12, oui: '000000', devId: '', edid: { mfg: 'BOE', prod: '0B21', name: '' }, win: { gdi: '\\\\.\\DISPLAY2', name: 'E503 board', tech: 'DISPLAYPORT_EXTERNAL', techId: 10 }, tcon43c: [0xE5, 0x03] }
    ];
    const { ctx, page, errs } = await open({ proto: 10, card: 'AMD', admin: false, displays, windows: [] });
    await page.click('#xport-seg [data-x="aux"]'); await sleep(150);
    await page.click('#aux-tabs [data-tab="tool"]'); await sleep(150);
    const st = () => page.evaluate(() => ({ run: document.getElementById('dp-run').disabled, need: (document.getElementById('dp-need') || {}).textContent || '', done: document.getElementById('dp-stp1').classList.contains('done') }));
    let s = await st();
    check('一開始（還沒列出螢幕）：依序執行停用、旁邊寫「請先在第一步選螢幕並連線」、第一步沒綠框', s.run && /請先在第一步選螢幕並連線/.test(s.need) && !s.done, JSON.stringify(s));
    await page.fill('#dp-script', '90 01 00 01\n80 01 00 00 0A\n10 00 50 07\n');
    const m0 = await page.evaluate(() => window.__msgs.length);
    let clicked = true; try { await page.click('#dp-run', { timeout: 800 }); } catch (e) { clicked = false; }
    check('沒連線時按「依序執行」按不下去、一筆都沒送', !clicked && (await page.evaluate((n) => window.__msgs.length - n, m0)) === 0);
    await page.click('#dp-list'); await waitFor(page, () => document.querySelectorAll('input[name="dp-sel"]').length === 2);
    await page.click('#dpcd-panel tr[data-i="1"] td:nth-child(3)'); await sleep(150);
    const selRow = await page.evaluate(() => ({ sel: AuxDpcd.state().sel, cls: document.querySelector('#dpcd-panel tr[data-i="1"]').className, tag: document.querySelector('#dpcd-panel tr[data-i="1"]').textContent }));
    check('點清單整列（不必點圓鈕）就選到那台：S.sel＝1、那列細框＋「已選」', selRow.sel === 1 && /dp-selrow/.test(selRow.cls) && /已選/.test(selRow.tag), JSON.stringify(selRow).slice(0, 200));
    await page.click('#dpcd-panel tr[data-i="0"] td:nth-child(3)'); await sleep(100);
    await page.click('#dpcd-panel tr[data-i="1"] td:nth-child(2)'); await sleep(100);
    check('改點別列再點回來：框跟著移動、只有一列有框', await page.evaluate(() => document.querySelectorAll('#dpcd-panel tr.dp-selrow').length === 1 && document.querySelector('#dpcd-panel tr[data-i="1"]').classList.contains('dp-selrow')));
    s = await st();
    check('選了螢幕但還沒按「連線（不初始化）」：依序執行仍停用＋提示', s.run && /請先在第一步選螢幕並連線/.test(s.need) && !s.done, JSON.stringify(s));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/dpcd_gate_before.png', fullPage: false });
    await page.click('#dp-conn'); await waitFor(page, () => i2ctAuxIsRaw()); await sleep(200);
    s = await st();
    const lk = await page.evaluate(() => { const rows = [...document.querySelectorAll('#dpcd-panel tr[data-i]')]; const on = rows.filter(r => r.classList.contains('dp-linked')); const st = document.getElementById('dp-state').textContent; return { n: on.length, i: on[0] && on[0].getAttribute('data-i'), txt: on[0] && on[0].textContent, st, raw: window.__rawOpen, init: !!document.getElementById('dp-init') }; });
    check('連線後：選的那一列醒目綠框＋「已連線」；只有一列；與「中斷」旁名稱、實際 open 的 card/monitor 同一台', lk.n === 1 && lk.i === '1' && /已連線/.test(lk.txt) && /螢幕 1/.test(lk.st) && lk.raw && lk.raw.card === 1 && lk.raw.monitor === 1, JSON.stringify(lk).slice(0, 300));
    check('沒按過 Check RAD TCON ⇒ 不標「已初始化」', !lk.init);
    check('按「連線（不初始化）」連上 ⇒ 依序執行可按、提示消失、第一步綠框（.stp.done，與主流程同一個 class）', !s.run && !s.need && s.done, JSON.stringify(s));
    const bc = await page.$eval('#dp-stp1', e => getComputedStyle(e).borderTopColor);
    const bcMain = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'card stp done'; document.body.appendChild(d); const c = getComputedStyle(d).borderTopColor; d.remove(); return c; });
    check('第一步外框顏色＝主流程 .stp.done 的綠框', bc === bcMain, bc + ' vs ' + bcMain);
    await page.evaluate(() => { window.__cf = []; window.confirm = (m) => { window.__cf.push(m); return true; }; });
    await page.click('#dp-run'); await waitFor(page, () => /完成/.test(document.getElementById('dp-msg').textContent), null, 8000);
    const sent = await page.evaluate((n) => window.__msgs.slice(n).map(m => m.t), m0);
    check('連線後能執行（DPCD 讀、DPCD 寫、IOA 讀都送出）', sent.filter(t => t === 'dpcdread').length >= 1 && sent.filter(t => t === 'dpcdwrite').length >= 1 && sent.includes('ioaread'), JSON.stringify(sent));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/dpcd_gate_after.png', fullPage: false });
    /* log 的 DPCD 超連結 */
    const links = await page.$$eval('#dp-log a.dp-dlink', as => as.map(a => ({ t: a.textContent, h: a.getAttribute('href'), tg: a.target })));
    const want = (a, v) => links.some(l => l.h === '/aux.html?auxTab=dpcd&dpcd=' + a + (v ? '&val=' + v : '') && l.tg === '_blank');
    check('DPCD 讀 req 行連到 aux.html?auxTab=dpcd&dpcd=00100', want('00100', ''), JSON.stringify(links));
    check('讀回 2 byte 各自連「位址=值」（00100=00、00101=00，LA 的 byte list 寫法）', want('00100', '00') && want('00101', '00') && links.some(l => l.t === '0x00100=0x00'), JSON.stringify(links));
    check('DPCD 寫入連「00100=0A」', want('00100', '0A'), JSON.stringify(links));
    check('IOA（I2C over AUX）行沒有亂連（aux.html 沒有 I2C slave 說明頁）', !links.some(l => /dpcd=00050/.test(l.h)), JSON.stringify(links));
    check('網址與 LA（wfg.html）同一支產生：DpcdLink.url', await page.evaluate(() => DpcdLink.url(0x100, '0a') === '/aux.html?auxTab=dpcd&dpcd=00100&val=0A'));
    /* 實際點：開新分頁、跳到 aux.html 該暫存器 */
    const [np] = await Promise.all([ctx.waitForEvent('page'), page.click('#dp-log a.dp-dlink[href*="dpcd=00100&val=0A"]')]);
    await np.waitForLoadState('load'); await sleep(1500);
    const auxRes = await np.evaluate(() => ({ url: location.pathname + location.search, tab: (document.querySelector('.aux-tab.active') || {}).getAttribute ? document.querySelector('.aux-tab.active').getAttribute('data-tab') : '', res: ((document.getElementById('aux-dpcd-result') || {}).innerText || '').slice(0, 400) }));
    check('點「0x00100=0x0A」⇒ aux.html 切到 DPCD、顯示 0x00100（LINK_BW_SET）的說明', auxRes.tab === 'dpcd' && /00100/.test(auxRes.res) && /LINK_BW_SET/i.test(auxRes.res), JSON.stringify(auxRes).slice(0, 300));
    if (SHOTS) await np.screenshot({ path: SHOTS + '/dpcd_link_aux_00100.png', fullPage: false });
    await np.close();
    const [np2] = await Promise.all([ctx.waitForEvent('page'), page.click('#dp-log a.dp-dlink[href*="dpcd=00101&val=00"]')]);
    await np2.waitForLoadState('load'); await sleep(1500);
    const r2 = await np2.evaluate(() => ((document.getElementById('aux-dpcd-result') || {}).innerText || '').slice(0, 300));
    check('點「0x00101=0x00」⇒ 顯示 0x00101（LANE_COUNT_SET）的說明', /00101/.test(r2) && /LANE_COUNT_SET/i.test(r2), r2.slice(0, 200));
    if (SHOTS) await np2.screenshot({ path: SHOTS + '/dpcd_link_aux_00101.png', fullPage: false });
    await np2.close();
    /* 斷線 ⇒ 又停用 */
    await page.click('#dp-conn'); await waitFor(page, () => !i2ctAuxIsRaw()); await sleep(200);
    s = await st();
    check('按「中斷」⇒ 依序執行又停用＋提示、綠框拿掉', s.run && /請先在第一步選螢幕並連線/.test(s.need) && !s.done, JSON.stringify(s));
    check('按「中斷」⇒ 清單的「已連線」框拿掉', await page.evaluate(() => !document.querySelector('#dpcd-panel tr.dp-linked')));
    check('Check RAD TCON 按鈕旁寫「（會送 AUX 初始化）」', /會送 AUX 初始化/.test(await page.$eval('#dpcd-panel', e => e.textContent)));
    await page.click('#dpcd-panel tr[data-i="0"] td:nth-child(3)'); await sleep(100);
    await page.click('#dp-check'); await waitFor(page, () => /RAD TCON 有回應：/.test(document.getElementById('dp-msg').textContent));
    check('Check RAD TCON 自動選到的那台（0x43C＝E5 03 的螢幕 1）同步加框', await page.evaluate(() => AuxDpcd.state().sel === 1 && document.querySelector('#dpcd-panel tr[data-i="1"]').classList.contains('dp-selrow') && document.querySelectorAll('#dpcd-panel tr.dp-selrow').length === 1));
    await page.click('#dp-conn'); await waitFor(page, () => i2ctAuxIsRaw()); await sleep(200);
    const ck = await page.evaluate(() => ({ init: (document.getElementById('dp-init') || {}).textContent || '', lk: (document.querySelector('#dpcd-panel tr.dp-linked') || {}).getAttribute ? document.querySelector('#dpcd-panel tr.dp-linked').getAttribute('data-i') : null, st: document.getElementById('dp-state').textContent }));
    check('做過 Check RAD TCON 再連線 ⇒ 連線狀態標「已初始化（Check RAD TCON）」、框在螢幕 1、名稱一致', /已初始化（Check RAD TCON）/.test(ck.init) && ck.lk === '1' && /螢幕 1/.test(ck.st), JSON.stringify(ck));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/dpcd_linked_highlight_init.png', fullPage: false });
    await page.click('#dp-conn'); await waitFor(page, () => !i2ctAuxIsRaw()); await sleep(200);
    await page.click('#dp-conn'); await waitFor(page, () => i2ctAuxIsRaw()); await sleep(200);
    await page.evaluate(() => { i2ctWs.close(); }); await sleep(150);
    s = await st();
    check('Bridge 那頭斷線（非使用者按）⇒ 依序執行也立刻停用', s.run && /請先在第一步選螢幕並連線/.test(s.need), JSON.stringify(s));
    await page.evaluate(() => { document.documentElement.lang = 'en'; AuxDpcd.render(); });
    check('英文提示', /Pick a display in step 1 and connect first/.test(await page.$eval('#dpcd-panel', e => e.textContent)));
    await page.evaluate(() => { document.documentElement.lang = 'zh-CN'; AuxDpcd.render(); });
    check('簡中提示', /请先在第一步选屏幕并连接/.test(await page.$eval('#dpcd-panel', e => e.textContent)));
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
