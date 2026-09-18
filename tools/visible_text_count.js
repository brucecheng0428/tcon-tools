/* ═══════════════════════════════════════════════════════════════════════════
   visible_text_count.js — 「預設畫面上有多少字要讀」的可量化指標
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼需要它：Bruce 2026-09-18 連續三次要求「說明文字越少越好」。
      「我覺得有變少」不是數字，下一次一樣會回到老樣子。這一支把它變成
      可比較的數字：**非 debug、預設狀態下，使用者眼睛真的看得到的字元數**。

   算法（刻意保守，寧可高估也不要漏算）：
     · 用 jsdom 載入頁面，跑完它自己的初始化
     · 走訪所有文字節點，逐一往上檢查祖先的 computed display / visibility
       —— `display:none`、`visibility:hidden` 的不算
     · `<details>` 沒有 open 的話，除了 `<summary>` 以外都不算（那是「按了才看到」）
     · script / style / 註解不算
     · 🔴 **交易 log 面板（#log / #dgm-i2c-out）不算** —— 那是跑出來的診斷資料，
       不是要人讀的說明，而且內容隨每次執行而變，算進去會讓數字失去可比性。
       它的字數另外單獨報告（logChars），這樣「診斷有沒有被一起砍掉」也看得到。
     · 空白正規化後計字元數

   用法：
     NODE_PATH=/tmp/h/node_modules node tools/visible_text_count.js <html> [--debug]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = process.argv[2];
const wantDebug = process.argv.indexOf('--debug') >= 0;
/* 預設用**線上 origin** 量：那是 Bruce 說的主路徑。用 127.0.0.1 量的話
   兩頁都會自動連線並自動展開面板，量到的是另一個情境。 */
const originArg = process.argv.indexOf('--local') >= 0
  ? 'http://127.0.0.1:8899/' : 'https://brucecheng0428.github.io/tcon-tools/';
if (!htmlPath) { console.error('usage: visible_text_count.js <html> [--debug]'); process.exit(2); }
const repoDir = path.dirname(path.resolve(htmlPath));

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repoDir, src.split('?')[0]);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
});

const dom = new JSDOM(html, {
  url: originArg + path.basename(htmlPath),
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.navigator.clipboard = { writeText: () => Promise.resolve() };
    try { win.navigator.serial = { getPorts: () => Promise.resolve([]), addEventListener() {} }; } catch (e) {}
    win.addEventListener('error', () => {});
  }
});

setTimeout(() => {
  const win = dom.window, doc = win.document;
  /* dg-measure 的 I2C 面板是對話框，預設收著 —— 那一整片是 Bruce 實際看到的東西，
     所以另外提供 --open-i2c 把它打開再量。兩個數字都要報。 */
  if (process.argv.indexOf('--open-i2c') >= 0) {
    const b = doc.getElementById('dgm-i2c-open'); if (b) b.click();
  }
  if (wantDebug) {
    doc.body.classList.add('dbg');
    if (win.dgmI2cProbe && typeof win.dgmI2cProbe.needHelper === 'function') { /* dg 沒有 dbg class，見下 */ }
  }
  /* 🔴 兩件事要分開判，第一版把它們混在一起，結果**收在 display:none 的
     <details> 裡的 <summary> 被算成看得見** —— 數字會偏高（保守方向，但不準）。
       cssHidden : 祖先鏈上有沒有 display:none / visibility:hidden / .dgm-hidden
       inClosedDetailsBody : 在一個沒展開的 <details> 裡，而且不是它的 <summary>
     只有「CSS 沒藏、而且不是收起來的內文」才算使用者看得到。 */
  function cssHidden(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = win.getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (n.classList && n.classList.contains('dgm-hidden')) return true;
    }
    return false;
  }
  function inClosedDetailsBody(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.tagName === 'SUMMARY') return false;          // summary 本身看得見
      if (n.tagName === 'DETAILS' && !n.open) return true;
    }
    return false;
  }
  const LOGS = ['log', 'dgm-i2c-out', 'dgm-log'];
  function inLog(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement)
      if (n.id && LOGS.indexOf(n.id) >= 0) return true;
    return false;
  }
  const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT, null);
  let chars = 0, nodes = 0, logChars = 0;
  const samples = [];
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const p = t.parentElement;
    if (!p) continue;
    const tag = p.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') continue;
    const txt = (t.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    if (cssHidden(p) || inClosedDetailsBody(p)) continue;
    if (inLog(p)) { logChars += txt.length; continue; }
    chars += txt.length; nodes++;
    samples.push(txt);
  }
  console.log(JSON.stringify({
    file: path.basename(htmlPath),
    mode: wantDebug ? 'debug' : 'normal',
    visibleChars: chars,
    visibleTextNodes: nodes,
    logChars: logChars,
    longestLines: samples.sort((a, b) => b.length - a.length).slice(0, 8),
    /* --dump 時把**每一段看得到的文字**照順序印出來，人工逐項判「留/刪/收起來」 */
    all: process.argv.indexOf('--dump') >= 0 ? samples : undefined
  }, null, 2));
  process.exit(0);
}, 900);
