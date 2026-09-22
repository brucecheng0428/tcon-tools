/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v120_probe.js — dgself v1.2.0 的驗收夾具（jsdom）
   ───────────────────────────────────────────────────────────────────────────
   驗 Bruce 2026-09-20 交辦的：
     ① 通訊自檢不再做 PASS／FAIL 判定（正反都驗），且 IC 識別完全不受它影響
     ② IC 識別的畫面講得清楚（自動識別、支援幾顆、撞號才出現下拉）
     ③ 二選一對話框兩顆鈕都有顏色（dg.html）
     ④ 頁面寬度沿用 common.css 的 .container
     ⑤ 匯出版面逐欄照上游工具（XLSX；CSV 已於 v1.3.0 移除，本支改驗它不見了）
     ⑦ 量測失敗不准跳過：自動重試 → 跳視窗 → 再試／中止；作廢的一輪不得匯出

   🔴 第 ⑥ 項（連動回 DG）在 `tools/dg_selftest_link_probe.js`，那一支是兩頁對開。

   用法：node tools/dg_selftest_v120_probe.js
         DST_FULL=1 node tools/dg_selftest_v120_probe.js   ← 多跑一輪 259 階的
                                                             完整灰階掃描（約 90 秒）
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 56 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inline(file) {
  let html = fs.readFileSync(path.join(repo, file), 'utf8');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const ORIGIN = 'https://example.invalid';

/* ═══ 假的 I2C Bridge（做法沿用 tools/dg_selftest_i2c.js，不另寫一套）═══════ */
function makeFakeWs(readMap) {
  const wires = [], writes = [];
  const ws = {
    readyState: 1, onmessage: null, sent: wires, writes,
    send(txt) {
      const m = JSON.parse(txt);
      wires.push(m);
      let rep;
      if (m.type === 'read') {
        const key = (readMap && readMap[m.slave] && readMap[m.slave][m.addr])
          || (readMap && readMap[m.addr]);
        let data = key ? key.slice() : new Array(m.len).fill(0x00);
        if (data.length > m.len) data = data.slice(0, m.len);
        while (data.length < m.len) data.push(0x00);
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data };
      } else if (m.type === 'write') {
        writes.push({ addr: m.addr, data: m.data.slice() });
        rep = { type: 'result', id: m.id, cmd: 'write', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; }
  };
  return ws;
}

async function load(qs) {
  const dom = new JSDOM(inline('dg-selftest.html'), {
    url: ORIGIN + '/dg-selftest.html' + (qs || ''), runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(120);
  /* ═══ dgself v1.3.0：這裡從「補一個 confirm」改成「**抓有沒有人呼叫 confirm**」══
     v1.2.0 是 `value: () => true`（補一個 jsdom 沒有的瀏覽器 API，讓產品那兩處
     確認視窗過得去）。v1.3.0 起產品**一處 confirm 都不該有**（Bruce 2026-09-20
     裁示拿掉），所以改成記數器：被呼叫到就是回歸。
     🔴 這是**收緊**不是放寬 —— 舊版無論呼叫幾次都會過，新版呼叫一次就會被第 0
        節抓出來。 */
  dom.window.__confirmCalls = [];
  Object.defineProperty(dom.window, 'confirm', {
    value: (msg) => { dom.window.__confirmCalls.push(String(msg)); return true; },
    configurable: true
  });
  return dom;
}

const MES_OK = 'OK00,P1,0,0.3127,0.3290,123.456';
/* 三種失敗（Bruce 指定要各驗一次）：儀器回錯誤／回不完整／逾時 */
const MES_ER = 'ER00,1';
const MES_SHORT = 'OK00,P1,0';
const MES_TIMEOUT = null;

/* 假的量測儀：初始化／MVS／ZRC 一律 OK；MES,1 由 mesFn 決定。 */
function meter(mesFn) {
  let n = 0;
  return cmd => {
    if (/^MES/.test(cmd)) return mesFn(++n);
    if (/^MVS/.test(cmd)) return 'OK,60.00';
    return 'OK';
  };
}

/* 準備一份「連得上、認得出 EM02A1、儀器掛著」的頁面。 */
async function armed(mesFn, opts) {
  opts = opts || {};
  const dom = await load(opts.qs);
  const w = dom.window, P = w.dstProbe;
  const ws = makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4] });
  P.__attachFakeWs(ws);
  P.setIcForTest('EM02A1', -1);
  P.__attachFakeMeter(meter(mesFn));
  /* 換階等待選最短的一檔 —— 夾具跑的是邏輯，不是面板的物理穩定時間。 */
  const sel = w.document.getElementById('dst-settle');
  sel.value = '300';
  if (opts.bits) P.setBits(opts.bits);
  return { dom, w, P, ws };
}

(async function main() {

  /* ═══ ① 通訊自檢 ═══════════════════════════════════════════════════════ */
  H('1. 通訊自檢：不再有 PASS／FAIL');
  {
    const src = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
    const i18n = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
    /* \U0001f534 要驗的是「**程式碼**裡沒有這些東西」—— 註解裡提到它們是刻意的
       （下一個人要知道為什麼拿掉），所以先把註解剥掉再比對。 */
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const code = strip(src), i18nCode = strip(i18n);
    CHECK(!/DST_COMM_EXPECT/.test(code), '常數 DST_COMM_EXPECT 已從程式碼消失（不是留著不用）');
    CHECK(!/0xA1\s*,\s*0xD8\s*,\s*0xFB/.test(code), '黃金向量 [0xA1,0xD8,0xFB] 不在程式碼裡');
    CHECK(!/'dst\.commPass'|'dst\.commMismatch'/.test(i18nCode),
      'i18n 的 dst.commPass／dst.commMismatch 兩個 key 已刪除');
    CHECK(!/dst\.commPass|dst\.commMismatch/.test(code), '頁面程式碼也不再引用那兩個 key');
    function i18nEntry(key) {
      const i = i18n.indexOf("'" + key + "':");
      return i < 0 ? '' : i18n.slice(i, i.valueOf() + 900).split('\n  \'')[0];
    }
    ['zh-TW', 'zh-CN', 'en'].forEach(L => {
      CHECK(i18nEntry('dst.commRead').indexOf("'" + L + "'") >= 0, 'dst.commRead 有 ' + L);
      /* 🔴 dgself v1.4.0：dst.commNote 已刪除（那一列不再顯示在畫面上），
         所以這裡改成**驗它真的不在**，而不是驗它三語齊備。 */
      CHECK(i18nEntry('dst.commNote') === '', 'dst.commNote 已刪除（' + L + ' 也不該還在）');
    });

    const dom = await load();
    const P = dom.window.dstProbe;
    // 正面：任何三個 byte 都只回 'read'，而且文字裡不得出現 PASS／FAIL
    [[0xA1, 0xD8, 0xFB], [0x61, 0x41, 0xB4], [0x00, 0x00, 0x00], [0xDE, 0xAD, 0xBE]].forEach(b => {
      const v = P.commVerdict(b);
      CHECK(v.state === 'read', '讀到 ' + b.map(x => x.toString(16)).join(' ') + ' ⇒ state=read', v.state);
      CHECK(!/PASS|FAIL/i.test(v.text), '  …而且文字裡沒有 PASS／FAIL：' + JSON.stringify(v.text));
    });
    // 反面：讀不到才是問題
    [[], [0x61], [0x61, 0x41]].forEach(b => {
      const v = P.commVerdict(b);
      CHECK(v.state === 'noread', '只收到 ' + b.length + ' byte ⇒ state=noread', v.state);
    });
  }

  H('1b. IC 識別完全不受通訊讀回值影響（功能驗證，不是讀註解）');
  for (const comm of [[0xA1, 0xD8, 0xFB], [0x61, 0x41, 0xB4], [0xFF, 0xFF, 0xFF], [0x00, 0x11, 0x22]]) {
    const dom = await load();
    const w = dom.window, P = w.dstProbe;
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: comm }));
    await P.commTest();
    await P.scanIdentify();
    const ic = P.currentIc();
    /* 🔴 dgself v1.4.0：畫面上那一列**已經移除**（Bruce 2026-09-20：「匯流排讀回
       測試也不用秀出來」），所以這裡不再驗那個元素。
       這一段要釘的事實沒有變、而且更重要了：**通訊讀回值不管是什麼，IC 識別的
       結果都不准改變**。測試本身（dstCommTest）照跑，只是不再佔畫面。 */
    const icTxt = w.document.getElementById('dst-v-ic').textContent;
    console.log('    comm=' + comm.map(x => ('0' + x.toString(16).toUpperCase()).slice(-2)).join(' ')
      + '  →  IC 列：' + JSON.stringify(icTxt));
    CHECK(ic === 'EM02A1', '通訊讀回 ' + comm[0].toString(16) + '… ⇒ IC 仍然認成 EM02A1', ic);
    CHECK(!/FAIL|PASS/i.test(icTxt), '  …IC 那一列沒有 PASS／FAIL 字樣');
    CHECK(w.document.getElementById('dst-v-comm') === null,
      '  …匯流排讀回那一列已經不在畫面上（v1.4.0）');
  }
  {
    // 讀不到才標紅／標灰
    const dom = await load();
    const w = dom.window, P = w.dstProbe;
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [] }));
    // 讀不到 ＝ bridge 回的長度不足：用 len 0 的 map 做不到，改直接驗純函式那一半
    const v = P.commVerdict([0x61]);
    CHECK(v.state === 'noread' && /讀不到|Nothing to read/.test(v.text),
      '讀不到時的文字是「讀不到」（這一種才該標紅）', v.text);
  }

  /* ═══ ② IC 識別的畫面 ══════════════════════════════════════════════════
     🔴 dgself v1.4.0 重寫這一段。原本驗的是「自動識別說明那一行講了什麼」＋
        「撞號說明句帶了 ID 與哪幾顆」，而那兩段文字**已經整個移除**
        （Bruce 2026-09-20：「0xFF IC 的 ID 不用列出來」「下面一大堆文字都可以
        拿掉」「實際上板子上是哪一顆，應該直接合併在 IC 型號那邊」）。
        改成驗**他真正要的那三件事**：
          ① 型號有被 highlight 出來（大字、不是灰的 dst-na）
          ② 撞號時下拉就在型號旁邊，而且非撞號的顆不出現
          ③ 那些被他點名的字**真的不在畫面上了**（反向驗證，不是只看新的有沒有） */
  H('2. IC 識別：型號 highlight ＋ 撞號下拉合併在旁邊');
  {
    const dom = await load();
    const w = dom.window, P = w.dstProbe;
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [1, 2, 3] }));
    await P.scanIdentify();
    const icEl = w.document.getElementById('dst-v-ic');
    const sel = w.document.getElementById('dst-alt');
    console.log('    IC 列：' + JSON.stringify(icEl.textContent));
    console.log('    下拉選項：' + JSON.stringify(Array.prototype.map.call(sel.options, o => o.textContent)));
    CHECK(/EM02A1/.test(icEl.textContent), '① 型號直接印在那一格（EM02A1）', icEl.textContent);
    CHECK(icEl.classList.contains('dst-icname'), '① 用的是 highlight 的樣式 .dst-icname');
    CHECK(!icEl.classList.contains('dst-na'), '① 認出來了 ⇒ 不是灰的');
    CHECK(!/自動識別|0xFF00|ID /.test(icEl.textContent), '① 那一格只有型號，沒有 ID 與「自動識別」字樣', icEl.textContent);
    CHECK(!sel.classList.contains('dst-hidden'), '② EM02A1（撞號）⇒ 下拉出現');
    CHECK(Array.prototype.map.call(sel.options, o => o.textContent).join(',') === 'EM02A1,V512S2',
      '② 下拉就是那兩顆，沒有別的');

    const dom2 = await load();
    const P2 = dom2.window.dstProbe;
    P2.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xF0], 0x0000: [1, 2, 3] }));  // VM02S1，不撞號
    await P2.scanIdentify();
    CHECK(dom2.window.document.getElementById('dst-alt').classList.contains('dst-hidden'),
      '② VM02S1（不撞號）⇒ 下拉不出現');

    /* ③ 反向：被點名的那幾樣**真的不在** */
    ['dst-auto-note', 'dst-alt-why', 'dst-alt-box', 'dst-fixed',
     'dst-v-id', 'dst-v-comm', 'dst-v-wr'].forEach(id => {
      CHECK(w.document.getElementById(id) === null, '③ 已移除：#' + id);
    });
    /* 🔴 用 innerText 會拿不到（jsdom 沒有排版），所以走 textContent —— 但
       textContent **連 <script> 裡的程式碼與註解都算進去**，那裡本來就會提到
       「匯流排讀回測試」這幾個字（函式的段落標題）。所以先把 script 剝掉，
       驗的才是「使用者看得到的字」。 */
    const bodyVisible = Array.prototype.map.call(
      w.document.body.querySelectorAll(':scope > *'), el => el.tagName === 'SCRIPT' ? '' : el.textContent).join(' ');
    const body = bodyVisible;
    CHECK(!/這一頁會寫入 TCON 的暫存器/.test(body), '③ 寫入警語整段不在畫面上');
    CHECK(!/可寫入位址/.test(body), '③ 「可寫入位址」不在畫面上');
    CHECK(!/匯流排讀回測試/.test(bodyVisible), '③ 「匯流排讀回測試」不在畫面上');
    CHECK(!/slave 掃描順序/.test(body), '③ slave 掃描順序那一行不在畫面上');
  }

  /* ═══ ③ 二選一對話框的配色 ═════════════════════════════════════════════ */
  H('3. dg.html 二選一：兩顆鈕都有顏色');
  {
    const dg = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');
    /* 直接拿整個 <button> 標籤來看 class，不用位置猜。 */
    const tagOf = id => (new RegExp('<button[^>]*id="' + id + '"[^>]*>').exec(dg) || [''])[0];
    const clsOf = t => (/class="([^"]*)"/.exec(t) || [, ''])[1];
    const cpc = clsOf(tagOf('dg-btn-pick-pc')), ctc = clsOf(tagOf('dg-btn-pick-tcon'));
    console.log('    電腦畫面量測 class：' + JSON.stringify(cpc));
    console.log('    T-CON 自檢量測 class：' + JSON.stringify(ctc));
    CHECK(/dg-btn-imp/.test(cpc), '電腦畫面量測：青色 .dg-btn-imp', cpc);
    CHECK(/dg-btn-live/.test(ctc), 'T-CON 自檢：紫色 .dg-btn-live（不再是素面灰）', ctc);
    CHECK(cpc !== ctc, '兩顆的配色不同（分得出是兩條不同的路）');
    CHECK(/\.dg-btn\.dg-btn-live\s*\{[^}]*background:\s*#7c3aed/.test(dg),
      '.dg-btn-live 真的有實心底色（#7c3aed）');
    CHECK(/\.dg-btn\.dg-btn-imp\s*\{[^}]*background:\s*#0e7490/.test(dg),
      '.dg-btn-imp 真的有實心底色（#0e7490）');
  }

  /* ═══ ④ 頁面寬度 ═══════════════════════════════════════════════════════ */
  H('4. 頁面寬度沿用 common.css 的 .container');
  {
    const src = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
    const css = fs.readFileSync(path.join(repo, 'common/common.css'), 'utf8');
    /* 註解裡還提到舊的 .dst-wrap（說明為什麼改掉），所以先剥註解。 */
    const cssCode = src.replace(/\/\*[\s\S]*?\*\//g, '');
    CHECK(!/class="dst-wrap"/.test(cssCode), '不再有自己的 .dst-wrap 外框');
    CHECK(!/\.dst-wrap\s*\{/.test(cssCode), '.dst-wrap 的樣式規則也刪了（不留死樣式）');
    CHECK(/<div class="container">/.test(src), '改用 .container');
    const dom = await load();
    const el = dom.window.document.querySelector('.container');
    CHECK(!!el, '頁面上真的有 .container 節點');
    const widths = (css.match(/\.container\s*\{[^}]*max-width:\s*(\d+)px/g) || [])
      .map(s => +/(\d+)px/.exec(s)[1]);
    console.log('    common.css 的 .container 斷點寬度：' + JSON.stringify(widths));
    CHECK(widths.indexOf(1200) >= 0, 'common.css 的 .container 在桌機是 1200px（比原本 520px 寬得多）', widths);
    // dg.html／calc.html 用的是同一套
    CHECK(/\.container\s*\{\s*max-width:\s*1200px/.test(fs.readFileSync(path.join(repo, 'dg.html'), 'utf8')),
      'dg.html 用的也是同一套 .container 斷點（1200px）');
  }

  /* ═══ ⑤ 匯出 ═══════════════════════════════════════════════════════════════
     ═══ 🔴 dgself v1.13.0（B1）：本頁的匯出**整組移除**，這一節整段退役 ══════════
     Bruce 2026-09-22：「在 TCON 自檢畫面量測裡面的『量測與調整 Gamma 所需步驟』
     第三個步驟做完以後，不要有匯出 XLSX 的按鈕，應該要讓統一匯出表格這件事情回到
     DG 網頁裡面的『光學資料比較』。」

     ⇒ 產品端 `dstExportHeader` / `dstExportRows` / `dstXlsxBytes` / `dstStamp` /
       `dstExportName` / `dstExportXlsx` 與對應的夾具觀測口全部不存在了。
     🔴 **不是放寬，也不是刪掉了事**：原本驗的那些東西（24 欄版面、Gray 欄刻度、
        Time 空一列、Sheet1、檔名…）**其對象已經不存在**，留著只會永遠紅。
        換成的新斷言是它的反面 —— 任何人把匯出接回自檢頁，這裡一樣會失敗。
     🔴 「這一輪完整跑完沒有」那件事**沒有失去驗證**：它本來就由 `P.runOk()` 與
        作廢橫幅（`#dst-void`）在驗，下面 7b／7c／7d 三組原封不動。匯出鈕的
        disabled 只是它的一個轉述。
     ⚠ 匯出那份**版面規格**（逐欄照上游工具）並沒有消失，它在 DG 的
       「光學資料比較」那一端，由 `dg.html` 的 `dgSlotExportXlsx()` 負責。
       本輪沒有動那一支，也沒有把它的驗證搬過來 —— 一次只改一件事，已在回報列出。
     ═══════════════════════════════════════════════════════════════════════════ */
  H('5. 匯出：本頁已整組移除（B1）');
  {
    const dom = await load();
    const P = dom.window.dstProbe;
    ['exportHeader', 'exportRows', 'xlsxBytes', 'exportName', 'exportXlsx',
     'exportBlocked', 'stamp', 'csvText', 'exportCsv'].forEach(k => {
      CHECK(typeof P[k] === 'undefined', '🔴（B1）夾具觀測口 ' + k + ' 已移除', typeof P[k]);
    });
    CHECK(dom.window.document.getElementById('dst-xlsx') === null,
      '🔴（B1）畫面上找不到匯出 XLSX 那一顆');
    CHECK(dom.window.document.getElementById('dst-csv') === null,
      'CSV 鈕已從畫面移除（v1.3.0）');
    /* 🔴 連 xlsx 產生器本身都不該再被這一頁載入（本頁只有匯出在用 TCONXlsx）。 */
    CHECK(typeof dom.window.TCONXlsx === 'undefined',
      '🔴（B1）本頁不再載入 common/xlsx.js（沒有東西在用它）', typeof dom.window.TCONXlsx);
  }

  /* ═══ ⑦ 量測失敗不准跳過 ═══════════════════════════════════════════════ */
  H('7a. 純函式：三種失敗都判成失敗');
  {
    const dom = await load();
    const P = dom.window.dstProbe;
    CHECK(P.parseMes(MES_TIMEOUT) === null, '逾時（null）⇒ 失敗');
    CHECK(P.parseMes(MES_ER) === null, '儀器回 ER ⇒ 失敗');
    CHECK(P.parseMes(MES_SHORT) === null, '回應不完整（解不出 x/y/Lv）⇒ 失敗');
    CHECK(P.parseMes('OK00,P1,0,abc,def,ghi') === null, '欄位不是數字 ⇒ 失敗');
    EQ(P.parseMes(MES_OK), { x: 0.3127, y: 0.329, lv: 123.456 }, '正常回應解得出 x/y/Lv');
    CHECK(P.mesRetry() === 3, '自動重試 3 次（與 dg-measure.html 的 bad>=3 相同）', P.mesRetry());
  }

  H('7b. 成功的一輪（回歸：不受新邏輯影響）');
  {
    const { w, P } = await armed(() => MES_OK, { qs: '?mode=prim' });
    await P.run();
    const rows = P.rows();
    console.log('    列數：' + rows.length + '　內容：' + JSON.stringify(rows.map(r => r.key)));
    CHECK(rows.length === 3, 'prim 模式跑完三階', rows.length);
    CHECK(rows.every(r => r.x !== null), '沒有任何一列是 null');
    CHECK(P.runOk() === true, 'dstRunOk = true');
    /* 🔴 v1.13.0（B1）：匯出已整組移除 ⇒ 這一輪「有沒有被擋」改由 runOk 與作廢
       橫幅代表（上一行已驗 runOk===true）。這裡正面釘住匯出鈕真的不在。 */
    CHECK(w.document.getElementById('dst-xlsx') === null, '🔴（B1）匯出鈕不存在');
    CHECK(w.document.getElementById('dst-void').textContent === '', '作廢橫幅是空的');
    CHECK(P.failOpen() === false, '沒有跳過失敗視窗');
    /* dgself v1.3.0 起：整輪掃描一次 window.confirm 都不准呼叫。 */
    CHECK(w.__confirmCalls.length === 0,
      '整輪掃描沒有跳出任何確認視窗（v1.3.0）', w.__confirmCalls);
  }

  for (const [name, badRes] of [['儀器回 ER', MES_ER], ['回應不完整', MES_SHORT], ['逾時', MES_TIMEOUT]]) {
    H('7c. 第 2 階失敗（' + name + '）→ 自動重試 3 次 → 跳視窗 → 按「再試一次」');
    const calls = [];
    /* 第 2 階（第 4…7 次 MES）連錯四次（1 次正常 ＋ 3 次重試），第 8 次起恢復。
       prim 的三階各一次 MES ⇒ 第 2 階是第 2 次呼叫。 */
    let failsLeft = 4;
    const { w, P } = await armed(n => {
      calls.push(n);
      if (n >= 2 && failsLeft > 0) { failsLeft--; return badRes; }
      return MES_OK;
    }, { qs: '?mode=prim' });

    const runP = P.run();
    // 等視窗跳出來（重試是真的重跑出圖＋settle，所以要等幾輪）
    for (let i = 0; i < 200 && !P.failOpen(); i++) await sleep(50);
    CHECK(P.failOpen() === true, '重試用完之後，警告視窗真的跳出來了');
    const body = w.document.getElementById('dst-fail-body').textContent;
    console.log('    視窗內文：' + JSON.stringify(body));
    CHECK(/第 2\/3 階/.test(body), '視窗講了是第幾階失敗', body.slice(0, 40));
    CHECK(/G/.test(body), '視窗講了是哪一個階名');
    CHECK(badRes === null ? /逾時/.test(body) : body.indexOf(badRes) >= 0,
      '視窗貼出儀器實際回了什麼', body.slice(0, 80));
    CHECK(/已經自動試了 4 次/.test(body), '視窗講了已經自動試過 4 次（1＋3）', body);
    CHECK(/檢查量測儀器/.test(body), '視窗叫人去檢查量測儀器');
    CHECK(P.rows().length === 1, '卡住的時候只有第 1 階進表（**沒有把第 2 階跳過去**）', P.rows().length);

    w.document.getElementById('dst-fail-retry').click();
    await runP;
    const rows = P.rows();
    console.log('    「再試一次」之後：' + JSON.stringify(rows.map(r => r.key))
      + '　MES 呼叫次數：' + calls.length);
    CHECK(rows.length === 3, '按「再試一次」之後這一輪跑完三階', rows.length);
    EQ(rows.map(r => r.key), ['R', 'G', 'B'], '三階的順序與階名都對，沒有缺漏');
    CHECK(rows.every(r => r.x === 0.3127), '每一階都拿到真的數據（沒有 null、沒有沿用上一階）');
    CHECK(P.runOk() === true, '完整跑完 ⇒ dstRunOk = true');
  }

  H('7d. 跳視窗之後按「中止整輪」⇒ 作廢');
  {
    const { w, P } = await armed(n => (n >= 2 ? MES_ER : MES_OK), { qs: '?mode=prim' });
    const runP = P.run();
    for (let i = 0; i < 200 && !P.failOpen(); i++) await sleep(50);
    CHECK(P.failOpen() === true, '視窗跳出來了');
    w.document.getElementById('dst-fail-abort').click();
    await runP;
    const voidTxt = w.document.getElementById('dst-void').textContent;
    console.log('    作廢橫幅：' + JSON.stringify(voidTxt));
    CHECK(P.runOk() === false, 'dstRunOk = false');
    CHECK(P.rows().length === 1, '只留下中止前量到的那一階（表格保留，供診斷）', P.rows().length);
    CHECK(/作廢/.test(voidTxt), '畫面上明講「作廢」', voidTxt.slice(0, 30));
    CHECK(/1\/3/.test(voidTxt), '講了量到第幾階', voidTxt.slice(0, 30));
    /* 🔴 v1.13.0（B1）：匯出已整組移除 ⇒ 「作廢的一輪不准匯出」不再有對象可驗。
       作廢這件事本身由上面三條（runOk=false、只留一階、橫幅寫「作廢」）在驗，
       而且那三條讀的是產品狀態，比讀一顆鈕的 disabled 更直接。 */
    CHECK(w.document.getElementById('dst-xlsx') === null, '🔴（B1）匯出鈕不存在');
    CHECK(w.document.getElementById('dst-csv') === null, 'CSV 鈕已從畫面移除（v1.3.0）');
    /* ═══ 🔴 v1.13.0（B1）：這一條原本是**假的** —— 它驗到的字不是中止流程寫的 ═════
       原本的順序是：上一行 `P.exportXlsx() === false` 會走進 `dstExportXlsx()` 的
       閘門，把 `dst.expVoid`（「這一輪沒有完整跑完…已作廢」）寫進 `#dst-say-run`，
       然後這一條才去讀它 —— **「作廢」兩個字是上一行的測試動作自己放進去的**，
       不是產品在中止時講的。匯出移除之後那一行沒了，這一條就跟著露餡。
       ⇒ 改成驗中止流程**真正寫進去的那一句**（`dst.abortedAt`：面板現在停在哪一張
         畫面，他可能要自己復原）。「作廢」那件事由上面的 `#dst-void` 橫幅在驗
         （`/作廢/` 與 `/1\/3/` 兩條），沒有失去驗證。 */
    const say = w.document.getElementById('dst-say-run').textContent;
    CHECK(/已停止/.test(say) && /R=0 G=4080 B=0/.test(say),
      '🔴 說話行講出面板現在停在哪一張畫面（中止流程自己寫的那一句）', say.slice(0, 60));
    CHECK(P.failOpen() === false, '視窗已經收起來');
  }

  H('7e. 視窗開著時按「停止」也收得掉');
  {
    const { w, P } = await armed(n => (n >= 2 ? MES_ER : MES_OK), { qs: '?mode=prim' });
    const runP = P.run();
    for (let i = 0; i < 200 && !P.failOpen(); i++) await sleep(50);
    w.document.getElementById('dst-stop').click();
    await runP;
    CHECK(P.failOpen() === false, '按停止之後視窗收起來了（不會卡住）');
    CHECK(P.runOk() === false, '這一輪作廢');
  }

  /* ═══ 完整灰階掃描（慢，預設不跑）═══════════════════════════════════════ */
  if (process.env.DST_FULL === '1') {
    H('7f. 完整 8-bit 灰階掃描 259 階（DST_FULL=1，約 90 秒）');
    const t0 = Date.now();
    const { w, P } = await armed(n => (n === 130 ? MES_ER : MES_OK));
    const runP = P.run();
    for (let i = 0; i < 4000 && P.rows().length < 259 && !P.failOpen(); i++) await sleep(50);
    await runP;
    const rows = P.rows();
    console.log('    耗時 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒，列數 ' + rows.length);
    console.log('    首列 ' + JSON.stringify(rows[0]) + '  末三列 '
      + JSON.stringify(rows.slice(-3).map(r => r.key)));
    CHECK(rows.length === 259, '256 灰階 ＋ 3 純色 ＝ 259 列（中間那一次失敗被重試吃掉了）', rows.length);
    CHECK(rows.every(r => r.x !== null), '沒有任何一列是 null');
    EQ(rows.slice(-3).map(r => r.key), ['R', 'G', 'B'], '最後三列是三個純色端點');
    CHECK(P.runOk() === true, 'dstRunOk = true');
    CHECK(P.failOpen() === false, '單次失敗由自動重試吞掉，沒有打擾使用者');
  } else {
    console.log('\n  （完整 259 階掃描未跑：需要 DST_FULL=1）');
  }

  console.log('\n' + '═'.repeat(60));
  if (fail) { console.log('🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）'); process.exit(1); }
  console.log('✅ 全過：' + pass + ' 項');
  console.log('🔴 這支驗不到的：真的治具、真的 TCON、真的量測儀、真瀏覽器的版面與配色（另附截圖）。');
})().catch(e => { console.error(e); process.exit(2); });
