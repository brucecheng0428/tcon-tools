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

console.log('── 1. 位址白名單（正面／反面都驗）──────────────────────────');
const [lo, hi] = P.wrRange();
eq([lo, hi], [0x1200, 0x12FF], '允許範圍就是 ptg bank 0x1200–0x12FF');
// 反面：界外一律擋下
ok(!P.writeAllowed(0x11FF, 1), '0x11FF 要被擋（低一格）');
ok(!P.writeAllowed(0x1300, 1), '0x1300 要被擋（高一格）');
ok(!P.writeAllowed(0x02ED, 1), '0x02ED（reg_gpi_agmode）要被擋');
ok(!P.writeAllowed(0x0039, 1), '0x0039（reg_aging_en_inv）要被擋');
ok(!P.writeAllowed(0xFF00, 1), '0xFF00 要被擋');
ok(!P.writeAllowed(0x0000, 1), '0x0000 要被擋');
// 🔴 跨界：起點在範圍內但尾巴跑出去 —— 只看起點的寫法會在這裡漏掉
ok(!P.writeAllowed(0x12FF, 2), '0x12FF 寫 2 byte 要被擋（尾巴跨出去）');
ok(!P.writeAllowed(0x12FC, 5), '0x12FC 寫 5 byte 要被擋（尾巴跨出去）');
// 髒值
ok(!P.writeAllowed(0x1200, 0), '長度 0 要被擋');
ok(!P.writeAllowed(0x1200, -1), '負長度要被擋');
ok(!P.writeAllowed(0x1200 + 0.5, 1), '非整數位址要被擋');
ok(!P.writeAllowed(NaN, 1), 'NaN 要被擋');
ok(!P.writeAllowed('0x1200', 1), '字串位址要被擋');
// 正面：範圍內每一個位址、每一種長度都要放行
let inRangeAllOk = true, edgeOk = true;
for (let a = 0x1200; a <= 0x12FF; a++) if (!P.writeAllowed(a, 1)) inRangeAllOk = false;
for (let n = 1; n <= 5; n++) if (!P.writeAllowed(0x1200, n)) edgeOk = false;
ok(inRangeAllOk, '0x1200–0x12FF 共 256 個位址寫 1 byte 全部放行');
ok(edgeOk, '0x1200 寫 1~5 byte 全部放行');
ok(P.writeAllowed(0x12FB, 5), '0x12FB 寫 5 byte 剛好貼齊上界，要放行');
// 本功能真的會用到的五個位址，一個都不能被自己的防線擋掉
[[0x1200, 1], [0x1201, 1], [0x1238, 2], [0x123A, 2], [0x1240, 5]].forEach(([a, n]) => {
  ok(P.writeAllowed(a, n), '實際會用到的 ' + a.toString(16) + ' ×' + n + ' 必須放行');
});
// buildWrite 也要真的丟例外，不是只有 writeAllowed 說不行
let threw = false;
try { P.buildWrite(0x68, 0x02ED, [0x80]); } catch (e) { threw = /白名單/.test(e.message); }
ok(threw, 'buildWrite(0x02ED) 要丟例外（白名單在組裝指令之前就擋）');

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
eq(P.matchIc([0x02, 0xEF, 0xA0]).key, 'EM02A1', '02 EF Ax ⇒ EM02A1');
eq(P.matchIc([0x02, 0xEF, 0xF0]).key, 'VM02AX', '02 EF Fx ⇒ VM02AX');
eq(P.matchIc([0x12, 0xE5, 0xA0]).key, 'E512AX', '12 E5 Ax ⇒ E512AX');
ok(P.matchIc([0xAA, 0xBB, 0xCC]) === null, '認不出來要回 null（不要亂猜）');
ok(P.matchIc([0x01]) === null, '長度不足要回 null');
const tbl = P.icTable();
const em01 = tbl.filter(x => x.key === 'EM01A1')[0];
ok(em01.patternOk === true, 'EM01A1 允許出圖');
ok(tbl.filter(x => x.key !== 'EM01A1').every(x => !x.patternOk),
  '🔴 除了 EM01A1，其餘 IC 一律不允許 I2C 出圖（R4：先只做 EM01，其餘逐顆實機驗）');
eq([em01.soft.addr, em01.soft.and, em01.soft.or], [0x1200, 0xB3, 0x4C],
  'SetAgingMode(true) ＝ 讀 0x1200 → (reg & 0xB3) | 0x4C');
eq([em01.pat.addr, em01.pat.value], [0x1201, 58], 'pattern 編號 58（Edge）寫 0x1201');
eq([em01.xpos.addr, em01.ypos.addr, em01.inside.addr], [0x1238, 0x123A, 0x1240], 'xpos/ypos/inside 三個位址');
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
eq(S(false, true, null, false).text, 'I2C ON · 未知 IC', '已連線但 IC 不明');
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
    ok(false, 'P.isLoopback 不存在（v1.62.0 自動連線判斷沒接上）');
  }
  /* DOM：連線鈕、狀態、下載連結、SHA 欄位、密碼 1234、SmartScreen 說明 */
  d.getElementById('dgm-i2c-open').click();
  ok(!!d.getElementById('dgm-i2c-ws'), '「透過 helper 連線」按鈕在 DOM 上');
  ok(!!d.getElementById('dgm-i2c-ws-state'), 'helper 狀態欄在 DOM 上');
  {
    const dl = d.getElementById('dgm-i2c-helper-dl');
    ok(!!dl && /dg-helper-.*\.zip$/.test(dl.getAttribute('href')), '下載連結指向 helper zip', dl && dl.getAttribute('href'));
    const zs = d.getElementById('dgm-i2c-helper-zipsha');
    ok(!!zs && zs.textContent === meta.zipSha, '下載區顯示 zip SHA256');
    const es = d.getElementById('dgm-i2c-helper-exesha');
    ok(!!es && es.textContent === meta.exeSha, '下載區顯示 exe SHA256');
  }
  {
    const panel = d.getElementById('dgm-i2c-panel');
    const t = panel ? panel.textContent : '';
    ok(/1234/.test(t), '面板寫出解壓密碼 1234');
    ok(/SmartScreen/.test(t), '面板如實寫出 SmartScreen');
    ok(/未經實機驗證/.test(t), '面板如實標明 helper 未經實機驗證');
    ok(/仍要執行/.test(t), '面板寫出 SmartScreen 的「仍要執行」那一步');
  }
  d.getElementById('dgm-i2c-close').click();
  } else {
    ok(false, 'window.dgmI2cProbe.transport 不存在（v1.61.0 的 ws 探針沒接上？）');
  }
}

console.log('');
console.log(fail === 0 ? ('✅ 全部通過：' + pass + ' 項') : ('🔴 不通過：' + fail + ' 項失敗 / 共 ' + (pass + fail) + ' 項'));
process.exit(fail === 0 ? 0 : 1);
