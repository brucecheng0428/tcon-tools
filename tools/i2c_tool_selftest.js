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
   新的腳本與 sent 陣列根本不會被用到（這正是第一版跑掛的原因）。 */
async function useHelper(script) {
  if (win.__i2ct.state().linked) { await win.__i2ct.disconnect(); await sleep(10); }
  const sent = makeMockWS(win, script);
  await win.__i2ct.connect();
  await sleep(25);
  return sent;
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
  await sleep(30);
  const A = win.__i2ct;

  /* ═════════════════════════════════════════════════════════════════════ */
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
  EQ(A.MAX_LEN, 4096, '一次上限 4096 byte');

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
    const rd = sent.filter(m => m.type === 'read');
    EQ(rd.length, 1, '3 byte ＝ 送 1 則 read');
    EQ({ slave: rd[0].slave, addr: rd[0].addr, len: rd[0].len, awid: rd[0].awid },
       { slave: 0x68, addr: 0x1234, len: 3, awid: 2 },
       '🔴 送出的 read 四個欄位 ＝ 使用者的四項輸入（slave 未被左移）');
    const st = A.state();
    EQ([st.buf[0x1234], st.buf[0x1235], st.buf[0x1236]], [0x10, 0x11, 0x12], '資料落在 0x1234–0x1236');
    CHECK(st.buf[0x1233] === undefined, '起始位址之前的格子沒被填（留空，不補 0）');
    CHECK(st.buf[0x1237] === undefined, '結束位址之後的格子沒被填');
    EQ(st.pages, [0x1200], '只有 0x1200 這一頁');

    /* 表格內容：直接讀 DOM，元素存在 ≠ 值正確 */
    const cells = doc.querySelectorAll('#dump td');
    EQ(cells.length, 256, '表格恰好 16×16 ＝ 256 格');
    const byKey = {};
    cells.forEach(td => { byKey[td.getAttribute('data-key')] = td; });
    EQ(byKey['4660'].textContent, '10', '0x1234 格顯示 10');
    EQ(byKey['4661'].textContent, '11', '0x1235 格顯示 11');
    EQ(byKey['4662'].textContent, '12', '0x1236 格顯示 12');
    EQ(byKey['4659'].textContent, '', '0x1233 格是空的');
    CHECK(byKey['4660'].className.indexOf('has') >= 0, '有值的格子帶 has 樣式');
    CHECK(byKey['4659'].className.indexOf('has') < 0, '沒值的格子不帶 has 樣式');
    CHECK((byKey['4660'].getAttribute('title') || '').indexOf('0x1234') === 0, '每格 title 帶得出位址：' + byKey['4660'].getAttribute('title'));
    /* 列／欄表頭：列＝高位 nibble、欄＝低位 nibble */
    const ths = Array.from(doc.querySelectorAll('#dump tr:first-child th')).map(t => t.textContent);
    EQ(ths.slice(1), ['+0', '+1', '+2', '+3', '+4', '+5', '+6', '+7', '+8', '+9', '+A', '+B', '+C', '+D', '+E', '+F'], '欄表頭 +0…+F');
    const rowh = Array.from(doc.querySelectorAll('#dump th.rh')).map(t => t.textContent).filter(s => s);
    EQ(rowh.length, 16, '16 個列表頭');
    EQ(rowh[0], '0x1200', '第一列表頭 0x1200');
    EQ(rowh[3], '0x1230', '第四列表頭 0x1230');
    EQ(rowh[15], '0x12F0', '最後一列表頭 0x12F0');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  G('8. 端到端：四種 offset 寬度真的送出對應的 awid');
  {
    for (const [awid, off, wantAddr] of [[0, '0x0000', 0], [1, '0x34', 0x34], [2, '0x1234', 0x1234], [4, '0x00001234', 0x1234]]) {
      const sent = await useHelper(baseScript((m) => {
        if (m.type === 'read') return { ok: true, status: 0, data: [0x01, 0x02] };
      }));
      A.setInputs({ slave: '0x68', awid: awid, off: off, len: '2' });
      await A.doRead();
      await sleep(15);
      const r = sent.filter(m => m.type === 'read')[0];
      EQ({ awid: r.awid, addr: r.addr }, { awid: awid, addr: wantAddr },
         'offset 寬度 ' + awid + ' byte → awid=' + awid + ' addr=' + wantAddr);
    }
    /* awid 0 的表格用索引標示 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') return { ok: true, status: 0, data: [0xAA, 0xBB] };
    }));
    A.setInputs({ awid: 0, off: '0', len: '2' });
    await A.doRead(); await sleep(15);
    const rh0 = Array.from(doc.querySelectorAll('#dump th.rh')).map(t => t.textContent).filter(s => s);
    EQ(rh0[0], '#0', 'awid 0：列表頭用索引（#0）而不是位址');
    EQ(A.state().buf[0], 0xAA, 'awid 0：第 0 個 byte 落在索引 0');
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
    const w = sent.filter(m => m.type === 'rawwrite');
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
    CHECK(st.wrote[0] === true, '寫過的格子有標記');
    /* 更高位址也不擋 */
    A.setInputs({ off: '0xFFFF', data: 'FF' });
    await A.doWrite(); await sleep(15);
    const w2 = sent.filter(m => m.type === 'rawwrite');
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
    CHECK(doc.getElementById('readbanner').textContent.indexOf('總線閒置') >= 0, '橫幅明說總線閒置、不是有效資料');
    const c0 = doc.querySelector('#dump td[data-key="0"]');
    CHECK(c0.className.indexOf('bus') >= 0, '閒置時格子用 bus 樣式（與資料中的 FF 區分）');

    /* 反面：夾雜一個非 FF 就不能判閒置，格子要回到一般的 ff 樣式 */
    await useHelper(baseScript((m) => {
      if (m.type === 'read') { const d = [0x00]; for (let i = 1; i < m.len; i++) d.push(0xFF); return { ok: true, status: 0, data: d }; }
    }));
    await A.doRead(); await sleep(20);
    CHECK(A.state().lastRead.allFF === false, '夾雜非 FF → 不判閒置');
    const c1 = doc.querySelector('#dump td[data-key="1"]');
    CHECK(c1.className.indexOf('bus') < 0 && c1.className.indexOf('ff') >= 0, '資料中的 FF 用 ff 樣式，不是 bus');
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
    EQ(doc.getElementById('pagesel').options.length, 2, '分頁下拉有 2 個選項');
    CHECK(doc.getElementById('btn-prev').disabled === true, '第一頁時「上一頁」停用');
    CHECK(doc.getElementById('btn-next').disabled === false, '還有下一頁時「下一頁」可按');
    EQ(doc.querySelector('#dump td[data-key="0"]').textContent, '00', '第一頁 0x0000 = 00');
    doc.getElementById('btn-next').dispatchEvent(new win.Event('click'));
    await sleep(10);
    EQ(A.state().pageIdx, 1, '按下一頁 → 換到第 2 頁');
    EQ(doc.querySelector('#dump td[data-key="256"]').textContent, '00', '第二頁 0x0100 = 00（低位 byte 回繞）');
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
    const b = doc.getElementById('topbanner').textContent;
    CHECK(b.indexOf('proto') >= 0 && b.indexOf('更新 helper') >= 0, '訊息要說出 proto 版本並叫人更新 helper：' + b.slice(0, 80));
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  console.log('\n' + '═'.repeat(64));
  if (fails) { console.log('🔴 ' + fails + ' / ' + total + ' 項未通過'); process.exit(1); }
  console.log('✅ 全部通過：' + total + ' 項（' + groups.length + ' 組）');
  console.log('🔴 未驗（沒有 Windows／沒有 FTDI 治具，驗不了，不做假探針）：');
  console.log('   · dg-helper.exe 在 Windows 上實際執行（D2XX / libMPSSE / 真的 I2C 波形）');
  console.log('   · helper 端出 i2c.html 的 HTTP 回應（只驗到路徑解析的純函式，見 test_proto.c）');
  console.log('   · 真的 TCON 對 0x68 / 0x0000 的回應（黃金向量 A1 D8 FB 沿用先前實機結果）');
  process.exit(0);
})().catch(e => { console.error('🔴 selftest 本身爆掉：', e); process.exit(2); });
