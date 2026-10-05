// LA 解碼結果卡片：收折狀態下按「最大化」不可一片空白（wfg v4.53.2，P102，Bruce 2026-10-05 回報）
//
// 跑法（repo 根目錄）：node tests/la/decode_max_collapsed.test.mjs
//   - 自己起一個 127.0.0.1 靜態伺服器、自己開 headless Chrome（獨立暫存 profile），不碰使用者的瀏覽器。
//   - 需要 macOS 的 /Applications/Google Chrome.app（或用 CHROME=<路徑> 指定）。
//   - 全過 exit 0，任何一項失敗 exit 1。
//
// 釘住的行為：
//   A. 卡片收折 → ⛶：最大化後表格可見（有列落在可視區），不再是空卡。          ← 修前失敗
//   B. Bruce 原步驟：快捷 eDP AUX → 移除 DP AUX → 收折 → 加回 DP AUX → ⛶。   ← 修前失敗
//   C. 卡片收折時套用「會自動最大化」的快捷設定：表格可見。                    ← 修前失敗
//   D. 收折 → ⛶ → ⇱：還原後回到收折（使用者原本的狀態）。
//   E. 最大化時點標題列：退出最大化並收折，不會留下一張撐滿整欄的空卡。
//   F. 一般操作不受影響：展開狀態 ⛶ / ⇱ 照舊，表格可見、還原後仍展開。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  try {
    const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const port = 9300 + Math.floor(Math.random() * 600);
const prof = await mkdtemp(join(tmpdir(), 'la-decode-max-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });

let ws, seq = 0; const pend = new Map();
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pend.set(id, { res, rej })); };
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

const HELPERS = `window.__t = {
  wait: ms => new Promise(r => setTimeout(r, ms)),
  card: () => document.getElementById('wfg-la-decode-card'),
  max: () => document.getElementById('wfg-la-workbench').classList.contains('decode-expanded'),
  collapsed() { return this.card().classList.contains('is-collapsed'); },
  visibleRows() {
    const w = document.querySelector('#wfg-la-decoder-results .wfg-la-decode-table-wrap');
    if (!w || w.clientHeight === 0) return 0;
    const wr = w.getBoundingClientRect();
    return [...w.querySelectorAll('tbody tr')].filter(tr => { const b = tr.getBoundingClientRect(); return b.height > 0 && b.bottom > wr.top + 20 && b.top < wr.bottom; }).length;
  },
  head() { this.card().querySelector(':scope > .wfg-la-meas-head').click(); },
  btn() { document.getElementById('wfg-la-decode-expand-btn').click(); },
  async preset(id) { const s = document.getElementById('wfg-la-quick-preset'); s.value = id; s.dispatchEvent(new Event('change')); await this.wait(2500); },
  async toNormal() { if (this.max()) { this.btn(); await this.wait(400); } },
  removeAux() { document.querySelector('#wfg-la-analyzer-list button[onclick^="wfgLaRemoveAnalyzer"]').click(); },
  async addAux() {
    document.querySelector('#wfg-la-analyzer-card .wfg-la-panel-add').click(); await this.wait(100);
    const s = document.getElementById('wfg-la-analyzer-type'); s.value = 'dp_aux'; s.dispatchEvent(new Event('change')); await this.wait(100);
    document.querySelector('#wfg-la-analyzer-backdrop button.primary').click(); await this.wait(800);
  },
  snap() { return { max: this.max(), collapsed: this.collapsed(), visible: this.visibleRows() }; }
};`;

const CASES = [
  ['A 收折 → ⛶：表格可見', `(async()=>{await __t.preset('edp-aux-anomaly');await __t.toNormal();__t.head();await __t.wait(300);__t.btn();await __t.wait(800);return __t.snap();})()`,
    s => s.max && !s.collapsed && s.visible > 0],
  ['B Bruce 原步驟（移除→收折→加回→⛶）：表格可見', `(async()=>{await __t.preset('edp-aux-anomaly');await __t.toNormal();__t.removeAux();await __t.wait(300);__t.head();await __t.wait(300);await __t.addAux();__t.btn();await __t.wait(800);return __t.snap();})()`,
    s => s.max && !s.collapsed && s.visible > 0],
  ['C 收折時套用會最大化的快捷設定：表格可見', `(async()=>{await __t.preset('edp-aux-anomaly');await __t.toNormal();__t.head();await __t.wait(300);await __t.preset('edp-aux-anomaly');return __t.snap();})()`,
    s => s.max && !s.collapsed && s.visible > 0],
  ['D 收折 → ⛶ → ⇱：還原後回到收折', `(async()=>{await __t.preset('edp-aux-anomaly');await __t.toNormal();__t.head();await __t.wait(300);__t.btn();await __t.wait(600);__t.btn();await __t.wait(500);return __t.snap();})()`,
    s => !s.max && s.collapsed],
  ['E 最大化時點標題列：退出最大化並收折', `(async()=>{await __t.preset('edp-aux-anomaly');await __t.toNormal();__t.btn();await __t.wait(600);__t.head();await __t.wait(500);return __t.snap();})()`,
    s => !s.max && s.collapsed],
  ['F 一般：展開 → ⛶ 可見、⇱ 後仍展開可見', `(async()=>{await __t.preset('edp-aux-anomaly');await __t.toNormal();__t.btn();await __t.wait(800);const a=__t.snap();__t.btn();await __t.wait(600);const b=__t.snap();return {a,b};})()`,
    s => s.a.max && !s.a.collapsed && s.a.visible > 0 && !s.b.max && !s.b.collapsed && s.b.visible > 0],
];

let fail = 0;
try {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); const p = d.id && pend.get(d.id); if (p) { pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const [name, expr, ok] of CASES) {
    await send('Page.navigate', { url: `${BASE}/wfg.html?t=${Date.now()}#la` });
    for (let i = 0; i < 100; i++) { await sleep(200); try { if (await ev(`document.readyState==='complete' && typeof wfgLaQuickPresetChanged==='function'`)) break; } catch {} }
    await sleep(800);
    await ev(HELPERS);
    let s, pass = false;
    try { s = await ev(expr); pass = !!ok(s); } catch (e) { s = String(e.message || e); }
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(s)}`);
  }
} catch (e) { fail++; console.log('FAIL  harness', e.message || e); }
finally { try { ws && ws.close(); } catch {} chrome.kill('SIGKILL'); server.close(); }
console.log(fail ? `${fail} failed` : `all ${CASES.length} passed`);
process.exit(fail ? 1 : 0);
