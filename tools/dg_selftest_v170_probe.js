/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v170_probe.js — dgself v1.7.0 的驗收夾具（jsdom）

   Bruce 2026-09-21（EM02 機台實測「讀回來的值是錯的」之後）交辦：
     ① 記憶體 slave 改成逐顆查表（EM02／E512 是 0x48，不是「暫存器 slave − 0x10」）
     ② **even/odd 交錯**：EM02 逐筆（idx%2）、EM01 每 4 筆（idx/4%2）
     ③ 每 channel 位移逐顆不同（EM02 0x800、EM01 0x2000）
     ④ 每筆 4 byte、`((byte1<<8) & mask) | byte0`，**+2／+3 忽略**
     ⑤ mask：EM01 固定 0x0F00；EM02／E512 依深度旗標（10-bit 0x0300 / 12-bit 0x0F00）
     ⑥ 移除 18 種 packing 候選與吻合度評分
     ⑦ 認不到 IC／讀不到深度 ⇒ 明確顯示原因並**停住**

   ═══ 🔴 這支夾具怎麼避免「自己驗自己」════════════════════════════════════
   ① 假 SRAM 的 writer（`buildSram`）是**本檔獨立寫的**，產品端只有 reader。
   ② even 區與奇 區放**可辨識且不同**的值（0x100+i vs 0x200+i），所以「沒做交錯、
      照順序讀」這個舊行為會解出一段明顯錯的序列，不是差一兩筆。
   ③ `dstLutDecodeCh` 另有一組**手寫預期值**的小測（不套任何公式）。
   ④ 每筆的 byte+2／+3 一律塞 0xA5／0x5A：產品若沒忽略就會解錯。
   ⑤ 最後兩組是**突變測試**：把產品端的交錯式與 mask 各改壞一次，對應的斷言
      必須變紅 —— 證明這些斷言真的在驗東西。

   🔴 **沒驗到的（誠實列在這裡，不要在回報裡含糊過去）**：
      真治具、真 TCON、真 AHB 視窗。這台 Mac 沒有硬體 ⇒ I2C 那一段全部是假的
      WebSocket。這支能證明的是「位址計畫與交錯解碼符合原廠源碼寫的規格」，
      **不能**證明真機讀得回來，也不能證明那份規格本身沒抄錯。

   用法：node tools/dg_selftest_v170_probe.js
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
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 58 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HEX = n => '0x' + n.toString(16).toUpperCase();

function inline(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');

/* ── 逐顆的規格（本檔自己寫一份，不從產品端讀）─────────────────────────────
   這一份的數字全部來自 Bruce 轉述的原廠源碼 App/Table/RApp_Table.cpp。
   產品端若把任何一格改掉，第 ① 組就會紅。 */
const SPEC = {
  EM02A1: { memSlave: 0x48, chSpan: 0x800, oddOff: 0x400, group: 1, entries: 257, entryBits: 8,
            busAddr: 0x0001, busBit: 2, maskFromDepth: true },
  E512AX: { memSlave: 0x48, chSpan: 0x800, oddOff: 0x400, group: 1, entries: 257, entryBits: 8,
            busAddr: 0x0011, busBit: 1, maskFromDepth: true },
  EM01A1: { memSlave: 0x58, chSpan: 0x2000, oddOff: 0x1000, group: 4, entries: 1025, entryBits: 10,
            busAddr: 0x00A0, busBit: 5, maskFromDepth: false, mask: 0x0F00 }
};
const AHB = 0x40010000;

/* 本檔獨立寫的 writer：把三條 LUT 依規格擺進一張「絕對位址 → byte」的表。
   🔴 每筆的 byte+2／+3 一律塞 0xA5／0x5A —— 產品端若沒忽略就會解錯。 */
function buildSram(sp, r, g, b) {
  const mem = new Map();
  for (let ch = 0; ch < 3; ch++) {
    const vals = [r, g, b][ch];
    const chBase = AHB + ch * sp.chSpan;
    let ep = 0, op = 0;
    for (let i = 0; i < sp.entries; i++) {
      const even = Math.floor(i / sp.group) % 2 === 0;
      const base = even ? chBase : (chBase + sp.oddOff);
      const off = (even ? ep++ : op++) * 4;
      const v = vals[i];
      mem.set(base + off, v & 0xFF);
      mem.set(base + off + 1, (v >> 8) & 0xFF);
      mem.set(base + off + 2, 0xA5);
      mem.set(base + off + 3, 0x5A);
    }
  }
  return mem;
}
/* 可辨識的假表：偶數筆 0x100+i、奇數筆 0x200+i（**依該顆的交錯規則**分）。
   ⇒ 只要交錯解錯，前幾筆就會全部落在同一個 0x1xx 區段，一眼看得出來。 */
function markedTable(sp, chBias) {
  const a = [];
  for (let i = 0; i < sp.entries; i++) {
    const even = Math.floor(i / sp.group) % 2 === 0;
    a.push(((even ? 0x100 : 0x200) + (i & 0xFF) + chBias) & 0x0FFF);
  }
  return a;
}
function identity(entries, entryBits, depth) {
  const k = Math.pow(2, depth - entryBits), a = [];
  for (let i = 0; i < entries; i++) a.push(i * k);
  a[entries - 1] = Math.pow(2, depth) - 1;
  return a;
}

/* ── 假的 I2C Bridge ─────────────────────────────────────────────────────
   · 暫存器（awid 2）：一張 byte map，rawwrite 真的會改它
   · AHB（awid 4）：**只有 bus-enable 那一位是 1 時**才回 SRAM 內容，否則全 0x00
   ws.trace 收下每一則命令，供「位址對不對」「有沒有關回去」的斷言使用。 */
function makeBridge(opts) {
  opts = opts || {};
  const regs = Object.assign({}, opts.regs || {});
  const mem = opts.mem || new Map();
  const busAddr = opts.busAddr, busBit = opts.busBit;
  const trace = [];
  function regByte(a) { const v = regs[a]; return Array.isArray(v) ? v[0] : (v == null ? 0x00 : v); }
  const ws = {
    readyState: 1, onmessage: null, trace,
    send(txt) {
      const m = JSON.parse(txt);
      trace.push(m);
      let rep;
      if (m.type === 'read' && m.awid === 4) {
        const busOn = (busAddr == null) ? false : (((regByte(busAddr) >> busBit) & 1) === 1);
        const d = [];
        for (let i = 0; i < m.len; i++) {
          const a = ((m.addr >>> 0) + i) >>> 0;
          d.push(busOn ? (mem.has(a) ? mem.get(a) : 0x00) : 0x00);
        }
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'read') {
        const d = [];
        for (let i = 0; i < m.len; i++) {
          const src = regs[m.addr + i];
          d.push(Array.isArray(regs[m.addr]) ? (regs[m.addr][i] == null ? 0x00 : regs[m.addr][i])
                                             : (src == null ? 0x00 : src));
        }
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'rawwrite') {
        if (Array.isArray(regs[m.addr])) regs[m.addr] = m.data.slice();
        else regs[m.addr] = m.data[0];
        rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0, transferred: (m.data || []).length };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; },
    reg: a => regByte(a)
  };
  return ws;
}

async function load(opts) {
  opts = opts || {};
  const dom = new JSDOM(inline(opts.src || SRC), {
    url: 'https://example.invalid/dg-selftest.html', runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(140);
  const w = dom.window, P = w.dstProbe;
  if (opts.ws) {
    P.__attachFakeWs(opts.ws);
    P.setIcForTest(opts.ic || 'EM02A1', -1);
    P.setSlaveForTest(opts.slave == null ? 0x68 : opts.slave);
  }
  await sleep(20);
  return { dom, w, doc: w.document, P };
}

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① 規格查表：三顆的 slave／bus enable／位移／筆數／mask 逐格對
     🔴 這一組就是「不要再用任何推導公式」的釘子。
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 逐顆規格查表（不得再有推導）');
  {
    const { P } = await load({});
    const tbl = P.icTable();
    for (const key of Object.keys(SPEC)) {
      const ic = tbl.find(x => x.key === key), sp = SPEC[key], c = ic && ic.dgLut;
      CHECK(!!c, key + ' 有 dgLut 規格');
      if (!c) continue;
      EQ(c.memSlave, sp.memSlave, `${key}: 記憶體 slave = ${HEX(sp.memSlave)}`);
      EQ([c.busEn.addr, c.busEn.bit], [sp.busAddr, sp.busBit],
         `${key}: bus enable = ${HEX(sp.busAddr)} bit${sp.busBit}`);
      EQ(c.chSpan, sp.chSpan, `${key}: channel 位移 = ${HEX(sp.chSpan)}`);
      EQ(c.oddOff, sp.oddOff, `${key}: 奇數區位移 = ${HEX(sp.oddOff)}`);
      EQ(c.group, sp.group, `${key}: 每 ${sp.group} 筆換一次區段`);
      EQ(c.entries, sp.entries, `${key}: ${sp.entries} 筆`);
      EQ(c.mask, sp.maskFromDepth ? null : sp.mask,
         `${key}: mask ${sp.maskFromDepth ? '依深度旗標（null）' : HEX(sp.mask)}`);
      CHECK(!('busEn' in c) || !Array.isArray(c.busEn),
        `${key}: bus enable 只有一個（不再是候選清單）`);
    }
    /* 🔴 負向：舊的推導常數與候選機制必須整組消失 */
    CHECK(!/DST_LUT_MEM_DELTA\s*=/.test(SRC), '🔴 DST_LUT_MEM_DELTA 的定義已移除');
    CHECK(!/function dstLutCandidates/.test(SRC), '🔴 18 種 packing 候選（dstLutCandidates）已移除');
    CHECK(!/function dstLutScore/.test(SRC), '🔴 吻合度評分（dstLutScore）已移除');
    CHECK(!/function dstLutUnpackUniform/.test(SRC), '🔴 bit-packing 解包（dstLutUnpackUniform）已移除');
    CHECK(!/derived: reg slave/.test(SRC), '🔴「derived: reg slave − 0x10, no source row」那段註解已移除');
    CHECK(/RApp_Table\.cpp/.test(SRC), '🔴 換成指向原廠源碼行號的新註解（RApp_Table.cpp）');
    EQ(P.lutConst().stride, 4, '每筆 4 byte');
    EQ(P.lutConst().ahb, 0x40010000, 'AHB 視窗起點 0x40010000');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② even/odd 交錯與 mask（純函式，手寫預期值）
     ═══════════════════════════════════════════════════════════════════════ */
  H('② even/odd 交錯與 mask（純函式）');
  {
    const { P } = await load({});

    /* ── 交錯判定 ── */
    EQ([0, 1, 2, 3, 4].map(i => P.lutIsEven(i, 1)), [true, false, true, false, true],
       'group 1（EM02／E512）⇒ idx%2：偶奇偶奇偶');
    EQ([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => P.lutIsEven(i, 4)),
       [true, true, true, true, false, false, false, false, true],
       '🔴 group 4（EM01）⇒ idx/4%2：前 4 筆偶區、接著 4 筆奇區、再 4 筆偶區');

    /* ── 兩區各幾筆 ── */
    EQ(P.lutRegionCounts(257, 1), { even: 129, odd: 128 }, '257 筆逐筆交錯 ⇒ 偶 129、奇 128');
    EQ(P.lutRegionCounts(1025, 4), { even: 513, odd: 512 }, '1025 筆每 4 筆換 ⇒ 偶 513、奇 512');

    /* ── 🔴 手寫預期值：兩區放可辨識的值，逐筆核對（不套任何公式）── */
    /* even 區四筆：0x011,0x012,0x013,0x014；odd 區四筆：0x021,0x022,0x023,0x024
       每筆 4 byte，byte+2／+3 塞 0xFF（必須被忽略） */
    const mk = hi => [0x11, hi, 0xFF, 0xFF, 0x12, hi, 0xFF, 0xFF, 0x13, hi, 0xFF, 0xFF, 0x14, hi, 0xFF, 0xFF];
    const ev = mk(0x00), od = mk(0x02);
    EQ(P.lutDecodeCh(ev, od, 8, 1, 0x0F00),
       [0x011, 0x211, 0x012, 0x212, 0x013, 0x213, 0x014, 0x214],
       '🔴 group 1：偶區與奇區交替取，兩邊各自有獨立計數器');
    EQ(P.lutDecodeCh(ev, od, 8, 4, 0x0F00),
       [0x011, 0x012, 0x013, 0x014, 0x211, 0x212, 0x213, 0x214],
       '🔴 group 4：先把偶區連取 4 筆，再把奇區連取 4 筆');
    /* 🔴 負向：同一份 bytes 在兩種 group 下必須解出**不同**的順序 */
    CHECK(JSON.stringify(P.lutDecodeCh(ev, od, 8, 1, 0x0F00))
       !== JSON.stringify(P.lutDecodeCh(ev, od, 8, 4, 0x0F00)),
       '🔴 group 1 與 group 4 解出來不一樣（夾具分得出交錯規則）');

    /* ── mask ── */
    const hiFF = [0x34, 0xFF, 0xFF, 0xFF];
    EQ(P.lutDecodeCh(hiFF, hiFF, 1, 1, 0x0F00), [0xF34], '12-bit mask 0x0F00 ⇒ 高位只留 4 bit');
    EQ(P.lutDecodeCh(hiFF, hiFF, 1, 1, 0x0300), [0x334], '10-bit mask 0x0300 ⇒ 高位只留 2 bit');
    EQ(P.lutDecodeCh([0x00, 0x00, 0xFF, 0xFF], [], 1, 1, 0x0F00), [0x000],
       '🔴 byte+2／+3 是垃圾也不影響結果（它們被忽略）');
    EQ(P.lutMask({ mask: 0x0F00 }, 10), 0x0F00, 'EM01 的 mask 固定 0x0F00，不隨深度旗標變');
    EQ(P.lutMask({ mask: null }, 12), 0x0F00, 'EM02：深度旗標 12-bit ⇒ 0x0F00');
    EQ(P.lutMask({ mask: null }, 10), 0x0300, 'EM02：深度旗標 10-bit ⇒ 0x0300');
    EQ(P.lutMask({ mask: null }, null), null, '🔴 深度未知 ⇒ null（不預設一個 12-bit）');

    /* ── 越界不補 0 ── */
    EQ(P.lutDecodeCh([0x01, 0x00, 0, 0], [], 2, 1, 0x0F00), null,
       '🔴 資料不夠回 null，不補 0（補 0 會讓「沒資料」長得像「值是 0」）');

    /* ── 讀取計畫 ── */
    const em02 = { memSlave: 0x48, chSpan: 0x800, oddOff: 0x400, group: 1, entries: 257 };
    const p2 = P.lutPlan(em02, AHB);
    EQ(p2.length, 6, 'EM02：三個 channel × 兩個區段 = 6 段');
    EQ(p2.map(x => x.addr),
       [0x40010000, 0x40010400, 0x40010800, 0x40010C00, 0x40011000, 0x40011400],
       '🔴 EM02 六段的位址（channel 相距 0x800、奇數區 +0x400）');
    EQ(p2.map(x => x.len), [516, 512, 516, 512, 516, 512], 'EM02 每段長度 = 筆數 × 4');
    const em01 = { memSlave: 0x58, chSpan: 0x2000, oddOff: 0x1000, group: 4, entries: 1025 };
    const p1 = P.lutPlan(em01, AHB);
    EQ(p1.map(x => x.addr),
       [0x40010000, 0x40011000, 0x40012000, 0x40013000, 0x40014000, 0x40015000],
       '🔴 EM01 六段的位址（channel 相距 0x2000、bank +0x1000）');
    EQ(p1.map(x => x.len), [2052, 2048, 2052, 2048, 2052, 2048], 'EM01 每段長度');
    CHECK(p2.every(x => x.len <= em02.oddOff), 'EM02 每段都塞得進 0x400 的區段', p2.map(x => x.len));
    CHECK(p1.every(x => x.len <= em01.oddOff), 'EM01 每段都塞得進 0x1000 的 bank', p1.map(x => x.len));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 端到端：EM02（Bruce 的實測機台）
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 端到端 EM02：交錯的假 SRAM 逐筆解回來');
  {
    const sp = SPEC.EM02A1;
    const r = markedTable(sp, 0), g = markedTable(sp, 1), b = markedTable(sp, 2);
    const mem = buildSram(sp, r, g, b);
    /* 0x005D：bit0=1 DG 開、bit2=1 深度 12-bit、bit3=1 Target */
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x005D: 0x0D, 0x0001: 0x00 },
                            mem, busAddr: 0x0001, busBit: 2 });
    const { P, doc } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(30);

    const st = P.lutState();
    CHECK(!!st, '讀取成功');
    EQ(P.lutErr(), null, '沒有錯誤');
    if (st) {
      EQ(st.memSlave, 0x48, '🔴 走的是 0x48（不是暫存器 slave 0x68 − 0x10 = 0x58）');
      EQ(st.mask, 0x0F00, 'mask 依深度旗標 = 0x0F00');
      EQ(st.depth, 12, '深度 12-bit');
      EQ(st.entries, 257, '257 筆');
      EQ(st.r, r, '🔴 R 逐筆等於寫進假 SRAM 的那一條（257 筆全對）');
      EQ(st.g, g, '🔴 G 逐筆相符');
      EQ(st.b, b, '🔴 B 逐筆相符');
      /* 🔴 「沒做交錯、照順序讀」的舊行為長什麼樣 —— 必須與正解不同 */
      const naive = [];
      for (let i = 0; i < 257 && i < 256; i++) naive.push(r[i * 1]);
      CHECK(st.r[1] !== st.r[0] + 1, '🔴 第 1 筆來自奇數區（0x2xx），不是偶數區的下一格', [st.r[0], st.r[1]]);
      CHECK((st.r[0] & 0xF00) === 0x100 && (st.r[1] & 0xF00) === 0x200,
        '🔴 偶數筆落在 0x1xx、奇數筆落在 0x2xx（交錯真的解對了）', [HEX(st.r[0]), HEX(st.r[1])]);
    }

    /* 位址：六段、逐段明確給位址、slave 0x48 */
    const ahb = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    CHECK(ahb.length > 0, 'AHB 讀取真的發出去了', ahb.length);
    CHECK(ahb.every(m => m.slave === 0x48), '🔴 每一筆 AHB 讀取都走 slave 0x48');
    CHECK(ahb.every(m => m.len <= P.lutConst().chunk), '每一段不超過分段上限');
    const starts = [0x40010000, 0x40010400, 0x40010800, 0x40010C00, 0x40011000, 0x40011400];
    for (const s of starts) CHECK(ahb.some(m => m.addr === s), '有一筆從 ' + HEX(s) + ' 開始讀');
    const total = ahb.reduce((a, m) => a + m.len, 0);
    EQ(total, 516 * 3 + 512 * 3, '總讀取量 = 六段長度之和（不多讀也不少讀）');

    /* bus enable：設一次、清一次，而且真的清掉了 */
    const raws = ws.trace.filter(m => m.type === 'rawwrite' && m.addr === 0x0001);
    EQ(raws.length, 2, 'bus enable 只寫了兩筆（設起來、清回去）');
    EQ(raws[0].data, [0x04], '第一筆把 bit2 設起來');
    EQ(raws[1].data, [0x00], '第二筆把 bit2 清掉');
    EQ((ws.reg(0x0001) >> 2) & 1, 0, '🔴 讀完 bus enable 那一位被清回去了');

    /* 畫面：一眼看得出讀到什麼 */
    EQ(P.lutHidden('dst-lut-body'), false, '成功後內容區塊出現');
    CHECK((P.lutChartHtml() || '').indexOf('<svg') === 0, '曲線是真的畫出來的 SVG');
    EQ((P.lutChartHtml().match(/<path /g) || []).length, 3, 'R/G/B 三條線都畫了');
    /* 🔴 v1.7.2：「前後各 6 筆」那張預覽表已整個移除，原本掛在它身上的四條斷言
       （13 列／第一列／「…」那一列／最後一列）改掛到全表上 —— 值有沒有畫對
       還是要驗，只是驗的對象換成使用者真正要看的那張表。 */
    EQ(P.lutRowCount(), 257, '全表 257 列');
    EQ(P.lutRow(0), ['0', String(r[0]), String(g[0]), String(b[0])], '全表第一列 = index 0 的三個值');
    EQ(P.lutRow(256), ['256', String(r[256]), String(g[256]), String(b[256])], '全表最後一列 = index 256');
    /* ═══ 🔴 dgself v1.12.0：這一條的**方向反過來了**（Bruce 2026-09-21 指定）═══
       「我發現 DGLUT RGB 檢視，為什麼只有圖而沒有表呢？」「它不要有收折功能，
       而是永遠展開的。」
       ⇒ `<details id="dst-lut-det">` 整組移除，表格直接掛在畫面上。
       🔴 舊斷言寫的是 `…det.hasAttribute('open') === false`，元素一旦不存在就會
          丟 `TypeError` ⇒ **整支夾具從這一行起不再執行**（後面幾十項都不會跑，
          而且看起來像「只有一條紅」）。所以這裡改成**正面驗「表看得到」**：
          ① 收折容器不存在 ② 表格本體仍在 ③ 它不在任何 <details> 裡面。
       🔴 上面那三條（257 列／第一列／最後一列）一個字沒改 —— 表的內容本來就對，
          這一版只是讓它不再被收起來。 */
    EQ(doc.getElementById('dst-lut-det'), null, '🔴 v1.12.0：收折容器已移除（表不再收折）');
    const lutTb = doc.getElementById('dst-lut-tb');
    CHECK(!!lutTb, '🔴 v1.12.0：數值表本體仍在');
    CHECK(!!lutTb && !lutTb.closest('details'), '🔴 v1.12.0：數值表不在任何 <details> 裡 ⇒ 永遠展開');
    const cfgTxt = P.lutText('dst-lut-cfg');
    for (const frag of ['EM02A1', '0x48', '0x800', '0x400', '257', '0x0F00'])
      CHECK(cfgTxt.indexOf(frag) >= 0, '規格列印出 ' + frag, cfgTxt);
    CHECK(P.lutText('dst-lut-bususe').indexOf('0x0001') >= 0, 'bus enable 那一列印出 0x0001',
      P.lutText('dst-lut-bususe'));

    /* 🔴 移除的 UI 不得還在 */
    EQ(doc.getElementById('dst-lut-pick'), null, '🔴 解碼方式下拉已移除');
    EQ(doc.getElementById('dst-lut-candtb'), null, '🔴 候選分數表已移除');
    EQ(doc.getElementById('dst-lut-bus'), null, '🔴 bus enable 候選下拉已移除');
    EQ(doc.getElementById('dst-lut-fit'), null, '🔴 吻合度那一列已移除');
    EQ(doc.getElementById('dst-lut-prevtb'), null, '🔴 v1.7.2：前六筆／後六筆預覽表已移除');
    EQ(doc.getElementById('dst-lut-prevsum'), null, '🔴 v1.7.2：預覽表那一行說明已移除');

    /* 🔴 刻意不連動 DG 第 1 部分（這一輪仍然只做讀） */
    EQ(P.dgLutWired(), null, '🔴 dstDgLut 仍是 null —— 這一輪只做讀，不做寫、不連動');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 端到端：EM02 的 10-bit（mask 換成 0x0300）
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ EM02 10-bit：mask 跟著深度旗標換');
  {
    const sp = SPEC.EM02A1;
    /* 值刻意帶滿 12 bit，10-bit 模式下高兩位必須被遮掉 */
    const full = [];
    for (let i = 0; i < sp.entries; i++) full.push(0xFFF);
    const mem = buildSram(sp, full, full, full);
    /* 0x005D bit2 = 0 ⇒ 10-bit */
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x005D: 0x09, 0x0001: 0x00 },
                            mem, busAddr: 0x0001, busBit: 2 });
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(30);
    const st = P.lutState();
    CHECK(!!st, '讀取成功');
    if (st) {
      EQ(st.mask, 0x0300, '🔴 深度旗標 10-bit ⇒ mask 0x0300');
      EQ(st.depth, 10, '畫面上的深度標成 10-bit');
      EQ(st.r[0], 0x3FF, '🔴 0xFFF 被遮成 0x3FF（高兩位真的被 mask 掉）');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 端到端：EM01（每 4 筆換 bank、1025 筆、mask 固定 0x0F00）
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 端到端 EM01：idx/4%2 與固定 mask');
  {
    const sp = SPEC.EM01A1;
    const r = markedTable(sp, 0), g = markedTable(sp, 1), b = markedTable(sp, 2);
    const mem = buildSram(sp, r, g, b);
    /* 🔴 0x1160 bit1 = 0（深度旗標說 10-bit）—— EM01 的 mask 仍必須是 0x0F00 */
    const ws = makeBridge({ regs: { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x05, 0x00A0: 0x00 },
                            mem, busAddr: 0x00A0, busBit: 5 });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(60);
    const st = P.lutState();
    CHECK(!!st, 'EM01 讀取成功');
    if (st) {
      EQ(st.memSlave, 0x58, 'EM01 走 slave 0x58');
      EQ(st.entries, 1025, '1025 筆');
      EQ(st.group, 4, '每 4 筆換一次 bank');
      EQ(st.mask, 0x0F00, '🔴 深度旗標寫 10-bit，EM01 的 mask 仍固定 0x0F00（不隨旗標變）');
      EQ(st.r, r, '🔴 R 1025 筆逐筆相符');
      EQ(st.b, b, '🔴 B 1025 筆逐筆相符');
      CHECK((st.r[3] & 0xF00) === 0x100 && (st.r[4] & 0xF00) === 0x200,
        '🔴 第 0~3 筆在偶區（0x1xx）、第 4 筆起換到奇區（0x2xx）', [HEX(st.r[3]), HEX(st.r[4])]);
    }
    const ahb = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    CHECK(ahb.every(m => m.slave === 0x58), 'EM01 每一筆 AHB 讀取都走 slave 0x58');
    for (const s of [0x40010000, 0x40011000, 0x40012000, 0x40013000, 0x40014000, 0x40015000])
      CHECK(ahb.some(m => m.addr === s), '有一筆從 ' + HEX(s) + ' 開始讀');
    EQ((ws.reg(0x00A0) >> 5) & 1, 0, 'bus enable 清回去了');
    EQ(P.lutRowCount(), 1025, '全表 1025 列');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 端到端：E512（與 EM02 同路徑，只有 bus enable 不同）
     ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ 🔴 v1.9.0 改寫過的一組 —— 原因記在這裡供覆核 ═══════════════════════
     v1.7.0～v1.8.1 這一組驗的是「**E512 的 dgEn 沒有 depthBit** ⇒ 深度讀不到
     ⇒ 停在『深度未知』」。v1.9.0 從 C 原始碼把 depthBit 補上了
     （`E512/App/Table/RApp_Table.h:1569-1573` 的 struct ＋ `RApp_Table.cpp:10340`
       從 `BK_SYS+0x2F` 讀同一個 struct；`RApp_Common.h:9` BK_SYS=0x0000），
     所以那個前提**不再成立** —— 它不是壞掉，是被事實推翻了。

     🔴 刪改原則：**「停住」那一條規則一個字都沒放寬**，只是「什麼情況叫讀不到」
        變窄了。所以這一組改成三段，前兩段驗新走得通的路，第三段仍然把
        「真的讀不到 ⇒ 停住」釘在原位（改用匯流排沒回應 0xFF 製造）。
     ⚠ E512 的 LUT 讀取**尚未在真機驗過**（手邊沒有 E512 板子）。 */
  H('⑥ E512：bus enable 0x0011 bit1；深度旗標 0x002F bit2（v1.9.0 補上出處）');
  {
    const sp = SPEC.E512AX;
    const r = markedTable(sp, 0), g = markedTable(sp, 1), b = markedTable(sp, 2);
    const mem = buildSram(sp, r, g, b);
    /* (a) 0x002F = 0x01 ⇒ bit0 DG_EN=1、**bit2=0 ⇒ 10-bit** */
    const ws = makeBridge({ regs: { 0xFF00: [0x12, 0xE5, 0xA0], 0x002F: 0x01, 0x0011: 0x00 },
                            mem, busAddr: 0x0011, busBit: 1 });
    const { P } = await load({ ws, ic: 'E512AX' });
    await P.readDgLut();
    await sleep(30);
    const st = P.lutState();
    CHECK(!!st, '(a) 深度旗標 0 ⇒ 讀得出結果');
    if (st) {
      EQ(st.mask, 0x0300, '🔴 mask 0x0300（10-bit）');
      EQ(st.depth, 10, '畫面上標 10-bit');
      EQ(st.memSlave, 0x48, '走 slave 0x48（與 EM02 同路徑）');
      EQ(st.entries, 257, '257 筆');
      /* 🔴 mask 只遮**高位元組**（解碼是 `((b1 & maskHi) << 8) | b0`，見 ④ 那一組：
         0xFFF 在 0x0300 下解出 0x3FF，不是 0x300）。markedTable 的值高位元組是
         0x01／0x02，在 0x0300 下原樣通過 ⇒ 期望值就是原表。 */
      EQ(st.r, r, '🔴 R 逐筆相符');
      EQ(st.b, b, '🔴 B 逐筆相符');
    }
    const ahb = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    CHECK(ahb.length > 0 && ahb.every(m => m.slave === 0x48), 'AHB 讀取都走 slave 0x48');
    CHECK(ws.trace.some(m => m.type === 'rawwrite'), '🔴 bus enable（0x0011 bit1）有被開');
    EQ((ws.reg(0x0011) >> 1) & 1, 0, 'bus enable 清回去了');
  }
  {
    /* (b) 0x002F = 0x05 ⇒ bit2=1 ⇒ **12-bit**，mask 換成 0x0F00 */
    const sp = SPEC.E512AX;
    const full = [];
    for (let i = 0; i < sp.entries; i++) full.push(0xFFF);
    const mem = buildSram(sp, full, full, full);
    const ws = makeBridge({ regs: { 0xFF00: [0x12, 0xE5, 0xA0], 0x002F: 0x05, 0x0011: 0x00 },
                            mem, busAddr: 0x0011, busBit: 1 });
    const { P } = await load({ ws, ic: 'E512AX' });
    await P.readDgLut();
    await sleep(30);
    const st = P.lutState();
    CHECK(!!st, '(b) 深度旗標 1 ⇒ 讀得出結果');
    if (st) {
      EQ(st.mask, 0x0F00, '🔴 mask 0x0F00（12-bit）');
      EQ(st.depth, 12, '畫面上標 12-bit');
      EQ(st.r[0], 0xFFF, '🔴 0xFFF 在 12-bit 下原樣通過（對照 ④ 的 10-bit：同樣的 0xFFF 解成 0x3FF）');
    }
  }
  {
    /* (c) 🔴 **「真的讀不到就停住」這一條沒有被放寬** —— 匯流排沒回應（0xFF）時，
       dstReadDgEn 會把整包判成 idle ⇒ depth 仍然是 null ⇒ 必須停在同一個地方，
       錯誤鍵也必須還是 dst.lutErrDepth。 */
    const sp = SPEC.E512AX;
    const r = markedTable(sp, 0);
    const mem = buildSram(sp, r, r, r);
    const ws = makeBridge({ regs: { 0xFF00: [0x12, 0xE5, 0xA0], 0x002F: 0xFF, 0x0011: 0x00 },
                            mem, busAddr: 0x0011, busBit: 1 });
    const { P } = await load({ ws, ic: 'E512AX' });
    await P.readDgLut();
    await sleep(30);
    EQ(P.lutState(), null, '(c) 深度旗標讀不回來 ⇒ 沒有讀出結果');
    EQ(P.lutErr().stepKey, 'dst.lutErrDepth', '🔴 明講是「深度旗標讀不到」，不是別的步驟');
    EQ(ws.trace.filter(m => m.awid === 4).length, 0, '🔴 一個 AHB 讀取都沒發出去');
    EQ(ws.trace.filter(m => m.type === 'rawwrite').length, 0, '🔴 bus enable 也沒碰（停在讀深度那一步）');
    EQ(P.lutHidden('dst-lut-body'), true, '🔴 失敗 ⇒ 不畫任何曲線');
    CHECK((P.lutText('dst-say-lut') || '').length > 10, '說話行寫出原因', P.lutText('dst-say-lut'));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ 失敗路徑：一定講在哪一步，而且不畫曲線
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ 失敗路徑（🔴 不准畫一條猜出來的曲線）');
  {
    /* (a) AHB 視窗沒開 ⇒ 全 0x00 */
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x005D: 0x0D, 0x0001: 0x00 },
                            mem: new Map(), busAddr: 0x0001, busBit: 2 });
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(30);
    EQ(P.lutState(), null, '讀不到 ⇒ 沒有結果');
    EQ(P.lutErr().stepKey, 'dst.lutErrData', '🔴 失敗鍵指向「讀回來的不是資料」');
    EQ(P.lutErr().detail, 'allZero', '細節裡講出是 allZero（AHB 視窗沒開）');
    EQ(P.lutHidden('dst-lut-body'), true, '🔴 失敗 ⇒ 內容區塊整個不出現');
    EQ((ws.reg(0x0001) >> 2) & 1, 0, '失敗也要把 bus enable 清回去');
  }
  {
    /* (b) bus enable 那一位寫不進去（讀回來沒黏住） */
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x005D: 0x0D, 0x0001: 0x00 },
                            busAddr: 0x0001, busBit: 2 });
    /* 讓 0x0001 變成寫不進去的：rawwrite 照收但不改值 */
    const realSend = ws.send.bind(ws);
    ws.send = function (txt) {
      const m = JSON.parse(txt);
      if (m.type === 'rawwrite' && m.addr === 0x0001) {
        setTimeout(() => ws.onmessage({ data: JSON.stringify({ type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0 }) }), 0);
        ws.trace.push(m);
        return;
      }
      realSend(txt);
    };
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(30);
    EQ(P.lutErr().stepKey, 'dst.lutErrBus', '🔴 bit 寫不進去 ⇒ 明講是 bus enable 那一步');
    EQ(ws.trace.filter(m => m.awid === 4).length, 0, '🔴 沒開成就不去讀 AHB');
  }
  {
    /* (c) 沒連線 */
    const { P } = await load({});
    await P.readDgLut();
    await sleep(20);
    EQ(P.lutErr().stepKey, 'dst.lutErrLink', '沒連線 ⇒ dst.lutErrLink');
    EQ(P.lutState(), null, '沒讀任何東西');
  }
  {
    /* (d) 這一顆沒有 DG LUT 規格（VM02S1） */
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xF0], 0x008A: 0x01 } });
    const { P } = await load({ ws, ic: 'VM02AX' });
    await P.readDgLut();
    await sleep(20);
    EQ(P.lutErr().stepKey, 'dst.lutErrNoSpec', '🔴 沒有出處的顆 ⇒ 明講沒有規格，不拿別顆的位址去試');
    EQ(P.lutState(), null, '沒讀任何東西');
    EQ(ws.trace.filter(m => m.awid === 4).length, 0, '🔴 一個 AHB 讀取都沒發出去');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑧ i18n：本頁自己補的 key 三語齊全
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑧ i18n 三語（本頁補的 4 個 key）');
  {
    /* 🔴 v1.7.2：`dst.lutPreview` 隨預覽表一起刪掉了，所以不再檢查它的三語。 */
    const keys = ['dst.lutErrNoSpec', 'dst.lutErrBus', 'dst.lutErrData', 'dst.lutErrDepth'];
    const bad = [];
    for (const k of keys) {
      const i = SRC.indexOf("I18N['" + k + "']");
      if (i < 0) { bad.push(k + ':missing'); continue; }
      /* 🔴 結尾要找「行首縮排的 };」——譯文裡出現過 `{total};` 這種字串，
         用 indexOf('};') 會提早截斷，把後面的語言誤判成缺翻譯（實測過）。 */
      const block = SRC.slice(i, SRC.indexOf('\n  };', i));
      for (const lang of ['zh-TW', 'en', 'zh-CN']) if (block.indexOf("'" + lang + "'") < 0) bad.push(k + ':' + lang);
    }
    EQ(bad, [], `本頁補的 ${keys.length} 個 key 三語全部齊全`);
    /* 畫面上不得出現未翻譯的 key 原形 */
    const { P } = await load({});
    for (const id of ['dst-lut-state', 'dst-lut-cfg', 'dst-lut-bususe'])
      CHECK(!/^dst\.[a-zA-Z]+$/.test((P.lutText(id) || '').trim()), id + ' 沒有露出 i18n key 原形', P.lutText(id));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑨ 🔴 突變測試：把產品端改壞，對應的斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑨ 突變測試（證明夾具真的在驗東西）');
  {
    /* 突變 1：交錯式改成永遠逐筆（等於忽略 group）⇒ EM01 必須解錯 */
    const orig1 = 'function dstLutIsEven(i, group) { return Math.floor(i / group) % 2 === 0; }';
    CHECK(SRC.indexOf(orig1) > 0, '找得到交錯判定那一行');
    const m1 = SRC.replace(orig1, 'function dstLutIsEven(i, group) { return i % 2 === 0; }');
    const sp = SPEC.EM01A1;
    const r = markedTable(sp, 0);
    const mem = buildSram(sp, r, r, r);
    const ws = makeBridge({ regs: { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x07, 0x00A0: 0x00 },
                            mem, busAddr: 0x00A0, busBit: 5 });
    const { P } = await load({ ws, ic: 'EM01A1', src: m1 });
    await P.readDgLut();
    await sleep(60);
    const st = P.lutState();
    CHECK(!!st && JSON.stringify(st.r) !== JSON.stringify(r),
      '🔴 把 idx/4%2 改成 idx%2 ⇒ EM01 解出來就對不上（夾具不是假過）');
  }
  {
    /* 突變 2：把 mask 拿掉 ⇒ 10-bit 那一組必須變紅 */
    const orig2 = "out.push((((src[off + 1] & 0xFF) << 8) & mask) | (src[off] & 0xFF));";
    CHECK(SRC.indexOf(orig2) > 0, '找得到解碼那一行');
    const m2 = SRC.replace(orig2, "out.push((((src[off + 1] & 0xFF) << 8)) | (src[off] & 0xFF));");
    const { P } = await load({ src: m2 });
    const hiFF = [0x34, 0xFF, 0xFF, 0xFF];
    CHECK(JSON.stringify(P.lutDecodeCh(hiFF, hiFF, 1, 1, 0x0300)) !== JSON.stringify([0x334]),
      '🔴 把 mask 拿掉 ⇒ 10-bit 的斷言就不成立（mask 真的有被驗到）');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  process.exit(fail ? 1 : 0);
})();
