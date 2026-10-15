#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   WFG v4.56.0 自測：RX DE 第 0 條對齊 Line 0、Line Buffer ＜ 1 提示
   ───────────────────────────────────────────────────────────────────────
   紹婷 2026-10-15 mail：①「RX DE 的第 0 條位置要改為對應到 Line 0（不是在 Line 0 的前一條）」
   ②「增加 Line Buffer 至少需為 1 Line 的提示訊息」。
   Bruce 2026-10-15：TX DE 不往後延、保持原位；Line Buffer 是「位置」，＜ 1 會同時讀寫同一條；
   MNT 看 Line Buffer、NB 看 ST_LINE_RD＋PRE_BLK_RD_NO（同一套換算），要 ≥ 1。

   做法：127.0.0.1 靜態伺服器 ＋ 自有暫存 profile 的 headless Chrome（CDP），打開 wfg.html。
     R  用記錄型 ctx 直接呼叫頁面的 wfgDrawInternalRows()（與畫面同一支），收集 RX DE／TX DE
        的資料標籤（D0…）位置，換回 line：RX D0 必須在每個 frame 的 Line 0；TX D0 在 First Line Read。
        MNT Single、MNT Dual、NB（E503）Single／Dual 各一組。
     T  TX DE 的 D0 位置（每一組）輸出成 JSON，改前改後比對（WFG_PAGE 指向改前的副本再跑一次）。
     H  提示：MNT LB 0／0.5 出現、1／2 不出現；NB ST＋PRE 換算後 ＜ 1 出現、≥ 1 不出現；不擋輸入。
   用法：node tools/check_wfg_rxde_lb_hint.mjs
         WFG_PAGE=<repo 內的頁面檔名>（預設 wfg.html）  WFG_SHOT_DIR=<截圖輸出資料夾>（選用）
         WFG_RXDE_REPORT=<json 路徑>（選用）
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.WFG_PAGE || 'wfg.html';
const SHOT = process.env.WFG_SHOT_DIR || '';
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer(async (req, res) => {
  try {
    const p = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    let buf = await readFile(p);
    /* 測試專用：在主 IIFE 收尾前塞一個作用域內的 eval，讀得到 wfgFrame／wfgDrawInternalRows 等內部名稱。
       只存在於這支測試伺服器回應的內容裡，repo 與線上的 wfg.html 不含它。 */
    if (p === join(REPO, PAGE)) {
      const s = buf.toString('utf8'), i = s.lastIndexOf('})();', s.lastIndexOf('</script>'));
      if (i < 0) throw new Error('找不到主 IIFE 收尾');
      buf = Buffer.from(s.slice(0, i) + 'window.__wfgEval = function(__s){ return eval(__s); };\n' + s.slice(i), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const port = 9300 + Math.floor(Math.random() * 600);
const prof = await mkdtemp(join(tmpdir(), 'wfg-rxde-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1700,1000', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { } await sleep(200); }
if (!targets) { console.error('🛑 Chrome 起不來'); process.exit(2); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const exc = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
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
await send('Page.navigate', { url: `${ORIGIN}/${PAGE}#wfg` });
for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
await sleep(1500);

/* 設定：型號（走下拉的 onchange 路徑）、gate（走 radio 的 onchange 路徑） */
const setup = (model, gate) => evIn(`(()=>{
  const sel=document.getElementById('wfg-ui-tcon'); sel.value=${JSON.stringify(model)}; wfgCodeOnTconChange(sel.value);
  const r=[...document.querySelectorAll('input[name="wfg-gate"]')].find(x=>x.value===${JSON.stringify(gate)});
  r.checked=true; wfgOnParamChange();
  if(!wfgTconInternalMode){ const cb=document.getElementById('wfg-tcon-internal-cb'); cb.checked=true; wfgToggleTconInternal(true); }
  return {model:wfgTconKey(), gate:wfgFrame.gateType, nb:wfgFlrIsNb()};
})()`);

/* 記錄型 ctx 畫一次內部列，收集 RX／TX 列的 D0 標籤，換回 line（每條 line 200px）。 */
const PROBE = `(()=>{
  const PX=200, X0=100, rec=[];
  const ctx=new Proxy({}, { get(t,k){ if(k in t) return t[k];
      if(k==='fillText') return (s,x,y)=>rec.push([String(s),x,y]);
      if(k==='measureText') return s=>({width:String(s).length*6});
      return ()=>{}; }, set(t,k,v){ t[k]=v; return true; } });
  const isDual=wfgFrame.gateType==='dual';
  const vtv=isDual?wfgFrame.vtotal*2:wfgFrame.vtotal;
  const dpl=isDual?wfgFrame.htotal/4:wfgFrame.htotal/2;
  const pr=_wfgPromotedRx, pt=_wfgPromotedTcon; _wfgPromotedRx=-1; _wfgPromotedTcon=-1;
  try { wfgDrawInternalRows(ctx, 0, 1e9, 1e9, 0, vtv+6, vtv+6, l=>X0+l*PX, vtv, dpl); }
  finally { _wfgPromotedRx=pr; _wfgPromotedTcon=pt; }
  const rxY=WFG_AXIS_H+wfgIrRowYFiltered(_wfgIrOrder.indexOf(1)), txY=WFG_AXIS_H+wfgIrRowYFiltered(_wfgIrOrder.indexOf(3));
  const d0=(y0)=>rec.filter(r=>/^D?0(\\(|$)/.test(r[0]) && r[2]>=y0 && r[2]<y0+WFG_INTERNAL_ROW_H).map(r=>Math.floor((r[1]-X0)/PX));
  return { vtv, flr:wfgLbShift(), rx:d0(rxY), tx:d0(txY) };
})()`;

const report = { page: PAGE, cases: {} };
const CASES = [
  { k: 'MNT-Single EM01', model: 'em01', gate: 'single', lb: '3' },
  { k: 'MNT-Dual EM01', model: 'em01', gate: 'dual', lb: '3' },
  { k: 'NB-Single E503', model: 'e503', gate: 'single', st: '4', pre: '1' },
  { k: 'NB-Dual E503', model: 'e503', gate: 'dual', st: '5', pre: '1' },
];
for (const c of CASES) {
  await setup(c.model, c.gate);
  if (c.lb) await evIn(`wfgOnLineBufferChange(${JSON.stringify(c.lb)})`);
  else await evIn(`wfgOnNbStLineRdChange(${JSON.stringify(c.st)}); wfgOnNbPreBlkRdChange(${JSON.stringify(c.pre)})`);
  const r = await evIn(PROBE);
  report.cases[c.k] = r;
  console.log(`  ${c.k}: ${JSON.stringify(r)}`);
  /* RX D0：frame 0 與 frame 1 都要落在該 frame 的 Line 0 */
  check(`R ${c.k} RX DE 第 0 條＝Line 0（兩個 frame）`, r.rx, [0, r.vtv]);
  /* TX D0：維持原位 ＝ First Line Read（＝ lineInFrame − wfgLbShift() 的 0 點） */
  check(`T ${c.k} TX DE 第 0 條仍在 First Line Read`, r.tx, [r.flr, r.vtv + r.flr]);
}

/* ── H：Line Buffer ＜ 1 提示 ── */
const HINT = `(()=>{const h=document.getElementById('wfg-lb-min-hint');
  return { shown: !!h && h.style.display!=='none' && !!h.textContent, text: h?h.textContent:null,
           lb: wfgLineBuffer, input: document.getElementById('wfg-linebuf').value };})()`;
const H = [
  { k: 'MNT Single LB=0', model: 'em01', gate: 'single', lb: '0', want: true, lbv: 0 },
  { k: 'MNT Dual LB=0.5', model: 'em01', gate: 'dual', lb: '0.5', want: true, lbv: 0.5 },
  { k: 'MNT Dual LB=0', model: 'em01', gate: 'dual', lb: '0', want: true, lbv: 0 },
  { k: 'MNT Single LB=1', model: 'em02', gate: 'single', lb: '1', want: false, lbv: 1 },
  { k: 'MNT Dual LB=1.5', model: 'e512', gate: 'dual', lb: '1.5', want: false, lbv: 1.5 },
  { k: 'NB Single ST=0 PRE=0', model: 'e503', gate: 'single', st: '0', pre: '0', want: true, lbv: 0 },
  { k: 'NB Single ST=1 PRE=0', model: 'e503', gate: 'single', st: '1', pre: '0', want: false, lbv: 1 },
  { k: 'NB Single ST=0 PRE=1', model: 'e501a', gate: 'single', st: '0', pre: '1', want: false, lbv: 1 },
  { k: 'NB Dual ST=1 PRE=0 (=0.5)', model: 'e503', gate: 'dual', st: '1', pre: '0', want: true, lbv: 0.5 },
  { k: 'NB Dual ST=1 PRE=1 (=1)', model: 'en01', gate: 'dual', st: '1', pre: '1', want: false, lbv: 1 },
];
for (const c of H) {
  await setup(c.model, c.gate);
  if (c.lb) await evIn(`wfgOnLineBufferChange(${JSON.stringify(c.lb)})`);
  else await evIn(`wfgOnNbPreBlkRdChange('0'); wfgOnNbStLineRdChange(${JSON.stringify(c.st)}); wfgOnNbPreBlkRdChange(${JSON.stringify(c.pre)})`);
  const s = await evIn(HINT);
  check(`H ${c.k} 提示${c.want ? '出現' : '不出現'}、值未被擋（LB=${c.lbv}）`, [s.shown, s.lb], [c.want, c.lbv]);
  if (c.want) check(`H ${c.k} 文案`, s.text, `Line Buffer 需 ≥ 1（目前 ${c.lbv}，會同時讀寫同一條 buffer）`);
}
/* 提示跟著語言切換；TCON 內部運算關掉時不顯示 */
await setup('em01', 'dual'); await evIn(`wfgOnLineBufferChange('0.5')`);
await ev(`applyLang('en')`).catch(() => {});
const en = await evIn(HINT);
check('H 切 English 後提示換成英文', /^Line Buffer must be ≥ 1 \(now 0\.5/.test(en.text || ''), true);
await ev(`applyLang('zh-TW')`).catch(() => {});
await evIn(`(()=>{const cb=document.getElementById('wfg-tcon-internal-cb'); cb.checked=false; wfgToggleTconInternal(false);})()`);
check('H 關掉 TCON 內部運算時提示隱藏', (await evIn(HINT)).shown, false);
await evIn(`(()=>{const cb=document.getElementById('wfg-tcon-internal-cb'); cb.checked=true; wfgToggleTconInternal(true);})()`);

/* ── 截圖（選用）：MNT Single LB=3 的 frame 交界（RX D0 對 Line 0）＋ Dual LB=0.5 的提示 ── */
async function shot(name, clipExpr) {
  if (!SHOT) return;
  mkdirSync(SHOT, { recursive: true });
  const clip = await evIn(clipExpr);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
  writeFileSync(join(SHOT, name), Buffer.from(r.result.data, 'base64'));
  console.log('  📷 ' + join(SHOT, name));
}
if (SHOT) {
  await setup('em01', 'single'); await evIn(`wfgOnLineBufferChange('3')`);
  await evIn(`(()=>{const v=wfgFrame.vtotal; wfgViewStart=v-4; wfgViewEnd=v+6; wfgRender();})()`);
  await sleep(600);
  await shot(`rxde_${PAGE.replace(/\W+/g, '_')}.png`, `(()=>{const c=document.getElementById('wfg-canvas').getBoundingClientRect();
    return {x:Math.max(0,c.left), y:Math.max(0,c.top), width:Math.min(c.width,1400), height:Math.min(c.height,260)};})()`);
  await setup('em01', 'dual'); await evIn(`wfgOnLineBufferChange('0.5')`); await sleep(300);
  await shot(`lbhint_${PAGE.replace(/\W+/g, '_')}.png`, `(()=>{const g=document.getElementById('wfg-tcon-settings-group').getBoundingClientRect();
    return {x:Math.max(0,g.left-4), y:Math.max(0,g.top-4), width:Math.min(g.width+8,1600), height:g.height+8};})()`);
}

check('整段沒有 JS 例外', exc, []);
ws.close(); chrome.kill(); srv.close();
if (process.env.WFG_RXDE_REPORT) writeFileSync(process.env.WFG_RXDE_REPORT, JSON.stringify({ pass, fail, lines, ...report }, null, 1));
console.log(`\n${fail ? '✗' : '✓'} ${pass} 通過／${fail} 失敗`);
process.exit(fail ? 1 : 0);
