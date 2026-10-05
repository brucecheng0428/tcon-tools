#!/usr/bin/env node
// Pages 發佈前關卡（P103，2026-10-05）：去註解後的每一頁，在瀏覽器裡要跟原始碼版本表現一致。
//
// 用法：node tools/build/verify-site.mjs <repoRoot> <siteDir>
//   CHROME=<Chrome 執行檔>（預設 macOS 的 /Applications/Google Chrome.app；CI 用 /usr/bin/google-chrome）
//
// 做法：起兩個 127.0.0.1 靜態伺服器（原始碼／去註解版，不同 port＝不同 origin，localStorage 互不影響），
// 用自有暫存 profile 的 headless Chrome 依序打開根目錄每一個 *.html，載入完成後再等 1.5 秒，比對：
//   1. JS 例外（訊息文字，不比行號）  2. console.error  3. 載入失敗的資源（404 等）
//   4. 元素總數  5. 所有 id  6. 畫面文字（document.body.innerText）  7. <title>
// 去註解版多出任何一項差異 → exit 1（workflow 就不發佈，線上維持上一版）。
// 原始碼本身就有的例外會列出來但不擋（那不是去註解造成的）。
// 若某項在「原始碼對原始碼」重跑也會變（時間、亂數），該頁該項記為不穩定、不列入比對，並印出來。
//
// 另外檢查體積上限（防回歸）：wfg.html 去註解後 gzip 不得超過 WFG_GZ_BUDGET。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import crypto from 'node:crypto';

const [, , srcArg, siteArg] = process.argv;
if (!srcArg || !siteArg) { console.error('usage: verify-site.mjs <repoRoot> <siteDir>'); process.exit(2); }
const SRC = resolve(srcArg), SITE = resolve(siteArg);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WFG_GZ_BUDGET = 480 * 1024; // 2026-10-05 去註解後約 368KB；原始未去註解是 909KB
const SETTLE_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const problems = [];

// ── 0. 體積上限
const wfgGz = gzipSync(readFileSync(join(SITE, 'wfg.html')), { level: 6 }).length;
const wfgSrcGz = gzipSync(readFileSync(join(SRC, 'wfg.html')), { level: 6 }).length;
console.log(`wfg.html gzip：原始碼 ${(wfgSrcGz / 1024).toFixed(0)}KB → 發佈版 ${(wfgGz / 1024).toFixed(0)}KB（上限 ${WFG_GZ_BUDGET / 1024}KB）`);
if (wfgGz > WFG_GZ_BUDGET) problems.push(`wfg.html 發佈版 gzip ${wfgGz}B 超過上限 ${WFG_GZ_BUDGET}B`);

// ── 1. 靜態伺服器
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.zip': 'application/zip', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };
function serve(root) {
  const s = createServer(async (req, res) => {
    try {
      let p = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
      if (p.endsWith('/')) p += 'index.html';
      const buf = await readFile(p);
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s)));
}
const srvA = await serve(SRC), srvB = await serve(SITE);
const ORIGIN = { src: `http://127.0.0.1:${srvA.address().port}`, site: `http://127.0.0.1:${srvB.address().port}` };

// ── 2. Chrome（自有暫存 profile）
const port = 9200 + Math.floor(Math.random() * 700);
const prof = await mkdtemp(join(tmpdir(), 'pages-verify-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { } await sleep(200); }
if (!targets) { console.error('🛑 Chrome 起不來'); process.exit(2); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); let sink = null;
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false });
  if (sink) sink(m);
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const firstLine = s => String(s || '').split('\n')[0].replace(/https?:\/\/127\.0\.0\.1:\d+/g, '').slice(0, 200);
async function snap(origin, page) {
  const exc = [], cerr = [], netfail = [];
  sink = m => {
    const p = m.params || {};
    if (m.method === 'Runtime.exceptionThrown') exc.push(firstLine(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') cerr.push(firstLine(p.args.map(a => a.value ?? a.description).join(' ')));
    if (m.method === 'Log.entryAdded' && p.entry.level === 'error' && p.entry.source !== 'javascript' && p.entry.source !== 'console-api') netfail.push(firstLine((p.entry.url || '') + ' ' + p.entry.text));
  };
  await send('Page.navigate', { url: `${origin}/${page}` });
  for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
  await sleep(SETTLE_MS);
  const st = await ev(`(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id).sort().join('|');
    return {title:document.title, n:document.getElementsByTagName('*').length, ids, text:(document.body?document.body.innerText:'')}})()`) || {};
  sink = null;
  return { exc: exc.sort().join('\n'), cerr: cerr.sort().join('\n'), net: netfail.sort().join('\n'), title: st.title, n: st.n, ids: sha(st.ids || ''), text: st.text || '', _ids: st.ids || '' };
}
const KEYS = ['exc', 'cerr', 'net', 'title', 'n', 'ids', 'text'];
const diffKeys = (a, b) => KEYS.filter(k => a[k] !== b[k]);
function firstDiff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: 原「${a.slice(Math.max(0, i - 40), i + 60)}」｜新「${b.slice(Math.max(0, i - 40), i + 60)}」`; }

// ── 3. 每一頁
const pages = readdirSync(SITE).filter(f => f.endsWith('.html')).sort();
console.log(`檢查 ${pages.length} 頁…`);
for (const page of pages) {
  let a = await snap(ORIGIN.src, page), b = await snap(ORIGIN.site, page);
  let d = diffKeys(a, b);
  const unstable = [];
  if (d.length) {
    // 有差異 → 再各跑 3 次。某一項只要「去註解版的某一次結果＝原始碼的某一次結果」就算一致
    // （有些頁面會依時間、連線逾時多長出幾列，同一份原始碼兩次也可能不同）；
    // 原始碼自己每次都不一樣、且去註解版的結果都落在原始碼出現過的值以外 → 才算差異。
    const As = [a], Bs = [b];
    for (let r = 0; r < 3; r++) { As.push(await snap(ORIGIN.src, page)); Bs.push(await snap(ORIGIN.site, page)); }
    d = d.filter(k => !Bs.some(y => As.some(x => x[k] === y[k])));
    for (const k of KEYS) if (new Set(As.map(x => x[k])).size > 1) unstable.push(k);
    if (d.length) { a = As[As.length - 1]; b = Bs[Bs.length - 1]; }
    else if (unstable.length) { /* 只是不穩定，不是去註解造成 */ }
    if (d.length && d.every(k => unstable.includes(k))) {
      // 原始碼本身不穩定的項目：允許，但列出各次的值供人看
      console.log(`  ⚠ ${page}：${d.join(',')} 原始碼每次都不同（${d.map(k => k + '=' + As.map(x => k === 'text' ? sha(x.text) : x[k]).join('/') + ' vs ' + Bs.map(y => k === 'text' ? sha(y.text) : y[k]).join('/')).join('；')}）`);
      d = d.filter(k => k === 'exc'); // JS 例外不放寬
    }
  }
  const pre = a.exc ? `（原始碼本身就有 JS 例外：${a.exc.split('\n').length} 筆）` : '';
  if (!d.length) { console.log(`  ✓ ${page}${unstable.length ? `（不穩定、未比：${unstable.join(',')}）` : ''}${pre}`); continue; }
  for (const k of d) {
    const msg = k === 'text' ? firstDiff(a.text, b.text) : k === 'ids' ? firstDiff(a._ids, b._ids) : `原「${String(a[k]).slice(0, 300)}」｜新「${String(b[k]).slice(0, 300)}」`;
    problems.push(`${page} [${k}] ${msg}`);
  }
  console.log(`  ✗ ${page}：${d.join(',')}`);
}
ws.close(); chrome.kill(); srvA.close(); srvB.close();
await sleep(300); await rm(prof, { recursive: true, force: true }).catch(() => { });
if (problems.length) { console.error('🛑 發佈前關卡失敗（不發佈，線上維持上一版）：\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`✓ 發佈前關卡全過：${pages.length} 頁去註解前後表現一致`);
process.exit(0);
