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
    EQ(sent.filter(m => m.type === 'ping').length, 1, '先 ping 一次');
    EQ(sent.filter(m => m.type === 'open').length, 1, '再 open 一次');

    A.setInputs({ slave: '0x68', awid: 2, off: '0x1234', len: '3' });
    await A.doRead();
    await sleep(20);
    const rd = SINCE(sent, 'read');
    EQ(rd.length, 1, '3 byte ＝ 送 1 則 read');
    EQ({ slave: rd[0].slave, addr: rd[0].addr, len: rd[0].len, awid: rd[0].awid },
       { slave: 0x68, addr: 0x1234, len: 3, awid: 2 },
       '🔴 送出的 read 四個欄位 ＝ 使用者的四項輸入（slave 未被左移）');
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
    CHECK(doc.getElementById('log').textContent.indexOf('FT status 7') >= 0, 'log 帶出 FT status');
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
    EQ(A.writeSource(4096, 2).bytes.length, 4096, '不改的話就是整份 4096');
    EQ(A.writeSource(256, 2).bytes.length, 256, '🔴 使用者把總 byte 數改小 ⇒ 以他改的為準');
    EQ(A.writeSource(512, 2).bytes[511], bin[511], '改小之後取的是前 512 個 byte，內容正確');

    /* ── 19e. 預覽：分頁與範圍標示 ─────────────────────────────────────── */
    EQ(A.view(), 'file', '載入後自動切到檔案檢視');
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
    /* ── 19f. 兩種資料一眼分得出來 ─────────────────────────────────────── */
    CHECK(doc.getElementById('dumpcard').classList.contains('filemode'),
          '🔴 檔案檢視時整張卡片換狀態（不是靠一段說明文字）');
    CHECK(doc.getElementById('dumptitle').textContent.indexOf('尚未寫入') >= 0,
          '🔴 標題直接講「尚未寫入」：' + doc.getElementById('dumptitle').textContent);

    /* ── 19g. 兩份資料並存、可切換 ─────────────────────────────────────── */
    A.setInputs({ len: '3' });
    await A.doRead(); await sleep(25);
    EQ(A.view(), 'dev', '按讀取 ⇒ 切回裝置檢視');
    EQ(A.fileState().len, 4096, '🔴 讀取沒有把載入的檔案丟掉（兩份並存）');
    CHECK(win.getComputedStyle(doc.getElementById('btn-view')).display !== 'none',
          '🔴 兩份都在時才出現切換鈕');
    A.setView('file');
    EQ(A.view(), 'file', '切得回檔案檢視');
    CHECK(doc.getElementById('dumptitle').textContent.indexOf('檔案內容') >= 0, '標題跟著切');

    /* ── 19h. 手打會放掉檔案（來源只能有一個）──────────────────────────── */
    A.clearFile();
    EQ(A.fileState().len, 0, 'clearFile 之後沒有檔案');
    A.setInputs({ data: 'DE AD' });
    EQ(A.writeSource(16, 2).src, '手動輸入', '沒有檔案就回到文字框那一份');

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
      EQ(c.old, '05', '🔴 右上小字 ＝ 被換出去的值');
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
        EQ(c.old, '05', '🔴 右上 ＝ 被換出去的值（上一次讀到的 05）');
      }
      pay = (a, i) => (i === 5 ? 0xBB : i);
      await A.doRead(); await sleep(25);      /* 第三次：0x05 變成 BB */
      {
        const c = A.cellParts(5);
        EQ(c.main, 'BB', '主值 ＝ 最新讀到的 BB');
        EQ(c.snap, '05', '🔴 左上 ＝ 快照值（第一次讀到的 05）');
        EQ(c.old, 'AA', '🔴 右上 ＝ 被換出去的值（上一次讀到的 AA）');
      }
    }

    /* 視覺層次：主值要比兩個角落大。
       🔴 位置很重要：**必須在任何 slotClick 之前**。三層同時存在只會出現在
       「讀了三次、值變過兩次」這種自然狀態（主值 BB、左上 05、右上 AA）；
       一旦開始輪替，正確行為就是其中一個角落是空的。 */
    {
      const td = doc.querySelector('#dump td[data-addr="5"]');
      const mv = parseFloat(win.getComputedStyle(td.querySelector('.mv')).fontSize);
      const sv = parseFloat(win.getComputedStyle(td.querySelector('.sv')).fontSize);
      CHECK(!!td.querySelector('.ov'), '三層都在（主值／左上／右上）');
      CHECK(mv > sv, '🔴 主值比角落小字大（' + mv + 'px vs ' + sv + 'px）—— 三個一樣大會看錯要燒哪個');
    }

    /* 🔴 三槽輪替：點左上 ⇒ 主值換成快照值、原主值移到右上；點右上 ⇒ 換回來。
       可以無限來回而不遺失任何一個值，而且**主值就是按寫入時會燒的值**。 */
    {
      const before = A.cellParts(5);
      EQ(before.main, 'BB', '起點：主值 BB、左上 05、右上 AA');
      A.slotClick(5, 'sv');
      {
        const c = A.cellParts(5);
        EQ(c.main, '05', '🔴 點左上 ⇒ 主值換成快照值 05');
        EQ(c.old, 'BB', '🔴 原主值 BB 移到右上');
        EQ(A.state().buf[5], 0x05, '🔴 主值真的改到資料本身（寫入時會燒 05）');
      }
      A.slotClick(5, 'ov');
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
      A.slotClick(5, 'ov');
      EQ(A.cellParts(5).main, 'BB', '🔴 右上已空 ⇒ 再點不做事（不是又換回去）');
      A.slotClick(5, 'sv');
      EQ(A.cellParts(5).main, '05', '🔴 要換回快照值就點左上 ⇒ 可無限來回');
      A.slotClick(5, 'ov');
      EQ(A.cellParts(5).main, 'BB', '🔴 再點右上 ⇒ 回到 BB（A ⇄ B 無限來回）');
      A.slotClick(5, 'ov');
      EQ(A.cellParts(5).main, 'BB', '再點一次 ⇒ BB，值一個都沒遺失');
    }

    A.clearFile();
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
    /* 🔴 用假 helper 驗，不需要真硬體。中止之後那一份**不得成為基準**。 */
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
    /* 🔴 反面：裝置讀回值**不是**寫入來源（讀完隨手按到寫入不該把整批寫回去） */
    A._reset();
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: Array.from({ length: m.len }, () => 0x5A) };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '16' });
    await A.doRead(); await sleep(20);
    CHECK(doc.getElementById('btn-write').disabled === true,
      '🔴 只是讀回來的資料不會變成寫入來源（防誤燒）');
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
    /* 端到端：真的點到 DOM 上的角落 */
    A._reset();
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [0xAA, 0xAA, 0xAA, 0xAA] };
    }));
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '4' });
    await A.doRead(); await sleep(20);          /* 建立基準 AA AA AA AA */
    A.snapshot();
    A.loadFile('newer.bin', new win.Uint8Array([0x55, 0xAA, 0xAA, 0xAA]));
    await sleep(20);
    const cell = () => A.cellParts(0);
    CHECK(cell().main === '55' && cell().snap === 'AA' && cell().old === null,
      '🔴 狀態 A：主值 55、左上 AA、右上空　' + JSON.stringify(cell()));
    A.slotClick(0, 'sv'); await sleep(10);
    CHECK(cell().main === 'AA' && cell().snap === null && cell().old === '55',
      '🔴 狀態 B：主值 AA、左上消失、右上 55　' + JSON.stringify(cell()));
    A.slotClick(0, 'ov'); await sleep(10);
    CHECK(cell().main === '55' && cell().snap === 'AA' && cell().old === null,
      '🔴 點右上 ⇒ 回到 A（右上消失，且**不等於**左上）　' + JSON.stringify(cell()));
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
    A.loadFile('p.bin', new win.Uint8Array(Array.from({ length: 100 }, (_, i) => i & 0xFF)));
    await sleep(20);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0010', len: '100' });
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
    EQ(doc.querySelector('#ee-list input:checked').value, '5', '🔴 預設選中 24C32');
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
    A.loadFile('e2.bin', new win.Uint8Array(100));
    await sleep(20);
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0010', len: '100' });
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
    const editCell = async (addr, text) => {
      doc.querySelector('#dump td[data-addr="' + addr + '"]')
         .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      await sleep(20);
      const inp = doc.querySelector('#dump td.edit input');
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
    CHECK(/失敗/.test(doc.getElementById('readbanner').textContent), '🔴 講明寫入失敗：'
      + doc.getElementById('readbanner').textContent.slice(0, 46));
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
    EQ(doc.getElementById('btn-write').textContent, '寫入 17 byte', '🔴 按鈕標明會寫幾個 byte');
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
    EQ(doc.getElementById('btn-write').textContent, '寫入', '沒有選取 ⇒ 按鈕文字回復');
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
      doc.querySelector('#dump td[data-addr="' + addr + '"]')
         .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      await sleep(15);
      const inp = doc.querySelector('#dump td.edit input');
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
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '512' });
    await A.doRead(); await sleep(30);
    const res = A.state().lastRead;
    CHECK(typeof res.ms === 'number' && res.ms >= 0, '讀取記下耗時（ms）：' + res.ms);
    EQ(res.segs, 2, '512 byte ⇒ 分 2 段');
    EQ(res.devUs, 24690, '🔴 bridge 端回報的 us 有被累加（2 段 × 12345）');
    const log = doc.getElementById('log').textContent;
    CHECK(/⏱ 讀取 512 byte · 共 \d+\.\d 秒/.test(log), '🔴 log 有「共 N.N 秒」（秒為單位、一位小數）');
    CHECK(/libMPSSE \d+ ms、傳輸層 -?\d+ ms/.test(log), '🔴 log 有分層：libMPSSE 與傳輸層各多久');
    CHECK(/dev 12 ms/.test(log), '🔴 每一段各記一次 dev 耗時');
    CHECK(/秒/.test(doc.getElementById('readbanner').textContent),
      '🔴 畫面上的完成訊息帶秒數：' + doc.getElementById('readbanner').textContent.slice(0, 40));
    CHECK(!/共 \d+ 毫秒/.test(doc.getElementById('readbanner').textContent), '畫面不用毫秒（他明講不實際）');
    /* 寫入那一側 */
    A.loadFile('t.bin', new win.Uint8Array(300));
    await sleep(20);
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', len: '300' });
    await A.doWrite(); await sleep(30);
    const log2 = doc.getElementById('log').textContent;
    CHECK(/⏱ 寫入 300 byte · 共 \d+\.\d 秒/.test(log2), '🔴 寫入也有總計秒數');
    CHECK(/段 1\/\d+ · \d+ byte · \d+ ms/.test(log2), '🔴 寫入每一段各記一次耗時');
    await win.__i2ct.disconnect();
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
