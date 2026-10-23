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
  check('網頁與 bridge 的 T-CON 白名單一致（3E／7C／7D／7E）', JSON.stringify(cs) === JSON.stringify(js.SLAVES.slice().sort()), cs + ' vs ' + js.SLAVES);
  check('EEPROM 區間一致（0x50–0x57）', /slave>=0x50u && slave<=0x57u/.test(h) && js.EE_LO === 0x50 && js.EE_HI === 0x57);
  check('DPCD EEPROM 控制窗一致（0x480–0x48F）', /DGH_AUX_EE_LO 0x480u/.test(h) && /DGH_AUX_EE_HI 0x48Fu/.test(h) && js.DPCD_EE_LO === 0x480 && js.DPCD_EE_HI === 0x48F);
  let all = 0; for (let s = 0; s < 128; s++) if (js.check({ type: 'rawwrite', slave: s, awid: js.awidFor(s) || 2 }) === null) all++;
  check('網頁端 0x00–0x7F 只放行 4 個 slave', all === 4, String(all));
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
        if (eeRd) { r.data = []; const ed = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x51, 0xA1]; for (let i = 0; i < (m.len || 1); i++) r.data.push(ed[m.addr + i] ?? 0x5A); r.want = m.len; r.got = m.len; return reply(ws, r); }
        if (aux && opt.auxRegFail && m.type === 'read' && (m.slave === 0x3E || m.slave === 0x7C)) { Object.assign(r, { ok: false, err: 'AUX DPCD_Write 0x430 failed (3E:207E)' }); return reply(ws, r); }
        if (aux && ![0x3E, 0x7C, 0x7D, 0x7E].includes(m.slave)) { Object.assign(r, { ok: false, err: 'DP AUX mode: not a T-CON slave' }); return reply(ws, r); }
        if (!aux && [0x60, 0x61, 0x68, 0x69].includes(m.slave)) { Object.assign(r, { ok: false, err: 'NACK', status: 2 }); return reply(ws, r); }
      }
      if (m.type === 'read') { r.data = []; for (let i = 0; i < (m.len || 1); i++) r.data.push(mem[m.slave + ':' + (m.addr + i)] ?? 0); r.want = m.len; r.got = m.len; }
      if (m.type === 'rawwrite' || m.type === 'write') { (m.data || []).forEach((b, i) => { mem[m.slave + ':' + (m.addr + i)] = b; }); r.transferred = (m.data || []).length; }
      if (m.type === 'batchwrite') Object.assign(r, { segs: 1, segsDone: 1, done: m.len, total: m.len });
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
    await page.selectOption('#in-xport', 'aux');
    check('選 DP AUX ⇒ EEPROM 分段鈕停用', await page.$eval('#mode-seg [data-mode="ee"]', b => b.disabled));
    check('選 DP AUX ⇒ slave 改成 0x3E', /^0x3E$/i.test(await page.$eval('#in-slave', e => e.value.trim())), await page.$eval('#in-slave', e => e.value));
    check('slave 常用下拉的 0x50 停用', await page.$eval('#in-slave-sel option[value="0x50"]', o => o.disabled));
    await page.click('#btn-link');
    await waitFor(page, () => i2ctLinked === true);
    const op = await page.evaluate(() => window.__msgs.filter(m => m.t === 'open').pop());
    check('open 送 mode 4（DP AUX）', op && op.mode === 4, JSON.stringify(op));
    const ci = await page.$eval('#conn-info', e => e.textContent);
    check('連線資訊顯示 DP AUX：INTEL · 螢幕 2', /DP AUX：INTEL · 螢幕 2/.test(ci), ci);
    check('連線資訊顯示 PSR 已關', /PSR 已關/.test(ci), ci);
    await page.evaluate(() => i2ctCheckTconRun());
    const ident = await page.evaluate(() => i2ctCkResult ? i2ctCkResult.name : 'none');
    check('Check T-CON（經 AUX）認成 EN01', /^EN01/.test(ident), ident);
    const bus = await page.evaluate(() => window.__msgs.filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)));
    { const is7E = m => m.t === 'rawwrite' && m.s === 0x7E && m.a === 0xAB && JSON.stringify(m.d) === '[205]';
      /* v1.38.0：AUX 序列和 I2C 一模一樣（先 7E:AB←CD，再 TconDetect）；7E 只送這一筆（不經共用 session 再補一筆） */
      check('AUX Check T-CON 序列同 I2C：第一筆 7E:AB←CD、接著讀 7C:95 → 7C:98；寫入只有這一筆', bus.length >= 3 && is7E(bus[0]) && bus.filter(m => m.t !== 'read').length === 1 && bus[1].s === 0x7C && bus[1].a === 0x95 && bus[2].s === 0x7C && bus[2].a === 0x98, JSON.stringify(bus.slice(0, 4))); }
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
    check('非 T-CON slave（0x68）擋', e4 && e4.ok === false && /T-CON/.test(e4.err), JSON.stringify(e4));
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
    await page.selectOption('#in-xport', 'jig');
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
    await page.selectOption('#in-xport', 'aux');
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
    await page.selectOption('#in-xport', 'aux');
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
    await page.selectOption('#in-xport', 'aux');
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const bn = await page.$eval('#topbanner', e => e.textContent).catch(() => '');
    check('AMD＋T-CON init 失敗 ⇒ 橫幅講 T-CON 初始化沒成功＋系統管理員', /T-CON 初始化沒成功/.test(bn) && /AMD/.test(bn) && /系統管理員/.test(bn), bn.slice(0, 160));
    check('連上 1.20.0 ⇒ EEPROM 分段鈕開放', !(await page.$eval('#mode-seg [data-mode="ee"]', b => b.disabled)));
    check('連上 1.20.0 ⇒ slave 下拉 0x50 開放', !(await page.$eval('#in-slave-sel option[value="0x50"]', o => o.disabled)));
    await page.evaluate(() => i2ctCheckTconRun());
    const ident = await page.evaluate(() => i2ctCkResult ? i2ctCkResult.name : 'none');
    check('Check T-CON（AUX，同一份 TconDetect）認成 EN01', /^EN01/.test(ident), ident);
    const bus0 = await page.evaluate(() => window.__msgs.filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)));
    /* i2c-mbus 1.2.2（a6a3d85）：ROM 類型不影響共用 M-Bus 導通；AUX 走同一份 session／TconDetect ⇒ 與 I2C 治具送出的序列相同 */
    const rd0 = bus0.filter(m => m.t === 'read');
    { const is7E = m => m.t === 'rawwrite' && m.s === 0x7E && m.a === 0xAB && JSON.stringify(m.d) === '[205]';
      check('AUX Check T-CON 寫入只有第一筆 7E:AB←CD（同 I2C；bridge 照原廠寫 7E 的方法送）', bus0.length && is7E(bus0[0]) && bus0.filter(m => m.t !== 'read').length === 1, JSON.stringify(bus0.slice(0, 4))); }
    check('讀取序列同 I2C（同一份 TconDetect）：7C:95 → 7C:98 → 3E:207E', rd0.length >= 3 && rd0[0].s === 0x7C && rd0[0].a === 0x95 && rd0[1].s === 0x7C && rd0[1].a === 0x98 && rd0[2].s === 0x3E && rd0[2].a === 0x207E, JSON.stringify(rd0.slice(0, 4)));
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
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E3. DP AUX：3E／7C 讀不到 ⇒ 認不出（不錯判 E503）、序列同 I2C、log 有 bridge 的錯誤；IOA 讀 EEPROM 照常');
  {
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD', admin: false, tconInit: false, auxRegFail: true });
    await page.selectOption('#in-xport', 'aux');
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const n0 = await page.evaluate(() => window.__msgs.length);
    await page.evaluate(() => i2ctCheckTconRun());
    const r = await page.evaluate(() => i2ctCkResult && { name: i2ctCkResult.name, isE503: i2ctCkResult.isE503, unknown: !!i2ctCkResult.unknown, family: i2ctCkResult.family || null });
    check('3E／7C 讀不到 ⇒ 認不出（unknown）、不是 E503', r && r.unknown && !r.isE503 && r.family !== 'E503', JSON.stringify(r));
    const after = await page.evaluate((n) => window.__msgs.slice(n).filter(m => ['read', 'rawwrite', 'write', 'batchwrite'].includes(m.t)), n0);
    { const is7E = m => m.t === 'rawwrite' && m.s === 0x7E && m.a === 0xAB && JSON.stringify(m.d) === '[205]';
      check('序列同 I2C：7E:AB←CD → 7C:95 → 7C:98 → 3E:207E，寫入只有 7E 一筆', after.length === 4 && is7E(after[0]) && after[1].s === 0x7C && after[1].a === 0x95 && after[2].s === 0x7C && after[2].a === 0x98 && after[3].s === 0x3E && after[3].a === 0x207E, JSON.stringify(after)); }
    const lg = await page.$eval('#log', e => e.textContent);
    check('log 寫出 bridge 的錯誤（DPCD_Write 0x430）', /0x430/.test(lg), lg.slice(-200));
    const rd = await page.evaluate(() => i2ctDoRead(0x50, 1, 0, 8, true));
    check('IOA 讀 EEPROM 0x50 照常', rd && rd.ok !== false && (rd.bytes || rd.data).length === 8, JSON.stringify(rd).slice(0, 100));
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  console.log('E2. 375 寬：proto 9 EEPROM 分段鈕可按、不破版');
  {
    const { ctx, page, errs } = await open({ proto: 9, card: 'AMD' }, 375);
    await page.selectOption('#in-xport', 'aux');
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
    await page.selectOption('#in-xport', 'aux');
    await page.click('#btn-link'); await waitFor(page, () => i2ctLinked === true);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('375 寬沒有水平捲動', ov <= 1, 'overflow ' + ov);
    const r = await page.$eval('#in-xport', e => { const b = e.getBoundingClientRect(); return b.right <= window.innerWidth && b.width > 40; });
    check('連線方式下拉在畫面內', r);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/aux_375.png', fullPage: false });
    check('沒有 JS 錯誤', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
} catch (e) { check('執行', false, String(e && e.stack || e).slice(0, 400)); }
await browser.close(); srv.close();
console.log(`\n${fail ? '✗' : '✓'} check_i2c_aux（${REPO}）：${pass} pass / ${fail} fail`);
if (fail) { console.log('失敗：\n  - ' + fails.join('\n  - ')); process.exit(1); }
