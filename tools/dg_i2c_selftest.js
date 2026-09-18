/* ═══════════════════════════════════════════════════════════════════════════
   dg_i2c_selftest.js — dg-measure.html 的 TCON I2C 層，驗得了的那一半
   ───────────────────────────────────────────────────────────────────────────
   🔴 這支**不會**驗到 USB 或 TCON —— 沒有治具就驗不了，不做假的探針去製造全綠。
      它釘住的是四件純函式的事，而這四件正好是「錯了會很安靜」的那幾件：

        1. 位址白名單（唯一一條不依賴 IC 判斷的硬防線）
        2. 12-bit RGB 的位元封裝（b4 是 v>>8，全白是 0x0F 不是 0xFF）
        3. MPSSE 指令序列的內容與長度（repeated start、ACK 個數、NACK 在最後一個）
        4. 連線按鈕六個狀態的狀態機

   🔴 **正面與反面都要驗。** 這是 `check_nb_code_import.js` / `check_em01_code_import.js`
      那兩次破口的教訓：只驗「壞的會被擋下」，就會在某一天開始誤殺真的東西。
      所以白名單這一段既驗「界外被擋」也驗「界內全部放行」。

   用法：
     mkdir -p /tmp/h && cd /tmp/h && npm install jsdom
     NODE_PATH=/tmp/h/node_modules node tools/dg_i2c_selftest.js [dg-measure.html]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { TextEncoder, TextDecoder } = require('util');

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'dg-measure.html');
const repoDir = path.dirname(path.resolve(htmlPath));

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repoDir, src.split('?')[0]);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
});

const pageErrors = [];
const dom = new JSDOM(html, {
  url: 'https://example.invalid/dg-measure.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.navigator.serial = { getPorts: () => Promise.resolve([]), requestPort: () => Promise.reject(new Error('n/a')), addEventListener() {} };
    win.addEventListener('error', e => pageErrors.push(e.message));
  }
});

const P = dom.window.dgmI2cProbe;
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✕ ' + label + (extra ? '  ' + extra : '')); }
}
function eq(a, b, label) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(sa === sb, label, '得到 ' + sa + '，期望 ' + sb);
}

if (!P) { console.log('FAIL: window.dgmI2cProbe 不存在（頁面沒載起來？）'); process.exit(2); }

console.log('── 1. 位址白名單（v1.66.0 起 per-IC，正面／反面都驗）─────────');
/* 🔴 這一節的正面那一半是它存在的理由。check_nb_code_import /
   check_em01_code_import 兩次破口的共同根因都是「只驗壞的會被擋、
   沒驗好的會被放行」。所以每一顆 IC **實際會寫的每一個位址**都要點名。 */

// ── 1a. 認不出 IC ⇒ 一個位址都不放行（比舊版嚴）
ok(P.setIcForTest('__none__') === false, 'setIcForTest 給不存在的 key ⇒ 目前沒有 IC');
eq(P.wrRanges(), [], '認不出 IC 時允許區間是空的');
[0x1200, 0x0C00, 0x0200, 0xFF20, 0x0002, 0x0000].forEach(a => {
  ok(!P.writeAllowed(a, 1), '認不出 IC 時 ' + a.toString(16) + ' 要被擋');
});

// ── 1b. 每顆 IC 的正面：PQ Tool 序列實際會寫的位址，一個都不能被自己的防線擋掉
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
  SEQ[key].forEach(([a, n]) => { if (!P.writeAllowed(a, n)) { allOk = false; which += ' ' + a.toString(16) + 'x' + n; } });
  ok(allOk, key + ' 的 PQ Tool 序列每一筆都放行' + (allOk ? '' : '（被擋：' + which + '）'));
});

// ── 1c. 每顆 IC 的反面：別顆的 ptg bank 一定要被擋（這是最容易錯的一格）
P.setIcForTest('EM01A1');
ok(!P.writeAllowed(0x0C00, 1), '🔴 EM01A1 上 0x0C00 要被擋（那是它的 lod_1 bank，不是 ptg）');
ok(!P.writeAllowed(0x0200, 1), '🔴 EM01A1 上 0x0200 要被擋（那是它的 gpio 之外的區域）');
ok(!P.writeAllowed(0x02ED, 1), 'EM01A1 上 0x02ED（reg_gpi_agmode）要被擋');
P.setIcForTest('EM02A1');
ok(!P.writeAllowed(0x1200, 1), '🔴 EM02A1 上 0x1200 要被擋（它的 ptg 在 0x0C00）');
ok(!P.writeAllowed(0x0200, 1), 'EM02A1 上 0x0200 要被擋');
P.setIcForTest('E512AX');
ok(!P.writeAllowed(0x1200, 1), '🔴 E512AX 上 0x1200 要被擋（它的 ptg 在 0x0200）');
ok(!P.writeAllowed(0x0C00, 1), 'E512AX 上 0x0C00 要被擋');

// ── 1d. 共通：跨界、髒值、唯讀觀測點
P.setIcForTest('EM01A1');
ok(!P.writeAllowed(0x12FF, 2), '0x12FF 寫 2 byte 要被擋（尾巴跨出去）');
ok(!P.writeAllowed(0x12FC, 5), '0x12FC 寫 5 byte 要被擋（尾巴跨出去）');
ok(!P.writeAllowed(0xFF00, 1), '0xFF00（IC ID）要被擋');
ok(!P.writeAllowed(0xFF26, 2), '0xFF26（reg_tmg_hres）要被擋 —— 本頁只讀它');
ok(!P.writeAllowed(0xE801, 1), '0xE801（唯讀觀測點）要被擋');
ok(!P.writeAllowed(0x1200, 0), '長度 0 要被擋');
ok(!P.writeAllowed(0x1200, -1), '負長度要被擋');
ok(!P.writeAllowed(0x1200 + 0.5, 1), '非整數位址要被擋');
ok(!P.writeAllowed(NaN, 1), 'NaN 要被擋');
ok(!P.writeAllowed('0x1200', 1), '字串位址要被擋');
let inRangeAllOk = true, edgeOk = true;
for (let a = 0x1200; a <= 0x12FF; a++) if (!P.writeAllowed(a, 1)) inRangeAllOk = false;
for (let n = 1; n <= 5; n++) if (!P.writeAllowed(0x1200, n)) edgeOk = false;
ok(inRangeAllOk, 'EM01A1 的 0x1200–0x12FF 共 256 個位址寫 1 byte 全部放行');
ok(edgeOk, '0x1200 寫 1~5 byte 全部放行');
ok(P.writeAllowed(0x12FB, 5), '0x12FB 寫 5 byte 剛好貼齊上界，要放行');

// ── 1e. 純函式版本（不碰全域狀態）
ok(P.writeAllowedIn([[0x10, 0x1F]], 0x10, 1), 'writeAllowedIn 正面');
ok(!P.writeAllowedIn([[0x10, 0x1F]], 0x0F, 1), 'writeAllowedIn 低界外');
ok(!P.writeAllowedIn([[0x10, 0x1F]], 0x1F, 2), 'writeAllowedIn 跨界');
ok(!P.writeAllowedIn([], 0x10, 1), 'writeAllowedIn 空區間 ⇒ 一律不放行');
ok(P.writeAllowedIn([[0x10, 0x1F], [0x30, 0x3F]], 0x30, 4), 'writeAllowedIn 多段：落在第二段');

// buildWrite 也要真的丟例外，不是只有 writeAllowed 說不行
P.setIcForTest('EM01A1');
let threw = false;
try { P.buildWrite(0x68, 0x02ED, [0x80]); } catch (e) { threw = /白名單/.test(e.message); }
ok(threw, 'buildWrite(0x02ED) 要丟例外（白名單在組裝指令之前就擋）');
P.setIcForTest('__none__');
let threw2 = false;
try { P.buildWrite(0x68, 0x1200, [0x4C]); } catch (e) { threw2 = /白名單/.test(e.message); }
ok(threw2, '🔴 認不出 IC 時連 0x1200 都要丟例外');

console.log('── 2. 12-bit RGB 位元封裝（報告 A.2.1）────────────────────');
eq(P.packRgb12(0xFFF, 0xFFF, 0xFFF), [0xFF, 0xFF, 0xFF, 0xFF, 0x0F],
  '全白 0xFFF ⇒ FF FF FF FF 0F（🔴 最後一個是 0x0F，12-bit 高位只有 4 bit）');
eq(P.packRgb12(0x800, 0x800, 0x800), [0x00, 0x08, 0x80, 0x00, 0x08], '中灰 0x800 ⇒ 00 08 80 00 08');
eq(P.packRgb12(0x000, 0x000, 0x000), [0x00, 0x00, 0x00, 0x00, 0x00], '全黑 ⇒ 00 00 00 00 00');
eq(P.packRgb12(0xFFF, 0x000, 0x000), [0xFF, 0x0F, 0x00, 0x00, 0x00], '純紅 ⇒ FF 0F 00 00 00');
eq(P.packRgb12(0x000, 0xFFF, 0x000), [0x00, 0xF0, 0xFF, 0x00, 0x00], '純綠 ⇒ 00 F0 FF 00 00');
eq(P.packRgb12(0x000, 0x000, 0xFFF), [0x00, 0x00, 0x00, 0xFF, 0x0F], '純藍 ⇒ 00 00 00 FF 0F');
eq(P.packRgb12(0x123, 0x456, 0x789), [0x23, 0x61, 0x45, 0x89, 0x07], '任意值 0x123/0x456/0x789');
eq([P.to12(0), P.to12(128), P.to12(255)], [0, 2048, 4080], 'L0/L128/L255 × 16（AgingPatternBit = 12）');

console.log('── 3. MPSSE 指令序列 ───────────────────────────────────────');
const rd = P.buildRead(0x68, 0xFF00, 3);
eq(rd.acks, 4, '讀 3 byte 要等 4 個 ACK（slaveW＋addrHi＋addrLo＋slaveR）');
eq(rd.data, 3, '讀 3 byte 的資料長度');
ok(rd.out[rd.out.length - 1] === 0x87, '指令序列最後一個是 0x87（send immediate）');
ok(rd.out.filter((_, i) => rd.out[i] === 0x11 && rd.out[i + 1] === 0x00 && rd.out[i + 2] === 0x00).length >= 4,
  '至少 4 道 0x11（clock bytes out）＝ 四個要 ACK 的 byte');
// slave 位址的 R/W bit：寫用 0xD0、讀用 0xD1（0x68 << 1）
ok(rd.out.indexOf(0xD0) >= 0 && rd.out.indexOf(0xD1) >= 0,
  '7-bit slave 0x68 左移一位 ⇒ 寫 0xD0、讀 0xD1 都要出現');
// repeated start：0x11 0x00 0x00 0xD1 之前不可以有 STOP 的最後一步（把 SDA 拉高並放開匯流排）
const relIdx = (() => { for (let i = 0; i + 2 < rd.out.length; i++) if (rd.out[i] === 0x80 && rd.out[i + 1] === 0x03 && rd.out[i + 2] === 0x00) return i; return -1; })();
const slaveRIdx = (() => { for (let i = 0; i + 3 < rd.out.length; i++) if (rd.out[i] === 0x11 && rd.out[i + 3] === 0xD1) return i; return -1; })();
ok(relIdx > slaveRIdx, '讀的位址段與資料段之間沒有 STOP（＝ repeated start，PQ Tool 的 options 9 沒有 STOP_BIT）');
// 最後一個資料 byte 要 NACK（0x13 0x00 0x80），其餘 ACK（0x13 0x00 0x00）
let nack = 0, ack = 0;
for (let i = 0; i + 2 < rd.out.length; i++) {
  if (rd.out[i] === 0x13 && rd.out[i + 1] === 0x00) { if (rd.out[i + 2] === 0x80) nack++; else if (rd.out[i + 2] === 0x00) ack++; }
}
eq([ack, nack], [2, 1], '讀 3 byte ⇒ 前兩個 ACK、最後一個 NACK');

P.setIcForTest('EM01A1');   // buildWrite 走白名單，要先有一顆已識別的 IC
const wr = P.buildWrite(0x68, 0x1240, [1, 2, 3, 4, 5]);
eq(wr.acks, 8, '寫 0x1240 五個 byte 要等 8 個 ACK（slave＋addrHi＋addrLo＋5 資料）');
eq(wr.data, 0, '寫入不讀資料');
ok(wr.out.indexOf(0xD1) < 0, '寫入不可以出現讀位址 0xD1');
ok(wr.out[wr.out.length - 1] === 0x87, '寫入序列最後也是 0x87');

console.log('── 4. FTDI／MPSSE 參數要與 PQ Tool 一致 ───────────────────');
eq(P.clockHz(), 150000, 'I2C clock 150 kHz（PQ Tool 預設，Bruce 從未改過）');
eq(P.divisor(), 199, '0x86 除數 199 ＝ 60MHz/(150k×2)−1（3-phase 已停用，不再 ×1.5）');
eq(P.latency(), 1, 'LatencyTimer 1（PQ Tool 給的值，照抄不改）');
/* 🔴 v1.60.0：順序改成照抄 PQ Tool 的 CheckICID_*（`ICCommonFunction.cs` L234–247
   等七段一致）：96 → 97 → 104 → 105。順序本身就是被驗的東西，不是隨手排的。 */
eq(P.slaves(), [0x60, 0x61, 0x68, 0x69],
  '掃描順序 ＝ PQ Tool CheckICID 的 96→97→104→105');
eq(P.iface(), 0,
  '通道寫死 Interface 0（PQ Tool 的 _I2CChannel 恆為 0，I2CSettingForm.cs L141/L196/L273）');

console.log('── 5. IC ID 表（含撞號這件事本身）─────────────────────────');
eq(P.matchIc([0x01, 0xEF, 0xA5]).key, 'EM01A1', '01 EF Ax ⇒ EM01A1（低四位不比對）');
/* 🔴 Bruce 2026-09-18 實機讀到的值，必須認得（低四位＝版本/變體，遮罩比對） */
eq(P.matchIc([0x01, 0xEF, 0xA1]).key, 'EM01A1', '🔴 01 EF A1（Bruce 實測）⇒ EM01A1');
eq(P.matchIc([0x01, 0xEF, 0xA0]).key, 'EM01A1', '01 EF A0 ⇒ EM01A1');
eq(P.matchIc([0x01, 0xEF, 0xAF]).key, 'EM01A1', '01 EF AF ⇒ EM01A1');
ok(P.matchIc([0x01, 0xEF, 0xB0]) === null, '01 EF B0（高四位不同）⇒ 不認得（遮罩沒放太寬）');
eq(P.matchIc([0x02, 0xEF, 0xA0]).key, 'EM02A1', '02 EF Ax ⇒ EM02A1');
eq(P.matchIc([0x02, 0xEF, 0xF0]).key, 'VM02AX', '02 EF Fx ⇒ VM02AX');
eq(P.matchIc([0x12, 0xE5, 0xA0]).key, 'E512AX', '12 E5 Ax ⇒ E512AX');
ok(P.matchIc([0xAA, 0xBB, 0xCC]) === null, '認不出來要回 null（不要亂猜）');
ok(P.matchIc([0x01]) === null, '長度不足要回 null');
/* 🔴 Bug 2（Bruce 2026-09-18）：全 0xFF＝總線閒置，不是有效回應 */
ok(typeof P.isBusIdle === 'function', 'isBusIdle 探針在');
ok(P.isBusIdle([0xFF, 0xFF, 0xFF]) === true, 'FF FF FF ⇒ 總線閒置（無回應）');
ok(P.isBusIdle([0x01, 0xEF, 0xA1]) === false, '01 EF A1 ⇒ 不是閒置（有效資料）');
ok(P.isBusIdle([0xFF, 0xFF, 0x00]) === false, '只要有一個非 0xFF 就不算閒置');
ok(P.matchIc([0xFF, 0xFF, 0xFF]) === null, '🔴 matchIc(FF FF FF) 回 null（不會誤認）');
eq(P.matchIc([0x12, 0xF5, 0xF0]).key, 'V512SX', '12 F5 Fx ⇒ V512SX');
eq(P.matchIc([0x05, 0xE5, 0xF0]).key, 'V007SX', '05 E5 Fx ⇒ V007SX');
const tbl = P.icTable();
eq(tbl.map(x => x.key), ['E512AX', 'V007SX', 'V512SX', 'EM01A1', 'EM02A1', 'VM02AX'],
  '🔴 比對順序逐字照抄 ICCommonFunction.CheckICID(ref data) L191–227');
const em01 = tbl.filter(x => x.key === 'EM01A1')[0];
ok(em01.patternOk === true, 'EM01A1 允許出圖');
/* 🔴 v1.66.0：七顆的序列都從反組譯抄出來了，所以能出圖的不再只有 EM01。
   唯一仍然不行的是 V007SX —— 反組譯子集裡**根本沒有它的 IC 類別**，
   沒有序列可抄就不能假裝有。 */
ok(tbl.filter(x => x.key === 'V007SX')[0].patternOk === false,
  '🔴 V007SX 不出圖（反組譯裡沒有它的 per-IC 檔）');
ok(typeof tbl.filter(x => x.key === 'V007SX')[0].noImpl === 'string',
  'V007SX 要明講為什麼不做，不是靜默的 false');
ok(tbl.filter(x => x.key !== 'V007SX').every(x => x.patternOk === true),
  '其餘五組（七顆）都有完整序列，允許出圖');
eq([em01.soft.addr, em01.soft.and, em01.soft.or], [0x1200, 0xB3, 0x4C],
  'SetAgingMode(true) ＝ 讀 0x1200 → (reg & 0xB3) | 0x4C');
eq([em01.pat.addr, em01.pat.value], [0x1201, 58], 'pattern 編號 58（Edge）寫 0x1201');
eq([em01.xpos.addr, em01.ypos.addr, em01.inside.addr], [0x1238, 0x123A, 0x1240], 'xpos/ypos/inside 三個位址');
eq(em01.ud, ['pat', 'xpos', 'ypos'], 'EM01 的 SetAgingUserdefineMode 順序：pattern → xpos → ypos');
eq(em01.cross.or, 0x0D, 'SetCrossPattern ＝ pattern 13（0x0D）');
eq([em01.cursor.ctl.addr, em01.cursor.ctl.and, em01.cursor.ctl.or], [0xFF20, 0x85, 0x12],
  'EM01 SetCursorON ＝ 0xFF20 (reg & 0x85) | 0x12');
eq([em01.cursor.clk.addr, em01.cursor.clk.or], [0x0002, 0x02], 'EM01 cursor clock enable ＝ 0x0002 bit1');
eq(em01.cursor.pos.addr, 0xFF22, 'cursor 座標寫 0xFF22');

/* 🔴 per-IC 的三個坑：同 base 不同 offset、同位址不同 bit、同 ID 不同顆。
   這幾條是「不能寫成一套通吃」的機械證明。 */
const em02 = tbl.filter(x => x.key === 'EM02A1')[0];
const vm02 = tbl.filter(x => x.key === 'VM02AX')[0];
const e512 = tbl.filter(x => x.key === 'E512AX')[0];
const v512 = tbl.filter(x => x.key === 'V512SX')[0];
eq([em02.ptgBase, vm02.ptgBase], [0x0C00, 0x0C00], 'EM02A1 與 VM02S1 的 ptg base 相同');
ok(em02.xpos.addr !== vm02.xpos.addr && em02.inside.addr !== vm02.inside.addr,
  '🔴 但 offset 不同（EM02 5C/39、VM02 38/40）—— 同 base 不代表同 offset');
eq(em02.ud, ['xpos', 'ypos', 'pat'], '🔴 EM02 的順序與 EM01 相反（xpos → ypos → pattern）');
eq(e512.pat.value, 0, '🔴 E512A1 用 pattern 0（User Define Full Color），不是 58');
eq(e512.udCursorOff, false, '🔴 E512A1 是唯一 SetAgingUserdefineMode 不含 SetCursorOFF 的');
eq([e512.aux.addr, e512.aux.bit], [0x0255, 7], 'E512A1 的第二段 ＝ 0x0255 bit7');
ok(tbl.filter(x => x.key !== 'E512AX' && x.aux).length === 0, '只有 E512A1 有 aux 那一段');
eq(v512.cursor.ctl.and, 0x97, '🔴 V512S1 的 0xFF20 遮罩是 0x97，不是別顆的 0x87');
eq(v512.inside.addr, 0x0239, 'V512S1 的 inside 是 0x0239（E512A1 是 0x0203）');
ok(em01.alsoMayBe.indexOf('VM01S1') >= 0, '🔴 EM01A1 要如實寫出與 VM01S1 撞號');
ok(em02.alsoMayBe.indexOf('V512S2') >= 0, '🔴 EM02A1 要如實寫出與 V512S2 撞號（同一支 CheckICID_EM02AX）');
ok(em01.crossAlt && em01.crossAlt.clk.addr === 0x0003, 'EM01A1 的撞號替代 cursor clk ＝ VM01S1 的 0x0003');
ok(em02.crossAlt && em02.crossAlt.clk.addr === 0x0004, 'EM02A1 的撞號替代 cursor clk ＝ V512S2 的 0x0004');
/* 🔴 撞號的兩顆在**出圖**那一段必須逐位元相同，否則「撞號不影響出圖」這句話就是假的 */
ok(em01.soft.addr === 0x1200 && em01.pat.value === 58 && em01.inside.addr === 0x1240,
  '🔴 EM01A1 的出圖序列＝VM01S1 的出圖序列（撞號不影響灰階／RGB）');
eq([em01.obs.agbsen.addr, em01.obs.agbsen.bit], [0xFFC5, 1], '觀測點 agbsen_rc ＝ 0xFFC5 bit1');
eq([em01.obs.agingRo.addr, em01.obs.agingRo.bit], [0xE801, 0], '觀測點 ro_rt0_aging_en ＝ 0xE801 bit0');
// 🔴 報告2 §1.5c 的陷阱：每個觀測點都必須連 bit 一起存，不准只有位址
let allHaveBit = true;
tbl.forEach(ic => {
  if (!ic.obs) return;
  Object.keys(ic.obs).forEach(k => {
    const o = ic.obs[k];
    if (o.len === undefined && typeof o.bit !== 'number') allHaveBit = false;
  });
});
ok(allHaveBit, '🔴 每一個位元型觀測點都要連 bit 一起存（EM01/EM02 的 0x02ED 位址相同但 bit 差一位）');

console.log('── 6. 連線按鈕的六個狀態 ──────────────────────────────────');
const S = (b, a, ic, r) => P.btnState(b, a, ic, r);
eq(S(false, false, null, false).text, 'I2C OFF', '未連線 ⇒ I2C OFF');
ok(!S(false, false, null, false).on && !S(false, false, null, false).unknown, '未連線：燈是灰的');
eq(S(true, false, null, false).text, 'I2C …', '連線中 ⇒ I2C …');
ok(S(true, false, null, false).busy, '連線中：busy');
eq(S(false, true, 'EM01A1', false).text, 'I2C ON · EM01A1', '已連線且認得 IC ⇒ 型號寫在按鈕上');
ok(S(false, true, 'EM01A1', false).on, '已連線且認得 IC：綠');
eq(S(false, true, null, false).text, 'I2C ON', '🔴 v1.65.0：IC 不明時按鈕只寫「I2C ON」，不再寫「未知 IC」（避免誤導成沒接到 TCON）');
ok(S(false, true, null, false).unknown && !S(false, true, null, false).on,
  '🔴 IC 不明 ⇒ 橘，不是綠（能連上 ≠ 可以安全地寫）');
ok(S(true, true, 'EM01A1', false).busy && !S(true, true, 'EM01A1', false).on,
  '忙碌時不亮綠（避免連點）');
ok(S(false, false, null, true).disabled, '量測中：按鈕停用');
ok(!S(false, false, null, false).disabled, '沒量測：按鈕可按');

console.log('── 7. ACK 判讀（v1.60.0 收斂成單一判準）───────────────────');
/* 🔴 這一節釘的是「不必知道 MPSSE 把 1-bit 讀取靠哪一端對齊，判準也成立」。
   兩種對齊之下 ACK 都是 bit0 與 bit7 皆為 0 ⇒ 遮罩 0x81。
   反面也要驗：兩種 NACK 表示法都必須被擋下來 —— 這正是 check_nb_code_import
   那三次教訓（只驗壞檔被拒、沒驗真檔被收）的反向版本。 */
eq(P.ackMask(), 0x81, 'ACK 遮罩 0x81 ＝ bit7（靠左）｜bit0（靠右）');
ok(P.isAck(0x00) === true, '0x00 ⇒ ACK（兩種對齊都是這個值）');
ok(P.isAck(0x01) === false, '0x01 ⇒ NACK（靠右對齊）');
ok(P.isAck(0x80) === false, '0x80 ⇒ NACK（靠左對齊）');
ok(P.isAck(0x81) === false, '0x81 ⇒ NACK');
ok(P.isAck(0x7E) === true, '0x7E ⇒ ACK（中間位元是殘留，不看）');
ok(/ACK$/.test(P.ackNote(0x00)), '0x00 的說明講 ACK', P.ackNote(0x00));
ok(/靠左/.test(P.ackNote(0x80)), '0x80 的說明要指出是靠左對齊', P.ackNote(0x80));
ok(/靠右/.test(P.ackNote(0x01)), '0x01 的說明要指出是靠右對齊', P.ackNote(0x01));
ok(/不在預期/.test(P.ackNote(0x81)), '0x81 這種不該出現的值要大聲講', P.ackNote(0x81));
/* 三個選項不再存在 —— 收斂掉的東西要有測試釘住，否則會被下一次改動悄悄加回來 */
ok(typeof P.ackMode === 'undefined' && typeof P.ackModes === 'undefined',
  'ACK 判讀不再是可切換的模式（getter 已移除）');

console.log('── 8. 按鈕與面板真的在 DOM 上 ─────────────────────────────');
ok(P.btnText() === 'I2C OFF', '初始按鈕文字 I2C OFF', '得到 ' + P.btnText());
ok(P.btnDisabled() === false, '初始按鈕可按');
ok(P.panelOpen() === false, '實測面板初始是收起來的');
ok(P.linkActive() === false && P.linkBusy() === false, '初始未連線、不忙碌');
/* 🔴 §1 用 setIcForTest 動過「目前是哪一顆」，這裡先歸零再驗初始狀態 ——
   不歸零的話這一條驗到的是上一節的殘留，不是初始狀態。 */
P.setIcForTest('__none__');
ok(P.ic() === null && P.idRaw() === null, '初始沒有 IC、沒有 ID');

console.log('── 9. 出圖來源與確認卡（v1.59.0）──────────────────────────');
const S2 = dom.window.dgmSrcProbe;
ok(!!S2, 'window.dgmSrcProbe 存在');
if (S2) {
  eq(S2.sourceId(), 'pc', '預設出圖來源是 PC（共通路徑，選錯的後果最小）');
  eq(S2.label(), '電腦', '右上角常駐標籤預設「電腦」');
  ok(S2.i2cReady() === false, '沒有治具 ⇒ I2C 出圖 isReady() 為 false');
  ok(S2.cardOpen() === false, '確認卡預設是收起來的');
  eq(S2.gateLines(), ['按「全螢幕」或 F11', '請接上光學儀器'],
    '閘門只有既有那兩行（沒選 I2C 就不會多出第三行）');

  /* 🔴 走使用者真正走的那條路：改真的 DOM ＋ dispatch change，不用捷徑 */
  const doc = dom.window.document;
  const fire = (id) => {
    const e = doc.getElementById(id);
    e.checked = true;
    e.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };
  S2.showCard();
  ok(S2.cardOpen() === true, 'showCard() 之後卡片打開');
  ok(S2.kind() === null, '🔴 Monitor／NB 無預設（必選）');
  ok(S2.goDisabled() === true, '沒答 Monitor／NB 之前「開始量測」是關著的');
  ok(S2.i2cOptDisabled() === true, '沒連 I2C ⇒ I2C 選項反白');
  ok(S2.whyVisible() === true && /I2C 連線鈕/.test(S2.whyText()),
    '反白的理由是**常駐一行說明**，不是 tooltip', S2.whyText());

  fire('dgm-src-nb');
  eq(S2.kind(), 'nb', '選了 NB');
  ok(S2.goDisabled() === false, '答完 Monitor／NB 之後才能按「開始量測」');
  ok(S2.i2cOptDisabled() === true, 'NB ⇒ I2C 選項仍然反白');
  ok(/NB TCON 不支援/.test(S2.whyText()), 'NB 的理由要明說「NB TCON 不支援 I2C 出圖」', S2.whyText());
  ok(/NB/.test(S2.sumText()) && /電腦出圖/.test(S2.sumText()), '摘要那一行說得出這一輪是什麼', S2.sumText());

  fire('dgm-src-monitor');
  eq(S2.kind(), 'monitor', '改選 Monitor');
  ok(S2.i2cOptDisabled() === true, 'Monitor 但沒連 I2C ⇒ 仍然反白（連線是另一個條件）');
  ok(/I2C 連線鈕/.test(S2.whyText()), 'Monitor 未連線時的理由換成「需先按 I2C 連線鈕」', S2.whyText());
  eq(S2.pick(), 'pc', '出圖方式仍然停在 PC（反白的那一項選不進去）');

  doc.getElementById('dgm-src-cancel').click();
  ok(S2.cardOpen() === false, '取消之後卡片收起來');
  ok(S2.confirmed() === false, '🔴 取消不會留下「已確認」狀態');
  eq(S2.sourceId(), 'pc', '取消之後出圖來源沒有被改掉');
}

console.log('── 10. 實測主控台的互動（走真的 click）────────────────────');
{
  const d = dom.window.document;
  ok(pageErrors.length === 0, '頁面載入沒有任何 JS 例外', JSON.stringify(pageErrors));
  ok(P.panelOpen() === false, '面板初始是收起來的');
  d.getElementById('dgm-i2c-open').click();
  ok(P.panelOpen() === true, '按「實測」之後面板打開');
  ok(d.getElementById('dgm-i2c-probe').disabled === true, '未連線 ⇒「讀四個觀測點」停用');
  ['dgm-i2c-enter', 'dgm-i2c-white', 'dgm-i2c-mid', 'dgm-i2c-black', 'dgm-i2c-restore'].forEach(id => {
    ok(d.getElementById(id).disabled === true,
      id + ' 未連線時停用（🔴 寫入類一律要求「已連線 ＋ IC 已識別 ＋ 這顆 IC 的出圖路徑驗過」）');
  });
  /* 🔴 v1.60.0：三個下拉收斂掉了。這裡驗的是「真的不見了」＋「改成唯讀的一行」
     —— 只驗新的東西在、不驗舊的東西不在，等於沒擋住回頭路。 */
  ['dgm-i2c-slave', 'dgm-i2c-ch', 'dgm-i2c-ack'].forEach(id => {
    ok(d.getElementById(id) === null, id + ' 下拉已移除（不再讓使用者選）');
  });
  {
    const fx = d.getElementById('dgm-i2c-fixed');
    ok(!!fx, '改成唯讀的「目前設定」欄位');
    ok(/Interface 0/.test(fx.textContent), '「目前設定」寫出 Interface 0', fx.textContent);
    ok(/0x60→0x61→0x68→0x69/.test(fx.textContent), '「目前設定」寫出 slave 掃描順序', fx.textContent);
    ok(/ACK 遮罩 0x81/.test(fx.textContent), '「目前設定」寫出 ACK 遮罩', fx.textContent);
  }
  /* 錯誤文案：舊的那句錯指引不可以再出現在 claim 失敗的說明裡 */
  /* 註解裡保留這句是刻意的（要寫清楚它為什麼錯），所以先把註解剝掉再驗。 */
  {
    const noComment = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    ok(!/請先關掉原廠 PQ Tool 再試/.test(noComment),
      '舊的錯誤指引「請先關掉原廠 PQ Tool 再試」已從程式與畫面移除（註解裡的說明不算）');
  }
  ok(/驅動/.test(P.claimHelp()), 'claim 失敗說明要講到驅動層', P.claimHelp());
  ok(/別的程式|其他程式|原廠 PQ Tool/.test(P.claimHelp()), 'claim 失敗說明也要保留「真的被程式佔用」那一種', P.claimHelp());
  /* 🔴 Bruce 的直覺是「驅動有裝就該能用」，文案要正面回答這一點，
     否則他會一直往「是不是驅動沒裝好」的方向找。 */
  ok(/驅動裝得好好的|驅動沒裝/.test(P.claimHelp()),
    'claim 失敗說明要講清楚「驅動有裝 ≠ 網頁碰得到」', P.claimHelp());
  ok(/三條路|WebUSB/.test(P.claimHelp()), 'claim 失敗說明要指出瀏覽器只有那三個 API', P.claimHelp());
  /* 四個平台分支都要說得出話，不能有一條回傳空字串 */
  ok(P.claimHelp().length > 80, 'claim 失敗說明不是空的');
  ok(d.getElementById('dgm-i2c-out').textContent.length > 0, '原始交易 log 區有初始文字');
  /* 三個觀測點的欄位要真的在表上，而且初始是「還沒讀」 */
  ['dgm-i2c-v-id', 'dgm-i2c-v-agm', 'dgm-i2c-v-ag', 'dgm-i2c-v-ptg', 'dgm-i2c-v-agen'].forEach(id => {
    const e = d.getElementById(id);
    ok(!!e && e.textContent === '—' && /\bna\b/.test(e.className), id + ' 初始是「還沒讀」');
  });
  d.getElementById('dgm-i2c-close').click();
  ok(P.panelOpen() === false, '按「關閉」之後面板收起');
}

/* ── 11. helper（WebSocket）傳輸與下載入口（v1.61.0）──────────────────── */
console.log('── 11. helper（ws）傳輸與下載入口（v1.61.0）───────────────');
{
  const d = dom.window.document;
  if (typeof P.transport === 'function') {
  ok(P.transport() === 'usb', '開頁預設 transport 是 usb（起始狀態不變，R4）');
  ok(P.hasWsFns() === true, 'ws 連線／讀／寫／掃描辨識四個函式都在');
  ok(/^ws:\/\/127\.0\.0\.1:\d+\/ws$/.test(P.wsUrl()), 'helper WebSocket URL 綁 loopback', P.wsUrl());
  ok(P.helperNeedProto() === 1, '本頁需要的 helper 協定版本 = 1');
  const meta = P.helperMeta();
  ok(/^[0-9a-f]{64}$/.test(meta.zipSha), 'helper zip SHA256 是 64 碼十六進位', meta.zipSha);
  ok(/^[0-9a-f]{64}$/.test(meta.exeSha), 'helper exe SHA256 是 64 碼十六進位', meta.exeSha);
  ok(meta.zipSha !== meta.exeSha, 'zip 與 exe 的 SHA256 不同（不是複製貼上）');
  ok(/^data\/dg-helper-.*\.zip$/.test(meta.zip), 'helper 下載指向 data/ 的 zip', meta.zip);
  ok(/^v\d+\.\d+\.\d+$/.test(meta.ver), 'helper 版本字串格式正確', meta.ver);
  /* loopback 自動連線判斷（v1.62.0）：只在本機 host 觸發，GitHub Pages 不動 */
  if (typeof P.isLoopback === 'function') {
    ok(P.isLoopback('127.0.0.1') === true, 'isLoopback 認得 127.0.0.1');
    ok(P.isLoopback('localhost') === true, 'isLoopback 認得 localhost');
    ok(P.isLoopback('brucecheng0428.github.io') === false, 'isLoopback 對 GitHub Pages 回 false（既有行為不變）');
    ok(P.isLoopback('example.invalid') === false, 'isLoopback 對其他網域回 false');
  } else {
    ok(false, 'isLoopback 探針缺');
  }
  /* ── Bug B（v1.65.0）：主 I2C 鈕 off→on 要走「上次那條」──────────────── */
  if (typeof P.onTarget === 'function') {
    ok(P.onTarget(true, 'ws') === 'off', '連著時按主鈕＝關（不論上次哪條）');
    ok(P.onTarget(true, 'usb') === 'off', '連著時按主鈕＝關（usb）');
    ok(P.onTarget(false, 'ws') === 'ws', '🔴 上次是 helper ⇒ off 後再按主鈕自動走 helper（Bug B 修正）');
    ok(P.onTarget(false, 'usb') === 'usb', '上次是 WebUSB ⇒ 走 WebUSB');
    ok(P.onTarget(false, null) === 'usb', '從未連過 ⇒ 預設 WebUSB');
    ok(P.lastTransport() === null, '開頁時 lastTransport 尚未設定（還沒連過）');
  } else {
    ok(false, 'onTarget 探針缺（Bug B 修正沒接上）');
  }
  /* ── 通訊自檢黃金向量（v1.65.0，Bruce 的 A1 D8 FB）─────────────────────── */
  if (typeof P.commVerdict === 'function') {
    ok(P.commSlave() === 0x68, '通訊自檢 slave 固定 0x68', '得到 0x' + P.commSlave().toString(16));
    ok(JSON.stringify(P.commExpect()) === JSON.stringify([0xA1, 0xD8, 0xFB]), '通訊自檢期望值 A1 D8 FB');
    ok(P.commVerdict([0xA1, 0xD8, 0xFB]).state === 'pass', '讀到 A1 D8 FB ⇒ PASS');
    ok(/PASS/.test(P.commVerdict([0xA1, 0xD8, 0xFB]).text), 'PASS 文字含 PASS');
    ok(P.commVerdict([0x01, 0x02, 0x03]).state === 'mismatch', '讀到別的三個 byte ⇒ FAIL 不符');
    ok(/實際 01 02 03/.test(P.commVerdict([0x01, 0x02, 0x03]).text), '🔴 不符時如實顯示實際讀到的 byte，不美化');
    ok(P.commVerdict([]).state === 'noread', '空陣列 ⇒ FAIL 讀不到');
    ok(P.commVerdict([0xA1]).state === 'noread', '不足 3 byte ⇒ FAIL 讀不到（不是 PASS）');
    ok(P.commVerdict([0xA1, 0xD8]).state === 'noread', '只 2 byte ⇒ FAIL 讀不到');
  } else {
    ok(false, 'commVerdict 探針缺（通訊自檢沒接上）');
  }
  /* ── slave 7-bit/8-bit 標示（Bruce 2026-09-18）───────────────────────── */
  if (typeof P.slaveLabel === 'function') {
    ok(P.slaveLabel(0x68) === '0x68 (7-bit) = 0xD0/0xD1 (8-bit W/R)', 'slaveLabel(0x68) 標出 7-bit＋8-bit', P.slaveLabel(0x68));
    ok(P.slaveLabel(0x60) === '0x60 (7-bit) = 0xC0/0xC1 (8-bit W/R)', 'slaveLabel(0x60) 正確', P.slaveLabel(0x60));
    ok(P.slaveLabel(0x69) === '0x69 (7-bit) = 0xD2/0xD3 (8-bit W/R)', 'slaveLabel(0x69) 正確', P.slaveLabel(0x69));
  } else {
    ok(false, 'slaveLabel 探針缺（7-bit/8-bit 標示沒接上）');
  }
  /* DOM：連線鈕、狀態、下載連結、SHA 欄位、SmartScreen、通訊自檢鈕 */
  ok(!!d.getElementById('dgm-i2c-comm-btn'), '通訊自檢按鈕在 DOM 上');
  ok(!!d.getElementById('dgm-i2c-comm'), '通訊自檢結果欄在 DOM 上');
  d.getElementById('dgm-i2c-open').click();
  ok(!!d.getElementById('dgm-i2c-ws'), '「透過 helper 連線」按鈕在 DOM 上');
  ok(!!d.getElementById('dgm-i2c-ws-state'), 'helper 狀態欄在 DOM 上');
  {
    const dl = d.getElementById('dgm-i2c-helper-dl');
    ok(!!dl && /dg-helper-.*\.zip(\?|$)/.test(dl.getAttribute('href')), '下載連結指向 helper zip', dl && dl.getAttribute('href'));
    const zs = d.getElementById('dgm-i2c-helper-zipsha');
    ok(!!zs && zs.textContent === meta.zipSha, '下載區顯示 zip SHA256');
    const es = d.getElementById('dgm-i2c-helper-exesha');
    ok(!!es && es.textContent === meta.exeSha, '下載區顯示 exe SHA256');
  }
  {
    const panel = d.getElementById('dgm-i2c-panel');
    const t = panel ? panel.textContent : '';
    /* 🔴 v1.66.0 反轉：Bruce 2026-09-18「說明文字越少越好，讓使用者無腦使用」。
       原本這裡驗的是「面板有沒有寫 SmartScreen／狀態字母表／解壓流程」——
       那些**現在必須不在畫面上**。所以這一組改成反向斷言，
       並把「診斷能力有沒有被一起砍掉」另外釘住（log 與 console 不減）。 */
    ok(!/SmartScreen/.test(t), '🔴 面板上不再有 SmartScreen 那一段（收進 log／README）');
    ok(!/仍要執行/.test(t), '🔴 面板上不再有「其他資訊 → 仍要執行」的步驟列');
    ok(!/ftd2xx/.test(t), '🔴 狀態字母對照表已從畫面上移除（Bruce：對照表不用給我）');
    ok(!/壓縮檔預覽/.test(t), '🔴 解壓流程的長說明已移除');
    ok(/未經實機驗證/.test(t), '🔴 但「未經實機驗證」這句**保留** —— 它不是說明，是誠實標示');
    /* 🔴 v1.66.1：連「解壓整包」那一句也從畫面上拿掉了 —— 改成**按下下載才跳**
       的說明視窗（Bruce：「按下下載以後，會跳出說明視窗…文字大一點」）。 */
    ok(!/解壓整包到一個資料夾/.test(t), '🔴 按鈕旁不再有任何步驟說明');
    {
      const how = d.getElementById('dgm-howto');
      ok(!!how && how.classList.contains('dgm-hidden'), '說明視窗預設不出現');
      d.getElementById('dgm-i2c-helper-dl').click();
      ok(!how.classList.contains('dgm-hidden'), '🔴 按下下載 ⇒ 說明視窗出現');
      const li = how.querySelector('li');
      const big = parseFloat(dom.window.getComputedStyle(li).fontSize);
      ok(big >= 20, '🔴 說明視窗的字夠大：' + big + 'px（面板內文 13px）');
      ok(how.querySelectorAll('li').length <= 3, '步驟三行以內');
      d.getElementById('dgm-howto-ok').click();
      ok(how.classList.contains('dgm-hidden'), '一鍵關得掉');
    }
    ok(d.querySelectorAll('a[download]').length === 1, '🔴 整頁只有一個下載入口');
    {
      const more = d.getElementById('dgm-i2c-more');
      ok(!!more && more.tagName === 'DETAILS', '說明收在 <details> 裡，預設不展開');
      ok(!more.open, '🔴 預設畫面上只留要按的東西（details 沒有 open）');
    }
    /* v1.3.0：主下載改不加密，頁面不應把「密碼 1234」當作解壓步驟 */
    const dlHref = (d.getElementById('dgm-i2c-helper-dl') || {}).getAttribute ? d.getElementById('dgm-i2c-helper-dl').getAttribute('href') : '';
    /* 🔴 2026-09-18 起不再寫死版本字串。寫死的後果實測過：helper 換到 v1.4.0 時
       這兩條變成「擋住正確的改動」，而它們本來想擋的是「連結指到不存在的檔案」。
       改成釘住那件真正該成立的事 ——
         ① 連結、helperMeta.zip、版號徽章三者版本一致（三處各自硬編是舊病）
         ② 連結指到的 zip **在 repo 裡真的存在**（這是寫死版本永遠驗不到的一點） */
    const verInHref = (dlHref.match(/dg-helper-(v\d+\.\d+\.\d+)\.zip/) || [])[1];
    ok(!!verInHref, '下載連結是 dg-helper-vX.Y.Z.zip 的形式', dlHref);
    ok(verInHref === meta.ver, '下載連結版本 === helperMeta.ver', verInHref + ' vs ' + meta.ver);
    ok(meta.zip === 'data/dg-helper-' + meta.ver + '.zip', 'helperMeta.zip 與 ver 一致', meta.zip);
    ok(fs.existsSync(path.join(repoDir, meta.zip)), '🔴 連結指到的 zip 檔在 repo 裡真的存在', meta.zip);
    ok(/[?&]v=/.test(dlHref), '下載連結帶 cache buster ?v=', dlHref);
    /* SHA 欄位要是 64 碼十六進位，不能是佔位字串（貼錯就會變成沒法核對） */
    ok(/^[0-9a-f]{64}$/.test(meta.exeSha), 'exe SHA 是 64 碼 hex', meta.exeSha);
    ok(/^[0-9a-f]{64}$/.test(meta.zipSha), 'zip SHA 是 64 碼 hex', meta.zipSha);
    {
      const crypto = require('crypto');
      const real = crypto.createHash('sha256').update(fs.readFileSync(path.join(repoDir, meta.zip))).digest('hex');
      ok(real === meta.zipSha, '🔴 頁面上寫的 zip SHA === 該 zip 的實際 SHA', real);
    }
  }
  d.getElementById('dgm-i2c-close').click();
  } else {
    ok(false, 'window.dgmI2cProbe.transport 不存在（v1.61.0 的 ws 探針沒接上？）');
  }
}

console.log('── 13. 極簡準則：非 debug 看不到診斷用的東西（v1.66.1）──');
{
  const d3 = dom.window.document;
  const P2 = P;
  /* 面板本身是對話框，前一組把它關掉了 —— 不先打開的話這裡量到的
     「看不見」是被面板關著造成的，不是 debug 造成的。 */
  d3.getElementById('dgm-i2c-open').click();
  P2.setDebug(false);
  /* 🔴 要看**整條祖先鏈**，不能只看元素自己的 computed display ——
     display 不會繼承，父層 display:none 時子元素自己算出來的還是 inline-block。
     這正是上一輪「class 加了畫面照樣顯示」的同一類錯，只是換到測試這一側。 */
  function shown(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = dom.window.getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (n.classList && n.classList.contains('dgm-hidden')) return false;
    }
    return true;
  }
  const diag = ['dgm-i2c-probe', 'dgm-i2c-comm-btn', 'dgm-i2c-copy', 'dgm-i2c-cross-pat'];
  diag.forEach(id => ok(!shown(d3.getElementById(id)), '🔴 非 debug 下 ' + id + ' 看不到'));
  ok(dom.window.getComputedStyle(d3.getElementById('dgm-i2c-more')).display === 'none',
    '🔴 說明摺疊區整個收進 debug');
  /* 🔴 127.0.0.1 在非 debug 的可見文字裡一個字都不能有（log 例外） */
  function vis(root) {
    let out = '';
    const w = d3.createTreeWalker(root, dom.window.NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) {
      const p = w.currentNode.parentElement;
      if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
      let hid = false;
      for (let n = p; n; n = n.parentElement) {
        if (n.id === 'dgm-log' || n.id === 'dgm-i2c-out') { hid = true; break; }
        const cs = dom.window.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') { hid = true; break; }
        if (n.classList && n.classList.contains('dgm-hidden')) { hid = true; break; }
        if (n.tagName === 'DETAILS' && !n.open) { hid = true; break; }
      }
      if (!hid) out += w.currentNode.nodeValue;
    }
    return out;
  }
  const t3 = vis(d3.getElementById('dgm-i2c-panel'));
  ok(t3.indexOf('127.0.0.1') < 0, '🔴 非 debug 的可見文字裡沒有 127.0.0.1');
  ok(t3.indexOf('通訊自檢') < 0, '🔴 非 debug 看不到「通訊自檢」');
  P2.setDebug(true);
  diag.forEach(id => ok(shown(d3.getElementById(id)), 'debug 打開後 ' + id + ' 回來'));
  P2.setDebug(false);
  d3.getElementById('dgm-i2c-close').click();
}

console.log('── 12. 十字、解析度與中心座標（v1.66.0）───────────────────');
/* 中心座標＝解析度/2，floor。PQ Tool 的 `_Resolution_X / 2` 是 C# 整數除法
   （ICCommonFunction.cs L2978–2979），奇數時同樣往下取。 */
eq(P.center(1920, 1080), { x: 960, y: 540 }, '1920×1080 ⇒ 中心 (960, 540)');
eq(P.center(2560, 1440), { x: 1280, y: 720 }, '2560×1440 ⇒ 中心 (1280, 720)');
eq(P.center(1921, 1081), { x: 960, y: 540 }, '🔴 奇數往下取（與 C# 整數除法一致）');
eq(P.center(1, 1), { x: 0, y: 0 }, '極小值不爆');
/* SetCursorON(h_loc, w_loc) 的 4 個 byte：[w&FF, w>>8, h&FF, h>>8]
   —— 對上 tm 的 reg_cur_xpos(0xFF22/23) 與 reg_cur_ypos(0xFF24/25) */
eq(P.packXY(960, 540), [0xC0, 0x03, 0x1C, 0x02], '🔴 (960,540) ⇒ C0 03 1C 02（x 低位在前，再來 y）');
eq(P.packXY(0, 0), [0, 0, 0, 0], '(0,0) ⇒ 全 0');
eq(P.packXY(4095, 4095), [0xFF, 0x0F, 0xFF, 0x0F], '4095 ⇒ FF 0F（13-bit 欄位，高位只有 5 bit 可用）');
/* reg_tmg_hres/vres 是 12-bit ⇒ 最大 4095。讀回超界或 0 一律不採用。 */
ok(P.resSane(1920, 1080) === true, '1920×1080 合理');
ok(P.resSane(0, 0) === false, '🔴 0×0 不合理（暫存器沒被寫過就是 0）');
ok(P.resSane(4096, 1080) === false, '🔴 4096 超出 12-bit 值域 ⇒ 不合理');
ok(P.resSane(1920, 4096) === false, '高度同理');
ok(P.resSane(100, 1080) === false, '太小不合理');
/* 18 組預設逐項照抄 Form1.GetResolutionSetting L1036–1109 */
const pres = P.resPresets();
eq(pres.length, 18, '解析度預設 18 組（PQ Tool 的 case 0–17）');
eq(pres[0], [1920, 1080], 'case 0 ＝ 1920×1080');
eq(pres[10], [3840, 2160], 'case 10 ＝ 3840×2160');
eq(pres[17], [7680, 4800], 'case 17 ＝ 7680×4800');
/* DOM：新控制項都要在，而且未連線時是 disabled（不會對空氣寫） */
['dgm-i2c-gray', 'dgm-i2c-graynum', 'dgm-i2c-graygo', 'dgm-i2c-r255', 'dgm-i2c-g255',
 'dgm-i2c-b255', 'dgm-i2c-cross-on', 'dgm-i2c-cross-off', 'dgm-i2c-cross-pat',
 'dgm-i2c-res', 'dgm-i2c-center'].forEach(id => {
  ok(!!dom.window.document.getElementById(id), id + ' 在 DOM 上');
});
{
  const d2 = dom.window.document;
  ['dgm-i2c-graygo', 'dgm-i2c-r255', 'dgm-i2c-cross-on', 'dgm-i2c-cross-pat'].forEach(id => {
    ok(d2.getElementById(id).disabled === true, '🔴 未連線時 ' + id + ' 是 disabled');
  });
  const sel = d2.getElementById('dgm-i2c-res');
  eq(sel.options.length, 19, '解析度下拉 18 組預設＋自訂');
  eq(sel.options[18].value, 'custom', '最後一項是自訂');
  /* 🔴 驗的是**算出來的 display**，不是「class 加上了沒有」。
     本頁的 .dgm-hidden 是逐個 id 各寫一條規則，新元素加了 class 卻沒有對應
     規則時，`classList.contains()` 照樣是 true 而畫面照樣顯示 ——
     v1.66.0 第一版就是這樣，靠實際截圖才看出來。 */
  const disp = id => dom.window.getComputedStyle(d2.getElementById(id)).display;
  ok(disp('dgm-i2c-alt') === 'none',
    '🔴 撞號的「改用另一顆序列」出口平常**算出來就是 none**（錯誤才說話）：' + disp('dgm-i2c-alt'));
  ok(disp('dgm-i2c-err') === 'none', '🔴 錯誤行平常 display:none：' + disp('dgm-i2c-err'));
  ok(disp('dgm-i2c-resw') === 'none' && disp('dgm-i2c-resh') === 'none',
    '🔴 選了預設解析度時，自訂寬高兩個輸入框是 none');
  ok(disp('dgm-i2c-upd') === 'none', '🔴 「有新版」那一行平常是 none');
}
/* 忙碌鎖：函式在，而且沒連線時是 no-op（不可以丟例外把量測打斷） */
ok(typeof P.hasLock === 'function' && P.hasLock() === true, 'dgmI2cLock 已接上');
ok(P.lockNoop() === true, '🔴 沒連線時 dgmI2cLock 不丟例外（它是保護，不是功能）');

console.log('');
console.log(fail === 0 ? ('✅ 全部通過：' + pass + ' 項') : ('🔴 不通過：' + fail + ' 項失敗 / 共 ' + (pass + fail) + ' 項'));
process.exit(fail === 0 ? 0 : 1);
