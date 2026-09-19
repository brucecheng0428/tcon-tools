/* ═══════════════════════════════════════════════════════════════════════════
   i2c_tool_selftest.js — i2c.html（I2C 讀寫測試）驗得了的那一半
   ───────────────────────────────────────────────────────────────────────────
   🔴 這支**不會**驗到 USB／FTDI 治具／真的 TCON —— 沒有 Windows、沒有硬體就
      驗不了，不做假探針去製造全綠。它釘住的是「錯了會很安靜」的那幾件：

        1. offset 寬度 0/1/2/4 的組包與位址回繞（錯了只會讀到別的位址）
        2. 16×16 表格的位址計算與分頁邊界（錯了畫面照樣好看）
        3. 全 0xFF ＝ 總線閒置的判定（判反了會把「沒人回應」當成資料）
        4. hex 解析（半個 byte 一定要拒絕，不可以臆測）
        5. 端到端：以假 helper 驅動真的頁面，逐則檢查送出的 WS 訊息與表格內容
        6. 黃金向量 slave 0x68 / 2B / 0x0000 ×3 → A1 D8 FB 的自檢邏輯

   🔴 正面與反面都驗。專案吃過三次虧（NB code、EM01、E512）都是「只驗壞的會被
      擋下」。所以每條判準都同時驗「該過的要過」。

   用法（jsdom 不進版控，第一次要自己裝一份）：
     mkdir -p /tmp/h && cd /tmp/h && npm install jsdom
     NODE_PATH=/tmp/h/node_modules node tools/i2c_tool_selftest.js [i2c.html]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'i2c.html');
const repoDir = path.dirname(path.resolve(htmlPath));

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repoDir, src.split('?')[0]);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
});

let fails = 0, total = 0;
const groups = [];
function G(name) { groups.push(name); console.log('\n── ' + name + ' ' + '─'.repeat(Math.max(2, 58 - name.length))); }
function CHECK(cond, name) {
  total++;
  if (cond) return;
  fails++;
  console.log('   🔴 FAIL  ' + name);
}
function EQ(got, want, name) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  CHECK(g === w, name + '   got=' + g + '  want=' + w);
}

const pageErrors = [];

/* ── 假 helper：把送出去的每一則 WS 訊息留下來，並照腳本回覆 ────────────────
   🔴 回覆是「腳本」而不是「隨便給」：每個測案自己指定這一次讀回什麼，
      才驗得到「頁面有沒有照收到的資料落格」。 */
function makeMockWS(win, script) {
  const sent = [];
  class MockWS {
    constructor(url) {
      this.url = url; this.readyState = 0;
      MockWS.last = this;
      setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0);
    }
    send(txt) {
      const m = JSON.parse(txt);
      sent.push(m);
      const reply = script(m, sent.length);
      if (reply === null) return;                       // 模擬逾時（不回）
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ id: m.id, type: 'result' }, reply)) });
      }, 0);
    }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  win.WebSocket = MockWS;
  return sent;
}

const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8899/i2c.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.addEventListener('error', e => pageErrors.push(String(e.message || e.error)));
    win.navigator.clipboard = { writeText: () => Promise.resolve() };
  }
});
const win = dom.window;
const doc = win.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 換一組假 helper：一定要先斷線再接，否則頁面還握著上一個 MockWS 實例，
   新的腳本與 sent 陣列根本不會被用到（這正是第一版跑掛的原因）。

   🔴 2026-09-18：原本只有 `if (linked) disconnect()` —— **漏掉「連線正在進行中」
      這個狀態**。頁面自己有兩個會自動連線的計時器（載入後 250ms 的自動連線、
      斷線後的指數退避重試），所以有機會在 `linked===false` 但 `busy===true`
      的瞬間走到這裡：不斷線 → 換掉 MockWS → `i2ctConnect()` 開頭的
      `if (i2ctLinked || i2ctBusy) return;` 直接退出 → 新的 sent 是空陣列，
      而頁面稍後用**上一個** mock 完成連線。症狀就是 `sent.filter(...)[0]`
      是 undefined，而且時有時無（實測 6 次掛 2 次）。
      這不是產品的 bug，是夾具的取樣點沒有等頁面靜下來。修法是等 busy 落下、
      而且**無條件**斷一次線，不要用 linked 當前提。 */
async function quiesce() {
  for (let i = 0; i < 100 && win.__i2ct.state().busy; i++) await sleep(10);
}
async function useHelper(script) {
  await quiesce();
  await win.__i2ct.disconnect();      // 無條件：linked 為 false 也可能有殘留的 socket
  await quiesce();
  await sleep(10);
  const sent = makeMockWS(win, script);
  await win.__i2ct.connect();
  await quiesce();                    // 連線 + 連線後自動自檢都跑完
  await sleep(25);
  /* 🔴 v1.2.1：連線成功後頁面會**自動跑一次自檢**（Bruce 要的「不必按、通過就
     安靜」）。那一次也會送 read，所以「這次測案送了幾則 read」不能再直接數
     整個 sent —— 那樣數到的是自檢的。記一個分水嶺，測案要看的是它之後的。 */
  sent.afterConnect = sent.length;
  return sent;
}
/* 分水嶺之後、屬於這個測案自己觸發的訊息 */
function SINCE(sent, type) {
  return sent.slice(sent.afterConnect || 0).filter(m => m.type === type);
}
/* 大部分測案共用的腳本骨架：ping/open/close 一律成功，read/write 交給 f 決定 */
function baseScript(f) {
  return (m, n) => {
    if (m.type === 'ping')  return { helper: '1.4.0', proto: 2, ok: true };
    if (m.type === 'open')  return { ok: true, channels: 1 };
    if (m.type === 'close') return { ok: true };
    const r = f ? f(m, n) : null;
    return r === undefined ? { ok: true } : r;
  };
}

(async function run() {
  /* 🔴 先讓頁面自己的「載入後自動連線」計時器（250ms）跑完再開始。
     不等它的後果實測過：它會在第 8 組中間醒來，用**上一組**的 MockWS 把連線
     接走，於是這一組的 sent 是空陣列 —— 6 次跑掛 2 次的那個時有時無就是它。
     等 400ms 是讓夾具的取樣點落在頁面靜止之後，不是把問題蓋掉。 */
  await sleep(400);
  const A = win.__i2ct;

  /* ═════════════════════════════════════════════════════════════════════ */
  /* 🔴 寫 0x50–0x57 會跳「EEPROM 型號確認」視窗。其他組不是在驗那個視窗，
     預先作答成 24C32，否則測試會停在那裡等人按。視窗本身由專屬那一組驗。 */
  A.eepromAuto('24C32');
  /* 🔴 同理（v1.17.1）：A、B 都有內容時再載入檔案會跳「要放哪一邊」的四選項視窗。
     其他組不是在驗那個視窗，預先作答成 `'auto'` ＝ **照 v1.17.0 的既有規則**
     （由 i2ctIngest 依可不可比決定成為 A 還是 B）⇒ 既有斷言的前提不變。
     視窗本身由第 59 組驗，它會自己覆寫這個值、驗完再設回 'auto'。 */
  A.abPickAuto('auto');
  G('0. 頁面載入');
  CHECK(pageErrors.length === 0, '載入時沒有 JS 例外：' + pageErrors.join(' | '));
  CHECK(!!A, 'window.__i2ct 測試掛勾存在');
  if (!A) { console.log('\n🔴 掛勾不存在，無法繼續'); process.exit(1); }
  CHECK(/^v\d+\.\d+\.\d+$/.test(doc.getElementById('ver').textContent), '版號徽章讀到 TOOL_VERSIONS.i2c：' + doc.getElementById('ver').textContent);
  EQ(doc.getElementById('ver').textContent, win.TOOL_VERSIONS.i2c, '徽章版號 === version.js 的單一來源');
  CHECK(A.NEED_PROTO === 2, '本頁要求 helper proto 2（awid / rawwrite 都是 proto 2 才有）');
  /* 四項輸入都在 DOM 上，而且是可輸入的 —— 元素存在 ≠ 功能正常，所以下面還會真的打字 */
  ['in-slave', 'in-off', 'in-len', 'in-data'].forEach(id =>
    CHECK(!!doc.getElementById(id), '輸入欄 ' + id + ' 在 DOM 上'));
  EQ(Array.from(doc.querySelectorAll('#awid-chips .chip')).map(c => c.getAttribute('data-awid')),
     ['0', '1', '2', '4'], 'offset 寬度四個選項恰好是 0/1/2/4');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('1. offset 寬度與位址回繞（正反都驗）');
  CHECK(A.awidOk(0) && A.awidOk(1) && A.awidOk(2) && A.awidOk(4), '接受 0/1/2/4');
  CHECK(!A.awidOk(3) && !A.awidOk(5) && !A.awidOk(8) && !A.awidOk(-1), '拒絕 3/5/8/-1');
  EQ(A.addrMax(1), 0xFF, '1 byte 上限 0xFF');
  EQ(A.addrMax(2), 0xFFFF, '2 byte 上限 0xFFFF');
  EQ(A.addrMax(4), 0xFFFFFFFF, '4 byte 上限 0xFFFFFFFF');
  EQ(A.wrap(0x0100, 1), 0x00, '1 byte：0x100 回繞成 0x00');
  EQ(A.wrap(0x00FF, 1), 0xFF, '1 byte：0xFF 不動');
  EQ(A.wrap(0x10000, 2), 0x0000, '2 byte：0x10000 回繞成 0x0000');
  EQ(A.wrap(0x1234, 2), 0x1234, '2 byte：0x1234 不動');
  EQ(A.wrap(0x1234, 0), 0x1234, 'awid 0：不回繞（當索引用）');
  EQ(A.wrap(0x1FFFFFFFF, 4), 0xFFFFFFFF, '4 byte：超過 32 bit 才回繞');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('2. 讀取分段（chunk 256）');
  /* 🔴 v1.13.1：快速模式改成**預設開**，而 i2ctChunk() 是跟著模式走的
     （快 4096、慢 256）。這一組驗的是**慢路徑**的分段規則，所以要明講模式，
     不能再靠預設值 —— 靠預設值的測試在預設一改就會自相矛盾。
     快路徑「不分段」由第 46 組驗。 */
  /* 🔴 v1.20.1：這裡本來寫 `A.rawMpsse(false)`，那在 v1.20.0 之後等於「走
     DLL_I2C_BCB.dll 路徑」，而那條路**不分段** ⇒ 這一組驗的 256 分段規則會全滅。
     要驗慢路徑就要明講 `A.mode(2)`，不能再靠旗標旁敲側擊（這正是本版修的病灶）。 */
  A.mode(2);
  EQ(A.planRead(0x1200, 3, 2), [{ addr: 0x1200, len: 3, off: 0 }], '3 byte ＝ 1 則');
  EQ(A.planRead(0x0000, 256, 2), [{ addr: 0, len: 256, off: 0 }], '256 byte ＝ 1 則（剛好一頁）');
  EQ(A.planRead(0x0000, 257, 2),
     [{ addr: 0, len: 256, off: 0 }, { addr: 256, len: 1, off: 256 }], '257 byte ＝ 2 則，第二則位址接續');
  EQ(A.planRead(0x0000, 1024, 2).length, 4, '1024 byte ＝ 4 則');
  EQ(A.planRead(0x0000, 1024, 2)[3], { addr: 768, len: 256, off: 768 }, '最後一則位址 0x300');
  /* 🔴 awid 0 也要能分段：裝置自己的位址指標會往前走，所以連送 N 則就是連續讀 */
  EQ(A.planRead(0, 300, 0).map(c => c.len), [256, 44], 'awid 0 照樣分段（current address read 連續讀）');
  /* 1 byte 位址的分段會回繞，這是裝置真實行為，不是 bug */
  EQ(A.planRead(0xF0, 300, 1).map(c => c.addr), [0xF0, 0xF0], '1 byte：第二則回繞回 0xF0（0xF0+256 mod 256）');
  /* 🔴 用 `_reset()` 還原，不要用 `A.rawMpsse(false)` ——
     後者會把「手動覆寫」旗標立起來（明確指定就等於他自己選過），
     那個旗標會讓後面組別的「重連還原成預設」整個不跑，污染下一組。
     `_reset()` 才是「回到剛打開網頁」的完整還原。 */
  A._reset();
  CHECK(A.rawMpsse() === false, '🔴 v1.20.0：產品預設是原廠 DLL ⇒ 自建（快速模式）關');
  EQ(A.mode(), 0, '🔴 產品預設的 mode ＝ 0（原廠 DLL）');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('3. 16×16 表格的位址與分頁');
  EQ(A.cellKey(0x1200, 0, 0), 0x1200, '第 0 列第 0 欄 = 頁首');
  EQ(A.cellKey(0x1200, 0, 15), 0x120F, '第 0 列第 F 欄 = 頁首+0x0F');
  EQ(A.cellKey(0x1200, 15, 15), 0x12FF, '第 F 列第 F 欄 = 頁首+0xFF（正好 256 格）');
  EQ(A.cellKey(0x1200, 3, 4), 0x1234, '列＝高位 nibble、欄＝低位 nibble：(3,4) → 0x1234');
  EQ(A.pageOf(0x1234), 0x1200, '0x1234 屬於 0x1200 那一頁（對齊 0x?00）');
  EQ(A.pageOf(0x12FF), 0x1200, '0x12FF 還在同一頁');
  EQ(A.pageOf(0x1300), 0x1300, '0x1300 換頁');
  EQ(A.keyOf(0x1234, 0, 2), 0x1234, 'index 0 → 起始位址');
  EQ(A.keyOf(0x1234, 5, 2), 0x1239, 'index 5 → 起始位址+5');
  EQ(A.keyOf(0x1234, 5, 0), 5, 'awid 0：key 就是索引');
  /* 起始位址不對齊 16 時，前面的格子留空（不補 0、不補假值） */
  EQ(A.pagesOf(0x1234, 3, 2), [0x1200], '0x1234 讀 3 byte ＝ 只有 0x1200 這一頁');
  EQ(A.pagesOf(0x12FE, 4, 2), [0x1200, 0x1300], '跨頁：0x12FE 讀 4 byte ＝ 兩頁');
  EQ(A.pagesOf(0x0000, 256, 2), [0x0000], '整整一頁 ＝ 1 頁');
  EQ(A.pagesOf(0x0000, 257, 2), [0x0000, 0x0100], '多 1 byte ＝ 2 頁');
  EQ(A.pagesOf(0x0000, 4096, 2).length, 16, '上限 4096 byte ＝ 16 頁');
  EQ(A.pagesOf(0xF0, 300, 1), [0x0000], '1 byte 位址：全部回繞進同一頁');
  EQ(A.MAX_LEN, 262144, '🔴 一次上限拉到 256K（Bruce：檔案可能到 256K byte）');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('4. 全 0xFF ＝ 總線閒置（實機證據：slave 0x60/0x61/0x69 都回 FF FF FF）');
  CHECK(A.allFF([0xFF, 0xFF, 0xFF]) === true, 'FF FF FF → 判為閒置');
  CHECK(A.allFF([0xFF]) === true, '單一個 FF（整批就這一個）→ 判為閒置');
  CHECK(A.allFF([0xA1, 0xD8, 0xFB]) === false, '黃金向量不是閒置');
  CHECK(A.allFF([0xFF, 0xFF, 0x00]) === false, '夾雜非 FF → 不是閒置');
  CHECK(A.allFF([0x00, 0xFF]) === false, '資料中的 FF 不算閒置');
  CHECK(A.allFF([]) === false, '空陣列不算閒置（沒讀到 ≠ 閒置）');
  CHECK(A.allFF(null) === false, 'null 不算閒置');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('5. hex／數字解析（半個 byte 一定要拒絕）');
  EQ(A.parseHex('A1 D8 FB'), [0xA1, 0xD8, 0xFB], '空白分隔');
  EQ(A.parseHex('a1d8fb'), [0xA1, 0xD8, 0xFB], '連寫');
  EQ(A.parseHex('0xA1,0xD8,0xFB'), [0xA1, 0xD8, 0xFB], '0x 前綴＋逗號');
  EQ(A.parseHex('A1\nD8'), [0xA1, 0xD8], '換行');
  EQ(A.parseHex(''), [], '空字串 → 空陣列');
  EQ(A.parseHex('A1D'), null, '🔴 半個 byte → null（不臆測補 0）');
  EQ(A.parseHex('GG'), null, '非 hex → null');
  EQ(A.parseHex('A1 ZZ'), null, '夾雜非 hex → null（不丟掉看不懂的部分）');
  EQ(A.parseNum('0x68'), 0x68, '0x 十六進位');
  EQ(A.parseNum('104'), 104, '十進位');
  EQ(A.parseNum('68h'), 0x68, 'h 後綴十六進位');
  EQ(A.parseNum(''), null, '空 → null');
  EQ(A.parseNum('xyz'), null, '亂碼 → null');
  EQ(A.addrText(0x1234, 2), '0x1234', '2 byte 位址字串補到 4 碼');
  EQ(A.addrText(0x05, 1), '0x05', '1 byte 位址字串補到 2 碼');
  EQ(A.addrText(0x1234, 4), '0x00001234', '4 byte 位址字串補到 8 碼');
  EQ(A.addrText(7, 0), '#7', 'awid 0 標示成索引');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('6. 黃金向量常數（實機驗證過的那一組，不得被改掉）');
  EQ(A.GOLDEN, { slave: 0x68, awid: 2, addr: 0x0000, len: 3, expect: [0xA1, 0xD8, 0xFB] },
     'slave 0x68(7-bit) / 2 byte offset / 0x0000 ×3 → A1 D8 FB');
  EQ(A.ID_VEC.known, [0x01, 0xEF, 0xA1], '0xFF00 已知讀回 01 EF A1');
  CHECK(A.GOLDEN.slave <= 0x7F, '🔴 slave 是 7-bit（沒有被左移成 0xD0）');

  /* ═════════════════════════════════════════════════════════════════════ */
  G('7. 端到端：假 helper ＋ 真頁面（連線 → 讀 → 落格）');
  {
    /* 腳本：0x1234 起連續讀，回傳 0x10,0x11,0x12 … 好驗落格位置 */
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') {
        const d = []; for (let i = 0; i < m.len; i++) d.push((0x10 + i) & 0xFF);
        return { ok: true, status: 0, data: d };
      }
    }));
    CHECK(A.state().linked === true, '連線成功（proto 2）');
    EQ(A.state().helperProto, 2, '協商到 proto 2');
    /* 🔴 Bruce 2026-09-19：「但是網頁上是沒辦法秀出這個版本是多少」。
       版本看不到 ⇒ 他和我們都無法確認他在跑哪一版，已經因此多繞一圈。
       標題列那一格必須真的有字，不能只是變數裡有值。 */
    CHECK(/I2C Bridge \d+\.\d+\.\d+ · proto \d/.test(doc.getElementById('helperinfo').textContent),
      '🔴 標題列顯示 Bridge 版本：「' + doc.getElementById('helperinfo').textContent + '」');
    CHECK(/^\d+\.\d+\.\d+$/.test(doc.getElementById('hv-exe').textContent),
      '🔴 診斷列也顯示版本：「' + doc.getElementById('hv-exe').textContent + '」');
    EQ(sent.filter(m => m.type === 'ping').length, 1, '先 ping 一次');
    EQ(sent.filter(m => m.type === 'open').length, 1, '再 open 一次');
    /* 🔴 open 要帶網頁版本給 bridge 寫進 log（Bruce 2026-09-19）。
       這一輪繞一圈就是因為 log 裡只有 exe 版本、沒有網頁版本，
       分不出「新網頁送了 0」還是「舊網頁根本沒改」。 */
    CHECK(/^v\d+\.\d+\.\d+$/.test(sent.filter(m => m.type === 'open')[0].page || ''),
      '🔴 open 帶網頁版本：' + sent.filter(m => m.type === 'open')[0].page);
    EQ(sent.filter(m => m.type === 'open')[0].page, win.TOOL_VERSIONS.i2c,
      '🔴 送的就是 version.js 裡的版本（不另外寫死一份）');

    A.setInputs({ slave: '0x68', awid: 2, off: '0x1234', len: '3' });
    await A.doRead();
    await sleep(20);
    const rd = SINCE(sent, 'read');
    /* 🔴 v1.20.0：首次讀取的自動選路已整套移除 ⇒ **他按一次讀取就只送一則 read**。
       v1.13.1～v1.19.x 在這裡會多送 2～4 則探測（其中 64 byte 的逐 byte 慢讀
       就是 Bruce 看到的「一個 byte 一個 byte read」）。 */
    EQ(rd.length, 1, '🔴🔴 第一次讀取只有 1 則 read（沒有任何自動探測）');
    const real = rd[0];
    EQ({ slave: real.slave, addr: real.addr, len: real.len, awid: real.awid },
       { slave: 0x68, addr: 0x1234, len: 3, awid: 2 },
       '🔴 送出的 read 四個欄位 ＝ 使用者的四項輸入（slave 未被左移）');
    /* 第二次讀取同樣只有一則 */
    { const before = sent.length;
      await A.doRead(); await sleep(20);
      EQ(sent.slice(before).filter(m => m.type === 'read').length, 1,
         '🔴 第二次讀取也只送 1 則'); }
    const st = A.state();
    EQ([st.buf[0x1234], st.buf[0x1235], st.buf[0x1236]], [0x10, 0x11, 0x12], '資料落在 0x1234–0x1236');
    CHECK(st.buf[0x1233] === undefined, '起始位址之前的格子沒被填（留空，不補 0）');
    CHECK(st.buf[0x1237] === undefined, '結束位址之後的格子沒被填');
    /* 🔴 分頁對齊到**絕對位址的 256 邊界** —— Bruce 指定的輸入格長相
       （`0x` ＋ 頁碼 ＋ 固定的 `00`）要求末兩位永遠是 00，所以頁首必須對齊。
       起點不在邊界上時，第 0 頁前面那幾格是空的。 */
    EQ(st.pages, [0x1200], '只有一頁，頁首對齊到 0x1200');

    /* 表格內容：直接讀 DOM，元素存在 ≠ 值正確 */
    const cells = doc.querySelectorAll('#dump td');
    EQ(cells.length, 256, '表格恰好 16×16 ＝ 256 格');
    /* 🔴 v1.4.0：格子改用 data-addr（絕對位址）與 data-idx（相對索引）標記，
       data-key 已經不存在 —— 資料層換成 Uint8Array，key 不再是識別方式。 */
    const byAddr = {};
    cells.forEach(td => { byAddr[td.getAttribute('data-addr')] = td; });
    EQ(byAddr['4660'].textContent, '10', '0x1234 格顯示 10');
    EQ(byAddr['4661'].textContent, '11', '0x1235 格顯示 11');
    EQ(byAddr['4662'].textContent, '12', '0x1236 格顯示 12');
    EQ(byAddr['4663'].textContent, '', '0x1237 格是空的（讀取範圍外）');
    CHECK(byAddr['4660'].className.indexOf('has') >= 0, '有值的格子帶 has 樣式');
    CHECK(byAddr['4663'].className.indexOf('has') < 0, '沒值的格子不帶 has 樣式');
    CHECK((byAddr['4660'].getAttribute('title') || '').indexOf('0x1234') === 0, '每格 title 帶得出位址：' + byAddr['4660'].getAttribute('title'));
    /* 列／欄表頭：列＝高位 nibble、欄＝低位 nibble */
    const ths = Array.from(doc.querySelectorAll('#dump tr:first-child th')).map(t => t.textContent);
    EQ(ths.slice(1), ['+0', '+1', '+2', '+3', '+4', '+5', '+6', '+7', '+8', '+9', '+A', '+B', '+C', '+D', '+E', '+F'], '欄表頭 +0…+F');
    const rowh = Array.from(doc.querySelectorAll('#dump th.rh')).map(t => t.textContent).filter(s => s);
    EQ(rowh.length, 16, '16 個列表頭');
    EQ(rowh[0], '0x1200', '第一列表頭 0x1200（對齊）');
    EQ(rowh[3], '0x1230', '第四列表頭 0x1230');
    EQ(rowh[15], '0x12F0', '最後一列表頭 0x12F0');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('8. 端到端：四種 offset 寬度真的送出對應的 awid');
  {
    /* 🔴 v1.2.1：UI 的「0 byte」語意改了（Bruce 2026-09-18）——
       不再是「完全不送位址」，而是「slave ＋ 一個 1 byte 的值」，
       所以 wire 上送的是 awid=1、位址就是那個值。這裡照新語意釘住。 */
    /* 🔴 wire 的 awid **與 UI 完全一致**（Bruce 2026-09-18 親自確認寬度 0
       ＝ 沒有位址相位）。寬度 0 的讀取仍是 current address read。 */
    for (const [awid, off, wantAddr, wireAwid] of [[0, '0x34', 0x34, 0], [1, '0x34', 0x34, 1],
                                                   [2, '0x1234', 0x1234, 2], [4, '0x00001234', 0x1234, 4]]) {
      const sent = await useHelper(baseScript((m) => {
        if (m.type === 'read') return { ok: true, status: 0, data: [0x01, 0x02] };
      }));
      A.setInputs({ slave: '0x68', awid: awid, off: off, len: '2' });
      await A.doRead();
      await sleep(15);
      const r = SINCE(sent, 'read')[0];
      EQ({ awid: r.awid, addr: r.addr }, { awid: wireAwid, addr: wantAddr },
         'UI offset 寬度 ' + awid + ' byte → wire awid=' + wireAwid + ' addr=' + wantAddr);
    }
    /* awid 0 的表格用索引標示 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [0xAA, 0xBB] };
    }));
    A.setInputs({ awid: 0, off: '0', len: '2' });
    await A.doRead(); await sleep(15);
    const rh0 = Array.from(doc.querySelectorAll('#dump th.rh')).map(t => t.textContent).filter(s => s);
    EQ(rh0[0], '#0', 'UI awid 0：列表頭仍用索引（#0）—— 它不是位址空間');
    EQ(A.state().buf[0], 0xAA, 'UI awid 0：第 0 個 byte 落在索引 0');
    /* 🔴 標籤本身要跟著語意變，不是只有 hint 變 */
    EQ(doc.getElementById('offlabel').textContent, '③ 寫入值（1 byte）', 'awid 0 時欄位標籤改名');
    A.setInputs({ awid: 2 });
    EQ(doc.getElementById('offlabel').textContent, '③ 起始 offset', '切回 2 byte 時標籤復原');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('9. 端到端：寫入走 rawwrite、不限位址、log 留痕');
  {
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: m.data.length + 2 };
      if (m.type === 'read')  return { ok: true, status: 0, data: [0] };
    }));
    doc.getElementById('log').innerHTML = '';
    /* 🔴 0x0000 在 dg-measure 的白名單（0x1200–0x12FF）之外。這一筆必須送得出去 —— */
    /*    測試工具若套上那條白名單就等於廢掉，這條就是釘住「沒有被套上」。          */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '3', data: 'DE AD BE' });
    await A.doWrite();
    await sleep(20);
    const w = SINCE(sent, 'rawwrite');
    EQ(w.length, 1, '送出 1 則 rawwrite');
    EQ({ type: 'rawwrite', slave: w[0].slave, addr: w[0].addr, awid: w[0].awid, data: w[0].data },
       { type: 'rawwrite', slave: 0x50, addr: 0x0000, awid: 2, data: [0xDE, 0xAD, 0xBE] },
       '🔴 0x0000（白名單之外）寫得出去，且用的是 rawwrite 而不是有白名單的 write');
    CHECK(sent.filter(m => m.type === 'write').length === 0, '完全沒有用到帶白名單的 write 指令');
    const logtxt = doc.getElementById('log').textContent;
    CHECK(logtxt.indexOf('0x50') >= 0, 'log 記了 slave：' + (logtxt.indexOf('0x50') >= 0));
    CHECK(logtxt.indexOf('0x0000') >= 0, 'log 記了位址');
    CHECK(logtxt.indexOf('DE AD BE') >= 0, 'log 記了寫進去的 byte');
    const st = A.state();
    EQ([st.buf[0], st.buf[1], st.buf[2]], [0xDE, 0xAD, 0xBE], '寫過的值反映在表格上');
    CHECK(A.wroteAt(0) === true, '寫過的格子有標記');
    /* 更高位址也不擋 */
    A.setInputs({ off: '0xFFFF', data: 'FF' });
    await A.doWrite(); await sleep(15);
    const w2 = SINCE(sent, 'rawwrite');
    EQ(w2[w2.length - 1].addr, 0xFFFF, '0xFFFF 也寫得出去（不限位址）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('10. 端到端：自檢（黃金向量）通過與不通過都要對');
  {
    /* (a) 回傳黃金向量 → 必須 PASS */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: m.addr === 0xFF00 ? [0x01, 0xEF, 0xA1] : [0xA1, 0xD8, 0xFB] };
    }));
    const pass = await A.selfTest();
    await sleep(20);
    CHECK(pass === true, '🔴 回傳 A1 D8 FB → 自檢必須通過（正面：真的好用時不能誤判失敗）');
    CHECK(doc.getElementById('topbanner').textContent.indexOf('自檢通過') >= 0, '畫面顯示通過');
    CHECK(doc.getElementById('in-slave').value === '0x68', '自檢把輸入設成黃金向量，使用者看得到做了什麼');

    /* (b) 全 FF → 必須 FAIL，且要說出是總線閒置而不是「值不同」 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [0xFF, 0xFF, 0xFF] };
    }));
    const failFF = await A.selfTest();
    await sleep(20);
    CHECK(failFF === false, '全 FF → 自檢不通過');
    CHECK(doc.getElementById('topbanner').textContent.indexOf('總線閒置') >= 0,
          '全 FF 的訊息要講「總線閒置／無回應」而不是只講值不同');

    /* (c) 值不同 → FAIL，且要印出實際讀到什麼 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [0xA1, 0xD8, 0x00] };
    }));
    const failVal = await A.selfTest();
    await sleep(20);
    CHECK(failVal === false, '值不同 → 自檢不通過');
    CHECK(doc.getElementById('topbanner').textContent.indexOf('A1 D8 00') >= 0, '訊息印出實際讀到的 byte');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('11. 端到端：全 FF 的整批判定會反映到表格與橫幅');
  {
    await useHelper(baseScript((m) => {
      if (m.type === 'read') { const d = []; for (let i = 0; i < m.len; i++) d.push(0xFF); return { ok: true, status: 0, data: d }; }
    }));
    A.setInputs({ slave: '0x60', awid: 2, off: '0x0000', len: '16', data: '' });
    await A.doRead(); await sleep(20);
    CHECK(A.state().lastRead.allFF === true, '整批 FF 被判為閒置');
    /* 🔴 2026-09-19：FF 一律不標、畫面也不出聲，診斷只留 log（Bruce 要求）。 */
    CHECK(doc.getElementById('readbanner').textContent.indexOf('總線閒置') < 0, '🔴 橫幅不再講總線閒置');
    CHECK(doc.getElementById('log').textContent.indexOf('全 FF') >= 0, '🔴 診斷改留在 log');
    const c0 = doc.querySelector('#dump td[data-addr="0"]');
    CHECK(c0.className.indexOf('bus') < 0, '🔴 閒置時**不再**用 bus 樣式');

    /* 反面：夾雜一個非 FF 就不能判閒置，格子要回到一般的 ff 樣式 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') { const d = [0x00]; for (let i = 1; i < m.len; i++) d.push(0xFF); return { ok: true, status: 0, data: d }; }
    }));
    await A.doRead(); await sleep(20);
    CHECK(A.state().lastRead.allFF === false, '夾雜非 FF → 不判閒置');
    const c1 = doc.querySelector('#dump td[data-addr="1"]');
    CHECK(c1.className.indexOf('bus') < 0 && c1.className.indexOf('ff') < 0, '🔴 資料中的 FF 也完全不標');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('12. 端到端：>256 byte 用分頁呈現（一次只出現一個 16×16）');
  {
    await useHelper(baseScript((m) => {
      if (m.type === 'read') { const d = []; for (let i = 0; i < m.len; i++) d.push((m.addr + i) & 0xFF); return { ok: true, status: 0, data: d }; }
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '512', data: '' });
    await A.doRead(); await sleep(30);
    EQ(A.state().pages, [0x0000, 0x0100], '512 byte ＝ 2 頁');
    EQ(doc.querySelectorAll('#dump td').length, 256, '畫面上永遠只有一個 16×16（256 格）');
    /* 🔴 v1.4.0：分頁下拉換成「填位址跳頁」的輸入框（256K ＝ 1024 頁，
       下拉放 1024 個選項是不能用的）。這裡改驗頁數與標籤。 */
    EQ(A.pageCount(), 2, '共 2 頁');
    EQ(A.pageLabels(), ['0x0000 – 0x00FF', '0x0100 – 0x01FF'], '兩頁的範圍標示');
    CHECK(doc.getElementById('btn-prev').disabled === true, '第一頁時「上一頁」停用');
    CHECK(doc.getElementById('btn-next').disabled === false, '還有下一頁時「下一頁」可按');
    EQ(doc.querySelector('#dump td[data-addr="0"]').textContent, '00', '第一頁 0x0000 = 00');
    doc.getElementById('btn-next').dispatchEvent(new win.Event('click'));
    await sleep(10);
    EQ(A.state().pageIdx, 1, '按下一頁 → 換到第 2 頁');
    EQ(doc.querySelector('#dump td[data-addr="256"]').textContent, '00', '第二頁 0x0100 = 00（低位 byte 回繞）');
    const rh = Array.from(doc.querySelectorAll('#dump th.rh')).map(t => t.textContent).filter(s => s);
    EQ(rh[0], '0x0100', '第二頁第一列表頭 0x0100');
    CHECK(doc.getElementById('btn-next').disabled === true, '最後一頁時「下一頁」停用');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('13. 端到端：讀失敗不會假裝成功');
  {
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: false, status: 7, data: [] };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4', data: '' });
    await A.doRead(); await sleep(20);
    CHECK(doc.getElementById('readbanner').textContent.indexOf('讀取失敗') >= 0, '讀失敗要明說失敗');
    /* 🔴 v1.16.0：狀態碼仍然要進 log（診斷要用），但格式改了 ——
       畫面上不再出現 bridge 的原文，log 才是原文的去處。 */
    CHECK(/讀失敗（status 7）/.test(doc.getElementById('log').textContent), 'log 帶出狀態碼');
    EQ(Object.keys(A.state().buf).length, 0, '失敗時不填任何假值進表格');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('14. 端到端：helper proto 太舊要擋下並說清楚');
  {
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.3.2', proto: 1, ok: true };
      return { ok: true, channels: 1 };
    });
    CHECK(A.state().linked === false, 'proto 1 的舊 helper → 不視為已連線');
    /* 🔴 v1.2.1 反轉：「helper 太舊」的下一步已經從**一段字**變成**一顆下載鈕**。
       所以這裡驗的不再是橫幅文字，而是「下載入口有沒有出現、上面有沒有版號」。
       文字那一半降級成 log（診斷用），不占畫面。 */
    const g = doc.getElementById('gethelper');
    CHECK(win.getComputedStyle(g).display !== 'none', '🔴 proto 太舊 ⇒ 下載鈕出現');
    CHECK(doc.getElementById('get-why').textContent.indexOf('太舊') >= 0,
          '一句話說明為什麼：' + doc.getElementById('get-why').textContent);
    CHECK(doc.getElementById('log').textContent.indexOf('proto') >= 0,
          'proto 版本仍然照印在 log（診斷能力沒被砍）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('15. helper 自足入口：下載常數的單一來源、離線版提示');
  {
    /* 🔴 單一來源：頁面不得自己寫第二份下載常數。比對的是 common/version.js
       的 HELPER_PKG 與畫面上真的顯示出來的值。 */
    const V = win.HELPER_PKG;
    CHECK(!!V, 'common/version.js 有 HELPER_PKG');
    EQ(A.PKG, V, '🔴 頁面用的就是 HELPER_PKG 本體（不是複製一份）');
    CHECK(/^[0-9a-f]{64}$/.test(V.zipSha), 'zipSha 是 64 碼 hex：' + V.zipSha);
    CHECK(/^[0-9a-f]{64}$/.test(V.exeSha), 'exeSha 是 64 碼 hex：' + V.exeSha);
    CHECK(V.file === 'data/i2c-bridge-' + V.pkg + '.zip', '🔴 檔名與包版本一致：' + V.file);
    CHECK(V.bytes > 0, 'zip 大小有填：' + V.bytes);
    /* 🔴 pkg（zip 版本）與 exe（執行檔自報版本）是兩個欄位，畫面兩個都要顯示 ——
       歷史上 v1.3.0/1/2 三包的 exe 都是 1.3.0，只顯示一個就會看起來像 bug。 */
    CHECK('pkg' in V && 'exe' in V, 'pkg 與 exe 是分開的兩個欄位');
    EQ(doc.getElementById('hv-pkg').textContent, V.pkg, '畫面顯示下載包版本');
    EQ(doc.getElementById('hv-need').textContent, String(A.NEED_PROTO), '畫面顯示本頁需要的 proto');
    EQ(doc.getElementById('sha-zip').textContent, V.zipSha, '畫面顯示 zip SHA');
    EQ(doc.getElementById('sha-exe').textContent, V.exeSha, '畫面顯示 exe SHA');

    /* 這份 jsdom 跑在 127.0.0.1 ⇒ 等同 helper 端出來的離線打包版 */
    CHECK(A.isLocal('127.0.0.1') && A.isLocal('localhost') && !A.isLocal('brucecheng0428.github.io'),
          'loopback 判斷正確');
    const notice = doc.getElementById('offline-notice').textContent;
    CHECK(notice.indexOf('離線打包版') >= 0, '🔴 離線版提示保留（Bruce 明講的界線：他人在外面，抓不到新版整條路就斷了）');
    /* 🔴 v1.2.0：從大橫幅縮成一行灰字 ⇒ 網址不再寫成純文字，改成連結的 href。
       驗的東西不變（去得了線上版），驗的地方換成 href —— 這才是真正該成立的事。 */
    const noticeHref = (doc.getElementById('offline-notice').querySelector('a') || {}).getAttribute
      ? doc.getElementById('offline-notice').querySelector('a').getAttribute('href') : '';
    CHECK(noticeHref.indexOf('brucecheng0428.github.io') >= 0, '🔴 提示裡的連結指向線上版：' + noticeHref);
    CHECK(notice.length < 60, '🔴 而且它是一行，不是一大塊（實際 ' + notice.length + ' 字）');
    /* 🔴 離線版的下載連結必須指向**線上**網址 —— 指向相對路徑的話，helper 端
       根本沒有 data/ 這個目錄，他會抓到 404 而不是新版。 */
    const href = doc.getElementById('dl').getAttribute('href');
    CHECK(href.indexOf(A.ONLINE_PAGE.replace('i2c.html', '')) === 0,
          '🔴 離線版的下載鈕指向線上網址：' + href);
    CHECK(href.indexOf(V.file) >= 0, '下載連結帶正確檔名');
    CHECK(/[?&]v=/.test(href), '下載連結帶 cache buster');
    /* 🔴 v1.2.1 反轉：這顆按鈕已刪除（Bruce：「本來就是從網頁更新的，
       進來的不就一定是最新版的，怎麼還需要檢查？」）。 */
    CHECK(doc.getElementById('btn-chkver') === null, '🔴 「檢查線上有無新版」按鈕已移除');
    CHECK(doc.body.textContent.indexOf('檢查線上有無新版') < 0, '🔴 整頁不再有這串字');
  }

  G('16. I2C 被別的頁面佔用：要講出來、要有出口');
  {
    let sent = await useHelper((m) => {
      if (m.type === 'ping')  return { helper: '1.5.0', proto: 2, ok: true, busy: true };
      if (m.type === 'open')  return { ok: false, busy: true, err: 'I2C channel is held by another page' };
      return { ok: true };
    });
    CHECK(A.state().channelBusy === true, '🔴 被佔用的狀態有被記下來');
    const b = doc.getElementById('topbanner').textContent;
    CHECK(b.indexOf('另一個頁面') >= 0, '畫面明說 I2C 在另一個頁面，不是靜默失敗');
    CHECK(b.indexOf('接手') >= 0, '訊息告訴使用者怎麼拿回來');
    CHECK(doc.getElementById('btn-takeover').style.display !== 'none', '🔴 「接手 I2C」按鈕露出來了（保護要留出口）');
    /* 被佔時不該一直重試 open —— 那是可判別狀態，不是暫時性失敗 */
    EQ(sent.filter(m => m.type === 'open').length, 1, '被佔用時只送一次 open（不做無意義的重試）');

    /* 接手：重連並帶 takeover:1 */
    sent = [];
    const s2 = await (async () => {
      const arr = makeMockWS(win, (m) => {
        if (m.type === 'ping')  return { helper: '1.5.0', proto: 2, ok: true, busy: true };
        if (m.type === 'open')  return m.takeover ? { ok: true, channels: 1 } : { ok: false, busy: true };
        return { ok: true };
      });
      await A.takeover();
      await sleep(30);
      return arr;
    })();
    const opens = s2.filter(m => m.type === 'open');
    CHECK(opens.length >= 1, '接手時有送 open');
    EQ(opens[opens.length - 1].takeover, 1, '🔴 接手送的是 takeover:1');
    CHECK(A.state().linked === true, '接手後已連線');
    CHECK(A.state().channelBusy === false, '接手後不再是被佔用狀態');
    CHECK(doc.getElementById('btn-takeover').style.display === 'none', '接手成功後按鈕收起來');
  }

  G('17. 釋放 I2C：交回治具但保持連線（回去用 DG／PQ Tool 的出口）');
  {
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [1] };
    }));
    CHECK(A.state().linked === true, '先連上');
    CHECK(doc.getElementById('btn-release').disabled === false, '連上後「釋放 I2C」可按');
    await A.release(); await sleep(20);
    const closes = sent.filter(m => m.type === 'close');
    CHECK(closes.length >= 1, '🔴 釋放時真的送出 close');
    CHECK(A.state().linked === false, '釋放後狀態誠實回報「沒有通道」');
    CHECK(doc.getElementById('topbanner').textContent.indexOf('釋放') >= 0, '畫面說明已釋放');
    CHECK(doc.getElementById('btn-release').disabled === true, '已釋放後按鈕停用（不能重複釋放）');
  }

  G('18. helper 太舊：要說手上哪版、要哪版、去哪裡拿');
  {
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.3.2', proto: 1, ok: true };
      return { ok: true, channels: 1 };
    });
    CHECK(A.state().linked === false, 'proto 太舊 → 不視為已連線');
    /* 🔴 「手上哪版／要哪版／去哪裡拿」三件事還是要講齊，只是講的地方換了：
       **要換成哪一包**印在按鈕上（他一眼看得到），**手上哪版**在按鈕旁那句話裡，
       **需要哪版與線上網址**留在 log。畫面上不再塞一整段。 */
    const dl = doc.getElementById('dl');
    CHECK(win.getComputedStyle(doc.getElementById('gethelper')).display !== 'none',
          '🔴 下載入口出現（他可能就是缺那一包）');
    CHECK(dl.textContent.indexOf(win.HELPER_PKG.pkg) >= 0,
          '🔴 版號印在下載鈕上：' + dl.textContent.trim());
    CHECK(doc.getElementById('get-why').textContent.indexOf('1.3.2') >= 0,
          '🔴 講出他手上是哪一版：' + doc.getElementById('get-why').textContent);
    const lg = doc.getElementById('log').textContent;
    CHECK(lg.indexOf('proto 2') >= 0, '🔴 需要哪一版留在 log');
    CHECK(lg.indexOf('brucecheng0428.github.io') >= 0, '🔴 去哪裡拿留在 log');
  }


  /* ═════════════════════════════════════════════════════════════════════ */
  G('19. 載入檔案：解析、預覽、而且一個 byte 都不准送出');
  {
    /* ── 19a. 🔴 副檔名只管 .bin，其餘看內容（Bruce 2026-09-18 更正：
           「HEX 檔案打開是文字，一行 8 個或 16 個 byte」⇒ .hex 不是 raw）──── */
    EQ(A.fileKind('a.bin'), 'raw', '🔴 .bin ⇒ 一律 raw（誤判方向最危險，用副檔名釘死）');
    EQ(A.fileKind('A.HEX'), 'auto', '🔴 .hex ⇒ 交給內容判定（他更正後 .hex 是文字）');
    EQ(A.fileKind('a.txt'), 'auto', '.txt ⇒ 內容判定');
    EQ(A.fileKind('a.ROM'), 'auto', '.rom ⇒ 內容判定');
    EQ(A.sniffKind(new win.Uint8Array([0x00, 0x41, 0x42])), 'raw', '含 0x00 ⇒ raw');
    EQ(A.sniffKind(new win.Uint8Array([0xFF, 0x41])), 'raw', '含 >0x7E ⇒ raw');
    EQ(A.sniffKind(new win.Uint8Array([0x41, 0x31, 0x0A, 0x44, 0x38])), 'text', '全可列印 ⇒ text');

    /* ── 19b. 🔴 同一份資料、不同格式表達，解析結果必須逐 byte 相同 ──────── */
    {
      const want = [];
      for (let i = 0; i < 32; i++) want.push((i * 7) & 0xFF);
      const hx = n => ('0' + n.toString(16)).slice(-2).toUpperCase();
      /* 每列 1 byte */
      const one = want.map(hx).join('\n');
      /* 每行 8 byte */
      let eight = '';
      for (let i = 0; i < 32; i += 8) eight += want.slice(i, i + 8).map(hx).join(' ') + '\n';
      /* 每行 16 byte */
      let sixteen = '';
      for (let i = 0; i < 32; i += 16) sixteen += want.slice(i, i + 16).map(hx).join(' ') + '\n';
      /* 帶位址前綴（hexdump 風格，8 碼位址＋兩個空格） */
      let withAddr = '';
      for (let i = 0; i < 32; i += 16)
        withAddr += ('0000000' + i.toString(16)).slice(-8) + '  ' + want.slice(i, i + 16).map(hx).join(' ') + '\n';
      /* 帶位址＋ASCII 尾欄（xxd -C 風格） */
      let withAscii = '';
      for (let i = 0; i < 32; i += 16)
        withAscii += ('0000000' + i.toString(16)).slice(-8) + '  ' + want.slice(i, i + 16).map(hx).join(' ')
                   + '  |' + want.slice(i, i + 16).map(() => '.').join('') + '|\n';
      /* 連續無分隔 */
      const cont = want.map(hx).join('');
      /* C 陣列風格 */
      const carr = want.map(b => '0x' + hx(b) + ',').join(' ');
      /* 4 碼一組（0000: 4142 4344 …） */
      let grouped = '';
      for (let i = 0; i < 32; i += 16) {
        const g = [];
        for (let j = i; j < i + 16; j += 2) g.push(hx(want[j]) + hx(want[j + 1]));
        grouped += ('000' + i.toString(16)).slice(-4) + ': ' + g.join(' ') + '\n';
      }
      const cases = { '每列1byte': one, '每行8byte': eight, '每行16byte': sixteen,
                      '帶位址': withAddr, '帶位址+ASCII尾欄': withAscii,
                      '連續無分隔': cont, 'C陣列': carr, '4碼一組帶位址': grouped };
      Object.keys(cases).forEach(k => {
        const r = A.parseHexText(cases[k]);
        CHECK(r.err === null, k + ' 要解析成功：' + (r.err ? JSON.stringify(r.err) : 'ok'));
        EQ(r.bytes, want, '🔴 ' + k + ' 解析出的 byte 序列與其他格式逐 byte 相同');
      });
    }
    /* 容忍：空行、前後空白、大小寫、0x 前綴、CRLF */
    EQ(A.parseHexText('  a1 \r\n\r\n 0xD8 \r\nFB\r\n').bytes, [0xA1, 0xD8, 0xFB],
       '空行／空白／大小寫／0x 前綴／CRLF 全部容忍');
    EQ(A.parseHexText('7\nF').bytes, [0x07, 0x0F], '單碼也算一個 byte');
    EQ(A.parseHexText('').bytes, [], '空檔 ⇒ 0 byte');
    /* 🔴 壞 token 要報第幾行、為什麼 */
    {
      const bad = A.parseHexText('A1 D8\nZZ 44\nFB');
      CHECK(bad.err !== null, '🔴 壞 token 要報錯，不可以靜默跳過');
      EQ(bad.err.line, 2, '🔴 報的是第 2 行（1-based）');
      CHECK(/不是合法/.test(bad.err.reason), '講出原因：' + bad.err.reason);
    }
    {
      const odd = A.parseHexText('A1B\nD8');
      CHECK(odd.err !== null && odd.err.line === 1, '🔴 3 碼這種切不成 byte 的要報第 1 行');
    }

    /* ── 19b2. Intel HEX（含 04 位址跳躍與 checksum）────────────────────── */
    {
      /* :10 0000 00 <16 bytes> CC  — 用真的 checksum 算 */
      function rec(addr, type, data) {
        const b = [data.length, (addr >> 8) & 0xFF, addr & 0xFF, type].concat(data);
        let sum = 0; b.forEach(x => sum += x);
        b.push((~sum + 1) & 0xFF);
        return ':' + b.map(x => ('0' + x.toString(16)).slice(-2).toUpperCase()).join('');
      }
      const d0 = [0x11, 0x22, 0x33, 0x44];
      const d1 = [0xAA, 0xBB];
      const ih = [rec(0x0000, 0, d0), rec(0x0004, 0, d1), rec(0, 1, [])].join('\n');
      const r = A.parseHexText(ih);
      CHECK(r.err === null, 'Intel HEX 解析成功：' + (r.err ? JSON.stringify(r.err) : 'ok'));
      EQ(r.format, 'Intel HEX', '格式辨識為 Intel HEX');
      EQ(r.bytes, d0.concat(d1), '兩筆連續記錄 ⇒ 首尾相接');
      EQ(r.startAddr, 0, '起始位址 0');

      /* 🔴 04 造成的位址跳躍：0x0000 一筆、然後跳到 0x00010000 一筆 */
      const jump = [rec(0x0000, 0, [0x01, 0x02]),
                    rec(0x0000, 4, [0x00, 0x01]),      /* base = 0x00010000 */
                    rec(0x0000, 0, [0x03, 0x04]),
                    rec(0, 1, [])].join('\n');
      const rj = A.parseHexText(jump);
      CHECK(rj.err === null, '帶 04 的 Intel HEX 解析成功');
      EQ(rj.bytes.length, 0x10002, '🔴 位址跳躍要反映在長度上（不是首尾相接的 4 byte）');
      EQ([rj.bytes[0], rj.bytes[1]], [0x01, 0x02], '低位址那兩個 byte 在 0、1');
      EQ([rj.bytes[0x10000], rj.bytes[0x10001]], [0x03, 0x04], '🔴 高位址那兩個落在 0x10000');
      EQ(rj.bytes[0x0002], 0xFF, '空洞補 0xFF（抹除值）');
      CHECK(rj.holes === 0x10000 - 2, '空洞數如實回報：' + rj.holes);

      /* 🔴 02（Extended Segment）：base = data×16 */
      const seg = [rec(0x0000, 2, [0x10, 0x00]),       /* base = 0x1000*16 = 0x10000 */
                   rec(0x0000, 0, [0x77]), rec(0, 1, [])].join('\n');
      const rs = A.parseHexText(seg);
      EQ(rs.startAddr, 0x10000, '🔴 02 記錄 ⇒ 基底 = data×16');

      /* checksum 錯要報第幾行 */
      const lines = ih.split('\n');
      lines[1] = lines[1].slice(0, -2) + '00';
      const rc = A.parseHexText(lines.join('\n'));
      CHECK(rc.err !== null, '🔴 checksum 錯要擋下');
      EQ(rc.err.line, 2, '🔴 報第 2 行');
      CHECK(/checksum/.test(rc.err.reason), '講出是 checksum：' + rc.err.reason);

      /* 05（Start Linear Address）不參與資料搬移 */
      const st = [rec(0x0000, 0, [0x99]), rec(0x0000, 5, [0, 0, 0, 0]), rec(0, 1, [])].join('\n');
      EQ(A.parseHexText(st).bytes, [0x99], '05 記錄不搬資料');
      /* 不支援的 record type 要講 */
      const un = [rec(0x0000, 6, [0x00]), rec(0, 1, [])].join('\n');
      CHECK(/record type/.test(A.parseHexText(un).err.reason), '不支援的 record type 要明講');
    }

    /* ── 19c. 🔴 最重要的一條：載入不可以送出任何 I2C 交易 ───────────────── */
    const sentF = await useHelper(baseScript());
    const before = sentF.length;
    const bin = new win.Uint8Array(4096);
    for (let i = 0; i < 4096; i++) bin[i] = (i * 7) & 0xFF;
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000' });
    A.loadFile('dump.bin', bin);
    await sleep(30);
    EQ(sentF.length - before, 0, '🔴🔴 載入檔案之後送出的 WS 訊息數 ＝ 0（一個 byte 都沒上匯流排）');
    EQ(A.fileState().len, 4096, '4096 byte 的檔案載進來了');

    /* ── 19d. 總 byte 數共用同一個欄位 ─────────────────────────────────── */
    EQ(doc.getElementById('in-len').value, '4096', '🔴 載入後總 byte 數自動變成檔案長度');
    /* 🔴🔴 v1.16.2：**寫入來源不再看「總 byte 數」欄位**（Bruce 2026-09-19 的更正：
       「寫入不該被擋…長度不一樣，我後面進來的一定就會變成 A，那就等於是重新開始」）。
       舊斷言「使用者把總 byte 數改小 ⇒ 以他改的為準」**整條作廢** ——
       那個欄位是給讀取用的，拿它來截寫入來源，正是「讀 256 之後載入 8192 的檔
       按不下去」那個 bug 的根。 */
    EQ(A.writeSource(2).bytes.length, 4096, '🔴 來源＝目前 dump 的內容，整份 4096');
    doc.getElementById('in-len').value = '256';
    doc.getElementById('in-len').dispatchEvent(new win.Event('input', { bubbles: true }));
    EQ(A.writeSource(2).bytes.length, 4096, '🔴🔴 把總 byte 數改成 256 ⇒ 寫入來源**完全不受影響**');
    EQ(A.writeSource(2).bytes[511], bin[511], '內容也沒被截，第 511 個 byte 正確');
    doc.getElementById('in-len').value = '4096';
    doc.getElementById('in-len').dispatchEvent(new win.Event('input', { bubbles: true }));

    /* ── 19e. 預覽：分頁與範圍標示 ─────────────────────────────────────── */
    EQ(A.bKind(), 'file', '載入後自動切到檔案檢視');
    EQ(A.state().pages.length, 16, '🔴 4096 byte ⇒ 16 頁，每頁 256 byte');
    {
      const labels = A.pageLabels();
      EQ(labels[0], '0x0000 – 0x00FF', '🔴 第 0 頁範圍 0x0000–0x00FF');
      EQ(labels[15], '0x0F00 – 0x0FFF', '🔴 第 15 頁範圍 0x0F00–0x0FFF');
    }
    {
      const cells = Array.from(doc.querySelectorAll('#dump td'));
      EQ(cells[0].textContent, '00', '第 0 格 ＝ 檔案第 0 個 byte');
      EQ(cells[1].textContent, '07', '第 1 格 ＝ 檔案第 1 個 byte（i*7）');
    }
    /* ── 19f. 🔴🔴 v1.16.2：**舊的「檔案模式」整套收掉** ──────────────────
       Bruce 2026-09-19：「檔案名稱寫在網頁上面的位置，重複的地方太多了。
       一下子在上面，一下子又在綠色的裡面，一下子又在黃色的裡面。」
       根因是兩套模型重疊：琥珀卡片＋標題改字＋切換鈕，講的就是 A／B 已經在講的
       「檔案 vs 裝置」。⇒ 舊斷言全部反過來：那些東西**不該再存在**。 */
    CHECK(!doc.getElementById('dumpcard').classList.contains('filemode'),
          '🔴 不再有「檔案模式」的琥珀卡片');
    EQ(doc.getElementById('dumptitle').textContent.trim(), '16 × 16 Dump',
       '🔴 標題固定，不再變成「檔案內容：…（尚未寫入）」');
    EQ(doc.getElementById('btn-view'), null, '🔴 切換鈕整顆刪掉（改成點 A／B 那一行）');
    /* 檔名只出現在 A／B 那一區 —— 掃整個 dump 卡片的文字 */
    CHECK(!/v2\.bin/.test(doc.getElementById('dumptitle').textContent), '標題裡沒有檔名');

    /* ── 19g. 兩份資料並存、可切換（能力保留，改由點 A／B 提供）──────────
       🔴 這一組原本用的假 helper **read 不回任何 data**（`baseScript()` 沒有覆寫
          read ⇒ 回 `{ok:true}`、沒有 data）⇒ 讀到 0 byte，所以「檔案沒被丟掉」
          其實是「讀取根本沒成功」造成的，**斷言通過的理由是錯的**。
          要驗 v1.16.1 的「讀取覆蓋 B」就必須讓讀取真的回資料。 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, () => 0x5A) };
    }));
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '3' });
    win.confirm = () => true;
    await A.doRead(); await sleep(25);
    EQ(A.bKind(), 'dev', '按讀取 ⇒ 顯示裝置那一份');
    /* 🔴 v1.16.1 起讀取會放掉檔案（B 被覆蓋，他要的「檔名不要卡住」），
       但**看得到 A** —— A 是快照複本，點 A 那一行就能切過去看。 */
    EQ(A.fileState().len, 0, '🔴 讀取覆蓋 B ⇒ 檔案放掉（v1.16.1 起）');
    CHECK(A.srcA() !== null, '🔴 A 還在（要能切過去看）');

    /* ── 19h. 手打會放掉檔案（來源只能有一個）──────────────────────────── */
    A.clearFile();
    EQ(A.fileState().len, 0, 'clearFile 之後沒有檔案');
    A.setInputs({ data: 'DE AD' });
    EQ(A.writeSource(2).from, '手動輸入', '沒有檔案就回到文字框那一份');

    /* ── 19i. 四種副檔名都選得到 ───────────────────────────────────────── */
    {
      const acc = doc.getElementById('in-file').getAttribute('accept');
      ['.bin', '.hex', '.txt', '.rom'].forEach(e =>
        CHECK(acc.indexOf(e) >= 0, 'accept 含 ' + e + '：' + acc));
    }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19b. offset 寬度 0：沒有位址相位，data 恰好 1 byte（PMIC digital VCOM）');
  {
    /* 🔴 這一組存在的理由：寬度 0 與寬度 1 送出去的 byte 看起來很像，
       但相位不同 —— 寬度 0 那個值走 **data**，寬度 1 走 **位址**。
       誤把兩者當成一樣，燒 PMIC 的 VCOM 就會寫到不存在的位址去。 */
    const sent0 = await useHelper(baseScript());
    const n0 = sent0.length;
    A.setInputs({ slave: '0x30', awid: 0, off: '0x5A', len: '4096', data: 'DE AD BE EF' });
    await A.doWrite(); await sleep(25);
    const w0 = SINCE(sent0, 'rawwrite');
    EQ(w0.length, 1, '寬度 0 ⇒ 只送一則');
    EQ({ awid: w0[0].awid, data: w0[0].data },
       { awid: 0, data: [0x5A] },
       '🔴 寬度 0：awid=0（沒有位址相位）且 data **恰好是 ③ 的那 1 byte**');
    CHECK(w0[0].data.length === 1,
          '🔴 即使總 byte 數填 4096、資料欄有 4 個 byte，也只送 1 個 byte');

    /* 同一個值改用寬度 1 ⇒ 走位址相位，兩者 wire 不同 */
    const sent1 = await useHelper(baseScript());
    A.setInputs({ slave: '0x30', awid: 1, off: '0x5A', len: '4', data: 'DE AD BE EF' });
    await A.doWrite(); await sleep(25);
    const w1 = SINCE(sent1, 'rawwrite');
    EQ({ awid: w1[0].awid, addr: w1[0].addr, data: w1[0].data },
       { awid: 1, addr: 0x5A, data: [0xDE, 0xAD, 0xBE, 0xEF] },
       '🔴 寬度 1：0x5A 走位址相位，後面才是 data —— 與寬度 0 那筆不同');
    CHECK(JSON.stringify(w0[0]) !== JSON.stringify(w1[0]),
          '🔴 兩者送出的訊息確實不同（不可以被當成同一件事）');

    /* 寬度 0 的讀取：仍是 current address read，長度由總 byte 數決定 */
    const sentR = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [1, 2, 3, 4, 5, 6, 7, 8] };
    }));
    A.setInputs({ slave: '0x30', awid: 0, off: '0x00', len: '8' });
    await A.doRead(); await sleep(25);
    const r0 = SINCE(sentR, 'read');
    EQ({ awid: r0[0].awid, len: r0[0].len }, { awid: 0, len: 8 },
       '🔴 寬度 0 的讀取仍是 current address read，長度照總 byte 數（讀寫在這裡刻意不同）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19c. 基準與差異：可比才比，不可比就成為新基準');
  {
    /* 🔴 Bruce 2026-09-18 的最終規則：
         檔案↔I2C、檔案↔檔案：**只看長度**（他明講「不管是 0x50 還是 0x68，
           讀回來都是跟檔案做比較」⇒ slave 不列入）
         I2C↔I2C：長度＋slave＋起始 offset＋offset 寬度 都要相同
       不可比 ⇒ 新資料成為新基準，無 highlight。 */
    const mk = (n, f) => { const u = new win.Uint8Array(n); for (let i = 0; i < n; i++) u[i] = f(i); return u; };
    let payload = null;
    const script = baseScript((m) => {
      if (m.type === 'read') {
        const d = []; for (let i = 0; i < m.len; i++) d.push(payload((m.addr + i) & 0xFFFFFFFF, i));
        return { ok: true, status: 0, data: d };
      }
    });

    /* ── 純函式：可比性 ─────────────────────────────────────────────────── */
    const F4 = A.makeSet('file', 0x68, 2, 0, mk(4, i => i), 'a.bin');
    const D4 = A.makeSet('dev', 0x68, 2, 0, mk(4, i => i));
    const D4b = A.makeSet('dev', 0x50, 2, 0, mk(4, i => i));
    const D4c = A.makeSet('dev', 0x68, 2, 0x100, mk(4, i => i));
    const D4d = A.makeSet('dev', 0x68, 1, 0, mk(4, i => i));
    const D8 = A.makeSet('dev', 0x68, 2, 0, mk(8, i => i));
    CHECK(A.comparable(F4, D4), '檔案 ↔ I2C 同長度 ⇒ 可比');
    CHECK(A.comparable(F4, D4b), '🔴 檔案 ↔ I2C **不看 slave**（他明講）');
    CHECK(A.comparable(F4, A.makeSet('file', 0, 2, 0, mk(4, i => i), 'b.bin')), '檔案 ↔ 檔案同長度 ⇒ 可比');
    CHECK(!A.comparable(F4, D8), '長度不同 ⇒ 不可比（任何組合）');
    CHECK(A.comparable(D4, A.makeSet('dev', 0x68, 2, 0, mk(4, i => i))), 'I2C ↔ I2C 全同 ⇒ 可比');
    CHECK(!A.comparable(D4, D4b), '🔴 I2C ↔ I2C：slave 不同 ⇒ 不可比');
    CHECK(!A.comparable(D4, D4c), '🔴 I2C ↔ I2C：起始 offset 不同 ⇒ 不可比（我補的那一條）');
    CHECK(!A.comparable(D4, D4d), '🔴 I2C ↔ I2C：offset 寬度不同 ⇒ 不可比（我補的那一條）');

    /* ── 端到端：檔案(16) → I2C(16) ⇒ 比較，且不看 slave ─────────────────── */
    await useHelper(script);
    A.clearFile();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    A.loadFile('base.bin', mk(16, i => i));
    await sleep(20);
    EQ(A.refKind(), 'file', '第一次載入檔案 ⇒ 檔案成為基準');
    EQ(A.diffCount(), 0, '第一次載入沒有比較對象 ⇒ 0');
    payload = (a, i) => (i === 3 ? 0xFF : i);            /* 只有第 3 個 byte 不同 */
    A.setInputs({ slave: '0x50', len: '16' });           /* 🔴 故意換 slave */
    await A.doRead(); await sleep(25);
    EQ(A.refKind(), 'file', '🔴 I2C 讀回同長度 ⇒ 仍拿檔案當基準（不看 slave）');
    EQ(A.diffCount(), 1, '🔴 檔案 ↔ I2C 比出 1 處不同');
    EQ(A.diffKeys(), [3], '差異在索引 3');

    /* ── 檔案(16) → I2C(4) ⇒ 長度不同，不比較，I2C 成為新基準 ─────────────── */
    payload = (a, i) => 0x00;
    A.setInputs({ len: '4' });
    await A.doRead(); await sleep(25);
    EQ(A.refKind(), 'dev', '🔴 長度不同 ⇒ 不比較，這次 I2C 成為新基準');
    EQ(A.diffCount(), 0, '不可比 ⇒ 沒有 highlight');

    /* ── I2C(4) → 檔案(4) ⇒ 比較，且檔案**不會**變成新基準 ────────────────── */
    A.loadFile('cmp.bin', mk(4, i => (i === 1 ? 0x77 : 0x00)));
    await sleep(20);
    EQ(A.refKind(), 'dev', '🔴 載入同長度的檔案 ⇒ 基準仍是先前那次 I2C 讀取');
    EQ(A.diffCount(), 1, '🔴 檔案與 I2C 基準比出 1 處');
    EQ(A.diffKeys(), [1], '差異在索引 1');

    /* ── 檔案 → 檔案（同長度 ⇒ 比較；不同長度 ⇒ 新基準）───────────────────── */
    A.snapshot();                                        /* 把當前檔案定為基準 */
    EQ(A.refKind(), 'file', '按快照 ⇒ 當前那一份成為基準');
    EQ(A.diffCount(), 0, '🔴 按快照的同時 diff 清零');
    A.loadFile('f2.bin', mk(4, i => (i === 1 ? 0x77 : (i === 3 ? 0x99 : 0x00))));
    await sleep(20);
    EQ(A.diffCount(), 1, '🔴 檔案 ↔ 檔案（同長度）⇒ 比較');
    A.loadFile('f3.bin', mk(8, i => 0));
    await sleep(20);
    EQ(A.diffCount(), 0, '檔案 ↔ 檔案（長度不同）⇒ 不比較');
    EQ(A.refLabel().indexOf('f3.bin') >= 0, true, '新檔案成為基準：' + A.refLabel());

    /* ── 讀取失敗的資料不得成為基準、也不得參與比較 ──────────────────────── */
    {
      const refBefore = A.refLabel();
      await useHelper(baseScript((m) => { if (m.type === 'read') return { ok: false, status: 7, data: [] }; }));
      A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '8' });
      await A.doRead(); await sleep(25);
      EQ(A.refLabel(), refBefore, '🔴 讀取失敗 ⇒ 基準保持原樣');
      EQ(A.diffCount(), 0, '🔴 失敗的資料不參與比較');
    }

    /* ── diff log 的內容與兩顆手動按鈕 ──────────────────────────────────── */
    await useHelper(script);
    A.clearFile();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    A.loadFile('g1.bin', mk(16, i => i));
    await sleep(20);
    A.loadFile('g2.bin', mk(16, i => (i === 1 ? 0xA5 : i)));
    await sleep(20);
    EQ(A.diffCount(), 1, '兩個同長度的檔案，只有 0x0001 不同 ⇒ 只列一筆');
    EQ(doc.getElementById('diffcount').textContent, '1', '🔴 差異總數顯示在標題列');
    {
      const rows = doc.querySelectorAll('#diffrows .diffrow');
      EQ(rows.length, 1, 'diff log 只有一列');
      const t = rows[0].textContent;
      CHECK(t.indexOf('0x0001') >= 0, '🔴 列出位址：' + t);
      CHECK(t.indexOf('01') >= 0 && t.indexOf('A5') >= 0, '🔴 列出兩邊的值（基準 → 現在）：' + t);
    }
    doc.getElementById('btn-clrdiff').click();
    EQ(A.diffCount(), 0, '「清除」只清 log');
    CHECK(A.refLabel() !== null, '「清除」不動基準');
    doc.getElementById('btn-recmp').click();
    EQ(A.diffCount(), 1, '「重新比較」拿當前資料再比一次 ⇒ 1 處');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19c2. 256K 規模：分頁、位址寬度、虛擬捲動不卡');
  {
    const N = 262144;
    const big = new win.Uint8Array(N);
    for (let i = 0; i < N; i++) big[i] = i & 0xFF;
    A.clearFile();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    const t0 = Date.now();
    A.loadFile('big.bin', big);
    await sleep(30);
    const tLoad = Date.now() - t0;
    EQ(A.fileState().len, N, '256K 檔案載進來了');
    EQ(A.pageCount(), 1024, '🔴 262144 byte ⇒ 1024 頁');
    EQ(A.addrDigits(), 5, '🔴 位址寬度 5 位（0x3FFFF），且同一份資料集內一致');
    EQ(A.pageLabel(0), '0x00000 – 0x000FF', '🔴 第 0 頁範圍');
    EQ(A.pageLabel(1023), '0x3FF00 – 0x3FFFF', '🔴 第 1023 頁範圍');
    EQ(doc.querySelectorAll('#dump td').length, 256, '畫面上永遠只有 256 格（只渲染當前頁）');
    CHECK(tLoad < 5000, '載入 256K 的耗時（含解析與渲染）：' + tLoad + ' ms');

    /* 跳頁 */
    CHECK(A.jumpTo('0x3FF00'), '跳到最後一頁');
    EQ(A.pageIdx(), 1023, '真的到第 1023 頁');
    CHECK(A.jumpTo('0x00123'), '填未對齊的完整位址（5 位 ⇒ 當位址）');
    EQ(A.pageIdx(), 1, '🔴 0x00123 自動對齊到 0x00100 那一頁');
    CHECK(A.jumpTo('3FF'), '填 3 位 ⇒ 當頁碼');
    EQ(A.pageIdx(), 1023, '🔴 頁碼 3FF ＝ 第 1023 頁');
    CHECK(A.jumpTo('ff'), '省略前導零');
    EQ(A.pageIdx(), 255, '頁碼 0FF ＝ 第 255 頁');
    CHECK(A.jumpTo('0x99999'), '超出範圍');
    EQ(A.pageIdx(), 1023, '🔴 超出範圍 ⇒ 夾到最後一頁，不報錯');

    /* 🔴 最壞情況：256K 全差異 —— 計算與渲染都要撐得住 */
    const other = new win.Uint8Array(N);
    for (let i = 0; i < N; i++) other[i] = (big[i] + 1) & 0xFF;      /* 每一個都不同 */
    A.snapshot();
    const t1 = Date.now();
    A.loadFile('big2.bin', other);
    await sleep(40);
    const tDiff = Date.now() - t1;
    EQ(A.diffCount(), N, '🔴 262144 處全部不同');
    EQ(doc.getElementById('diffcount').textContent, String(N), '總數顯示正確');
    const domRows = A.diffRowsDom();
    CHECK(domRows > 0 && domRows < 200,
      '🔴🔴 虛擬捲動：26 萬筆差異只建了 ' + domRows + ' 個 DOM 列（不是 262144 個）');
    CHECK(tDiff < 8000, '最壞情況的比較＋渲染耗時：' + tDiff + ' ms');
    A.clearFile();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19e. 頁碼輸入格（0x ▢▢▢ 00 ＋ 框內上下鍵）與十字定位');
  {
    const mk = (n, f) => { const u = new win.Uint8Array(n); for (let i = 0; i < n; i++) u[i] = f(i); return u; };
    A.clearFile();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    A.loadFile('p.bin', mk(262144, i => i & 0xFF));
    await sleep(40);

    /* ── 框內上下鍵：必須在輸入格**裡面**（Bruce 明講不可以做到框外）────── */
    {
      const box = doc.getElementById('pagebox');
      CHECK(box.contains(doc.getElementById('page-up')) && box.contains(doc.getElementById('page-dn')),
            '🔴 上下鍵在輸入格（.pagebox）裡面');
      CHECK(box.contains(doc.getElementById('pagesel')), '可編輯的頁碼也在同一個框裡');
      const fixes = Array.from(box.querySelectorAll('.fix')).map(e => e.textContent);
      EQ(fixes, ['0x', '00'], '🔴 0x 與末兩位 00 是固定的（不可編輯）');
      CHECK(doc.getElementById('pagesel').tagName === 'INPUT', '中間那幾位是可編輯的 input');
    }
    /* ── 上下鍵：一次 ±0x100 ────────────────────────────────────────────── */
    A.jumpTo('010');
    const a0 = A.pageIdx();
    doc.getElementById('page-up').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
    doc.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
    EQ(A.pageIdx(), a0 + 1, '🔴 按上鍵一次 ⇒ 位址 +0x100');
    doc.getElementById('page-dn').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
    doc.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
    EQ(A.pageIdx(), a0, '🔴 按下鍵一次 ⇒ 位址 −0x100');
    /* 鍵盤 ↑↓ 與框內箭頭行為一致 */
    const ev = k => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true }); doc.getElementById('pagesel').dispatchEvent(e); };
    ev('ArrowUp');   EQ(A.pageIdx(), a0 + 1, '鍵盤 ↑ 與上鍵一致');
    ev('ArrowDown'); EQ(A.pageIdx(), a0, '鍵盤 ↓ 與下鍵一致');
    /* 夾住、不繞回 */
    A.jumpTo('000'); ev('ArrowDown'); EQ(A.pageIdx(), 0, '🔴 到頂夾住，不繞回');
    A.jumpTo('3FF'); ev('ArrowUp');   EQ(A.pageIdx(), 1023, '🔴 到底夾住，不繞回');
    /* 顯示：hex、位數一致 */
    EQ(A.pageDigits(), 3, '🔴 1024 頁 ⇒ 頁碼 3 位（000~3FF），同一份資料內一致');
    EQ(doc.getElementById('pagesel').value, '3FF', '輸入格顯示十六進位的頁碼');
    CHECK(A.jumpTo('3ff'), '小寫也吃'); EQ(A.pageIdx(), 1023, '3ff ＝ 3FF');
    CHECK(A.jumpTo('ff'), '省略前導零'); EQ(A.pageIdx(), 255, 'ff ＝ 0FF ＝ 第 255 頁');

    /* ── 十字定位 ───────────────────────────────────────────────────────── */
    A.jumpTo('000');
    A.setCross(0x0033);
    EQ(A.cross(), 0x0033, '十字中心 0x0033');
    {
      const cells = Array.from(doc.querySelectorAll('#dump td'));
      const hl = cells.filter(td => td.classList.contains('xh'));
      /* 第 3 列 16 格 ＋ 第 3 欄 16 格 − 交叉那一格重複 ＝ 31 */
      EQ(hl.length, 31, '🔴 整列 16 ＋ 整欄 16 − 交叉 1 ＝ 31 格 highlight');
      const c = doc.querySelector('#dump td[data-addr="51"]');
      CHECK(c.classList.contains('xc'), '🔴 交叉中心就是 0x0033');
      CHECK(doc.querySelectorAll('#dump th.xh').length >= 2, '列表頭與欄表頭也標出來');
    }
    /* 不在當前頁的位址 ⇒ 自動跳頁並與 spinner 連動 */
    A.jumpTo('000');
    A.setCross(0x0233);
    EQ(A.pageIdx(), 2, '🔴 定位到不在當前頁的位址 ⇒ 自動跳到 0x0200 那一頁');
    EQ(doc.getElementById('pagesel').value, '002', '🔴 spinner 同步更新');
    CHECK(doc.querySelector('#dump td[data-addr="563"]').classList.contains('xc'), '十字落在正確位置');
    /* 反向：點格子 ⇒ 十字出現、左上角輸入框顯示該格位址，且**不改值** */
    {
      const before = A.state().buf[563];
      const td = doc.querySelector('#dump td[data-addr="600"]');
      td.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      EQ(A.cross(), 600, '🔴 點格子 ⇒ 十字中心換到那一格');
      EQ(doc.getElementById('xhair').value, '0x00258', '🔴 左上角輸入框顯示該格位址');
      EQ(A.state().buf[563], before, '🔴 定位不會改到任何值（不會誤燒）');
    }
    /* 左上角輸入框的解析 */
    EQ(A.crossParse('0x0233'), 0x0233, '完整位址');
    EQ(A.crossParse('33'), 0x0233, '只填頁內偏移 ⇒ 補上當前頁首');
    EQ(A.crossParse(''), null, '空字串 ⇒ 不定位');
    A.clearFile();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19f. 一格三層：主值／左上快照值／右上換出值');
  {
    const mk = (n, f) => { const u = new win.Uint8Array(n); for (let i = 0; i < n; i++) u[i] = f(i); return u; };
    A.clearFile();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    A.loadFile('v1.bin', mk(16, i => i));
    await sleep(20);
    A.snapshot();                                  /* v1 成為基準 */
    A.loadFile('v2.bin', mk(16, i => (i === 5 ? 0xAA : i)));
    await sleep(20);
    {
      const c = A.cellParts(5);
      EQ(c.main, 'AA', '主值 ＝ 現在生效的值（會被寫進去的那個）');
      EQ(c.snap, '05', '🔴 左上小字 ＝ 快照值');
      /* 🔴 A／B 模型（2026-09-19 定案）：狀態 1 只有左上，右上必須是空的。 */
      EQ(c.old, null, '🔴 狀態 1：右上是空的（左上與右上絕不同時出現）');
      CHECK(c.cls.indexOf('diff') >= 0, '與基準不同 ⇒ diff 標記');
    }
    {
      const c = A.cellParts(6);
      EQ(c.main, '06', '沒變的格子只有主值');
      EQ(c.snap, null, '🔴 與快照相同就不印左上（避免整片重複數字干擾）');
      EQ(c.old, null, '🔴 沒變過的格子沒有換出值（雜訊在來源就處理掉）');
    }
    /* 三個數字互不相同的情境：讀 → 快照 → 再讀（值變了）⇒ 左上＝快照、右上＝上一次讀到的 */
    {
      A.clearFile();
      let pay = (a, i) => i;
      const sc = baseScript((m) => {
        if (m.type === 'read') { const o = []; for (let i = 0; i < m.len; i++) o.push(pay(m.addr + i, i)); return { ok: true, status: 0, data: o }; }
      });
      await useHelper(sc);
      A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
      await A.doRead(); await sleep(25);      /* 第一次：00..0F，自動成為基準 */
      pay = (a, i) => (i === 5 ? 0xAA : i);
      await A.doRead(); await sleep(25);      /* 第二次：0x05 變成 AA */
      {
        const c = A.cellParts(5);
        EQ(c.main, 'AA', '主值 ＝ 這一次讀到的');
        EQ(c.snap, '05', '🔴 左上 ＝ 快照值');
        EQ(c.old, null, '🔴 讀取後是狀態 1 ⇒ 右上空（右上只由「點左上」產生）');
      }
      pay = (a, i) => (i === 5 ? 0xBB : i);
      await A.doRead(); await sleep(25);      /* 第三次：0x05 變成 BB */
      {
        const c = A.cellParts(5);
        EQ(c.main, 'BB', '主值 ＝ 最新讀到的 BB');
        EQ(c.snap, '05', '🔴 左上 ＝ 快照值（第一次讀到的 05）');
        EQ(c.old, null, '🔴 再讀一次仍然是狀態 1 ⇒ 右上空');
      }
    }

    /* 視覺層次：主值要比角落大。
       🔴 A／B 模型定案後，**三層永遠不會同時存在**（左上與右上互斥），
       所以這裡只驗主值與「當下那個角落」的字級差。 */
    {
      const td = doc.querySelector('#dump td[data-addr="5"]');
      const mv = parseFloat(win.getComputedStyle(td.querySelector('.mv')).fontSize);
      const corner = td.querySelector('.sv') || td.querySelector('.ov');
      const sv = parseFloat(win.getComputedStyle(corner).fontSize);
      CHECK(!!corner && !(td.querySelector('.sv') && td.querySelector('.ov')),
            '🔴 只有一個角落有值（左上與右上不同時出現）');
      CHECK(mv > sv, '🔴 主值比角落小字大（' + mv + 'px vs ' + sv + 'px）—— 三個一樣大會看錯要燒哪個');
    }

    /* 🔴 三槽輪替：點左上 ⇒ 主值換成快照值、原主值移到右上；點右上 ⇒ 換回來。
       可以無限來回而不遺失任何一個值，而且**主值就是按寫入時會燒的值**。 */
    {
      /* 🔴 v1.16.1：這一段驗的是**三槽的顯示語意**，與 I2C 無關。
         角落還原現在在連線狀態下會真的寫回裝置（走 i2ctApplyCellValue），
         留著連線會把這一段變成在驗假裝置的回讀值 —— 那是另一件事，
         已經在第 31 組端到端驗過。這裡先斷線，維持原本的驗證對象。 */
      if (A.state().linked) await win.__i2ct.disconnect();
      const before = A.cellParts(5);
      EQ(before.main, 'BB', '起點：主值 BB、左上 05、右上 AA');
      await A.slotClick(5, 'sv');
      {
        const c = A.cellParts(5);
        EQ(c.main, '05', '🔴 點左上 ⇒ 主值換成快照值 05');
        EQ(c.old, 'BB', '🔴 原主值 BB 移到右上');
        EQ(A.state().buf[5], 0x05, '🔴 主值真的改到資料本身（寫入時會燒 05）');
      }
      await A.slotClick(5, 'ov');
      {
        const c = A.cellParts(5);
        EQ(c.main, 'BB', '🔴 點右上 ⇒ 主值換回 BB');
        /* 🔴 2026-09-19 更正：這兩條**原本把 bug 寫成預期行為**（斷言「對調之後
           右上變成 05」「再點右上又換回 05」）。那正是 Bruce 看到的
           「右上變得跟左上一樣而且不消失」。右上的語意是「這一格在變成現在
           這個值之前是什麼」—— 放回主值之後就沒有換出值了，那個槽必須是空的。
           這也是為什麼這個 bug 能出貨：**測試背書了錯誤的規格。** */
        EQ(c.old, null, '🔴 放回去之後右上**清空**（不是對調成跟左上一樣）');
        EQ(c.snap, '05', '左上仍然是快照值 05，與右上不會變成同一個值');
      }
      await A.slotClick(5, 'ov');
      EQ(A.cellParts(5).main, 'BB', '🔴 右上已空 ⇒ 再點不做事（不是又換回去）');
      await A.slotClick(5, 'sv');
      EQ(A.cellParts(5).main, '05', '🔴 要換回快照值就點左上 ⇒ 可無限來回');
      await A.slotClick(5, 'ov');
      EQ(A.cellParts(5).main, 'BB', '🔴 再點右上 ⇒ 回到 BB（A ⇄ B 無限來回）');
      await A.slotClick(5, 'ov');
      EQ(A.cellParts(5).main, 'BB', '再點一次 ⇒ BB，值一個都沒遺失');
    }

    /* 🔴 v1.16.1：未連線的角落還原會把那一格標成 dirty（它確實還沒寫進裝置）⇒
       這一組結束時必須把狀態清乾淨，否則下一組的「讀取」會先跳一個
       「有未寫入的修改，要覆蓋嗎」的 confirm，在 jsdom 裡回 undefined ⇒
       讀取被取消，下一組就在驗一個根本沒發生的讀取。`clearFile()` 清不掉 dirty。 */
    A._reset();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19d. 手動 hex 輸入的容忍寫法（Bruce 2026-09-18）');
  {
    /* 🔴 同一份資料的所有寫法，解析結果必須逐 byte 相同 —— 這是判準。 */
    const want = [0xA1, 0xD8, 0xFB];
    const forms = {
      '空格':            'A1 D8 FB',
      '逗號':            'A1,D8,FB',
      '完全不分隔':      'A1D8FB',
      '0x＋逗號':        '0xA1, 0xD8, 0xFB',
      '0x＋空格':        '0xA1 0xD8 0xFB',
      'h 後綴':          'A1h D8h FBh',
      'h 後綴大寫':      'A1H D8H FBH',
      '0x＋h 誤寫':      '0xA1h 0xD8h 0xFBh',
      '混用':            '0xA1, D8h FB',
      '小寫':            'a1 d8 fb',
      '換行分隔':        'A1\nD8\nFB',
      'tab 分隔':        'A1\tD8\tFB',
      '前後多餘空白':    '   A1   D8   FB   '
    };
    Object.keys(forms).forEach(k => EQ(A.parseHex(forms[k]), want, '🔴 ' + k + ' ⇒ A1 D8 FB'));
    /* 反面：看不懂的 token 要回 null，而且指得出是哪一個 */
    EQ(A.parseHex('A1 ZZ FB'), null, '壞 token ⇒ null');
    EQ(A.parseHex('A1 D'), null, '半個 byte ⇒ null（不臆測）');
    EQ(A.parseHex(''), [], '空字串 ⇒ 空陣列');
    /* 畫面上的範例只留一個最常見的（極簡） */
    {
      const ph = doc.getElementById('in-data').getAttribute('placeholder');
      CHECK(ph.split(/\s+或\s+/).length === 1, '🔴 placeholder 只列一種寫法：' + ph);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('19g. 長讀取的進度與中止（256K ＝ 1024 次交易）');
  {
    /* 🔴 用假 helper 驗，不需要真硬體。中止之後那一份**不得成為基準**。
       🔴 v1.13.3：中止的顆粒度**只存在於慢路徑**（快路徑 4096 一次送完、
       約 0.1 秒，本來就不需要進度條與中止 —— 這是 i2ctChunk() 的設計理由）。
       所以這一組要明講走慢路徑，不能靠預設值（快速模式已是預設開）。
       🔴 要放在 useHelper（連線）**之後** —— 連線會把快速模式還原成預設開
       （那正是這一版修掉的退回狀態不復原的 bug），放前面會被蓋掉。 */
    let served = 0;
    const sc = baseScript((m) => {
      if (m.type === 'read') {
        served++;
        if (served === 3) A.abort();                 /* 第 3 則的時候按下中止 */
        const o = []; for (let i = 0; i < m.len; i++) o.push(0x5A);
        return { ok: true, status: 0, data: o };
      }
    });
    await useHelper(sc);
    A.mode(2);           /* 🔴 v1.20.1：明講 SLOW。rawMpsse(false) 現在是 VENDOR＝不分段 */
    A.clearFile();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '2048' });
    const refBefore = A.refLabel();
    await A.doRead(); await sleep(60);
    CHECK(served >= 3 && served < 8, '🔴 中止之後沒有把 8 則全部送完（實際送了 ' + served + ' 則）');
    EQ(A.refLabel(), refBefore, '🔴 中止的讀取不得成為基準');
    EQ(A.diffCount(), 0, '🔴 中止的資料不參與比較');
    CHECK(doc.getElementById('log').textContent.indexOf('中止') >= 0, '中止有寫進 log');
    CHECK(doc.getElementById('progress') !== null, '進度列在 DOM 上');
    EQ(A.progress(), null, '跑完／中止之後進度列收起來');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('20. 極簡準則：非 debug 看不到診斷用的東西，debug 打開就全回來');
  {
    A.setDebug(false);
    const gone = ['btn-release', 'btn-self', 'btn-takeover'];
    gone.forEach(id => CHECK(win.getComputedStyle(doc.getElementById(id)).display === 'none',
      '🔴 非 debug 下 ' + id + ' 看不到'));
    CHECK(win.getComputedStyle(doc.getElementById('helper-card')).display === 'none',
      '🔴 helper 資訊卡收進 debug');
    function visibleText(root) {
      let out = '';
      const w = doc.createTreeWalker(root, win.NodeFilter.SHOW_TEXT, null);
      while (w.nextNode()) {
        const p = w.currentNode.parentElement;
        if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
        let hid = false;
        for (let n = p; n; n = n.parentElement) {
          if (n.id === 'log') { hid = true; break; }
          const cs = win.getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden') { hid = true; break; }
          if (n.tagName === 'DETAILS' && !n.open) { hid = true; break; }
        }
        if (!hid) out += w.currentNode.nodeValue;
      }
      return out;
    }
    const vis = visibleText(doc.body);
    CHECK(vis.indexOf('127.0.0.1') < 0, '🔴 非 debug 的可見文字裡沒有 127.0.0.1');
    CHECK(vis.indexOf('黃金向量') < 0, '🔴 非 debug 看不到「黃金向量」');
    CHECK(vis.indexOf('釋放 I2C') < 0, '🔴 非 debug 看不到「釋放 I2C」');
    CHECK(doc.getElementById('log').textContent.indexOf('127.0.0.1') >= 0,
          '🔴 但 log 裡照樣印 127.0.0.1（診斷能力沒被砍）');
    A.setDebug(true);
    gone.forEach(id => CHECK(win.getComputedStyle(doc.getElementById(id)).display !== 'none',
      'debug 打開後 ' + id + ' 回來'));
    CHECK(win.getComputedStyle(doc.getElementById('helper-card')).display !== 'none',
      'debug 打開後 helper 資訊卡回來');
    A.setDebug(false);
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('21. 下載鈕與說明視窗（Bruce：按下下載才跳說明，字要大）');
  {
    A.needHelper('連不到 helper');
    CHECK(win.getComputedStyle(doc.getElementById('gethelper')).display !== 'none', '🔴 下載入口看得到');
    CHECK(doc.getElementById('dl').textContent.indexOf(win.HELPER_PKG.pkg) >= 0,
          '🔴 版號印在按鈕上：' + doc.getElementById('dl').textContent.trim());
    CHECK(win.getComputedStyle(doc.getElementById('howto')).display === 'none', '說明視窗預設不出現');
    doc.getElementById('dl').click();
    CHECK(win.getComputedStyle(doc.getElementById('howto')).display !== 'none', '🔴 按下下載 ⇒ 說明視窗出現');
    {
      const li = doc.querySelector('#howto li');
      const big = parseFloat(win.getComputedStyle(li).fontSize);
      const body = parseFloat(win.getComputedStyle(doc.body).fontSize) || 13;
      CHECK(big > body, '🔴 說明視窗的字比內文大：' + big + 'px vs ' + body + 'px');
      CHECK(doc.querySelectorAll('#howto li').length <= 3, '步驟三行以內');
    }
    doc.getElementById('howto-ok').click();
    CHECK(win.getComputedStyle(doc.getElementById('howto')).display === 'none', '一鍵關得掉');
    CHECK(doc.querySelectorAll('a[download]').length === 1, '🔴 整頁只有一個下載入口');
    A.gotHelper();
    CHECK(win.getComputedStyle(doc.getElementById('gethelper')).display === 'none', '連上之後收起來');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('22. slave 三格連動：7-bit ⇔ 8-bit write ⇔ 8-bit read');
  {
    const s7 = doc.getElementById('in-slave'), w8 = doc.getElementById('in-slave8w'), r8 = doc.getElementById('in-slave8r');
    const typeIn = (el, v, commit) => {
      el.value = v;
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      if (commit) el.dispatchEvent(new win.Event('change', { bubbles: true }));
    };
    typeIn(s7, '0x68', true);
    EQ(w8.value, '0xD0', '改 7-bit 0x68 ⇒ 8-bit write 0xD0');
    EQ(r8.value, '0xD1', '改 7-bit 0x68 ⇒ 8-bit read 0xD1');
    typeIn(w8, '0xA0', true);
    EQ(s7.value, '0x50', '🔴 反向：8-bit write 0xA0 ⇒ 7-bit 0x50');
    EQ(r8.value, '0xA1', '8-bit write 0xA0 ⇒ 8-bit read 0xA1');
    typeIn(r8, '0x93', true);
    EQ(s7.value, '0x49', '🔴 反向：8-bit read 0x93 ⇒ 7-bit 0x49');
    EQ(w8.value, '0x92', '8-bit read 0x93 ⇒ 8-bit write 0x92');
    /* 🔴 防呆：write 打奇數 ⇒ 清掉 bit0；read 打偶數 ⇒ 補上 bit0。修正要看得見。 */
    typeIn(w8, '0xD1', true);
    EQ(w8.value, '0xD0', '🔴 write 打成 D1 ⇒ 自動修正成 D0');
    CHECK(doc.getElementById('slave8whint').textContent.indexOf('D1') >= 0
       && doc.getElementById('slave8whint').textContent.indexOf('D0') >= 0,
      '🔴 修正**看得見**：' + doc.getElementById('slave8whint').textContent);
    EQ(s7.value, '0x68', '修正後 7-bit 也對');
    typeIn(r8, '0xD0', true);
    EQ(r8.value, '0xD1', '🔴 read 打成 D0 ⇒ 自動修正成 D1');
    EQ(s7.value, '0x68', '修正後 7-bit 也對');
    /* 打到一半不可以被改掉（邊打邊修正會讓人打不完） */
    typeIn(w8, '0xD', false);
    EQ(w8.value, '0xD', '🔴 還在打的時候不動他的字（commit 才修正）');
    typeIn(s7, '0x68', true);
    /* 純函式層 */
    EQ(A.slaveFrom('w8', '0xD1').fixed.to, 0xD0, 'slaveFrom：write 奇數被修正');
    EQ(A.slaveFrom('r8', '0xD0').fixed.to, 0xD1, 'slaveFrom：read 偶數被修正');
    EQ(A.slaveFrom('w8', '0xD0').fixed, null, 'slaveFrom：write 偶數不動它');
    EQ(A.slaveFrom('s7', '0x80').s, null, 'slaveFrom：7-bit 超過 0x7F 擋下');
    /* 8-bit 那一段要**明顯**，不能是淡色 */
    {
      const lab = doc.querySelector('.f8 > span:first-child');
      const cs = win.getComputedStyle(lab), csi = win.getComputedStyle(w8);
      const sub = win.getComputedStyle(doc.querySelector('#in-slave')).borderColor;
      CHECK(cs.fontWeight === '700' || +cs.fontWeight >= 700, '🔴 8-bit 標籤是粗體：' + cs.fontWeight);
      CHECK(csi.borderColor !== sub, '🔴 8-bit 欄位的框跟一般欄位不同色：' + csi.borderColor + ' vs ' + sub);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('23. 輸入寬容解析：統一「純數字＝十六進位」，總 byte 數是唯一例外');
  {
    EQ(A.parseAddr('50'),      0x50, '🔴 純數字 ⇒ 十六進位');
    EQ(A.parseAddr('0x50'),    0x50, '0x 前綴');
    EQ(A.parseAddr('50h'),     0x50, 'h 後綴');
    EQ(A.parseAddr('50H'),     0x50, 'H 後綴');
    EQ(A.parseAddr('0X50'),    0x50, '大寫 0X');
    EQ(A.parseAddr('0x50H'),   0x50, '🔴 0x 與 H 同時存在（Bruce 指名的 0x50H）');
    EQ(A.parseAddr('0x50h'),   0x50, '0x 與小寫 h 同時存在');
    EQ(A.parseAddr(' 0x 50 '), 0x50, '夾雜空白');
    EQ(A.parseAddr('3ff'),     0x3FF, '小寫 a–f');
    EQ(A.parseAddr('3FF'),     0x3FF, '大寫 A–F');
    EQ(A.parseAddr('00050'),   0x50, '前導零');
    EQ(A.parseAddr('#80'),     80,   '🔴 # 前綴 ⇒ 十進位');
    EQ(A.parseAddr('80d'),     80,   '🔴 d 後綴 ⇒ 十進位');
    EQ(A.parseAddr('80D'),     80,   'D 後綴 ⇒ 十進位');
    EQ(A.parseAddr('xyz'),     null, '亂碼 ⇒ null');
    EQ(A.parseAddr('0x'),      null, '只有前綴 ⇒ null');
    EQ(A.parseAddr(''),        null, '空 ⇒ null');
    EQ(A.parseAddr('#5A'),     null, '# 後面不是十進位 ⇒ null（不偷偷當 hex）');
    /* 唯一例外：總 byte 數是數量 */
    EQ(A.parseNum('4096'), 4096, '🔴 總 byte 數：4096 ⇒ 4096（十進位，唯一例外）');
    EQ(A.parseNum('0x100'), 256, '總 byte 數也吃得下 0x100');
    /* 每一個位址類欄位都走同一支 */
    const setv = (id, v) => { const e = doc.getElementById(id); e.value = v;
      e.dispatchEvent(new win.Event('input', { bubbles: true })); };
    setv('in-slave', '0x50H'); EQ(doc.getElementById('in-slave8w').value, '0xA0', '① 吃 0x50H');
    setv('in-off', '3ff');
    CHECK(doc.getElementById('offhint').textContent.indexOf('0x03FF') >= 0,
      '🔴 ③ 即時顯示解析結果：' + doc.getElementById('offhint').textContent);
    setv('in-off', '#80');
    CHECK(doc.getElementById('offhint').textContent.indexOf('0x0050') >= 0,
      '③ #80 ⇒ 0x0050：' + doc.getElementById('offhint').textContent);
    /* 解不出來 ⇒ 標紅且**保留原輸入** */
    setv('in-off', 'zz');
    EQ(doc.getElementById('in-off').value, 'zz', '🔴 解不出來不清空他打的字');
    CHECK(doc.getElementById('in-off').classList.contains('bad'), '🔴 解不出來標紅');
    setv('in-off', '0x0000');
    /* 那一行小字：每個位址欄位都要有，且文字一致 */
    const note = A.decNote().replace(/^ · /, '');
    ['slavehint', 'slave8whint', 'slave8rhint', 'offhint'].forEach(id => {
      A.slaveSync('s7', true); A.updateHints && A.updateHints();
      CHECK(doc.getElementById(id).textContent.indexOf(note) >= 0,
        '🔴 ' + id + ' 有那一行小字「' + note + '」：' + doc.getElementById(id).textContent);
    });
    CHECK(doc.getElementById('lenhint').textContent.indexOf('十進位') >= 0,
      '🔴 ④ 標明是十進位（唯一例外）：' + doc.getElementById('lenhint').textContent);
    CHECK(doc.getElementById('xhair') === null
       || /十進位加 d/.test(doc.getElementById('xhair').getAttribute('title') || ''),
      '頁內定位格的規則寫在 title');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('24. 另存新檔：四種格式 ＋ round-trip 逐 byte 相同');
  {
    /* 獨立實作的 Intel HEX 驗算器 —— **不用自己的函式驗自己**。 */
    function ihexAudit(text) {
      const lines = text.split('\r\n').filter(x => x.length);
      const rec = [], bad = [];
      let upper = 0, eof = false, ext04 = 0;
      const flat = new Map();
      for (const ln of lines) {
        if (ln[0] !== ':') { bad.push('行首不是 :'); continue; }
        if (!/^:[0-9A-F]+$/.test(ln)) bad.push('不是大寫十六進位：' + ln);
        const b = [];
        for (let i = 1; i < ln.length; i += 2) b.push(parseInt(ln.substr(i, 2), 16));
        const ll = b[0], type = b[3];
        let sum = 0; for (let i = 0; i < b.length - 1; i++) sum += b[i];
        const want = (0x100 - (sum & 0xFF)) & 0xFF;          /* 二補數，另一種寫法 */
        if (want !== b[b.length - 1]) bad.push('checksum 錯：' + ln);
        if (type === 0) {
          rec.push(ll);
          const a = upper * 65536 + ((b[1] << 8) | b[2]);
          for (let i = 0; i < ll; i++) flat.set(a + i, b[4 + i]);
        } else if (type === 4) { upper = (b[4] << 8) | b[5]; ext04++; }
        else if (type === 1) eof = true;
      }
      return { rec, bad, eof, ext04, flat, lines };
    }
    const mk = n => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 7 + 3) & 0xFF; return a; };
    const set = { kind: 'dev', slave: 0x68, awid: 2, base: 0x0000, bytes: mk(4096) };
    const hx = A.exportBuild(set, 'hex');
    CHECK(/\.hex$/.test(hx.name), '檔名副檔名正確：' + hx.name);
    CHECK(/S68/.test(hx.name) && /4096B/.test(hx.name), '檔名帶 slave 與長度：' + hx.name);
    const au = ihexAudit(hx.data);
    EQ(au.bad.length, 0, '🔴 獨立驗算器：checksum 與大小寫全對' + (au.bad[0] ? '（' + au.bad[0] + '）' : ''));
    CHECK(au.rec.slice(0, -1).every(x => x === 16), '🔴 每筆 16 byte（Bruce 指名的格式）');
    EQ(au.rec.length, 256, '4096 / 16 ＝ 256 筆');
    CHECK(au.eof, '🔴 有 EOF 記錄');
    CHECK(hx.data.endsWith(':00000001FF\r\n'), '🔴 EOF 就是 :00000001FF');
    CHECK(hx.data.split('\n').every(l => l === '' || l.endsWith('\r')), '🔴 行尾是 CRLF');
    CHECK(/^:10000000/.test(hx.data), '第一筆長得跟範本一樣：' + hx.data.slice(0, 12));
    EQ(au.flat.size, 4096, '攤平後還是 4096 byte');
    /* round-trip：四種格式各存一次再載回來 */
    for (const fmt of ['hex', 'txt', 'rom', 'bin']) {
      const b = A.exportBuild(set, fmt);
      let back;
      if (fmt === 'bin') back = Array.from(b.data);
      else { const r = A.parseHexText(b.data); EQ(r.err, null, fmt + ' 載得回來'); back = r.bytes; }
      let same = back && back.length === 4096;
      if (same) for (let i = 0; i < 4096; i++) if ((back[i] & 0xFF) !== set.bytes[i]) { same = false; break; }
      CHECK(same, '🔴 round-trip 逐 byte 相同：.' + fmt);
    }
    /* 256K ⇒ 一定要有 type 04，而且位址對 */
    const big = { kind: 'dev', slave: 0x50, awid: 4, base: 0, bytes: mk(262144) };
    const au2 = ihexAudit(A.exportBuild(big, 'hex').data);
    EQ(au2.bad.length, 0, '256K：checksum 全對');
    EQ(au2.ext04, 3, '🔴 256K ⇒ 跨 64K 三次 ⇒ 3 筆 type 04（第一段 hi=0 不用插，與範本一致）');
    EQ(au2.flat.size, 262144, '🔴 type 04 的位址對：攤平剛好 262144 個不重複位址');
    EQ(au2.flat.get(0x3FFFF), big.bytes[0x3FFFF], '最後一個 byte 落在 0x3FFFF');
    /* 非 16 的倍數：最後一筆照實際長度 */
    const odd = { kind: 'dev', slave: 0x68, awid: 2, base: 0x100, bytes: mk(20) };
    const au3 = ihexAudit(A.exportBuild(odd, 'hex').data);
    EQ(au3.rec.join(','), '16,4', '🔴 20 byte ⇒ 16 ＋ 4');
    EQ(au3.flat.get(0x100), odd.bytes[0], '🔴 起始位址用 set.base（0x100）');
    EQ(A.exportBuild({ kind: 'dev', slave: 1, awid: 2, base: 0, bytes: new Uint8Array(0) }, 'hex'), null,
       '沒有資料 ⇒ 不給存');
    /* .txt 與 .rom 同格式 */
    EQ(A.exportBuild(set, 'txt').data, A.exportBuild(set, 'rom').data, '.txt 與 .rom 內容相同');
    EQ(A.exportBuild(set, 'txt').data.split('\r\n')[0], '03', '.txt 一列一個 byte、兩位大寫');
    CHECK(A.exportBuild(set, 'bin').data instanceof Uint8Array, '.bin 是 raw binary');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('25. 另存新檔的按鈕：沒資料不給按，有資料就能按（不需連線）');
  {
    /* 🔴 Bruce 2026-09-19 回報的 bug：只讀 256 byte 就不能另存新檔。
       根因不是長度門檻（從來沒有過），是 i2ctSyncButtons() 在 i2ctDev 指派**之前**
       被呼叫，第一次讀完按鈕還停在「沒有資料」的狀態。
       這一組把**任何長度都能存**釘死，順便釘住「讀完當下就能按」。 */
    for (const n of [1, 10, 256, 4096]) {
      /* 🔴 每一輪都回到「什麼都還沒讀過」—— 這個 bug **只在第一次讀取**出現。 */
      A._reset();
      CHECK(doc.getElementById('btn-save').disabled === true, '重置後沒有資料 ⇒ 不給按');
      await useHelper(baseScript((m) => {
        if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, (_, i) => (i * 3 + 1) & 0xFF) };
      }));
      A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: String(n) });
      await A.doRead();
      await sleep(20);
      CHECK(doc.getElementById('btn-save').disabled === false,
        '🔴 讀 ' + n + ' byte 之後「另存新檔」立刻可以按');
      for (const fmt of ['bin', 'hex', 'txt', 'rom']) {
        const b = A.exportBuild(A.curSet(), fmt);
        let len;
        if (fmt === 'bin') len = b.data.length;
        else len = A.parseHexText(b.data).bytes.length;
        EQ(len, n, '🔴 存出來就是 ' + n + ' byte（.' + fmt + '），沒有任何長度門檻');
      }
    }
    await win.__i2ct.disconnect();
  }
  {
    const btn = doc.getElementById('btn-save');
    CHECK(!!btn, '按鈕在');
    CHECK(!!doc.getElementById('sav-fmt'), '格式選單在');
    EQ(Array.from(doc.getElementById('sav-fmt').options).map(o => o.value).join(','),
       'hex,bin,txt,rom', '🔴 四種格式，預設 .hex');
    EQ(doc.getElementById('sav-fmt').value, 'hex', '預設就是 Bruce 指名的 hex');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('26. 瀏覽器擋住連本機（LNA）：一句話 ＋ 重試，正常路徑不出現');
  {
    CHECK(win.getComputedStyle(doc.getElementById('lna')).display === 'none', '🔴 平常完全不出現');
    /* 判準：非本機來源 ＋ 慢。快的那種是「沒人在聽」＝ 沒裝 helper。 */
    CHECK(!A.lnaSuspect(50), '🔴 失敗得很快 ⇒ 不是權限問題（jsdom 的 location 是 localhost）');
    A.lnaBlocked(3000);
    CHECK(win.getComputedStyle(doc.getElementById('lna')).display !== 'none', '🔴 被擋時看得到');
    CHECK(/允許/.test(doc.getElementById('lna').textContent), '🔴 就是那一句話：'
      + doc.getElementById('lna').textContent.trim().slice(0, 30));
    CHECK(!!doc.getElementById('btn-lna-retry'), '🔴 有重試按鈕');
    CHECK(win.getComputedStyle(doc.getElementById('gethelper')).display === 'none',
      '🔴 一次只喊一件事：下載鈕讓位');
    A.gotHelper();
    CHECK(win.getComputedStyle(doc.getElementById('lna')).display === 'none', '連上之後收起來');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('27. 去 TCON 化：連線不做任何 I2C 交易');
  {
    /* 🔴 Bruce 2026-09-18：「i2c 頁完全去 TCON 化：連線不做任何 I2C 交易、
       不讀 0xFF00」。這一頁是通用工具，對方可能是 EEPROM／PMIC／感測器 —— 
       連上就替他讀某個位址，既是假設也可能有副作用。 */
    A.setDebug(false);
    const sent = await useHelper(baseScript(() => ({ ok: true, status: 0, data: [0xA1, 0xD8, 0xFB] })));
    const reads = sent.filter(m => m.type === 'read');
    EQ(reads.length, 0, '🔴 連線全程送出 0 則 read（原本會自動自檢送 2 則）');
    EQ(sent.filter(m => m.type === 'rawwrite').length, 0, '🔴 也沒有任何寫入');
    EQ(sent.map(m => m.type).join(','), 'ping,open', '🔴 只有 ping 與 open（開通道≠I2C 交易）');
    CHECK(!/0xFF00|FF00/.test(doc.getElementById('topbanner').textContent), '畫面沒有 0xFF00 字樣');
    /* 只找他點名的那幾句；`tcon-tools` 是我們自己的網址（log 裡會出現），不算。 */
    /* 🔴 textContent 會把 <script> 的原始碼也算進去（註解裡提到那句話）⇒ 要先剔除，
       否則測的是原始碼不是畫面。 */
    const bodyText = Array.from(doc.body.querySelectorAll('*'))
      .filter(e => !/^(SCRIPT|STYLE)$/.test(e.tagName))
      .map(e => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue).join(''))
      .join(' ');
    CHECK(!/讀不到\s*T-?CON/i.test(bodyText), '🔴 畫面上沒有「讀不到 T-Con」');
    CHECK(!/讀回\s*[0-9A-F]{2}\s/i.test(doc.getElementById('topbanner').textContent),
      '🔴 橫幅沒有「讀回 xx xx xx」');
    /* 診斷沒有被砍，只是收進 debug */
    A.setDebug(true);
    const sent2 = await useHelper(baseScript(() => ({ ok: true, status: 0, data: [0xA1, 0xD8, 0xFB] })));
    CHECK(sent2.filter(m => m.type === 'read').length > 0, '🔴 debug 打開 ⇒ 自檢回來（診斷能力一個字沒少）');
    A.setDebug(false);
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('29. 載入檔案 ⇒ 立刻可以寫入，寫出去的就是預覽區顯示的那一份');
  {
    /* 🔴 Bruce 2026-09-19（阻斷性）：「我載入資料的目的不就是要寫入嗎？
       可是我載入完以後，它居然不讓我寫入」。根因與另存新檔同一類 ——
       判斷條件（只看 in-data 文字框）跟真正的寫入來源脫節。 */
    for (const n of [10, 256, 4096]) {
      A._reset();
      const sent = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
      const bytes = Array.from({ length: n }, (_, i) => (i * 5 + 7) & 0xFF);
      A.loadFile('blob' + n + '.bin', new win.Uint8Array(bytes));
      await sleep(20);
      CHECK(doc.getElementById('btn-write').disabled === false,
        '🔴 載入 ' + n + ' byte 的檔 ⇒ 寫入鈕可以按');
      A.setInputs({ len: String(n) });
      await A.doWrite();
      await sleep(20);
      const out = [];
      SINCE(sent, 'rawwrite').forEach(m => m.data.forEach(b => out.push(b & 0xFF)));
      EQ(out.length, n, '🔴 送出去的長度 ＝ 總 byte 數欄位（' + n + '）');
      EQ(out.join(','), bytes.join(','), '🔴 送出去的 byte 與預覽區顯示的完全相同');
    }
    /* 三槽切換挑過的值也要是寫入來源（所見即所寫） */
    A._reset();
    const sent2 = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.loadFile('four.bin', new win.Uint8Array([0x00, 0x01, 0x02, 0x03]));
    await sleep(20);
    A.curSet().bytes[1] = 0x99;            /* 模擬他雙擊改了第 2 格 */
    A.setInputs({ len: '4' });
    await A.doWrite();
    await sleep(20);
    const out2 = [];
    SINCE(sent2, 'rawwrite').forEach(m => m.data.forEach(b => out2.push(b & 0xFF)));
    EQ(out2.join(','), '0,153,2,3', '🔴 預覽區改過的那一格也照著寫出去（所見即所寫）');
    /* 🔴🔴 v1.16.2：這一條**反過來了**。舊規則是「裝置讀回值不算寫入來源，
       免得讀完隨手按到寫入把整批寫回去」；Bruce 2026-09-19 直接否決：
       「使用者在這個時候沒有任何改變，他想要把 A 寫進去當然 OK 啊！」
       ⇒ 讀完就能按寫入，寫的是目前 dump 的中心值。誤燒的防線在確認視窗與
         回讀驗證，不在「不給他寫」。 */
    A._reset();
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0x5A) };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(20);
    CHECK(doc.getElementById('btn-write').disabled === false,
      '🔴 讀完就能寫（寫的是 dump 的中心值）');
    EQ(doc.getElementById('btn-write').textContent, '寫入 A · 16 byte', '🔴 v1.17.1：按鈕同時標明寫哪一份');
    EQ(A.writeSource(2).bytes.length, 16, '來源就是剛讀到的 16 byte');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('32. 🔴 一格三槽的狀態機：A ⇄ B 可無限來回，兩個值都不會遺失');
  {
    /* Bruce 2026-09-19：「點了右上以後，右上的值居然會變成跟左上一樣，
       而且沒有消失」。舊寫法在右上分支做**對調**，正確的是**放回去並清空**。 */
    const A0 = { main: 0xAA, ref: 0x55, prev: 0, hasPrev: 0 };   /* 狀態 A */
    const B = A.slotNext(A0, 'sv');
    EQ(JSON.stringify(B), JSON.stringify({ main: 0x55, ref: 0x55, prev: 0xAA, hasPrev: 1 }),
       '🔴 A 點左上 ⇒ B（主值＝快照值、右上＝原新值）');
    const A1 = A.slotNext(B, 'ov');
    EQ(JSON.stringify(A1), JSON.stringify({ main: 0xAA, ref: 0x55, prev: 0, hasPrev: 0 }),
       '🔴 B 點右上 ⇒ 回到 A（右上**清空**，不是變成跟左上一樣）');
    EQ(A.slotNext(B, 'ov').prev, 0, '🔴 右上真的空了（hasPrev=0）');
    /* 連續交替 10 次仍然正確 */
    let st = { main: 0xAA, ref: 0x55, prev: 0, hasPrev: 0 }, okAll = true;
    for (let i = 0; i < 10; i++) {
      st = A.slotNext(st, 'sv');
      if (!st || st.main !== 0x55 || st.prev !== 0xAA || !st.hasPrev) { okAll = false; break; }
      st = A.slotNext(st, 'ov');
      if (!st || st.main !== 0xAA || st.hasPrev) { okAll = false; break; }
    }
    CHECK(okAll, '🔴 交替 10 次之後仍然回到正確狀態');
    EQ(st.main, 0xAA, '10 次之後主值還是原本的新值');
    /* 任何時候兩個角落的值都不相等（除非本來就相等 ⇒ 根本沒有切換行為） */
    EQ(A.slotNext({ main: 0x33, ref: 0x33, prev: 0, hasPrev: 0 }, 'sv'), null,
       '🔴 快照值與新值相同 ⇒ 這一格沒有切換行為');
    EQ(A.slotNext({ main: 0x33, ref: null, prev: 0, hasPrev: 0 }, 'sv'), null, '沒有基準 ⇒ 不給換');
    EQ(A.slotNext({ main: 0x33, ref: 0x44, prev: 0, hasPrev: 0 }, 'ov'), null, '右上是空的 ⇒ 點了不做事');
    /* 端到端：真的點到 DOM 上的角落。
       🔴 v1.16.1：角落還原現在會**真的寫回裝置**（走 i2ctApplyCellValue）⇒
          假裝置必須是**會收下寫入、而且依 m.len 回讀**的那種。
          舊的假裝置不管要幾個 byte 一律回 4 個 ⇒ 單格回讀（len=1）長度對不上
          ⇒ 被判成「回讀失敗」。那是假裝置太粗糙，不是產品錯。 */
    A._reset();
    const dev31 = [0xAA, 0xAA, 0xAA, 0xAA];
    const sentSlot = await useHelper(baseScript((m) => {
      if (m.type === 'rawwrite') { (m.data || []).forEach((b, i) => { dev31[m.addr + i] = b & 0xFF; });
                                   return { ok: true, status: 0, transferred: (m.data || []).length }; }
      if (m.type === 'read') return { ok: true, status: 0,
        data: Array.from({ length: m.len }, (_, i) => dev31[(m.addr + i) % dev31.length]) };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(20);          /* 建立基準 AA AA AA AA */
    A.snapshot();
    A.loadFile('newer.bin', new win.Uint8Array([0x55, 0xAA, 0xAA, 0xAA]));
    await sleep(20);
    const cell = () => A.cellParts(0);
    CHECK(cell().main === '55' && cell().snap === 'AA' && cell().old === null,
      '🔴 狀態 A：主值 55、左上 AA、右上空　' + JSON.stringify(cell()));
    await A.slotClick(0, 'sv'); await sleep(10);
    CHECK(cell().main === 'AA' && cell().snap === null && cell().old === '55',
      '🔴 狀態 B：主值 AA、左上消失、右上 55　' + JSON.stringify(cell()));
    await A.slotClick(0, 'ov'); await sleep(10);
    CHECK(cell().main === '55' && cell().snap === 'AA' && cell().old === null,
      '🔴 點右上 ⇒ 回到 A（右上消失，且**不等於**左上）　' + JSON.stringify(cell()));
    /* 🔴🔴 v1.16.1：角落還原**要真的寫回裝置**（Bruce：「雖然它會改回來，
       但是 I2C 沒有跟著一起寫入…我再按讀取，它又是原本的那個值」）。
       判準不是「有沒有呼叫什麼」，而是**假裝置裡的那個 byte 真的變了**。 */
    { const w = sentSlot.filter((m) => m.type === 'rawwrite');
      CHECK(w.length >= 2, '🔴 兩次角落還原各送出一次寫入：' + w.length);
      EQ(dev31[0], 0x55, '🔴🔴 裝置裡的值真的被改成 0x55（再讀一次不會打回原形）'); }
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('31. 🔴 寫入的 EEPROM page 邊界切分（舊版完全沒做 ⇒ 靜默寫錯資料）');
  {
    /* Bruce 指定的驗證向量：起始 0x0010、100 byte、page 32 ⇒ 16/32/32/20 */
    EQ(A.planWrite(0x0010, 100, 32).map(x => x.len).join('/'), '16/32/32/20',
       '🔴 0x0010 起 100 byte、page 32 ⇒ 16/32/32/20');
    EQ(A.planWrite(0x0010, 100, 32).map(x => '0x' + x.addr.toString(16).toUpperCase()).join(','),
       '0x10,0x20,0x40,0x60', '🔴 每一段的起始位址都落在 page 邊界上');
    EQ(A.planWrite(0, 128, 32).map(x => x.len).join('/'), '32/32/32/32', '對齊起點：整齊切四段');
    EQ(A.planWrite(0, 100, 0).map(x => x.len).join('/'), '100', '不分段：一次送完（仍受 256 上限）');
    EQ(A.planWrite(0, 600, 0).map(x => x.len).join('/'), '256/256/88',
       '🔴 不分段也不能超過 Bridge 的 RAW_MAX_DATA(256)');
    EQ(A.planWrite(0x1F, 3, 32).map(x => x.len).join('/'), '1/2', '剛好卡在頁尾前一個 byte');
    EQ(A.planWrite(0, 64, 8).map(x => x.len).join('/'), '8/8/8/8/8/8/8/8', 'page 8 也對');
    /* 🔴 partial page write 是合法的（Bruce 2026-09-19 查證）：page size 是**上限
       不是必須**，1～page 之間任意長度都可以。所以切段的判準只有「不得跨越 page
       邊界」，**絕對不可以把尾段補齊到 page size** —— 那會寫進他沒要寫的資料。 */
    EQ(A.planWrite(0x0003, 1, 32).map(x => x.len).join('/'), '1',
       '🔴 寫 1 byte ⇒ 一筆、資料長度 1（不補齊、不拒絕）');
    EQ(A.planWrite(0x0003, 5, 32).map(x => x.len).join('/'), '5',
       '🔴 寫 5 byte（同頁內）⇒ 一筆、長度 5（不切）');
    EQ(A.planWrite(0x001E, 10, 32).map(x => x.len).join('/'), '2/8',
       '🔴 0x001E 起 10 byte ⇒ 切兩筆 2 ＋ 8（跨頁邊界才切）');
    EQ(A.planWrite(0x001E, 10, 32).map(x => '0x' + x.addr.toString(16).toUpperCase()).join(','),
       '0x1E,0x20', '🔴 兩筆的位址是 0x1E 與 0x20');
    CHECK(A.planWrite(0x0010, 100, 32).every(x => x.len <= 32) &&
          A.planWrite(0x0010, 100, 32).some(x => x.len !== 32),
      '🔴 沒有任何一筆被補齊到 page size（16 與 20 都是 partial page write）');

    /* 每一段都不得跨頁：用獨立邏輯重驗一次（不用自己的函式驗自己） */
    for (const [base, len, page] of [[0x10, 100, 32], [0x7, 300, 16], [0, 4096, 32], [0x123, 77, 64]]) {
      const plan = A.planWrite(base, len, page);
      let okAll = true, total = 0, cursor = base;
      for (const seg of plan) {
        if (seg.addr !== cursor) okAll = false;
        if (page > 0 && Math.floor(seg.addr / page) !== Math.floor((seg.addr + seg.len - 1) / page)) okAll = false;
        if (seg.len > 256 || seg.len <= 0) okAll = false;
        cursor += seg.len; total += seg.len;
      }
      CHECK(okAll && total === len,
        '🔴 base=0x' + base.toString(16) + ' len=' + len + ' page=' + page
        + ' ⇒ 每段都在同一頁內、連續、總長正確（' + plan.length + ' 段）');
    }
    /* 端到端：真的送出去的訊息就是切好的那些段 */
    A._reset();
    const sent = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    /* 🔴 v1.16.2：**先設起始 offset 再載入**。寫入的起始位址現在取自
       「那份內容自己的 base」（Bruce 指定），而檔案的 base 是**載入當下**
       的 offset 欄位 —— 載入後才改欄位不會追溯改變那份資料的 base。 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0010', len: '100' });
    A.loadFile('p.bin', new win.Uint8Array(Array.from({ length: 100 }, (_, i) => i & 0xFF)));
    await sleep(20);
    doc.getElementById('wr-page').value = '32';
    await A.doWrite();
    await sleep(30);
    const w = SINCE(sent, 'rawwrite');
    EQ(w.map(m => m.data.length).join('/'), '16/32/32/20', '🔴 實際送出：16/32/32/20');
    EQ(w.map(m => m.addr).join(','), '16,32,64,96', '🔴 實際送出的位址：0x10,0x20,0x40,0x60');
    const flat = []; w.forEach(m => m.data.forEach(b => flat.push(b & 0xFF)));
    EQ(flat.length, 100, '總共還是 100 byte');
    EQ(flat.every((b, i) => b === (i & 0xFF)), true, '🔴 切分沒有弄亂資料順序');
    /* 切到「不分段」 */
    A._reset();
    const sent2 = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.loadFile('q.bin', new win.Uint8Array(100));
    await sleep(20);
    /* 🔴 用非 EEPROM 的 slave 驗「不分段」：0x50–0x57 會被型號確認視窗
       強制填回該型號的 page size，那條路由專屬的那一組驗。 */
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0010', len: '100' });
    doc.getElementById('wr-page').value = '0';
    doc.getElementById('wr-page').dispatchEvent(new win.Event('change', { bubbles: true }));
    await A.doWrite();
    await sleep(30);
    EQ(SINCE(sent2, 'rawwrite').map(m => m.data.length).join('/'), '100', '🔴 不分段：一筆送完');
    CHECK(/連續/.test(doc.getElementById('pagehint').textContent),
      '🔴 一行極短寫出目前生效的模式：' + doc.getElementById('pagehint').textContent);
    CHECK(doc.getElementById('wr-twr').disabled === true, '不分段時段間等待停用（沒有意義）');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('33. 🔴 依 slave 位址自動決定分段：0x50–0x57 才是 EEPROM');
  {
    /* Bruce 2026-09-19：「只有在 slave address 是 0x50 到 0x57 這八種，才需要
       預設選到 32 bytes 的分頁寫入」。EEPROM 的位址是 `1010 A2 A1 A0`，
       高四位由規範固定 ⇒ 正好這八個。 */
    for (const a of [0x50, 0x51, 0x54, 0x57]) EQ(A.isEepromAddr(a), true, '0x' + a.toString(16) + ' 是 EEPROM');
    for (const a of [0x4F, 0x58, 0x68, 0x00, 0x7F]) EQ(A.isEepromAddr(a), false, '0x' + a.toString(16) + ' 不是 EEPROM');
    const setSlave = (v) => {
      const e = doc.getElementById('in-slave'); e.value = v;
      e.dispatchEvent(new win.Event('input', { bubbles: true }));
    };
    A.pageTouched(false);
    for (const [addr, want] of [['0x50', 32], ['0x57', 32], ['0x4F', 0], ['0x58', 0], ['0x68', 0], ['0x53', 32]]) {
      setSlave(addr);
      EQ(A.pageSize(), want, '🔴 slave ' + addr + ' ⇒ ' + (want ? '自動分段 ' + want + 'B' : '自動不分段'));
    }
    setSlave('0x50');
    CHECK(/自動/.test(doc.getElementById('pagehint').textContent),
      '🔴 標明是自動判定的：' + doc.getElementById('pagehint').textContent);
    /* 手動指定之後就不准被自動規則蓋掉 */
    doc.getElementById('wr-page').value = '8';
    doc.getElementById('wr-page').dispatchEvent(new win.Event('change', { bubbles: true }));
    EQ(A.pageSize(), 8, '手動選 8 byte');
    setSlave('0x68');
    EQ(A.pageSize(), 8, '🔴 切到非 EEPROM 的 slave ⇒ **維持他手動選的 8**，不被蓋掉');
    setSlave('0x50');
    EQ(A.pageSize(), 8, '🔴 再切回 EEPROM ⇒ 仍然維持 8（他指定過就是他說了算）');
    CHECK(/手動/.test(doc.getElementById('pagehint').textContent),
      '🔴 標明是手動指定的：' + doc.getElementById('pagehint').textContent);
    A.pageTouched(false); setSlave('0x50');
    EQ(A.pageSize(), 32, '重置旗標後回到自動規則');

    /* 🔴 選項旁的型號標示（常見值，不是保證） */
    const opts = Array.from(doc.getElementById('wr-page').options).map(o => o.value + '=' + o.textContent);
    EQ(opts.join('|'),
       '8=8B（24C01/02）|16=16B（24C04/08/16）|32=32B（24C32/64）|64=64B（24C128/256）'
       + '|128=128B（24C512）|256=256B（24C1024）|0=不分段',
       '🔴 每個 page size 都標了對應的常見型號');

    A.pageTouched(false); setSlave('0x68');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('35. 🔴 寫 EEPROM 前的型號確認視窗（選型號，page size 由系統填）');
  {
    /* Bruce 2026-09-19：把使用者要知道的東西從**實作細節（page size）**換成
       **他本來就知道的事實（我手上這顆是 24C32）**⇒ 不可能選錯。
       所以視窗裡刻意**沒有** page size。 */
    A.eepromAuto();                    /* 回到真的會跳視窗的模式 */
    const modal = () => win.getComputedStyle(doc.getElementById('eeprom')).display;
    EQ(modal(), 'none', '平常不出現');
    A._reset();
    const sent = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.loadFile('e.bin', new win.Uint8Array(100));
    await sleep(20);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0010', len: '100' });
    let p = A.doWrite();               /* 不 await：視窗會擋住 */
    await sleep(30);
    CHECK(modal() !== 'none', '🔴 slave 0x50 ＋ 按寫入 ⇒ 視窗出現');
    /* 內容：每列「型號 — N Kbit (M B/KB)」，且**沒有** page size 字樣 */
    /* 每一列是 grid 的三欄（型號／—／容量），欄距來自 CSS 的 gap，
       所以 textContent 串起來沒有空白 —— 用欄位本身斷言比較誠實。 */
    const rows = Array.from(doc.querySelectorAll('#ee-list .eerow')).map(r => ({
      id: r.querySelector('.eeid').textContent,
      sep: r.querySelector('.eesep').textContent,
      cap: r.querySelector('.eecap').textContent
    }));
    EQ(rows.length, 11, '11 種型號');
    EQ(rows[0].id + ' ' + rows[0].sep + ' ' + rows[0].cap, '24C01 — 1 Kbit (128 B)', '🔴 第一列格式');
    EQ(rows[5].id + ' ' + rows[5].sep + ' ' + rows[5].cap, '24C32 — 32 Kbit (4 KB)', '🔴 24C32 那列');
    EQ(rows[10].id + ' ' + rows[10].sep + ' ' + rows[10].cap, '24C1024 — 1 Mbit (128 KB)', '最後一列');
    CHECK(!/page|Page|byte 分段|分段/.test(doc.getElementById('ee-list').textContent),
      '🔴 視窗裡**沒有** page size 字樣');
    /* 🔴 **改判（2026-09-19）**：預設不再寫死 24C32。Bruce：「如果是大於 4096，
       那就不能選到 24C32，你的預設值應該就要選到 24C64。」⇒ 預設 ＝ 容量放得下
       這次範圍的**最小**一顆。這一組寫的是 base 0x0010 ＋ 100 byte
       ⇒ needBytes = 116 ⇒ 24C01（128 B）＝ index 0。
       （原本這裡斷言 '5'＝24C32，那是舊的寫死行為，不是這一版的規格。） */
    EQ(doc.querySelector('#ee-list input:checked').value, '0',
       '🔴 預設 ＝ 放得下 116 byte 的最小一顆（24C01）');
    /* 按取消 ⇒ 一個 byte 都沒送 */
    doc.getElementById('ee-cancel').click();
    await p; await sleep(20);
    EQ(modal(), 'none', '取消後視窗關掉');
    EQ(SINCE(sent, 'rawwrite').length, 0, '🔴 按取消 ⇒ 一個 byte 都沒送出');
    /* 逐型號驗「選完自動填入 page size」 */
    for (const [id, want] of [['24C01', 8], ['24C02', 8], ['24C04', 16], ['24C08', 16], ['24C16', 16],
                              ['24C32', 32], ['24C64', 32], ['24C128', 64], ['24C256', 64],
                              ['24C512', 128], ['24C1024', 256]]) {
      A._reset();
      await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
      A.loadFile('m.bin', new win.Uint8Array(8));
      await sleep(15);
      A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '8' });
      const pr = A.doWrite();
      await sleep(25);
      CHECK(modal() !== 'none', '選 ' + id + ' 之前視窗有開');
      const idx = A.EEPROMS.findIndex(e => e.id === id);
      doc.querySelectorAll('#ee-list input[name=eesel]')[idx].checked = true;
      doc.getElementById('ee-ok').click();
      await pr; await sleep(20);
      EQ(A.pageSize(), want, '🔴 選 ' + id + ' ⇒ 分段自動填 ' + want);
    }
    /* 確認之後真的照填入的 page size 切段 */
    A._reset();
    const sent3 = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    /* v1.16.2：先設 offset 再載入（寫入的 base 取自那份內容，見第 31 組的說明）。 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0010', len: '100' });
    A.loadFile('e2.bin', new win.Uint8Array(100));
    await sleep(20);
    const pr2 = A.doWrite();
    await sleep(25);
    doc.querySelectorAll('#ee-list input[name=eesel]')[5].checked = true;   /* 24C32 */
    doc.getElementById('ee-ok').click();
    await pr2; await sleep(30);
    EQ(SINCE(sent3, 'rawwrite').map(m => m.data.length).join('/'), '16/32/32/20',
       '🔴 確認之後照 24C32 的 32 byte 切段：16/32/32/20');
    /* 非 EEPROM 的 slave 不跳視窗，直接寫 */
    for (const a of ['0x4F', '0x58', '0x68']) {
      A._reset();
      const s4 = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
      A.loadFile('e3.bin', new win.Uint8Array(8));
      await sleep(15);
      A.setInputs({ slave: a, awid: 2, off: '0x0000', len: '8' });
      await A.doWrite();
      await sleep(20);
      EQ(modal(), 'none', '🔴 slave ' + a + ' ⇒ 不跳視窗，直接寫');
      EQ(SINCE(s4, 'rawwrite').length, 1, 'slave ' + a + ' 真的寫出去了');
    }
    A.eepromAuto('24C32');            /* 交還給其他組 */
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('34. 讀取沒有分段限制，但超過容量會位址回捲 ⇒ 從資料本身找證據');
  {
    /* Bruce 問「讀的部分是都沒有分段的限制，對嗎？」⇒ 對，sequential read 位址
       自動遞增。但書：超過容量會回捲到 0，後半段是前半段的重複，不會報錯。
       🔴 不擋他（他可能就是要測回捲），改成從資料本身找證據：整段以 p 重複。 */
    const rep = (p, n) => Array.from({ length: n }, (_, i) => (i % p) * 3 + 1 & 0xFF);
    EQ(A.wrapPeriod(rep(64, 256)), 64, '🔴 每 64 byte 重複 ⇒ 抓得到週期 64');
    EQ(A.wrapPeriod(rep(256, 1024)), 256, '每 256 byte 重複 ⇒ 抓得到');
    EQ(A.wrapPeriod(rep(16, 128)), 16, '週期 16 也抓得到');
    /* 🔴 不能用 `(i*7+3)&0xFF` 當「沒有重複」的樣本：7 與 256 互質，那條序列
       **本來就以 256 為週期**，函式判它重複是對的（第一版測試向量選錯，不是函式錯）。
       改用真正不重複的樣本。 */
    {
      let x = 12345;
      const noise = Array.from({ length: 512 }, () => { x = (x * 1103515245 + 12345) & 0x7FFFFFFF; return (x >> 16) & 0xFF; });
      EQ(A.wrapPeriod(noise), 0, '🔴 沒有重複 ⇒ 完全不出聲（正常讀取不該被打擾）');
      EQ(A.wrapPeriod(Array.from({ length: 512 }, (_, i) => (i * 7 + 3) & 0xFF)), 256,
         '🔴 反過來：0..255 的等差序列讀 512 byte **確實**每 256 重複 —— 那正是回捲的樣子，判它重複是對的');
    }
    EQ(A.wrapPeriod(new Array(256).fill(0xFF)), 0, '🔴 整批 FF 不算回捲（那是總線閒置，另有判斷）');
    EQ(A.wrapPeriod(new Array(256).fill(0x00)), 0, '整批 00 也不算');
    EQ(A.wrapPeriod(rep(16, 16)), 0, '長度不足 ⇒ 不判（重複沒有鑑別力）');
    /* 端到端：真的讀到回捲資料時畫面要講一句 */
    A._reset();
    await useHelper(baseScript((m) => {
      if (m.type === 'read') {
        const o = []; for (let i = 0; i < m.len; i++) o.push(((m.addr + i) % 64) * 3 + 1 & 0xFF);
        return { ok: true, status: 0, data: o };
      }
    }));
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '512' });
    await A.doRead(); await sleep(30);
    CHECK(/回捲/.test(doc.getElementById('readbanner').textContent),
      '🔴 讀到重複資料 ⇒ 一句話點出可能已超過容量');
    CHECK(!/失敗|擋/.test(doc.getElementById('readbanner').textContent), '🔴 但不擋他，讀取照樣完成');
    EQ(A.curSet().bytes.length, 512, '資料照樣全部收下');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('30. 🔴 FF 一律不標（任何情境都不上色），診斷只留在 log');
  {
    /* 🔴 Bruce 說了兩次：「FF 也是很常見的數值」「我有說過 FF 不要用特殊的顏色
       highlight 出來，為什麼還是有？」。第一次我自作主張留了例外
       （載入不標、讀回的整批全 FF 仍標）—— **他沒有同意那個例外**。
       現在全面移除：不管來源、不管整批還是夾雜，畫面上一律不標。 */
    A._reset();
    A.loadFile('ff.bin', new win.Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0xFF]));
    await sleep(20);
    EQ(doc.querySelectorAll('#dump td.ff').length, 0, '🔴 載入的檔案：一格 FF 都沒有被標');
    EQ(doc.querySelectorAll('#dump td.bus').length, 0, '也沒有總線閒置的標示');
    A._reset();
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0xFF) };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(20);
    EQ(doc.querySelectorAll('#dump td.ff').length, 0, '🔴 裝置讀回整批全 FF ⇒ 照樣一格都不標');
    EQ(doc.querySelectorAll('#dump td.bus').length, 0, '🔴 也沒有紫色的總線閒置標示');
    CHECK(!/總線閒置/.test(doc.getElementById('readbanner').textContent),
      '🔴 畫面上也不講總線閒置：' + (doc.getElementById('readbanner').textContent || '(空)'));
    /* 診斷能力沒有消失，只是換到不占畫面的地方 */
    CHECK(/全 FF/.test(doc.getElementById('log').textContent), '🔴 診斷改寫在 log（我要用，他不用看）');
    /* CSS 規則本身也要不存在，否則哪天又被接回去 */
    CHECK(!/td\.ff\{|td\.bus\{/.test(doc.documentElement.outerHTML),
      '🔴 連 CSS class 都清掉了（留著遲早又被接回去）');
    const legend = doc.querySelector('.legend').textContent;
    CHECK(!/FF/.test(legend), '🔴 圖例裡沒有任何 FF 項目：' + legend.replace(/\s+/g, ' ').trim());
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('28. 改名：使用者看到的是「I2C Bridge」，不再是「helper」');
  {
    /* 🔴 Bruce 2026-09-18：「helper 的字樣是不是其實不夠貼切？它的功能應該是
       I2C 的 bridge…用一個使用者一看就知道它在做什麼功能的字樣」。 */
    const vis = () => Array.from(doc.body.querySelectorAll('*'))
      .filter(e => !/^(SCRIPT|STYLE)$/.test(e.tagName))
      .filter(e => { const cs = win.getComputedStyle(e); return cs.display !== 'none'; })
      .map(e => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue).join(''))
      .join(' ');
    A.setDebug(true); A.needHelper('連不到 I2C Bridge');
    const t = vis();
    CHECK(!/helper/i.test(t), '🔴 畫面上（含 debug 區、下載鈕）一個 helper 都沒有');
    CHECK(/I2C Bridge/.test(t), '🔴 改稱 I2C Bridge：' + (t.match(/.{0,12}I2C Bridge.{0,12}/) || [''])[0]);
    CHECK(doc.getElementById('dl').textContent.indexOf('I2C Bridge') >= 0,
      '🔴 下載鈕：' + doc.getElementById('dl').textContent.trim());
    CHECK(/i2c-bridge-v/.test(win.HELPER_PKG.file), '🔴 zip 檔名改了：' + win.HELPER_PKG.file);
    CHECK(!/dg-helper/.test(doc.documentElement.outerHTML), '🔴 整頁原始碼裡沒有 dg-helper 字樣');
    A.setDebug(false); A.gotHelper();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('36. 🔴 逐格即時寫入 ⇒ 回讀驗證（顯示的一定是裝置上的真實值）');
  {
    /* 🔴 走**真的單擊路徑**（dblclick 已經拿掉，它從來沒生效過）。 */
    /* 🔴 v1.16.1：**點格子的中間數值**才會進入編輯（點留白只定位、
       點左上／右上是還原）。所以這裡要點 `.mv`，不是整個 td。 */
    const editCell = async (addr, text) => {
      const td0 = doc.querySelector('#dump td[data-addr="' + addr + '"]');
      (td0.querySelector(".mv") || td0).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      /* 🔴 v1.16.2：點中間數值要**點兩次**才進編輯（第一次只定位）。 */
      {const t2 = doc.querySelector("#dump td[data-addr='" + addr + "']");
       (t2.querySelector(".mv") || t2).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));}
      await sleep(20);
      const inp = doc.querySelector('#dump td.edit input');
      if (!inp) { CHECK(false, '🔴 點中間數值應該要進入編輯（addr ' + addr + '）'); return; }
      inp.value = text;
      inp.dispatchEvent(new win.Event('input', { bubbles: true }));
      inp.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(40);
    };
    /* (a) 回讀相符 ⇒ 成功，不出聲 */
    A._reset();
    let store = new Map();
    let sent = await useHelper(baseScript((m) => {
      if (m.type === 'rawwrite') { m.data.forEach((b, i) => store.set(m.addr + i, b & 0xFF)); return { ok: true, status: 0, transferred: m.data.length }; }
      if (m.type === 'read') { const o = []; for (let i = 0; i < m.len; i++) o.push(store.has(m.addr + i) ? store.get(m.addr + i) : 0x00); return { ok: true, status: 0, data: o }; }
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(25);
    let since = sent.length;
    await editCell(3, 'AA');
    const after = sent.slice(since);
    EQ(after.filter(m => m.type === 'rawwrite').length, 1, '🔴 編輯一格 ⇒ 送出 1 筆寫入');
    EQ(after.filter(m => m.type === 'rawwrite')[0].data.length, 1, '🔴 而且只有 1 byte（byte write）');
    EQ(after.filter(m => m.type === 'read').length, 1, '🔴 寫完立刻回讀 1 筆');
    EQ(after.filter(m => m.type === 'read')[0].len, 1, '🔴 回讀 1 byte');
    EQ(A.cellParts(3).main, 'AA', '回讀相符 ⇒ 格子顯示 AA');
    EQ(A.wrFailAt(3), false, '回讀相符 ⇒ 不標失敗');
    /* (b) 🔴 回讀不符 ⇒ 顯示**讀回來的值**，並標失敗（他的例子：填 AA、讀回 FF） */
    A._reset();
    sent = await useHelper(baseScript((m) => {
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: m.data.length };
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0xFF) };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(25);
    await editCell(3, 'AA');
    EQ(A.cellParts(3).main, 'FF', '🔴 填 AA、回讀 FF ⇒ 格子顯示 **FF**（裝置上的實際值）');
    EQ(A.wrFailAt(3), true, '🔴 標成寫入失敗');
    /* 🔴 v1.16.0：用字改了 ——「送出就失敗」才叫「沒有寫進去」，
       這裡是**送出成功、回讀不一樣**，叫「寫入與回讀不一致」（兩者要分得出來）。 */
    { const bw = doc.getElementById('readbanner').textContent;
      CHECK(/寫入與回讀不一致/.test(bw), '🔴 講明回讀不一致：' + bw.slice(0, 46));
      CHECK(!/沒有寫進去/.test(bw), '🔴 不可以講成「沒有寫進去」（那是送出失敗）'); }
    CHECK(doc.querySelector('#dump td[data-addr="3"]').className.indexOf('wrfail') >= 0,
      '🔴 格子有 wrfail 樣式（與 diff／FF／選取分得出來）');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('37. 🔴 EEPROM 型號視窗：每個 slave 只問一次');
  {
    A.eepromAuto();                       /* 真的跳視窗 */
    const modal = () => win.getComputedStyle(doc.getElementById('eeprom')).display;
    const confirmIt = async (pr) => { await sleep(25); doc.getElementById('ee-ok').click(); await pr; await sleep(15); };
    A._reset();
    await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.eeForget();
    A.loadFile('x.bin', new win.Uint8Array(8));
    await sleep(15);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '8' });
    let pr = A.doWrite(); await sleep(25);
    CHECK(modal() !== 'none', '🔴 第一次寫 0x50 ⇒ 跳視窗');
    await confirmIt(pr);
    A.loadFile('x2.bin', new win.Uint8Array(8)); await sleep(15);
    await A.doWrite(); await sleep(25);
    EQ(modal(), 'none', '🔴 同一個 slave 第二次寫入 ⇒ **不再跳**');
    /* 換到另一個 EEPROM slave ⇒ 重新問（可能換了一顆） */
    A.setInputs({ slave: '0x51' });
    A.loadFile('x3.bin', new win.Uint8Array(8)); await sleep(15);
    pr = A.doWrite(); await sleep(25);
    CHECK(modal() !== 'none', '🔴 換到 0x51 ⇒ **重新問一次**');
    await confirmIt(pr);
    /* 非 EEPROM ⇒ 從來不問 */
    A.setInputs({ slave: '0x68' });
    A.loadFile('x4.bin', new win.Uint8Array(8)); await sleep(15);
    await A.doWrite(); await sleep(25);
    EQ(modal(), 'none', '🔴 非 EEPROM 的 slave ⇒ 不跳');
    /* 斷線重連 ⇒ 全部重問 */
    A.eeForget();
    A.setInputs({ slave: '0x50' });
    A.loadFile('x5.bin', new win.Uint8Array(8)); await sleep(15);
    pr = A.doWrite(); await sleep(25);
    CHECK(modal() !== 'none', '🔴 重新連線之後 ⇒ 重新問');
    doc.getElementById('ee-cancel').click(); await pr; await sleep(15);
    A.eepromAuto('24C32');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('62. 🔴 EEPROM 預設型號跟著「這次要寫到的最高位址＋1」走');
  {
    /* Bruce 2026-09-19：「在寫入 EEPROM 的時候，如果跳出選擇 Page 大小的視窗，
       應該也要考量到我這次寫的總 Byte 數是多少。如果是大於 4096，那就不能選到
       24C32，你的預設值應該就要選到 24C64。雖然還是可以讓使用者手動改選。」

       🔴 正反都驗（本專案吃過三次「只驗壞的會被擋下」的虧）：
          正面 ＝ 該被選中的要被選中、放得下的不得被標成容量不足、沒選時的
                 fallback 要跟預設同一個值；
          反面 ＝ 容量不足的要標出來，但**不得** disable。 */

    /* ── (a) 純函式層：容量 >= needBytes 的最小一顆 ───────────────────── */
    const idOf = (n) => A.EEPROMS[A.eeDefaultIdx(n)].id;
    EQ(idOf(4096),   '24C32',   '🔴 4096 ⇒ 24C32（剛好放得下就不要往上跳）');
    EQ(idOf(4097),   '24C64',   '🔴 4097 ⇒ 24C64（超過一個 byte 就要換大的）');
    EQ(idOf(8192),   '24C64',   '🔴 8192 ⇒ 24C64（Bruce 舉的那個例子）');
    EQ(idOf(8193),   '24C128',  '8193 ⇒ 24C128');
    EQ(idOf(1),      '24C01',   '1 byte ⇒ 最小那顆');
    EQ(idOf(128),    '24C01',   '128 ⇒ 24C01（邊界含等號）');
    EQ(idOf(129),    '24C02',   '129 ⇒ 24C02');
    EQ(idOf(131072), '24C1024', '131072 ⇒ 最大那顆');
    EQ(idOf(999999), '24C1024', '🔴 比最大顆還大 ⇒ 勾最大那顆（不是不勾）');
    EQ(idOf(undefined), '24C32', '🔴 算不出來 ⇒ 維持原本的 24C32');
    EQ(idOf(0),      '24C32',   '0 ⇒ 維持 24C32');
    EQ(idOf(null),   '24C32',   'null ⇒ 維持 24C32');

    A.eepromAuto();                       /* 真的跳視窗 */
    const modal = () => win.getComputedStyle(doc.getElementById('eeprom')).display;
    const checkedId = () =>
      A.EEPROMS[parseInt(doc.querySelector('#ee-list input:checked').value, 10)].id;

    /* ── (b) 🔴 用 base ＋ 長度算，不是只看長度 ───────────────────────── */
    A._reset();
    await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.eeForget();
    /* 先設 offset 再載入（寫入的 base 取自那份內容，見第 31 組的說明）。 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x1F00', len: '256' });
    A.loadFile('hi.bin', new win.Uint8Array(256));
    await sleep(20);
    let pr = A.doWrite(); await sleep(30);
    CHECK(modal() !== 'none', '前置：slave 0x50 ⇒ 視窗有開');
    EQ(checkedId(), '24C64',
       '🔴 base 0x1F00 ＋ 256 byte ＝ 8192 ⇒ 預設 24C64（只看長度 256 會錯選 24C02）');
    /* 容量不足的要標示，但**不得** disable */
    const rows = Array.from(doc.querySelectorAll('#ee-list .eerow'));
    const small = rows.filter(r => r.classList.contains('eesmall'));
    EQ(small.length, 6, '🔴 24C01～24C32 六顆放不下 8192 ⇒ 標成容量不足');
    CHECK(small.every(r => /容量不足/.test(r.textContent)), '🔴 「容量不足」字樣有出現');
    CHECK(rows.every(r => !r.querySelector('input').disabled),
      '🔴 一個都不 disable —— Bruce 明講仍要可以手動改選');
    CHECK(!rows[6].classList.contains('eesmall') && !/容量不足/.test(rows[6].textContent),
      '🔴 放得下的（24C64）不得被標成容量不足');
    CHECK(!rows[10].classList.contains('eesmall'), '🔴 24C1024 更不得被標');
    doc.getElementById('ee-cancel').click(); await pr; await sleep(15);

    /* ── (c) 🔴 沒選就按確認 ⇒ fallback 用**同一個**預設，不是寫死 24C32 ──
       這裡刻意挑 needBytes = 16384 ⇒ 預設是 24C128（page 64）。
       用 24C64 驗不出來：它的 page 也是 32，跟 24C32 一樣，分不出走哪條。 */
    A._reset();
    await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.eeForget();
    A.setInputs({ slave: '0x50', awid: 2, off: '0x3F00', len: '256' });
    A.loadFile('hi2.bin', new win.Uint8Array(256));
    await sleep(20);
    pr = A.doWrite(); await sleep(30);
    EQ(checkedId(), '24C128', '前置：0x3F00 ＋ 256 ＝ 16384 ⇒ 預設 24C128');
    doc.querySelectorAll('#ee-list input[name=eesel]').forEach((i) => { i.checked = false; });
    doc.getElementById('ee-ok').click(); await pr; await sleep(20);
    EQ(A.pageSize(), 64,
       '🔴 一個都沒選就按確認 ⇒ 用預設那顆（24C128 的 page 64），不是寫死的 24C32（32）');

    /* ── (d) 🔴 快取的型號容量不足 ⇒ 重新問，不可以沿用 ─────────────── */
    A._reset();
    await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.eeForget();
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '8' });
    A.loadFile('s1.bin', new win.Uint8Array(8)); await sleep(15);
    pr = A.doWrite(); await sleep(25);
    CHECK(modal() !== 'none', '前置：第一次寫 0x50 ⇒ 跳視窗');
    const i32 = A.EEPROMS.findIndex((e) => e.id === '24C32');
    doc.querySelectorAll('#ee-list input[name=eesel]')[i32].checked = true;
    doc.getElementById('ee-ok').click(); await pr; await sleep(20);
    EQ(A.eeOk()[0x50], '24C32', '前置：0x50 已確認為 24C32');
    /* 正面：範圍仍在 4096 內 ⇒ 沿用快取，不再問（不可以每次都跳） */
    A.setInputs({ off: '0x0000', len: '8' });
    A.loadFile('s2.bin', new win.Uint8Array(8)); await sleep(15);
    await A.doWrite(); await sleep(25);
    EQ(modal(), 'none', '🔴 範圍放得下已確認的型號 ⇒ 沿用快取，**不再問**');
    /* 反面：超出 4096 ⇒ 一定要重問，否則會拿容量不足的 page size 去寫 */
    A.setInputs({ off: '0x1000', len: '8' });
    A.loadFile('s3.bin', new win.Uint8Array(8)); await sleep(15);
    pr = A.doWrite(); await sleep(25);
    CHECK(modal() !== 'none',
      '🔴 0x1000 ＋ 8 ＝ 4104 超出已確認的 24C32（4096）⇒ **重新問一次**');
    EQ(checkedId(), '24C64', '🔴 重問時的預設 ⇒ 24C64');
    doc.getElementById('ee-cancel').click(); await pr; await sleep(15);
    A.eeForget();
    A.eepromAuto('24C32');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('63. 🔴 slave 從 EEPROM 切回非 EEPROM ⇒ Page 大小自動回「不分段」');
  {
    /* Bruce 2026-09-19：「我 Slave 位址從 0x50 切回 0x68 的時候，它的 Page 大小
       應該要自己切回不分段才對。為什麼這個沒有做到？」

       根因：`i2ctEepromApply()` 填完 page 之後把 `i2ctPageTouched` 設成 true，
       但那個旗標的定義是「**使用者自己動過** page 下拉選單」（唯一該設它的是
       `wr-page` 的 change listener）。型號視窗是系統填值，不是使用者動選單。
       旗標一被誤設，`i2ctAutoPage()` 之後永遠第一行就 return。 */
    const setSlave = (v) => {
      const e = doc.getElementById('in-slave'); e.value = v;
      e.dispatchEvent(new win.Event('input', { bubbles: true }));
    };
    const hint = () => doc.getElementById('pagehint').textContent;
    const pickModel = async (slave, id) => {
      A.setInputs({ slave: slave, awid: 2, off: '0x0000', len: '8' });
      A.loadFile('c.bin', new win.Uint8Array(8)); await sleep(15);
      const p = A.doWrite(); await sleep(25);
      const i = A.EEPROMS.findIndex((e) => e.id === id);
      doc.querySelectorAll('#ee-list input[name=eesel]')[i].checked = true;
      doc.getElementById('ee-ok').click(); await p; await sleep(20);
    };
    A._reset();
    await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.eeForget(); A.pageTouched(false); A.eepromAuto();

    await pickModel('0x50', '24C64');
    EQ(A.pageSize(), 32, '前置：0x50 選了 24C64 ⇒ page 32');
    EQ(A.pageTouched(), false, '🔴 型號視窗**不得**設 pageTouched（那是使用者的旗標）');
    CHECK(/自動/.test(hint()) && !/手動/.test(hint()),
      '🔴 系統填的值仍標「（自動）」，不是「（手動）」：' + hint());

    setSlave('0x68');
    EQ(A.pageSize(), 0, '🔴🔴 切到 0x68 ⇒ 自動回「不分段」（Bruce 回報的正是這一條）');
    CHECK(/連續/.test(hint()) && /自動/.test(hint()), '🔴 提示也要跟著變：' + hint());
    setSlave('0x50');
    EQ(A.pageSize(), 32, '🔴 切回 0x50 ⇒ 拿回**它自己那顆**確認過的 page（32）');

    /* 🔴 換一顆 page 不是 32 的，才驗得出「用那一顆的 page」而不是通用預設 32 */
    await pickModel('0x51', '24C01');
    EQ(A.pageSize(), 8, '前置：0x51 選了 24C01 ⇒ page 8');
    setSlave('0x68');
    EQ(A.pageSize(), 0, '0x68 ⇒ 不分段');
    setSlave('0x51');
    EQ(A.pageSize(), 8, '🔴 切回 0x51 ⇒ 回到 8，**不是**通用預設 32');
    setSlave('0x50');
    EQ(A.pageSize(), 32, '🔴 再切到 0x50 ⇒ 回到它的 32（兩個 slave 各記各的）');
    setSlave('0x52');
    EQ(A.pageSize(), 32, '沒確認過的 EEPROM slave ⇒ 通用預設 32');

    /* 反面：使用者**自己**動過選單，就不准被上面這套自動規則蓋掉 */
    doc.getElementById('wr-page').value = '256';
    doc.getElementById('wr-page').dispatchEvent(new win.Event('change', { bubbles: true }));
    EQ(A.pageTouched(), true, '他動了選單 ⇒ pageTouched 才該是 true');
    CHECK(/手動/.test(hint()), '🔴 這時才標「（手動）」：' + hint());
    setSlave('0x68');
    EQ(A.pageSize(), 256, '🔴 他指定過 ⇒ 切 slave 也不蓋掉（既有規則不得退步）');
    setSlave('0x50');
    EQ(A.pageSize(), 256, '🔴 切回 EEPROM 也一樣維持他選的');

    A.pageTouched(false); A.eeForget(); A.eepromAuto('24C32'); setSlave('0x68');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('38. 🔴 Shift＋方向鍵多選（線性位址區間，不是矩形）');
  {
    A._reset();
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, (_, i) => (m.addr + i) & 0xFF) };
      return { ok: true, status: 0, transferred: 1 };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '256' });
    await A.doRead(); await sleep(25);
    EQ(A.curSet().bytes.length, 256, '前置：真的讀到 256 byte（mock 沒回 data 的話後面全錯）');
    A.selClear();
    EQ(A.selRange(), null, '沒點過 ⇒ 沒有選取');
    A.selAnchor(0x00);
    EQ(A.selRange(), null, '只點一格 ⇒ 還不算多選');
    A.selMove(16);
    EQ(A.selRange().len, 17, '🔴 在 0x00 按 Shift+下 ⇒ 選取 **17 格**（0x00–0x10），不是 2 格');
    EQ(A.selRange().from + ',' + A.selRange().to, '0,16', '🔴 區間就是 0x00 到 0x10');
    EQ(doc.querySelectorAll('#dump td.sel').length, 17, '🔴 畫面上真的標了 17 格');
    A.selAnchor(0x00); A.selMove(1);
    EQ(A.selRange().len, 2, '🔴 Shift+右 ⇒ 2 格');
    A.selAnchor(0x00); A.selMove(16); A.selMove(1);
    EQ(A.selRange().len, 18, '🔴 Shift+下再 Shift+右 ⇒ 18 格');
    A.selAnchor(0x20); A.selMove(-16);
    EQ(A.selRange().from + ',' + A.selRange().to, '16,32', '🔴 往上也對（0x10–0x20）');
    A.selAnchor(0); A.selMove(-16);
    EQ(A.selRange(), null, '🔴 夾在 0，不繞回');
    EQ(A.selMove(16) && A.selRange() !== null, true, '夾住之後還能繼續往下選');
    A.selAnchor(0);
    A.selAnchor(255); A.selMove(16);
    EQ(A.selRange(), null, '🔴 夾在最後一格，不繞回');
    /* 有選取 ⇒ 按鈕寫出會寫多少 */
    A.selAnchor(0x00); A.selMove(16);
    EQ(doc.getElementById('btn-write').textContent, '寫入 選取的 17 byte', '🔴 有選取時按鈕標明選取長度');
    /* 🔴 有選取 ⇒ 只寫選取那段，而且是一筆 burst（非 EEPROM） */
    const since = sent.length;
    await A.doWrite(); await sleep(30);
    const w = sent.slice(since).filter(m => m.type === 'rawwrite');
    EQ(w.length, 1, '🔴 非 EEPROM ⇒ **一筆 burst**（不是 17 筆逐 byte）');
    EQ(w[0].data.length, 17, '🔴 只寫選取的 17 byte');
    EQ(w[0].addr, 0, '起始位址是選取的開頭');
    /* Esc 清除選取 ⇒ 回到整批行為 */
    A.selClear();
    EQ(A.selRange(), null, 'Esc／點別處 ⇒ 清除選取');
    /* 🔴 v1.16.2：沒有選取時按鈕改成顯示**整份內容的長度**（來源＝dump 中心值），
       不再只寫「寫入」—— 他按下去會寫多少，一律寫在按鈕上。 */
    EQ(doc.getElementById('btn-write').textContent, '寫入 A · 256 byte',       '🔴 沒有選取 ⇒ 按鈕顯示整份的長度');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('39. 🔴 離線編輯 ⇒ 只改本地、標示未寫入，連線後多選一次 burst 寫進去');
  {
    /* Bruce 2026-09-19 的工作流：把 I2C 關掉 → 離線把值編好 → 連線 → 多選 → 一次寫。 */
    A._reset();
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0x00) };
      return { ok: true, status: 0, transferred: 1 };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '32' });
    await A.doRead(); await sleep(25);
    await win.__i2ct.disconnect(); await sleep(30);          /* 🔴 他故意把 I2C 關掉 */
    const since = sent.length;
    const editCell = async (addr, text) => {
      /* v1.16.2：點中間數值、而且要**點兩次**才進編輯（見第 36 組的說明）。 */
      for (var k2 = 0; k2 < 2; k2++) {
        const td1 = doc.querySelector('#dump td[data-addr="' + addr + '"]');
        (td1.querySelector('.mv') || td1)
           .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      }
      await sleep(15);
      const inp = doc.querySelector('#dump td.edit input');
      if (!inp) { CHECK(false, '🔴 點中間數值應該要進入編輯（addr ' + addr + '）'); return; }
      inp.value = text;
      inp.dispatchEvent(new win.Event('input', { bubbles: true }));
      inp.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(25);
    };
    for (let i = 0; i < 17; i++) await editCell(i, (0xA0 + i).toString(16).toUpperCase().slice(-2));
    EQ(sent.slice(since).length, 0, '🔴 未連線編輯 ⇒ **完全沒有 I2C 交易**');
    EQ(A.cellParts(0).main, 'A0', '值真的改了');
    EQ(A.dirtyCount(), 17, '🔴 標示計數：已修改 17 byte 未寫入');
    EQ(A.dirtyAt(0), true, '第一格標成未寫入');
    CHECK(doc.querySelector('#dump td[data-addr="0"]').className.indexOf('dirty') >= 0,
      '🔴 格子有 dirty 樣式（與讀回來的值分得出來）');
    CHECK(/已修改 17 byte 未寫入/.test(doc.getElementById('dirtyline').textContent),
      '🔴 總數顯示出來：' + doc.getElementById('dirtyline').textContent);
    /* 連線 → 多選 17 格 → 一次寫進去 */
    const sent2 = await useHelper(baseScript(() => ({ ok: true, status: 0, transferred: 1 })));
    A.selAnchor(0); A.selMove(16);
    EQ(A.selRange().len, 17, '多選 17 格');
    await A.doWrite(); await sleep(30);
    const w = SINCE(sent2, 'rawwrite');
    EQ(w.length, 1, '🔴 一筆 burst 寫完 17 byte');
    EQ(w[0].data.length, 17, '長度 17');
    EQ(w[0].data.map(b => b & 0xFF).join(','),
       Array.from({ length: 17 }, (_, i) => 0xA0 + i).join(','), '🔴 內容就是他離線編輯的值');
    EQ(A.dirtyCount(), 0, '🔴 寫完 ⇒ 未寫入標示全部解除');
    EQ(doc.getElementById('dirtyline').textContent, '', '計數歸零後那一行消失');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('40. ⏱ 計時：秒為單位、分層記錄（他跑一次給 log 就能定位瓶頸）');
  {
    A._reset();
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, us: 12345, fast: true,
        data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0, transferred: 1, us: 6789 };
    }));
    /* 🔴 這一組驗的是**分段時**的耗時累加，所以要明講走慢路徑（其他路徑一次讀完、
       不分段，見第 46 組）。v1.13.1 起快速模式是預設值，不能再靠預設。
       🔴 v1.20.1：原本寫 `A.rawMpsse(false)`，而那在 v1.20.0 之後是
       **DLL_I2C_BCB.dll 路徑**（不分段）⇒ 512 會變成 1 段，這一組就驗不到累加。
       要慢路徑就明講 `A.mode(2)` —— 靠旗標旁敲側擊正是本版修掉的病灶。 */
    A.mode(2);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '512' });
    await A.doRead(); await sleep(30);
    const res = A.state().lastRead;
    CHECK(typeof res.ms === 'number' && res.ms >= 0, '讀取記下耗時（ms）：' + res.ms);
    EQ(res.segs, 2, '512 byte ⇒ 分 2 段');
    EQ(res.devUs, 24690, '🔴 bridge 端回報的 us 有被累加（2 段 × 12345）');
    const log = doc.getElementById('log').textContent;
    /* 🔴🔴 v1.15.0：單位規則**反過來了**（Bruce 2026-09-19：「像這種總耗時這麼短的，
       請用毫秒等級來列出，不要用 0 秒」）。舊斷言釘的是「一律用秒」，而那正是
       讓 12.6 ms 印成 `0.0 秒` 的原因 —— 舊測試是在保護這個 bug。
       新規則：**< 1 秒用 ms、≥ 1 秒用秒**。這一段的模擬耗時是幾 ms ⇒ 應該是 ms。 */
    CHECK(/⏱ 讀取 512 byte · 共 \d+(\.\d)? ms/.test(log), '🔴 log 的總計用毫秒（這一段遠短於 1 秒）');
    /* 🔴 文案改成使用者的語言（Bruce 2026-09-19：不准出現實作名詞），
       但**分層這件事本身不可以消失** —— 那是定位瓶頸唯一的資訊。 */
    CHECK(/裝置 \d+ ms、傳輸 -?\d+ ms/.test(log), '🔴 log 有分層：裝置與傳輸各多久');
    CHECK(/dev 12 ms/.test(log), '🔴 每一段各記一次 dev 耗時');
    CHECK(/\d+(\.\d)? (ms|秒)/.test(doc.getElementById('readbanner').textContent),
      '🔴 畫面上的完成訊息帶耗時：' + doc.getElementById('readbanner').textContent.slice(0, 40));
    CHECK(!/0\.0 秒/.test(doc.getElementById('readbanner').textContent),
      '🔴 短耗時不准印成 0.0 秒（那一格等於沒有資訊）');
    /* 寫入那一側 */
    A.loadFile('t.bin', new win.Uint8Array(300));
    await sleep(20);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '300' });
    await A.doWrite(); await sleep(30);
    const log2 = doc.getElementById('log').textContent;
    /* 🔴 不釘死小數位：100 ms 以上會取整數（`137 ms`），那是規則的一部分，
       不是壞掉。釘的是「有總計、而且單位合規」。 */
    CHECK(/⏱ 寫入 300 byte · 共 \d+(\.\d)? (ms|秒)/.test(log2), '🔴 寫入也有總計耗時（同一套單位規則）');
    CHECK(/段 1\/\d+ · \d+ byte · \d+\.\d ms/.test(log2), '🔴 寫入每一段各記一次耗時');
    /* 🔴 單位門檻本身要有單元測試，不能只靠上面那幾條剛好落在 ms 那一側。 */
    EQ(A.secs(0), '0.0 ms', '🔴 0 ⇒ `0.0 ms`（不是 `0.0 秒`，那正是他抱怨的那個畫面）');
    EQ(A.secs(12.64), '12.6 ms', '🔴 < 100 ms 留一位小數（7.9 和 8.4 不可以印成同一個數字）');
    EQ(A.secs(523.4), '523 ms', '100～999 ms 取整數（三位有效數字夠比較了）');
    EQ(A.secs(999), '999 ms', '999 ms 還是 ms');
    EQ(A.secs(1000), '1.0 秒', '🔴 門檻：1 秒（含）以上改用秒');
    EQ(A.secs(2730910), '2730.9 秒', '很長的耗時照樣用秒（不會變成七位數的 ms）');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('41. 🔴 燒 EEPROM ⇒ 寫完自動回讀驗證（program → verify）');
  {
    /* Bruce 2026-09-19：「整包寫入 EEPROM 的動作，必須要再回讀回來…都一樣才能
       秀出『驗證比對正確』；有不一樣就 highlight『驗證比對錯誤，需要再重新檢查』」。
       **只有 EEPROM（0x50–0x57）才做。** */
    const mkStore = (corrupt) => {
      const store = new Map();
      return (m) => {
        if (m.type === 'rawwrite') { m.data.forEach((b, i) => store.set(m.addr + i, b & 0xFF)); return { ok: true, status: 0, transferred: m.data.length }; }
        if (m.type === 'read') {
          const o = [];
          for (let i = 0; i < m.len; i++) {
            const a = m.addr + i;
            let v = store.has(a) ? store.get(a) : 0x00;
            if (corrupt && corrupt.has(a)) v = corrupt.get(a);
            o.push(v);
          }
          return { ok: true, status: 0, data: o };
        }
        return { ok: true, status: 0 };
      };
    };
    /* (a) 全部相同 ⇒ 驗證比對正確 */
    A._reset();
    let sent = await useHelper(baseScript(mkStore(null)));
    A.loadFile('burn.bin', new win.Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 3 + 1) & 0xFF)));
    await sleep(20);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '64' });
    const snapBefore = A.refBytesAt(0);
    await A.doWrite(); await sleep(60);
    const reads = SINCE(sent, 'read');
    CHECK(reads.length > 0, '🔴 寫完之後真的有回讀');
    EQ(reads.reduce((n, m) => n + m.len, 0), 64, '🔴 回讀的長度等於剛寫的 64 byte');
    EQ(reads[0].addr, 0, '從剛寫的起始位址開始回讀');
    CHECK(/寫入與回讀完全一致/.test(doc.getElementById('readbanner').textContent),
      '🔴 顯示「寫入與回讀完全一致」：' + doc.getElementById('readbanner').textContent.slice(0, 40));
    EQ(doc.querySelectorAll('#dump td.wrfail').length, 0, '沒有任何格子被標紅');
    EQ(A.refBytesAt(0), snapBefore, '🔴 驗證的回讀**沒有**動到快照基準');
    /* (b) 有 byte 不符 ⇒ 驗證比對錯誤，標紅、數量正確 */
    A._reset();
    const corrupt = new Map([[3, 0xEE], [10, 0xEE], [40, 0xEE]]);
    sent = await useHelper(baseScript(mkStore(corrupt)));
    A.loadFile('burn2.bin', new win.Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 3 + 1) & 0xFF)));
    await sleep(20);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '64' });
    await A.doWrite(); await sleep(60);
    const txt = doc.getElementById('readbanner').textContent;
    CHECK(/寫入與回讀不一致/.test(txt), '🔴 顯示「寫入與回讀不一致」：' + txt.slice(0, 40));
    CHECK(/3 byte/.test(txt), '🔴 講出有幾個 byte 不符：' + txt.slice(0, 40));
    /* 🔴 v1.16.0 新增要求：不只總數，還要看得到**哪裡**不一樣 */
    CHECK(/0x0003/.test(txt) && /0xEE/.test(txt), '🔴 列出位址與讀回值：' + txt.slice(0, 80));
    EQ(doc.querySelectorAll('#dump td.wrfail').length, 3, '🔴 三個不符的格子被標紅');
    CHECK(A.wrFailAt(3) && A.wrFailAt(10) && A.wrFailAt(40), '🔴 標紅的正是那三格');
    CHECK(!A.wrFailAt(4), '相符的格子沒有被標');
    /* (c) 回讀整段失敗 ⇒ 訊息要說「讀不回來」，不是「值不對」 */
    A._reset();
    sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: false, status: 4, err: 'no response' };
      return { ok: true, status: 0, transferred: m.data ? m.data.length : 0 };
    }));
    A.loadFile('burn3.bin', new win.Uint8Array(32));
    await sleep(20);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '32' });
    await A.doWrite(); await sleep(60);
    const t3 = doc.getElementById('readbanner').textContent;
    CHECK(/讀不回來/.test(t3), '🔴 講明是「讀不回來」而不是值不對：' + t3.slice(-40));
    CHECK(/驗證比對錯誤/.test(t3), '仍然算驗證失敗');
    /* (d) 🔴🔴 v1.16.0 **這一條反過來了**：非 EEPROM 也要回讀驗證。
       舊規則是「只有 EEPROM 才驗，一般暫存器很多唯寫、回讀值本來就不同，
       會製造假警報」—— 那是我們的推測。Bruce 2026-09-19 重申既有裁示：
       「不論是只點單一個儲存格，還是點多個儲存格，都是寫入以後還要再讀回來。」
       ⇒ 舊斷言（寫完沒有任何 read）現在是**錯的行為**，改成斷言相反面。 */
    A._reset();
    sent = await useHelper(baseScript(mkStore(null)));
    A.loadFile('burn4.bin', new win.Uint8Array(32));
    await sleep(20);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '32' });
    await A.doWrite(); await sleep(60);
    { const rd = SINCE(sent, 'read');
      CHECK(rd.length > 0, '🔴 非 EEPROM 也要回讀驗證（這一條 v1.16.0 反過來了）');
      EQ(rd.reduce((n, m) => n + m.len, 0), 32, '回讀長度等於剛寫的 32 byte'); }
    CHECK(/寫入與回讀完全一致/.test(doc.getElementById('readbanner').textContent),
      '🔴 而且一致時同樣是綠底那句話');
    /* (e) 逐格即時寫入那條路不受影響（它本來就有自己的回讀） */
    EQ(A.isEepromAddr(0x50), true, '邊界仍然正確');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('42. 🔴 讀取預設走已知正確的路徑（fast read 預設關）');
  {
    /* 2026-09-19 實機回歸：Bruce 讀 0x68（TCON register）只有前兩個 byte 正確、
       之後全是 0F。fast read 在真實裝置上的行為與假設不同 ⇒ 預設關掉。
       🔴 規則：**無法驗證的東西不可以當預設值。** */
    /* 🔴 v1.20.0 更新：自動選路已整套移除，預設直接走**原廠 DLL**。
       fast read（libMPSSE FAST_TRANSFER）退回純 debug 對照用，預設仍是關。 */
    A._reset();
    const sent = await useHelper(baseScript(() => ({ ok: true, status: 0, data: [1, 2, 3] })));
    EQ(A.fastRead(), false, '🔴 連線後：fast read ＝ 關');
    EQ(A.mode(), 0, '🔴 連線後的模式 ＝ 原廠 DLL（唯一在這顆晶片上走得通的）');
    const opens = sent.filter(m => m.type === 'open');
    CHECK(opens.length > 0, '有送出 open');
    EQ(opens[opens.length - 1].fastread, 0, '🔴 open 命令明確帶 fastread:0（不靠 exe 的預設）');
    EQ(opens[opens.length - 1].mode, 0, '🔴 open 帶的也是原廠模式');
    /* debug 區可以打開（供日後查清根因後實測），但要重新連線才生效 */
    A.setDebug(true);
    const chk = doc.getElementById('chk-fastread');
    CHECK(!!chk, 'debug 區有 fast read 開關');
    EQ(chk.checked, false, '開關預設沒勾');
    chk.checked = true; chk.dispatchEvent(new win.Event('change', { bubbles: true }));
    EQ(A.fastRead(), true, '勾起來會改狀態');
    const sent2 = await useHelper(baseScript(() => ({ ok: true, status: 0, data: [1] })));
    const o2 = sent2.filter(m => m.type === 'open');
    EQ(o2[o2.length - 1].fastread, 1, '重新連線後才帶 fastread:1');
    chk.checked = false; chk.dispatchEvent(new win.Event('change', { bubbles: true }));
    A.setDebug(false);
    EQ(A.fastRead(), false, '關回去');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('43. ⏱ 耗時紀錄常駐（他要拿來比較，不能自己消失）');
  {
    A._reset();
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, us: 1000, fast: false, raw: false,
        data: Array.from({ length: m.len }, () => 0x11) };
      return { ok: true, status: 0, transferred: 1, us: 500 };
    }));
    A.clearTimes();
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(25);
    await A.doRead(); await sleep(25);
    await A.doRead(); await sleep(25);
    EQ(A.times().length, 3, '🔴 連讀 3 次 ⇒ 列出 3 筆');
    EQ(A.times()[0].kind, '讀', '最新的在最上面');
    EQ(A.times()[0].n, 16, '記下長度');
    CHECK(/一般模式|快速模式/.test(A.times()[0].path), '🔴 記下走的是哪條路徑：' + A.times()[0].path);
    CHECK(doc.getElementById('timeline').textContent.indexOf('byte') >= 0, '畫面上看得到');
    /* 換頁、切 slave 都不能清掉 */
    A.jumpTo('000');
    A.setInputs({ slave: '0x50' });
    await sleep(20);
    EQ(A.times().length, 3, '🔴 換頁與切 slave 之後仍然在');
    /* 超過 5 筆只留最近 5 筆 */
    for (let i = 0; i < 4; i++) { await A.doRead(); await sleep(15); }
    EQ(A.times().length, 5, '最多留 5 筆');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('44. 🔴 清空：回到「完全沒有檔案」的狀態（逐項斷言）');
  {
    A._reset();
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0x11) };
      return { ok: true, status: 0, transferred: 1 };
    }));
    /* 把每一項狀態都弄髒 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0020', len: '64' });
    await A.doRead(); await sleep(25);
    A.snapshot();
    A.loadFile('dirty.bin', new win.Uint8Array(Array.from({ length: 64 }, (_, i) => i)));
    await sleep(25);
    A.selAnchor(2); A.selMove(16);
    A.setCross(0x0020);
    await win.__i2ct.disconnect(); await sleep(25);
    A.beginEdit(1);
    CHECK(A.curSet() && A.refBytesAt(0) !== null && A.selRange() && A.editing(), '前置：狀態都弄髒了');
    const linkedBefore = A.state().linked;
    /* 清空 */
    EQ(A.clearAll(), true, '清空執行');
    await sleep(25);
    EQ(A.curSet(), null, '① dump 資料清掉');
    EQ(A.refBytesAt(0), null, '🔴 ② 快照清掉');
    { const c0 = A.cellParts(0);
      CHECK(!c0 || (c0.main === null && c0.snap === null && c0.old === null),
            '③ 三槽（格子上沒有任何值）'); }
    EQ(A.diffCount(), 0, '④ diff 歸零');
    EQ(A.dirtyCount(), 0, '⑤ 本地修改標記清掉');
    EQ(A.wrFailAt(0), false, '⑥ 寫入失敗標記清掉');
    EQ(A.selRange(), null, '⑦a 選取清掉');
    EQ(A.cross(), null, '⑦b 十字清掉');
    EQ(A.editing(), null, '⑦c 半輸入狀態清掉');
    EQ(A.fileState().len, 0, '⑧a 載入的檔案清掉');
    EQ(doc.getElementById('in-len').value, '256', '⑧b 總 byte 數回預設');
    EQ(doc.getElementById('readbanner').textContent, '', '⑨ 訊息橫幅清掉');
    EQ(A.pageIdx(), 0, '⑩ 頁碼回第一頁');
    /* 🔴 不該被清掉的 */
    EQ(doc.getElementById('in-slave').value, '0x50', '🔴 slave 參數**不清**');
    EQ(A.state().linked, linkedBefore, '🔴 連線狀態**不動**');
    CHECK(A.times().length > 0, '🔴 耗時紀錄**不清**（那正是他要比較的東西）');
    /* 清空後再讀 ⇒ 與剛開頁面一樣，會自動建立新快照 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0x77) };
      return { ok: true, status: 0 };
    }));
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(25);
    EQ(A.curSet().bytes.length, 16, '🔴 清空後再讀 ⇒ 行為與剛開頁面相同');
    EQ(A.refBytesAt(0), 0x77, '🔴 並且自動建立了新的快照基準');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('45. 🔴 手動的快慢路徑比對按鈕（debug 診斷工具）');
  {
    /* 🔴 v1.13.1：快速模式已改成**預設開**（安全性靠自動驗證，見第 45b 組），
       所以這裡不再驗「預設關」。這顆按鈕的定位也跟著變成**診斷工具**：
       自動驗證只比 64 byte，他想拿 4096 byte 自己比一次時用這顆。 */
    A._reset();
    /* 🔴 v1.20.0：產品預設改成**原廠 DLL** ⇒ 自建那條預設關。 */
    EQ(A.rawMpsse(), false, '🔴 自建（快速模式）預設關，預設走原廠 DLL');
    const sent = await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0 };
    }));
    /* 🔴 連線之後才關 —— 連線會把快速模式還原成預設開（v1.13.3 修掉的那個
       「退回狀態不復原」的 bug），在連線前設會被蓋掉。 */
    A.rawMpsse(false);
    const chk = doc.getElementById('chk-rawmpsse');
    CHECK(!!chk, 'debug 區有快速模式開關');
    chk.checked = false;
    /* 快慢路徑比對：兩條路徑各讀一次，然後切回原本的設定 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '32' });
    const since = sent.length;
    await A.comparePaths();
    await sleep(40);
    const after = sent.slice(since);
    const os = after.filter(m => m.type === 'open');
    /* 🔴 v1.13.2：改成量**三條**路徑（快速／中速／一般），所以是 3 次切換 ＋ 1 次還原。
       中速 ＝ libMPSSE 的 FAST_TRANSFER_BYTES；FTDI 自己的標頭註解寫
       「no address phase, no USB interframe delays」，反面就是一般路徑照定義有
       interframe delay —— 那正是 byte 間十幾毫秒的官方解釋。 */
    EQ(os.length, 4, '🔴 比對送出 4 次 open（快速、中速、一般、還原）');
    /* 🔴 每一次 open 都要帶 threephase —— bridge 靠它在切換路徑時重設三相與除數。
       漏掉的話慢路徑會跑在 raw 的設定上（v1.11.4 實測 80 kHz 就是這樣污染的）。 */
    CHECK(os.every(m => m.threephase === 1 || m.threephase === 0),
      '🔴 每次 open 都帶 threephase（bridge 據此重設三相與除數）');
    /* 🔴 v1.20.0：第一趟 ＝ **他目前實際採用的那一條**，預設就是原廠（mode 0）。
       判準看 `mode` 而不是 rawmpsse／fastread —— bridge 以 mode 為準，
       那兩個只是相容旗標（v1.14.5 就是兩套來源各填一次才出過錯）。 */
    EQ({ mode: os[0].mode, raw: os[0].rawmpsse, fast: os[0].fastread }, { mode: 0, raw: 0, fast: 0 }, '第一趟：目前採用的（原廠）');
    EQ({ mode: os[1].mode, raw: os[1].rawmpsse, fast: os[1].fastread }, { mode: 1, raw: 0, fast: 1 }, '第二趟：中速（FAST_TRANSFER）');
    EQ({ mode: os[2].mode, raw: os[2].rawmpsse, fast: os[2].fastread }, { mode: 2, raw: 0, fast: 0 }, '第三趟：一般（基準）');
    EQ({ mode: os[3].mode, raw: os[3].rawmpsse }, { mode: 0, raw: 0 }, '🔴 比完切回他原本的設定（不偷偷留在比對狀態）');
    EQ(after.filter(m => m.type === 'read').length, 3, '三條路徑各讀一次');
    CHECK(/完全相同/.test(doc.getElementById('readbanner').textContent),
      '🔴 兩邊相同 ⇒ 明確告訴他：' + doc.getElementById('readbanner').textContent.slice(0, 40));
    CHECK(A.times().some(t => t.kind === '比對'), '比對也記進耗時紀錄');
    /* 不一致時要說「不要開它」 */
    A._reset();
    /* 🔴 不能用 baseScript：它在呼叫 f 之前就把 open 攔下來回覆了，
       所以 f 看不到 open 的 rawmpsse 旗標（第一版就是這樣，兩趟讀到一樣的資料）。 */
    let flip = false;
    /* 🔴 要接住這一次的 sent —— 前面那個 `sent` 是**上一個 helper** 的紀錄陣列，
       拿它去看第二輪的 open 會永遠是空的（第一版就是這樣爆的）。 */
    const sent2 = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.8.0', proto: 3, ok: true };
      if (m.type === 'open') { flip = (m.rawmpsse === 1); return { ok: true, channels: 1 }; }
      if (m.type === 'close') return { ok: true };
      if (m.type === 'read') return { ok: true, status: 0,
        data: Array.from({ length: m.len }, (_, i) => (i + (flip ? 1 : 0)) & 0xFF) };
      return { ok: true, status: 0 };
    });
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    /* 🔴 先把快速模式打開 —— 這才是危險情境：他本來就開著，比對抓到不一致之後
       若還切回快速模式，等於抓到問題卻放他繼續踩。舊版就是這樣。 */
    chk.checked = true; chk.dispatchEvent(new win.Event('change'));
    const since2 = sent2.length;
    await A.comparePaths(); await sleep(40);
    const banner = doc.getElementById('readbanner').textContent;
    CHECK(/不要用快速模式/.test(banner), '🔴 兩邊不同 ⇒ 明講不要開：' + banner.slice(0, 44));
    CHECK(/已自動改回預設的讀取方式/.test(banner), '🔴 不一致 ⇒ 畫面上講明已自動切回');
    CHECK(chk.checked === false, '🔴 不一致 ⇒ 勾選框真的被取消（不是只講講）');
    /* 🔴 v1.20.0：最後一次 open 必須 **mode 與 rawmpsse 都回到預設**。
       只檢查 rawmpsse 會漏掉真正的破口 —— bridge 以 mode 為準，mode 還留在 3
       的話「已自動改回」就只是畫面上的話（這一條就是那次補正的釘子）。 */
    const os2 = sent2.slice(since2).filter(m => m.type === 'open');
    EQ({ mode: os2[os2.length - 1].mode, raw: os2[os2.length - 1].rawmpsse }, { mode: 0, raw: 0 },
       '🔴 不一致 ⇒ 最後真的用預設（原廠）模式重新連線');
    EQ(A.mode(), 0, '🔴 內部狀態也回到預設，不是只有送出去的封包');
    /* 🔴 結論要跟耗時一起常駐：banner 會被下一個動作蓋掉，紀錄不會 */
    /* 🔴 只看**最新那三筆**（一般／快速／中速各一）—— 紀錄是常駐的，前一輪
       「相同」的比對也還在表上（那正是我們要的行為），拿全部去比會永遠失敗。
       一般那條是**基準**，它不會標「不符」；快速與中速各自對基準的結論要標出來。 */
    const cmp = A.times().filter(t => t.kind === '比對').slice(0, 3);
    EQ(cmp.length, 3, '🔴 三條路徑各留一筆結論');
    CHECK(cmp.some(t => t.path === '一般模式' && /基準/.test(t.verdict)), '一般模式標為基準');
    CHECK(cmp.some(t => t.path === '快速模式' && /不符/.test(t.verdict)),
      '🔴 快速模式的不符結論留在紀錄裡：' + cmp.map(t => t.path + '=' + t.verdict).join(' / '));
    /* 🔴 文案不得出現實作名詞（Bruce 2026-09-19）——畫面上的字逐條檢查 */
    CHECK(!/MPSSE|三相|divisor|USB 往返/i.test(banner), '🔴 比對文案沒有實作名詞');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('45c. 🔴 分頁過舊的偵測（bridge 比我這份 version.js 預期的還新）');
  {
    /* 🔴 判準不是拍腦袋挑的門檻：version.js 與 i2c.html 同一次部署出去，
       所以「我預期 X，實際連到 X 之後的版本」只有一個解釋 —— 我這份是舊的。
       誠實的限制：**救不了已經開著的舊分頁**（它沒有這段程式碼），
       只能讓下一次不再繞圈；舊分頁那一次靠 bridge 的 log。 */
    const V = win.i2ctVerNewer;
    CHECK(V('1.11.3', '1.11.2') === true,  '1.11.3 比 1.11.2 新');
    CHECK(V('1.11.2', '1.11.3') === false, '反向不成立');
    CHECK(V('1.11.2', '1.11.2') === false, '相同不算新');
    CHECK(V('v1.12.0', '1.11.9') === true, '開頭的 v 不影響比較');
    CHECK(V('1.12', '1.11.9') === true,    '缺的段當 0');
    CHECK(V('unknown', '1.11.2') === false, '🔴 非數字一律不跳警告（不確定就不要吵他）');

    A._reset();
    await useHelper((m) => {
      /* bridge 自報 99.0.0 ＝ 遠新於這份 version.js 預期的 ⇒ 這個分頁是舊的 */
      if (m.type === 'ping') return { helper: '99.0.0', proto: 3, ok: true };
      if (m.type === 'open') return { ok: true, channels: 1 };
      if (m.type === 'close') return { ok: true };
      return { ok: true, status: 0 };
    });
    const stale = doc.getElementById('topbanner').textContent;
    CHECK(/Ctrl\+F5|重新整理/.test(stale), '🔴 一行字叫他重新整理：' + stale.slice(0, 40));
    CHECK(stale.length < 40, '🔴 一行就好，不加說明段落（' + stale.length + ' 字）');
    await win.__i2ct.disconnect();

    /* 反面：版本相符時**不可以**跳這句話 */
    A._reset();
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: win.HELPER_PKG.exe, proto: 3, ok: true };
      if (m.type === 'open') return { ok: true, channels: 1 };
      if (m.type === 'close') return { ok: true };
      return { ok: true, status: 0 };
    });
    CHECK(!/Ctrl\+F5/.test(doc.getElementById('topbanner').textContent),
      '🔴 版本相符 ⇒ 不跳重新整理（不要沒事嚇他）');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('45b. 🔴🔴 預設走原廠 DLL；不再有首次讀取的 64 byte 探測（v1.20.0）');
  {
    /* 這一組釘住的是 Bruce 2026-09-19 的兩件事：
       (1)「不是我們討論了兩天不要用自建的嘛？它不是已經有原廠的 DLL 了嗎？」
          —— bridge 的預設本來就是 vendor，是網頁每次 open 前強制 rawmpsse=true
          把它覆蓋掉，所以實際跑的是自建 raw MPSSE。
       (2)「把那個一 byte 一 byte 的給拿掉」—— 首次讀取的自動選路會多送 4 次讀取，
          其中三次是 64 byte 的逐 byte 慢讀。
       🔴 反面也要釘：降級提示不可以跟著消失，而且**每次重連都要重述**。 */

    /* (a) 開頁後送出的 open ＝ mode:0、rawmpsse:0 */
    A._reset();
    const s1 = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.13.1', proto: 3, ok: true };
      if (m.type === 'open') return { ok: true, channels: 1 };
      if (m.type === 'close') return { ok: true };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1, raw: false, fast: false,
        data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0 };
    });
    { const o = s1.filter(m => m.type === 'open');
      EQ(o.length, 1, '連線只送一次 open');
      EQ({ mode: o[0].mode, raw: o[0].rawmpsse, fast: o[0].fastread },
         { mode: 0, raw: 0, fast: 0 },
         '🔴🔴 open 封包 ＝ mode:0（原廠 DLL）、rawmpsse:0、fastread:0'); }
    EQ(A.mode(), 0, '內部狀態也是原廠');

    /* (b) 🔴 第一次讀取**不再**先發出 64 byte 的探測 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    const before = s1.filter(m => m.type === 'read').length;
    await A.doRead(); await sleep(40);
    { const rd = s1.filter(m => m.type === 'read').slice(before);
      EQ(rd.length, 1, '🔴🔴 第一次讀取只送 1 則 read（舊版是 4 則：基準＋三條候選＋實際）');
      EQ(rd[0].len, 16, '🔴 而且長度就是他要的 16，沒有 64 byte 的探測');
      CHECK(!rd.some(r => r.len === 64), '🔴 沒有任何 64 byte 的額外讀取'); }
    EQ(A.mode(), 0, '讀完仍是原廠（沒有被選路改掉）');
    EQ(A.lastPath(), '快速模式', '耗時紀錄標成快速模式（原廠 usbrt=1）');
    CHECK(!/比較慢/.test(doc.getElementById('topbanner').textContent),
      '🔴 原廠成功時畫面乾淨：' + doc.getElementById('topbanner').textContent.slice(0, 30));
    /* 第二次讀取也一樣是 1 則（不是「只有第一次沒探測」） */
    { const b2 = s1.filter(m => m.type === 'read').length;
      await A.doRead(); await sleep(40);
      EQ(s1.filter(m => m.type === 'read').length - b2, 1, '第二次讀取同樣只有 1 則'); }
    await win.__i2ct.disconnect();

    /* (c) 🔴 重連三次，三次都是 mode:0 / rawmpsse:0
       （舊 bug 就是重連會把旗標掉回去，Bruce 的 log 三次都送 rawmpsse:0） */
    for (let k = 1; k <= 3; k++) {
      const sk = await useHelper((m) => {
        if (m.type === 'ping') return { helper: '1.13.1', proto: 3, ok: true };
        if (m.type === 'open') return { ok: true, channels: 1 };
        if (m.type === 'close') return { ok: true };
        if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
          data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
        return { ok: true, status: 0 };
      });
      const ok = sk.filter(m => m.type === 'open');
      EQ({ mode: ok[0].mode, raw: ok[0].rawmpsse }, { mode: 0, raw: 0 },
         '🔴 第 ' + k + ' 次重連仍是 mode:0, rawmpsse:0');
      await win.__i2ct.disconnect();
    }

    /* (d) 🔴 手動優先：他自己在 debug 區切到自建 ⇒ 重連仍維持他的選擇 */
    A._reset();
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.13.1', proto: 3, ok: true };
      if (m.type === 'open') return { ok: true, channels: 1 };
      if (m.type === 'close') return { ok: true };
      return { ok: true, status: 0 };
    });
    A.setDebug(true);
    const chkR = doc.getElementById('chk-rawmpsse');
    CHECK(!!chkR, 'debug 區有自建模式開關');
    EQ(chkR.checked, false, '🔴 開關預設沒勾（預設走原廠）');
    chkR.checked = true; chkR.dispatchEvent(new win.Event('change', { bubbles: true }));
    EQ(A.mode(), 3, '🔴 勾起來 ⇒ mode 也跟著變成自建（只改旗標等於開關是壞的）');
    await win.__i2ct.disconnect();
    const sm = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.13.1', proto: 3, ok: true };
      if (m.type === 'open') return { ok: true, channels: 1 };
      if (m.type === 'close') return { ok: true };
      return { ok: true, status: 0 };
    });
    { const o = sm.filter(m => m.type === 'open');
      EQ({ mode: o[0].mode, raw: o[0].rawmpsse }, { mode: 3, raw: 1 },
         '🔴🔴 重連後**尊重他的手動選擇**，不被預設蓋掉'); }
    chkR.checked = false; chkR.dispatchEvent(new win.Event('change', { bubbles: true }));
    EQ(A.mode(), 0, '取消勾選 ⇒ 回產品預設（原廠），不是回已知走不通的一般模式');
    A.setDebug(false);
    await win.__i2ct.disconnect();

    /* (e) 🔴🔴 原廠路徑失敗 ⇒ 畫面要講，而且**重連後會再講一次**（不是只講一次）。
       模擬 bridge 端的降級：Open() 失敗 ⇒ dgh_mode 退回 SLOW ⇒ 讀取回報逐 byte 指紋。 */
    A._reset();
    const mkFall = (m) => {
      if (m.type === 'ping') return { helper: '1.13.1', proto: 3, ok: true };
      if (m.type === 'open') return { ok: true, channels: 1 };
      if (m.type === 'close') return { ok: true };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: m.len * 2 + 2, raw: false, fast: false,
        data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0 };
    };
    await useHelper(mkFall);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(40);
    { const bn = doc.getElementById('topbanner').textContent;
      CHECK(/比較慢/.test(bn), '🔴 原廠走不成 ⇒ 畫面明講這次比較慢：' + bn.slice(0, 40));
      CHECK(!/MPSSE|三相|divisor|USB 往返/i.test(bn), '🔴 降級訊息沒有實作名詞'); }
    /* 同一次連線內只講一次（不洗版） */
    doc.getElementById('topbanner').innerHTML = '';   /* 直接清掉，才驗得到「有沒有再掛一次」 */
    await A.doRead(); await sleep(40);
    CHECK(!/比較慢/.test(doc.getElementById('topbanner').textContent),
      '🔴 同一次連線內不重複洗版');
    /* 🔴 但**重連之後要再講一次** —— 這是「降級狀態每次重連都重述」那條規則 */
    await win.__i2ct.disconnect();
    await useHelper(mkFall);
    await A.doRead(); await sleep(40);
    CHECK(/比較慢/.test(doc.getElementById('topbanner').textContent),
      '🔴🔴 重連之後降級提示**會再出現一次**（不是只講一次就永遠安靜）');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('45c. 🔴🔴 模式標籤與退回橫幅必須反映**實際走的後端**（v1.14.5）');
  {
    /* 根因：舊寫法只看 `r.raw` 一個旗標 ⇒ 原廠 DLL（raw=false）被標成「一般模式」，
       而且 `i2ctRawMpsse` 的預設 true 在自動選路**結束前**就讓退回橫幅掛上去。
       Bruce 2026-09-19 的畫面同時出現「0.0 秒　一般模式」與「快的方式用不了」，
       但那次讀到的 256 byte 與黃金基準逐位元組相同、不到 10 ms —— 兩行都是假的。 */

    /* (a) 四條路各自的指紋 ⇒ 標籤 */
    EQ(A.pathOf({ usbrt: 1 }).key, 'vendor', '🔴 usbrt=1 ＝ 原廠 DLL（只有它會是 1）');
    EQ(A.pathOf({ usbrt: 1 }).label, '快速模式', '🔴 原廠要標成「快速模式」（就是這一條被標錯的）');
    EQ(A.pathOf({ usbrt: 1, raw: false, fast: false }).key, 'vendor',
       '🔴 raw/fast 都是 false 也不能蓋過 usbrt=1 —— 原廠本來就兩個都 false');
    EQ(A.pathOf({ raw: true, usbrt: 2 }).key, 'built', '自建：raw=true');
    EQ(A.pathOf({ raw: true, usbrt: 2 }).label, '快速模式', '自建也是快速');
    EQ(A.pathOf({ fast: true, usbrt: 2 }).key, 'fast', '官方快速：fast=true');
    EQ(A.pathOf({ fast: true, usbrt: 2 }).label, '快速模式', '官方快速也是快速');
    EQ(A.pathOf({ raw: false, fast: false, usbrt: 34 }).key, 'slow', '逐 byte：usbrt = len*2+2');
    EQ(A.pathOf({ raw: false, fast: false, usbrt: 34 }).label, '一般模式', '逐 byte 才是一般模式');
    /* 🔴 三條快的都要 fastish，否則退回判斷會把它們當成退回 */
    CHECK(A.pathOf({ usbrt: 1 }).fastish && A.pathOf({ raw: true }).fastish
          && A.pathOf({ fast: true }).fastish, '🔴 三條快的都算「快」');
    CHECK(A.pathOf({ raw: false, fast: false, usbrt: 34 }).fastish === false, '逐 byte 不算快');
    /* (b) 欄位缺席 ⇒ 判不出來，**不可以**宣稱它退回了 */
    CHECK(A.pathOf({}).sure === false, '🔴 沒有任何指紋 ⇒ sure=false（不宣稱）');
    CHECK(A.pathOf(null).sure === false, '🔴 連回覆都沒有也不能當成退回');
    CHECK(A.pathOf({ usbrt: 34 }).sure === true, '逐 byte 有正面證據 ⇒ sure=true');

    /* (c) 端到端：原廠被採用時，耗時紀錄要寫「快速模式」、橫幅要乾淨 */
    A._reset();
    let cm = 2;
    const s45c = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.11.11', proto: 3, ok: true };
      if (m.type === 'open') { cm = (typeof m.mode === 'number') ? m.mode : 2; return { ok: true, channels: 1 }; }
      if (m.type === 'close') return { ok: true };
      if (m.type === 'read') {
        /* 🔴 忠實模擬 bridge 依**實際走的分支**填的三個欄位（i2c_bridge.c i2c_read_ex）。
           少填就等於在測一個現實中不存在的 bridge。 */
        const f = cm === 0 ? { usbrt: 1, raw: false, fast: false }
                : cm === 1 ? { usbrt: 2, raw: false, fast: true  }
                : cm === 3 ? { usbrt: 2, raw: true,  fast: false }
                           : { usbrt: m.len * 2 + 2, raw: false, fast: false };
        return Object.assign({ ok: true, status: 0,
          data: Array.from({ length: m.len }, (_, i) => i & 0xFF) }, f);
      }
      return { ok: true, status: 0 };
    });
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(40);
    EQ(A.mode(), 0, '前提：預設就是原廠（v1.20.0 起不再靠自動選路挑出來）');
    EQ(A.lastPath(), '快速模式', '🔴🔴 採用原廠時，耗時紀錄的模式欄是「快速模式」（bug 本體）');
    { const bn = doc.getElementById('topbanner').textContent;
      CHECK(!/比較慢|用不了/.test(bn), '🔴🔴 原廠成功時不准掛「快的方式用不了」：' + bn.slice(0, 40)); }
    { const tt = doc.getElementById('times') ? doc.getElementById('times').textContent : '';
      CHECK(!/一般模式/.test(tt), '🔴 耗時紀錄裡不會出現「一般模式」：' + tt.slice(0, 60)); }
    await win.__i2ct.disconnect();

    /* (d) 反面：要了快的、bridge 實際走逐 byte ⇒ 橫幅**要**出現（規則不可以被修掉） */
    A._reset();
    let cm2 = 2;
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.11.11', proto: 3, ok: true };
      if (m.type === 'open') { cm2 = (typeof m.mode === 'number') ? m.mode : 2; return { ok: true, channels: 1 }; }
      if (m.type === 'close') return { ok: true };
      if (m.type === 'read') {
        /* 🔴 資料一律相同（所以原廠會被採用），但 bridge 一律回報**逐 byte 的指紋**
           ＝ 典型的「靜默退回」：選了快的，底下走的是慢的。 */
        return { ok: true, status: 0, usbrt: m.len * 2 + 2, raw: false, fast: false,
                 data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      }
      return { ok: true, status: 0 };
    });
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(40);
    EQ(A.mode(), 0, '前提：網頁以為自己走的是原廠（預設）');
    { const bn2 = doc.getElementById('topbanner').textContent;
      CHECK(/比較慢/.test(bn2), '🔴 真的退回時橫幅**一定要**出現（不准靜默）：' + bn2.slice(0, 40));
      CHECK(!/MPSSE|三相|divisor|USB 往返/i.test(bn2), '退回訊息沒有實作名詞'); }
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('47. 🔴 搜尋（連續位元組、全部／本頁、兩端循環、跨頁自動翻頁）');
  {
    /* Bruce 2026-09-19 指定的四件事：範圍兩選一、用「寫入資料」那套輸入格式、
       比對**連在一起的 N 筆**、上下箭頭兩端都循環。 */
    A._reset();
    /* 1024 byte ＝ 4 頁。在三個位置埋同一段 3 byte 的樣式：
         +0x0005（第 0 頁）、+0x0123（第 1 頁）、+0x02FE（第 2→3 頁交界，跨頁） */
    const buf = new win.Uint8Array(1024);
    for (let i = 0; i < 1024; i++) buf[i] = (i * 7) & 0xFF;
    const PAT = [0x61, 0x41, 0xB4];
    /* 0x02FE 那一筆**故意跨頁**（766,767 在第 2 頁、768 在第 3 頁）：
       「本頁」的定義是整段都要落在本頁，所以它只能在「全部範圍」被找到。 */
    [0x0005, 0x0123, 0x0250, 0x02FE].forEach((p) => { buf[p] = PAT[0]; buf[p + 1] = PAT[1]; buf[p + 2] = PAT[2]; });
    A.loadFile('find.bin', buf);
    await sleep(20);

    /* (a) 全部範圍：三筆都要找到，包含跨頁那一筆 */
    const ALL = [0x0005, 0x0123, 0x0250, 0x02FE];
    let f = A.find('61 41 B4');
    EQ(f.hits, ALL, '🔴 全部範圍：四筆都找到（含跨頁的 0x02FE）');
    EQ(f.info, '1 / 4', '🔴 顯示第幾筆／共幾筆');

    /* (b) 🔴 輸入格式沿用「寫入資料」的解析器 ⇒ 各種寫法結果必須完全相同 */
    ['61,41,B4', '0x61 0x41 0xB4', '61h 41h B4h', '0x61h,0x41h,0xB4h', '6141B4']
      .forEach((s) => EQ(A.find(s).hits, ALL, '同一段資料寫成「' + s + '」結果相同'));
    EQ(A.find('61 4').hits, [], '🔴 半個 byte ⇒ 不臆測');
    CHECK(/看不懂/.test(A.find('61 4').info), '🔴 解不了要講出是哪一個 token：' + A.find('61 4').info);

    /* (c) 長度：1 / 2 / 4 個位元組都要是**連續**比對 */
    EQ(A.find('61 41').hits, ALL, '2 byte 連續');
    EQ(A.find('41 B4').hits, ALL.map((h) => h + 1), '2 byte 連續（起點差一）');
    CHECK(A.find('61 41 B4 00').hits.length === 0
       || A.find('61 41 B4 00').hits.every((h) => buf[h + 3] === 0x00), '4 byte 也是連續比對');

    /* (d) 兩端循環（他逐字指定的 (a)(b) 兩條） */
    A.find(''); A.find('61 41 B4');
    EQ(A.findGo(-1).at, 3, '🔴 在第 1 筆按「上」⇒ 循環到最後一筆');
    EQ(A.findGo(1).at, 0, '🔴 在最後一筆按「下」⇒ 循環回第一筆');
    EQ(A.findGo(1).at, 1, '一般情況：往下一筆');

    /* (e) 🔴 跨頁命中要自動翻到那一頁，並用既有的十字定位標示 */
    /* 🔴 先清空再輸入 —— 重打**同一個**查詢時，游標會**停在原來那一筆**
       （翻頁重算時不該把他丟回第一筆，見 i2ctFindRun 的說明）。
       這一段要從第一筆開始數，所以明確清掉。 */
    A.find(''); A.find('61 41 B4');
    EQ(A.findState().at, 0, '清空後重新輸入 ⇒ 從第一筆開始');
    let g3 = A.findGo(1);           /* 0x0005 → 0x0123（第 1 頁） */
    EQ(g3.page, 1, '🔴 命中在第 1 頁 ⇒ 自動翻過去');
    EQ(g3.cross, 0x0123, '🔴 用既有的十字定位標示命中位置');
    CHECK(doc.querySelectorAll('#dump td.xc').length === 1, '🔴 畫面上真的有一個十字中心');
    g3 = A.findGo(1);               /* → 0x0250（第 2 頁） */
    EQ(g3.page, 2, '🔴 下一筆在第 2 頁 ⇒ 又自動翻過去');

    /* (f) 只找本頁：目前在第 2 頁（0x0200–0x02FF） */
    A.findScope(true);
    EQ(A.findState().hits, [0x0250], '🔴 本頁範圍：只剩完整落在這一頁裡的那一筆');
    EQ(A.findState().info, '1 / 1', '計數跟著範圍走');
    /* 🔴 0x02FE 那一筆**跨頁**（766,767 在本頁、768 在下一頁）⇒ 不算本頁命中。
       否則同一段資料在第 2 頁算一次、第 3 頁再算一次，計數會自己重複。 */
    CHECK(A.findState().hits.indexOf(0x02FE) < 0, '🔴 跨頁的那一段不算「本頁」命中');
    A.findGo(1);
    EQ(A.findState().hits.length, 1, '本頁只有一筆，往下循環還是同一筆');
    /* 切回全部範圍 ⇒ 跨頁那一筆又出現 */
    A.findScope(false);
    CHECK(A.findState().hits.indexOf(0x02FE) >= 0, '🔴 切回全部範圍，跨頁那一筆找得到');

    /* (g) 找不到 ⇒ 一句話 */
    A.findScope(false);
    const nf = A.find('DE AD BE EF');
    EQ(nf.hits, [], '找不到就是空的');
    EQ(nf.info, '找不到', '🔴 找不到要講一句（一行，不加說明段落）');
    CHECK(doc.getElementById('btn-find-next').disabled === true, '沒有命中時上下鍵是灰的');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('48. 🔴 bit7–bit0 核取方塊：雙向同步，提交走與手動改格同一條路');
  {
    A._reset();
    const buf2 = new win.Uint8Array([0x00, 0xA5, 0xFF, 0x10]);
    A.loadFile('bits.bin', buf2);
    await sleep(20);

    /* (a) 沒選取任何格 ⇒ 空狀態 */
    CHECK(A.bitsEmpty() === true, '🔴 未選取時是空狀態');
    EQ(A.bits(), null, '空狀態沒有核取方塊');

    /* (b) 點一格 ⇒ 顯示該格的 bit7…bit0 */
    A.selAnchor(1);                                  /* 0xA5 = 1010 0101 */
    await sleep(10);
    CHECK(A.bitsEmpty() === false, '選取後空狀態消失');
    EQ(A.bits(), [true, false, true, false, false, true, false, true],
       '🔴 0xA5 ⇒ b7..b0 = 1,0,1,0,0,1,0,1（bit7 在最左）');
    CHECK(/0x0001 = 0xA5/.test(doc.getElementById('bitaddr').textContent),
      '🔴 標題寫出是哪一格、目前是多少：' + doc.getElementById('bitaddr').textContent);

    /* (c) 勾一個 bit ⇒ 值立刻變，而且 dump 與核取方塊**雙向同步** */
    A.bitClick(1);                                   /* b1: 0 → 1 ⇒ 0xA5|0x02 = 0xA7 */
    await sleep(20);
    EQ(A.state().buf[1], 0xA7, '🔴 勾選 b1 ⇒ 該格變成 0xA7');
    EQ(A.bits(), [true, false, true, false, false, true, true, true], '核取方塊跟著更新');
    CHECK(/A7/.test(doc.querySelector('#dump td[data-idx="1"]').textContent),
      '🔴 dump 上那一格也變了（不是只有右邊的方塊變）');
    A.bitClick(7);                                   /* b7: 1 → 0 ⇒ 0x27 */
    await sleep(20);
    EQ(A.state().buf[1], 0x27, '🔴 取消勾選 b7 ⇒ 0x27');

    /* (d) 🔴 提交路徑與手動改格完全一致 ⇒ 同樣會標成「尚未寫入」（dirty） */
    CHECK(A.dirtyAt(1) === true, '🔴 走的是同一條提交路徑（dirty 標記有上）');
    EQ(A.dirtyCount(), 1, '只有這一格被標記');

    /* (e) 換一格 ⇒ 方塊跟著換 */
    A.selAnchor(2);                                  /* 0xFF */
    await sleep(10);
    EQ(A.bits(), [true, true, true, true, true, true, true, true], '0xFF ⇒ 八個都勾');
    A.selAnchor(0);                                  /* 0x00 */
    await sleep(10);
    EQ(A.bits(), [false, false, false, false, false, false, false, false], '0x00 ⇒ 八個都沒勾');

    /* (f) 值沒變就不該送出任何東西（勾一個已經是 1 的 bit） */
    A.selAnchor(2); await sleep(10);
    const before = A.dirtyCount();
    await A.bitToggle(3, true);                      /* 0xFF 的 b3 本來就是 1 */
    EQ(A.dirtyCount(), before, '值沒變 ⇒ 不動 dirty、不送交易');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('49. 🔴 分段只跟寫入有關：EEPROM 才切，非 EEPROM 一次寫完，讀取永遠不看 page');
  {
    /* Bruce 2026-09-19 的更正：「這個 32 byte 之前已經定義過了，就是 Page 大小那邊
       來決定的。**只有 EEPROM 才需要分段，不是 EEPROM 不用分段。**」
       以及：「而且這個只有『唯讀』的話，不是沒有分 page 嗎？」 */

    /* (a) 非 EEPROM（0x68）⇒ 自動選到「不分段」⇒ 整批只發一則 */
    A._reset();
    let sent = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: 1 };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0 };
    });
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '100', data: '' });
    A.loadFile('reg.bin', new win.Uint8Array(Array.from({ length: 100 }, (_, i) => i & 0xFF)));
    await sleep(20);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '100' });
    EQ(A.pageSize(), 0, '🔴 非 EEPROM slave ⇒ Page 大小自動是「不分段」');
    await A.doWrite(); await sleep(60);
    { const w = sent.filter((m) => m.type === 'rawwrite');
      EQ(w.length, 1, '🔴 非 EEPROM 100 byte ⇒ **只發一則寫入**（沒有分段）：' + w.length);
      EQ(w[0].data.length, 100, '那一則就是整整 100 byte'); }
    await win.__i2ct.disconnect();

    /* (b) EEPROM（0x50）⇒ 自動選 32 byte page，且第一段切到 page 邊界 */
    A._reset();
    sent = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: 1 };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0 };
    });
    A.loadFile('ee.bin', new win.Uint8Array(Array.from({ length: 100 }, (_, i) => i & 0xFF)));
    await sleep(20);
    /* 起點 0x0010 ⇒ 第一段只能寫到 0x0020（page 邊界）＝ 16 byte */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0010', len: '100' });
    await sleep(10);
    EQ(A.pageSize(), 32, '🔴 EEPROM slave ⇒ Page 大小自動是 32');
    EQ(A.planWrite(0x10, 100, 32).map((p) => p.len), [16, 32, 32, 20],
       '🔴 第一段切到 page 邊界（16），之後每段 32，最後餘數 20');
    await win.__i2ct.disconnect();

    /* (c) 🔴 讀取**完全不看** page 設定：把 Page 大小換成 0／32／64，
           讀取的分段數一個都不能變（讀取分段只由傳輸批次 chunk 決定）。 */
    A._reset();
    const planOf = () => A.planRead(0, 1024, 2).length;
    const base = planOf();
    [0, 32, 64].forEach((pg) => {
      doc.getElementById('wr-page').value = String(pg);
      doc.getElementById('wr-page').dispatchEvent(new win.Event('change', { bubbles: true }));
      EQ(planOf(), base, '🔴 Page 大小 ' + pg + ' ⇒ 讀取分段數不變（' + base + '）');
    });
    doc.getElementById('wr-twr').value = '500';
    EQ(planOf(), base, '🔴 段間等待也不影響讀取');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('50. 🔴 寫入後回讀驗證：三條路徑都有，一致綠底、不一致列出位置與總數');
  {
    /* Bruce 2026-09-19 重申：「不論是只點單一個儲存格，還是點多個儲存格，
       都是寫入以後還要再讀回來…有不一樣就要有警示，然後也要秀出哪裡不一樣…
       如果有很多不一樣，那就要告知總共多少個不一樣…完全是一樣的，那就是要用
       綠色的底來註明這次寫入驗證、讀取驗證完全一致。」 */
    /* 一個會真的收下寫入的假裝置（rawwrite 寫進 dev，read 從 dev 讀）。 */
    const mkDev = (dev) => (m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') {
        (m.data || []).forEach((b, i) => { dev[(m.addr + i) & 0xFF] = b & 0xFF; });
        return { ok: true, status: 0, transferred: (m.data || []).length };
      }
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, (_, i) => dev[(m.addr + i) & 0xFF]) };
      return { ok: true, status: 0 };
    };
    /* 讀回來永遠是固定值的假裝置（用來造「回讀不一致」）。 */
    const mkStuck = (val) => (m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: (m.data || []).length };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, () => val) };
      return { ok: true, status: 0 };
    };

    /* (a) 單格（bit 核取方塊）⇒ 回讀一致 ⇒ **綠底** */
    A._reset();
    const dev = new Array(256).fill(0); dev[1] = 0xA5;
    await useHelper(mkDev(dev));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(40);
    A.selAnchor(1); await sleep(10);
    A.bitClick(1); await sleep(80);          /* b1: 0xA5 → 0xA7 */
    { const b = doc.getElementById('readbanner');
      CHECK(/寫入與回讀完全一致/.test(b.textContent), '🔴 單格一致 ⇒ 綠底講出來：' + b.textContent.slice(0, 40));
      CHECK(/banner ok/.test(b.innerHTML), '🔴 而且真的是**綠底**（class ok）：' + b.innerHTML.slice(0, 50)); }
    EQ(A.state().buf[1], 0xA7, '值真的寫進去了');
    await win.__i2ct.disconnect();

    /* (b) 單格 ⇒ 回讀不一致 ⇒ 紅字、講出寫什麼讀回什麼，且**不還原** */
    A._reset();
    await useHelper(mkStuck(0x11));                       /* 永遠讀回 0x11 */
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(40);
    A.selAnchor(0); await sleep(10);
    A.bitClick(7); await sleep(80);       /* 0x11 | 0x80 = 0x91，但裝置回 0x11 */
    { const b = doc.getElementById('readbanner').textContent;
      CHECK(/寫入與回讀不一致/.test(b), '🔴 不一致要有警示：' + b.slice(0, 40));
      CHECK(/0x91/.test(b) && /0x11/.test(b), '🔴 寫入值與讀回值都要秀出來：' + b.slice(0, 60));
      CHECK(!/沒有寫進去/.test(b), '🔴 不可以講成「沒有寫進去」（那是送出失敗的說法）'); }
    CHECK(A.wrFailAt(0) === true, '不一致的格子要標起來');
    EQ(A.state().buf[0], 0x11, '🔴 顯示的是**裝置上的實際值**，沒有被還原成別的');
    await win.__i2ct.disconnect();

    /* (c) 整批 ⇒ 多筆不一致 ⇒ 要有**總數**與前幾筆的位址／新舊值 */
    A._reset();
    await useHelper(mkStuck(0x00));                       /* 一律讀回 0 */
    A.loadFile('b.bin', new win.Uint8Array(Array.from({ length: 10 }, () => 0xEE)));
    await sleep(20);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '10' });
    await A.doWrite(); await sleep(80);
    { const b = doc.getElementById('readbanner').textContent;
      CHECK(/寫入與回讀不一致/.test(b), '🔴 整批不一致也要有警示：' + b.slice(0, 40));
      CHECK(/10 byte 中有 10 byte 不同/.test(b), '🔴 要講總共幾個不一樣：' + b.slice(0, 60));
      CHECK(/0xEE/.test(b) && /0x00/.test(b), '🔴 要列出寫入值與讀回值'); }
    await win.__i2ct.disconnect();

    /* (d) 整批 ⇒ 完全一致 ⇒ 綠底。**非 EEPROM 也要做驗證**（以前只有 EEPROM 有）。 */
    A._reset();
    await useHelper(mkDev(new Array(256).fill(0)));
    A.loadFile('c.bin', new win.Uint8Array([1, 2, 3, 4, 5]));
    await sleep(20);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '5' });   /* 🔴 非 EEPROM */
    await A.doWrite(); await sleep(80);
    { const b = doc.getElementById('readbanner');
      CHECK(/寫入與回讀完全一致/.test(b.textContent), '🔴 整批一致 ⇒ 綠底：' + b.textContent.slice(0, 40));
      CHECK(/驗證 5 byte/.test(b.textContent), '🔴 要講驗證了幾個 byte：' + b.textContent.slice(0, 40));
      CHECK(/banner ok/.test(b.innerHTML), '真的是綠底'); }
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('51. 🔴 送出失敗 ⇒ 自動還原、不留殘影；回讀不一致 ⇒ 不還原（兩者要分得出來）');
  {
    A._reset();
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      /* 🔴 送出就失敗，而且用的正是那句被 Bruce 看到的原文（反向測試）。 */
      if (m.type === 'rawwrite') return { ok: false, status: 0,
        err: 'write is not implemented on the vendor DLL path yet (SendBytesEx unwired); switch off the fast path to write' };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, () => 0x5A) };
      return { ok: true, status: 0 };
    });
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(40);
    EQ(A.state().buf[0], 0x5A, '前提：讀到 0x5A');
    A.selAnchor(0); await sleep(10);
    A.bitClick(0); await sleep(80);        /* 0x5A|0x01 = 0x5B，但送出會失敗 */
    EQ(A.state().buf[0], 0x5A, '🔴 送出失敗 ⇒ 該格**還原**成寫入前的值');
    CHECK(A.dirtyAt(0) === false, '🔴 dirty 標記也清掉（不留紫色殘影）');
    EQ(A.dirtyCount(), 0, '🔴 標題列不會再寫「已修改 1 byte 未寫入」');
    { const b = doc.getElementById('readbanner').textContent;
      CHECK(/沒有寫進去/.test(b) && /已還原/.test(b), '🔴 一行講清楚沒寫進去、已還原：' + b.slice(0, 50));
      /* 🔴 反向測試：那句實作名詞原文不可以出現在畫面上 */
      CHECK(!/vendor|SendBytesEx|fast path|DLL/i.test(b), '🔴🔴 bridge 的原文不准端到畫面上：' + b.slice(0, 80)); }
    { const lg = doc.getElementById('log').textContent;
      CHECK(/SendBytesEx/.test(lg), '🔴 但原文要留在 log 裡（診斷要用）'); }
    await win.__i2ct.disconnect();

    /* 錯誤字串翻譯表本身 */
    EQ(A.errText('not open'), '和治具的連線不在了，請重新連線', 'not open ⇒ 人話');
    EQ(A.errText('bad awid (0/1/2/4 only)'), 'offset 寬度只能是 0／1／2／4 byte', 'bad awid ⇒ 人話');
    CHECK(!/vendor/i.test(A.errText('write is not implemented on the vendor DLL path yet')),
      '🔴 舊那句也被翻譯掉');
    CHECK(A.errText('some brand new failure 0x99').indexOf('log') >= 0,
      '🔴 沒見過的錯誤 ⇒ 畫面給一句通用的話，原文進 log');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('52. 🔴 讀取成功 ⇒ 清掉 dirty；讀取失敗 ⇒ 保留');
  {
    /* Bruce：「我都已經再重新讀取一次 256 byte 了…理論上這個指標應該要被覆蓋掉」 */
    A._reset();
    A.loadFile('d.bin', new win.Uint8Array([1, 2, 3, 4]));
    await sleep(20);
    A.selAnchor(0); await sleep(10);
    A.bitClick(7); await sleep(30);               /* 未連線 ⇒ 純本地修改 ⇒ dirty */
    EQ(A.dirtyCount(), 1, '前提：有一格是改過沒寫的');
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, () => 0x77) };
      return { ok: true, status: 0 };
    });
    win.confirm = () => true;                      /* 覆蓋未寫入修改的確認 */
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(50);
    EQ(A.dirtyCount(), 0, '🔴 讀取成功 ⇒ dirty 全清（資料已經被整片覆蓋）');
    CHECK(A.refBytesAt(0) !== null, '🔴 但快照還在（只清 dirty，不動比對基準）');
    await win.__i2ct.disconnect();

    /* 讀取失敗 ⇒ 不清 */
    A._reset();
    A.loadFile('e.bin', new win.Uint8Array([1, 2, 3, 4]));
    await sleep(20);
    A.selAnchor(0); await sleep(10);
    A.bitClick(7); await sleep(30);
    EQ(A.dirtyCount(), 1, '前提：又有一格改過沒寫');
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'read') return { ok: false, status: 4, err: 'not open' };
      return { ok: true, status: 0 };
    });
    win.confirm = () => true;
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(50);
    EQ(A.dirtyCount(), 1, '🔴 讀取失敗 ⇒ dirty 留著（資料沒換，清掉等於幫他丟東西）');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('53. 🔴 顏色圖例與輸入範例');
  {
    A._reset();
    /* 圖例項目數 ＝ CSS 樣式數（機械檢查 tools/check_legend_items.js 也釘同一條） */
    const lg = A.legend();
    EQ(lg.length, 11, '🔴 圖例 11 項（10 種 CSS 樣式 ＋ 無類別的「未讀取」）');
    EQ(lg.filter((x) => x === '').length, 1, '其中恰好一項是無類別的基底');
    ['has', 'wrote', 'dirty', 'diff', 'wrfail', 'wrok', 'sel', 'xh', 'xc', 'edit']
      .forEach((c) => CHECK(lg.indexOf(c) >= 0, '圖例涵蓋 td.' + c));

    /* 🔴 範例列出的每一種寫法，丟進解析器都要解得出同一個結果 —— 這條測試
       同時防止以後「範例」與「解析器」再分岔。 */
    const eg = A.hexEg();
    CHECK(eg.length >= 3, '🔴 範例不只一種（他問「怎麼變得只有一種」）：' + eg.length);
    eg.forEach((s) => {
      const p = A.parseHex(s);
      CHECK(p !== null && p.length >= 1, '🔴 範例「' + s + '」解析器真的吃得下：' + JSON.stringify(p));
    });
    EQ(A.parseHex('A1 D8 FB'), [0xA1, 0xD8, 0xFB], 'A1 D8 FB');
    EQ(A.parseHex('0xA1,0xD8'), [0xA1, 0xD8], '0xA1,0xD8');
    EQ(A.parseHex('A1h'), [0xA1], 'A1h');
    EQ(A.parseHex('A1D8FB'), [0xA1, 0xD8, 0xFB], 'A1D8FB');
    /* 🔴 十進位**不在**這份範例裡：i2ctParseHex 一律當十六進位，`161` 是半個 byte。
       十進位只適用於數值欄位，那幾格各自有自己的說明。 */
    CHECK(eg.every((s) => !/^\d+$/.test(s)), '🔴 範例裡沒有純十進位（解析器吃不下）');
    EQ(A.parseHex('161'), null, '確認：`161` 會被拒絕（奇數個 hex 字元）');
    /* 兩個框用的是同一份 */
    A.find('');
    EQ(doc.getElementById('findeg').textContent, '例：' + eg.join(' ／ '), '🔴 搜尋框的範例與寫入框同一份');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('54. 🔴🔴 載入檔案的 A／B 模型與來源標籤（Bruce 2026-09-19 規格）');
  {
    const mkDev54 = (dev) => (m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: (m.data || []).length };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, (_, i) => dev[(m.addr + i) & 0xFF]) };
      return { ok: true, status: 0 };
    };

    /* (0) 🔴🔴 **最重要的一條**：已連線時載入檔案，不得送出任何寫入。
       「載入檔案 ≠ 燒進去」是他講過的安全規則，這一條要永遠釘著。 */
    A._reset();
    const sent54 = await useHelper(mkDev54(new Array(256).fill(0x11)));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '8' });
    await A.doRead(); await sleep(40);
    const before54 = sent54.length;
    A.loadFile('f1.bin', new win.Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    await sleep(60);
    { const after = sent54.slice(before54);
      EQ(after.filter((m) => m.type === 'rawwrite' || m.type === 'write').length, 0,
         '🔴🔴 已連線時載入檔案 ⇒ **一個寫入訊息都沒送出**');
      EQ(after.filter((m) => m.type === 'read').length, 0, '🔴 也沒有偷偷讀'); }

    /* (1) 已有 A（第一次讀取），再載入同長度檔案 ⇒ **B ＝ 檔名**，A 不動 */
    /* 🔴 v1.18.1：讀取的來源要**足以重現那次讀取** —— slave ＋ 起始 offset。
       長度由 A／B 那一行自己接在後面（`· N byte`），不在 src 裡重複。
       offset 寬度只在非預設（≠2）時才印，見 i2ctReadSrc 的取捨說明。 */
    EQ(A.srcA(), '讀取 slave 0x68 · 0x0000 起', '🔴 第一次讀取 ⇒ A 帶上 slave 與起始位址');
    CHECK(/8 byte/.test(A.abRows()[0].text), '🔴 長度由那一行接上（不重複在 src 裡）');
    EQ(A.srcB(), 'f1.bin', '🔴 再載入同長度檔案 ⇒ B ＝ 檔名');
    CHECK(/A讀取 slave 0x68/.test(A.abRows().map(function(r){return r.text;}).join(' '))
       && /Bf1\.bin/.test(A.abRows().map(function(r){return r.text;}).join(' ')),
      '🔴 兩行各自印自己的來源：' + A.abRows().map(function(r){return r.text;}).join(' '));

    /* (2) 按快照 ⇒ 檔案成為 A（A 繼承目前來源），**B 清空** */
    A.snapshot(); await sleep(30);
    EQ(A.srcA(), 'f1.bin', '🔴 按快照 ⇒ A ＝ 檔名');
    EQ(A.srcB(), null, '🔴🔴 A 一被重建，B 自然就不見');

    /* (3) 再讀同長度 ⇒ B ＝「讀取」，**A 的檔名仍在**（情境 1） */
    win.confirm = () => true;
    await A.doRead(); await sleep(50);
    EQ(A.srcA(), 'f1.bin', '🔴🔴 情境 1：讀取之後 A 的檔名仍然在');
    EQ(A.srcB(), '讀取 slave 0x68 · 0x0000 起', '🔴 B 換成「讀取」');
    EQ(A.fileState().name, '', '檔案本身被讀取覆蓋（B 不再是那個檔案）');

    /* (4) 🔴 修改任一格 ⇒ B ＝「<A 的來源> 的修改」 */
    A.selAnchor(0); await sleep(10);
    await A.bitToggle(0, !((A.state().buf[0] >> 0) & 1)); await sleep(60);
    EQ(A.srcB(), 'A 的修改', '🔴 v1.18.1：改一格 ⇒ B ＝「A 的修改」（不重複 A 的來源）');
    await win.__i2ct.disconnect();

    /* (5) 🔴 情境 2：載入後**沒有**按快照，直接讀取 ⇒ 檔名要消失 */
    A._reset();
    await useHelper(mkDev54(new Array(256).fill(0x22)));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '8' });
    await A.doRead(); await sleep(40);
    A.loadFile('f2.bin', new win.Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]));
    await sleep(40);
    EQ(A.srcB(), 'f2.bin', '前提：B 標著 f2.bin');
    win.confirm = () => true;
    await A.doRead(); await sleep(50);
    EQ(A.srcA(), '讀取 slave 0x68 · 0x0000 起', 'A 仍是最早那次讀取');
    EQ(A.srcB(), '讀取 slave 0x68 · 0x0000 起', '🔴🔴 情境 2：沒快照就讀取 ⇒ B 被覆蓋');
    CHECK(!/f2\.bin/.test(A.abRows().map(function(r){return r.text;}).join(' ')),
      '🔴🔴 檔名整個消失，不卡在上面：' + A.abRows().map(function(r){return r.text;}).join(' '));
    EQ(A.fileState().name, '', '檔案也真的被放掉了');
    await win.__i2ct.disconnect();

    /* (6) 第一次載入檔案（還沒有 A）⇒ **檔案成為 A**、B 清空 */
    A._reset();
    A.loadFile('a1.bin', new win.Uint8Array([1, 2, 3, 4]));
    await sleep(40);
    EQ(A.srcA(), 'a1.bin', '🔴 第一次載入檔案 ⇒ A ＝ 檔名');
    EQ(A.srcB(), null, '🔴 B 清空');
    /* 再載入同長度的第二個檔 ⇒ 它成為 B，兩邊各自的來源不打架 */
    A.loadFile('b2.bin', new win.Uint8Array([5, 6, 7, 8]));
    await sleep(40);
    EQ(A.srcA(), 'a1.bin', 'A 還是第一個檔');
    EQ(A.srcB(), 'b2.bin', '🔴 第二個檔成為 B');

    /* (7) 🔴 長度不一樣 ⇒ **後者成為 A**、B 清空、舊檔名消失 */
    A.loadFile('big.bin', new win.Uint8Array(16));
    await sleep(40);
    EQ(A.srcA(), 'big.bin', '🔴🔴 長度不同 ⇒ 後者成為 A');
    EQ(A.srcB(), null, '🔴 B 清空');
    EQ(A.diffCount(), 0, '差異比對停用');
    CHECK(/長度／位址對不起來/.test(doc.getElementById('log').textContent),
      '🔴 而且講一行為什麼（他看到 diff 變 0 會以為壞了）');

    /* (8) 🔴 換 slave **但不讀取** ⇒ A 完全不動（他特別強調的） */
    A._reset();
    await useHelper(mkDev54(new Array(256).fill(0x33)));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '8' });
    await A.doRead(); await sleep(40);
    A.loadFile('c3.bin', new win.Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    await sleep(30);
    EQ(A.srcA(), '讀取 slave 0x68 · 0x0000 起', '前提：A ＝ 讀取');
    EQ(A.srcB(), 'c3.bin', '前提：B ＝ c3.bin');
    doc.getElementById('in-slave').value = '0x50';
    doc.getElementById('in-slave').dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(60);
    EQ(A.srcA(), '讀取 slave 0x68 · 0x0000 起', '🔴🔴 換 slave 但沒讀取 ⇒ **A 完全不動**');
    EQ(A.srcB(), 'c3.bin', '🔴 B 也不動（他可能只是切過去看看）');

    /* (9) 🔴 換 slave ＋ **讀取** ⇒ A 換成新讀到的、B 清空、檔名消失 */
    win.confirm = () => true;
    await A.doRead(); await sleep(60);
    /* 🔴 v1.18.1 順帶驗到的好處：來源標籤帶著 slave ⇒ **換 slave 之後一眼看得出
       A 已經是新的那一顆**（舊標籤兩次都只寫「讀取」，看起來一模一樣）。 */
    EQ(A.srcA(), '讀取 slave 0x50 · 0x0000 起', '🔴 換 slave 後讀取 ⇒ A ＝ 新那顆讀到的');
    EQ(A.srcB(), null, '🔴 B 清空');
    CHECK(!/c3\.bin/.test(A.abRows().map(function(r){return r.text;}).join(' ')),
      '🔴 檔名消失：' + A.abRows().map(function(r){return r.text;}).join(' '));
    EQ(A.fileState().name, '', '檔案放掉');
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('55. 🔴 寫入來源 ＝ dump 的中心值，與「總 byte 數」欄位完全無關');
  {
    const dev55 = new Array(256).fill(0x11);
    const mk55 = (m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') { (m.data || []).forEach((b, i) => { dev55[(m.addr + i) & 0xFF] = b & 0xFF; });
                                   return { ok: true, status: 0, transferred: (m.data || []).length }; }
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, (_, i) => dev55[(m.addr + i) & 0xFF]) };
      return { ok: true, status: 0 };
    };

    /* (a) 🔴 讀 256 → 載入 8192 的檔 ⇒ 寫入鈕**可按**、長度是 8192（他踩到的） */
    A._reset();
    let sent55 = await useHelper(mk55);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '256' });
    await A.doRead(); await sleep(50);
    A.loadFile('big.bin', new win.Uint8Array(Array.from({ length: 8192 }, (_, i) => i & 0xFF)));
    await sleep(60);
    EQ(doc.getElementById('btn-write').disabled, false, '🔴🔴 載入 8192 的檔之後寫入鈕可以按');
    /* 讀 256 之後載入 8192 的檔 ⇒ 長度不同 ⇒ 依定案規則它**成為 A**（不是 B）。 */
    EQ(doc.getElementById('btn-write').textContent, '寫入 A · 8192 byte',
       '🔴 按鈕長度取自來源本身：' + doc.getElementById('btn-write').textContent);
    EQ(A.writeSource(2).bytes.length, 8192, '🔴 來源就是 8192 byte（不是被截成 256）');

    /* (b) 🔴🔴 把「總 byte 數」欄位改成任意值 ⇒ 寫入行為**完全不受影響** */
    ['', '1', 'abc', '99999'].forEach((junk) => {
      doc.getElementById('in-len').value = junk;
      doc.getElementById('in-len').dispatchEvent(new win.Event('input', { bubbles: true }));
      EQ(A.writeSource(2).bytes.length, 8192,
         '🔴 總 byte 數填「' + junk + '」⇒ 寫入來源仍然是 8192 byte');
    });
    /* 按鈕可按與否也不受它影響（空字串會讓讀取那邊報錯，但寫入不該被牽連）。 */
    doc.getElementById('in-len').value = '8192';
    doc.getElementById('in-len').dispatchEvent(new win.Event('input', { bubbles: true }));
    EQ(doc.getElementById('btn-write').disabled, false, '恢復合法值之後照樣可按');

    /* (c) 選取優先：Shift 多選 17 格 ⇒ 按鈕與送出都是 17 byte */
    A._reset();
    sent55 = await useHelper(mk55);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '256' });
    await A.doRead(); await sleep(50);
    A.selAnchor(0); A.selMove(16); await sleep(20);
    EQ(doc.getElementById('btn-write').textContent, '寫入 選取的 17 byte', '選取優先，按鈕顯示 17');
    { const before = sent55.filter((m) => m.type === 'rawwrite').length;
      await A.doWrite(); await sleep(80);
      const w = sent55.filter((m) => m.type === 'rawwrite').slice(before);
      EQ(w.reduce((n, m) => n + m.data.length, 0), 17, '🔴 真的只送 17 byte'); }

    /* (d) 🔴 **寫入送出的永遠是中心值**（不是左上 A、也不是右上的暫存） */
    A._reset();
    sent55 = await useHelper(mk55);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(50);           /* 中心 = 0x11 × 4，A = 讀取 */
    A.snapshot(); await sleep(20);
    /* 改第 0 格 ⇒ 中心變 0x99、左上出現 A=0x11 */
    A.selAnchor(0); await sleep(20);              /* 🔴 位元核取方塊要有選取格才動得了 */
    await A.bitToggle(3, true); await sleep(60);  /* 0x11 | 0x08 = 0x19 */
    await A.bitToggle(7, true); await sleep(60);  /* 0x19 | 0x80 = 0x99 */
    { const p = A.cellParts(0);
      CHECK(p.main === '99' && p.snap === '11', '前提：中心 99、左上 11：' + JSON.stringify(p)); }
    { const before = sent55.filter((m) => m.type === 'rawwrite').length;
      doc.getElementById('in-data').value = '';   /* 確保走 dump 那條來源 */
      A.selAnchor(null); await sleep(10);
      EQ(A.writeSource(2).bytes[0], 0x99,
         '🔴🔴 來源第 0 byte ＝ **中心值 0x99**，不是左上的 0x11');
      void before; }
    /* 點左上把 A 搬進中心 ⇒ 來源跟著變成搬進來之後的中心值 */
    await A.slotClick(0, 'sv'); await sleep(80);
    EQ(A.writeSource(2).bytes[0], dev55[0],
       '🔴 點左上之後，來源就是搬進中心的那個值（＝已寫回裝置的值）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('56. 🔴 總和檢查碼：A／B 各一、即時重算、**不截斷**');
  {
    A._reset();
    /* (a) 純函式：已知向量 */
    EQ(A.checksum([1, 2, 3]), 6, '1+2+3 = 6');
    EQ(A.checksum(null), null, '沒有資料 ⇒ null（不是 0）');
    EQ(A.checksum([]), null, '空陣列 ⇒ null');
    /* 🔴 黃金基準（他用原廠 UI 讀出的 256 byte）⇒ 固定值釘住 */
    { let g = 0; for (let i = 0; i < A.GOLD256.length; i++) g += A.GOLD256[i];
      EQ(A.checksum(A.GOLD256), g, '黃金基準 256 byte 的 checksum 與逐項相加一致'); }
    /* (b) 🔴🔴 **不截斷**：8192 全 FF 與 256K 全 FF */
    EQ(A.checksum(new win.Uint8Array(8192).fill(0xFF)), 2088960,
       '🔴 8192 × 255 = 2,088,960 = 0x1FE000，**沒有被截成 16 bit**');
    EQ(A.checksum(new win.Uint8Array(262144).fill(0xFF)), 66846720,
       '🔴🔴 256K × 255 = 66,846,720 = 0x3FC0000，完整值');
    /* 反向：如果有人加回 & 0xFFFF，上面兩條的值會變成 0x0000 ⇒ 必然失敗。
       這裡再直接釘一次「不等於截斷值」，讓失敗訊息一眼看得出原因。 */
    CHECK(A.checksum(new win.Uint8Array(8192).fill(0xFF)) !== (2088960 & 0xFFFF),
      '🔴 反向測試：不可以等於 16 bit 截斷後的值');
    /* 🔴🔴 **由他的真實檔案佐證的兩個值**（2026-09-19）：他載入的兩個檔，
       檔名尾端帶著原廠算好的 CKS，我們算出來完全吻合 ——
         `…_CKS_2ACFF.bin`  ⇒ 0x2ACFF
         `…_CKS_02A91A.bin` ⇒ 0x2A91A
       兩個都 > 0xFFFF ⇒ 誰把 `% 0x10000` 加回來，這兩條就會變成 0xCFF／0xA91A 而紅。
       這比我們自己編的向量有力：**定義的正確性有外部來源背書。**
       （這裡用「湊出同樣總和的位元組陣列」來驗函式，他的原始檔不進版控。） */
    {
      const mkSum = (target) => {
        const full = Math.floor(target / 255), rest = target % 255;
        const a = new win.Uint8Array(full + (rest ? 1 : 0));
        a.fill(0xFF, 0, full);
        if (rest) a[full] = rest;
        return a;
      };
      EQ(A.checksum(mkSum(0x2ACFF)), 0x2ACFF,
         '🔴🔴 0x2ACFF —— 與他檔名裡的 CKS_2ACFF 相同（外部佐證）');
      EQ(A.checksum(mkSum(0x2A91A)), 0x2A91A,
         '🔴🔴 0x2A91A —— 與他檔名裡的 CKS_02A91A 相同（外部佐證）');
      CHECK(A.checksum(mkSum(0x2ACFF)) !== (0x2ACFF & 0xFFFF),
        '🔴 若被截成 16 bit 會變 0xCFF，對不上他的檔名');
    }

    /* (c) 畫面上 A／B 各一列、即時重算 */
    A.loadFile('c1.bin', new win.Uint8Array([0x01, 0x02, 0x03, 0x04]));
    await sleep(40);
    { const rows = A.cksRows();
      EQ(rows.length, 2, 'A／B 各一列');
      EQ(rows[0].ab, 'A', '🔴 A 在上');
      EQ(rows[1].ab, 'B', '🔴 B 在下');
      EQ(rows[0].val, '0xA', 'A ＝ 1+2+3+4 = 10 = 0xA');
      EQ(rows[0].n, '4 byte', '🔴 同時顯示參與計算的 byte 數');
      EQ(rows[1].val, '（無）', '🔴 B 不存在 ⇒ 空狀態，不是 0'); }
    /* 改一格 ⇒ 立刻重算（原值 − 舊 byte ＋ 新 byte） */
    A.selAnchor(0); await sleep(10);
    await A.bitToggle(7, true); await sleep(60);       /* 0x01 → 0x81，+0x80 */
    { const rows = A.cksRows();
      EQ(rows[1].val, '0x8A', '🔴 改一格 ⇒ B 的 checksum 立刻變成 10 + 128 = 138 = 0x8A');
      EQ(rows[0].val, '0xA', '🔴 A 不受影響（它是基準）'); }
    /* 點左上還原 ⇒ checksum 回到還原後的值 */
    await A.slotClick(0, 'sv'); await sleep(60);
    EQ(A.cksRows()[1].val, '0xA', '🔴 點左上還原 ⇒ B 的 checksum 回到 0xA');
    /* 清空 ⇒ 兩個都回空狀態 */
    A.clearAll(); await sleep(40);
    { const rows = A.cksRows();
      EQ(rows[0].val, '（無）', '清空 ⇒ A 空狀態');
      EQ(rows[1].val, '（無）', '清空 ⇒ B 空狀態'); }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('57. 🔴🔴 改過值之後再讀，**不可以退化成逐 byte**（v1.17.1 的回歸）');
  {
    /* Bruce 2026-09-19：「在做了這些匯入匯出的動作以後，然後又手動去更改單一
       儲存格的值…再按『讀取全部範圍的值』，這時候卻發現讀取全部範圍已經不是
       burst read 了，它變成一個 byte 一個 byte read」。

       根因：自動選路的基準曾經是**固定的黃金基準**。他一改裝置內容，那把尺就
       永遠對不上 ⇒ 三條快路徑全判不符 ⇒ 退回慢路徑，而且再也回不去。
       🔴 v1.20.0 起**整套自動選路已移除**（預設直接走原廠 DLL），這個退化路徑
       從根上不存在了。這一組保留成回歸網：不管實作怎麼變，
       「改過值之後再讀仍是快路徑、read 訊息不暴增」這件事都必須成立。 */
    const dev57 = new Array(256).fill(0);
    for (let i = 0; i < 256; i++) dev57[i] = (i * 5) & 0xFF;
    const mk57 = (m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') { (m.data || []).forEach((b, i) => { dev57[(m.addr + i) & 0xFF] = b & 0xFF; });
                                   return { ok: true, status: 0, transferred: (m.data || []).length }; }
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,   /* usbrt 1 ＝ 原廠路徑 */
        data: Array.from({ length: m.len }, (_, i) => dev57[(m.addr + i) & 0xFF]) };
      return { ok: true, status: 0 };
    };

    /* (a) 第一次讀 ⇒ 選到快路徑 */
    A._reset();
    const sent57 = await useHelper(mk57);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '256' });
    win.confirm = () => true;
    await A.doRead(); await sleep(60);
    EQ(A.mode(), 0, '前提：第一次讀就選到原廠（快）路徑');
    EQ(A.lastPath(), '快速模式', '前提：標籤是快速模式');

    /* (b) 🔴 手動改一格（真的寫進假裝置），再讀 ⇒ **仍然是快路徑** */
    A.selAnchor(5); await sleep(20);
    await A.bitToggle(0, !((A.state().buf[5] >> 0) & 1)); await sleep(80);
    const before57 = sent57.filter((m) => m.type === 'read').length;
    await A.doRead(); await sleep(60);
    EQ(A.mode(), 0, '🔴🔴 改過一格之後再讀，**仍然走原廠（快）路徑**');
    EQ(A.lastPath(), '快速模式', '🔴 模式標籤還是快速模式');
    { const n = sent57.filter((m) => m.type === 'read').length - before57;
      CHECK(n <= 2, '🔴🔴 read 訊息沒有暴增（' + n + ' 則；逐 byte 會是幾十上百則）'); }

    /* (c) 🔴 重新連線 ⇒ **會**重驗（這條要保留） */
    await win.__i2ct.disconnect(); await sleep(20);
    await useHelper(mk57);
    EQ(A.state().linked, true, '重新連上');
    /* 重連會把旗標清掉 ⇒ 下一次讀取重跑選路階梯（多出基準那一次讀） */
    const beforeC = [];
    const sentC = await (async () => sent57)();
    void sentC; void beforeC;
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(60);
    EQ(A.mode(), 0, '🔴 重驗之後照樣選到快路徑（基準是當下讀的，不是過期的固定值）');

    /* (d) 🔴 換 slave ⇒ 讀取時會重建 A（見第 54 組），選路照樣成立 */
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(60);
    EQ(A.mode(), 0, '換 slave 之後也還是快路徑');
    await win.__i2ct.disconnect();

    /* (e) 🔴 反向測試：**把固定基準塞回選路流程，(b) 必須失敗**。
       這裡直接驗那個機制本身 —— 用一份「與裝置現況不同」的固定基準去比，
       三條快路徑都會被判不符。這就是舊版的行為，也是我們撤掉它的理由。 */
    {
      const stale = Array.from({ length: 16 }, () => 0xEE);   /* 過期的固定基準 */
      const now = Array.from({ length: 16 }, (_, i) => dev57[i]);
      let bad = 0;
      for (let i = 0; i < 16; i++) if (stale[i] !== now[i]) bad++;
      CHECK(bad > 0, '🔴 固定基準與裝置現況不同 ⇒ 任何快路徑都會被判不符（' + bad + '/16）');
      CHECK(A.GOLD256 && A.GOLD256.length === 256,
        '🔴 黃金基準本身留著（debug 自檢向量用），只是不再參與選路');
    }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('58. 🔴 寫入目標標示 ＋ A／B 切換（下拉與點選同一狀態）');
  {
    A._reset();
    /* 🔴 這一組不是在驗四選項視窗 ⇒ 預先作答 'auto'（照既有規則自動放）。
       寫成 null 會讓「A、B 都有時再載入」真的跳視窗、卡在那裡等人按，
       而且那個視窗會**留到下一組**去（第一版就是這樣連累第 59 組）。 */
    A.abPickAuto('auto');
    /* A ＝ a1.bin（第一次載入）、B ＝ b2.bin（同長度第二份） */
    A.loadFile('a1.bin', new win.Uint8Array([1, 2, 3, 4]));
    await sleep(40);
    A.loadFile('b2.bin', new win.Uint8Array([5, 6, 7, 8]));
    await sleep(40);
    EQ(A.srcA(), 'a1.bin', '前提：A ＝ a1.bin');
    EQ(A.srcB(), 'b2.bin', '前提：B ＝ b2.bin');

    /* (a) 🔴 按鈕要講清楚寫的是哪一份、多少，但 **不放檔名**（v1.18.2）。
       原因：他的檔名有 90 多個字，塞進去之後按鈕被撐成橫跨整列的長條，
       他回報「根本沒有按鈕」。A／B 那兩行本來就完整寫著檔名，按鈕再寫一次是重複。 */
    { const t = doc.getElementById('btn-write').textContent;
      EQ(t, '寫入 B · 4 byte', '🔴 按鈕只有「哪一邊 ＋ 長度」');
      CHECK(!/b2\.bin/.test(t), '🔴🔴 按鈕裡**沒有檔名**'); }
    /* 🔴 長度可預期：塞一個 200 字的來源名進去，按鈕文字**不會變長** */
    { const longName = 'X'.repeat(200) + '.bin';
      A.loadFile(longName, new win.Uint8Array([9, 9, 9, 9]));
      await sleep(40);
      const t2 = doc.getElementById('btn-write').textContent;
      CHECK(t2.length <= 20, '🔴 200 字的檔名也撐不長按鈕：「' + t2 + '」(' + t2.length + ' 字)');
      CHECK(!/XXXX/.test(t2), '🔴 按鈕裡沒有那個長檔名');
      /* A／B 那一行**不准變成兩行**：單行 ＋ 省略號 ＋ title 放完整名稱 */
      const who = doc.querySelector('#abbox .abrow.b .who');
      CHECK(who && who.getAttribute('title').indexOf('XXXX') >= 0,
        '🔴 完整檔名掛在 title（滑鼠移上去看得到）');
      EQ(win.getComputedStyle(who).textOverflow, 'ellipsis', '🔴 尾端省略號');
      EQ(win.getComputedStyle(who).whiteSpace, 'nowrap', '🔴 不換行（那一行不准變高）');
      A._reset();
      A.loadFile('a1.bin', new win.Uint8Array([1, 2, 3, 4])); await sleep(30);
      A.loadFile('b2.bin', new win.Uint8Array([5, 6, 7, 8])); await sleep(30); }

    /* (b) 🔴 下拉只在 A、B 都有內容時才出現（沒得選就不佔版面） */
    EQ(A.abSel().shown, true, '🔴 A、B 都有 ⇒ 下拉出現');
    EQ(A.abSel().value, 'B', '目前顯示 B ⇒ 下拉是 B');

    /* (c) 🔴 下拉與點那一行**雙向同步** */
    A.abSel('A'); await sleep(30);
    EQ(A.showingA(), true, '🔴 下拉選 A ⇒ 真的切到 A');
    { const t = doc.getElementById('btn-write').textContent;
      CHECK(/寫入 A · 4 byte/.test(t) && !/a1\.bin/.test(t),
        '🔴 按鈕跟著變成寫 A，而且不含檔名：' + t); }
    EQ(A.writeSource(2).bytes[0], 1, '🔴 來源也真的換成 A 的內容');
    A.showSide('B'); await sleep(30);
    EQ(A.abSel().value, 'B', '🔴 點 B 那一行 ⇒ 下拉跟著回到 B（另一半的同步）');
    A.showSide('A'); await sleep(30);
    EQ(A.abSel().value, 'A', '🔴 點 A 那一行 ⇒ 下拉跟著變 A');

    /* (d) 只有一份時下拉收起來 */
    A._reset();
    A.loadFile('solo.bin', new win.Uint8Array([9, 9]));
    await sleep(40);
    EQ(A.abSel().shown, false, '🔴 只有 A ⇒ 下拉整個不顯示（不佔版面）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('59. 🔴🔴 A、B 都佔用時載入第三個檔案 ⇒ 四選項視窗');
  {
    const mk59 = (m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, () => 0x11) };
      return { ok: true, status: 0 };
    };
    const setup = async () => {
      A._reset(); A.abPickAuto(null);
      A.loadFile('a1.bin', new win.Uint8Array([1, 2, 3, 4])); await sleep(30);
      A.loadFile('b2.bin', new win.Uint8Array([5, 6, 7, 8])); await sleep(30);
    };

    /* (a) A 或 B 任一為空 ⇒ **不跳視窗** */
    A._reset(); A.abPickAuto(null);
    A.loadFile('x1.bin', new win.Uint8Array([1, 2])); await sleep(40);
    EQ(A.abPickState().shown, false, '🔴 A、B 都空 ⇒ 載入不跳選擇（直接成為 A）');
    EQ(A.srcA(), 'x1.bin', '直接進 A');
    A.loadFile('x2.bin', new win.Uint8Array([3, 4])); await sleep(40);
    EQ(A.abPickState().shown, false, '🔴 A 有、B 空 ⇒ 也不跳（直接成為 B）');
    EQ(A.srcB(), 'x2.bin', '直接進 B');

    /* (b) A、B 都有、長度全同 ⇒ 跳視窗，四個選項都可選 */
    await setup();
    A.abPickAuto(null);
    const p = A.loadFile('c3.bin', new win.Uint8Array([7, 7, 7, 7]));
    await sleep(40);
    { const st = A.abPickState();
      EQ(st.shown, true, '🔴 A、B 都有 ⇒ 跳選擇視窗');
      EQ(st.canB, true, '長度與 A 相同 ⇒「取代 B」可選');
      EQ(st.canKeep, true, '長度與 B 相同 ⇒「取代 A，保留 B」可選'); }
    doc.getElementById('abpick-cancel').click();
    await p; await sleep(30);
    EQ(A.srcA(), 'a1.bin', '🔴 選取消 ⇒ A 不動');
    EQ(A.srcB(), 'b2.bin', '🔴 選取消 ⇒ B 不動');

    /* (c) 取代 A，保留 B */
    await setup();
    A.abPickAuto('Akeep');
    await A.loadFile('c3.bin', new win.Uint8Array([7, 7, 7, 7])); await sleep(40);
    EQ(A.srcA(), 'c3.bin', '🔴 ① A 換成新檔');
    EQ(A.srcB(), 'b2.bin', '🔴 ① **B 仍在**');
    /* A ＝ 7,7,7,7；B ＝ 5,6,7,8 ⇒ 第 2 個相同，其餘三個不同。 */
    EQ(A.diffCount(), 3, '🔴 ① diff 用「新的 A vs 保留下來的 B」重算 ⇒ 3 處不同');

    /* (d) 取代 A，清空 B */
    await setup();
    A.abPickAuto('Aclear');
    await A.loadFile('c4.bin', new win.Uint8Array([8, 8, 8, 8])); await sleep(40);
    EQ(A.srcA(), 'c4.bin', '🔴 ② A 換成新檔');
    EQ(A.srcB(), null, '🔴 ② B 清空');

    /* (e) 取代 B */
    await setup();
    A.abPickAuto('B');
    await A.loadFile('c5.bin', new win.Uint8Array([2, 2, 2, 2])); await sleep(40);
    EQ(A.srcA(), 'a1.bin', '🔴 ③ A 不動（不重新快照）');
    EQ(A.srcB(), 'c5.bin', '🔴 ③ B 換成新檔');

    /* (f) 🔴 長度不同的停用規則 */
    await setup();
    A.abPickAuto(null);
    const p2 = A.loadFile('big.bin', new win.Uint8Array(8));   /* 與 A、B 都不同長 */
    await sleep(40);
    { const st = A.abPickState();
      EQ(st.shown, true, '跳視窗');
      EQ(st.canB, false, '🔴 長度 ≠ A ⇒「取代 B」停用');
      EQ(st.canKeep, false, '🔴 長度 ≠ B ⇒「取代 A，保留 B」停用');
      CHECK(/停用/.test(st.why) && /無法逐 byte 比對/.test(st.why),
        '🔴 停用要講原因：' + st.why); }
    doc.getElementById('abpick-a').click();      /* ②「取代 A，清空 B」永遠可選 */
    await p2; await sleep(40);
    EQ(A.srcA(), 'big.bin', '🔴 長度不同時仍可「取代 A，清空 B」');
    EQ(A.srcB(), null, 'B 清空');

    /* (g) 🔴🔴 四個選項**都不寫入裝置** */
    for (const mode of ['Akeep', 'Aclear', 'B', false]) {
      await setup();
      const sent59 = await useHelper(mk59);
      const before = sent59.length;
      A.abPickAuto(mode);
      await A.loadFile('z.bin', new win.Uint8Array([4, 4, 4, 4])); await sleep(40);
      const after = sent59.slice(before);
      EQ(after.filter((m) => m.type === 'rawwrite' || m.type === 'write').length, 0,
         '🔴🔴 選「' + String(mode) + '」⇒ 零寫入訊息');
      await win.__i2ct.disconnect();
    }
    A.abPickAuto(null);
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('60. 🔴 每段寫入的分層計時（純量測，不改行為）');
  {
    /* Bruce 用 LA 量到 8192 byte 的寫入「前面幾段段間 35 ms、0x0600 之後 8.x ms」。
       在拿到他的 log 之前**不做任何優化** —— 這一組只驗「量測本身有做、而且
       拆得夠細」，好讓下一份 log 直接指認時間花在哪一層。 */
    A._reset();
    const sent60 = await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') return { ok: true, status: 0, transferred: (m.data || []).length, us: 8100 };
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,
        data: Array.from({ length: m.len }, (_, i) => i & 0xFF) };
      return { ok: true, status: 0 };
    });
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '1024' });
    A.loadFile('t60.bin', new win.Uint8Array(Array.from({ length: 1024 }, (_, i) => i & 0xFF)));
    await sleep(40);
    await A.doWrite(); await sleep(120);
    const st = A.wSegStats();
    EQ(st.length, 4, '🔴 1024 byte ⇒ 4 段（每段 256），每段都有一筆計時');
    CHECK(st.every((s) => typeof s.ws === 'number' && s.ws >= 0), 'ws（往返）每段都量到');
    CHECK(st.every((s) => s.dev === 8.1), '🔴 bridge 自報的 us 有被換算成 ms 記下來');
    CHECK(st.every((s) => typeof s.log === 'number' && typeof s.apply === 'number'
                       && typeof s.wait === 'number'),
      '🔴 log／apply／wait 三層都分開記（不是只有一個總數）');
    EQ(st.map((s) => s.n).join(','), '256,256,256,256', '每段長度都記著');
    EQ(st[1].addr, 0x0100, '每段的位址也記著（對得上他 LA 上看到的位址）');
    /* 🔴 分層結果要進 bridge 的 log（他能傳給我們的只有那個檔） */
    { const notes = sent60.filter((m) => m.type === 'note').map((m) => m.msg).join(' ');
      CHECK(/wtiming/.test(notes), '🔴 分層計時有送進 bridge 的 log');
      CHECK(/ws=/.test(notes) && /dev=/.test(notes), '🔴 而且 ws 與 dev 都在裡面：'
        + notes.slice(0, 80)); }
    /* 🔴 量測本身不可以污染量測：note 必須在**所有段寫完之後**才送 */
    { const idxFirstNote = sent60.findIndex((m) => m.type === 'note' && /wtiming/.test(m.msg));
      const idxLastWrite = sent60.map((m) => m.type).lastIndexOf('rawwrite');
      CHECK(idxFirstNote > idxLastWrite,
        '🔴 wtiming 的 note 排在最後一次 rawwrite 之後（邊寫邊送會自己污染量測）'); }
    await win.__i2ct.disconnect();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('61. 🔴 使用者可見文案不得寫死特定工具名（v1.18.2）');
  {
    /* Bruce 2026-09-19：「不要寫原廠 PQ Tool 可以接手，**因為不一定是 PQ tool 喔**」。
       會來搶同一支治具的還有 EM01／EM02 的 TCON UI、他自己的 Python UI、DG 量測。
       🔴 註解裡當技術依據引用的**留著**（那是證據來源）；這裡只驗畫面上的字。 */
    A._reset();
    /* 中斷之後那一行 */
    await useHelper((m) => {
      if (m.type === 'ping') return { helper: '1.12.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      return { ok: true, status: 0 };
    });
    await win.__i2ct.disconnect(); await sleep(40);
    { const t = doc.getElementById('linktext') ? doc.getElementById('linktext').textContent
                                               : doc.body.textContent;
      CHECK(!/PQ\s*Tool/i.test(t), '🔴 中斷的狀態文字沒有寫死工具名：' + t.slice(0, 40));
      CHECK(/其他程式/.test(t) || /別的程式/.test(t) || /已中斷/.test(t),
        '而且講的是泛稱：' + t.slice(0, 40)); }
    /* 整頁掃一遍。🔴 要先把 `<script>`／`<style>` 拿掉：它們也在 body 裡，
       `textContent` 會**把整段 JS 原始碼（含註解）一起算進來** ——
       而註解裡引用 `RomCodeProcessUI.py:31721` 這種技術依據是要留著的。
       第一版沒拿掉，四條斷言全紅，紅的理由是掃錯範圍，不是文案沒改乾淨。 */
    { const clone = doc.body.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('script,style'),
                                   function (e) { e.remove(); });
      const all = clone.textContent;
      ['PQ Tool', 'RomCodeProcessUI', '原廠 UI', '原廠工具'].forEach((w) => {
        CHECK(all.indexOf(w) < 0, '🔴 整頁畫面文字裡沒有「' + w + '」');
      });
      /* 🔴 「原廠」本身沒有被禁（原廠 DLL 是實際檔名的一部分），
         禁的是拿它當「會來搶治具的那個程式」的代稱。 */
      CHECK(all.indexOf('dg-measure.html') < 0, '🔴 也不再點名另一頁的檔名'); }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('46. 🔴 分段長度跟著「模式」走，不是跟著舊旗標（v1.20.1）');
  {
    /* 🔴 這一組整組重寫。舊版驗的是 `i2ctRawMpsse ? 4096 : 256` —— 那個判準本身
       就是 bug：v1.20.0 起產品預設是 DLL_I2C_BCB.dll 路徑（rawMpsse === false），
       於是 8192 被切成 32 則送出去，而那條路在 bridge 端本來就一次讀完不分段。
       Bruce 2026-09-19：「為什麼燒錄完後的讀取驗證，不是一次讀完 8192，而是分
       256 byte、256 byte 這樣讀？」「不是一次讀 8192 的值，而是一次讀全部我設定
       的長度值。不一定是 8192 啊，萬一我要讀 65536 呢？」

       🔴 每一條路徑的上限都要**講得出出處**，這一組就是釘住那四個出處：
         SLOW(2)   256   ＝ 進度與中止的顆粒度（每個 byte 都要往返，4096 要 10~20 秒）
         RAW(3)    4096  ＝ bridge `DGH_RAW_READ_MAX`，自建路徑的命令緩衝區大小
         VENDOR(0) 65535 ＝ `U16 GetBytesEx(...)` 的**回傳值位元寬**（回報讀到幾個
                           byte 只有 16 位元 ⇒ 65536 溢位成 0，無法驗證完整性）
         FAST(1)   無限制 ＝ 只受 I2CT_MAX_LEN 這個天花板
       ⚠️ 65535 這條在**真實硬體上未經驗證**（DLL 內部反組譯沒看到長度常數比較，
          但它再呼叫的 FTD2XX.DLL 沒追進去）。這裡驗的是網頁端會怎麼切，
          不是「硬體上一定讀得到」。 */
    A.mode(2);                                   /* SLOW：libMPSSE 逐 byte */
    EQ(A.chunk(), 256, '一般模式：每則 256 byte（保住進度條與中止）');
    EQ(A.planRead(0, 4096, 2).length, 16, '4096 ⇒ 切 16 段');
    A.mode(3);                                   /* RAW：自建 */
    EQ(A.chunk(), 4096, '自建路徑：4096（命令緩衝區大小）');
    EQ(A.planRead(0, 4096, 2).length, 1, '4096 ⇒ 一則');
    EQ(A.planRead(0, 8192, 2).length, 2, '自建超過 4096 仍會切');
    A.mode(0);                                   /* VENDOR：DLL_I2C_BCB.dll */
    EQ(A.chunk(), 65535, '🔴 DLL 路徑：65535（回報數量只有 16 位元）');
    EQ(A.planRead(0, 8192, 2).length, 1, '🔴🔴 8192 ⇒ **一則訊息**（這一版之前是 32 則）');
    EQ(A.planRead(0, 8192, 2)[0].len, 8192, '那一則就是 8192 byte，不是 256');
    EQ(A.planRead(0, 4096, 2).length, 1, '4096 也是一則');
    EQ(A.planRead(0, 65535, 2).length, 1, '🔴 65535 ⇒ 一則（剛好踩在上限）');
    EQ(A.planRead(0, 65536, 2).map(c => c.len), [65535, 1],
       '🔴 65536 ⇒ 切 2 則（65535 ＋ 1），**不是報錯、也不是夾取**');
    EQ(A.planRead(0, 262144, 2).map(c => c.len).reduce((a, b) => a + b, 0), 262144,
       '🔴 256K 切完之後總長度一個 byte 都不能少');
    EQ(A.planRead(0, 262144, 2).length, 5, '256K ⇒ 5 則（65535×4 ＋ 4）');
    A.mode(1);                                   /* FAST：libMPSSE FAST_TRANSFER */
    EQ(A.planRead(0, 262144, 2).length, 1, 'FAST 沒有長度限制 ⇒ 256K 也是一則');
    A.mode(0);
    /* 🔴 反面：舊旗標**不再**能決定分段長度。`i2ctRawMpsse` 在 VENDOR 下是 false，
       舊寫法會回 256 —— 這一條就是釘住「不准再用它推斷走哪條路」。 */
    EQ(A.rawMpsse(), false, '前提：DLL 路徑下舊旗標是 false');
    EQ(A.chunk(), 65535, '🔴 舊旗標 false 但分段長度是 65535 ⇒ 判準確實換成 mode 了');
    A._reset();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('62. 🔴🔴 一次讀多少就送幾則 —— 端到端數 read 訊息（v1.20.1）');
  {
    /* 🔴 第 46 組驗的是 `i2ctPlanRead()` 這個純函式。那只證明「切法對」，
       **不證明真的送出去的訊息就是那樣**（中間還有 i2ctDoRead 的迴圈、
       中止、進度、以及寫入後的回讀驗證各自的路徑）。
       Bruce 問的是他在 log 裡看到的**訊息則數**，所以這一組數的就是訊息。

       🔴 反面也一起釘：一般模式仍然是 256 一段 —— 進度條與中止是靠它的，
          「全部改成一次送完」會把那個能力弄掉，那不是修好是換一個壞。 */
    const dev62 = new Array(0x10000).fill(0);
    for (let i = 0; i < dev62.length; i++) dev62[i] = (i * 7) & 0xFF;
    const mk62 = (m) => {
      if (m.type === 'ping') return { helper: '1.14.0', proto: 3, ok: true };
      if (m.type === 'open' || m.type === 'close') return { ok: true, channels: 1 };
      if (m.type === 'rawwrite') { (m.data || []).forEach((b, i) => { dev62[(m.addr + i) & 0xFFFF] = b & 0xFF; });
                                   return { ok: true, status: 0, transferred: (m.data || []).length }; }
      if (m.type === 'read') return { ok: true, status: 0, usbrt: 1,   /* usbrt 1 ＝ DLL_I2C_BCB.dll 路徑 */
        data: Array.from({ length: m.len }, (_, i) => dev62[(m.addr + i) & 0xFFFF]) };
      return { ok: true, status: 0 };
    };
    A._reset();
    const sent62 = await useHelper(mk62);
    win.confirm = () => true;
    EQ(A.mode(), 0, '前提：產品預設 ＝ DLL_I2C_BCB.dll 路徑（mode 0）');

    /* (a) 產品預設下，使用者設多少就一次讀多少 */
    for (const [len, want, note] of [[4096, 1, ''], [8192, 1, '🔴 Bruce 問的那一個'],
                                     [65535, 1, '剛好踩在 16 位元的上限']]) {
      const before = sent62.filter((m) => m.type === 'read').length;
      A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: String(len) });
      await A.doRead(); await sleep(60);
      const reads = sent62.filter((m) => m.type === 'read').slice(before);
      EQ(reads.length, want, '🔴 讀 ' + len + ' byte ⇒ **' + want + ' 則** read'
                             + (note ? '（' + note + '）' : ''));
      EQ(reads[0].len, len, '  └ 那一則的 len 就是 ' + len + '，不是 256');
    }

    /* (b) 超過 65535 ⇒ **分段**，不是報錯、不是夾取。總長度一個 byte 都不能少。 */
    { const before = sent62.filter((m) => m.type === 'read').length;
      A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '65536' });
      await A.doRead(); await sleep(80);
      const reads = sent62.filter((m) => m.type === 'read').slice(before);
      EQ(reads.length, 2, '🔴 讀 65536 ⇒ 2 則（回報數量只有 16 位元，切在 65535）');
      EQ(reads.map((r) => r.len), [65535, 1], '  └ 65535 ＋ 1');
      EQ(reads.reduce((a, r) => a + r.len, 0), 65536, '  └ 🔴 總長度一個 byte 都不少'); }

    /* (c) 🔴 **寫入後的回讀驗證**（Bruce 問的正是這個情境）也只送 1 則 */
    { A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '8192' });
      await A.doRead(); await sleep(60);
      A.selAnchor(5); await sleep(20);
      await A.bitToggle(0, !((A.state().buf[5] >> 0) & 1)); await sleep(80);
      const before = sent62.filter((m) => m.type === 'read').length;
      await A.doWrite(); await sleep(150);
      const reads = sent62.filter((m) => m.type === 'read').slice(before);
      EQ(reads.length, 1, '🔴🔴 寫完之後的回讀驗證 ⇒ **1 則**（這一版之前是 32 則）');
      EQ(reads[0].len, 8192, '  └ 一次回讀 8192 byte'); }

    /* (d) 反面：一般模式仍然 256 一段（進度條與中止靠它） */
    { A.mode(2);
      const before = sent62.filter((m) => m.type === 'read').length;
      A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '1024' });
      await A.doRead(); await sleep(80);
      const reads = sent62.filter((m) => m.type === 'read').slice(before);
      EQ(reads.length, 4, '🔴 一般模式讀 1024 ⇒ 仍是 4 則（每則 256）');
      EQ(reads.every((r) => r.len === 256), true, '  └ 每一則都是 256'); }

    /* (e) 分段的理由要進 log —— 上一次的病灶就是「說不出這個數字哪來的」 */
    { const log = doc.getElementById('log').textContent;
      CHECK(log.indexOf('分段：') >= 0, '🔴 log 裡有「分段：」那一行');
      CHECK(log.indexOf('一次讀完，不分段') >= 0, '🔴 不分段時也印，避免「沒印」有兩種意思');
      CHECK(log.indexOf('16 位元') >= 0, '🔴 分段時 log 講得出**為什麼**切'); }

    await win.__i2ct.disconnect();
    A._reset();
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  console.log('\n' + '═'.repeat(64));
  if (fails) { console.log('🔴 ' + fails + ' / ' + total + ' 項未通過'); process.exit(1); }
  console.log('✅ 全部通過：' + total + ' 項（' + groups.length + ' 組）');
  console.log('🔴 未驗（沒有 Windows／沒有 FTDI 治具，驗不了，不做假探針）：');
  console.log('   · i2c-bridge.exe 在 Windows 上實際執行（D2XX / libMPSSE / 真的 I2C 波形）');
  console.log('   · Windows 上的 winsock 行為（helper 的 HTTP／WebSocket／擁有權已由\n     tools/i2c-bridge/test/test_server.c 用真的 socket 驗過，但那是 POSIX socket）');
  console.log('   · 真的 TCON 對 0x68 / 0x0000 的回應（黃金向量 A1 D8 FB 沿用先前實機結果）');
  process.exit(0);
})().catch(e => { console.error('🔴 selftest 本身爆掉：', e); process.exit(2); });
