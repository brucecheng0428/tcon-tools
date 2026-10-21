#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   WFG v4.58.0 自測：NB 匯出可選 .xlsx（預設）或 .script
   ───────────────────────────────────────────────────────────────────────
   Bruce 2026-10-21：NB T-Con（含 E503）匯出 script 時多一個選項，Excel 或 .script
   （EN01 的 UI 也支援 Monitor 的 .script）。
   做法：127.0.0.1 靜態伺服器 ×2（改前 WFG_BASE_ROOT／改後本 repo）＋ 自有暫存 profile 的
   headless Chrome（CDP），全部呼叫**產品本身**的函式。
     A  改前改後逐位元：同一組（seed 固定的）訊號設定，7 顆型號的既有匯出
        （NB .xlsx bytes、MNT .script 文字）改前＝改後（只遮掉時間戳與版號那兩行）。
     B  NB .script 語意＝.xlsx：用**獨立**的套用器把 xlsx 的列（Offset 字串 MSB-first 拆段）
        與 .script 的 write -m 各自套到全 0 記憶體，結果逐 byte 相同。
     C  .script 語法照 RCP2 `ScriptParser.Parse()`（WPF repo，JS 逐條移植）：每一行可解析、
        純 ASCII、單 byte 值／遮罩、位址 1~8 hex。
     D  位址落在 `.model` 的 RegAddr 上、遮罩不超出該 byte 已定義的位元（＝RCP2 Register 模式
        不會 Not Found）。WFG_NB_MODEL_DIR 指 RCP2 ModelFiles（另 WFG_NB_MODEL_E501A 指 RM81010）。
     E  格式與 Monitor 範例相同：都用 `write -m AAAA VV MM    // note`、`// -- X --` 分段、行尾 \n。
     U  畫面：按匯出 → NB 框出現「檔案類型」預設 .xlsx；選 .script 後下載 .script；
        MNT 框沒有這一項、下載仍是 .script（與改前同）；375px 寬度截圖、選單可操作。
     R  真檔（選用，本機不進版控）：WFG_NB_CODES='{"e503":"/path", ...}' 匯入後把 DCLK +1，
        讓 DCLK／PANEL_MODE 列也進來，再跑 A(改前改後)＋B＋C＋D。
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.WFG_BASE_ROOT || '';
const SHOT = process.env.WFG_SHOT_DIR || '';
const MODEL_DIR = process.env.WFG_NB_MODEL_DIR || '';
const MODEL_E501A = process.env.WFG_NB_MODEL_E501A || '';
const CODES = process.env.WFG_NB_CODES ? JSON.parse(process.env.WFG_NB_CODES) : {};
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : '  ' + detail}`);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
async function serve(root) {
  const srv = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/__code/')) {
        const k = decodeURIComponent(url.pathname.slice(8));
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(await readFile(CODES[k]));
      }
      const p = normalize(join(root, decodeURIComponent(url.pathname)));
      if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
      let buf = await readFile(p);
      if (p === join(root, 'wfg.html')) {
        const s = buf.toString('utf8'), i = s.lastIndexOf('})();', s.lastIndexOf('</script>'));
        if (i < 0) throw new Error('找不到主 IIFE 收尾');
        buf = Buffer.from(s.slice(0, i) + 'window.__wfgEval = function(__s){ return eval(__s); };\n' + s.slice(i), 'utf8');
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, origin: `http://127.0.0.1:${srv.address().port}` };
}

const NEW = await serve(REPO);
const OLD = BASE ? await serve(resolve(BASE)) : null;
const port = 9300 + Math.floor(Math.random() * 600);
const prof = await mkdtemp(join(tmpdir(), 'wfg-nbscript-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1700,1000', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { } await sleep(200); }
if (!targets) { console.error('🛑 Chrome 起不來'); process.exit(2); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const exc = []; const dialogs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
  if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error('evaluate 例外：' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const evIn = code => ev(`window.__wfgEval(${JSON.stringify(code)})`);
await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function open(origin, w = 1700, h = 1000) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: `${origin}/wfg.html#wfg` });
  for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
  await sleep(1500);
}

const KEYS = ['e503', 'e501a', 'e501b', 'en01', 'em01', 'em02', 'e512'];
const NB = ['e503', 'e501a', 'e501b', 'en01'];
/* 在頁面裡用固定 seed 設定 18 條訊號 ＋ frame 欄位（兩個頁面完全相同的一段程式）。 */
const SETUP = seed => `(function(){
  var s = ${seed} >>> 0; function R(n){ s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) % n; }
  for (var i = 0; i < wfgGpios.length; i++) { var g = wfgGpios[i]; if (!g) continue;
    g.enable = R(4) !== 0; g.toggle = !!R(2); g.f_st_sel = !!R(2); g.inv = !!R(2);
    g.tg_ini_val = R(4); g.ini_val = R(4); g.act_type = R(64); g.r_ph = R(64); g.f_ph = R(64);
    g.st_line = R(${seed % 3 === 0 ? 70000 : 16384}); g.sp_line = R(16384); g.r_dly = R(65536); g.f_dly = R(65536);
    g.r_dly_2 = R(65536); g.f_dly_2 = R(65536); g.oax_mode = R(4); g.oax_sel = R(18); }
  wfgFrame.gateType = R(2) ? 'dual' : 'single';
  wfgFrame.frm_no_0 = R(4096); wfgFrame.frm_no_1 = R(4096); wfgFrame.frm_no_2 = R(4096);
  wfgFirstLineRead = R(12);
  return true; })()`;
const norm = t => String(t).replace(/^\/\/ \d{4}-\d\d-\d\dT[\d:.]+Z$/m, '// <time>').replace(/^\/\/ WFG v[\d.]+ /m, '// WFG <ver> ');
const COLLECT = (alt) => `(function(){
  var keys = ${JSON.stringify(KEYS)}, o = {};
  for (var k = 0; k < keys.length; k++) { var c = WFG_TCON_CODECS[keys[k]], r;
    try { r = c.buildExport({ onlyChanged: false, comments: true }); } catch (e) { r = { ok: false, reason: 'throw ' + e.message }; }
    var x = { ok: !!(r && r.ok), reason: r && r.reason };
    if (r && r.bytes) x.bytes = Array.from(r.bytes).join(',');
    if (r && r.text) x.text = r.text;
    if (r && r.rows) x.rows = r.rows.slice(1).map(function(w){ return [w[1], w[4], w[6]]; });
    if (${alt} && c.buildExportAlt) { var a = c.buildExportAlt({ onlyChanged: false, comments: true });
      x.alt = { ok: a.ok, reason: a.reason, text: a.text, count: a.count }; }
    o[keys[k]] = x; }
  return o; })()`;

/* ── 獨立的套用器（不用產品的程式）── */
function applyRows(rows) {
  const mem = new Map();
  for (const [item, off, valS] of rows) {
    const segs = String(off).split(',').map(x => /0x([0-9A-F]+)\[(\d+)(?::(\d+))?\]/i.exec(x.trim()));
    let v = BigInt(parseInt(String(valS).replace(/^0x/i, ''), 16));
    for (let i = segs.length - 1; i >= 0; i--) {
      const a = parseInt(segs[i][1], 16), msb = +segs[i][2], lsb = segs[i][3] === undefined ? msb : +segs[i][3];
      const w = msb - lsb + 1, part = Number(v & ((1n << BigInt(w)) - 1n)); v >>= BigInt(w);
      const mask = (((1 << w) - 1) << lsb) & 0xFF, old = mem.get(a) || 0;
      mem.set(a, (old & ~mask) | ((part << lsb) & mask));
    }
  }
  return mem;
}
/* RCP2 ScriptParser.Parse() 的 JS 移植（Raydium.Wpf.Common/Helpers/Scripting/ScriptParser.cs）。 */
function rcp2Parse(text) {
  const items = []; let ln = 0;
  for (const raw of text.split(/\r?\n/)) {
    ln++; let line = raw; const ci = line.indexOf('//'); if (ci >= 0) line = line.slice(0, ci);
    const code = line.trim(); if (!code) continue;
    const t = code.split(/[ \t]+/), it = { ln, raw };
    const verb = t[0].toLowerCase();
    if (verb !== 'write') { it.err = 'verb ' + t[0]; items.push(it); continue; }
    const flag = (t[1] || '').toLowerCase();
    if (flag !== '-m' && flag !== '-n') { it.err = 'flag'; items.push(it); continue; }
    const n = flag === '-m' ? 5 : 4;
    if (t.length !== n) { it.err = 'token count ' + t.length; items.push(it); continue; }
    if (!/^[0-9A-Fa-f]{1,8}$/.test(t[2])) { it.err = 'addr'; items.push(it); continue; }
    const hb = s => (s.length && s.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(s)) ? s.match(/../g).map(h => parseInt(h, 16)) : null;
    const vals = hb(t[3]), masks = flag === '-m' ? hb(t[4]) : null;
    if (!vals || (flag === '-m' && (!masks || masks.length !== vals.length))) { it.err = 'value/mask'; items.push(it); continue; }
    Object.assign(it, { addr: parseInt(t[2], 16), vals, masks }); items.push(it);
  }
  return items;
}
function applyScript(items) {
  const mem = new Map();
  for (const it of items) for (let i = 0; i < it.vals.length; i++) {
    const a = it.addr + i, old = mem.get(a) || 0, m = it.masks ? it.masks[i] : 0xFF;
    mem.set(a, (old & ~m) | (it.vals[i] & m));
  }
  return mem;
}
const touchedMask = items => { const t = new Map(); for (const it of items) t.set(it.addr, (t.get(it.addr) || 0) | (it.masks ? it.masks[0] : 0xFF)); return t; };
function sameMem(a, b, touched) {
  for (const [addr] of touched) if ((a.get(addr) || 0) !== (b.get(addr) || 0)) return `0x${addr.toString(16)}: xlsx ${a.get(addr)} vs script ${b.get(addr)}`;
  for (const [addr, v] of a) if (!touched.has(addr) && v) return `xlsx wrote 0x${addr.toString(16)} not in script`;
  return '';
}
/* .model：RegAddrN/RegMsbN/RegBitsN ⇒ addr → 已定義位元遮罩 */
function loadModel(path) {
  if (!path || !existsSync(path)) return null;
  const txt = readFileSync(path, 'latin1'), map = new Map();
  for (const blk of txt.split(/\n\s*\[/)) {
    const g = (k) => { const m = new RegExp('^\\s*' + k + '\\s*=\\s*(\\S+)', 'mi').exec(blk); return m ? m[1] : null; };
    for (let n = 0; n < 8; n++) {
      const a = g('RegAddr' + n); if (!a) continue;
      const msb = +g('RegMsb' + n), bits = +g('RegBits' + n);
      const addr = parseInt(a, a.toLowerCase().startsWith('0x') ? 16 : 10);
      if (!isFinite(addr) || !(bits > 0)) continue;
      const lsb = msb - bits + 1, mask = (((1 << bits) - 1) << lsb) & 0xFF;
      map.set(addr, (map.get(addr) || 0) | mask);
    }
  }
  return map;
}
const MODELS = MODEL_DIR ? {
  e503: loadModel(join(MODEL_DIR, 'RM8100x_for_FAE_20240925_20250311.model')),
  e501b: loadModel(join(MODEL_DIR, 'RM81011_for_FAE_20231025_20240509.model')),
  e501a: loadModel(MODEL_E501A),
  en01: loadModel(join(MODEL_DIR, 'RM81008.model'))
} : {};

function verifyNb(tag, key, x) {
  check(`${tag} ${key} .script ok`, x.alt && x.alt.ok, x.alt && x.alt.reason);
  if (!x.alt || !x.alt.ok) return;
  const text = x.alt.text;
  check(`${tag} ${key} .script 純 ASCII`, /^[\x00-\x7F]*$/.test(text));
  const items = rcp2Parse(text), errs = items.filter(i => i.err);
  check(`${tag} ${key} RCP2 ScriptParser 每行可解析（${items.length} 行）`, items.length > 0 && !errs.length, errs.slice(0, 3).map(e => e.ln + ':' + e.err).join(' '));
  check(`${tag} ${key} 全部單 byte write -m、位址 4 位 hex`, items.every(i => i.masks && i.vals.length === 1 && /^write -m [0-9A-F]{4} [0-9A-F]{2} [0-9A-F]{2}/.test(i.raw)));
  check(`${tag} ${key} count＝write 行數`, x.alt.count === items.length, `${x.alt.count} vs ${items.length}`);
  const d = sameMem(applyRows(x.rows), applyScript(items), touchedMask(items));
  check(`${tag} ${key} .script 套用結果＝.xlsx 套用結果（逐 byte）`, !d, d);
  const M = MODELS[key];
  if (M) {
    /* RCP2 的 RegisterDictionary 是依 IC 的 ROM↔Register 區段**連續**配 RegAddr（RomCodeInfo.TaskSetRegisterData），
       不是只有 .model 有定義欄位的 byte ⇒ Not Found 的判準是「落在暫存器區段內」。
       另外對 GPO／frame 列做更嚴的檢查：位元必須是 .model 有定義的欄位。
       DCLK 反寫列（GBPLL_／AGBS_／FR_DCLK／DCLK_AUTO／N_PRE／N_PSDIV／N_PRETX／EN_SDM／P／INI_M／DELTA_M）出自官方 RomCodeProcessUI.py，FAE .model 不一定列出，只做區段檢查。 */
    const addrs = [...M.keys()], lo = Math.min(...addrs), hi = Math.max(...addrs);
    const out = items.filter(i => i.addr < lo || i.addr > hi);
    check(`${tag} ${key} 位址都在 .model 暫存器區段 0x${lo.toString(16)}~0x${hi.toString(16)}（Register 模式不會 Not Found）`, !out.length, out.slice(0, 3).map(i => i.raw).join(' | '));
    const strict = items.filter(i => !/\/\/ (GBPLL_|AGBS_|FR_DCLK|DCLK_AUTO|N_PRE|N_PSDIV|N_PRETX|EN_SDM|INI_M|DELTA_M|P = )/.test(i.raw));
    const bad = strict.filter(i => !M.has(i.addr) || (i.masks[0] & ~M.get(i.addr)));
    check(`${tag} ${key} GPO／frame 列（${strict.length}）的位址與位元都是 .model 定義的欄位`, !bad.length, bad.slice(0, 3).map(i => i.raw).join(' | '));
  }
}

const out = {};
async function collect(origin, label, seeds) {
  await open(origin);
  const res = {};
  for (const sd of seeds) { await evIn(SETUP(sd)); res['seed' + sd] = await evIn(COLLECT(label === 'new')); }
  for (const k of Object.keys(CODES)) {
    const r = await evIn(`(async function(){
      var buf = new Uint8Array(await (await fetch('/__code/${k}')).arrayBuffer());
      wfgCodeOnTconChange('${k}'); if (typeof wfgSyncTconSelects === 'function') wfgSyncTconSelects();
      var c = WFG_TCON_CODECS['${k}'], img = c.parseCode(buf, ${JSON.stringify('real_' + k + extname(CODES[k]))});
      if (!img || !img.ok) return { err: (img && img.reason) || 'parse fail' };
      wfgCodeApplyToWfg(img);
      var d0 = wfgFrame.dclk; if (isFinite(d0) && d0 > 0) wfgFrame.dclk = d0 + 1;
      return { ok: true, dclk0: d0 };
    })()`);
    if (r && r.err) { res['real_' + k] = { err: r.err }; continue; }
    res['real_' + k] = await evIn(COLLECT(label === 'new'));
  }
  return res;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
console.log(`改後：${REPO}${OLD ? `\n改前：${BASE}` : '\n（未給 WFG_BASE_ROOT，略過改前改後比對）'}`);
out.new = await collect(NEW.origin, 'new', SEEDS);
if (OLD) out.old = await collect(OLD.origin, 'old', SEEDS);

for (const sc of Object.keys(out.new)) {
  const N = out.new[sc];
  if (N.err) { check(`${sc} 真檔匯入`, false, N.err); continue; }
  for (const k of KEYS) {
    if (!N[k]) continue;
    if (OLD && out.old[sc] && out.old[sc][k]) {
      const O = out.old[sc][k];
      if (N[k].bytes || O.bytes) check(`A ${sc} ${k} .xlsx 改前＝改後（逐位元，${(N[k].bytes || '').split(',').length} bytes）`, N[k].bytes === O.bytes && N[k].ok === O.ok);
      else check(`A ${sc} ${k} ${N[k].ok ? '.script' : '(錯誤訊息)'} 改前＝改後`, norm(N[k].text || N[k].reason) === norm(O.text || O.reason) && N[k].ok === O.ok);
    }
    if (NB.includes(k) && N[k].ok) verifyNb(`B-D ${sc}`, k, N[k]);
    if (!NB.includes(k)) check(`${sc} ${k} MNT 沒有替代格式`, !N[k].alt);
  }
}

/* E：格式對照 Monitor 範例（同一組設定下的 EM02 .script） */
{
  const em = out.new.seed1.em02.text, nb = out.new.seed1.e503.alt.text;
  const shape = t => t.split('\n').filter(l => l.startsWith('write')).every(l => /^write -m [0-9A-F]{4} [0-9A-F]{2} [0-9A-F]{2}(    \/\/ .+)?$/.test(l));
  check('E Monitor 範例與 NB .script 的 write 行格式相同（write -m AAAA VV MM    // note）', shape(em) && shape(nb));
  check('E 兩者都以 // WFG 標頭起始、// -- X -- 分段、檔尾換行', /^\/\/ WFG /.test(em) && /^\/\/ WFG /.test(nb) && /\n\/\/ -- XSTB/.test(nb) && /\n\/\/ -- FRAME --/.test(nb) && em.endsWith('\n') && nb.endsWith('\n'));
  if (SHOT) { mkdirSync(SHOT, { recursive: true }); writeFileSync(join(SHOT, 'sample_E503_seed1.script'), nb); writeFileSync(join(SHOT, 'sample_EM02_seed1.script'), em); }
}

/* U：畫面流程（改後頁），攔下載 */
async function uiRun(w, h, key, pickScript, shotName) {
  await open(NEW.origin, w, h);
  await evIn(SETUP(5));
  await evIn(`wfgCodeOnTconChange('${key}'); if (typeof wfgSyncTconSelects==='function') wfgSyncTconSelects(); true`);
  await ev(`(function(){ window.__dl = []; var oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ if (this.download) { var a = this; window.__dl.push({ name: a.download, href: a.href }); return; } return oc.apply(this, arguments); };
    var ou = URL.createObjectURL; window.__blobs = {}; URL.createObjectURL = function(b){ var u = ou.call(URL, b); window.__blobs[u] = b; return u; };
    URL.revokeObjectURL = function(){}; return true; })()`);
  await ev(`wfgCodeExport(); true`);
  await sleep(300);
  const st = await ev(`(function(){ var f = document.getElementById('wfg-exp-fmt'); var m = document.getElementById('wfg-exp-mask');
    return { shown: !m.classList.contains('hidden'), hasFmt: !!f, fmt: f ? f.value : null, opts: f ? Array.from(f.options).map(o=>o.textContent) : [],
             fmtRect: f ? (function(r){ return [r.left, r.right, r.width]; })(f.getBoundingClientRect()) : null, vw: innerWidth,
             okRect: (function(r){ return [r.left, r.right, r.top, r.bottom]; })(document.getElementById('wfg-exp-ok').getBoundingClientRect()) }; })()`);
  if (pickScript) {
    await ev(`(function(){ var f = document.getElementById('wfg-exp-fmt'); f.value = 'script'; f.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }
  if (shotName && SHOT) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOT, shotName), Buffer.from(s.result.data, 'base64'));
  }
  dialogs.length = 0;
  await ev(`document.getElementById('wfg-exp-ok').click(); true`);
  await sleep(500);
  const dl = await ev(`(async function(){ var d = window.__dl[0]; if (!d) return null; var b = window.__blobs[d.href];
    var ab = new Uint8Array(await b.arrayBuffer()); return { name: d.name, size: ab.length, type: b.type, head: Array.from(ab.slice(0, 4)), text: b.type.indexOf('text') === 0 ? new TextDecoder().decode(ab) : '' }; })()`);
  return { st, dl, dialogs: dialogs.slice() };
}
for (const key of ['e503', 'en01', 'e501b']) {
  const a = await uiRun(1700, 1000, key, false, key === 'e503' ? 'ui_e503_default.png' : '');
  check(`U ${key} 匯出框出現「檔案類型」且預設 xlsx`, a.st.shown && a.st.hasFmt && a.st.fmt === 'xlsx', JSON.stringify(a.st));
  check(`U ${key} 預設下載 .xlsx（PK zip）`, a.dl && /\.xlsx$/.test(a.dl.name) && a.dl.head[0] === 0x50 && a.dl.head[1] === 0x4B, JSON.stringify(a.dl && { n: a.dl.name, h: a.dl.head }));
  check(`U ${key} xlsx 匯出後提示仍是 Code Check 流程`, a.dialogs.some(d => /Import CheckList/.test(d)));
  const b = await uiRun(1700, 1000, key, true, key === 'e503' ? 'ui_e503_script.png' : '');
  check(`U ${key} 選 .script 後下載 .script（text）`, b.dl && /\.script$/.test(b.dl.name) && /^text\/plain/.test(b.dl.type) && /\nwrite -m /.test(b.dl.text), JSON.stringify(b.dl && { n: b.dl.name, t: b.dl.type }));
  check(`U ${key} .script 匯出後提示 Script 分頁／Register`, b.dialogs.some(d => /Script/.test(d) && /Register/.test(d)));
  if (b.dl && SHOT) writeFileSync(join(SHOT, 'ui_' + b.dl.name), b.dl.text);
  if (b.dl) { const items = rcp2Parse(b.dl.text); check(`U ${key} 下載的 .script RCP2 解析 0 錯誤（${items.length} 行）`, items.length && !items.some(i => i.err)); }
}
{
  const m = await uiRun(1700, 1000, 'em01', false, 'ui_em01.png');
  check('U EM01（MNT）匯出框沒有「檔案類型」', m.st.shown && !m.st.hasFmt);
  check('U EM01（MNT）下載仍是 .script', m.dl && /\.script$/.test(m.dl.name) && /\nwrite -m /.test(m.dl.text));
}
{
  const p = await uiRun(375, 760, 'e503', true, 'ui_e503_375.png');
  check('U 375px：檔案類型選單在畫面內', p.st.hasFmt && p.st.fmtRect[0] >= 0 && p.st.fmtRect[1] <= p.st.vw, JSON.stringify(p.st.fmtRect) + ' vw ' + p.st.vw);
  check('U 375px：確定鈕在畫面內', p.st.okRect[0] >= 0 && p.st.okRect[1] <= p.st.vw, JSON.stringify(p.st.okRect));
  check('U 375px：選 .script 後下載 .script', p.dl && /\.script$/.test(p.dl.name));
}
check('頁面沒有未捕捉例外', !exc.length, exc.slice(0, 3).join(' | '));
console.log(`\n${pass} pass / ${fail} fail`);
ws.close(); chrome.kill(); NEW.srv.close(); OLD && OLD.srv.close();
process.exit(fail ? 1 : 0);
