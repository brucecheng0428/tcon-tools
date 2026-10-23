#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   nbdebug 自測（NB TCON Debug應用，Bruce 2026-10-22，派工 238904982972174336；v1.0.1 派工 238929121141362688）
   ───────────────────────────────────────────────────────────────────────
   需要：PLAYWRIGHT_CORE＝playwright-core 套件資料夾（本機沒有就 exit 2）；Chrome 用系統的
         （CHROME 環境變數），WebKit 用 playwright 快取。NBD_MODEL_DIR＝WPF ModelFiles（選用，給 D 項）。
     D  頁面內 GPIO 表（NBD_GPIO）逐支對回 .model 原文（TX_EN／TX_IN_SEL 位址、bit、行號）。
     M  矩陣：每個 IC × 每個項目 × 每支 GPIO，用畫面下拉切換後讀表格（tr[data-k]）與獨立寫的期望表比對：
        選擇暫存器、TX_EN（該支的位址與 bit）、TX_IN_SEL（該支的位址、位元範圍、值）、列數（無殘留）、
        預設腳；v1.1.3 起畫面沒有驗證等級列（#nd-info／.nd-tag 不存在）；v1.1.4 起量測提示也不在「說明」（#nd-probe 不存在），
        封裝腳名看 GPIO 下拉（EN01 20 支＝pin 號＋腳上名稱，腳名≠暫存器名的 4 支加註）。桌機 1280 ×（Chrome、WebKit）、375 ×（WebKit）。
     X  匯出：按「匯出 Excel／匯出 .script」實際下載，Excel 解壓讀 sheet1（表頭＝wfg.html 的 WFG_NB_XLSX_HEADER、
        每列 Slave／Offset-Bytes／Offset／值），.script 照 write -m 語法逐行解析後套到記憶體，與期望表逐 byte 比對；
        KOSC 預設不含燒錄列，勾三格才有，檔內有 IRREVERSIBLE。
     I  模擬 I2C（假 WebSocket＋暫存器記憶體）：連線、認 IC、RX DE（E503／WP）I2C 執行 → 記憶體只改遮罩內 bit、
        讀回 ✓ → 還原回原值；EN01 KOSC：未勾燒錄不寫 7C:01=01；勾了但 20D0≠0 拒絕；20D0=0 才送；
        選 E503 但板子是 EN01 ⇒ 自動切 IC。
     N  v1.0.1：頁面三語文字、tooltip、原始碼都不可有人名／信件出處（tools/name-guard.mjs 雜湊名單）。
        v1.1.3（Bruce 2026-10-23）：頁面三語文字、tooltip、說明、匯出檔都不可有驗證等級／來源標籤（tools/check_no_verif_labels.mjs 字樣）。
     U  點擊數：開頁 → 3 個下拉＋1 個按鈕到下載；預設組合 1 個按鈕；375 與桌機各一次，截圖。
     K  v1.2.0 KOSC 一步一步引導（Bruce 2026-10-23）：
        K0 建議值演算法 guideSuggest 矩陣（從 nbdebug.html 抽出純函式，用 OSC 模型代替示波器）：線性／二次／指數 × 斜率正負 ×
           中心點（含非整數）× 容許範圍 × 起始值，另加量測雜訊；可達（某個 code 落在容許範圍）⇒ 一定收斂成合格；
           不可達 ⇒ 目標在 0x00～0x7F 範圍內停在 best、範圍外停在 edge；不重複建議、bit7 一定 1、輪數上限。
        K1 模擬 I2C 走完整流程：① 讀 20D0 → ② Debug OSC → ③ 寫 AA → ④ 填頻率（假 OSC 模型，含一次超過目標）→ 建議值預填 →
           寫入 → 再量 … 合格 → ⑤ 燒錄（合格前沒有燒錄框、三格沒勾按鈕停用、燒前再讀 20D0）→ ⑥ 上下電後只下 ② → 量 → 20D0 非 0。
           每步高亮的表列、記憶體寫入值、每輪紀錄表、三語文字（無 key、無等級字樣）；已燒過的板子合格後不出現燒錄。
     B  v1.3.0 M-Bus → C-Bus 導通（Bruce 2026-10-23）：EN01／E503 有「M-Bus → C-Bus 導通」項目、E501A／B 沒有；
        表格只有一筆 7E:AB←CD（＝瑞鼎 UI RCP2 ICDefine.cs RM81008 L576–580／RM8100x L2806–2810，期望值獨立寫在本檔）、
        GPIO 列隱藏、警示與說明三語都寫單向（M-Bus→C-Bus，C-Bus 不能連回）、說明三段；匯出 Excel 一列 7E／1／0x0AB／CD、
        .script 只有註解（ASCII、寫明 ONE-WAY）；模擬 I2C 按「I2C 執行」送出的位元組＝[7E, AB, [CD]] 一筆、不讀 7E、不重複送。
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

/* ── 假 I2C and AUX Bridge（記憶體）── */
const FAKE = `(() => {
  const mem = {}; window.__mem = mem; window.__wlog = [];
  const k = (s, a) => s + ':' + a;
  window.__setMem = (o) => { for (const x in o) mem[x] = o[x]; };
  function FakeWS(url) { const ws = this; ws.readyState = 0; window.__ws = ws;
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); }, 5);
    ws.send = s => { const m = JSON.parse(s); const r = { id: m.id, ok: true, type: m.type };
      if ((m.type === 'read' || m.type === 'rawwrite') && (window.__nack || []).includes(m.slave)) { r.ok = false; r.err = 'NACK'; setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); return; }
      if (m.type === 'ping') Object.assign(r, { helper: 'fake', proto: 6 });
      if (m.type === 'read') { (window.__rlog = window.__rlog || []).push([m.slave, m.addr]); r.data = []; for (let i = 0; i < (m.len || 1); i++) r.data.push(mem[k(m.slave, m.addr + i)] ?? 0); }
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
        /* v1.1.4：量測提示不顯示（#nd-probe 不存在）；封裝腳名看下拉：查不到封裝腳就要有「待確認」 */
        const g = G[ic].gpios.find(x => x.id === gid);
        if (await page.$('#nd-probe')) check(`${tag} M ${ic}/${gid} 說明不可再有量測提示`, false, '#nd-probe');
        const meas = await page.$eval('#nd-gpio', (s, v) => s.querySelector(`option[value="${v}"]`).textContent, gid);
        if (!g.pst && !/待確認/.test(meas)) check(`${tag} M ${ic}/${gid} 待確認標示`, false, meas);
        if (g.pst === 'ok' && !meas.includes(g.pkg)) check(`${tag} M ${ic}/${gid} 封裝腳名`, false, meas);
        if (ic === 'EN01' && !(meas.startsWith(g.pin + ' ' + g.pkg) && meas.includes(gid) && /待確認|沒拉出/.test(meas) === false && (!!g.diff) === /腳上名稱和暫存器名不同/.test(meas))) check(`${tag} M EN01/${gid} 下拉＝pin＋腳名（暫存器名${g.diff ? '，加註不同' : ''}）`, false, meas);
      }
    }
  }
  check(`${tag} M 矩陣 ${okc}/${combos} 組合相符`, okc === combos);
  /* H（v1.2.0）：每一列都有說明（做什麼／判斷／下一步），四顆 IC × 常用項目 × 三語；KOSC 表下有「偏高／偏低怎麼調」，其他項目沒有 */
  {
    const miss = []; let nrow = 0;
    for (const lg of ['zh-TW', 'en', 'zh-CN']) {
      await page.selectOption('#lang-select', lg);
      for (const ic of ICS) for (const it of itemsFor(ic)) {
        await sel(page, 'nd-icsel', ic); await sel(page, 'nd-item', it);
        const r = await page.$$eval('#nd-tbl tbody tr', trs => trs.map(t => { const d = t.querySelector('td.ds'); return d ? d.querySelectorAll('.dk').length : 0; }));
        nrow += r.length; r.forEach((k, i) => { if (k < 3) miss.push(`${lg}/${ic}/${it}#${i + 1}:${k}`); });
        const kt = await page.$eval('#nd-ktrim', e => !e.classList.contains('hidden') && e.innerText.length > 50);
        if (kt !== (it === 'kosc')) miss.push(`${lg}/${ic}/${it} ktrim=${kt}`);
      }
    }
    check(`${tag} H 每一列都有三段說明（三語共 ${nrow} 列）、只有 KOSC 有調法說明`, miss.length === 0 && nrow > 0, miss.slice(0, 8).join(' '));
    await page.selectOption('#lang-select', 'zh-TW');
    await sel(page, 'nd-icsel', 'EN01'); await sel(page, 'nd-item', 'kosc');
    const ds = await page.$$eval('#nd-tbl tbody tr', trs => trs.map(t => t.querySelector('td.ds').innerText));
    check(`${tag} H KOSC 0x20D0 列寫明 0x00＝沒 trim、非 0＝已 trim、非 0 不要再燒`, /0x00＝沒 trim 過/.test(ds[0]) && /非 0＝已 trim 過/.test(ds[0]) && /不要再燒/.test(ds[0]), ds[0]);
    const ci = ds.findIndex(t => /為什麼可以填/.test(t));
    check(`${tag} H KOSC 7C 0x00（第 10 列）說明 0x80＋檔位、0xAA＝起始值、為什麼可填`, ci === 9 && /0x80/.test(ds[ci]) && /0xAA/.test(ds[ci]) && /檔位/.test(ds[ci]), ci + ' ' + ds[ci]);
    check(`${tag} H KOSC 解鎖金鑰列寫明固定值、不能改`, ds.filter(t => /解鎖金鑰（固定值/.test(t) && /不能改/.test(t)).length === 2);
    const kt = await page.$eval('#nd-ktrim', e => e.innerText);
    check(`${tag} H 偏高／偏低調法：先試 +0x10、每一檔變多少、四捨五入、範例 0xB2，沒有 floor() 寫法`, /0x10/.test(kt) && /每一檔/.test(kt) && /四捨五入/.test(kt) && /0xB2/.test(kt) && !/floor|Math\.|round\(/.test(kt), kt.slice(0, 160));
    /* 範例數字要跟引導模式算出來的一樣：0xAA→6.60、0xBA→6.92 ⇒ 下一個 0xB2 */
    const nx = await page.evaluate(() => window.NBD.guideSuggest && window.NBD.guideSuggest([{ code: 0xAA, f: 6.60 }, { code: 0xBA, f: 6.92 }], 6.75, 1.5));
    check(`${tag} H 調法範例＝引導模式算的值（0xB2）`, !!nx && nx.code === 0xB2 && nx.why === 'interp', JSON.stringify(nx));
    /* E503 TX DE：0x008 列提醒平常要 0x01、量完還原 */
    await sel(page, 'nd-icsel', 'E503'); await sel(page, 'nd-item', 'txde');
    const d8 = await page.$$eval('#nd-tbl tbody tr', trs => trs.map(t => t.querySelector('td.ds').innerText).find(x => /MCU patch/.test(x)) || '');
    check(`${tag} H E503 TX DE 的 0x008 列提醒平常要 0x01、量完還原`, /0x01/.test(d8) && /還原/.test(d8), d8);
  }
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
  /* K1：KOSC 一步一步引導（模擬 I2C＋假 OSC：f = 6.75·e^(0.03·(code[6:0]−71.3))，會有一次超過目標） */
  {
    const oscF = mem => +(6.75 * Math.exp(0.03 * (((mem['124:0'] ?? 0) & 0x7F) - 71.3))).toFixed(3);
    const pk = await ctx.newPage(); await pk.addInitScript(FAKE); await pk.goto(URL0); await pk.waitForFunction(() => window.NBD);
    pk.on('pageerror', e => errs.push('K1 ' + e));
    await pk.evaluate(m => window.__setMem(Object.assign({ '62:8400': 0x00 }, m)), ID.EN01);
    await pk.click('#nd-link'); await pk.waitForFunction(() => /EN01/.test(document.querySelector('#nd-ic').textContent));
    await pk.selectOption('#nd-item', 'kosc');
    check(`${tag} K1 KOSC 有「一步一步引導」開關、預設關`, await pk.$eval('#nd-gsw', e => !e.classList.contains('hidden')) && !(await pk.$eval('#nd-guide', e => e.checked)) && await pk.$eval('#nd-gpanel', e => e.classList.contains('hidden')));
    await pk.selectOption('#nd-item', 'rxde');
    check(`${tag} K1 非 KOSC 項目沒有引導開關`, await pk.$eval('#nd-gsw', e => e.classList.contains('hidden')));
    await pk.selectOption('#nd-item', 'kosc');
    await pk.check('#nd-guide');
    const gkeys = () => pk.$$eval('#nd-tbl tr.gcur', a => a.map(t => t.getAttribute('data-k')));
    const curStep = () => pk.$eval('#nd-gpanel .nd-gst.cur', e => e.getAttribute('data-gs')).catch(() => null);
    const clickG = async (g) => { await pk.click(`#nd-gpanel button[data-g="${g}"]`); await pk.waitForFunction(() => !window.NBD.S.busy); };
    check(`${tag} K1 開引導 ⇒ 面板出現、I2C 執行鈕收起、燒錄框不出現`, await pk.$eval('#nd-gpanel', e => !e.classList.contains('hidden')) && await pk.$eval('#nd-run', e => e.classList.contains('hidden')) && await pk.$eval('#nd-burnbox', e => e.classList.contains('hidden')));
    let gk = await gkeys();
    check(`${tag} K1 ① 高亮表上 #1（讀 3E 0x20D0）`, (await curStep()) === '1' && gk.length === 1 && gk[0] === 'r:3E:20D0:7:0:', gk.join(','));
    await clickG('read');
    gk = await gkeys();
    check(`${tag} K1 ① 讀到 0 ⇒ 沒燒過、進到 ②（高亮 TOP_DBG_SEL＋GPIO7 TX_EN／TX_IN_SEL 三列）`, /沒燒過/.test(await pk.$eval('#nd-gpanel', e => e.innerText)) && (await curStep()) === '2' && gk.join(',') === ['w:3E:0007:7:0:01', 'w:3E:004D:7:4:01', 'w:3E:005B:6:0:24'].join(','), gk.join(','));
    check(`${tag} K1 ② 提示量 GPIO7`, /GPIO7/.test(await pk.$eval('#nd-gpanel .nd-gst[data-gs="2"]', e => e.innerText)));
    await clickG('dbg');
    let m = await pk.evaluate(() => window.__mem);
    check(`${tag} K1 ② 寫入：0x007=01、0x04D[7:4]=1、0x05B[6:0]=24`, m['62:7'] === 1 && ((m['62:77'] >> 4) & 0xF) === 1 && (m['62:91'] & 0x7F) === 0x24, [m['62:7'], m['62:77'], m['62:91']].map(v => H(v ?? 0)).join(','));
    gk = await gkeys();
    check(`${tag} K1 ③ 高亮 0x0E4、7C 解鎖、select、7C 0x00 六列，7C 0x00 已填 AA`, (await curStep()) === '3' && gk.length === 6 && gk[5] === 'w:7C:0000:7:0:AA' && (await pk.$eval('#nd-code', e => e.value)) === 'AA', gk.join(','));
    await clickG('cal');
    m = await pk.evaluate(() => window.__mem);
    check(`${tag} K1 ③ 寫入 7C 0x0F=80、0A=5A、0B=C3、01=00、00=AA；3E 0x0E4=83`, m['124:15'] === 0x80 && m['124:10'] === 0x5A && m['124:11'] === 0xC3 && m['124:1'] === 0 && m['124:0'] === 0xAA && m['62:228'] === 0x83);
    /* ④ 來回校正 */
    const seenHi = [], seenLo = [], codes = []; let passed = false, round = 0, prefillOk = true, noBurnBeforePass = true;
    for (round = 1; round <= 10; round++) {
      m = await pk.evaluate(() => window.__mem); const f = oscF(m); codes.push(m['124:0']);
      if (f > 6.75 * 1.015) seenHi.push(f); else if (f < 6.75 * 0.985) seenLo.push(f);
      await pk.fill('#nd-gf', String(f)); await pk.click('#nd-gpanel button[data-g="meas"]');
      const st = await pk.evaluate(() => ({ step: window.NBD.gStep(), code: window.NBD.S.code, sug: window.NBD.S.g.sug }));
      if (st.step === 5) { passed = true; break; }
      if (!(await pk.$eval('#nd-burnbox', e => e.classList.contains('hidden'))) || await pk.$('#nd-gpanel button[data-g="burn"]')) noBurnBeforePass = false;
      const shown = await pk.$eval('#nd-code', e => e.value);
      if (shown !== H(st.code) || !(await pk.$(`#nd-gpanel button[data-g="cal"]`))) prefillOk = false;
      await pk.click(`#nd-gpanel .nd-gst[data-gs="4"] button[data-g="cal"]`); await pk.waitForFunction(() => !window.NBD.S.busy);
      m = await pk.evaluate(() => window.__mem);
      if (m['124:0'] !== st.code) prefillOk = false;
    }
    check(`${tag} K1 ④ 來回校正收斂（${round} 輪：${codes.map(c => H(c)).join('→')}）`, passed && round <= 8, codes.map(c => H(c)).join(','));
    check(`${tag} K1 ④ 過程有偏低也有超過目標（超出→建議值→合格）`, seenHi.length >= 1 && seenLo.length >= 1, `hi ${seenHi} lo ${seenLo}`);
    check(`${tag} K1 ④ 每輪建議值預填到表上 7C 0x00、按寫入就是那個值`, prefillOk);
    check(`${tag} K1 ④ 合格前沒有燒錄框、沒有燒錄鈕`, noBurnBeforePass);
    const rt = await pk.$$eval('#nd-gpanel .nd-gtbl tbody tr', a => a.map(t => t.innerText));
    check(`${tag} K1 ④ 每一輪都有紀錄（輪次、寫入值、量測值）`, rt.length === round && rt.every((t, i) => t.includes(String(i + 1)) && t.includes(H(codes[i]))), rt.join(' | '));
    /* ⑤ 燒錄 */
    check(`${tag} K1 ⑤ 合格後燒錄框搬進第 ⑤ 步、表上還沒有燒錄列、按鈕停用`, await pk.$eval('#nd-burnbox', e => !e.classList.contains('hidden') && !!e.closest('#nd-gpanel')) && !(await tableKeys(pk)).some(k => k.startsWith('burn')) && !(await pk.$('#nd-gpanel button[data-g="burn"]')));
    check(`${tag} K1 ⑤ 寫明不可逆、不能重燒`, /不可逆/.test(await pk.$eval('#nd-gpanel .nd-gst[data-gs="5"]', e => e.innerText)) && /不能重燒/.test(await pk.$eval('#nd-gpanel .nd-gst[data-gs="5"]', e => e.innerText)));
    await pk.check('#nd-burn'); await pk.check('#nd-burn1'); await pk.check('#nd-burn2');
    gk = await gkeys();
    check(`${tag} K1 ⑤ 三格勾了 ⇒ 表上出現燒錄列並高亮（含 20D0）`, gk.includes('burn:7C:0001:7:0:01') && gk.includes('r:3E:20D0:7:0:'), gk.join(','));
    const wl0 = (await pk.evaluate(() => window.__wlog)).length;
    await clickG('burn');
    m = await pk.evaluate(() => window.__mem); const wl = await pk.evaluate(() => window.__wlog);
    check(`${tag} K1 ⑤ 燒錄：只多寫 7C 0x01=01 一筆（M-Bus 導通除外）且是最後一筆、7C 0x00 留在合格值`, m['124:1'] === 1 && JSON.stringify(wl[wl.length - 1]) === JSON.stringify([0x7C, 0x01, [0x01]]) && wl.slice(wl0).filter(w => w[0] !== 0x7E).length === 1 && m['124:0'] === codes[codes.length - 1], H(m['124:0']) + ' ' + JSON.stringify(wl.slice(wl0)));
    check(`${tag} K1 ⑤ 燒完燒錄框收起、進到 ⑥`, (await curStep()) === '6' && await pk.$eval('#nd-burnbox', e => e.classList.contains('hidden')));
    /* ⑥ 重新上下電：暫存器回預設（模擬），只下 Debug OSC 三列、量頻、讀 20D0 */
    await pk.evaluate(() => window.__setMem({ '62:7': 0, '62:77': 0, '62:91': 0, '62:8400': 0x03 }));
    const wl1 = (await pk.evaluate(() => window.__wlog)).length;
    await clickG('pdbg');
    const wl2 = await pk.evaluate(() => window.__wlog);
    const after = wl2.slice(wl1);
    check(`${tag} K1 ⑥ 上下電後先下 M-Bus 導通（7E:AB←CD），再只下 3E 那三列、不寫 7C`, JSON.stringify(after[0]) === JSON.stringify([0x7E, 0xAB, [0xCD]]) && after.length === 4 && after.slice(1).every(w => w[0] === 0x3E), JSON.stringify(after));
    await pk.fill('#nd-gpf', '6.76'); await pk.click('#nd-gpanel button[data-g="pmeas"]');
    await clickG('pread');
    check(`${tag} K1 ⑥ 量到 6.76 合格、0x20D0=03 ⇒ KOSC 完成`, /KOSC 完成/.test(await pk.$eval('#nd-gpanel', e => e.innerText)) && (await pk.evaluate(() => window.NBD.gStep())) === 7);
    check(`${tag} K1 ⑥ 標出對應表列 #1、#2–4`, (await pk.$eval('#nd-gpanel .nd-gst[data-gs="6"] .nd-gref', e => e.textContent)) === '表 #1、#2–4');
    const lt = await pk.evaluate(() => window.NBD.gLogText());
    check(`${tag} K1 複製紀錄內容含每一輪、燒錄值、上下電後結果`, codes.every(c => lt.includes('0x' + H(c))) && /eFuse programmed/.test(lt) && /after power cycle: 6.76/.test(lt) && /0x20D0 \(after\) = 0x03/.test(lt), lt);
    /* 三語：引導面板沒有未翻譯 key、沒有等級／來源字樣、沒有人名 */
    let gt = '';
    for (const lg of ['en', 'zh-CN', 'zh-TW']) {
      await pk.selectOption('#lang-select', lg);
      const t = await pk.$eval('#nd-gpanel', e => e.innerText + '\n' + [...e.querySelectorAll('[title],[placeholder]')].map(x => x.title + x.placeholder).join('\n'));
      gt += t;
      check(`${tag} K1 ${lg} 引導面板沒有未翻譯的 key`, !/\bnd\.[A-Za-z0-9]+/.test(t), (t.match(/\bnd\.[A-Za-z0-9]+/) || [''])[0]);
    }
    check(`${tag} K1 引導面板三語沒有驗證等級／來源字樣、沒有人名`, findVerifLabels(gt).length === 0 && findNames(gt).length === 0, findVerifLabels(gt).map(h => h.word).join(','));
    if (SHOT) await pk.screenshot({ path: join(SHOT, `nbdebug_kosc_guide_${name}_${viewport.width}.png`), fullPage: true });
    const ovk = await pk.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('#nd-gpanel *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > w + 1; }).map(e => e.tagName + '.' + e.className).slice(0, 5); });
    check(`${tag} K1 引導面板不超出畫面寬`, ovk.length === 0, ovk.join(','));
    await pk.close();

    /* 已燒過的板子（20D0≠0）：照樣可量頻，合格後不出現燒錄 */
    const pb = await ctx.newPage(); await pb.addInitScript(FAKE); await pb.goto(URL0); await pb.waitForFunction(() => window.NBD);
    await pb.evaluate(m => window.__setMem(Object.assign({ '62:8400': 0x05 }, m)), ID.EN01);
    await pb.click('#nd-link'); await pb.waitForFunction(() => /EN01/.test(document.querySelector('#nd-ic').textContent));
    await pb.selectOption('#nd-item', 'kosc'); await pb.check('#nd-guide');
    for (const g of ['read', 'dbg', 'cal']) { await pb.click(`#nd-gpanel button[data-g="${g}"]`); await pb.waitForFunction(() => !window.NBD.S.busy); }
    await pb.fill('#nd-gf', '6.75'); await pb.click('#nd-gpanel button[data-g="meas"]');
    const t5 = await pb.$eval('#nd-gpanel .nd-gst[data-gs="5"]', e => e.innerText);
    check(`${tag} K1 已燒過（20D0=05）⇒ 合格後寫「不要再燒」、沒有燒錄鈕／燒錄框`, /不要再燒/.test(t5) && !(await pb.$('#nd-gpanel button[data-g="burn"]')) && await pb.$eval('#nd-burnbox', e => e.classList.contains('hidden')) && (await pb.evaluate(() => window.__mem['124:1'])) === 0, t5);
    /* 合格後又改了 trim 值 ⇒ 燒錄框收起、勾選清掉 */
    await pb.evaluate(() => window.__setMem({ '62:8400': 0 }));
    await pb.click('#nd-gpanel button[data-g="read"]'); await pb.waitForFunction(() => !window.NBD.S.busy);
    const can1 = await pb.$eval('#nd-burnbox', e => !e.classList.contains('hidden'));
    await pb.check('#nd-burn'); await pb.fill('#nd-code', 'B0'); await pb.$eval('#nd-code', e => e.dispatchEvent(new Event('change')));
    check(`${tag} K1 合格後改 trim 值 ⇒ 燒錄框收起、勾選清掉`, can1 && await pb.$eval('#nd-burnbox', e => e.classList.contains('hidden')) && !(await pb.$eval('#nd-burn', e => e.checked)));
    await pb.close();
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
    {
      let bad = [];
      for (const lg of ['zh-TW', 'en', 'zh-CN']) {
        await pn.selectOption('#lang-select', lg);
        for (const ic of ICS) for (const it of itemsFor(ic)) {
          await pn.selectOption('#nd-icsel', ic); await pn.selectOption('#nd-item', it);
          await pn.evaluate(() => { document.getElementById('nd-helpbox').open = true; });
          const t = await pn.evaluate(() => [document.getElementById('nd-help').innerText, !!document.getElementById('nd-probe')]);
          const first = (t[0].split('\n').map(x => x.trim()).filter(Boolean)[1] || '');
          if (t[1] || /^(量 |Probe )/.test(first) || /每行一個脈衝|one pulse per line|每行一个脉冲/.test(t[0])) bad.push(`${lg}/${ic}/${it}:${first.slice(0, 40)}`);
        }
      }
      check(`${tag} N 說明三語 × 每個 IC × 每個項目都沒有量測提示行`, bad.length === 0, bad.slice(0, 4).join(' | '));
    }
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
  /* B：v1.3.0 M-Bus → C-Bus 導通（期望值＝瑞鼎 UI MbusToCbus：slave 0x7E、1-byte offset 0xAB、寫 0xCD，獨立寫在這裡） */
  {
    const MB_WANT = ['w:7E:00AB:7:0:CD'];
    for (const ic of ICS) {
      await sel(page, 'nd-icsel', ic);
      const has = await page.$$eval('#nd-item option', o => o.some(x => x.value === 'mbus'));
      check(`${tag} B ${ic} ${ic.startsWith('E501') ? '沒有' : '有'} M-Bus 導通項目`, has === !ic.startsWith('E501'));
      if (!has) continue;
      await sel(page, 'nd-item', 'mbus');
      const k = await tableKeys(page);
      check(`${tag} B ${ic} 表格＝一筆 7E:AB←CD`, JSON.stringify(k) === JSON.stringify(MB_WANT), JSON.stringify(k));
      const gh = await page.$eval('#nd-gpios', e => e.parentNode.classList.contains('hidden') && e.querySelectorAll('select').length === 0);
      check(`${tag} B ${ic} 沒有輸出腳（GPIO 列隱藏）`, gh);
      const og = await page.$eval('#nd-item', s => s.selectedOptions[0].parentNode.label + '|' + s.selectedOptions[0].textContent);
      check(`${tag} B ${ic} 下拉獨立一組「M-Bus → C-Bus 導通」`, og === 'M-Bus → C-Bus 導通|M-Bus → C-Bus 導通', og);
      const row = await page.$eval('#nd-tbl tbody tr', t => ({ txt: t.innerText, dk: t.querySelectorAll('td.ds .dk').length, rbtn: !!t.querySelector('button[data-r]') }));
      check(`${tag} B ${ic} 列：slave 7E、0xAB、0xCD、整 byte 不先讀、三段說明、沒有「讀」鈕`, /7E/.test(row.txt) && /0xAB/.test(row.txt) && /0xCD/.test(row.txt) && (viewport.width < 600 ? /整個 byte 寫 0xCD（[^）]*不先讀/ : /整 byte 直接寫、不先讀/).test(row.txt) && row.dk === 3 && !row.rbtn, JSON.stringify(row));
      check(`${tag} B ${ic} 說明寫單向（M-Bus→C-Bus，C-Bus 不能連回）＋怎麼確認`, /單向/.test(row.txt) && /C-Bus 那邊不能連回 M-Bus/.test(row.txt) && (ic === 'EN01' ? /3E 0x207E/.test(row.txt) : /7D 0x007D/.test(row.txt)), row.txt.slice(0, 200));
      const wn = await page.$eval('#nd-warn', e => e.textContent);
      check(`${tag} B ${ic} 表上方警示寫單向`, /單向/.test(wn) && /MSCL／MSDA/.test(wn) && /CSCL／CSDA/.test(wn), wn);
      const hp = await page.$eval('#nd-help', e => e.textContent);
      check(`${tag} B ${ic} 說明區：指令、單向、E501 不顯示`, /0x7E/.test(hp) && /單向/.test(hp) && /E501A／E501B/.test(hp), hp.slice(0, 120));
      for (const [lg, re1, re2] of [['en', /One-way/, /cannot connect back to M-Bus/], ['zh-CN', /单向/, /C-Bus 那边不能连回 M-Bus/]]) {
        await page.selectOption('#lang-select', lg);
        const t2 = await page.$eval('#nd-tbl tbody tr', t => t.innerText + '|' + t.querySelectorAll('td.ds .dk').length);
        const w2 = await page.$eval('#nd-warn', e => e.textContent);
        const o2 = await page.$eval('#nd-item', s => s.selectedOptions[0] ? s.selectedOptions[0].textContent : '');
        check(`${tag} B ${ic} ${lg} 三段說明、單向、下拉名稱`, re1.test(t2) && re2.test(t2) && /\|3$/.test(t2) && re1.test(w2) && o2 === (lg === 'en' ? 'M-Bus → C-Bus connect' : 'M-Bus → C-Bus 导通'), t2.slice(0, 160) + ' / ' + o2);
      }
      await page.selectOption('#lang-select', 'zh-TW');
      /* 匯出 */
      const dx = await grab(page, '#nd-xlsx');
      check(`${tag} B ${ic} Excel 檔名`, new RegExp(`^NBDebug_${ic}_mbus_\\d{8}\\.xlsx$`).test(dx.name), dx.name);
      const xr = sheetRows(unzip(dx.buf)['xl/worksheets/sheet1.xml'].toString());
      check(`${tag} B ${ic} Excel 表頭＝WFG、一列 7E／1／0x0AB[7:0]／0xCD、描述寫單向`, JSON.stringify(xr[0]) === JSON.stringify(WFG_HEADER) && xr.length === 2 && xr[1][1] === 'MbusToCbus' && xr[1][2] === '0x7E' && xr[1][3] === 1 && xr[1][4] === '0x0AB[7:0]' && xr[1][6] === '0xCD' && /one-way/.test(xr[1][14]) && /單向/.test(xr[1][14]), JSON.stringify(xr[1]));
      const ds = await grab(page, '#nd-script'), st = ds.buf.toString('utf8');
      const code = st.split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
      check(`${tag} B ${ic} .script 檔名、ASCII、只有註解、寫明 ONE-WAY 與 7E:0xAB <- CD`, new RegExp(`^NBDebug_${ic}_mbus_\\d{8}\\.script$`).test(ds.name) && !/[^\x00-\x7F]/.test(st) && code.length === 0 && /ONE-WAY: M-Bus \(MSCL\/MSDA\) -> C-Bus \(CSCL\/CSDA\)/.test(st) && /\/\/ 7E:0xAB <- CD/.test(st) && /M-Bus -> C-Bus/.test(st), ds.name + ' ' + st.slice(0, 300));
      { const vh = findVerifLabels(st + JSON.stringify(xr)); check(`${tag} B ${ic} 匯出沒有驗證等級字樣`, vh.length === 0, vh.map(h => h.word).join(',')); }
    }
    /* 切回有輸出腳的項目：GPIO 列回來 */
    await sel(page, 'nd-icsel', 'EN01'); await sel(page, 'nd-item', 'mbus'); await sel(page, 'nd-item', 'rxde');
    check(`${tag} B 切回 RX DE ⇒ GPIO 列回來、表格正常`, await page.$eval('#nd-gpios', e => !e.parentNode.classList.contains('hidden') && !!e.querySelector('#nd-gpio')) && (await tableKeys(page)).length === 4);
    /* 搜尋 */
    await page.fill('#nd-q', 'M-Bus');
    const qo = await page.$$eval('#nd-item option', o => o.map(x => x.value));
    check(`${tag} B 搜尋「M-Bus」找得到`, qo.includes('mbus'), qo.join(','));
    await page.fill('#nd-q', ''); await page.dispatchEvent('#nd-q', 'input');
    /* 模擬 I2C：送出的位元組＝瑞鼎 UI 那一筆 */
    if (full) {
      for (const ic of ['EN01', 'E503']) {
        const pm = await ctx.newPage(); await pm.addInitScript(FAKE); await pm.goto(URL0); await pm.waitForFunction(() => window.NBD);
        pm.on('pageerror', e => errs.push('B ' + e));
        await pm.evaluate(m => window.__setMem(m), ID[ic]);
        await pm.click('#nd-link'); await pm.waitForFunction(() => !document.querySelector('#nd-run').disabled);
        check(`${tag} B I ${ic} 認到 ${ic}`, (await pm.$eval('#nd-icsel', s => s.value)) === ic);
        await pm.selectOption('#nd-item', 'mbus');
        await pm.evaluate(() => { window.__wlog.length = 0; window.__rlog = []; });
        await pm.click('#nd-run'); await pm.waitForFunction(() => /完成|fail|NACK/.test(document.querySelector('#nd-st').textContent));
        const wl = await pm.evaluate(() => window.__wlog), rl = await pm.evaluate(() => window.__rlog);
        check(`${tag} B I ${ic} I2C 執行＝一筆 [7E, AB, [CD]]（＝瑞鼎 UI）、不重複送`, JSON.stringify(wl) === JSON.stringify([[0x7E, 0xAB, [0xCD]]]), JSON.stringify(wl));
        check(`${tag} B I ${ic} 不讀 7E（只寫不讀）`, !rl.some(r => r[0] === 0x7E), JSON.stringify(rl));
        const rb = await pm.$eval('#nd-tbl td.nd-rb', e => e.textContent), stt = await pm.$eval('#nd-st', e => e.textContent);
        check(`${tag} B I ${ic} 讀回欄顯示已送出 ✓、狀態完成`, /已送出 ✓/.test(rb) && /完成/.test(stt), rb + ' / ' + stt);
        /* 單列「寫入」鈕也只送一筆 */
        await pm.evaluate(() => { window.__wlog.length = 0; });
        await pm.click('#nd-tbl button[data-w="0"]'); await pm.waitForFunction(() => window.__wlog.length > 0 && !document.querySelector('#nd-run').disabled);
        check(`${tag} B I ${ic} 單列「寫入」也只送一筆 7E:AB←CD`, JSON.stringify(await pm.evaluate(() => window.__wlog)) === JSON.stringify([[0x7E, 0xAB, [0xCD]]]));
        /* 7E 沒有回 ACK ⇒ 報錯、不說完成 */
        await pm.evaluate(() => { window.__nack = [0x7E]; window.__wlog.length = 0; });
        await pm.click('#nd-run'); await pm.waitForFunction(() => !document.querySelector('#nd-run').disabled && /fail|NACK|失敗/.test(document.querySelector('#nd-st').textContent));
        check(`${tag} B I ${ic} 7E NACK ⇒ 狀態報錯、不顯示完成`, !/完成/.test(await pm.$eval('#nd-st', e => e.textContent)));
        await pm.evaluate(() => { window.__nack = []; });
        await pm.close();
      }
    }
    /* EN01 Flash 規則（Bruce 2026-10-23「如果是 Flash 的話就不可以用這個導通方式，如果是 EEPROM 才可以」） */
    await sel(page, 'nd-icsel', 'E503'); await sel(page, 'nd-item', 'mbus');
    check(`${tag} B E503 沒有「ROM 類型」列、說明寫只有 EEPROM`, await page.$eval('#nd-romrow', e => e.classList.contains('hidden')) && /E503 只有 EEPROM/.test(await page.$eval('#nd-help', e => e.textContent)));
    await sel(page, 'nd-icsel', 'EN01'); await sel(page, 'nd-item', 'mbus');
    {
      const vis = await page.$eval('#nd-romrow', e => !e.classList.contains('hidden')), rv = await page.$eval('#nd-rom', s => [s.value, [...s.options].map(o => o.value).join(',')].join('|'));
      const wn = await page.$eval('#nd-warn', e => e.textContent), ds = await page.$eval('#nd-tbl tbody tr td.ds', e => e.innerText);
      check(`${tag} B EN01 有「ROM 類型」列（EEPROM 預設／Flash）、警示與說明寫 EEPROM 才可、Flash 不可`, vis && rv === 'eeprom|eeprom,flash' && /EEPROM 應用才可以用 M-Bus 導通 C-Bus/.test(wn) && /Flash 應用不可用/.test(wn) && /Flash 應用不可用此導通方式/.test(ds), rv + ' / ' + wn);
      /* v1.3.1（Bruce 2026-10-23「可以」：「儲存」改叫「ROM 類型」，同瑞鼎 UI）：三語標籤＋整頁不再出現「儲存／存储／Storage」 */
      for (const [lg, lab] of [['zh-TW', 'ROM 類型（EN01）'], ['en', 'ROM Type (EN01)'], ['zh-CN', 'ROM 类型（EN01）']]) {
        await page.selectOption('#lang-select', lg);
        const rl = await page.$eval('#nd-romrow .nd-fl', e => e.textContent), all = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[title],[aria-label]')].map(e => (e.title || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' '));
        const wn2 = await page.$eval('#nd-warn', e => e.textContent);
        check(`${tag} B EN01 ${lg} 標籤＝「${lab}」、整頁沒有「儲存／存储／Storage」`, rl === lab && !/儲存|存储|Storage/.test(all) && /ROM (類型|Type|类型)/.test(wn2), rl + ' / ' + (all.match(/.{0,20}(儲存|存储|Storage).{0,20}/) || [''])[0]);
      }
      await page.selectOption('#lang-select', 'zh-TW');
      check(`${tag} B EN01 下拉 aria-label＝ROM Type`, (await page.$eval('#nd-rom', e => e.getAttribute('aria-label'))) === 'ROM Type');
      await page.selectOption('#nd-rom', 'flash');
      check(`${tag} B EN01 選 Flash ⇒ 警示多一句已擋下（ROM 類型選 Flash）`, /已擋下：ROM 類型選 Flash/.test(await page.$eval('#nd-warn', e => e.textContent)));
      const sx = (await grab(page, '#nd-script')).buf.toString('utf8');
      check(`${tag} B EN01 .script 寫明 EEPROM only、Flash 不可`, /EN01: EEPROM application only\. Do NOT send this on a Flash application\./.test(sx));
      await page.selectOption('#nd-rom', 'eeprom');
    }
    if (full) {
      const pf = await ctx.newPage(); await pf.addInitScript(FAKE); await pf.goto(URL0); await pf.waitForFunction(() => window.NBD);
      pf.on('pageerror', e => errs.push('BF ' + e));
      await pf.evaluate(m => { window.__setMem(m); TconMbus.setRom('flash'); }, ID.EN01);
      await pf.click('#nd-link'); await pf.waitForFunction(() => !document.querySelector('#nd-run').disabled);
      check(`${tag} B F EN01＋Flash：連線辨認仍認到 EN01`, (await pf.$eval('#nd-icsel', s => s.value)) === 'EN01');
      await pf.selectOption('#nd-item', 'mbus');
      /* v1.2.2（Dispatch 定案 2026-10-23）：ROM 類型不影響共用連線與辨認；EN01＋Flash 只擋「M-Bus → C-Bus 導通」這一項本身。 */
      await pf.evaluate(() => { window.__wlog.length = 0; });
      await pf.click('#nd-run'); await pf.waitForFunction(() => !document.querySelector('#nd-run').disabled && /已擋下/.test(document.querySelector('#nd-st').textContent));
      let wl = await pf.evaluate(() => window.__wlog);
      check(`${tag} B F EN01＋Flash：按「M-Bus → C-Bus 導通」這一項被擋、一筆都沒寫、狀態寫 Flash 應用不可用`, wl.length === 0 && /Flash 應用不可用此導通方式/.test(await pf.$eval('#nd-st', e => e.textContent)), JSON.stringify(wl));
      await pf.selectOption('#nd-item', 'rxde');
      await pf.click('#nd-run'); await pf.waitForFunction(() => /完成|不符|fail/.test(document.querySelector('#nd-st').textContent));
      wl = await pf.evaluate(() => window.__wlog);
      check(`${tag} B F EN01＋Flash：其他項目（RX DE）照常下（ROM 類型不影響共用流程）`, wl.some(w => w[0] === 0x3E), JSON.stringify(wl.slice(-4)));
      await pf.selectOption('#nd-item', 'mbus'); await pf.selectOption('#nd-rom', 'eeprom');
      await pf.evaluate(() => { window.__wlog.length = 0; });
      await pf.click('#nd-run'); await pf.waitForFunction(() => /完成|fail/.test(document.querySelector('#nd-st').textContent));
      check(`${tag} B F EN01 改回 EEPROM ⇒ 下一筆 7E:AB←CD`, JSON.stringify(await pf.evaluate(() => window.__wlog)) === JSON.stringify([[0x7E, 0xAB, [0xCD]]]));
      check(`${tag} B F 設定全站共用（localStorage tcon.romType）`, (await pf.evaluate(() => localStorage.getItem('tcon.romType'))) === 'eeprom');
      await pf.close();
    }
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

/* P：v1.1.4 EN01 封裝腳對照（原廠 pin 腳分配表 EN01A1 Q5_QFN60_3.5x9 獨立抄一份）＋說明三語沒有量測提示 */
{
  const s = readFileSync(join(REPO, 'nbdebug.html'), 'utf8'); const G = JSON.parse(/var NBD_GPIO = (\{.*\});/.exec(s)[1]);
  const PIN = { GPIO_COLOR_EN: [1, 'CM_EN'], GPIO_04: [2, 'SOLC / GPIO6', 1], HPD: [11, 'HPD'], ROM_SPI_WP: [19, 'ROM_WP / SPI_WP'], GPIO_07: [23, 'GPIO7'], GPIO_08: [24, 'GPIO8'], GPIO_09: [25, 'GPIO9 / ENBKL'], GPIO_10: [26, 'GPIO10 / PWMO'], ENBKLT: [29, 'ENBKLT / CSCL'], PWMO: [30, 'PWMO / CSDA'], TP: [31, 'SDLOCK', 1], POL: [32, 'XSTB', 1], GPIO_STV: [53, 'STV'], GPIO_CPV: [54, 'CPV'], GPIO_OE: [55, 'OE'], GPIO_00: [56, 'GPIO0'], GPIO_01: [57, 'GPIO1'], GPIO_02: [58, 'SDLOCK', 1], GPIO_03: [59, 'GPIO3'], GPIO_DBC_EN: [60, 'CABC_EN'] };
  const gs = G.EN01.gpios; let ok = 0;
  for (const g of gs) { const e = PIN[g.id]; if (e && g.pin === 'pin ' + e[0] && g.pkg === e[1] && g.pst === 'ok' && !!g.diff === !!e[2]) ok++; else check(`P EN01 ${g.id} 封裝腳`, false, JSON.stringify(g)); }
  check(`P EN01 封裝腳 ${ok}/20 支與原廠 pin 腳分配表一致（含 GPIO_02＝pin 58 SDLOCK；腳名≠暫存器名 4 支）`, ok === 20 && gs.length === 20);
  check('P 沒有 nd.meas／nd.meas2／nd.pkgNo、沒有 #nd-probe', !/'nd\.meas2?'|'nd\.pkgNo'|nd-probe/.test(s));
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

/* K0：建議值演算法矩陣（純函式，從頁面原始碼抽出；用 OSC 模型代替示波器） */
{
  const src = readFileSync(join(REPO, 'nbdebug.html'), 'utf8');
  const grab = n => { const i = src.indexOf('  function ' + n + '('); if (i < 0) return ''; let d = 0; const j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };
  const consts = /var G_TARGET = [^;]*;/.exec(src);
  check('K0 頁面有 guideSuggest／gDir／常數', !!(grab('guideSuggest') && grab('gDir') && consts));
  const gs = new Function(consts[0] + grab('gDir') + grab('guideSuggest') + ';return guideSuggest;')();
  const T = 6.75;
  const run = (model, tol, start, noisy) => {
    const rounds = [], seen = new Set(); let code = start;
    for (let n = 1; n <= 16; n++) {
      const f = +model(code & 0x7F).toFixed(3); rounds.push({ code, f }); seen.add(code & 0x7F);
      const r = gs(rounds, T, tol);
      if (r.ok) return { ok: true, n };
      if (!/^(probe|interp|slope)$/.test(r.why)) return { ok: false, why: r.why, n };
      if (!(r.code & 0x80) || r.code > 0xFF) return { ok: false, why: 'badcode', n };
      if (seen.has(r.code & 0x7F)) return { ok: false, why: 'repeat', n };
      code = r.code;
    }
    return { ok: false, why: 'max', n: 16 };
  };
  let tot = 0, bad = 0, maxN = 0; const tally = {}, ex = [];
  const judge = (model, clean, tol, start, noisy, info) => {
    let reach = false; for (let d = 0; d < 128; d++) if (Math.abs(+clean(d).toFixed(3) - T) <= T * tol / 100 + 1e-9) reach = true;
    const inR = Math.min(clean(0), clean(127)) <= T && T <= Math.max(clean(0), clean(127));
    const r = run(model, tol, start, noisy); tot++; tally[r.ok ? 'ok' : r.why] = (tally[r.ok ? 'ok' : r.why] || 0) + 1; if (r.n > maxN) maxN = r.n;
    const good = noisy ? (r.ok || /^(edge|best|flat)$/.test(r.why)) : (reach ? r.ok : (!r.ok && r.why === (inR ? 'best' : 'edge')));
    if (!good) { bad++; if (ex.length < 5) ex.push(JSON.stringify(Object.assign({ reach, inR }, info, r))); }
  };
  /* 線性＋二次（單調、全程為正） */
  for (const sg of [1, -1]) for (const k0 of [0.001, 0.002, 0.004, 0.008, 0.015, 0.03]) for (const q of [0, 0.00003, -0.00003]) for (let c = -20.3; c <= 147; c += 1.37) for (const tol of [0.5, 1.5, 3]) for (const start of [0xAA, 0x80, 0xFF, 0xC0]) {
    const k = sg * k0, m = d => T * (1 + (d - c) * k + q * (d - c) * (d - c));
    let ok = true; for (let d = 0; d < 128; d++) { if (m(d) < 0.5) ok = false; if (d && Math.sign(m(d) - m(d - 1)) !== sg) ok = false; }
    if (ok) judge(m, m, tol, start, false, { sg, k0, q, c, tol, start });
  }
  /* 指數（陡斜率）＋量測雜訊 ±0.2% */
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const sg of [1, -1]) for (const k0 of [0.005, 0.01, 0.02, 0.03, 0.05]) for (let c = -10.4; c <= 137; c += 0.93) for (const tol of [0.5, 1.5]) for (const nz of [0, 0.002]) {
    const k = sg * k0, clean = d => T * Math.exp(k * (d - c)), m = d => clean(d) * (1 + (nz ? (rnd() - 0.5) * 2 * nz : 0));
    judge(m, clean, tol, 0xAA, !!nz, { sg, k0, c, tol, nz });
  }
  check(`K0 建議值矩陣 ${tot} 組：可達一定合格、不可達停在 best／edge、不重複、bit7＝1（最多 ${maxN} 輪；${JSON.stringify(tally)}）`, bad === 0 && tot > 30000 && maxN <= 12, ex.join(' | '));
  /* 個案：只量一點 ⇒ 先試 +0x10；0x7F 附近改 -0x10；同一個 code 頻率都一樣 ⇒ flat */
  const one = gs([{ code: 0xAA, f: 6.0 }], T, 1.5), top = gs([{ code: 0xFA, f: 6.0 }], T, 1.5), flat = gs([{ code: 0xAA, f: 6.0 }, { code: 0xBA, f: 6.0 }], T, 1.5);
  check('K0 第一點不合格 ⇒ 先試 +0x10（0xAA→0xBA）', one.why === 'probe' && one.code === 0xBA, JSON.stringify(one));
  check('K0 第一點在 0x7A 以上 ⇒ 改試 -0x10', top.why === 'probe' && top.code === 0xEA, JSON.stringify(top));
  check('K0 改了 code 頻率不變 ⇒ flat（不建議燒錄）', flat.why === 'flat' && !flat.ok, JSON.stringify(flat));
  check('K0 剛好在容許邊界 ±1.5% 算合格', gs([{ code: 0xAA, f: +(T * 1.015).toFixed(6) }], T, 1.5).ok && !gs([{ code: 0xAA, f: +(T * 1.0151).toFixed(6) }], T, 1.5).ok);
}

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
