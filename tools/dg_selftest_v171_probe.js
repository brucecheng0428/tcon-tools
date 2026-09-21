/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v171_probe.js — dgself v1.7.1 的驗收夾具（jsdom）

   Bruce 2026-09-21 在 **EM01 機台實測**：v1.7.0 讀 DG LUT「0~256 對，之後不對」。
   根因：v1.7.0 把 EM01 的筆數**寫死成 1025**，但 EM01 的筆數由 UI 上的
   `LUT_MODE`（暫存器欄位 `reg_dg_mode_sel`）決定。他的機台是 `5:DG-8bit`
   ⇒ 正確筆數是 **257**（index 0~256），第 257 筆以後讀到的是記憶體殘值。

   ═══ 這支夾具釘住的四件事 ═══════════════════════════════════════════════
   ① `reg_dg_mode_sel` 的位址與位元：**0x1170 bit[6:4]**
      （0x1160 BK_DGM_TOP ＋ struct 內位移 0x10；推算過程寫在 dg-selftest.html）
   ② mode 5 ⇒ 257 筆、mode 0 ⇒ 1025 筆，**筆數從暫存器來、不從常數來**
   ③ mode 1／2／3／4 ⇒ 停住，**一個 AHB 讀取都不發**
   ④ LUT_MODE 讀不到 ⇒ 停住，**不退回 1025**

   ═══ 🔴 怎麼避免「自己驗自己」════════════════════════════════════════════
   ① 假 SRAM 的 writer 是本檔獨立寫的，產品端只有 reader。
   ② 第 ③ 組是**正面重現 Bruce 的症狀**：SRAM 前 257 筆放真表、第 257 筆以後
      整片塞 0xFFF 殘值。產品若仍讀 1025 筆，結果的長度與尾巴都會不一樣。
   ③ 第 ⑧ 組是**突變測試**：把產品端「筆數取自 LUT_MODE」改回「取自 cfg.entries」
      （＝ v1.7.0 的錯），第 ③ 組的斷言必須變紅 —— 證明這條真的在驗東西。

   🔴 **沒驗到的（誠實列出）**：真治具、真 TCON、真 AHB 視窗。這台 Mac 沒有硬體
      ⇒ I2C 那一段全部是假的 WebSocket。這支能證明的是「筆數確實跟著 LUT_MODE
      走、其餘模式確實停住」，**不能**證明 0x1170 這個位址在真機上讀得回來。

   用法：node tools/dg_selftest_v171_probe.js
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

/* ── EM01 的規格（本檔自己寫一份，不從產品端讀）───────────────────────────
   筆數刻意**不寫在這裡**：它就是這一版要驗「從暫存器來」的那一格。 */
const EM01 = { memSlave: 0x58, chSpan: 0x2000, oddOff: 0x1000, group: 4,
               busAddr: 0x00A0, busBit: 5, mask: 0x0F00,
               modeAddr: 0x1170, modeShift: 4, modeWidth: 3 };
const AHB = 0x40010000;
/* LUT_MODE → 筆數。來源：App/Table/RApp_Table.cpp:11711-11772（Mode_Sel_Handler
   的 RowCount／Chart 上限／Table_size）＋ :17833-17876（Data_To_Bin_Gamma 的 1025／257）。 */
const MODE_ENTRIES = { 0: 1025, 5: 257 };
const MODE_NAME = { 0: 'DG-10bit', 1: 'MP-only', 2: 'DDG-8bit', 3: 'DDG', 4: 'Dynamic', 5: 'DG-8bit' };

/* 本檔獨立寫的 writer。`n` ＝ 要寫幾筆；`fillTo` ＝ 之後再用 `junk` 塞到第幾筆，
   用來重現「第 257 筆之後是殘值」的機台狀況。 */
function buildSram(n, vals, fillTo, junk) {
  const mem = new Map();
  const total = fillTo || n;
  for (let ch = 0; ch < 3; ch++) {
    const chBase = AHB + ch * EM01.chSpan;
    let ep = 0, op = 0;
    for (let i = 0; i < total; i++) {
      const even = Math.floor(i / EM01.group) % 2 === 0;
      const base = even ? chBase : (chBase + EM01.oddOff);
      const off = (even ? ep++ : op++) * 4;
      const v = (i < n) ? vals[ch][i] : junk;
      mem.set(base + off, v & 0xFF);
      mem.set(base + off + 1, (v >> 8) & 0xFF);
      mem.set(base + off + 2, 0xA5);
      mem.set(base + off + 3, 0x5A);
    }
  }
  return mem;
}
/* 可辨識的假表：偶數區 0x1xx、奇數區 0x2xx（依 group 4 的交錯規則分）。 */
function markedTable(n, chBias) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const even = Math.floor(i / EM01.group) % 2 === 0;
    a.push(((even ? 0x100 : 0x200) + (i & 0xFF) + chBias) & 0x0FFF);
  }
  return a;
}

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
    P.setIcForTest(opts.ic || 'EM01A1', -1);
    P.setSlaveForTest(opts.slave == null ? 0x68 : opts.slave);
  }
  await sleep(20);
  return { dom, w, doc: w.document, P };
}

/* EM01 的暫存器底圖：ID、DG_EN（0x1160）、bus enable（0x00A0）。
   `mode` 會被塞成 0x1170 那個 byte 的 bit[6:4]，低 4 位刻意放 slop_r_11_8 的
   殘值 0x0A，證明產品端有把不相干的位元遮掉。 */
function em01Regs(mode, opts) {
  opts = opts || {};
  const r = { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x05, 0x00A0: 0x00 };
  if (mode != null) r[0x1170] = opts.rawMode != null ? opts.rawMode : (0x0A | ((mode & 7) << 4));
  return r;
}

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① LUT_MODE 的規格查表（位址、位元、模式表）
     ═══════════════════════════════════════════════════════════════════════ */
  H('① LUT_MODE 規格（0x1170 bit[6:4] 與模式表）');
  {
    const { P } = await load({});
    const tbl = P.icTable();
    const em01 = tbl.find(x => x.key === 'EM01A1');
    const c = em01 && em01.dgLut;
    CHECK(!!c && !!c.modeSel, 'EM01 有 modeSel 規格');
    if (c && c.modeSel) {
      EQ(c.modeSel.addr, 0x1170, '🔴 reg_dg_mode_sel 位址 = 0x1170（0x1160 + struct 位移 0x10）');
      EQ(c.modeSel.shift, 4, '🔴 位元起點 = bit4');
      EQ(c.modeSel.width, 3, '🔴 欄位寬度 = 3 bit（RApp_Table.h:2042 `U8 reg_dg_mode_sel:3`）');
      CHECK(/BK_DGM_TOP/.test(c.modeSel.src || ''), 'modeSel 帶出處（BK_DGM_TOP）', c.modeSel.src);
    }
    CHECK(!!c && !!c.modes, 'EM01 有 modes 表');
    if (c && c.modes) {
      for (const k of ['0', '1', '2', '3', '4', '5'])
        CHECK(!!c.modes[k], '模式 ' + k + ' 在表裡（' + MODE_NAME[k] + '）');
      EQ(c.modes[0].entries, 1025, '模式 0（DG-10bit）⇒ 1025 筆');
      EQ(c.modes[5].entries, 257, '🔴 模式 5（DG-8bit）⇒ 257 筆 —— 這一格就是這次的 bug');
      EQ(c.modes[0].entryBits, 10, '模式 0 的 index 寬度 10 bit');
      EQ(c.modes[5].entryBits, 8, '模式 5 的 index 寬度 8 bit');
      EQ([1, 2, 3, 4].map(k => !!c.modes[k].dg), [false, false, false, false],
         '🔴 模式 1／2／3／4 標成「不是 DG LUT」');
      EQ([0, 5].map(k => !!c.modes[k].dg), [true, true], '模式 0／5 標成 DG LUT');
      /* 🔴 防止「留著的 cfg.entries」與 modes[0] 各自漂走 */
      EQ(c.entries, c.modes[0].entries, '🔴 cfg.entries 必須等於 modes[0].entries（不得分岔）');
      EQ(c.entryBits, c.modes[0].entryBits, '🔴 cfg.entryBits 必須等於 modes[0].entryBits');
    }
    /* EM02／E512 不該長出 modeSel（它們的 257 筆是固定的，與此無關） */
    for (const k of ['EM02A1', 'E512AX']) {
      const ic = tbl.find(x => x.key === k);
      EQ(ic.dgLut.modeSel, undefined, k + ' 沒有 modeSel（路徑完全沒被動到）');
      EQ(ic.dgLut.entries, 257, k + ' 仍是固定 257 筆');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 純函式：byte → 模式值 → 表長
     ═══════════════════════════════════════════════════════════════════════ */
  H('② 純函式：取位元與查表');
  {
    const { P } = await load({});
    const ms = { addr: 0x1170, shift: 4, width: 3 };
    EQ(P.lutModeOfByte(0x5A, ms), 5, '0x5A ⇒ bit[6:4] = 5（低 4 位 0xA 被遮掉）');
    EQ(P.lutModeOfByte(0x0F, ms), 0, '0x0F ⇒ 0（低 4 位不影響）');
    EQ(P.lutModeOfByte(0xFF, ms), 7, '0xFF ⇒ 7（bit7 也不算進來，只有 3 bit）');
    EQ(P.lutModeOfByte(0x8F, ms), 0, '🔴 bit7 是 1 也不會被算進模式值');
    EQ(P.lutModeOfByte(0x4A, ms), 4, '0x4A ⇒ 4');
    const cfg = P.icTable().find(x => x.key === 'EM01A1').dgLut;
    EQ(P.lutModeInfo(cfg, 5), { val: 5, name: 'DG-8bit', dg: true, entries: 257, entryBits: 8 },
       '🔴 模式 5 ⇒ 257 筆 / 8 bit / 是 DG');
    EQ(P.lutModeInfo(cfg, 0), { val: 0, name: 'DG-10bit', dg: true, entries: 1025, entryBits: 10 },
       '模式 0 ⇒ 1025 筆 / 10 bit / 是 DG');
    EQ(P.lutModeInfo(cfg, 2).dg, false, '模式 2（DDG-8bit）不是 DG');
    EQ(P.lutModeInfo(cfg, 2).entries, null, '模式 2 沒有筆數（不該有人拿它去算長度）');
    EQ(P.lutModeInfo(cfg, 7), null, '🔴 表外的值（7）回 null');
    EQ(P.lutModeText({ val: 5, name: 'DG-8bit' }), '5:DG-8bit',
       '🔴 畫面寫法與原廠 UI 下拉同形（5:DG-8bit）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 🔴 端到端：mode 5 ⇒ 257 筆（正面重現 Bruce 的機台）
        SRAM 裡第 257 筆以後整片是 0xFFF 殘值 —— 讀 1025 筆就會把它們畫出來。
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 🔴 mode 5:DG-8bit ⇒ 解出 257 筆（第 257 筆之後的殘值不得出現）');
  {
    const n = 257;
    const vals = [markedTable(n, 0), markedTable(n, 1), markedTable(n, 2)];
    const mem = buildSram(n, vals, 1025, 0x0FFF);   // 257 筆真表 ＋ 768 筆殘值
    const ws = makeBridge({ regs: em01Regs(5), mem, busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(60);

    const st = P.lutState();
    CHECK(!!st, '讀取成功');
    EQ(P.lutErr(), null, '沒有錯誤');
    if (st) {
      EQ(st.mode, 5, '🔴 讀到的 LUT_MODE = 5');
      EQ(st.modeName, 'DG-8bit', 'LUT_MODE 名稱 = DG-8bit');
      EQ(st.entries, 257, '🔴🔴 解出 257 筆（v1.7.0 是 1025 —— 這一條就是本版的修正）');
      EQ(st.entryBits, 8, 'index 寬度跟著模式變成 8 bit');
      EQ(st.mask, 0x0F00, 'EM01 的 mask 仍固定 0x0F00');
      EQ(st.r.length, 257, 'R 剛好 257 筆');
      EQ(st.r, vals[0], '🔴 R 逐筆等於寫進假 SRAM 的那一條');
      EQ(st.g, vals[1], '🔴 G 逐筆相符');
      EQ(st.b, vals[2], '🔴 B 逐筆相符');
      CHECK(st.r.indexOf(0x0FFF) < 0, '🔴 第 257 筆之後的殘值（0xFFF）一筆都沒混進來');
      CHECK((st.r[3] & 0xF00) === 0x100 && (st.r[4] & 0xF00) === 0x200,
        '🔴 group 4 的交錯照舊（0~3 偶區、4 起奇區）', [HEX(st.r[3]), HEX(st.r[4])]);
    }
    EQ(P.lutRowCount(), 257, '🔴 全表只有 257 列');

    /* 讀取量：257 筆 group 4 ⇒ 偶 129、奇 128 ⇒ 每 channel 516+512 */
    const ahb = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    EQ(ahb.reduce((a, m) => a + m.len, 0), (516 + 512) * 3,
       '🔴 總讀取量 = (516+512)×3（不是 1025 筆的 (2052+2048)×3）');
    CHECK(ahb.every(m => m.slave === 0x58), '每一筆 AHB 讀取都走 slave 0x58');
    EQ((ws.reg(0x00A0) >> 5) & 1, 0, 'bus enable 清回去了');

    /* LUT_MODE 那顆暫存器真的被讀了，而且是在開 bus enable 之前 */
    const modeRd = ws.trace.findIndex(m => m.type === 'read' && m.awid !== 4 && m.addr === 0x1170);
    const busWr = ws.trace.findIndex(m => m.type === 'rawwrite' && m.addr === 0x00A0);
    CHECK(modeRd >= 0, '🔴 真的去讀了 0x1170');
    CHECK(modeRd < busWr, '🔴 先讀 LUT_MODE、再開 bus enable（決定要讀多少之後才開窗）',
      [modeRd, busWr]);

    /* 畫面上那行規格要把 LUT_MODE 與筆數擺在一起 */
    const cfgTxt = P.lutText('dst-lut-cfg');
    for (const frag of ['EM01A1', 'LUT_MODE 5:DG-8bit', '0x1170', '[6:4]', '257'])
      CHECK(cfgTxt.indexOf(frag) >= 0, '🔴 規格列印出「' + frag + '」', cfgTxt);
    CHECK(cfgTxt.indexOf('1025') < 0, '🔴 規格列不得再出現 1025', cfgTxt);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 端到端：mode 0 ⇒ 1025 筆（10-bit 模式沒被改壞）
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ mode 0:DG-10bit ⇒ 解出 1025 筆');
  {
    const n = 1025;
    const vals = [markedTable(n, 0), markedTable(n, 1), markedTable(n, 2)];
    const mem = buildSram(n, vals);
    const ws = makeBridge({ regs: em01Regs(0), mem, busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(80);
    const st = P.lutState();
    CHECK(!!st, '讀取成功');
    if (st) {
      EQ(st.mode, 0, 'LUT_MODE = 0');
      EQ(st.entries, 1025, '🔴 解出 1025 筆');
      EQ(st.entryBits, 10, 'index 寬度 10 bit');
      EQ(st.r, vals[0], '🔴 R 1025 筆逐筆相符');
      EQ(st.b, vals[2], '🔴 B 1025 筆逐筆相符');
    }
    EQ(P.lutRowCount(), 1025, '全表 1025 列');
    const ahb = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    EQ(ahb.reduce((a, m) => a + m.len, 0), (2052 + 2048) * 3, '總讀取量 = (2052+2048)×3');
    CHECK(P.lutText('dst-lut-cfg').indexOf('LUT_MODE 0:DG-10bit') >= 0,
      '規格列印出 LUT_MODE 0:DG-10bit', P.lutText('dst-lut-cfg'));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 🔴 mode 1／2／3／4 ⇒ 停住，一個 AHB 讀取都不發
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 🔴 非 DG 模式（1 MP / 2 DDG-8bit / 3 DDG / 4 Dynamic）⇒ 停住');
  for (const mode of [1, 2, 3, 4]) {
    const ws = makeBridge({ regs: em01Regs(mode), mem: new Map(),
                            busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(40);
    EQ(P.lutState(), null, `mode ${mode}（${MODE_NAME[mode]}）：沒有讀出結果`);
    EQ(P.lutErr().stepKey, 'dst.lutErrModeNotDg',
       `🔴 mode ${mode}：明講是「不是 DG 模式」，不是別的步驟`);
    EQ(P.lutErr().detail, mode + ':' + MODE_NAME[mode],
       `🔴 mode ${mode}：細節裡寫出模式值與名稱（Bruce 對得上他 UI 上的設定）`);
    EQ(ws.trace.filter(m => m.awid === 4).length, 0, `🔴 mode ${mode}：一個 AHB 讀取都沒發出去`);
    EQ(ws.trace.filter(m => m.type === 'rawwrite').length, 0,
       `🔴 mode ${mode}：bus enable 也沒碰（停在讀 LUT_MODE 那一步）`);
    EQ(P.lutHidden('dst-lut-body'), true, `mode ${mode}：不畫任何曲線`);
    CHECK((P.lutText('dst-say-lut') || '').indexOf(mode + ':' + MODE_NAME[mode]) >= 0,
      `mode ${mode}：說話行把模式寫出來`, P.lutText('dst-say-lut'));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 🔴 LUT_MODE 讀不到 ⇒ 停住，不退回 1025
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥ 🔴 LUT_MODE 讀不到 ⇒ 停住（不退回預設 1025）');
  {
    /* 0xFF ＝ I2C 總線閒置（沒有裝置回應）—— 不可以當成「模式 7」或「模式 0」 */
    const n = 1025;
    const vals = [markedTable(n, 0), markedTable(n, 1), markedTable(n, 2)];
    const ws = makeBridge({ regs: em01Regs(null, {}), mem: buildSram(n, vals),
                            busAddr: EM01.busAddr, busBit: EM01.busBit });
    ws.trace.length = 0;
    /* 直接把 0x1170 設成 0xFF */
    const ws2 = makeBridge({ regs: Object.assign(em01Regs(0), { 0x1170: 0xFF }),
                             mem: buildSram(n, vals), busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await load({ ws: ws2, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(40);
    EQ(P.lutState(), null, '沒有讀出結果');
    EQ(P.lutErr().stepKey, 'dst.lutErrMode', '🔴 明講是「LUT_MODE 讀不到」');
    CHECK((P.lutErr().detail || '').indexOf('0x1170') >= 0, '細節裡寫出是哪個位址', P.lutErr().detail);
    EQ(ws2.trace.filter(m => m.awid === 4).length, 0, '🔴 一個 AHB 讀取都沒發出去');
    EQ(ws2.trace.filter(m => m.type === 'rawwrite').length, 0, '🔴 bus enable 也沒碰');
    EQ(P.lutHidden('dst-lut-body'), true, '🔴 不畫任何曲線');
  }
  {
    /* 模式值落在表外（7）⇒ 也要停住 */
    const ws = makeBridge({ regs: em01Regs(7), mem: new Map(),
                            busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(40);
    EQ(P.lutState(), null, '模式值 7（表外）：沒有結果');
    EQ(P.lutErr().stepKey, 'dst.lutErrModeNotDg', '🔴 表外的模式值也停住');
    EQ(ws.trace.filter(m => m.awid === 4).length, 0, '🔴 一個 AHB 讀取都沒發出去');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ EM02／E512 的路徑一個字都沒被動到
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ EM02 路徑未受影響（回歸）');
  {
    const sp = { memSlave: 0x48, chSpan: 0x800, oddOff: 0x400, group: 1, entries: 257 };
    const mem = new Map();
    const tbl = [];
    for (let i = 0; i < sp.entries; i++) tbl.push((0x100 + (i & 0xFF)) & 0x0FFF);
    for (let ch = 0; ch < 3; ch++) {
      const chBase = AHB + ch * sp.chSpan;
      let ep = 0, op = 0;
      for (let i = 0; i < sp.entries; i++) {
        const even = i % 2 === 0;
        const base = even ? chBase : (chBase + sp.oddOff);
        const off = (even ? ep++ : op++) * 4;
        mem.set(base + off, tbl[i] & 0xFF);
        mem.set(base + off + 1, (tbl[i] >> 8) & 0xFF);
      }
    }
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x005D: 0x0D, 0x0001: 0x00 },
                            mem, busAddr: 0x0001, busBit: 2 });
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(40);
    const st = P.lutState();
    CHECK(!!st, 'EM02 仍讀得到');
    if (st) {
      EQ(st.entries, 257, 'EM02 仍是 257 筆');
      EQ(st.mode, null, '🔴 EM02 沒有 LUT_MODE（這一版沒有硬塞一個給它）');
      EQ(st.r, tbl, 'EM02 逐筆相符');
    }
    EQ(ws.trace.filter(m => m.type === 'read' && m.awid !== 4 && m.addr === 0x1170).length, 0,
       '🔴 EM02 完全沒去讀 0x1170');
    const cfgTxt = P.lutText('dst-lut-cfg');
    CHECK(cfgTxt.indexOf('LUT_MODE') < 0, 'EM02 的規格列不出現 LUT_MODE', cfgTxt);
    CHECK(cfgTxt.indexOf('257') >= 0, 'EM02 的規格列仍印出 257', cfgTxt);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑧ i18n：本版新增的 2 個 key 三語齊全
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑧ i18n 三語（本版新增的 2 個 key）');
  {
    const keys = ['dst.lutErrMode', 'dst.lutErrModeNotDg'];
    const bad = [];
    for (const k of keys) {
      const i = SRC.indexOf("I18N['" + k + "']");
      if (i < 0) { bad.push(k + ':missing'); continue; }
      const block = SRC.slice(i, SRC.indexOf('\n  };', i));
      for (const lang of ['zh-TW', 'en', 'zh-CN']) if (block.indexOf("'" + lang + "'") < 0) bad.push(k + ':' + lang);
    }
    EQ(bad, [], `本版新增的 ${keys.length} 個 key 三語全部齊全`);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑨ 🔴 突變測試：把「筆數取自 LUT_MODE」改回 v1.7.0 的寫法
        ⇒ 第 ③ 組的核心斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑨ 🔴 突變測試（把修正改回去，斷言必須紅）');
  {
    const orig = 'entries = modeInfo.entries; entryBits = modeInfo.entryBits;';
    CHECK(SRC.indexOf(orig) > 0, '找得到「筆數取自 LUT_MODE」那一行');
    /* 突變 ＝ v1.7.0 的錯：不管 LUT_MODE 說什麼，一律用 cfg.entries（1025） */
    const mut = SRC.replace(orig, '/* mutated */');
    const n = 257;
    const vals = [markedTable(n, 0), markedTable(n, 1), markedTable(n, 2)];
    const mem = buildSram(n, vals, 1025, 0x0FFF);
    const ws = makeBridge({ regs: em01Regs(5), mem, busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await load({ ws, ic: 'EM01A1', src: mut });
    await P.readDgLut();
    await sleep(80);
    const st = P.lutState();
    CHECK(!!st && st.entries === 1025,
      '🔴 突變後回到 1025 筆（證明第 ③ 組的 257 真的是這一行決定的）', st && st.entries);
    CHECK(!!st && st.r.indexOf(0x0FFF) >= 0,
      '🔴 突變後殘值 0xFFF 真的混進來了 —— 這就是 Bruce 看到的「0~256 對，之後不對」');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  process.exit(fail ? 1 : 0);
})();
