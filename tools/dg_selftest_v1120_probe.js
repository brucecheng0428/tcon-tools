/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v1120_probe.js — dgself v1.12.0 ／ dg v1.72.1 的驗收夾具（jsdom）

   Bruce 2026-09-21／09-22 逐條交辦。這一支釘住其中**用 jsdom 驗得到**的那些；
   版面那幾條（外框、字級、有沒有溢出重疊）jsdom 驗不到，一律走真瀏覽器截圖
   （見檔尾「沒驗到的」與交付回報裡的截圖路徑）。

   ═══ 釘住的條目 ═══════════════════════════════════════════════════════════
     A  硬體三組各自是一個**實體外框**（fieldset），組名在 legend 上；
        T-CON 那一組**包含 DG_EN**，量測儀那一組**不包含**
     B  「黑視窗」這個詞**整頁不再出現**（三語 ＋ 去註解後的原始碼）
     C  步驟 ①／②③／④ 各自一個外框（`.dst-box`），②③ 兩列在同一個框裡
     D  換階等待預設 **300 ms**，清單一格沒少
     E  ②③ 量完的收尾訊息結尾是「請切回 DG 分頁繼續」
     F  DG LUT 數值表**不再收折**（沒有 <details>）、而且是**全表**
     G  左上角那一顆＝「‹ 回到首頁」，而且**共用的 `common.backToHome` 沒被動到**
     I  ④ **沒有按鈕**；回傳成功 ⇒ 自動打勾；回傳失敗 ⇒ **不准打勾**
     J  第 4 部分推送：**沒有 ack 就判定對面不是自檢頁**（不是等 180 秒）

   ═══ 🔴 怎麼避免「自己驗自己」═════════════════════════════════════════════
     · 每一條都配一個突變（M*）：把產品端改壞，對應的斷言必須變紅。
     · 期望值（300、'‹ 回到首頁'、'黑視窗'…）**寫死在本檔**，不從產品端讀。
     · J 那一條**不改產品的常數來加速**，而是把產品自己排的那個計時器當場引爆
       （`p4PushFireTimer()`），走的是同一條 callback。

   用法：node tools/dg_selftest_v1120_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 58 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inlineSrc(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const SELF_SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
const DG_SRC = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(repo, 'common', 'i18n.js'), 'utf8');
const ORIGIN = 'https://example.invalid';
const LANGS = ['zh-TW', 'en', 'zh-CN'];

function fakeWin() {
  const w = { closed: false, msgs: [], focused: 0 };
  w.postMessage = d => w.msgs.push(JSON.parse(JSON.stringify(d)));
  w.focus = () => { w.focused++; };
  return w;
}

async function loadSelf(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(opts.src || SELF_SRC), {
    url: ORIGIN + '/dg-selftest.html' + (opts.qs == null ? '?task=1&step=gray' : opts.qs),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  const opener = (opts.opener === null) ? null : (opts.opener || fakeWin());
  if (opener) Object.defineProperty(w, 'opener', { value: opener, writable: true, configurable: true });
  await sleep(160);
  const P = w.dstProbe;
  P.__renderBtns();
  await sleep(20);
  return { dom, w, doc: w.document, P, errs, opener };
}

async function loadDg(src) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(src || DG_SRC), {
    url: ORIGIN + '/dg.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const win = dom.window;
  try { win.localStorage.clear(); win.sessionStorage.clear(); } catch (e) {}
  const opened = [];
  win.open = function (url) { const w = fakeWin(); w.url = url; opened.push(w); return w; };
  const scrolled = [];
  win.Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.tagName); };
  await sleep(240);
  return { dom, win, doc: win.document, opened, errs, scrolled };
}

/* 去掉 HTML 與 JS 的註解（做法照 tools/check_ui_jargon.js）：註解裡留決策紀錄是
   應該的，不該被當成「畫面上出現這個詞」。 */
function stripComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/* DG 端：走既有的預設資料 ＋ 那顆「計算」鈕，算出一份結果（照抄 v1110 夾具那一支）。 */
async function dgCalc(win, doc, outbit) {
  const sel = doc.getElementById('dg-preset-select');
  sel.value = 'sampleA';
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(120);
  if (outbit) {
    const ob = doc.getElementById('dg-outbit');
    ob.value = String(outbit);
    ob.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(40);
  }
  doc.getElementById('dg-btn-calc').click();
  await sleep(200);
}

(async () => {
  /* ═══════════════════════════════════════════════════════════════════════
     A：硬體三組各自一個實體外框，T-CON 那一組包到 DG_EN
     ═══════════════════════════════════════════════════════════════════════ */
  H('A 外接硬體：三組各自一個外框');
  {
    const { doc } = await loadSelf({ opener: null });
    const groups = ['bridge', 'tcon', 'meter'];
    groups.forEach(g => {
      const el = doc.getElementById('dst-hwgrp-' + g);
      CHECK(!!el, '這一組存在：dst-hwgrp-' + g);
      EQ(el.tagName, 'FIELDSET', '🔴 ' + g + ' 是一個實體外框（<fieldset>，不是只靠分隔線）');
      CHECK(el.classList.contains('dst-box'), '🔴 ' + g + ' 掛著外框樣式 .dst-box', el.className);
      const lg = el.querySelector(':scope > legend');
      CHECK(!!lg, '🔴 ' + g + ' 的組名放在 legend 上（＝「組名在框上」）');
      CHECK(!!lg.querySelector('.dst-step-tick'), '🔴 ' + g + ' 的 ○／✔ 也在框上（一眼看得到）');
    });
    /* 🔴 Bruce 指名：「TCON 的部分，應該要寬到 DG 的下面。」 */
    const tcon = doc.getElementById('dst-hwgrp-tcon');
    const meter = doc.getElementById('dst-hwgrp-meter');
    const dgRow = doc.getElementById('dst-dg-ck');
    CHECK(tcon.contains(dgRow), '🔴 DG_EN 在 T-CON 那個框**裡面**（框往下包到它）');
    CHECK(!meter.contains(dgRow), '🔴 DG_EN **不在**光學量測儀那個框裡');
    CHECK(tcon.contains(doc.getElementById('dst-v-ic')), 'IC 型號也在 T-CON 框裡');
    CHECK(tcon.contains(doc.getElementById('dst-dg-warn')), 'DG 開啟時的黃字也在 T-CON 框裡');
    CHECK(doc.getElementById('dst-hwgrp-bridge').contains(doc.getElementById('dst-dl-box')),
      '下載入口仍在「讀寫 I2C 治具」那一組（v1.10.1 的結論不變）');
    /* 三組之外：那一行說話列不屬於任何一組（v1.10.1 的結論不變） */
    const say = doc.getElementById('dst-say-link');
    CHECK(groups.every(g => !doc.getElementById('dst-hwgrp-' + g).contains(say)),
      '🔴 `#dst-say-link` 仍在三組之外');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     B：「黑視窗」整頁不再出現
     ═══════════════════════════════════════════════════════════════════════ */
  H('B 看不懂的詞：「黑視窗」已清乾淨');
  {
    const { P, doc, w } = await loadSelf({ opener: null });
    const bare = stripComments(SELF_SRC);
    CHECK(bare.indexOf('黑視窗') < 0 && bare.indexOf('黑窗口') < 0,
      '🔴 去掉註解後的原始碼裡一個「黑視窗／黑窗口」都沒有');
    /* 三語的 i18n 值也要乾淨（只改繁中不會有任何測試會紅 —— 本頁踩過兩次） */
    const bad = [];
    P.i18nKeys().filter(k => k.indexOf('dst.') === 0).forEach(k => {
      const v = P.i18nValues(k) || {};
      LANGS.forEach(L => {
        if (v[L] && (String(v[L]).indexOf('黑視窗') >= 0 || String(v[L]).indexOf('黑窗口') >= 0))
          bad.push(k + '/' + L);
      });
    });
    EQ(bad, [], '🔴 三語的 i18n 值裡也一個都沒有');
    /* 那一行仍然講得出「什麼時候要點它」 */
    const sum = doc.querySelector('[data-i18n="dst.scSum"]').textContent;
    CHECK(/連不上/.test(sum), '🔴 改寫後先講「什麼時候要點」（連不上）', sum);
    CHECK(/I2C Bridge/.test(sum), '🔴 講的是畫面上那支程式的名字（他按得到的那顆下載鈕上就印著）', sum);
    /* 三語都改到 */
    LANGS.forEach(L => {
      const v = P.i18nValues('dst.scSum');
      CHECK(v && v[L] && v[L].length > 4, '🔴 dst.scSum 有 ' + L + ' 的翻譯', v && v[L]);
    });
    void w;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     C：步驟卡的三個外框
     ═══════════════════════════════════════════════════════════════════════ */
  H('C 步驟卡：①／②③／④ 各自一個外框');
  {
    const { doc } = await loadSelf({ opener: null });
    const card = doc.getElementById('dst-steps-card');
    const boxes = Array.prototype.slice.call(card.querySelectorAll(':scope .card-body > .dst-box'));
    EQ(boxes.length, 3, '🔴 步驟卡裡剛好三個外框（①／②③／④）');
    CHECK(boxes[0].contains(doc.getElementById('dst-step-lut')), '🔴 第一個框裝 ①');
    CHECK(!boxes[0].contains(doc.getElementById('dst-step-gray')), '🔴 ② 不在 ① 那個框裡');
    EQ(boxes[1].id, 'dst-group23', '🔴 第二個框就是 ②③ 那一組（id 沒換）');
    CHECK(boxes[1].contains(doc.getElementById('dst-step-gray'))
       && boxes[1].contains(doc.getElementById('dst-step-prim')),
      '🔴 ②③ 兩列在**同一個**框裡（Bruce：步驟二、步驟三應該也要同一個外框）');
    CHECK(boxes[1].contains(doc.getElementById('dst-settle'))
       && boxes[1].contains(doc.getElementById('dst-stop'))
       && boxes[1].contains(doc.getElementById('dst-xlsx')),
      '🔴 v1.10.1 搬進來的三個控制項仍然在這個框裡（沒有被外框改動弄丟）');
    CHECK(boxes[2].contains(doc.getElementById('dst-step-back')), '🔴 第三個框裝 ④');
    /* 🔴 舊的「左邊一條線」記號已經移除（框本身就是記號，同一件事不講兩次） */
    CHECK(stripComments(SELF_SRC).indexOf('border-left: 2px solid var(--primary)') < 0,
      '🔴 `.dst-group` 左邊那條 2px 的線已移除');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     D：換階等待預設 300 ms
     ═══════════════════════════════════════════════════════════════════════ */
  H('D 換階等待：預設 300 ms');
  {
    const { P, doc } = await loadSelf({ opener: null });
    EQ(P.settleDefault(), 300, '🔴 預設值＝300（Bruce 指定）');
    EQ(P.settleMs(), 300, '🔴 畫面上選單目前值也是 300');
    EQ(P.settleChoices(), [300, 400, 500, 600, 700, 800, 900, 1000],
      '🔴 清單一格都沒少（要調回 700 仍然選得到）');
    const sel = doc.getElementById('dst-settle');
    sel.value = '700';
    EQ(P.settleMs(), 700, '🔴 選 700 就是 700（只改預設值，沒有鎖住）');
    /* 🔴 說明那一行**不准再寫死任何毫秒數** —— 寫了就是第二份來源 */
    const note = doc.querySelector('[data-i18n="dst.settleNote"]').textContent;
    CHECK(!/\d/.test(note), '🔴 說明那一行沒有任何數字（預設值只有一個來源）', note);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     E：②③ 量完的收尾訊息指向 DG 分頁
     ═══════════════════════════════════════════════════════════════════════ */
  H('E 量完的收尾：記錄回到 DG 分頁');
  {
    const opener = fakeWin();
    const { P } = await loadSelf({ opener, qs: '?task=3&dest=' + encodeURIComponent('第 2 部分') + '&step=gray' });
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 },
      { key: 'R', group: 'prim', idx: 255, r12: 4080, x: 0.64, y: 0.33, lv: 60 },
      { key: 'G', group: 'prim', idx: 255, r12: 4080, x: 0.30, y: 0.60, lv: 200 },
      { key: 'B', group: 'prim', idx: 255, r12: 4080, x: 0.15, y: 0.06, lv: 25 }
    ]);
    CHECK(P.dgSend() === true, '前置條件：這一輪真的送出去了');
    await sleep(20);
    const say = P.sayRun() || '';
    CHECK(say.indexOf('切回 DG 分頁') >= 0,
      '🔴 收尾明講「請切回 DG 分頁繼續」（不是叫他在這裡匯出 Excel）', say);
    CHECK(say.indexOf('Excel') < 0 && say.indexOf('XLSX') < 0,
      '🔴 收尾那一句完全沒有提匯出', say);
    /* 匯出鈕本身**沒有被刪掉**（它是 Bruce 自己在 v1.10.1 指名放進那一格的） */
    EQ(P.ctrlInGroup23('dst-xlsx'), { n: 1, inGroup: true },
      '🔴 匯出 XLSX 仍在 ②③ 那一格（移除既有入口要 Bruce 裁示，本輪不動）');
    /* 三語都要有那一句 */
    LANGS.forEach(L => {
      const v = P.i18nValues('dst.dgSentBoth');
      CHECK(v && v[L] && /DG/.test(v[L]), '🔴 dst.dgSentBoth 有 ' + L + ' 的翻譯', v && v[L]);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     F：DG LUT 數值表永遠展開，而且是全表
     ═══════════════════════════════════════════════════════════════════════ */
  H('F DG LUT：有表、不收折');
  {
    const { doc } = await loadSelf({ opener: null });
    EQ(doc.getElementById('dst-lut-det'), null, '🔴 收折容器 <details id="dst-lut-det"> 已移除');
    const tb = doc.getElementById('dst-lut-tb');
    CHECK(!!tb, '🔴 數值表本體仍在');
    CHECK(!tb.closest('details'), '🔴 它不在任何 <details> 裡 ⇒ 永遠展開');
    CHECK(doc.getElementById('dst-lut-body').contains(tb), '它仍然在 LUT 那張卡的內容區裡');
    /* 標題行不再是 <summary>（不再是可以按的東西） */
    const cap = doc.getElementById('dst-lut-sum');
    CHECK(!!cap && cap.tagName !== 'SUMMARY', '🔴 標題行已經不是 <summary>', cap && cap.tagName);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     G：左上角那一顆＝「‹ 回到首頁」，共用 key 沒被動到
     ═══════════════════════════════════════════════════════════════════════ */
  H('G 左上角：回到首頁');
  {
    const { P, doc, w } = await loadSelf({ opener: fakeWin() });
    EQ(P.backText(), '‹ 回到首頁', '🔴 有 opener 時也是「‹ 回到首頁」');
    EQ(P.backHref(), 'index.html', '🔴 href 指向首頁');
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back').dispatchEvent(ev);
    await sleep(10);
    EQ(ev.defaultPrevented, false, '🔴 不攔導覽 —— 按下去真的會去首頁（名字＝行為）');
    LANGS.forEach(L => {
      const v = P.i18nValues('dst.backHome');
      CHECK(v && v[L] && v[L].indexOf('‹') === 0, '🔴 dst.backHome 有 ' + L + ' 的翻譯且帶箭頭', v && v[L]);
    });
    /* 🔴 **共用的那一個沒有被改** —— 另外七頁還在用它，改了要連它們一起進版。
       這一條是「範圍有沒有守住」的機械檢查，不是文案偏好。 */
    CHECK(/'common\.backToHome':\s*\{\s*'zh-TW':\s*'‹ 返回主頁'/.test(I18N_SRC),
      '🔴 common/i18n.js 的 common.backToHome 仍是「‹ 返回主頁」（沒有波及另外七頁）');
    /* HTML 裡的 fallback 字面值要與 JS 填的一致（JS 還沒跑到時看到的是它） */
    CHECK(/<a href="index\.html" class="back-btn" id="dst-back">‹ 回到首頁<\/a>/.test(SELF_SRC),
      '🔴 HTML 的預設字也是「‹ 回到首頁」（兩邊不得不一致）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     I：④ 自動回傳 ／ 自動打勾 ／ 失敗不准打勾
     ═══════════════════════════════════════════════════════════════════════ */
  H('I ④ 自動回傳：打勾＝真的送到了');
  {
    const opener = fakeWin();
    const { P, doc } = await loadSelf({ opener, qs: '?task=5&dest=' + encodeURIComponent('第 2 部分') + '&step=gray' });
    /* ① 沒有鈕 */
    EQ(doc.getElementById('dst-back-bot'), null, '🔴 ④ 那一顆鈕已從 DOM 移除');
    const row = doc.getElementById('dst-step-back');
    CHECK(!row.querySelector('a, button'), '🔴 ④ 那一列裡沒有任何可以按的東西');
    CHECK((row.textContent || '').indexOf('自動') >= 0,
      '🔴 ④ 的名字講明它是自動的', (row.textContent || '').trim());
    /* ② 還沒送 ⇒ 不打勾，而且先講「不必按」 */
    EQ(P.backSent(), false, '還沒送 ⇒ 未回傳');
    EQ(P.backRowTick(), '○', '還沒送 ⇒ ④ 是 ○');
    CHECK((P.backWarnText() || '').indexOf('自動回傳') >= 0,
      '🔴 送出去之前先講「量完會自動回傳，不必按任何東西」', P.backWarnText());
    /* ③ 真的送出去 ⇒ 自動打勾 ＋ 提示換成切分頁 */
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 }
    ]);
    CHECK(P.dgSend() === true, '前置條件：真的送出去了');
    await sleep(20);
    EQ(P.backSent(), true, '🔴 送出去了 ⇒ ④ 自動打勾');
    EQ(P.backRowTick(), '✔', '🔴 ④ 那一列自動變成 ✔');
    EQ(P.backRowDone(), true, '🔴 ④ 有 done');
    EQ(P.backWarnIsSwitchTab(), true, '🔴 提示自動換成「已送回 DG，請切回 DG 分頁繼續。」');
  }
  {
    /* 🔴 反面一：這一輪作廢 ⇒ 一個 byte 都沒送 ⇒ **不准打勾** */
    const opener = fakeWin();
    const { P } = await loadSelf({ opener, qs: '?task=6&step=gray' });
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 }
    ]);
    P.__setRunOkForTest(false);
    CHECK(P.dgSend() === false, '前置條件：作廢的一輪不回傳');
    await sleep(20);
    EQ(P.backSent(), false, '🔴 沒送出去 ⇒ ④ **不打勾**（打勾必須等於真的送到了）');
    EQ(P.backRowTick(), '○', '🔴 ④ 維持 ○');
  }
  {
    /* 🔴 反面二：筆數不足 ⇒ 不送 ⇒ 不打勾 */
    const opener = fakeWin();
    const { P } = await loadSelf({ opener, qs: '?task=7&step=gray' });
    P.__setRowsForTest([{ key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 }]);
    CHECK(P.dgSend() === false, '前置條件：只有 1 筆 ⇒ 不送');
    await sleep(20);
    EQ(P.backSent(), false, '🔴 筆數不足 ⇒ ④ 不打勾');
  }
  {
    /* 🔴 反面三：不是從 DG 開的 ⇒ 永遠不會打勾 ⇒ 要講原因與退路 */
    const { P } = await loadSelf({ opener: null });
    EQ(P.backSent(), false, '🔴 沒有 opener ⇒ ④ 不打勾');
    const t = P.backWarnText() || '';
    CHECK(t.indexOf('不是從 DG 開的') >= 0, '🔴 講出原因', t);
    CHECK(t.indexOf('複製到剪貼簿') >= 0 && t.indexOf('匯出 XLSX') >= 0, '🔴 講出兩條退路', t);
    EQ(P.backWarnHidden(), false, '🔴 而且那一行看得見（不是藏起來假裝沒事）');
    LANGS.forEach(L => {
      const v = P.i18nValues('dst.backNoDg');
      CHECK(v && v[L] && v[L].length > 10, '🔴 dst.backNoDg 有 ' + L + ' 的翻譯', v && v[L]);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     J：第 4 部分推送 —— 沒有 ack 就判對面不是自檢頁
     ═══════════════════════════════════════════════════════════════════════ */
  H('J 推送握手：沒人回話就不等三分鐘');
  {
    const { win } = await loadDg();
    const A = win.dgApi;
    const waits = A.p4PushWaitMs();
    CHECK(waits.ack > 0 && waits.ack <= 10000,
      '🔴 第一段（等對面回話）是「幾秒」等級，不是三分鐘', waits.ack);
    CHECK(waits.write >= 60000,
      '🔴 第二段（等寫入＋讀回核對）仍然是長等待（整張表最大 4644 byte）', waits.write);
    CHECK(waits.ack < waits.write, '🔴 兩段是分開的，而且第一段短得多');
  }
  {
    /* ═══ 端到端：分頁還開著、但已經不是自檢頁 ═══════════════════════════════
       這正是 Bruce 踩到的那一種：他在自檢頁按過左上角「回到首頁」，那個分頁
       **沒有關**（`win.closed` 仍是 false），但它現在是 index.html、沒有任何
       handler ⇒ 不會回話。
       🔴 用 `window.open` 的 mock 產生的假視窗模擬：它有 postMessage、closed 是
          false，但**不會送任何 dg-lut-write-progress 回來**。
       🔴 **不把產品的 4000 ms 改小來加速** —— 改了就不是產品在跑的那一份。改成
          把產品自己排的那個計時器當場引爆（走同一條 callback）。 */
    const { win, doc, opened } = await loadDg();
    win.dgApi.wmodeSet('tcon');       // 先選模式再算（切模式會把主分頁回出廠）
    await sleep(80);
    CHECK(opened.length >= 1, '前置：自檢分頁被開起來了（走既有那條路）', opened.length);
    await dgCalc(win, doc, 12);
    CHECK(!!win.dgApi.p4LutSig(), '前置：DG 這邊真的算出一份結果了');
    const dead = opened[opened.length - 1];   // 這個假視窗永遠不回話

    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'push', '前置：停在更新那一層');

    dead.msgs.length = 0;
    doc.getElementById('dg-btn-conf-push').click();
    await sleep(40);
    EQ(dead.msgs.length, 1, '前置：訊息確實送過去了（對面沒有人接）');
    const pend = win.dgApi.p4PushPending();
    CHECK(!!pend, '🔴 正在等回話');
    EQ(pend.acked, false, '🔴 而且**還沒有收到任何回話**（第一段）');
    EQ(win.dgApi.p4TconWinAlive(), true, '前置：此刻 DG 手上還握著那個分頁參照');

    /* 第一段逾時 ⇒ 判定「那個分頁不是自檢頁」 */
    CHECK(win.dgApi.p4PushFireTimer() === true, '把第一段的計時器引爆');
    await sleep(20);
    const say = win.dgApi.p4PushSay();
    CHECK(say && say.text.indexOf('已經不是自檢畫面') >= 0,
      '🔴 講出**原因**：那個分頁已經不是自檢畫面了', say && say.text);
    CHECK(say && say.text.indexOf('回到首頁') >= 0,
      '🔴 而且點出他做過什麼（在自檢頁按過「回到首頁」）', say && say.text);
    CHECK(say && say.text.indexOf('再按一次') >= 0,
      '🔴 講出**下一步**：再按一次會幫他重開一個', say && say.text);
    CHECK(say && /\b秒\b/.test(say.text) === false,
      '🔴 不是那句沒用的「超過 N 秒沒有回應」', say && say.text);
    EQ(say && say.cls.indexOf('err') >= 0, true, '🔴 而且是錯誤態（紅的）');
    EQ(win.dgApi.p4TconWinAlive(), false,
      '🔴 失效的分頁參照被清掉 ⇒ 下一次按會走「幫你開一個」那條路，不會再等一次');
    EQ(win.dgApi.p4PushPending(), null, '這一次的等待已經結束');
    EQ(win.dgApi.p4Pushed(), false, '🔴 失敗不留指紋（不假裝 T-CON 裡是新的表）');
  }
  {
    /* 🔴 正面對照：對面**有回話** ⇒ 握手成立 ⇒ 換成長等待那一段。
       沒有這一組的話，上面那一組只證明「不回話會被判失敗」，無法證明
       「會回話的（含還沒有 ack 能力的舊自檢頁）不會被誤殺」。 */
    const { win, doc, opened } = await loadDg();
    win.dgApi.wmodeSet('tcon');
    await sleep(80);
    await dgCalc(win, doc, 12);
    const tcon = opened[opened.length - 1];
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    doc.getElementById('dg-btn-conf-push').click();
    await sleep(40);
    const task = win.dgApi.p4PushPending().task;
    /* 送一則**進度**回去（舊版自檢頁送的就是 write／verify，沒有 'ack' 這個 stage）*/
    const ev = new win.MessageEvent('message', {
      data: { type: 'dg-lut-write-progress', task: task, stage: 'write', done: 1, total: 10 },
      origin: ORIGIN
    });
    Object.defineProperty(ev, 'source', { value: tcon });
    win.dispatchEvent(ev);
    await sleep(30);
    EQ(win.dgApi.p4PushPending().acked, true,
      '🔴 任何一則回話都算握手成立（舊版自檢頁不送 ack，但會送 write ⇒ 不得誤殺）');
    EQ(win.dgApi.p4TconWinAlive(), true, '分頁參照沒有被清掉');
    /* 這時候再引爆 ⇒ 走的是**寫入逾時**那一句，不是「不是自檢頁」 */
    win.dgApi.p4PushFireTimer();
    await sleep(20);
    const say2 = win.dgApi.p4PushSay();
    CHECK(say2 && say2.text.indexOf('已經不是自檢畫面') < 0,
      '🔴 握手成立之後逾時 ⇒ **不會**誤報成「不是自檢頁」', say2 && say2.text);
    CHECK(say2 && say2.text.indexOf('沒有回應') >= 0,
      '🔴 而是寫入那一段的逾時訊息', say2 && say2.text);
  }
  {
    /* 根因 ②：DG 這一頁重整過 ⇒ 訊息要講得出為什麼連結斷了。
       🔴 用 sessionStorage 的旗標模擬「這一次造訪開過自檢分頁」——
          它跨得過 F5，而 DG_LIVE_PAGES 跨不過，兩者的差就是「重整過」。 */
    const { win, doc } = await loadDg();
    await dgCalc(win, doc, 12);
    win.sessionStorage.setItem('tcon-dg-selftest-opened', '1');   // ＝ 重整前開過
    EQ(win.dgApi.p4SeenFlag(), true, '前置：旗標在（＝這一次造訪開過自檢分頁）');
    EQ(win.dgApi.p4TconWinAlive(), false, '前置：但 DG 手上沒有分頁參照（＝重整過）');
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    doc.getElementById('dg-btn-conf-push').click();
    await sleep(40);
    const say = win.dgApi.p4PushSay();
    CHECK(say && say.text.indexOf('重整過') >= 0,
      '🔴 講出原因：DG 這一頁重整過，連結斷了', say && say.text);
    CHECK(say && say.text.indexOf('多半還開著') >= 0,
      '🔴 而且告訴他原本那個分頁多半還在（免得他以為自己記錯了）', say && say.text);
  }
  {
    /* 反面：從來沒開過 ⇒ 講的是原本那一句，不是「重整過」 */
    const { win, doc } = await loadDg();
    await dgCalc(win, doc, 12);
    EQ(win.dgApi.p4SeenFlag(), false, '前置：這一次造訪從來沒開過自檢分頁');
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    doc.getElementById('dg-btn-conf-push').click();
    await sleep(40);
    const say = win.dgApi.p4PushSay();
    CHECK(say && say.text.indexOf('重整過') < 0,
      '🔴 沒開過就不要講「重整過」（那會是假話）', say && say.text);
    CHECK(say && say.text.indexOf('已經幫你開一個') >= 0,
      '🔴 講的是原本那一句：已經幫你開一個', say && say.text);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     突變：證明上面每一組真的在驗東西
     ═══════════════════════════════════════════════════════════════════════ */
  H('M 突變測試');
  /* MA：把 T-CON 那一組的框改回一般 div ⇒ A 那幾條必須紅 */
  {
    const orig = '<fieldset class="dst-box dst-hwgrp" id="dst-hwgrp-tcon">';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MA：找得到 T-CON 那一組的外框');
    const mut = SELF_SRC.replace(orig, '<div class="dst-hwgrp" id="dst-hwgrp-tcon">')
      .replace(/(<div class="dst-warn-line dst-hidden" id="dst-dg-warn"><\/div>\s*)<\/fieldset>/, '$1</div>');
    const { doc } = await loadSelf({ src: mut, opener: null });
    EQ(doc.getElementById('dst-hwgrp-tcon').tagName, 'DIV',
      '🔴 突變後 T-CON 那一組又變回沒有框的 div ⇒ A 那幾條會紅');
  }
  /* MB：把「黑視窗」寫回去 ⇒ B 那條必須紅 */
  {
    const orig = "I18N['dst.scSum']     = { 'zh-TW': '連不上？看 I2C Bridge 視窗最後一行的英文字母'";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MB：找得到改寫後的那一句');
    const mut = SELF_SRC.replace(orig, "I18N['dst.scSum']     = { 'zh-TW': '黑視窗最後印的那個字母是什麼意思？'");
    const { P } = await loadSelf({ src: mut, opener: null });
    const v = P.i18nValues('dst.scSum');
    CHECK(v['zh-TW'].indexOf('黑視窗') >= 0,
      '🔴 突變後「黑視窗」又回來了 ⇒ B 那條會紅');
  }
  /* MC：把 ②③ 拆成兩個框 ⇒ C 那條必須紅 */
  {
    const orig = '<div class="dst-box dst-group" id="dst-group23">';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MC：找得到 ②③ 那一組的外框');
    const mut = SELF_SRC.replace(orig, '<div class="dst-group" id="dst-group23">');
    const { doc } = await loadSelf({ src: mut, opener: null });
    CHECK(!doc.getElementById('dst-group23').classList.contains('dst-box'),
      '🔴 突變後 ②③ 那一組不再是一個框 ⇒ C 那條會紅');
  }
  /* MD：預設值改回 700 ⇒ D 那條必須紅 */
  {
    const orig = 'var DST_SETTLE_DEFAULT = 300;';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MD：找得到預設值那一行');
    const mut = SELF_SRC.replace(orig, 'var DST_SETTLE_DEFAULT = 700;');
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.settleDefault(), 700, '🔴 突變後預設值回到 700 ⇒ D 那條會紅');
  }
  /* ME：收尾那句話拿掉「切回 DG 分頁」⇒ E 那條必須紅 */
  {
    const orig = '請切回 DG 分頁繼續。';
    CHECK(SELF_SRC.indexOf("'zh-TW': '✔ {n} 筆白灰階已回到 DG 的{dest}，{prim} {np} 筆回到{dest3}。" + orig) > 0,
      'ME：找得到收尾那一句');
    const mut = SELF_SRC.replace(
      "'zh-TW': '✔ {n} 筆白灰階已回到 DG 的{dest}，{prim} {np} 筆回到{dest3}。" + orig,
      "'zh-TW': '✔ {n} 筆白灰階已回到 DG 的{dest}，{prim} {np} 筆回到{dest3}。");
    const opener = fakeWin();
    const { P } = await loadSelf({ src: mut, opener, qs: '?task=8&step=gray' });
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 },
      { key: 'R', group: 'prim', idx: 255, r12: 4080, x: 0.64, y: 0.33, lv: 60 },
      { key: 'G', group: 'prim', idx: 255, r12: 4080, x: 0.30, y: 0.60, lv: 200 },
      { key: 'B', group: 'prim', idx: 255, r12: 4080, x: 0.15, y: 0.06, lv: 25 }
    ]);
    P.dgSend();
    await sleep(20);
    CHECK((P.sayRun() || '').indexOf('切回 DG 分頁') < 0,
      '🔴 突變後收尾不再講「切回 DG 分頁」⇒ E 那條會紅', P.sayRun());
  }
  /* MF：把數值表收折回去 ⇒ F 那條必須紅 */
  {
    const orig = '<div class="dst-tbl-cap" id="dst-lut-sum">—</div>';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MF：找得到數值表的標題行');
    const mut = SELF_SRC.replace(orig,
      '<details id="dst-lut-det"><summary class="dst-sum" id="dst-lut-sum">—</summary></details>');
    const { doc } = await loadSelf({ src: mut, opener: null });
    CHECK(!!doc.getElementById('dst-lut-det'),
      '🔴 突變後收折容器又回來了 ⇒ F 那條會紅');
  }
  /* MG：左上角改回共用 key ⇒ G 那條必須紅 */
  {
    const orig = "    back.textContent = dstT('dst.backHome');";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MG：找得到左上角填字那一行');
    const mut = SELF_SRC.replace(orig, "    back.textContent = dstT('common.backToHome');");
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.backText(), '‹ 返回主頁', '🔴 突變後左上角又變回「‹ 返回主頁」⇒ G 那條會紅');
  }
  /* MI：④ 把鈕加回去 ⇒ I 那條「沒有按鈕」必須紅 */
  {
    const orig = '<span class="dst-step-txt" data-i18n="dst.stepBack">④ 資料自動回傳 DG</span>';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'MI：找得到 ④ 那一列的文字');
    const mut = SELF_SRC.replace(orig, orig + '<a href="index.html" class="dst-btn" id="dst-back-bot">資料回傳 DG</a>');
    const { doc } = await loadSelf({ src: mut, opener: fakeWin() });
    CHECK(!!doc.getElementById('dst-back-bot'),
      '🔴 突變後 ④ 又變成一顆鈕 ⇒ I 那條會紅');
  }
  /* MJ：把兩段等待併回一段（＝回到 v1.11.0 的乾等三分鐘）⇒ J 那條必須紅 */
  {
    const orig = '  var DG_P4_PUSH_ACK_MS = 4000;';
    CHECK(DG_SRC.indexOf(orig) > 0, 'MJ：找得到第一段等待的常數');
    const mut = DG_SRC.replace(orig, '  var DG_P4_PUSH_ACK_MS = 180000;');
    const { win } = await loadDg(mut);
    const w2 = win.dgApi.p4PushWaitMs();
    CHECK(!(w2.ack < w2.write),
      '🔴 突變後兩段等待一樣長（＝乾等三分鐘）⇒ J 那條會紅', w2);
  }

  console.log('\n' + '═'.repeat(64));
  console.log(fail ? ('  🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）')
                   : ('  ✅ 全部通過：' + pass + ' 項'));
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的（一定要看真瀏覽器截圖）：');
  console.log('   · 外框畫出來長什麼樣、字級變大之後有沒有溢出／重疊／換行');
  console.log('   · 三語切換後版面會不會跑掉（英文比中文長）');
  console.log('   · J 那條的**真實時序**（jsdom 沒有真的分頁，ack 走的是假視窗）');
  console.log('   · 真治具、真 T-CON、真量測儀');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
