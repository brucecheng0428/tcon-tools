#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_i2c.js — dg-selftest.html 的 I2C 層與出圖序列，驗得了的那一半
   ───────────────────────────────────────────────────────────────────────────
   🔴 這支**驗不到**真的治具、真的 TCON、真的量測儀 —— 沒有硬體就驗不了，
      不做假的探針去製造全綠。它釘住的是「錯了會很安靜」的那幾件：

        1. 位址白名單（唯一一條不依賴 IC 判斷的硬防線）—— **正反面都驗**
        2. 七顆 IC 的出圖序列 **逐 byte** 與規格對照表一致（用假 bridge 錄下來）
        3. V512S2 的 UD 順序是 pat→xpos→ypos，不是沿用 EM02A1 的
        4. 12-bit RGB 的位元封裝（b4 是 v>>8，全白是 0x0F 不是 0xFF）
        5. 位元深度換算與端點（8-bit 的 255 ⇒ 4080，三種深度的最亮階相同）
        6. 換階等待的清單與預設
        7. ID 比對、總線閒置、ACK 判讀
        8. 三語齊備（每一個 dst.* key 三種語言都有，且不是照抄繁中）

   🔴 **正面與反面都要驗。** 這是 `check_nb_code_import.js` /
      `check_em01_code_import.js` 那兩次破口的教訓：只驗「壞的會被擋下」，
      就會在某一天開始誤殺真的東西。

   用法：
     node tools/dg_selftest_i2c.js [dg-selftest.html]
   離開碼 0 = 全過，1 = 有項目不過，2 = 跑不起來（不當作通過）。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { TextEncoder, TextDecoder } = require('util');

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'dg-selftest.html');
const repoDir = path.dirname(path.resolve(htmlPath));

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repoDir, src.split('?')[0]);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
});

const pageErrors = [];
const dom = new JSDOM(html, {
  url: 'https://example.invalid/dg-selftest.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    /* 🔴 刻意**不提供** navigator.serial 與 WebSocket 的真實實作：
       這支測試一個真的連線都不建立，所有傳輸都走下面的假 bridge。 */
    win.addEventListener('error', e => pageErrors.push(e.message));
  }
});

const W = dom.window;
const P = W.dstProbe;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✕ ' + label + (extra ? '  ' + extra : '')); }
}
function eq(a, b, label) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(sa === sb, label, '\n      得到 ' + sa + '\n      期望 ' + sb);
}

if (!P) {
  console.log('FAIL: window.dstProbe 不存在（頁面沒載起來？）');
  pageErrors.forEach(e => console.log('   page error: ' + e));
  process.exit(2);
}

/* ═══════════════════════════════════════════════════════════════════════════
   假 bridge：一個會錄音的 WebSocket 替身
   ───────────────────────────────────────────────────────────────────────────
   · `read`  回一組可預先安排的值（預設 0x00，讓 read-modify-write 算得出來）
   · `write` 一律回 ok，並把 {addr, data} 原樣錄下來
   · 所有回覆都**非同步**（setTimeout 0），與真 WebSocket 的時序一致
   🔴 它只接在 `window.dstProbe.__attachFakeWs` 這個唯一的注入點上，
      產品路徑（new WebSocket）一個字都沒改。
   ═══════════════════════════════════════════════════════════════════════════ */
function makeFakeWs(readMap) {
  const wires = [];              // 收到的每一則請求（依序）
  const writes = [];             // 只有寫入：{addr, data}
  const ws = {
    readyState: 1,
    onmessage: null,
    sent: wires, writes,
    send(txt) {
      const m = JSON.parse(txt);
      wires.push(m);
      let rep;
      if (m.type === 'read') {
        const key = m.addr;
        let data = (readMap && Object.prototype.hasOwnProperty.call(readMap, key))
          ? readMap[key].slice() : new Array(m.len).fill(0x00);
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
function hex(a) { return a.map(v => ('0' + v.toString(16).toUpperCase()).slice(-2)).join(' '); }
function fmtWrites(ws) {
  return ws.writes.map(w => '0x' + ('000' + w.addr.toString(16).toUpperCase()).slice(-4)
    + ' <- ' + hex(w.data)).join('\n        ');
}

/* ═══ 1. 位址白名單 —— 正面與反面都驗 ════════════════════════════════════ */
console.log('── 1. 位址白名單（per-IC，正面／反面都驗）───────────────────');

// 1a. 認不出 IC ⇒ 一個位址都不放行
ok(P.setIcForTest('__none__') === false, 'setIcForTest 給不存在的 key ⇒ 目前沒有 IC');
eq(P.wrRanges(), [], '認不出 IC 時允許區間是空的');
[0x1200, 0x0C00, 0x0200, 0xFF20, 0x0002, 0x0000, 0xFF22].forEach(a => {
  ok(!P.writeAllowed(a, 1), '認不出 IC 時 0x' + a.toString(16).toUpperCase() + ' 要被擋');
});

// 1b. 正面：每顆 IC 的序列實際會寫的每一個位址，一個都不能被自己的防線擋掉
const SEQ = {
  EM01A1: [[0x1200, 1], [0x1201, 1], [0x1238, 2], [0x123A, 2], [0x1240, 5],
           [0x0002, 1], [0xFF20, 1], [0xFF22, 4]],
  EM02A1: [[0x0C00, 1], [0x0C01, 1], [0x0C5C, 2], [0x0C36, 2], [0x0C39, 5],
           [0x0003, 1], [0xFF20, 1], [0xFF22, 4]],
  VM02AX: [[0x0C00, 1], [0x0C01, 1], [0x0C38, 2], [0x0C3A, 2], [0x0C40, 5],
           [0x0004, 1], [0xFF20, 1], [0xFF22, 4]],
  E512AX: [[0x0200, 1], [0x0201, 1], [0x0255, 1], [0x0236, 2], [0x025B, 2], [0x0203, 5],
           [0x0001, 1], [0xFF20, 1], [0xFF22, 4]],
  V512SX: [[0x0200, 1], [0x0201, 1], [0x0236, 2], [0x025B, 2], [0x0239, 5],
           [0x0003, 1], [0xFF20, 1], [0xFF22, 4]]
};
Object.keys(SEQ).forEach(key => {
  ok(P.setIcForTest(key), 'setIcForTest(' + key + ') 找得到這顆');
  let allOk = true, which = '';
  SEQ[key].forEach(([a, n]) => {
    if (!P.writeAllowed(a, n)) { allOk = false; which += ' 0x' + a.toString(16).toUpperCase() + '×' + n; }
  });
  ok(allOk, key + ' 的序列每一筆都放行' + (allOk ? '' : '（被擋：' + which + '）'));
});

// 1c. 替代顆（撞號）選過去之後，它多出來的那一筆 clock-enable 也要放行
ok(P.setIcForTest('EM01A1', 0), '切到 EM01A1 的替代顆');
ok(P.writeAllowed(0x0003, 1), '替代顆選上後 0x0003 放行（VM01S1 的 cursor clock）');
ok(P.setIcForTest('EM02A1', 0), '切到 EM02A1 的替代顆');
ok(P.writeAllowed(0x0004, 1), '替代顆選上後 0x0004 放行（V512S2 的 cursor clock）');
ok(P.setIcForTest('EM02A1'), '切回 EM02A1 主表');
ok(!P.writeAllowed(0x0004, 1), '沒選替代顆時 0x0004 要被擋（縮回最小權限）');

// 1d. 反面：界外一律擋，而且檢查的是整段不是起點
ok(P.setIcForTest('EM01A1'), '回到 EM01A1');
[[0x1300, 1], [0x11FF, 1], [0x0C00, 1], [0x0200, 1], [0xFF26, 1], [0x0000, 1],
 [0xE801, 1], [0xFFC5, 1]].forEach(([a, n]) => {
  ok(!P.writeAllowed(a, n), 'EM01A1 不放行 0x' + a.toString(16).toUpperCase());
});
ok(!P.writeAllowed(0x12FE, 5), '跨界：0x12FE 寫 5 byte 會跨出 0x12FF ⇒ 要被擋');
ok(P.writeAllowed(0x12FB, 5), '不跨界：0x12FB 寫 5 byte 剛好到 0x12FF ⇒ 放行');
ok(!P.writeAllowed(0xFF22, 5), '跨界：0xFF22 寫 5 byte 會跨出 0xFF25 ⇒ 要被擋');
ok(P.writeAllowed(0xFF22, 4), '不跨界：0xFF22 寫 4 byte ⇒ 放行');
ok(!P.writeAllowed(0x1200, 0), 'len 0 不合法');
ok(!P.writeAllowed(4608.5, 1), '非整數位址不合法（0x1200.5）');
ok(!P.writeAllowed(NaN, 1), 'NaN 位址不合法');
ok(!P.writeAllowedIn([], 0x1200, 1), '空區間表 ⇒ 一律擋');

// 1e. V007SX：認得出來但沒有序列 ⇒ 完全禁寫
ok(P.setIcForTest('V007SX'), 'setIcForTest(V007SX)');
eq(P.wrRanges(), [], 'V007SX 的允許區間是空的（有 ID、沒有序列 ⇒ 不出圖）');

/* ═══ 2. 七顆 IC 的出圖序列，逐 byte 與規格對照表一致 ══════════════════ */
console.log('\n── 2. 出圖序列逐 byte 比對（用假 bridge 錄音）──────────────');

/* 期望值 ＝ 規格 §6 逐顆對照表。
   進入序列 ＝ SetAgingMode(true) ＋ SetAgingUserdefineMode()
     · soft：讀回 0x00 ⇒ 寫 (0x00 & and) | or = or = 0x4C
     · E512A1 另有 aux：讀回 0x00 ⇒ 清 bit7 之後還是 0x00
     · UD：CursorOFF（0xFF20 讀 0x00 → 寫 0x00 & 0xFD = 0x00）＋ ud 三筆
   出圖 ＝ 每一階重跑 UD ＋ inside 5 byte */
const ENTER = {
  E512AX: [
    { addr: 0x0200, data: [0x4C] },                 // SetAgingMode(true)
    { addr: 0x0255, data: [0x00] },                 // aux：清 bit7（讀回 0x00）
    /* 🔴 E512A1 是唯一沒有 SetCursorOFF 的，所以 UD 直接從 pat 開始 */
    { addr: 0x0201, data: [0x00] },                 // 🔴 pattern 值 0，不是 58
    { addr: 0x0236, data: [0x00, 0x00] },           // ypos
    { addr: 0x025B, data: [0x00, 0x00] }            // xpos
  ],
  V512SX: [
    { addr: 0x0200, data: [0x4C] },
    { addr: 0xFF20, data: [0x00] },                 // SetCursorOFF
    { addr: 0x0201, data: [58] },
    { addr: 0x0236, data: [0x00, 0x00] },
    { addr: 0x025B, data: [0x00, 0x00] }
  ],
  EM01A1: [
    { addr: 0x1200, data: [0x4C] },
    { addr: 0xFF20, data: [0x00] },
    { addr: 0x1201, data: [58] },
    { addr: 0x1238, data: [0x00, 0x00] },           // xpos 先
    { addr: 0x123A, data: [0x00, 0x00] }            // ypos 後
  ],
  EM02A1: [
    { addr: 0x0C00, data: [0x4C] },
    { addr: 0xFF20, data: [0x00] },
    { addr: 0x0C5C, data: [0x00, 0x00] },           // 🔴 xpos → ypos → pat
    { addr: 0x0C36, data: [0x00, 0x00] },
    { addr: 0x0C01, data: [58] }
  ],
  VM02AX: [
    { addr: 0x0C00, data: [0x4C] },
    { addr: 0xFF20, data: [0x00] },
    { addr: 0x0C38, data: [0x00, 0x00] },           // 🔴 offset 與 EM02A1 不同
    { addr: 0x0C3A, data: [0x00, 0x00] },
    { addr: 0x0C01, data: [58] }
  ]
};
const INSIDE_ADDR = { E512AX: 0x0203, V512SX: 0x0239, EM01A1: 0x1240, EM02A1: 0x0C39, VM02AX: 0x0C40 };

async function recordEnterAndPaint(key, altIdx) {
  P.setIcForTest(key, altIdx);
  P.__resetPtg();
  const ws = makeFakeWs({});           // 所有讀都回 0x00
  P.__attachFakeWs(ws);
  await P.enterPattern();
  const enterWrites = ws.writes.slice();
  const n0 = ws.writes.length;
  await P.setRgb12(4080, 4080, 4080);  // 白：8-bit 的 255 ⇒ 4080
  const paintWrites = ws.writes.slice(n0);
  return { ws, enterWrites, paintWrites };
}

(async function main() {
  for (const key of Object.keys(ENTER)) {
    const { enterWrites, paintWrites } = await recordEnterAndPaint(key);
    eq(enterWrites, ENTER[key], key + ' 進入序列逐 byte 相同');
    /* 出圖：UD 重跑一次（＝進入序列扣掉第一筆 soft、E512A1 再扣掉 aux）＋ inside 5 byte */
    const udOnly = ENTER[key].filter(w => !(w.addr === ENTER[key][0].addr && w === ENTER[key][0]))
                             .filter(w => !(key === 'E512AX' && w.addr === 0x0255));
    const expectPaint = udOnly.concat([{ addr: INSIDE_ADDR[key], data: [0xF0, 0x0F, 0xFF, 0xF0, 0x0F] }]);
    eq(paintWrites, expectPaint, key + ' 每一階的出圖序列逐 byte 相同（含「每階重跑 UD」）');
  }

  /* 2b. 🔴 V512S2 的 UD 順序**單獨處理**，不是沿用 EM02A1 的 */
  console.log('\n── 3. V512S2 的 UD 順序（Bruce 2026-09-20 裁示）─────────────');
  eq(P.udOf('EM02A1', -1), ['xpos', 'ypos', 'pat'], 'EM02A1 的 UD 順序是 xpos→ypos→pat');
  eq(P.udOf('EM02A1', 0), ['pat', 'xpos', 'ypos'], '🔴 V512S2 的 UD 順序是 pat→xpos→ypos');
  eq(P.udOf('EM01A1', -1), ['pat', 'xpos', 'ypos'], 'EM01A1 的 UD 順序是 pat→xpos→ypos');
  eq(P.udOf('EM01A1', 0), ['pat', 'xpos', 'ypos'], 'VM01S1 的 UD 順序與 EM01A1 相同（照抄，沒有覆寫）');
  eq(P.udOf('E512AX', -1), ['pat', 'ypos', 'xpos'], 'E512A1 的 UD 順序是 pat→ypos→xpos');
  eq(P.udOf('V512SX', -1), ['pat', 'ypos', 'xpos'], 'V512S1 的 UD 順序是 pat→ypos→xpos');
  eq(P.udOf('VM02AX', -1), ['xpos', 'ypos', 'pat'], 'VM02S1 的 UD 順序是 xpos→ypos→pat');

  {
    const { enterWrites } = await recordEnterAndPaint('EM02A1', 0);
    eq(enterWrites, [
      { addr: 0x0C00, data: [0x4C] },
      { addr: 0xFF20, data: [0x00] },
      { addr: 0x0C01, data: [58] },              // 🔴 pat 先
      { addr: 0x0C5C, data: [0x00, 0x00] },      // 再 xpos
      { addr: 0x0C36, data: [0x00, 0x00] }       // 再 ypos
    ], '🔴 選 V512S2 之後，進入序列的先後順序確實換了（位址與值不變）');
  }

  /* 2c. 撞號的 cursor clock-enable 逐筆 */
  console.log('\n── 4. 十字（cursor）序列 ──────────────────────────────────');
  const CUR = {
    E512AX: { clk: [0x0001, 0x04], and: 0x87 },
    V512SX: { clk: [0x0003, 0x04], and: 0x97 },   // 🔴 唯一一顆 0x97
    EM01A1: { clk: [0x0002, 0x02], and: 0x85 },
    EM02A1: { clk: [0x0003, 0x04], and: 0x87 },
    VM02AX: { clk: [0x0004, 0x20], and: 0x87 }    // 🔴 唯一一顆 bit5
  };
  Object.keys(CUR).forEach(key => {
    const c = P.cursorOf(key, -1);
    eq([c.clk.addr, c.clk.or], CUR[key].clk, key + ' 的 cursor clock-enable');
    ok(c.ctl.and === CUR[key].and, key + ' 的 0xFF20 遮罩是 0x' + CUR[key].and.toString(16).toUpperCase(),
       '得到 0x' + c.ctl.and.toString(16).toUpperCase());
    ok(c.ctl.or === 0x12, key + ' 的 0xFF20 or 是 0x12');
    ok(c.off.and === 0xFD, key + ' 的 SetCursorOFF 遮罩是 0xFD');
    ok(c.pos.addr === 0xFF22, key + ' 的座標位址是 0xFF22');
  });
  eq([P.cursorOf('EM01A1', 0).clk.addr, P.cursorOf('EM01A1', 0).clk.or], [0x0003, 0x04], 'VM01S1 的 cursor clock-enable');
  eq([P.cursorOf('EM02A1', 0).clk.addr, P.cursorOf('EM02A1', 0).clk.or], [0x0004, 0x04], 'V512S2 的 cursor clock-enable');

  {
    /* 十字實際寫出去的四個 byte：1920×1080 ⇒ 中心 (960, 540) */
    P.setIcForTest('EM01A1');
    P.__resetPtg();
    const ws = makeFakeWs({});
    P.__attachFakeWs(ws);
    P.setRes(1920, 1080);
    await P.crossOn();
    eq(ws.writes, [
      { addr: 0x0002, data: [0x02] },                        // cursor clock enable
      { addr: 0xFF20, data: [0x12] },                        // (0x00 & 0x85) | 0x12
      { addr: 0xFF22, data: [0xC0, 0x03, 0x1C, 0x02] }       // x=960, y=540
    ], '十字 ON 的三筆寫入逐 byte 相同（中心 960,540）');
  }

  /* 2d. 對位畫面 ＝ 一個動作（L127 背景 ＋ 中心十字） */
  console.log('\n── 5. 對位畫面（L127 ＋ 中心十字，一個動作）──────────────');
  {
    P.setIcForTest('EM01A1');
    P.__resetPtg();
    const ws = makeFakeWs({});
    P.__attachFakeWs(ws);
    P.setRes(1920, 1080);
    await P.alignPattern();
    const w = ws.writes;
    /* 進入（5 筆）→ 重跑 UD（4 筆）＋ inside（1 筆）→ 十字（3 筆） */
    ok(w.length === 13, '對位畫面總共 13 筆寫入', '得到 ' + w.length + '\n        ' + fmtWrites(ws));
    const inside = w.find(x => x.addr === 0x1240);
    ok(!!inside, 'inside 那一筆存在');
    /* L127 ⇒ 12-bit 2032 ⇒ 封裝 [0xF0, 0x0F|0x00, 0x7F, 0xF0, 0x07] */
    eq(inside && inside.data, [0xF0, 0x07, 0x7F, 0xF0, 0x07], 'L127 的 inside 5 byte（12-bit 2032）');
    const pos = w[w.length - 1];
    eq([pos.addr, pos.data], [0xFF22, [0xC0, 0x03, 0x1C, 0x02]], '最後一筆是十字座標（中心）');
  }

  /* 2e. 離開：寫回原值 ＋ 關 cursor */
  console.log('\n── 6. 離開出圖模式 ────────────────────────────────────────');
  {
    P.setIcForTest('EM01A1');
    P.__resetPtg();
    /* 進入前 0x1200 的原值刻意給一個非 0 的值，才驗得出「寫回原值」 */
    const ws = makeFakeWs({ 0x1200: [0x2A] });
    P.__attachFakeWs(ws);
    await P.enterPattern();
    const n0 = ws.writes.length;
    await P.leavePattern();
    eq(ws.writes.slice(n0), [
      { addr: 0x1200, data: [0x2A] },      // 🔴 寫回進入前的原值（比上游保守）
      { addr: 0xFF20, data: [0x00] }       // 上游的 SetAgingMode(false) 一律關 cursor
    ], '離開序列：寫回原值 ＋ 關 cursor');
    eq(ws.writes[0], { addr: 0x1200, data: [(0x2A & 0xB3) | 0x4C] },
       '進入時寫的是 (原值 & 0xB3) | 0x4C');
  }

  /* 2f. E512A1 的 aux 段：進入時清 bit7 並記住，離開時還原 */
  {
    P.setIcForTest('E512AX');
    P.__resetPtg();
    const ws = makeFakeWs({ 0x0200: [0x00], 0x0255: [0x80] });   // bit7 原本是 1
    P.__attachFakeWs(ws);
    await P.enterPattern();
    const n0 = ws.writes.length;
    await P.leavePattern();
    const after = ws.writes.slice(n0);
    ok(after.some(x => x.addr === 0x0255 && x.data[0] === 0x80),
       '🔴 E512A1 離開時把 0x0255 bit7 還原成 1', '\n        ' + fmtWrites(ws));
    ok(ws.writes.some(x => x.addr === 0x0255 && x.data[0] === 0x00),
       '🔴 E512A1 進入時把 0x0255 bit7 清成 0');
  }

  /* 2g. 0xFF 回讀要中止（刻意加嚴，上游沒有這一道） */
  {
    P.setIcForTest('EM01A1');
    P.__resetPtg();
    const ws = makeFakeWs({ 0x1200: [0xFF] });
    P.__attachFakeWs(ws);
    let threw = false;
    try { await P.enterPattern(); } catch (e) { threw = true; }
    ok(threw, '🔴 soft 位址回讀 0xFF ⇒ 中止，不對著空氣改寫');
    ok(ws.writes.length === 0, '中止時一筆都沒寫出去', '寫了 ' + ws.writes.length + ' 筆');
  }

  /* 2h. 反面：白名單擋下時必須丟例外，而且**沒有任何東西送到 bridge** */
  console.log('\n── 7. 白名單在 bridge 動作之前擋下 ────────────────────────');
  {
    P.setIcForTest('EM01A1');
    P.__resetPtg();
    const ws = makeFakeWs({});
    P.__attachFakeWs(ws);
    let threw = false, msg = '';
    try { await P.writeReg(0x0C39, [1, 2, 3, 4, 5]); } catch (e) { threw = true; msg = e.message; }
    ok(threw, '白名單外的位址寫入會丟例外');
    ok(ws.writes.length === 0 && ws.sent.length === 0,
       '🔴 被擋下的那一筆**完全沒有送到 bridge**', '送了 ' + ws.sent.length + ' 則');
    ok(/0x0C39/.test(msg) && /0x1200/.test(msg),
       '擋下的訊息可行動：講出被擋的位址與目前允許的區間', msg);
  }
  {
    /* 認不出 IC ⇒ 連自己的 ptg bank 都不放行 */
    P.setIcForTest('__none__');
    P.__resetPtg();
    const ws = makeFakeWs({});
    P.__attachFakeWs(ws);
    let threw = false, msg = '';
    try { await P.writeReg(0x1200, [0x4C]); } catch (e) { threw = true; msg = e.message; }
    ok(threw, '🔴 沒認出 IC 時連 0x1200 都被擋');
    ok(ws.sent.length === 0, '沒認出 IC 時一則都不送到 bridge');
    ok(/0x1200/.test(msg), '訊息裡有被擋的位址', msg);
  }

  /* ═══ 8. 12-bit 封裝 ═══════════════════════════════════════════════════ */
  console.log('\n── 8. 12-bit RGB 封裝與位元深度換算 ───────────────────────');
  eq(P.packRgb12(0, 0, 0), [0, 0, 0, 0, 0], '全黑');
  eq(P.packRgb12(4095, 4095, 4095), [0xFF, 0xFF, 0xFF, 0xFF, 0x0F],
     '🔴 全滿：最後一個 byte 是 0x0F（b>>8），不是 0xFF');
  eq(P.packRgb12(4080, 4080, 4080), [0xF0, 0x0F, 0xFF, 0xF0, 0x0F], '8-bit 的 255 ⇒ 4080');
  eq(P.packRgb12(2032, 2032, 2032), [0xF0, 0x07, 0x7F, 0xF0, 0x07], 'L127 ⇒ 2032');
  eq(P.packRgb12(0x123, 0x456, 0x789), [0x23, 0x61, 0x45, 0x89, 0x07], '任意值的位元交錯');
  eq(P.packXY(960, 540), [0xC0, 0x03, 0x1C, 0x02], 'cursor 座標封裝 [x lo, x hi, y lo, y hi]');
  eq(P.center(1920, 1080), { x: 960, y: 540 }, '中心（偶數）');
  eq(P.center(1921, 1081), { x: 960, y: 540 }, '中心（奇數取 floor，與整數除法一致）');

  ok(P.scale(8) === 16 && P.scale(10) === 4 && P.scale(12) === 1, '倍率 16 / 4 / 1');
  ok(P.userMax(8) === 255 && P.userMax(10) === 1023 && P.userMax(12) === 4095, '刻度上限 255 / 1023 / 4095');
  ok(P.to12(255, 8) === 4080, '🔴 8-bit 的 255 送出去是 4080，不是 4095');
  ok(P.to12(1023, 10) === 4092, '10-bit 拉到底是 4092');
  ok(P.to12(4095, 12) === 4095, '12-bit 拉到底是 4095');
  ok(P.scanEnd(8) === 255 && P.scanEnd(10) === 1020 && P.scanEnd(12) === 4080,
     '掃描 End 是 255 / 1020 / 4080（🔴 不是 1023 / 4095）');
  ok(P.scanStep(8) === 1 && P.scanStep(10) === 4 && P.scanStep(12) === 16, '掃描 Step 是 1 / 4 / 16');
  [8, 10, 12].forEach(b => {
    const v = P.scanValues(b);
    ok(v.length === 256, b + '-bit 掃描 256 階', '得到 ' + v.length);
    ok(v[0] === 0, b + '-bit 第一階是 0');
    ok(v[v.length - 1] === 4080, '🔴 ' + b + '-bit 最亮那一階換算完都是 4080（三種深度同一個亮度）',
       '得到 ' + v[v.length - 1]);
  });
  eq(P.scanValues(8).slice(0, 4), [0, 16, 32, 48], '8-bit 前四階');
  eq(P.scanValues(10).slice(0, 4), [0, 16, 32, 48], '10-bit 前四階（與 8-bit 相同）');
  eq(P.scanValues(12).slice(0, 4), [0, 16, 32, 48], '12-bit 前四階（與 8-bit 相同）');

  /* 掃描計畫：256 階白 ＋ 三個純色端點 */
  const plan = P.plan(8);
  ok(plan.length === 259, '掃描計畫 ＝ 256 階白 ＋ R/G/B 三個端點', '得到 ' + plan.length);
  eq(plan[0], { key: 'L0', r: 0, g: 0, b: 0 }, '第一項是 L0');
  eq(plan[255], { key: 'L255', r: 4080, g: 4080, b: 4080 }, '第 256 項是 L255 ⇒ 4080');
  eq(plan[256], { key: 'R', r: 4080, g: 0, b: 0 }, '接著是純紅 4080');
  eq(plan[257], { key: 'G', r: 0, g: 4080, b: 0 }, '純綠');
  eq(plan[258], { key: 'B', r: 0, g: 0, b: 4080 }, '純藍');
  ok(P.alignL === 127, '對位用的背景是 L127');

  /* ═══ 9. ID 比對、總線閒置、ACK ════════════════════════════════════════ */
  console.log('\n── 9. ID 比對 / 總線閒置 / ACK 判讀 ───────────────────────');
  eq(P.slaves(), [0x60, 0x61, 0x68, 0x69], 'slave 掃描順序照抄上游工具');
  ok(/0x68 \(7-bit\) = 0xD0\/0xD1 \(8-bit W\/R\)/.test(P.slaveLabel(0x68)),
     'slave 標籤同時標 7-bit 與 8-bit', P.slaveLabel(0x68));
  const ID = {
    E512AX: [0x12, 0xE5, 0xA0], V007SX: [0x05, 0xE5, 0xF0], V512SX: [0x12, 0xF5, 0xF0],
    EM01A1: [0x01, 0xEF, 0xA0], EM02A1: [0x02, 0xEF, 0xA0], VM02AX: [0x02, 0xEF, 0xF0]
  };
  Object.keys(ID).forEach(k => {
    const m = P.matchIc(ID[k]);
    ok(m && m.key === k, k + ' 的 ID 認得出來', m ? m.key : 'null');
    /* 🔴 第三個 byte 的低 4 位是版本／變體，不參與比對 */
    const m2 = P.matchIc([ID[k][0], ID[k][1], ID[k][2] | 0x0F]);
    ok(m2 && m2.key === k, k + ' 的 ID 低 4 位不參與比對（+0x0F 仍認得出來）');
  });
  ok(P.matchIc([0xFF, 0xFF, 0xFF]) === null, '🔴 全 0xFF 不可當有效 ID');
  ok(P.matchIc([0x00, 0x00, 0x00]) === null, '全 0x00 不在表內 ⇒ null');
  ok(P.matchIc([0x01, 0xEF]) === null, '少於 3 byte ⇒ null');
  ok(P.isBusIdle([0xFF, 0xFF, 0xFF]) === true, '全 0xFF ＝ 總線閒置');
  ok(P.isBusIdle([0xFF, 0xFE, 0xFF]) === false, '有一個不是 0xFF ⇒ 不是閒置');
  ok(P.isBusIdle([]) === false, '空陣列不算閒置');

  ok(P.isAck(0x00) === true, '0x00 ＝ ACK');
  ok(P.isAck(0x3C) === true, '中間位元有殘留仍算 ACK（遮罩 0x81）');
  ok(P.isAck(0x80) === false, '0x80 ＝ NACK（靠左對齊）');
  ok(P.isAck(0x01) === false, '0x01 ＝ NACK（靠右對齊）');
  ok(P.isAck(0x81) === false, '0x81 ＝ NACK');
  ok(/NACK/.test(P.ackNote(0x80)) && /0x80/.test(P.ackNote(0x80)), 'ackNote 帶原始 byte 與判讀', P.ackNote(0x80));
  ok(/ACK/.test(P.ackNote(0x00)), 'ackNote(0x00) 說 ACK', P.ackNote(0x00));
  ok(!/\{k:/.test(P.ackNote(0x42)), 'ackNote 回的是字，不是內部描述子', P.ackNote(0x42));

  /* ═══ 10. 匯流排讀回測試的判定（純函式）════════════════════════════════
     🔴 v1.2.0 把 PASS／FAIL 整個拿掉了，這一節跟著改寫。
        原因（Bruce 2026-09-20 實機）：黃金向量 A1 D8 FB 是「某一顆 IC 上某一份
        code」讀出來的值，**不是硬體身分** —— 拿它當期望值會對所有其他 code 報
        一個假的 FAIL。現在只分「讀得到（read）」與「讀不到（noread）」。
     🔴 這幾條是**反向釘子**：哪天有人把判定接回去，這裡會亮紅燈。 */
  console.log('\n── 10. 匯流排讀回測試（v1.2.0 起不再判對錯）────────────────');
  ok(P.commVerdict([0xA1, 0xD8, 0xFB]).state === 'read', '舊的黃金向量 ⇒ read（不再是 pass）');
  ok(P.commVerdict([0x61, 0x41, 0xB4]).state === 'read', 'Bruce 實機那一組 ⇒ read（不再是 mismatch）');
  ok(P.commVerdict([0x00, 0x00, 0x00]).state === 'read', '全 0 也是 read（讀得到就是讀得到）');
  ok(P.commVerdict([]).state === 'noread', '讀不到 ⇒ noread');
  ok(P.commVerdict([0xA1]).state === 'noread', '只有 1 byte ⇒ noread');
  ok(!/PASS|FAIL/i.test(P.commVerdict([0x01, 0x02, 0x03]).text),
     '訊息裡沒有 PASS／FAIL 字樣', P.commVerdict([0x01, 0x02, 0x03]).text);
  ok(!/A1 D8 FB/.test(P.commVerdict([0x01, 0x02, 0x03]).text),
     '訊息裡也不再提「期望值」', P.commVerdict([0x01, 0x02, 0x03]).text);
  ok(/01 02 03/.test(P.commVerdict([0x01, 0x02, 0x03]).text),
     '只把讀回的值原樣報出來', P.commVerdict([0x01, 0x02, 0x03]).text);

  /* ═══ 11. 換階等待 ════════════════════════════════════════════════════ */
  console.log('\n── 11. 換階等待 ───────────────────────────────────────────');
  eq(P.settleChoices(), [300, 400, 500, 600, 700, 800, 900, 1000],
     '🔴 選項 300…1000 每 100 一階（Bruce 2026-09-20 指定）');
  ok(P.settleDefault() === 700, '🔴 預設 700 ms（上游工具的預設值）');
  ok(P.settleMs() === 700, '畫面上選單的目前值也是 700');
  {
    const sel = W.document.getElementById('dst-settle');
    ok(sel && sel.options.length === 8, '選單有 8 個選項', sel ? String(sel.options.length) : 'null');
    ok(sel && Array.from(sel.options).every(o => P.settleChoices().indexOf(parseInt(o.value, 10)) >= 0),
       '選單的每一個值都來自同一份常數（單一來源）');
    sel.value = '999';   // 不在清單裡
    ok(P.settleMs() === 700, '選單被塞了清單外的值 ⇒ 退回預設 700');
    sel.value = '1000';
    ok(P.settleMs() === 1000, '選 1000 ⇒ 1000');
    sel.value = '700';
  }

  /* ═══ 12. 解析度 sanity ═══════════════════════════════════════════════ */
  console.log('\n── 12. 解析度合理性 ───────────────────────────────────────');
  ok(P.resSane(1920, 1080), '1920×1080 合理');
  ok(P.resSane(3840, 2160), '3840×2160 合理');
  ok(!P.resSane(0, 0), '0×0 不合理');
  ok(!P.resSane(4096, 1080), '🔴 4096 超過 12-bit 欄位上限 ⇒ 不合理');
  ok(!P.resSane(1920, 4096), '4096 高度不合理');
  ok(!P.resSane(100, 1080), '太小不合理');

  /* ═══ 13. 傳輸層形狀 ═════════════════════════════════════════════════ */
  console.log('\n── 13. 傳輸層形狀 ─────────────────────────────────────────');
  ok(/^ws:\/\/127\.0\.0\.1:\d+\/ws$/.test(P.wsUrl()), 'I2C Bridge 的網址綁在本機 loopback', P.wsUrl());
  {
    P.setIcForTest('EM01A1');
    P.__resetPtg();
    const ws = makeFakeWs({});
    P.__attachFakeWs(ws);
    await P.readReg(0xFF00, 3);
    const req = ws.sent[ws.sent.length - 1];
    ok(req.type === 'read' && req.len === 3 && req.addr === 0xFF00, '讀的請求形狀正確', JSON.stringify(req));
    await P.writeReg(0x1240, [1, 2, 3, 4, 5]);
    const wreq = ws.sent[ws.sent.length - 1];
    ok(wreq.type === 'write', '🔴 寫入走 `write`（bridge 端還有一份白名單），不是 `rawwrite`',
       JSON.stringify(wreq));
    eq(wreq.data, [1, 2, 3, 4, 5], '寫入的 payload 原樣送出');
  }
  eq(P.initCmds(), ['COM,1', 'SCS,3', 'FSC,2', 'OPR,1', 'MMS,0', 'FMS,0', 'MDS,0', 'MCH,0', 'LUS,1'],
     '量測儀初始化序列沿用既有的（FSC,2 ＝ 與上游送出去的數值相同；SCS,3 是我們的選擇）');

  /* ═══ 14. 三語齊備 ═══════════════════════════════════════════════════ */
  console.log('\n── 14. 三語齊備 ───────────────────────────────────────────');
  {
    const I = W.I18N;
    const keys = Object.keys(I).filter(k => k.indexOf('dst.') === 0);
    ok(keys.length > 60, 'dst.* 的 key 數量 ' + keys.length);
    let missing = [], sameAsTw = [];
    keys.forEach(k => {
      ['zh-TW', 'zh-CN', 'en'].forEach(L => { if (!I[k][L]) missing.push(k + '/' + L); });
      /* 英文與繁中一字不差 ⇒ 幾乎一定是忘了翻。純符號／型號（例如 'I2C Bridge'）例外。 */
      if (I[k]['en'] && I[k]['en'] === I[k]['zh-TW'] && /[\u4e00-\u9fff]/.test(I[k]['zh-TW']))
        sameAsTw.push(k);
    });
    eq(missing, [], '每一個 dst.* key 三種語言都有');
    eq(sameAsTw, [], '英文不是照抄繁中');

    /* 畫面上用到的每一個 key 都要在 I18N 裡查得到 —— t() 查不到會回傳 key 本身，
       那是**靜默失敗**（console 不會叫、繁中看畫面也正常）。 */
    const src = fs.readFileSync(htmlPath, 'utf8');
    const used = new Set();
    (src.match(/data-i18n(?:-html|-ph|-aria|-title)?="([^"]+)"/g) || [])
      .forEach(m => used.add(m.replace(/^[^"]+"/, '').replace(/"$/, '')));
    (src.match(/dstT\('([^']+)'/g) || []).forEach(m => used.add(m.slice(6, -1)));
    (src.match(/'dst\.[A-Za-z0-9]+'/g) || []).forEach(m => used.add(m.slice(1, -1)));
    const notFound = Array.from(used).filter(k => !I[k]);
    eq(notFound, [], '畫面上用到的每一個 i18n key 都查得到翻譯');

    /* 🔴 IC 表裡不准有**會上畫面**的中文字串常數。
       這一條是「從一開始就三語」的機械保障：寫死一句中文在資料表裡，
       頁面照跑、繁中看起來也完全正常，只有切到別的語言才會冒出來 ——
       與 i2c.html 事後補三語踩過的是同一種破口。
       允許的例外：`key`／`name`／`src` 都是型號與行號，本來就不翻譯。 */
    const zh = /[一-鿿]/;
    const leaked = [];
    (function walk(o, p) {
      if (o == null) return;
      if (typeof o === 'string') { if (zh.test(o)) leaked.push(p + ' = ' + o); return; }
      if (typeof o !== 'object') return;
      Object.keys(o).forEach(k => walk(o[k], p ? p + '.' + k : k));
    })(P.icTable(), '');
    eq(leaked, [], '🔴 IC 表裡沒有寫死的中文（畫面上的字一律走 i18n key）');
  }

  /* ═══ 15. 切語言之後畫面上沒有殘留的 key ═════════════════════════════ */
  console.log('\n── 15. 切語言 ─────────────────────────────────────────────');
  ['zh-TW', 'zh-CN', 'en'].forEach(L => {
    W.applyLang(L);
    const txt = Array.from(W.document.querySelectorAll('[data-i18n]')).map(e => e.textContent).join(' ');
    ok(!/\bdst\.[A-Za-z]/.test(txt), L + '：畫面上沒有未翻譯的 dst.* key');
    ok(!/\[object Object\]/.test(txt), L + '：畫面上沒有 [object Object]');
    ok(W.document.getElementById('dst-settle').options.length === 8, L + '：換階等待選單仍是 8 個選項');
  });
  W.applyLang('zh-TW');

  /* ═══ 16. 頁面自己沒有丟例外 ═════════════════════════════════════════ */
  console.log('\n── 16. 頁面載入 ───────────────────────────────────────────');
  eq(pageErrors, [], '載入過程沒有未捕捉的例外');
  ok(P.version && P.version !== 'unknown', '版號讀得到（common/version.js 的 dgself）', P.version);
  {
    const badge = W.document.querySelector('[data-tool-version="dgself"]');
    ok(badge && /^v\d+\.\d+\.\d+$/.test(badge.textContent),
       '頁首的版號徽章由 TOOL_VERSIONS 注入', badge ? badge.textContent : 'null');
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(fail === 0 ? ('✅ 全過：' + pass + ' 項') : ('🔴 ' + fail + ' 項不過（共 ' + (pass + fail) + ' 項）'));
  console.log('🔴 這支驗不到的：真的治具、真的 TCON、真的量測儀。');
  console.log('   「畫面會不會真的變色」「量到的數字對不對」只有 Bruce 的硬體能回答。');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.log('🔴 測試本身跑掛了（不當作通過）：' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
