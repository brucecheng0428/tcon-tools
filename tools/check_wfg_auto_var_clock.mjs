#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   WFG v4.54.0 自測：匯入 MNT code 時依 TX 輸出介面自動選「定頻／變頻應用」
   ───────────────────────────────────────────────────────────────────────
   Bruce 2026-10-06：「只要是遇到 EM02 匯入的 code，或者是 E512，使用的是 Mini-LVDS 輸出的，
   匯入 code 時都是自動要選擇到變頻應用（但也都可以再手動更改）。」
   同日補充：EM01 有 iSP／mini-LVDS 兩種，依 code 內 System→TX 的設定判斷；手動更改後
   「匯出的 script 不可以改到這個 Tx 的設定」。

   做法：127.0.0.1 靜態伺服器 ＋ 自有暫存 profile 的 headless Chrome（CDP），打開 repo 的
   wfg.html，走**與按鈕相同的匯入路徑**：型號確認框 → 檔案選擇（CDP 攔截後塞檔）→ 解析 →
   `wfgCodeApplyToWfg()` → 匯入卡片。檢查：
     A  E512（合成，rt7 0x0480 bit0＝1 與＝0 各一份）→ 一律變頻（晶片只有 mini-LVDS）
     B  EM01 Flash（合成）：TX type mini-LVDS → 變頻；iSP → 定頻；兩個設定不一致 → 不動＋未確認
     C  EM02（判斷規則，套同一份解析結果）→ 變頻
     D  其他型號（E503）→ 不動
     E  自動選後手動改 → 換機種來回、改 Frame Rate、重新整理都保留；再匯入才重新判斷
     X  手動切換型態後匯出 script：與切換前逐字相同（時間戳記那行除外）、沒有任何一行寫到
        TX 相關分區；EM01 Flash 把 script 套回匯入的映像，TX 分區逐位元組與匯入時相同
     R  真檔（選用）：WFG_AUTOCLK_REAL="<目錄>:<目錄>…" 底下的 .bin，依序試 E512／EM02／EM01
        解析器，成功的逐份走完整匯入並核對；EM01 另做 X 的逐位元組比對。
        真檔是客戶資料，**不進版控**，只在本機跑。

   用法：node tools/check_wfg_auto_var_clock.mjs
         CHROME=<Chrome 執行檔>（預設 macOS Google Chrome）
         WFG_AUTOCLK_REPORT=<json 路徑>（選用，輸出結果）
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const lines = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  const s = `${ok ? '✓' : '✗'} ${name}${ok ? '' : `  得到 ${JSON.stringify(got)}，應為 ${JSON.stringify(want)}`}`;
  lines.push(s); console.log(s);
}

/* ── 合成 E512 映像（結構照 wfgGpoDecodeAt／wfgE512Frame 讀的位置寫；不含任何客戶資料）──
   GPO 數值取自 tools/check_em01_code_import.js 的 buildE512()（原廠預設 EEPROM 映像的值）。 */
function buildE512(mlvds) {
  const B1 = 0x03D7, B2 = 0x04A5, b = new Uint8Array(4096);
  const ha = 1920, va = 1080, hb = 280, vb = 90;
  b[2] = ha & 0xFF; b[3] = ((ha >> 8) & 0x0F) | ((va & 0x0F) << 4); b[4] = (va >> 4) & 0xFF;
  b[5] = hb & 0xFF; b[6] = ((hb >> 8) & 0x0F) | ((vb & 0x0F) << 4); b[7] = (vb >> 4) & 0xFF;
  const sigs = {
    0: { en: 1, st: 8, sp: 16383, rd: 1936, fd: 1984 }, 1: { en: 1, tg: 1, st: 2176, sp: 2176 },
    2: { en: 1, st: 9, sp: 9, rd: 960, fd: 960 }, 4: { en: 1, st: 9, sp: 16383, rd: 1920, fd: 1952 },
    5: { en: 1, st: 9, sp: 2168, rd: 1984, fd: 3968 }, 6: { en: 1, st: 9, sp: 2168, rd: 3840, fd: 4096 }
  };
  for (let i = 0; i < 18; i++) {
    const o = i === 0 ? B1 + 0xA0 : i === 1 ? B1 + 0xB0 : B2 + 16 * (i - 2), c = sigs[i] || {};
    b[o] = ((c.en || 0) << 7) | ((c.tg ? 1 : 0) << 6);
    const st = c.st || 0, sp = c.sp || 0, rd = c.rd || 0, fd = c.fd || 0;
    b[o + 4] = st & 0xFF; b[o + 5] = (st >> 8) & 0x3F; b[o + 6] = sp & 0xFF; b[o + 7] = (sp >> 8) & 0x3F;
    b[o + 8] = rd & 0xFF; b[o + 9] = rd >> 8; b[o + 10] = fd & 0xFF; b[o + 11] = fd >> 8;
  }
  b[0x035E] = mlvds ? 0x01 : 0x00;   // rt7 reg_isp_mlvds_sel（regAddr 0x0480 bit0；E512 不用它判）
  return b;
}
/* 合成 EM01 Flash 映像（平坦：fileOff ＝ regAddr）。結構照 tools/check_em01_code_import.js 的 buildImage()。
   tx：'mlvds' → 0x0F00[6:4]=0、0x0400[0]=1；'isp' → 1／0；'mismatch' → 0／0。 */
function buildEm01(tx) {
  const b = new Uint8Array(262144), B1 = 0x0500, B2 = 0x0600;
  const ha = 1920, va = 1080, hb = 465, vb = 20;
  b[0x13] = ha & 0xFF; b[0x14] = ((ha >> 8) & 0x0F) | ((va & 0x0F) << 4); b[0x15] = (va >> 4) & 0xFF;
  b[0x16] = hb & 0xFF; b[0x17] = ((hb >> 8) & 0x0F) | ((vb & 0x0F) << 4); b[0x18] = (vb >> 4) & 0xFF;
  for (let i = 0; i < 18; i++) {
    const o = i === 0 ? B1 + 0xA0 : i === 1 ? B1 + 0xB0 : B2 + 16 * (i - 2);
    b[o] = (i < 8 ? 1 : 0) << 7;
    const st = 5, sp = 1090, rd = 1050, fd = 1110;
    b[o + 4] = st & 0xFF; b[o + 5] = st >> 8; b[o + 6] = sp & 0xFF; b[o + 7] = sp >> 8;
    b[o + 8] = rd & 0xFF; b[o + 9] = rd >> 8; b[o + 10] = fd & 0xFF; b[o + 11] = fd >> 8;
    b[o + 12] = b[o + 8]; b[o + 13] = b[o + 9]; b[o + 14] = b[o + 10]; b[o + 15] = b[o + 11];
  }
  // TX 分區填一些非零的「別的設定」，用來驗證匯出不會動到它們
  for (let a = 0x0F01; a < 0x0F80; a++) b[a] = (a * 7) & 0xFF;
  for (let a = 0x0401; a < 0x0480; a++) b[a] = (a * 5) & 0xFF;
  const type = tx === 'isp' ? 1 : 0, sel = tx === 'mlvds' ? 1 : 0;
  b[0x0F00] = 0x83 | (type << 4);                    // bit7／bit[1:0] 也放值，確認只看 [6:4]
  b[0x0400] = 0xE6 | sel;                            // 其他位元非零，確認只看 bit0
  return b;
}

/* ── 伺服器 ＋ Chrome ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer(async (req, res) => {
  try {
    let p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const port = 9300 + Math.floor(Math.random() * 600);
const prof = await mkdtemp(join(tmpdir(), 'wfg-autoclk-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { } await sleep(200); }
if (!targets) { console.error('🛑 Chrome 起不來'); process.exit(2); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const exc = []; let chooser = null;
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  if (m.method === 'Page.fileChooserOpened') chooser = m.params;
  if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error('evaluate 例外：' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.setInterceptFileChooserDialog', { enabled: true });

async function load() {
  await send('Page.navigate', { url: `${ORIGIN}/wfg.html` });
  for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
  await sleep(1500);
}
const STATE = `(()=>{const r=[...document.querySelectorAll('input[name="wfg-dclk-mode"]')].find(x=>x.checked);
  const nt=document.getElementById('wfg-ack-notice');
  const F=JSON.parse(wfgExportConfig()).frame;   // wfgFrame 在頁面的 IIFE 內，透過既有的匯出設定讀
  return {model:wfgTconKey(), mode:F.dclkMode, user:F.dclkModeUser, radio:r?r.value:null,
          txEqRx: Math.abs(F.dclk-F.rxDclk)<1e-9,
          notice: nt && nt.style.display!=='none' ? nt.textContent : ''}})()`;
const TMP = join(prof, 'bins'); mkdirSync(TMP, { recursive: true });

/* 走按鈕路徑匯入一份檔：選型號 → 確認 → 檔案選擇 → 等匯入卡片出現 → 讀狀態 → 關卡片 */
async function importFile(model, file) {
  await ev(`typeof wfgAckClose==='function' && wfgAckClose(); var _n=document.getElementById('wfg-ack-notice'); if(_n){_n.textContent='';_n.style.display='none'} 0`);
  await ev(`wfgImpShow(); wfgImpPick(${JSON.stringify(model)}); 0`);
  chooser = null;
  await ev('wfgImpConfirm(); 0');
  for (let i = 0; i < 50 && !chooser; i++) await sleep(100);
  if (!chooser) throw new Error('檔案選擇視窗沒有開（' + model + '）');
  await send('DOM.setFileInputFiles', { files: [file], backendNodeId: chooser.backendNodeId });
  const vis = id => ev(`!document.getElementById('${id}').classList.contains('hidden')`);
  for (let i = 0; i < 300; i++) {   // 最多 30 秒（長跑數百份真檔時偶爾 8 秒不夠）
    await sleep(100);
    if (await vis('wfg-ack-mask')) break;
    if (await vis('wfg-tmg-mask')) { await ev('wfgTmgConfirm(); 0'); }   // EM01 多組 timing：用預設（CURRENT）
  }
  const st = await ev(STATE);
  st.shown = await vis('wfg-ack-mask');
  await ev(`typeof wfgAckClose==='function' && wfgAckClose(); 0`);
  await sleep(150);
  return st;
}
function writeTmp(name, bytes) { const p = join(TMP, name); writeFileSync(p, bytes); return p; }
const setMode = m => ev(`document.querySelector('input[name="wfg-dclk-mode"][value="${m}"]').click(); 0`);
const setFixed = () => setMode('fixed');
/* 匯出 script（直接呼叫產品的 build 函式，與匯出按鈕同一支）→ 去掉時間戳記那一行 */
const exportScript = key => ev(`(()=>{ var f={em01:wfgEm01BuildScript, em02:wfgEm02BuildScript, e512:wfgE512BuildScript}[${JSON.stringify(key)}];
  var r=f({}); return r && r.ok ? r.text.split('\\n').filter(function(l){return !/^\\/\\/ \\d{4}-\\d\\d-\\d\\dT/.test(l)}).join('\\n') : ('ERR '+(r&&r.reason)); })()`);
function scriptWrites(text) {
  const out = [];
  for (const ln of text.split('\n')) {
    const m = /^\s*write\s+-([mn])\s+([0-9A-Fa-f]+)\s+([0-9A-Fa-f]+)(?:\s+([0-9A-Fa-f]+))?/.exec(ln);
    if (m) out.push({ addr: parseInt(m[2], 16), val: parseInt(m[3], 16), mask: m[1] === 'm' && m[4] ? parseInt(m[4], 16) : 0xFF });
  }
  return out;
}
function applyScript(img, text) {
  const b = Uint8Array.from(img);
  for (const w of scriptWrites(text)) if (w.addr < b.length) b[w.addr] = (b[w.addr] & ~w.mask) | (w.val & w.mask);
  return b;
}
/* TX 相關分區（regAddr）。來源：各型號 register bank 的 bank_offset 表。 */
const TX_RANGES = {
  em01: [[0x0270, 0x028F, 'mini_tx'], [0x0400, 0x04FF, 'rt7_data_proc'], [0x0800, 0x08FF, 'tx_d2atop'], [0x0F00, 0x0FFF, 'tx_dtop_p2p'], [0x1000, 0x10FF, 'tx_sd_setting']],
  em02: [[0x01C0, 0x01EF, 'mini_tx_2'], [0x0200, 0x02BF, 'mini_tx'], [0x0480, 0x04FF, 'rt7_data_proc']],
  e512: [[0x0260, 0x02AF, 'mini_tx'], [0x0480, 0x04FF, 'rt7_data_proc']]
};
const txHits = (key, text) => scriptWrites(text).filter(w => TX_RANGES[key].some(([a, z]) => w.addr >= a && w.addr <= z))
  .map(w => '0x' + w.addr.toString(16));
function txBytesSame(img, after) {
  const diff = [];
  for (const [a, z, n] of TX_RANGES.em01) for (let x = a; x <= z; x++) if (img[x] !== after[x]) diff.push(n + '@0x' + x.toString(16));
  return diff;
}
/* X：匯入後 → 切到另一個型態 → 再切回 → 各匯出一次；script 逐字相同、不寫 TX、EM01 套回後 TX 不變 */
async function exportCheck(tag, key, img) {
  const s0 = await ev(STATE);
  const t0 = await exportScript(key);
  await setMode(s0.mode === 'var' ? 'fixed' : 'var');
  const s1 = await ev(STATE);
  const t1 = await exportScript(key);
  check(`${tag} 手動切換型態成功（${s0.mode}→${s1.mode}）`, s1.mode !== s0.mode, true);
  check(`${tag} 匯出 script 不是錯誤`, /^ERR/.test(t0) || /^ERR/.test(t1), false);
  check(`${tag} 手動切換前後匯出的 script 逐字相同`, t0 === t1, true);
  check(`${tag} 匯出 script 沒有寫到 TX 分區`, txHits(key, t1), []);
  if (img) check(`${tag} script 套回匯入的映像：TX 分區逐位元組與匯入時相同`, txBytesSame(img, applyScript(img, t1)), []);
  await setMode(s0.mode);
}

await load();
await ev(`try{localStorage.clear()}catch(e){}; 0`);
await load();

const MSG = {};
for (const k of ['codeAutoVarE512', 'codeAutoVarEm02', 'codeAutoVarEm01', 'codeAutoFixEm01', 'codeAutoClkEm01Unknown']) {
  MSG[k] = await ev(`t('wfg.${k}')`);
  check(`i18n：wfg.${k} 有翻譯（不是 key 本身）`, MSG[k] !== 'wfg.' + k && MSG[k].length > 5, true);
}
const anyMsg = n => Object.values(MSG).some(m => n.includes(m));
let s;

/* A：E512 —— 晶片只有 mini-LVDS，rt7 那一格是 0 或 1 都一樣變頻 */
for (const bit of [1, 0]) {
  await setFixed();
  s = await importFile('e512', writeTmp(`synthetic_e512_rt7bit${bit}.bin`, buildE512(!!bit)));
  check(`A E512（rt7 0x0480 bit0=${bit}）：匯入卡片出現`, s.shown, true);
  check(`A E512（rt7 0x0480 bit0=${bit}）：自動切變頻`, [s.mode, s.user, s.radio], ['var', 'var', 'var']);
  check(`A E512（bit0=${bit}）：TX DCLK ＝ RX DCLK（變頻既有語意）`, s.txEqRx, true);
  check(`A E512（bit0=${bit}）：卡片顯示說明行`, s.notice.includes(MSG.codeAutoVarE512), true);
}
await exportCheck('X E512', 'e512', null);

/* B：EM01 Flash */
const em01m = buildEm01('mlvds'), em01i = buildEm01('isp'), em01x = buildEm01('mismatch');
await setFixed();
s = await importFile('em01', writeTmp('synthetic_em01_mlvds.bin', em01m));
check('B EM01 mini-LVDS（從定頻開始）：匯入卡片出現', s.shown, true);
check('B EM01 mini-LVDS → 變頻', [s.mode, s.user, s.radio], ['var', 'var', 'var']);
check('B EM01 mini-LVDS：卡片顯示說明行', s.notice.includes(MSG.codeAutoVarEm01), true);
await exportCheck('X EM01 mini-LVDS', 'em01', em01m);
await setMode('var');
s = await importFile('em01', writeTmp('synthetic_em01_isp.bin', em01i));
check('B EM01 iSP（從變頻開始）→ 定頻', [s.mode, s.user, s.radio], ['fixed', 'fixed', 'fixed']);
check('B EM01 iSP：卡片顯示說明行', s.notice.includes(MSG.codeAutoFixEm01), true);
await exportCheck('X EM01 iSP', 'em01', em01i);
for (const start of ['fixed', 'var']) {
  await setMode(start);
  s = await importFile('em01', writeTmp('synthetic_em01_mismatch.bin', em01x));
  check(`B EM01 兩個 TX 設定不一致（從${start}開始）→ 不動`, [s.mode, s.radio], [start, start]);
  check(`B EM01 不一致：卡片標「未確認」`, s.notice.includes(MSG.codeAutoClkEm01Unknown), true);
}

/* C／D：判斷規則對 codec key（EM02 合成檔做不出來 —— 完整 EM02 由 R 段真檔驗）。
   用同一份解析結果走 wfgCodeApplyToWfg，只有型號不同。 */
async function applyAs(model, start) {
  await setMode(start);
  return ev(`(()=>{ if (wfgTconKey()!==${JSON.stringify(model)}) wfgCodeOnTconChange(${JSON.stringify(model)},{silentClamp:true});
    document.querySelector('input[name="wfg-dclk-mode"][value="${start}"]').click();
    var b=new Uint8Array(${JSON.stringify(Array.from(buildE512(true)))});
    var res=wfgE512ParseBin(b,'x.bin'); if(!res.ok) return {err:res.reason};
    wfgCodeApplyToWfg(res);
    var o=${STATE}; o.resNotice=res.notice||''; return o; })()`);
}
s = await applyAs('em02', 'fixed');
check('C EM02 → 變頻', [s.mode, s.user, s.radio], ['var', 'var', 'var']);
check('C EM02：notice 含說明行', s.resNotice.includes(MSG.codeAutoVarEm02), true);
await exportCheck('X EM02', 'em02', null);
s = await applyAs('e503', 'fixed');
check('D 其他型號 E503（NB）：維持定頻、沒有說明行', [s.mode, s.radio, anyMsg(s.resNotice)], ['fixed', 'fixed', false]);
s = await ev(`(()=>{ return wfgCodeAutoClockMode('e501a',{ok:true}) === null && wfgCodeAutoClockMode('en01',{ok:true}) === null
  && wfgCodeAutoClockMode('e503',{ok:true}) === null; })()`);
check('D 判斷函式：NB 型號一律回 null（流程不變）', s, true);
s = await ev(`(()=>{ var a=wfgCodeAutoClockMode('em01',{ok:true}); return a && a.mode; })()`);
check('D 判斷函式：EM01 沒有 txIf（EEPROM／讀不到）→ 不動（mode null）', s, null);

/* E：自動選後手動改 → 保留 */
await setFixed();
s = await importFile('e512', writeTmp('synthetic_e512_rt7bit1.bin', buildE512(true)));
check('E 前置：E512 自動切成變頻', s.mode, 'var');
await setFixed();
s = await ev(STATE);
check('E 手動改回定頻', [s.mode, s.user, s.radio], ['fixed', 'fixed', 'fixed']);
s = await ev(`(()=>{ wfgCodeOnTconChange('e503',{silentClamp:true}); wfgCodeOnTconChange('e512',{silentClamp:true}); return ${STATE}; })()`);
check('E 換機種 E512→E503→E512 後仍是定頻', [s.mode, s.radio], ['fixed', 'fixed']);
s = await ev(`(()=>{ wfgApplyTconClassConstraints(); return ${STATE}; })()`);
check('E 重算（機種約束）後仍是定頻', [s.mode, s.radio], ['fixed', 'fixed']);
s = await ev(`(()=>{ var fr=document.getElementById('wfg-framerate'); if(fr){ fr.value='50'; fr.dispatchEvent(new Event('change',{bubbles:true})); } return ${STATE}; })()`);
check('E 改 Frame Rate 後仍是定頻', [s.mode, s.radio], ['fixed', 'fixed']);
await ev('wfgAutoSaveNow(); 0');
await load();
s = await ev(STATE);
check('E 重新整理（自動存檔還原）後仍是定頻、型號仍是 E512', [s.model, s.mode, s.radio], ['e512', 'fixed', 'fixed']);
s = await importFile('e512', writeTmp('synthetic_e512_rt7bit1.bin', buildE512(true)));
check('E 再匯入一次才重新判斷 → 變頻', [s.mode, s.radio], ['var', 'var']);
/* EM01 iSP 自動定頻 → 手動改變頻 → 換機種來回仍是變頻 */
await setMode('var');
s = await importFile('em01', writeTmp('synthetic_em01_isp.bin', em01i));
await setMode('var');
s = await ev(`(()=>{ wfgCodeOnTconChange('e503',{silentClamp:true}); wfgCodeOnTconChange('em01',{silentClamp:true}); wfgApplyTconClassConstraints(); return ${STATE}; })()`);
check('E EM01 iSP 自動定頻後手動改變頻：換機種來回仍是變頻', [s.mode, s.radio], ['var', 'var']);

/* R：真檔（選用）*/
const realRoots = (process.env.WFG_AUTOCLK_REAL || '').split(':').filter(Boolean);
const real = [];
function walk(p) {
  let st; try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f)); }
  else if (/\.bin$/i.test(p) && st.size >= 3000 && st.size <= 8 * 1024 * 1024) real.push(p);
}
realRoots.forEach(walk);
const realSummary = { counts: {}, files: [] };
if (real.length) {
  console.log(`\nR 真檔：${real.length} 份候選`);
  for (const f of real) {
    const bytes = readFileSync(f);
    await ev(`window.__b = null; 0`);
    // 大檔分段送進頁面
    await ev(`window.__parts = []; 0`);
    const b64 = bytes.toString('base64');
    for (let i = 0; i < b64.length; i += 4000000) await ev(`window.__parts.push(${JSON.stringify(b64.slice(i, i + 4000000))}); 0`);
    const kind = await ev(`(()=>{ var s=atob(window.__parts.join('')); var b=new Uint8Array(s.length); for(var i=0;i<s.length;i++) b[i]=s.charCodeAt(i);
      window.__parts=null; var r=null;
      try{ r=wfgE512ParseBin(b,'x.bin'); }catch(e){} if (r && r.ok) return {k:'e512'};
      try{ r=wfgEm02ParseBin(b,'x.bin'); }catch(e){} if (r && r.ok) return {k:'em02'};
      try{ r=wfgEm01ParseBin(b,'x.bin'); }catch(e){} if (r && r.ok) return {k:'em01', tx:r.txIf, type:r.txType, sel:r.txSel, layout:r.em01Layout};
      return null; })()`);
    if (!kind) continue;
    const start = 'fixed';
    await setMode(kind.k === 'em01' && kind.tx === 'isp' ? 'var' : start);
    const before = (await ev(STATE)).mode;
    s = await importFile(kind.k, f);
    let want, msg;
    if (kind.k !== 'em01') { want = 'var'; msg = kind.k === 'em02' ? MSG.codeAutoVarEm02 : MSG.codeAutoVarE512; }
    else if (kind.tx === 'mlvds') { want = 'var'; msg = MSG.codeAutoVarEm01; }
    else if (kind.tx === 'isp') { want = 'fixed'; msg = MSG.codeAutoFixEm01; }
    else { want = before; msg = MSG.codeAutoClkEm01Unknown; }
    const tag = kind.k + (kind.k === 'em01' ? `(${kind.layout} ${kind.tx} type=${kind.type} sel=${kind.sel})` : '');
    check(`R ${tag} ${basename(f).slice(0, 60)}`, [s.shown, s.mode, s.radio, s.notice.includes(msg)], [true, want, want, true]);
    const ck = tag.replace(/ type=.*\)/, ')');
    realSummary.counts[ck] = (realSummary.counts[ck] || 0) + 1;
    realSummary.files.push({ file: f, kind: kind.k, tx: kind.tx || null, type: kind.type, sel: kind.sel, layout: kind.layout || null, mode: s.mode });
    if (kind.k === 'em01' && kind.layout === 'Flash' && (kind.tx === 'mlvds' || kind.tx === 'isp') &&
        !realSummary.files.some(x => x.xDone === kind.tx)) {
      await exportCheck(`X 真檔 EM01 ${kind.tx} ${basename(f).slice(0, 40)}`, 'em01', new Uint8Array(bytes));
      realSummary.files[realSummary.files.length - 1].xDone = kind.tx;
    }
  }
  console.log('R 統計：' + JSON.stringify(realSummary.counts));
}

check('整段沒有 JS 例外', exc, []);
ws.close(); chrome.kill(); srv.close();
if (process.env.WFG_AUTOCLK_REPORT) writeFileSync(process.env.WFG_AUTOCLK_REPORT,
  JSON.stringify({ pass, fail, lines, real: realSummary }, null, 1));
console.log(`\n${fail ? '✗' : '✓'} ${pass} 通過／${fail} 失敗`);
process.exit(fail ? 1 : 0);
