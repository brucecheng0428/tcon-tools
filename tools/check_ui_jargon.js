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
/* 🔴 v1.24.0：文案已大量搬進 common/i18n.js，那一份由下面「第一關之二」掃。 */

/* 🔴 例外，兩類，都刻意寫得很窄：

   (A) `dbgonly` 標記的元素 —— debug 區存在的目的**就是**把實作攤開給我們自己看，
       Bruce 也要靠它 A/B 量測。把它跟主畫面文案套同一把尺是用錯尺。
       只豁免「這一行標了 dbgonly」，不是整個檔。

   (B) 下面這張 ALLOW 表 —— **一次一條、每條都要寫理由**。
       目前只有一條：三相時脈那個 debug 開關的狀態 log。Bruce 2026-09-19 明確要求
       「一次量完三相開與關兩種」，log 不寫清楚是哪一種，他量完也對不起來。
       🔴 加任何一條進這張表都要問：使用者**真的需要**這個詞才做得了事嗎？
          答案是「不需要，只是我懶得換句話說」的話，就去換句話說。 */
const ALLOW = [
  /i2ctLog\('三相時脈 ⇒ '/,      /* debug 開關的狀態回報，見上 (B) */
];

/* 禁用詞。key = 正則，value = 建議替代說法（訊息裡直接告訴下一個人要寫什麼）。 */
const BANNED = [
  [/\bMPSSE\b/i,      '改用「快速模式」／「一般模式」'],
  [/三相/,             '不要提時脈實作，使用者只需要知道快不快、對不對'],
  [/\bdivisor\b/i,     '同上'],
  [/USB\s*往返/,       '改講「耗時」或「快幾倍」'],
  [/\blibMPSSE\b(?!\.dll)/, '改用「一般模式」（libMPSSE.dll 當檔名時豁免）'],
  [/\bFT_[A-Za-z]+\b/, '不要在畫面上出現 D2XX API 名稱'],
  [/逐\s*byte\s*路徑/, '改用「一般模式」'],
  /* ═══ 🔴 v1.18.2：使用者可見文案不得寫死特定工具名 ═══════════════════════
     Bruce 2026-09-19：「如果我在 I2C 那邊按中斷，**不要寫原廠 PQ Tool 可以接手，
     因為不一定是 PQ tool 喔**」。他是對的 —— 會來搶同一支治具的還有 EM01／EM02
     的 TCON UI、他自己寫的 Python UI、DG 量測，以及任何用這支治具的程式。
     寫死一個名字既不準確，換了工具還會誤導。
     🔴 **不可以改成「原廠 UI／原廠工具」** —— 他自己寫的那支不是原廠的。
        一律用「別的程式／其他程式／別的工具」這種泛稱。
     ⚠️ 註解裡當**技術依據**引用（`RomCodeProcessUI.py:31721`、
        `xCtrl_FTDI_I2C.cs:141` 之類）**要留著** —— 那是證據來源，砍掉就失去可追溯性。
        這支檢查本來就會整段跳過註解，所以不會誤殺。 */
  [/PQ\s*Tool/i,        '不要寫死工具名，改用「別的程式」'],
  [/RomCodeProcessUI/,  '同上'],
  [/原廠\s*(PQ|UI|工具)/, '「原廠」也不準：他自己寫的 UI 也會來搶治具，改用「別的程式」'],
  [/dg-measure\.html/,  '不要在這一頁點名另一頁（下載包裡早就沒有 html 了）'],
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
  let inScript = false, dbgSpan = 0;
  lines.forEach((line, i) => {
    const opened = /<script\b/i.test(line), closed = /<\/script\s*>/i.test(line);
    const wasScript = inScript;
    if (opened && !closed) inScript = true;
    else if (closed) inScript = false;
    /* (A) debug 區的元素豁免；(B) ALLOW 表逐條豁免。見檔案上方的說明。
       🔴 `dbgonly` 通常標在**父元素**（`<label class="dbgonly">`），要豁免的字卻在
       下一行的 `<input>` 後面，所以豁免範圍要涵蓋開標籤之後幾行。
       用 3 行的固定跨度（一個 label 就這麼長），而不是去做 HTML 解析 ——
       跨度寫死才不會不小心把整段都豁免掉。 */
    if (/\bdbgonly\b/.test(line)) dbgSpan = 3;
    if (dbgSpan > 0) { dbgSpan--; return; }
    if (ALLOW.some(re => re.test(line))) return;
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
/* ═══ 🔴🔴 第一關之二：`common/i18n.js` 裡的 `i2c.*` 文案（v1.24.0 補）════════
   **這一段是本閘門的救命稻草。** v1.24.0 把 i2c.html 整頁三語化，使用者看得到的
   每一句話都從 HTML／JS 搬進了 `common/i18n.js` —— 上面那一關只掃 `i2c.html`，
   搬完之後它**看到的字幾乎歸零，卻會照樣印綠燈**。
   這正是 CLAUDE.md 記著的那一種失效：「檢查工具看不到第二份東西所以一直全綠」。
   ⇒ 文案搬到哪裡，閘門就要跟到哪裡。

   只取 key 以 `i2c.` 開頭的那些條目的**值**（三種語言都掃）；
   其他工具的 key 不在 Bruce 這條指示的範圍內，不連坐。
   註解行照樣跳過（`stripComments` 已經處理）。 */
/* 🔴 逐 key 的豁免，**一條一個理由**，與上面 ALLOW 表同一條規矩。
   這裡不是放寬 BANNED 的樣式（那會讓整張表一起失效），而是點名三個 key ——
   點名的東西日後一眼就看得到，也隨時可以被質疑。 */
const I18N_ALLOW_KEYS = {
  /* 這兩個是 debug 區那個「三相時脈」開關本身與它的狀態 log。
     它們在 i2c.html 裡本來就已經豁免（開關那一行標了 `dbgonly`＝規則 A；
     log 那一行在上面的 ALLOW 表裡＝規則 B），搬進字典之後不該因為換了位置就變成違規。
     Bruce 2026-09-19 明確要求「一次量完三相開與關兩種」，log 不寫是哪一種他對不起來。 */
  'i2c.chk3Phase': 'debug 區的開關，i2c.html 裡原本就由 dbgonly 豁免',
  'i2c.log3Phase': 'debug 開關的狀態 log，原本就在 ALLOW 表裡',
  /* 這一條的 zh-TW 原文是 v1.22.0 就在畫面上的既有文案，本來就寫著
     「12 MHz / 2(div+1) 的公式」與「分頻值」—— 上面那一關放它過只是因為
     BANNED 沒有中文樣式，不是因為它乾淨。英文只是**忠實翻譯同一句話**。
     🔴 而且這個詞在這裡是必要的：這句話存在的唯一目的就是告訴他
     「你填的 kHz 在分頻公式下不存在」，拿掉公式他就不知道該改成什麼。
     （要收掉的話該連 zh-TW 一起重寫，那是另一次 UI 文案改動，不在本版範圍。） */
  'i2c.errClkDiv': 'zh-TW 原文（v1.22.0 既有）本來就講分頻公式，英文為忠實翻譯',
};
const I18N_FILE = path.join(ROOT, 'common', 'i18n.js');
if (fs.existsSync(I18N_FILE)) {
  scanned++;
  const src = stripComments(fs.readFileSync(I18N_FILE, 'utf8')).split('\n');
  let curKey = null;
  src.forEach((line, i) => {
    const km = line.match(/'([a-zA-Z0-9]+\.[A-Za-z0-9_]+)'\s*:/);
    if (km) curKey = km[1];
    if (!curKey || !curKey.startsWith('i2c.')) return;
    if (I18N_ALLOW_KEYS[curKey]) return;
    /* 只看字串字面值本身（三語的值），不看 key 名字 */
    const vals = line.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) || [];
    const text = vals.filter(v => !/^'(zh-TW|en|zh-CN)'$/.test(v)
                              && !/^'[a-zA-Z0-9]+\.[A-Za-z0-9_]+'$/.test(v)).join('  ');
    if (!text.trim()) return;
    for (const [re, hint] of BANNED) {
      const m = text.match(re);
      if (m) {
        console.log(`  🔴 i18n.js:${i + 1}  ${curKey} 出現「${m[0]}」 ⇒ ${hint}`);
        console.log(`       ${line.trim().slice(0, 110)}`);
        bad++;
        break;
      }
    }
  });
}

/* ═══ 🔴 第二關：bridge 回傳的 `err` 字串（v1.16.0 補）══════════════════════
   為什麼要補：2026-09-19 這一行原封不動出現在 Bruce 的畫面上 ——
     `write is not implemented on the vendor DLL path yet (SendBytesEx unwired);
      switch off the fast path to write`
   三個實作名詞，還叫他去關一個他不該知道存在的東西。上面那一關只掃 i2c.html，
   **完全沒有看到它**，因為那句話的出處是 C 檔。
   ⇒ 錯誤字串是**會被端到使用者面前的文案**，即使它住在 bridge 裡。

   網頁端另外有 `i2ctErrText()` 負責翻譯（第一道防線），這一關是第二道：
   萬一哪天有人繞過翻譯直接顯示，字串本身也不該帶實作名詞。
   🔴 只掃 `"err":"…"`，不掃 `logline(...)` —— log 就是要寫實作細節的地方。 */
const ERR_BANNED = [
  [/\bvendor\b/i,        '不要提是哪一支 DLL，講「這條路徑」或直接講後果'],
  [/SendBytesEx|GetBytesEx/, '不要出現 API 名稱'],
  [/\bMPSSE\b/i,         '同上'],
  [/fast path|快速路徑/i, '使用者不該知道有「fast path」這種東西'],
  [/\bDLL\b/,            '不要提 DLL'],
  [/\bFT_[A-Za-z]+\b/,   '不要出現 D2XX API 名稱'],
  [/unwired|not implemented/i, '不要用「還沒接上」這種開發者說法'],
];
const CFILE = path.join(ROOT, 'tools', 'i2c-bridge', 'i2c_bridge.c');
if (fs.existsSync(CFILE)) {
  scanned++;
  const csrc = fs.readFileSync(CFILE, 'utf8').split('\n');
  csrc.forEach((line, i) => {
    /* C 原始碼裡長這樣：\"err\":\"…\" */
    const re = /\\"err\\":\\"([^\\]*)\\"/g;
    let m;
    while ((m = re.exec(line))) {
      for (const [rx, hint] of ERR_BANNED) {
        const hit = m[1].match(rx);
        if (hit) {
          console.log(`  🔴 i2c_bridge.c:${i + 1}  err 字串裡出現「${hit[0]}」 ⇒ ${hint}`);
          console.log(`       "${m[1].slice(0, 100)}"`);
          bad++;
          break;
        }
      }
    }
  });
}

/* ═══ 🔴 第三關：`lasterr_set(...)` 的文案（v1.13.0 補）═══════════════════
   為什麼要補：第二關只認字面上的 `\"err\":\"…\"`。v1.13.0 起失敗原因改成先存進
   `g_lastErr`、回覆時用 `%s` 帶出去 ——「err 的內容」與「組 err 的那一行」
   從此不在同一行，第二關**一個字都掃不到**。實測：第一版的訊息裡寫著
   「the MPSSE bit stream is misaligned」，第二關照樣回報通過。

   🔴 這正是 CLAUDE.md 記的那一類錯：**判準比它要管的東西窄，於是變成假防線。**
   假防線比沒有防線更糟 —— 它會讓下一個人以為已經檢查過了。
   ⇒ 判準改成「這個字串最後會不會被端到使用者面前」，而不是「它長什麼樣子」。
   log 照舊不管（`logline(...)` 就是要寫實作細節的地方）。 */
{
  const csrcAll = fs.existsSync(CFILE) ? fs.readFileSync(CFILE, 'utf8') : '';
  /* 取出每一個 lasterr_set( … ) 呼叫，把裡面所有的 "…" 字面值接起來再判。
     訊息是跨行的相鄰字串常數，所以一定要先接起來 —— 逐行掃會把
     「… the MPSSE bit」這種剛好斷在詞中間的情況漏掉。 */
  const callRe = /lasterr_set\s*\(/g;
  let m;
  while ((m = callRe.exec(csrcAll))) {
    let i = m.index + m[0].length, depth = 1, lits = '';
    while (i < csrcAll.length && depth > 0) {
      const ch = csrcAll[i];
      if (ch === '(') { depth++; i++; continue; }
      if (ch === ')') { depth--; i++; continue; }
      if (ch === '"') {
        i++;
        while (i < csrcAll.length && csrcAll[i] !== '"') {
          if (csrcAll[i] === '\\') { lits += csrcAll[i + 1]; i += 2; continue; }
          lits += csrcAll[i]; i++;
        }
        i++; continue;
      }
      i++;
    }
    const lineNo = csrcAll.slice(0, m.index).split('\n').length;
    for (const [rx, hint] of ERR_BANNED) {
      const hit = lits.match(rx);
      if (hit) {
        console.log(`  🔴 i2c_bridge.c:${lineNo}  lasterr_set 的文案裡出現「${hit[0]}」 ⇒ ${hint}`);
        console.log(`       "${lits.slice(0, 120)}"`);
        bad++;
        break;
      }
    }
  }
}

if (bad) {
  console.log(`\n🔴 使用者可見文案含實作名詞：${bad} 處（掃了 ${scanned} 個檔）`);
  process.exit(1);
}
console.log(`✅ 使用者可見文案沒有實作名詞（掃了 ${scanned} 個檔，含 bridge 的 err 字串）`);
