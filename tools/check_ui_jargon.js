#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_ui_jargon.js — 使用者看得到的地方不准出現實作名詞
   ───────────────────────────────────────────────────────────────────────────
   🔴 起因：Bruce 2026-09-19 經 Dispatch 轉達 ——
      「文案不准出現 MPSSE、三相、divisor、USB 往返這些詞。他只要知道：
        快幾倍、資料一不一樣、能不能開。」

   為什麼要機械檢查而不是「記得」：這些詞是我們**自己查證時天天在講的**，
   寫 UI 文案時最容易順手帶進去，而且帶進去之後頁面照樣跑得好好的 ——
   沒有任何測試會紅，只有 Bruce 看到才會發現。這正是本專案其他閘門的同一種破口
   （見 CLAUDE.md「這些錯在本機測試時都不會出現」）。

   做法：把 HTML 註解與 JS 註解**整段移除**之後再搜。註解裡愛怎麼寫都可以，
   那是給維護者看的；剩下的才是有機會出現在畫面上的字。

   豁免：`libMPSSE.dll` —— 那是使用者真的要去找的**檔名**，不是實作名詞。

   🔴 **只判字串常數與 HTML 文字**，不判識別字。`divisor: function(){}` 這種
      程式內部命名不是文案，抓它只會讓閘門變成噪音，噪音久了就會被 --no-verify。

   🔴 目前只掃 `i2c.html` —— Bruce 的指示是針對這一頁的快慢模式文案。
      `dg-measure.html` 的 I2C 面板另有 5 處同類字樣（MPSSE／libMPSSE），
      屬於另一頁的行為可見變更，已列為待決事項，**不在這一輪自行改掉**。
      等裁示後把檔名加進 FILES 即可。

   用法：node tools/check_ui_jargon.js [檔案...]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_FILES = ['i2c.html'];

/* 禁用詞。key = 正則，value = 建議替代說法（訊息裡直接告訴下一個人要寫什麼）。 */
const BANNED = [
  [/\bMPSSE\b/i,      '改用「快速模式」／「一般模式」'],
  [/三相/,             '不要提時脈實作，使用者只需要知道快不快、對不對'],
  [/\bdivisor\b/i,     '同上'],
  [/USB\s*往返/,       '改講「耗時」或「快幾倍」'],
  [/\blibMPSSE\b(?!\.dll)/, '改用「一般模式」（libMPSSE.dll 當檔名時豁免）'],
  [/\bFT_[A-Za-z]+\b/, '不要在畫面上出現 D2XX API 名稱'],
  [/逐\s*byte\s*路徑/, '改用「一般模式」'],
];

/* 移除註解。HTML 註解、JS 區塊註解，以及行註解（`//` 前面不是 `:`，才不會誤殺
   `https://`）。全部用等長空白取代，行號才不會跑掉。 */
function stripComments(src) {
  const blank = m => m.replace(/[^\n]/g, ' ');
  let s = src.replace(/<!--[\s\S]*?-->/g, blank);
  s = s.replace(/\/\*[\s\S]*?\*\//g, blank);
  s = s.split('\n').map(line => line.replace(/(^|[^:])\/\/.*$/, (m, p1) => p1 + ' '.repeat(m.length - p1.length)))
       .join('\n');
  return s;
}

/* 抽出「使用者有機會看到的字」：字串常數的內容，以及標籤之間的 HTML 文字。
   🔴 不含識別字 —— `divisor: function(){}` 是命名不是文案。 */
function visibleText(line, inScript) {
  const out = [];
  const reStr = /'([^'\\\n]|\\.)*'|"([^"\\\n]|\\.)*"|`([^`\\]|\\.)*`/g;
  let m;
  while ((m = reStr.exec(line))) out.push(m[0].slice(1, -1));
  /* 🔴 只有**不在 <script> 裡**的行才算 HTML 文字。否則 `divisor: function(){}`
     這種純 JS 會被當成畫面上的字 —— 那是命名不是文案，抓它就是誤判。
     （第一版就是這樣誤判的，記在這裡免得下次又改回去。） */
  if (!inScript) {
    const noTags = line.replace(reStr, ' ').replace(/<[^>]*>/g, ' ');
    if (noTags.trim()) out.push(noTags);
  }
  return out.join('  ');
}

const files = process.argv.slice(2).length ? process.argv.slice(2)
                                           : DEFAULT_FILES.map(f => path.join(ROOT, f));
let bad = 0, scanned = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  scanned++;
  const lines = stripComments(fs.readFileSync(f, 'utf8')).split('\n');
  let inScript = false;
  lines.forEach((line, i) => {
    const opened = /<script\b/i.test(line), closed = /<\/script\s*>/i.test(line);
    const wasScript = inScript;
    if (opened && !closed) inScript = true;
    else if (closed) inScript = false;
    const text = visibleText(line, wasScript || opened);
    if (!text.trim()) return;
    for (const [re, hint] of BANNED) {
      const m = text.match(re);
      if (m) {
        console.log(`  🔴 ${path.basename(f)}:${i + 1}  出現「${m[0]}」 ⇒ ${hint}`);
        console.log(`       ${line.trim().slice(0, 110)}`);
        bad++;
        break;                 /* 同一行只報一次，不要洗版 */
      }
    }
  });
}
if (bad) {
  console.log(`\n🔴 使用者可見文案含實作名詞：${bad} 處（掃了 ${scanned} 個檔）`);
  process.exit(1);
}
console.log(`✅ 使用者可見文案沒有實作名詞（掃了 ${scanned} 個檔）`);
