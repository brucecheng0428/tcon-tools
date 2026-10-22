#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   nbdebug 自測（NB TCON Debug應用，Bruce 2026-10-22，派工 238904982972174336；v1.0.1 派工 238929121141362688）
   ───────────────────────────────────────────────────────────────────────
   需要：PLAYWRIGHT_CORE＝playwright-core 套件資料夾（本機沒有就 exit 2）；Chrome 用系統的
         （CHROME 環境變數），WebKit 用 playwright 快取。NBD_MODEL_DIR＝WPF ModelFiles（選用，給 D 項）。
     D  頁面內 GPIO 表（NBD_GPIO）逐支對回 .model 原文（TX_EN／TX_IN_SEL 位址、bit、行號）。
     M  矩陣：每個 IC × 每個項目 × 每支 GPIO，用畫面下拉切換後讀表格（tr[data-k]）與獨立寫的期望表比對：
        選擇暫存器、TX_EN（該支的位址與 bit）、TX_IN_SEL（該支的位址、位元範圍、值）、列數（無殘留）、
        預設腳；v1.1.3 起畫面沒有驗證等級列（#nd-info／.nd-tag 不存在），量測提示在「說明」#nd-probe。桌機 1280 ×（Chrome、WebKit）、375 ×（WebKit）。
     X  匯出：按「匯出 Excel／匯出 .script」實際下載，Excel 解壓讀 sheet1（表頭＝wfg.html 的 WFG_NB_XLSX_HEADER、
        每列 Slave／Offset-Bytes／Offset／值），.script 照 write -m 語法逐行解析後套到記憶體，與期望表逐 byte 比對；
        KOSC 預設不含燒錄列，勾三格才有，檔內有 IRREVERSIBLE。
     I  模擬 I2C（假 WebSocket＋暫存器記憶體）：連線、認 IC、RX DE（E503／WP）I2C 執行 → 記憶體只改遮罩內 bit、
        讀回 ✓ → 還原回原值；EN01 KOSC：未勾燒錄不寫 7C:01=01；勾了但 20D0≠0 拒絕；20D0=0 才送；
        選 E503 但板子是 EN01 ⇒ 自動切 IC。
     N  v1.0.1：頁面三語文字、tooltip、原始碼都不可有人名／信件出處（tools/name-guard.mjs 雜湊名單）。
        v1.1.3（Bruce 2026-10-23）：頁面三語文字、tooltip、說明、匯出檔都不可有驗證等級／來源標籤（tools/check_no_verif_labels.mjs 字樣）。
     U  點擊數：開頁 → 3 個下拉＋1 個按鈕到下載；預設組合 1 個按鈕；375 與桌機各一次，截圖。
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import { findNames } from './name-guard.mjs';
import { findVerifLabels } from './check_no_verif_labels.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PWC = process.env.PLAYWRIGHT_CORE;
if (!PWC || !existsSync(PWC)) { console.error('🛑 需要 PLAYWRIGHT_CORE=<playwright-core 資料夾>'); process.exit(2); }
const { chromium, webkit } = createRequire(import.meta.url)(PWC);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = process.env.NBD_SHOT_DIR || '';
const NO_WEBKIT = !!process.env.NBD_NO_WEBKIT;   /* 本機沒有 playwright WebKit 快取時只跑 Chrome（回報要寫明） */
const MODEL_DIR = process.env.NBD_MODEL_DIR || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) { ok ? pass++ : fail++; if (!ok) fails.push(name + (detail ? '  ' + detail : '')); console.log((ok ? '✓ ' : '✗ ') + name + (!ok && detail ? '  ' + detail : '')); }
const H = (v, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');

/* ── 期望表（由信件／腳本原文獨立重寫，不讀頁面程式）── */
const EXP = {
  rxde: { regs: [[0x007, 0x02], [0x00A, 0x02]], sel: [0x37] },
  txde: { regs: [[0x007, 0x12], [0x008, 0x01], [0x009, 0x07]], sel: [0x20] },
  txrt6: { regs: [[0x00A, 0x02]], sel: [0x35] },
  osc: { regs: [[0x007, 0x01]], sel: [0x24] },
  oscd: { regs: [], sel: [0x3D] },
  kosc: { only: ['EN01'], regs: [[0x007, 0x01]], sel: [0x24],
          post: [[0x3E, 0x0E4, 0x83], [0x7C, 0x0F, 0x80], [0x7C, 0x0A, 0x5A], [0x7C, 0x0B, 0xC3], [0x7C, 0x01, 0x00], [0x7C, 0x00, 0xAA]] },
  pll0: { not: ['E501A', 'E501B'], regs: [[0x007, 0x13], [0x008, 0x01]], sel: [0x27] },
  pll1: { regs: [[0x007, 0x13], [0x008, 0x01]], sel: [0x22] },
  rxclk: { regs: [[0x007, 0x01]], sel: [0x22] },
  bs: { regs: [[0x00A, 0x16]], sel: [0x36], def: { E503: 'GPIO_04' } },
  be: { regs: [[0x00A, 0x16]], sel: [0x35], def: { E503: 'GPIO_BLEN' } },
  /* v1.1.0：Core state[3:0]＝dbg_02 [4:1]（TOP_DBG_SEL 02，TX_IN_SEL 24／23／22／21） */
  core: { regs: [[0x007, 0x02]], sel: [0x24, 0x23, 0x22, 0x21] },
};
const DEF = { E503: 'GPIO_ROM_WP', E501A: 'FLASH_WP_GPIO_05', E501B: 'FLASH_WP_GPIO_05', EN01: 'GPIO_07' };
const ICS = ['E503', 'E501A', 'E501B', 'EN01'];
const itemsFor = ic => Object.keys(EXP).filter(k => (!EXP[k].only || EXP[k].only.includes(ic)) && (!EXP[k].not || !EXP[k].not.includes(ic)));
/* gids：每個 bit 一支腳（字串＝單 bit）。EN01 的 TX_EN 照 EN01 Debug Mode 文件 p2 寫 nibble＝1；E503／E501 只改 TX_EN 一個 bit */
function expRows(G, ic, item, gids, opt = {}) {
  const e = EXP[item], list = Array.isArray(gids) ? gids : [gids], rows = [];
  if (e.post) rows.push(['r', 0x3E, 0x20D0, 7, 0, null]);
  e.regs.forEach(([a, v]) => rows.push(['w', 0x3E, a, 7, 0, v]));
  e.sel.forEach((sv, k) => {
    const g = G[ic].gpios.find(x => x.id === list[k]);
    rows.push(['w', 0x3E, g.tx[0], ic === 'EN01' ? g.tx[1] + 3 : g.tx[1], g.tx[1], 1]);
    rows.push(['w', 0x3E, g.sel[0], g.sel[1], g.sel[2], sv]);
  });
  if (e.post) { e.post.forEach(([s, a, v]) => rows.push(['w', s, a, 7, 0, (s === 0x7C && a === 0 && opt.code != null) ? opt.code : v])); if (opt.burn) rows.push(['burn', 0x7C, 0x01, 7, 0, 0x01]); }
  return rows;
}
const rowKey = r => [r[0], H(r[1]), H(r[2], 4), r[3], r[4], r[5] == null ? '' : H(r[5])].join(':');

/* ── 靜態伺服器 ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.zip': 'application/zip' };
const srv = createServer(async (req, res) => {
  try { const p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/nbdebug.html`;

/* ── 假 I2C Bridge（記憶體）── */
const FAKE = `(() => {
  const mem = {}; window.__mem = mem; window.__wlog = [];
  const k = (s, a) => s + ':' + a;
  window.__setMem = (o) => { for (const x in o) mem[x] = o[x]; };
  function FakeWS(url) { const ws = this; ws.readyState = 0; window.__ws = ws;
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); }, 5);
    ws.send = s => { const m = JSON.parse(s); const r = { id: m.id, ok: true, type: m.type };
      if ((m.type === 'read' || m.type === 'rawwrite') && (window.__nack || []).includes(m.slave)) { r.ok = false; r.err = 'NACK'; setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); return; }
      if (m.type === 'ping') Object.assign(r, { helper: 'fake', proto: 6 });
      if (m.type === 'read') { r.data = []; for (let i = 0; i < (m.len || 1); i++) r.data.push(mem[k(m.slave, m.addr + i)] ?? 0); }
      if (m.type === 'rawwrite') { m.data.forEach((b, i) => { mem[k(m.slave, m.addr + i)] = b; }); window.__wlog.push([m.slave, m.addr, m.data.slice()]); }
      setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); };
    ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose({}), 1); };
  }
  FakeWS.OPEN = 1; window.WebSocket = FakeWS;
})();`;
const ID = { E503: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x03, '62:8318': 0x20 }, EN01: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x03, '62:8318': 0x10 } };

/* ── 匯出檔解析 ── */
function unzip(buf) {
  const out = {}; let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), csz = buf.readUInt32LE(p + 18), nl = buf.readUInt16LE(p + 26), xl = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nl).toString(); const d = buf.slice(p + 30 + nl + xl, p + 30 + nl + xl + csz);
    out[name] = method === 0 ? d : inflateRawSync(d); p += 30 + nl + xl + csz;
  }
  return out;
}
function sheetRows(xml) {
  const rows = []; const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const rm of xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)) {
    const r = []; for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"( t="inlineStr")?>([\s\S]*?)<\/c>/g)) {
      const col = [...cm[1]].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const t = cm[2] ? un(cm[3].replace(/^<is><t[^>]*>|<\/t><\/is>$/g, '')) : Number(cm[3].replace(/<\/?v>/g, ''));
      r[col] = t; }
    rows[+rm[1] - 1] = r;
  }
  return rows;
}
const WFG_HEADER = (() => { const s = readFileSync(join(REPO, 'wfg.html'), 'utf8'); const m = /var WFG_NB_XLSX_HEADER = (\[[\s\S]*?\]);/.exec(s); return Function('return ' + m[1])(); })();
function parseScript(txt, expRowsArr, tag) {
  const mem = {}, lines = txt.split('\n'); let ok = true, bad = '';
  for (const [i, l] of lines.entries()) {
    if (/[^\x00-\x7F]/.test(l)) { ok = false; bad = 'non-ASCII line ' + (i + 1); }
    const s = l.replace(/\/\/.*$/, '').trim(); if (!s) continue;
    const m = /^write -m ([0-9A-F]{1,8}) ([0-9A-F]{2}) ([0-9A-F]{2})$/.exec(s);
    if (!m) { ok = false; bad = 'bad line ' + (i + 1) + ': ' + l; continue; }
    const a = parseInt(m[1], 16), v = parseInt(m[2], 16), mk = parseInt(m[3], 16);
    mem[a] = ((mem[a] ?? 0x5A) & ~mk & 0xFF) | (v & mk);
  }
  check(tag + ' .script 語法', ok, bad);
  const want = {};
  for (const r of expRowsArr) { if (r[0] !== 'w' || r[1] !== 0x3E) continue; const mk = (((1 << (r[3] - r[4] + 1)) - 1) << r[4]) & 0xFF; want[r[2]] = ((want[r[2]] ?? 0x5A) & ~mk & 0xFF) | ((r[5] << r[4]) & mk); }
  check(tag + ' .script 套用結果＝期望', JSON.stringify(mem) === JSON.stringify(want), JSON.stringify(mem) + ' vs ' + JSON.stringify(want));
}

/* 匯出攔截：按鈕的 handler 照常跑（產檔、組 Blob、a.download），只把 a.click() 的下載改存到 window.__dl ——
   連續十幾次真下載時 Chrome 會延後／合併下載事件（實測），矩陣用攔截；U 項仍用真下載。 */
async function grab(page, btn) {
  await page.evaluate(() => { if (window.__dlHook) return; window.__dlHook = 1; window.__dl = [];
    HTMLAnchorElement.prototype.click = function () { if (this.download) { const n = this.download; fetch(this.href).then(r => r.arrayBuffer()).then(b => window.__dl.push({ name: n, bytes: Array.from(new Uint8Array(b)) })); } }; });
  const n0 = await page.evaluate(() => window.__dl.length);
  await page.click(btn);
  await page.waitForFunction(n => window.__dl.length > n, n0);
  const d = await page.evaluate(() => window.__dl[window.__dl.length - 1]);
  return { name: d.name, buf: Buffer.from(d.bytes) };
}
async function sel(page, id, v) { await page.selectOption('#' + id, v); }
async function tableKeys(page) { return page.$$eval('#nd-tbl tr[data-k]', trs => trs.map(t => t.getAttribute('data-k'))); }

async function runEngine(name, browserType, opts, viewport, full) {
  const br = await browserType.launch(opts);
  const ctx = await br.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => { errs.push(String(e)); console.log('PAGEERR ' + e); }); page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await page.goto(URL0); await page.waitForFunction(() => window.NBD && document.querySelectorAll('#nd-tbl tr[data-k]').length > 0);
  const G = await page.evaluate(() => window.NBD_GPIO);
  const tag = `${name}@${viewport.width}`;
  /* M：矩陣 */
  let combos = 0, okc = 0;
  for (const ic of (process.env.NBD_DEBUG ? ['E503'] : ICS)) {
    await sel(page, 'nd-icsel', ic);
    const opts = await page.$$eval('#nd-item optgroup:first-child option', o => o.map(x => x.value));
    check(`${tag} M ${ic} 項目清單（常用）`, JSON.stringify(opts) === JSON.stringify(itemsFor(ic)), opts.join(','));
    for (const it of itemsFor(ic)) {
      await sel(page, 'nd-item', it);
      const gopts = await page.$$eval('#nd-gpio option', o => o.map(x => x.value));
      check(`${tag} M ${ic}/${it} GPIO 清單＝model 全部`, JSON.stringify(gopts) === JSON.stringify(G[ic].gpios.map(g => g.id)));
      const dp = (EXP[it].def && EXP[it].def[ic]) || DEF[ic];
      check(`${tag} M ${ic}/${it} 預設腳`, (await page.$eval('#nd-gpio', s => s.value)) === dp);
      const list = full ? gopts : [dp, gopts[0], gopts[gopts.length - 1], gopts[Math.floor(gopts.length / 2)]];
      for (const gid of list) {
        await sel(page, 'nd-gpio', gid); combos++;
        const pins = await page.$$eval('#nd-gpios select', a => a.map(x => x.value));
        const got = await tableKeys(page), want = expRows(G, ic, it, pins).map(rowKey);
        const noLv = await page.evaluate(() => !document.getElementById('nd-info') && !document.querySelector('.nd-tag'));
        const ok = JSON.stringify(got) === JSON.stringify(want) && noLv;
        if (ok) okc++; else check(`${tag} M ${ic}/${it}/${gid}`, false, JSON.stringify(got) + ' vs ' + JSON.stringify(want) + ' 等級列殘留 ' + !noLv);
        /* 量測位置：查不到封裝腳就要有「待確認」 */
        const g = G[ic].gpios.find(x => x.id === gid);
        const meas = await page.$eval('#nd-probe', e => e.textContent);
        if (!g.pst && !/待確認/.test(meas)) check(`${tag} M ${ic}/${gid} 待確認標示`, false, meas);
        if (g.pst === 'ok' && !meas.includes(g.pkg)) check(`${tag} M ${ic}/${gid} 封裝腳名`, false, meas);
      }
    }
  }
  check(`${tag} M 矩陣 ${okc}/${combos} 組合相符`, okc === combos);
  /* X：匯出（實際按鈕下載） */
  const XS = full ? [['E503', 'rxde', 'GPIO_ROM_WP'], ['E503', 'txde', 'GPIO_01'], ['E501B', 'osc', 'OPDIO_03'], ['EN01', 'rxde', 'GPIO_04'], ['EN01', 'kosc', 'GPIO_07'], ['E501A', 'bs', 'STV1_GPIO_13']] : [['E503', 'rxde', 'GPIO_ROM_WP'], ['EN01', 'kosc', 'GPIO_04']];
  for (const [ic, it, gid] of XS) {
    await sel(page, 'nd-icsel', ic); await sel(page, 'nd-item', it); await sel(page, 'nd-gpio', gid);
    const exp = expRows(G, ic, it, gid);
    const dx = await grab(page, '#nd-xlsx');
    const fx = dx.name; const xb = dx.buf;
    check(`${tag} X 檔名 ${fx}`, new RegExp(`^NBDebug_${ic}_${it}_${gid.replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+$/, '')}_\\d{8}\\.xlsx$`).test(fx));
    const z = unzip(xb), rows = sheetRows(z['xl/worksheets/sheet1.xml'].toString());
    check(`${tag} X ${ic}/${it} Excel 表頭＝WFG`, JSON.stringify(rows[0]) === JSON.stringify(WFG_HEADER));
    const want = exp.filter(r => r[0] !== 'r').map(r => [r[1], r[2], r[3], r[4], r[5]]);
    const gotx = rows.slice(1).map(r => { const m = /^0x([0-9A-F]+)\[(\d)(?::(\d))?\]$/.exec(r[4]); return [parseInt(r[2], 16), parseInt(m[1], 16), +m[2], m[3] === undefined ? +m[2] : +m[3], parseInt(r[6], 16), r[3]]; });
    check(`${tag} X ${ic}/${it}/${gid} Excel 列＝期望（位址／bit／值／順序）`, JSON.stringify(gotx.map(r => r.slice(0, 5))) === JSON.stringify(want), JSON.stringify(gotx) + ' vs ' + JSON.stringify(want));
    check(`${tag} X Excel Offset-Bytes 3E=2／7C=1`, gotx.every(r => r[5] === (r[0] === 0x3E ? 2 : 1)));
    check(`${tag} X Excel Check Item＝.model 名（GPIO 列）`, rows.slice(1).some(r => r[1] === G[ic].gpios.find(g => g.id === gid).selN));
    const st = (await grab(page, '#nd-script')).buf.toString('utf8');
    parseScript(st, exp, `${tag} X ${ic}/${it}/${gid}`);
    { const all = Object.values(z).map(b => b.toString('utf8')).join('\n') + '\n' + st, vh = findVerifLabels(all);
      check(`${tag} X ${ic}/${it}/${gid} 匯出 Excel／.script 沒有驗證等級／來源標籤`, vh.length === 0, vh.map(h => h.word).join(',')); }
    if (it === 'kosc') {
      check(`${tag} X KOSC 預設不含燒錄`, !/OSC_PROGRAM_EFUSE/.test(st) && !rows.some(r => r[1] === 'OSC_PROGRAM_EFUSE'));
      await page.check('#nd-burn'); await page.check('#nd-burn1');
      const half = await tableKeys(page); check(`${tag} X KOSC 只勾兩格仍不含燒錄`, !half.some(k => k.startsWith('burn')));
      await page.check('#nd-burn2');
      if (process.env.NBD_DEBUG) { await page.screenshot({ path: '/tmp/nbo/dbg_kosc.png', fullPage: true }); }
      const dx2 = await grab(page, '#nd-xlsx');
      const rows2 = sheetRows(unzip(dx2.buf)['xl/worksheets/sheet1.xml'].toString());
      const br2 = rows2.find(r => r[1] === 'OSC_PROGRAM_EFUSE');
      check(`${tag} X KOSC 三格勾了才有燒錄列且註明不可逆`, !!br2 && br2[2] === '0x7C' && br2[4] === '0x001[7:0]' && br2[6] === '0x1' && /IRREVERSIBLE/.test(br2[14]) && /不可逆/.test(br2[14]), JSON.stringify(br2));
      check(`${tag} X KOSC 燒錄檔名標 _BURN`, /_BURN_/.test(dx2.name));
      const st2 = (await grab(page, '#nd-script')).buf.toString('utf8');
      check(`${tag} X KOSC .script 燒錄行只是註解＋IRREVERSIBLE`, /IRREVERSIBLE/.test(st2) && !/^write -m 0001 01/m.test(st2));
      await page.uncheck('#nd-burn');
    }
  }
  /* I：模擬 I2C（只在第一個桌機引擎跑） */
  if (full) {
    const p2 = await ctx.newPage(); await p2.addInitScript(FAKE);
    await p2.goto(URL0); await p2.waitForFunction(() => window.NBD);
    check(`${tag} I 未連線時 I2C 執行停用`, await p2.$eval('#nd-run', b => b.disabled));
    await p2.evaluate(m => window.__setMem(Object.assign({ '62:89': 0xDE, '62:77': 0x11, '62:7': 0x00, '62:10': 0x00 }, m)), ID.E503);
    await p2.click('#nd-link'); await p2.waitForFunction(() => !document.querySelector('#nd-run').disabled);
    check(`${tag} I 認到 E503`, /E503/.test(await p2.$eval('#nd-ic', e => e.textContent)));
    await p2.click('#nd-run'); await p2.waitForFunction(() => /完成/.test(document.querySelector('#nd-st').textContent) || /不符|fail/.test(document.querySelector('#nd-st').textContent));
    const mem = await p2.evaluate(() => window.__mem);
    check(`${tag} I RX DE：0x007=02、0x00A=02`, mem['62:7'] === 2 && mem['62:10'] === 2);
    check(`${tag} I RX DE：0x04D 只改 bit4（11→11）`, mem['62:77'] === 0x11);
    check(`${tag} I RX DE：0x059 DE→F7（[7:6] DRV 保留、[5:0]=37）`, mem['62:89'] === 0xF7, H(mem['62:89']));
    const rbs = await p2.$$eval('#nd-tbl td.nd-rb', t => t.map(x => x.textContent));
    check(`${tag} I 讀回全 ✓`, rbs.length === 4 && rbs.every(s => /✓/.test(s)), rbs.join('|'));
    await p2.click('#nd-undo'); await p2.waitForFunction(() => /已還原/.test(document.querySelector('#nd-st').textContent));
    const mem2 = await p2.evaluate(() => window.__mem);
    check(`${tag} I 還原回原值`, mem2['62:89'] === 0xDE && mem2['62:7'] === 0 && mem2['62:10'] === 0 && mem2['62:77'] === 0x11);
    /* 換一支腳：0x055（GPIO_01）*/
    await p2.selectOption('#nd-gpio', 'GPIO_01'); await p2.evaluate(() => window.__setMem({ '62:85': 0x8D, '62:75': 0x01 }));
    await p2.click('#nd-run'); await p2.waitForFunction(() => /完成/.test(document.querySelector('#nd-st').textContent));
    const mem3 = await p2.evaluate(() => window.__mem);
    check(`${tag} I 換 GPIO_01：0x04B bit4 開（01→11）、0x055 8D→B7、0x059 不動`, mem3['62:75'] === 0x11 && mem3['62:85'] === 0xB7 && mem3['62:89'] === 0xDE, H(mem3['62:75']) + ' ' + H(mem3['62:85']) + ' ' + H(mem3['62:89']));
    await p2.click('#nd-link');
    /* EN01：板子是 EN01、畫面選 E503 ⇒ 自動切；KOSC 燒錄保護 */
    const p3 = await ctx.newPage(); await p3.addInitScript(FAKE); await p3.goto(URL0); await p3.waitForFunction(() => window.NBD);
    await p3.evaluate(m => window.__setMem(Object.assign({ '62:8400': 0x05 }, m)), ID.EN01);
    await p3.click('#nd-link'); await p3.waitForFunction(() => !document.querySelector('#nd-run').disabled);
    check(`${tag} I 板子是 EN01 ⇒ IC 自動切到 EN01`, (await p3.$eval('#nd-icsel', s => s.value)) === 'EN01');
    await p3.selectOption('#nd-item', 'kosc');
    await p3.click('#nd-run'); await p3.waitForFunction(() => /完成|不符/.test(document.querySelector('#nd-st').textContent));
    let m4 = await p3.evaluate(() => window.__mem);
    check(`${tag} I KOSC 未勾燒錄：7C:01 = 00、7C:00 = AA、GPIO7 0x05B = 24`, m4['124:1'] === 0 && m4['124:0'] === 0xAA && (m4['62:91'] & 0x7F) === 0x24);
    await p3.check('#nd-burn'); await p3.check('#nd-burn1'); await p3.check('#nd-burn2');
    await p3.click('#nd-run'); await p3.waitForFunction(() => !document.querySelector('#nd-run').disabled && /燒|programmed|Read 3E/.test(document.querySelector('#nd-st').textContent));
    m4 = await p3.evaluate(() => window.__mem);
    check(`${tag} I KOSC 20D0≠0（已燒過）⇒ 拒絕燒錄`, m4['124:1'] === 0, H(m4['124:1'] || 0) + ' ' + await p3.$eval('#nd-st', e => e.textContent));
    await p3.evaluate(() => window.__setMem({ '62:8400': 0x00 }));
    await p3.click('#nd-run'); await p3.waitForFunction(() => /完成/.test(document.querySelector('#nd-st').textContent));
    m4 = await p3.evaluate(() => window.__mem);
    check(`${tag} I KOSC 20D0=0 且三格勾 ⇒ 送出 7C:01=01`, m4['124:1'] === 1);
    const wl = await p3.evaluate(() => window.__wlog);
    check(`${tag} I KOSC 燒錄是最後一筆`, JSON.stringify(wl[wl.length - 1]) === JSON.stringify([0x7C, 0x01, [0x01]]));
    await p3.close(); await p2.close();
  }
  /* N：人名／信件出處（畫面三語＋說明展開＋tooltip＋原始碼） */
  {
    const pn = await ctx.newPage(); await pn.goto(URL0); await pn.waitForFunction(() => window.NBD);
    let txt = readFileSync(join(REPO, 'nbdebug.html'), 'utf8');
    for (const lg of ['zh-TW', 'en', 'zh-CN']) {
      await pn.selectOption('#lang-select', lg);
      for (const ic of ICS) for (const it of itemsFor(ic)) {
        await pn.selectOption('#nd-icsel', ic); await pn.selectOption('#nd-item', it);
        await pn.evaluate(() => { document.getElementById('nd-helpbox').open = true; });
        txt += '\n' + await pn.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('[title]')].map(e => e.title).join('\n'));
      }
    }
    const hits = findNames(txt);
    check(`${tag} N 頁面三語文字／tooltip／原始碼沒有人名或信件出處`, hits.length === 0, hits.slice(0, 5).map(h => h.kind + ':' + h.masked).join(' '));
    /* v1.1.3：畫面（三語 × 每個 IC × 每個項目，說明展開）＋tooltip 不可有驗證等級／來源標籤；原始碼會去註解才發佈，這裡只看畫面 */
    let vt = '';
    for (const lg of ['zh-TW', 'en', 'zh-CN']) {
      await pn.selectOption('#lang-select', lg);
      for (const ic of ICS) for (const it of itemsFor(ic)) {
        await pn.selectOption('#nd-icsel', ic); await pn.selectOption('#nd-item', it);
        await pn.evaluate(() => { document.getElementById('nd-helpbox').open = true; });
        vt += '\n' + await pn.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('[title]')].map(e => e.title).join('\n') + '\n' + [...document.querySelectorAll('option')].map(o => o.textContent).join('\n'));
      }
    }
    const vh = findVerifLabels(vt);
    check(`${tag} N 畫面三語／說明／tooltip／下拉沒有驗證等級或來源標籤`, vh.length === 0, vh.slice(0, 5).map(h => h.word + '…' + vt.slice(Math.max(0, h.at - 20), h.at + 20)).join(' | '));
    const lvKeys = await pn.evaluate(() => Object.keys(I18N).filter(k => /^nd\.(lv|pkgInf)/.test(k)));
    check(`${tag} N 沒有等級標籤的 i18n key（nd.lv*／nd.pkgInf）`, lvKeys.length === 0, lvKeys.join(','));

    await pn.close();
  }
  /* G：v1.1.0 多 bit 與群組項目 */
  if (full) {
    const pg = await ctx.newPage(); await pg.goto(URL0); await pg.waitForFunction(() => window.NBD);
    await pg.selectOption('#lang-select', 'zh-TW');
    const gi = await pg.evaluate(() => ({ n: NBD.groups.length, cnt: ['E503', 'E501A', 'E501B', 'EN01'].map(ic => NBD.allItems(ic).length) }));
    check(`G 群組 39 組（文件有 bit 內容的 dbg_01–20、dbg2_00–12）`, gi.n === 39, String(gi.n));
    console.log('   項目數（E503／E501A／E501B／EN01）＝' + gi.cnt.join('／'));
    /* Core state 4 bit：預設 4 支不同腳、暫存器＝期望、匯出含全部 */
    for (const ic of ICS) {
      await pg.selectOption('#nd-icsel', ic); await pg.selectOption('#nd-item', 'core');
      const pins = await pg.$$eval('#nd-gpios select', a => a.map(x => x.value));
      check(`${tag} G ${ic} Core state 4 列 GPIO、預設不重複`, pins.length === 4 && new Set(pins).size === 4 && pins[0] === DEF[ic], pins.join(','));
      const got = await tableKeys(pg), want = expRows(G, ic, 'core', pins).map(rowKey);
      check(`${tag} G ${ic} Core state 暫存器＝TOP 02＋4×(TX_EN、TX_IN_SEL 24/23/22/21)`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) + ' vs ' + JSON.stringify(want));
      if (ic === 'E503' || ic === 'EN01') {
        const dx = await grab(pg, '#nd-xlsx'), rows = sheetRows(unzip(dx.buf)['xl/worksheets/sheet1.xml'].toString());
        const sels = rows.slice(1).filter(r => /TX_IN_SEL|IN_SEL/.test(r[1])).map(r => r[6]);
        check(`${tag} G ${ic} Core state 匯出 Excel 含 4 個 TX_IN_SEL（0x24/0x23/0x22/0x21）、檔名 _x4`, JSON.stringify(sels) === JSON.stringify(['0x24', '0x23', '0x22', '0x21']) && /_x4_\d{8}\.xlsx$/.test(dx.name), JSON.stringify(sels) + ' ' + dx.name);
        const st = (await grab(pg, '#nd-script')).buf.toString('utf8');
        parseScript(st, expRows(G, ic, 'core', pins), `${tag} G ${ic} Core state`);
      }
    }
    /* 選到同一支腳 ⇒ 警告、不能執行／匯出 */
    await pg.selectOption('#nd-icsel', 'E503'); await pg.selectOption('#nd-item', 'core');
    const p0 = await pg.$eval('#nd-gpio', s => s.value); await pg.selectOption('#nd-gpio-1', p0);
    check(`${tag} G 重複腳 ⇒ 警告且匯出停用`, /同一支 GPIO/.test(await pg.$eval('#nd-warn', e => e.textContent)) && await pg.$eval('#nd-xlsx', b => b.disabled) && await pg.$eval('#nd-script', b => b.disabled));
    /* 群組項目抽查（依 EN01 Debug Mode 文件／E503A、E501B 投影片） */
    const spot = async (ic, id, wantRegs, wantSels) => {
      await pg.selectOption('#nd-icsel', ic); await pg.selectOption('#nd-item', id);
      const ks = await tableKeys(pg);
      const regs = ks.filter(k => /^w:3E:000[0-9A]:7:0:/.test(k)).map(k => k.split(':').slice(2, 3)[0] + '=' + k.split(':')[5]);
      const sels = ks.filter((k, i) => i % 2 === 1 && false);
      const selv = (await pg.evaluate(() => NBD.build(document.getElementById('nd-icsel').value, document.getElementById('nd-item').value, [].slice.call(document.querySelectorAll('#nd-gpios select')).map(x => x.value)).rows.filter(r => r.sel).map(r => r.val)));
      check(`${tag} G 抽查 ${ic} ${id}`, JSON.stringify(regs) === JSON.stringify(wantRegs) && JSON.stringify(selv) === JSON.stringify(wantSels), regs.join(',') + ' / ' + selv.map(v => v.toString(16)).join(','));
    };
    await spot('EN01', 'g:dbg_07:DP_STATE', ['0007=07'], [0x29, 0x28, 0x27]);
    await spot('EN01', 'g:dbg_07:UNPK_STATE', ['0007=07'], [0x26, 0x25, 0x24]);
    await spot('EN01', 'g:dbg_08:DP_STATE', ['0007=08'], [0x28, 0x27, 0x26, 0x25]);
    await spot('EN01', 'g:dbg_20:RING_OSC_OUTDIV8', ['0007=4A'], [0x25]);
    await spot('EN01', 'g:dbg2_06:DP_2_FIFO_BS_TOG', ['0007=36'], [0x26]);
    await spot('EN01', 'g:dbg2_09:RG_FNPLL_RSTB', ['0007=39'], [0x22]);
    await spot('E503', 'g:dbg2_09:RG_GBPLL_EXT_RSTN', ['0007=39'], [0x22]);
    await spot('E503', 'g:dbg2_10:DPCD_204H_IAD', ['0007=40'], [0x21]);
    await spot('E501B', 'g:dbg_02:DPFIFO_2_RTLOG_DE', ['000A=02'], [0x37]);
    await spot('E501B', 'g:dbg_16:PSR_STATE', ['000A=26'], [0x38, 0x37, 0x36]);
    await spot('E501A', 'g:dbg_01:OSC_CLK_DIV8', ['0007=01'], [0x24]);
    const noPsr = await pg.evaluate(() => ['E503', 'EN01'].every(ic => !NBD.allItems(ic).some(it => /PSR/.test(it.label) && !/VSC_SDP/.test(it.label))));
    check(`${tag} G E503／EN01 不列 PSR 訊號（文件：沒有 PSR，tie 0）`, noPsr);
    const e501bit67 = await pg.evaluate(() => ['E501A', 'E501B'].every(ic => NBD.allItems(ic).filter(it => it.group).every(it => it.regs[0].addr === 0x00A || it.bits.every(b => b.sel !== 0x26 && b.sel !== 0x27))));
    check(`${tag} G E501 群組項目不用 TX_IN_SEL 26h／27h（E501 是 BE／BS）`, e501bit67);
    /* 搜尋 */
    await pg.selectOption('#nd-icsel', 'EN01'); await pg.fill('#nd-q', 'CORESTATE');
    const qs = await pg.$$eval('#nd-item option', o => o.map(x => x.textContent));
    check(`${tag} G 搜尋 CORESTATE ⇒ 只剩含 CORESTATE 的項目`, qs.length >= 4 && qs.every(t => /CORE ?STATE/i.test(t)), qs.join('|'));
    await pg.fill('#nd-q', ''); await pg.close();
  }
  /* U：點擊數 */
  const p4 = await ctx.newPage(); await p4.goto(URL0); await p4.waitForFunction(() => window.NBD);
  let clicks = 0;
  const [d0] = await Promise.all([p4.waitForEvent('download'), p4.click('#nd-xlsx')]); clicks++;
  check(`${tag} U 預設組合 1 次點擊就下載（${d0.suggestedFilename()}）`, clicks === 1 && /E503_rxde_GPIO_ROM_WP/.test(d0.suggestedFilename()));
  clicks = 0;
  await p4.selectOption('#nd-icsel', 'EN01'); clicks++; await p4.selectOption('#nd-item', 'txde'); clicks++; await p4.selectOption('#nd-gpio', 'GPIO_04'); clicks++;
  const [d1] = await Promise.all([p4.waitForEvent('download'), p4.click('#nd-script')]); clicks++;
  check(`${tag} U 3 個下拉＋1 個按鈕＝${clicks} 次到下載（${d1.suggestedFilename()}）`, clicks === 4 && /EN01_txde_GPIO_04/.test(d1.suggestedFilename()));
  const ov = await p4.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('.container *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > w + 1 && !e.closest('.nd-tblwrap'); }).map(e => e.tagName + '.' + e.className).slice(0, 5); });
  check(`${tag} U 版面不超出畫面寬（表格區可橫捲除外）`, ov.length === 0, ov.join(','));
  for (const lg of ['en', 'zh-CN']) {
    await p4.selectOption('#lang-select', lg); await p4.click('#nd-helpbox summary');
    const txt = await p4.evaluate(() => document.body.innerText);
    check(`${tag} U ${lg} 沒有未翻譯的 key、沒有「聊天室」`, !/\b(nd|home|common)\.[A-Za-z]+/.test(txt) && !/聊天室/.test(txt), (txt.match(/\b(nd|home|common)\.[A-Za-z]+/) || [''])[0]);
    await p4.click('#nd-helpbox summary');
  }
  await p4.selectOption('#lang-select', 'zh-TW');
  if (SHOT) { await p4.screenshot({ path: join(SHOT, `nbdebug_${name}_${viewport.width}.png`), fullPage: true }); }
  check(`${tag} 工具頁沒有 page-credit（與其他工具頁一致，只有首頁與說明頁有）`, await p4.evaluate(() => !document.querySelector('.page-credit') && !/Designed by/.test(document.body.innerText)));
  check(`${tag} 無 JS 錯誤`, errs.length === 0, errs.join(' | '));
  await br.close();
}

/* D：GPIO 表對回 .model 原文 */
if (MODEL_DIR) {
  const s = readFileSync(join(REPO, 'nbdebug.html'), 'utf8'); const G = JSON.parse(/var NBD_GPIO = (\{.*\});/.exec(s)[1]);
  let n = 0, ok = 0;
  for (const ic of ICS) {
    const lines = readFileSync(join(MODEL_DIR, G[ic].model), 'utf8').split('\n');
    const blockAt = (L, name) => { if (!new RegExp('\\[\\s*' + name.replace(/[()]/g, '\\$&') + '\\s*\\]').test(lines[L - 1])) return null; const o = {}; for (let i = L; i < L + 8 && i < lines.length; i++) { const m = /^\s*(RegAddr0|RegMsb0|RegBits0)\s*=\s*(\S+)/.exec(lines[i]); if (m) o[m[1]] = m[2]; } return o; };
    for (const g of G[ic].gpios) {
      if (g.doc) continue;   /* v1.1.0：model 沒有、依 E501B 投影片 p3 補的腳（GPIO_07–10、12），D 項不對 model */
      n++; const t = blockAt(g.txL, g.txN), q = blockAt(g.selL, g.selN);
      const good = t && q && parseInt(t.RegAddr0, 16) === g.tx[0] && +t.RegMsb0 === g.tx[1] && +t.RegBits0 === 1 && parseInt(q.RegAddr0, 16) === g.sel[0] && +q.RegMsb0 === g.sel[1] && +q.RegMsb0 - +q.RegBits0 + 1 === g.sel[2];
      if (good) ok++; else check(`D ${ic} ${g.id} 對回 .model`, false, JSON.stringify({ t, q, g }));
    }
  }
  check(`D GPIO 表 ${ok}/${n} 支對回 .model 原文`, ok === n);
} else console.log('（D 略過：沒給 NBD_MODEL_DIR）');

try {
  await runEngine('chrome', chromium, { executablePath: CHROME, headless: true }, { width: 1280, height: 900 }, true);
  if (NO_WEBKIT) console.log('（WebKit 略過：NBD_NO_WEBKIT）');
  else {
    await runEngine('webkit', webkit, { headless: true }, { width: 1280, height: 900 }, false);
    await runEngine('webkit', webkit, { headless: true }, { width: 375, height: 812 }, false);
  }
  await runEngine('chrome', chromium, { executablePath: CHROME, headless: true }, { width: 375, height: 812 }, false);
} catch (e) { console.error('🛑 ' + (e.stack || e)); srv.close(); process.exit(2); }
srv.close();
console.log(`\n${fail ? '✗' : '✓'} check_nbdebug：${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
