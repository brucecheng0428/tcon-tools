/* ═══════════════════════════════════════════════════════════════════════════
   check_i18n_descriptor_leak.js — i18n **描述子**不得以原形出現在畫面上，
                                   也不得從測試掛勾漏出去
   ───────────────────────────────────────────────────────────────────────────
   背景（2026-09-20，i2c v1.24.1）：

   i2c.html 三語化（v1.24.0）之後，所有「之後才要翻譯」的文字在內部一律存成
   **描述子** `{ k: 'i2c.opWrite' }`／`{ k: '…', v: {…} }`，要在渲染的那一刻才
   經 `i2ctSrcTxt()` 轉成當下語言的字。共有 50 幾處這樣的值：連線狀態、
   A／B 來源標籤、計時表的 kind／path／verdict、下載橫幅的理由、進度列的 label…

   🔴 這一類錯的長相是**靜默**的：
      · 漏掉 `i2ctSrcTxt()` 的地方，JS 不會報錯，畫面會印出 `[object Object]`
        或（若中間經過 JSON.stringify）`{"k":"i2c.opWrite"}`。
      · **只用一種語言看畫面時完全正常**，因為 zh-TW 的 HTML 預設字還在。
      · v1.24.0 實際漏掉一處：`__i2ct.progress()` 直接回內部狀態，
        同一批改的 `srcA`／`srcB`／`writeSource` 都補了 `i2ctSrcTxt()`，
        單單漏了它 —— 自檢第 63 組報 got={"k":"i2c.opWrite"}。
        （那一次畫面其實是對的，但「看內部」與「看畫面」給出不同答案這件事
        本身就會讓人誤判成畫面壞掉，事實上也真的誤判了。）

   🔴 正反兩面都驗（NB code／EM01／E512 三次教訓的通則）：
      正面 ＝ 六種會存描述子的狀態、三種語言，畫面上都要是**該語言的字**；
      反面 ＝ 故意把描述子塞進畫面，這支**必須**抓到。反面那一條不通過
      就代表探針本身失效，整支以失敗收場。

   用法：
      node tools/check_i18n_descriptor_leak.js [i2c.html]
   相依：jsdom（與 tools/i2c_tool_selftest.js 同一份，不進版控）。
      找不到時**擋下 commit**，不是略過 —— 與 tools/hooks/pre-commit 裡
      rc=2 那一段同一個原則：檢查失效不當作通過。
         cd <repo> && npm install jsdom
      或 NODE_PATH=<某處>/node_modules node tools/check_i18n_descriptor_leak.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('🛑 載入不到 jsdom ⇒ 本檢查跑不起來。');
  console.log('   安裝：cd ' + path.join(__dirname, '..') + ' && npm install jsdom');
  console.log('   （或設 NODE_PATH 指向已有的 node_modules）');
  console.log('   🔴 刻意不「找不到就放行」：檢查失效不當作通過。');
  process.exit(2);
}

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'i2c.html');
const repoDir = path.dirname(path.resolve(htmlPath));
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repoDir, src.split('?')[0]);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
});

/* 「看起來像描述子」的判準：物件、有字串 k、除了 k/v 之外沒有別的欄位。
   用結構判而不是比對某幾個 key —— 新增的 key 不必回頭改這支。 */
function isDescriptor(o) {
  return !!o && typeof o === 'object' && !Array.isArray(o)
      && typeof o.k === 'string'
      && Object.keys(o).every(kk => kk === 'k' || kk === 'v');
}
function findDescriptors(o, trail, out, seen) {
  if (out.length > 8 || o === null || typeof o !== 'object') return out;
  seen = seen || new Set();
  if (seen.has(o)) return out;
  seen.add(o);
  if (isDescriptor(o)) { out.push(trail + ' = ' + JSON.stringify(o)); return out; }
  for (const kk of Object.keys(o)) findDescriptors(o[kk], trail + '.' + kk, out, seen);
  return out;
}

let bad = 0, n = 0;
const fail = (msg, detail) => { bad++; console.log('   🔴 FAIL  ' + msg); if (detail) console.log('            ' + detail); };
const pass = (msg) => console.log('     ok    ' + msg);

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/i2c.html',
  beforeParse(w) {
    /* 不連線：WebSocket 換成永遠停在 CONNECTING 的空殼（本檢查不驗通訊）。 */
    w.WebSocket = function () { this.readyState = 0; };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
});
const win = dom.window, doc = win.document;

/* 🔴 `document.body.textContent` **包含 `<script>` 的原始碼**，而 i2c.html 的註解
   裡就寫著 `{"k":"i2c.opWrite"}`（在講這個 bug）⇒ 直接掃會整片假警報，而且
   假警報比沒有防線更糟（CLAUDE.md 對恆真式判準下過同一個結論）。
   只收真正會被人看到的文字節點：跳過 script／style／template／noscript。 */
function visibleText() {
  const SKIP = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1 };
  let out = '';
  (function walk(el) {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1 && !SKIP[c.tagName]) walk(c);
    }
  })(doc.body);
  return out;
}

/* 掃整份文件：可見文字 ＋ 使用者看得到／輔助技術讀得到的屬性。 */
function scanScreen(tag) {
  n++;
  const hits = [];
  const txt = visibleText();
  if (txt.indexOf('{"k":') >= 0) hits.push('畫面文字含 {"k":');
  if (txt.indexOf('[object Object]') >= 0) hits.push('畫面文字含 [object Object]');
  Array.prototype.forEach.call(doc.querySelectorAll('[title],[aria-label],[placeholder]'), el => {
    ['title', 'aria-label', 'placeholder'].forEach(a => {
      const v = el.getAttribute(a);
      if (v && (v.indexOf('{"k":') >= 0 || v.indexOf('[object Object]') >= 0))
        hits.push(a + '="' + v + '" 於 <' + el.tagName.toLowerCase() + ' id=' + (el.id || '-') + '>');
    });
  });
  if (hits.length) { fail(tag, hits.join(' ／ ')); return false; }
  pass(tag); return true;
}

setTimeout(() => {
  console.log('── i18n 描述子外洩檢查（' + path.basename(htmlPath) + '）' + '─'.repeat(20));

  /* 三語 × 六種會存描述子的狀態。每一種語言都要看到**那個語言的字**，
     只驗「沒有物件字樣」是不夠的 —— 沒翻到時也可能是空字串。 */
  const CASES = [
    /* linked 取 i18n.js 的 `i2c.stLinkedOwn` 三語原文（照抄，不是自己想一個）。 */
    { lang: 'zh-TW', write: '寫入',  linked: '已連線（本頁持有 I2C）' },
    { lang: 'zh-CN', write: '写入',  linked: '已连接（本页持有 I2C）' },
    { lang: 'en',    write: 'Write', linked: 'Connected (this page holds I2C)' }
  ];

  for (const c of CASES) {
    try { win.applyLang && win.applyLang(c.lang); } catch (e) {}
    const L = '[' + c.lang + '] ';

    /* ① 進度列（label 是描述子）—— 第 63 組 FAIL 的那一條，驗的是畫面 */
    win.i2ctProgress = { done: 4096, total: 8192, t0: win.i2ctNow ? win.i2ctNow() : 0,
                         label: { k: 'i2c.opWrite' }, batchId: 7 };
    win.i2ctRenderProgress();
    const pt = doc.getElementById('progress').textContent;
    n++;
    if (pt.indexOf(c.write) < 0) fail(L + '進度列畫面上出現「' + c.write + '」', 'got=' + JSON.stringify(pt));
    else pass(L + '進度列畫面上出現「' + c.write + '」');
    scanScreen(L + '① 進度列 label');

    /* ② 連線狀態文字（i2ctSetLink 的 txt 是描述子） */
    win.i2ctSetLink(false, { k: 'i2c.stConnecting' }, 'busy');
    scanScreen(L + '② 連線中');
    win.i2ctSetLink(true, { k: 'i2c.stLinkedOwn' });
    n++;
    if ((doc.getElementById('linktext').textContent || '').indexOf(c.linked) < 0)
      fail(L + '已連線狀態字 ＝「' + c.linked + '」', 'got=' + JSON.stringify(doc.getElementById('linktext').textContent));
    else pass(L + '已連線狀態字 ＝「' + c.linked + '」');
    scanScreen(L + '③ 已連線');

    /* ③ 計時表：kind／path／verdict 三欄全是描述子 */
    win.i2ctNoteTime({ k: 'i2c.kindWrite' }, 64, 123, { k: 'i2c.pathNormal' },
                     { k: 'i2c.vdBadN', v: { n: 3 } }, 'diff');
    win.i2ctNoteTime({ k: 'i2c.kindRead' }, 32, 45, { k: 'i2c.pathFast' });
    scanScreen(L + '④ 計時表 kind／path／verdict');

    /* ④ 下載橫幅的理由 */
    win.i2ctNeedHelper({ k: 'i2c.whyGone', v: { max: 5 } });
    scanScreen(L + '⑤ 下載橫幅 why');

    /* ⑤ A／B 來源標籤 */
    win.i2ctRef = { bytes: new Array(256).fill(0), src: { k: 'i2c.srcRead' } };
    win.i2ctBSrc = { k: 'i2c.srcAMod' };
    try { win.i2ctRenderAB && win.i2ctRenderAB(); win.i2ctUpdateHints && win.i2ctUpdateHints(); } catch (e) {}
    scanScreen(L + '⑥ A／B 來源標籤');

    /* ⑥ 字串拼接那兩條（log 與計時摘要不經 DOM，單獨驗） */
    const tl = win.i2ctTimeLine({ k: 'i2c.opWrite' }, 1000, 500, 64);
    n++;
    if (tl.indexOf('{"k":') >= 0 || tl.indexOf('[object Object]') >= 0 || tl.indexOf(c.write) < 0)
      fail(L + 'i2ctTimeLine() 把 tag 翻成「' + c.write + '」', 'got=' + JSON.stringify(tl));
    else pass(L + 'i2ctTimeLine() 把 tag 翻成「' + c.write + '」');

    /* ⑦ 測試掛勾不得把描述子漏給測試 —— v1.24.0 漏的就是這一類。
       深掃回傳值，不是只看某一個欄位名（新增欄位不必回頭改這支）。 */
    const HOOKS = ['progress', 'srcA', 'srcB', 'writeSource'];
    for (const h of HOOKS) {
      n++;
      let v;
      try { v = win.__i2ct[h](); } catch (e) { fail(L + '掛勾 ' + h + '() 叫得動', e.message); continue; }
      const leaks = findDescriptors(v, h + '()', []);
      if (leaks.length) fail(L + '掛勾 ' + h + '() 回的是譯好的字，不是描述子', leaks.join(' ／ '));
      else pass(L + '掛勾 ' + h + '() 沒有漏描述子');
    }
  }

  /* ══ 反面：探針本身要抓得到 ══════════════════════════════════════════════ */
  console.log('── 反面測試（這兩條「必須」被抓到，否則整支失效）' + '─'.repeat(12));
  {
    const before = bad;
    doc.getElementById('progress').textContent = JSON.stringify({ k: 'i2c.opWrite' });
    scanScreen('反面 A：畫面塞入 {"k":"i2c.opWrite"}');
    doc.getElementById('progress').textContent = String({});     /* [object Object] */
    scanScreen('反面 B：畫面塞入 [object Object]');
    if (bad - before !== 2) { console.log('   🔴🔴 探針失效：故意塞進去卻沒有全部抓到'); bad = bad - before + 1; }
    else { bad = before; console.log('     ok    兩條都被抓到（預期中的 FAIL，已扣回）'); }
  }

  console.log('');
  if (bad) { console.log('🔴 i18n 描述子外洩：' + bad + ' / ' + n + ' 項未通過'); process.exit(1); }
  console.log('✅ i18n 描述子沒有外洩：' + n + ' 項全過（三語 × 六種狀態 ＋ 四個測試掛勾）');
  process.exit(0);
}, 400);
