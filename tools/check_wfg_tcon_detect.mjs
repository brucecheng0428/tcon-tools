#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   WFG v4.59.0 自測：匯入時自動判斷 T-Con 型號 ＋ EN01 AGBSFR DCLK（FNPLL）聯動
   ───────────────────────────────────────────────────────────────────────
   Bruce 2026-10-21：「T-con 選擇是 A，但是匯入的 T-con 卻是 B……自動修正 T-con 的型號」
                     「EN01 的 DCLK 跟在 AGBSFR 那一頁的聯動……跟 E503 一樣」
   127.0.0.1 靜態伺服器（改後本 repo／改前 WFG_BASE_ROOT）＋ 自有暫存 profile 的 headless Chrome，
   全部走**產品本身**的函式與按鈕路徑（wfgCodePickFile → 選檔）。
     A  判斷矩陣：WFG_DETECT_LIST 每一份真檔，wfgCodeDetectTcon() ＝ 檔名標的型號；
        哪一顆都讀不通的檔才允許回 null；誤判 0、歧義 0。
     B  畫面流程矩陣：每顆型號一份代表檔（＋ Bruce 的 EN01 兩份）× 先選 7 顆型號 →
        匯入後型號＝真值；先選錯時卡片有「已從 X 切換為 Y」一行；最終狀態（18 條訊號、frame、
        FLR、UI DCLK、ack 項目）與「在匯入視窗手動選對型號再匯入」**完全相同**。
     C  EN01 DCLK：Bruce 標準化過的 code ⇒ TCON UI DCLK＝178.00、ack 的 DCLK 項消失；
        沒標準化的舊檔 ⇒ 不帶入、講理由；匯入→不改→匯出 ⇒ 不多寫任何 FNPLL 列；
        DCLK 40～210 每 0.25 MHz 一格：匯出列＝獨立移植的官方 Standardize（C# 逐行），
        套回原檔再匯入 ⇒ 讀回同一個 DCLK（round-trip）；RCLK 型態沿用匯入值。
     D  改前改後：每份真檔用正確型號匯入，狀態與「不改 DCLK 的匯出列」改前＝改後
        （唯一允許的差異：EN01 標準化過的檔 DCLK 由「不帶入」變「帶入」）。
     U  畫面：選 E503 匯入 Bruce 的 EN01 code，桌面與 375px 截圖。
   環境變數：WFG_BASE_ROOT、WFG_DETECT_LIST（{型號:[路徑…]}，本機）、WFG_EN01_BRUCE（;分隔）、
            WFG_SHOT_DIR、WFG_D_CAP（D 每型號最多幾份，預設 40）
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.WFG_BASE_ROOT || '';
const SHOT = process.env.WFG_SHOT_DIR || '';
const LIST = process.env.WFG_DETECT_LIST ? JSON.parse(readFileSync(process.env.WFG_DETECT_LIST, 'utf8')) : {};
const BRUCE = (process.env.WFG_EN01_BRUCE || '').split(';').filter(Boolean);
const DCAP = +(process.env.WFG_D_CAP || 20);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : '  ' + detail}`); }

const FILES = []; const TRUTH = [];
for (const [k, v] of Object.entries(LIST)) for (const p of v) { FILES.push(p); TRUTH.push(k); }
for (const p of BRUCE) { FILES.push(p); TRUTH.push('en01'); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
async function serve(root) {
  root = resolve(root);
  const srv = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/__f/')) { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(await readFile(FILES[+url.pathname.slice(5)])); }
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
const OLD = BASE ? await serve(BASE) : null;
const port = 9300 + Math.floor(Math.random() * 600);
const prof = await mkdtemp(join(tmpdir(), 'wfg-tcondetect-'));
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
await send('Page.enable'); await send('Runtime.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
let curOrigin = '';
async function open(origin, w = 1700, h = 1000) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  /* 先離開頁面（讓上一頁的 autosave 寫完），再用 CDP 把這個 origin 的所有儲存清掉，
     確保每次都從同一個乾淨狀態開始（比較 auto／manual、改前／改後才公平）。 */
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  await send('Page.navigate', { url: `${origin}/wfg.html#wfg` });
  for (let i = 0; i < 150; i++) { await sleep(150); if (await ev('document.readyState') === 'complete') break; }
  await ev(`(async()=>{ for (let i=0;i<60;i++){ if (window.__wfgEval && typeof wfgCodePickFile==='function') return true; await new Promise(r=>setTimeout(r,100)); } return false; })()`);
  await sleep(600);
  curOrigin = origin;
}
/* 照使用者操作：（可選）先在畫面上選型號 → 按匯入走 wfgCodePickFile() → 選檔；回傳最終狀態快照。 */
const SNAP = `(function(){
  var g = wfgGpios.map(function(x){ if (!x) return null; var o = {}; for (var k in x) { var v = x[k]; if (typeof v !== 'function' && typeof v !== 'object') o[k] = v; } return o; });
  var fr = {}; for (var k in wfgFrame) { var v = wfgFrame[k]; if (typeof v !== 'function' && typeof v !== 'object') fr[k] = v; }
  var m = document.getElementById('wfg-ack-mask'), nt = document.getElementById('wfg-ack-notice'), it1 = document.getElementById('wfg-ack-item-1');
  return { key: wfgTconKey(), gpios: g, frame: fr, flr: wfgFirstLineRead, nbSt: (typeof wfgNbStLineRd==='function') ? wfgNbStLineRd() : null, nbPre: wfgNbPreBlkRd,
           pm: wfgNbPanelMode, uiInput: (document.getElementById('wfg-ui-dclk')||{}).value,
           uiDclk: wfgFrame.dclk * (wfgUiDclkRatio() || 1), dclkImported: wfgNbDclkImported ? { key: wfgNbDclkImported.key, dclk: wfgNbDclkImported.dclk } : null,
           ack: !!(m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'),
           ackDclkItem: it1 ? it1.style.display !== 'none' : null,
           notice: nt ? nt.textContent : '' };
})()`;
async function importVia(idx, preKey, manualKey) {
  dialogs.length = 0;
  if (preKey) await evIn(`wfgCodeOnTconChange('${preKey}', { silentClamp: true }); if (typeof wfgSyncTconSelects==='function') wfgSyncTconSelects(); true`);
  if (manualKey) await evIn(`wfgCodeOnTconChange('${manualKey}', { silentClamp: true }); true`);   // ＝ 匯入視窗裡手動選對（wfgImpConfirm 走的同一支）
  const r = await ev(`(function(){
    let inp=null; const orig=document.createElement.bind(document);
    document.createElement=function(t){ const e=orig(t); if(String(t).toLowerCase()==='input') inp=e; return e; };
    try { window.__wfgEval('wfgCodePickFile')(); } finally { document.createElement=orig; }
    if(!inp) return {err:'沒有開檔案選擇'};
    window.__inp = inp; return { accept: inp.accept }; })()`);
  // 用真檔名（副檔名影響判斷）
  const fname = basename(FILES[idx]);
  const r2 = await ev(`(async()=>{ const b=new Uint8Array(await (await fetch('/__f/${idx}')).arrayBuffer());
    const dt=new DataTransfer(); dt.items.add(new File([b], ${JSON.stringify(fname)})); window.__inp.files=dt.files; window.__inp.onchange();
    for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,100)); const m=document.getElementById('wfg-ack-mask'); if (m && !m.classList.contains('hidden')) break; }
    const t=document.getElementById('wfg-tmg-mask'); if (t && !t.classList.contains('hidden')) { window.__wfgEval('wfgTmgConfirm')(); await new Promise(r=>setTimeout(r,600)); }
    return true; })()`);
  await sleep(150);
  const s = await evIn(SNAP);
  s.accept = r && r.accept; s.dialogs = dialogs.slice();
  return s;
}
const KEYS = ['em02', 'e512', 'em01', 'e503', 'e501a', 'e501b', 'en01'];
const LABEL = { em02: 'EM02', e512: 'E512', em01: 'EM01', e503: 'E503', e501a: 'E501A', e501b: 'E501B', en01: 'EN01' };

/* ── A 判斷矩陣 ───────────────────────────────────────────────────────── */
console.log('── A 判斷矩陣 ──');
await open(NEW.origin);
const detRows = [];
for (let i = 0; i < FILES.length; i++) {
  const fn = basename(FILES[i]);
  const r = await evIn(`(async function(){ var b = new Uint8Array(await (await fetch('/__f/${i}')).arrayBuffer());
    var d = wfgCodeDetectTcon(b, ${JSON.stringify(fn)}); var any = false;
    for (var k in WFG_TCON_CODECS) { var c = WFG_TCON_CODECS[k]; if (!c.parseCode) continue; try { var x = c.parseCode(b, ${JSON.stringify(fn)}, null); if (x && x.ok) any = true; } catch(e){} }
    return { key: d.key, hits: d.hits, amb: d.ambiguous, any: any }; })()`);
  detRows.push({ i, truth: TRUTH[i], ...r });
}
{
  const by = {};
  for (const r of detRows) { const k = r.truth; by[k] = by[k] || { n: 0, ok: 0, nul: 0, wrong: 0, amb: 0 }; by[k].n++;
    if (r.key === r.truth) by[k].ok++; else if (r.key === null && !r.any) by[k].nul++; else if (r.amb) by[k].amb++; else by[k].wrong++; }
  for (const [k, v] of Object.entries(by)) check(`A ${LABEL[k]}：${v.n} 份 → 判對 ${v.ok}、哪顆都讀不通 ${v.nul}、歧義 ${v.amb}、誤判 ${v.wrong}`, v.wrong === 0 && v.amb === 0 && v.ok + v.nul === v.n);
  const wrong = detRows.filter(r => r.key !== r.truth && !(r.key === null && !r.any));
  if (wrong.length) console.log('   誤判例：', wrong.slice(0, 5).map(r => basename(FILES[r.i]) + ' ' + JSON.stringify(r)).join('\n   '));
}

/* ── B 畫面流程矩陣 ───────────────────────────────────────────────────── */
console.log('── B 畫面流程矩陣（先選 7 顆 × 代表檔）──');
const reps = [];
for (const k of KEYS) { const r = detRows.find(x => x.truth === k && x.key === k && !BRUCE.includes(FILES[x.i])); if (r) reps.push(r.i); }
for (const p of BRUCE) reps.push(FILES.indexOf(p));
const keyOfRep = {};
let bOk = 0, bN = 0;
for (const idx of reps) {
  const truth = TRUTH[idx];
  for (const pre of KEYS) {
    await open(NEW.origin);
    const auto = await importVia(idx, pre, null);
    await open(NEW.origin);
    const manual = await importVia(idx, pre, truth);
    const strip = s => { const c = JSON.parse(JSON.stringify(s)); delete c.notice; delete c.dialogs; delete c.accept; return c; };
    const same = JSON.stringify(strip(auto)) === JSON.stringify(strip(manual));
    const swLine = /已從 .* 自動切換為 /.test(auto.notice);
    const ok = auto.key === truth && auto.ack && same && (pre === truth ? !swLine : swLine) && !auto.dialogs.length;
    bN++; if (ok) bOk++;
    if (!ok || pre === 'e503' && truth === 'en01') check(`B 先選 ${LABEL[pre]} 匯入 ${LABEL[truth]} 檔 ${basename(FILES[idx]).slice(0, 40)} → ${LABEL[auto.key] || auto.key}`, ok,
      JSON.stringify({ key: auto.key, ack: auto.ack, same, notice: auto.notice.slice(0, 80), dialogs: auto.dialogs.map(d => d.slice(0, 80)) }));
    if (pre === truth) keyOfRep[idx] = auto;
  }
}
check(`B 合計 ${bN} 組（${reps.length} 份 × 7 顆）全部判對、切換提示正確、與手動選對結果完全相同`, bOk === bN, `${bOk}/${bN}`);

/* ── C EN01 DCLK ──────────────────────────────────────────────────────── */
console.log('── C EN01 AGBSFR DCLK ──');
const bIdx = BRUCE.length ? FILES.indexOf(BRUCE[0]) : -1;
if (bIdx >= 0) {
  await open(NEW.origin);
  const s = await importVia(bIdx, 'e503', null);
  const raw = await evIn(`(async function(){ var b = new Uint8Array(await (await fetch('/__f/${bIdx}')).arrayBuffer());
    var r = WFG_TCON_CODECS.en01.parseCode(b, 'x.bin'); return { uiDclk: r.uiDclk, raw: r.nbDclk && r.nbDclk.raw }; })()`);
  console.log('   Bruce EN01 原始值：', JSON.stringify(raw));
  const R = raw.raw || {};
  const fvco = 54 * (1 + R.nFb) / (1 + R.nPre), wmk = fvco / 2 / (1 + R.nPos1), dc = Math.round(wmk * (1 - R.ftn * 0.125 / 65535) * 100) / 100;
  check(`C1 手算：FVCO=54×(1+${R.nFb})/(1+${R.nPre})=${fvco}、WMK=${fvco}/2/(1+${R.nPos1})=${wmk}、DCLK=Round(${wmk}×(1−${R.ftn}×0.125/65535),2)=${dc}；FNPLL_VALUE=${R.auto}`,
    dc === 178 && R.auto === 178 && raw.uiDclk === 178);
  check('C1 先選 E503 匯入 ⇒ 自動切 EN01、TCON UI DCLK 顯示 178、ack 的 DCLK 項消失', s.key === 'en01' && Math.abs(s.uiDclk - 178) < 1e-9 && String(s.uiInput) === '178' && s.ackDclkItem === false,
    JSON.stringify({ key: s.key, ui: s.uiDclk, input: s.uiInput, item: s.ackDclkItem }));
  check('C1 卡片提示「已從 E503 自動切換為 EN01」', /已從 E503 自動切換為 EN01/.test(s.notice), s.notice);
  if (SHOT) { mkdirSync(SHOT, { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOT, 'u_e503_to_en01_desktop.png'), Buffer.from(r.result.data, 'base64')); }
  /* C4：匯入 → 不改 → 匯出：一列 FNPLL 都不寫 */
  const r0 = await evIn(`(function(){ var r = WFG_TCON_CODECS.en01.buildExport({}); return r.rows.slice(1).map(function(w){ return [w[1], w[4], w[6]]; }); })()`);
  check('C4 匯入→不改→匯出：沒有任何 FNPLL 列', !r0.some(w => /^FNPLL/.test(w[0])), JSON.stringify(r0.filter(w => /FNPLL/.test(w[0]))));
  /* C5：DCLK 40～210 每 0.25 */
  const oracle = (D, wasPos2, wasD) => {           // 獨立移植：EN01AgbsfrViewModel.Standardize（C#），不用產品程式
    const DT = [[110, 210, 2, 5, 3, 2], [55, 109, 5, 11, 7, 5], [38, 54, 8, 17, 11, 8], [28, 37, 11, 23, 15, 11], [25, 27, 14, 29, 19, 14]];
    const NT = [[207,210,48],[203,206,47],[199,202,46],[195,198,45],[190,194,44],[186,189,43],[182,185,42],[178,181,41],[174,177,40],[169,173,39],[165,168,38],[161,164,37],[157,160,36],[152,156,35],[148,151,34],[144,147,33],[140,143,32],[136,139,31],[131,135,30],[127,130,29],[123,126,28],[119,122,27],[114,118,26],[110,113,25],[106,109,49],[104,105,48],[102,103,47],[100,101,46],[98,99,45],[95,97,44],[93,94,43],[91,92,42],[89,90,41],[87,88,40],[85,86,39],[83,84,38],[81,82,37],[79,80,36],[76,78,35],[74,75,34],[72,73,33],[70,71,32],[68,69,31],[66,67,30],[64,65,29],[62,63,28],[60,61,27],[57,59,26],[55,56,25],[54,54,37],[53,53,36],[51,52,35],[50,50,34],[48,49,33],[47,47,32],[46,46,31],[44,45,30],[43,43,29],[41,42,28],[40,40,27],[38,39,26],[37,37,34],[36,36,33],[35,35,32],[34,34,31],[33,33,30],[32,32,29],[31,31,28],[30,30,27],[29,29,26],[28,28,25],[27,27,30],[26,26,29],[25,25,28]];
    const rnd = x => Math.sign(x) * Math.round(Math.abs(x));
    const e0 = DT.find(e => rnd(wasD) >= e[0] && rnd(wasD) <= e[1]); let type = 0;
    if (e0) { if (wasPos2 === e0[3]) type = 0; else if (wasPos2 === e0[4]) type = 1; else if (wasPos2 === e0[5]) type = 2; }
    const at = d => { const e = DT.find(x => d >= x[0] && d <= x[1]), n = NT.find(x => d >= x[0] && d <= x[1]);
      const nFb = n[2], nPos1 = e[2], nPos2 = e[3 + type];
      const W = 54 * (1 + nFb) / (1 + 1) / 2 / (1 + nPos1);
      return { FNPLL_VALUE: Math.trunc(D), FNPLL_N_PRE: 1, FNPLL_N_FB: nFb, FNPLL_N_POS1: nPos1, FNPLL_N_POS2: nPos2, FNPLL_FTN: rnd((1 - D / W) * 65535 / 0.125) }; };
    const off = at(rnd(D));                         // 官方 Standardize 原樣
    if (off.FNPLL_FTN >= 0 && off.FNPLL_FTN <= 0x7FFF) return { ...off, overflow: false };
    return { ...at(Math.floor(D)), overflow: true, officialFtn: off.FNPLL_FTN };   // 官方會截掉高位 ⇒ 本工具改查 floor 那一列
  };
  const grid = []; for (let x = 4000; x <= 21000; x += 25) grid.push(x / 100);
  const c5 = await evIn(`(async function(){ var b = new Uint8Array(await (await fetch('/__f/${bIdx}')).arrayBuffer());
    var img = wfgCodeToImage(b, 'x.bin').bytes, m = WFG_NB_MODELS.en01, ctx = { header: wfgEn01DetectHeader(img) };
    var grid = ${JSON.stringify(grid)}, out = [];
    for (var i = 0; i < grid.length; i++) {
      var D = grid[i]; wfgFrame.dclk = D / (wfgUiDclkRatio() || 1);
      var r = WFG_TCON_CODECS.en01.buildExport({}); var rows = r.rows.slice(1).filter(function(w){ return /^FNPLL/.test(w[1]); });
      var got = {}; rows.forEach(function(w){ got[w[1]] = parseInt(String(w[6]).replace(/^0x/i,''), 16); });
      /* 套回原檔（Offset 字串 MSB-first 拆段；位址經 header 映射到檔案位置） */
      var cp = new Uint8Array(img);
      rows.forEach(function(w){ var segs = String(w[4]).split(','), v = got[w[1]];
        for (var s = segs.length - 1; s >= 0; s--) { var mm = /0x([0-9A-F]+)\\[(\\d+)(?::(\\d+))?\\]/i.exec(segs[s].trim());
          var a = parseInt(mm[1], 16), msb = +mm[2], lsb = mm[3] === undefined ? msb : +mm[3], wd = msb - lsb + 1;
          var part = v & ((1 << wd) - 1); v = Math.floor(v / (1 << wd)); var o = wfgNbRegToFile(m, ctx, a);
          var mask = (((1 << wd) - 1) << lsb) & 0xFF; cp[o] = (cp[o] & ~mask) | ((part << lsb) & mask); } });
      var back = wfgNbReadDclk(cp, m, ctx);
      out.push({ D: D, got: got, back: back.ok ? back.dclk : ('X ' + back.why), cnt: rows.length });
    }
    return out; })()`);
  let c5ok = 0, c5bad = [], c5ovf = 0, c5n = 0;
  for (const r of c5) {
    if (r.D === raw.uiDclk) { check('C5 DCLK＝匯入值 178 ⇒ 不寫任何 FNPLL 列', r.cnt === 0, JSON.stringify(r.got)); continue; }
    c5n++;
    const o = oracle(r.D, raw.raw.nPos2, raw.uiDclk);
    if (o.overflow) c5ovf++;
    const same = ['FNPLL_VALUE', 'FNPLL_N_PRE', 'FNPLL_N_FB', 'FNPLL_N_POS1', 'FNPLL_N_POS2', 'FNPLL_FTN'].every(k => r.got[k] === o[k]) && r.cnt === 6;
    const rt = typeof r.back === 'number' && Math.abs(r.back - r.D) < 1e-9;
    if (same && rt) c5ok++; else c5bad.push({ D: r.D, got: r.got, exp: o, back: r.back });
  }
  check(`C5 DCLK 40～210 每 0.25 MHz（${c5n} 格，另 1 格＝匯入值）：匯出 6 列＝官方 Standardize 獨立移植（其中 ${c5ovf} 格官方 FTN 會超出 15 bit ⇒ 改查 floor 那一列）、套回原檔再用官方公式讀回＝原值`,
    c5ok === c5n, JSON.stringify(c5bad.slice(0, 3)));
  const e178 = await evIn(`wfgNbDclkEncodeFnpll(178, ${JSON.stringify(raw.raw)})`);
  check('C5 178 MHz 反算＝檔案原值（N_FB 41／N_POS1 2／N_POS2 5／FTN 30514／VALUE 178）',
    e178.nFb === R.nFb && e178.nPos1 === R.nPos1 && e178.nPos2 === R.nPos2 && e178.ftn === R.ftn && e178.auto === R.auto && e178.nPre === 1, JSON.stringify(e178));
  /* C6：RCLK 型態沿用 */
  const c6 = await evIn(`(function(){ return [wfgNbDclkEncodeFnpll(80, { nPos2: 3, dclk: 178 }).nPos2, wfgNbDclkEncodeFnpll(80, { nPos2: 2, dclk: 178 }).nPos2, wfgNbDclkEncodeFnpll(80, { nPos2: 5, dclk: 178 }).nPos2, wfgNbDclkEncodeFnpll(80, { nPos2: 9, dclk: 178 }).nPos2]; })()`);
  check('C6 RCLK 型態沿用匯入值（6/8→7、1→5、4/8→11、推不出→官方預設 4/8＝11）', JSON.stringify(c6) === '[7,5,11,11]', JSON.stringify(c6));
  /* C7：畫面上改 DCLK 再匯出（UI 路徑）＋ 匯出訊息 */
  await open(NEW.origin);
  await importVia(bIdx, 'en01', null);
  const c7 = await ev(`(async()=>{ var inp = document.getElementById('wfg-ui-dclk'); inp.value = '150'; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r=>setTimeout(r,300)); var r = window.__wfgEval('WFG_TCON_CODECS.en01.buildExport({})');
    return { ui: window.__wfgEval('wfgFrame.dclk'), rows: r.rows.slice(1).filter(function(w){ return /^FNPLL/.test(w[1]); }).map(function(w){ return [w[1], w[4], w[6]]; }) }; })()`);
  const o150 = oracle(150, R.nPos2, 178);
  check('C7 畫面改 TCON UI DCLK＝150 ⇒ 匯出寫 6 列且值＝官方 Standardize', c7.ui === 150 && c7.rows.length === 6 && c7.rows.every(w => o150[w[0]] === parseInt(w[2], 16)), JSON.stringify(c7));
  console.log('   150 MHz 匯出列：', JSON.stringify(c7.rows));
}
/* C3：沒標準化的舊 EN01 檔 */
for (let i = 0; i < FILES.length; i++) {
  if (TRUTH[i] !== 'en01' || BRUCE.includes(FILES[i])) continue;
  await open(NEW.origin);
  const s = await importVia(i, 'en01', null);
  const why = await evIn(`(async function(){ var b = new Uint8Array(await (await fetch('/__f/${i}')).arrayBuffer()); var r = WFG_TCON_CODECS.en01.parseCode(b, ${JSON.stringify(basename(FILES[i]))}); return { ui: r.uiDclk, d: r.detail }; })()`);
  check(`C3 舊 EN01 ${basename(FILES[i]).slice(0, 36)}：沒標準化 ⇒ 不帶入、講理由、ack 保留 DCLK 項`, why.ui === undefined && /FNPLL_N_PRE=3/.test(why.d) && s.ackDclkItem === true, JSON.stringify({ ui: why.ui, item: s.ackDclkItem }));
}

/* ── D 改前改後 ───────────────────────────────────────────────────────── */
if (OLD) {
  console.log('── D 改前改後（正確型號匯入：狀態＋匯出列）──');
  const per = {};
  const pick = [];
  for (let i = 0; i < FILES.length; i++) { const r = detRows[i]; if (r.key !== TRUTH[i]) continue; per[TRUTH[i]] = (per[TRUTH[i]] || 0) + 1; if (per[TRUTH[i]] <= DCAP || TRUTH[i] === 'en01') pick.push(i); }
  const EXP = k => `(function(){ var c = WFG_TCON_CODECS['${k}']; var r = c.buildExport({ onlyChanged: false, comments: true });
    return r.rows ? JSON.stringify(r.rows.slice(1).map(function(w){ return [w[1], w[4], w[6]]; })) : String(r.text || '').replace(/^\\/\\/ \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z$/m, '// <time>').replace(/^\\/\\/ WFG v[\\d.]+ /m, '// WFG <ver> '); })()`;
  let dN = 0, dSame = 0; const diffs = [];
  for (const i of pick) {
    const k = TRUTH[i];
    await open(OLD.origin); const a = await importVia(i, k, null); const ea = await evIn(EXP(k));
    await open(NEW.origin); const b = await importVia(i, k, null); const eb = await evIn(EXP(k));
    const strip = s => { const c = JSON.parse(JSON.stringify(s)); delete c.accept; delete c.notice; return c; };
    let same = JSON.stringify(strip(a)) === JSON.stringify(strip(b)) && ea === eb;
    const bruce = BRUCE.includes(FILES[i]);
    if (k === 'en01' && !bruce && !same) {
      /* 預期差異：EN01 的 TCON UI DCLK 上限 105 → 210（v4.59.0）。舊版會因上限把 Frame Rate 往下調／DCLK 夾住，
         新版不會 ⇒ 只允許 frame 的 frameRate／dclk／rxDclk／htotal／tconHtotal（由上限推導）不同；訊號、FLR、匯出列必須相同。 */
      const sa = strip(a), sb = strip(b), fd = Object.keys(sa.frame).filter(z => JSON.stringify(sa.frame[z]) !== JSON.stringify(sb.frame[z]));
      const core = ['gpios', 'flr', 'nbSt', 'nbPre', 'pm', 'key', 'ackDclkItem'].every(z => JSON.stringify(sa[z]) === JSON.stringify(sb[z])) && ea === eb;
      console.log(`   EN01 未標準化 ${basename(FILES[i]).slice(0, 36)}：frame 差異欄位 ${fd.join(',')}（UI DCLK ${a.uiDclk} → ${b.uiDclk}，上限 105→210 的連帶）`);
      same = core && fd.every(z => /^(fps|frameRate|dclk|rxDclk|htotal|tconHtotal)$/.test(z));
    }
    if (bruce) {   // 唯一允許的差異：DCLK 由不帶入變帶入
      same = !same && b.uiDclk === 178 && b.ackDclkItem === false && a.ackDclkItem === true;
      check(`D Bruce EN01 ${basename(FILES[i]).slice(0, 30)}：改前 DCLK 不帶入（${a.uiDclk}）→ 改後帶入 178`, same, JSON.stringify({ a: a.uiDclk, b: b.uiDclk }));
    }
    dN++; if (same) dSame++; else {
      let why = '';
      const sa = strip(a), sb = strip(b);
      for (const kk of Object.keys(sa)) if (JSON.stringify(sa[kk]) !== JSON.stringify(sb[kk])) {
        if (kk === 'gpios' || kk === 'frame') { const A = sa[kk], B = sb[kk]; for (const z of Object.keys(A)) if (JSON.stringify(A[z]) !== JSON.stringify(B[z])) { why += `${kk}.${z}: ${JSON.stringify(A[z]).slice(0, 120)} ≠ ${JSON.stringify(B[z]).slice(0, 120)}; `; break; } }
        else why += `${kk}: ${JSON.stringify(sa[kk]).slice(0, 150)} ≠ ${JSON.stringify(sb[kk]).slice(0, 150)}; `;
      }
      if (ea !== eb) { const la = String(ea).split('\n'), lb = String(eb).split('\n'); const j = la.findIndex((x, q) => x !== lb[q]); why += `export L${j}: ${String(la[j]).slice(0, 120)} ≠ ${String(lb[j]).slice(0, 120)}`; }
      diffs.push(basename(FILES[i]).slice(0, 40) + ' ' + k + ' → ' + why);
    }
  }
  check(`D ${dN} 份（每型號最多 ${DCAP}＋全部 EN01）改前＝改後（Bruce 檔為預期差異）`, dSame === dN, diffs.slice(0, 5).join(' | '));
}

/* ── U 375px ──────────────────────────────────────────────────────────── */
if (bIdx >= 0) {
  await open(NEW.origin, 375, 760);
  const s = await importVia(bIdx, 'e503', null);
  const box = await ev(`(function(){ var b = document.querySelector('#wfg-ack-mask .wfg-ack-box') || document.getElementById('wfg-ack-notice'); var r = b.getBoundingClientRect(); var n = document.getElementById('wfg-ack-notice').getBoundingClientRect(); return { l: r.left, r: r.right, nl: n.left, nr: n.right, vw: innerWidth }; })()`);
  check('U 375px：切換提示在畫面內、型號已切 EN01、DCLK 178', s.key === 'en01' && box.nl >= 0 && box.nr <= box.vw + 0.5 && s.uiDclk === 178, JSON.stringify(box));
  if (SHOT) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOT, 'u_e503_to_en01_375.png'), Buffer.from(r.result.data, 'base64')); }
}
check('頁面沒有未捕捉例外', !exc.length, exc.slice(0, 3).join(' | '));
console.log(`\n${pass} pass / ${fail} fail`);
ws.close(); chrome.kill(); NEW.srv.close(); OLD && OLD.srv.close();
process.exit(fail ? 1 : 0);
