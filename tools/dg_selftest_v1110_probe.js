/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v1110_probe.js — dgself v1.11.0 ／ dg v1.72.0 的驗收夾具（jsdom）

   Bruce 2026-09-21 真機回報：「量完以後，回到 DG 那邊開始計算新的 RGB LUT，它會跳出
   選擇的視窗。我覺得這個地方流程根本就有問題耶！如果我要選擇 T-CON 自檢畫面，按下去
   以後它也沒有再跳過去，也沒有說要把 DG 新的 LUT 重新載入，什麼都沒有講。嚴格說來，
   就是『第四部分：確認結果』這個地方是有問題的。」

   ═══ 這支釘住的七條（Bruce 逐條指定）═══════════════════════════════════════
     ①「即時更新 T-CON RGB LUT」**只在工作模式＝T-CON 自檢畫面時出現**
     ② 按下去會**先出現告知**、再執行更新
     ③ 更新後**一定有讀回比對**
     ④ 比對不符時**擋住**，不得進入下一步
     ⑤ 送出去的位元組是**壓縮格式**，長度取自原廠那個表的長度（不是 4-byte 展開）
     ⑥ 寫入前後有**開／關 bus enable**
     ⑦ 分頁切換改成提示、**不再呼叫 focus()**
   同一輪併進來的另外三件：
     ⑧ 量完**不關量測儀的埠**（中止／出錯才關）
     ⑨ 兩顆返回鈕**名實相符**（④「資料回傳 DG」／左上角「回到首頁」）
     ⑩ 資料回到 DG 之後：前三部分**收折**、視線帶到計算鈕、**資料一個字都沒被動**

   ═══ 🔴 怎麼避免「自己驗自己」═══════════════════════════════════════════════
     · 打包格式的期望值**本檔自己從原廠 struct 寫一份獨立的反解器**
       （`Table_DGM_target_12bit_RGB_st`＝`RApp_Table.h:2754-2760`、
         `Table_DGM_target_10bit_RGB_st`＝`:2743-2752`，EM01 的
         `Table_GAMMA_DG_RGB_st`＝EM01 `RApp_Table.h:2247-2250` 逐欄相同），
       不呼叫產品的打包函式來對答案。四個長度（4644／1188／1161／975）也是
       **原廠 UI 上那個欄位的字面值**（EM01 `SDIMAIN.dfm:6445`、EM02 `:2380`），
       寫死在本檔。
     · 假 SRAM 的 writer 是本檔自己持有的（照抄 v1.7.1／v1.8.0 夾具那一份），
       產品端只有 reader。
     · **第 ⑪ 組是突變測試**：上面每一條各把產品端改壞一次，對應的斷言必須變紅。
       沒有配對突變的斷言 ＝ 不知道它有沒有在驗東西。

   🔴 **沒驗到的（誠實列出）**：
     · **真機**。寫入這條路從來沒有在真的 T-CON 上跑過 —— 這支能證明的只有
       「送出去的位元組排法與原廠源碼一致、而且我們自己讀得回來」，**不能**證明
       那顆 IC 會照我們想的那樣吃下去。畫面上也如實這樣寫。
     · 真瀏覽器的版面與分頁行為（jsdom 沒有 layout，`scrollIntoView` 是假的 ——
       所以第 ⑩ 組驗的是「有沒有叫它、叫在哪個元素上」，不是畫面真的捲到哪裡）。
     · 真治具、真量測儀。

   用法：node tools/dg_selftest_v1110_probe.js
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
const ORIGIN = 'https://example.invalid';

function fakeWin() {
  const w = { closed: false, msgs: [], focused: 0 };
  w.postMessage = d => w.msgs.push(JSON.parse(JSON.stringify(d)));
  w.focus = () => { w.focused++; };
  return w;
}

/* ═══ 🔴 本檔自己的那一份「原廠排法」──── 獨立反解器 ═══════════════════════
   逐位元照 `RApp_Table.h` 的 bitfield 寫回來（欄位順序與寬度見檔頭）。
   產品端是**打包**，這裡是**反解**；兩邊由不同的人（不同的方向）寫，
   對得上才算數。 */
function unpack12(bytes, entries, off) {
  const out = []; let p = off || 0;
  while (out.length < entries) {
    const b0 = bytes[p], b1 = bytes[p + 1], b2 = bytes[p + 2]; p += 3;
    out.push(b0 | ((b1 & 0x0F) << 8));
    if (out.length < entries) out.push(((b1 >> 4) & 0x0F) | (b2 << 4));
  }
  return out;
}
function unpack10(bytes, entries, off) {
  const out = []; let p = off || 0;
  while (out.length < entries) {
    const b = bytes.slice(p, p + 5); p += 5;
    const v = [b[0] | ((b[1] & 0x03) << 8),
               ((b[1] >> 2) & 0x3F) | ((b[2] & 0x0F) << 6),
               ((b[2] >> 4) & 0x0F) | ((b[3] & 0x3F) << 4),
               ((b[3] >> 6) & 0x03) | (b[4] << 2)];
    for (let i = 0; i < 4; i++) if (out.length < entries) out.push(v[i]);
  }
  return out;
}

/* 🔴 原廠 UI 上那個長度欄位的字面值，寫死在本檔（出處見檔頭）。 */
const VENDOR_SIZE = { em01_dg10: 4644, em01_dg8: 1188, target12: 1161, target10: 975 };

/* ═══ EM01 的假 SRAM（照抄 v1.7.1／v1.8.0／v1.10.1 夾具那一份）═══════════ */
const EM01 = { memSlave: 0x58, chSpan: 0x2000, oddOff: 0x1000, group: 4,
               busAddr: 0x00A0, busBit: 5 };
const AHB = 0x40010000;
function buildSram(n, vals) {
  const mem = new Map();
  for (let ch = 0; ch < 3; ch++) {
    const chBase = AHB + ch * EM01.chSpan;
    let ep = 0, op = 0;
    for (let i = 0; i < n; i++) {
      const even = Math.floor(i / EM01.group) % 2 === 0;
      const base = even ? chBase : (chBase + EM01.oddOff);
      const off = (even ? ep++ : op++) * 4;
      const v = vals[ch][i];
      mem.set(base + off, v & 0xFF);
      mem.set(base + off + 1, (v >> 8) & 0xFF);
      mem.set(base + off + 2, 0xA5);
      mem.set(base + off + 3, 0x5A);
    }
  }
  return mem;
}
function fakeTable(n, chBias) {
  const a = [];
  for (let i = 0; i < n; i++) a.push((i * 4 + chBias) & 0x0FFF);
  a[n - 1] = 0x0FFF;
  return a;
}

/* ═══ 假 I2C Bridge ═══════════════════════════════════════════════════════
   🔴 與既有夾具的那一份**同一個骨架**，只多一件事：`rawwrite` 走 awid 4 時
      （＝寫進那個記憶體視窗）把位元組收起來，並且**用本檔自己的反解器**把它
      還原成「展開後的 SRAM」供後續讀取 —— 也就是模擬「寫壓縮、讀展開」。
   🔴 `corrupt` ＝ 故意讓還原出來的某一筆對不上（驗第 ④ 條）。 */
function makeBridge(opts) {
  opts = opts || {};
  const regs = Object.assign({}, opts.regs || {});
  let mem = opts.mem || new Map();
  const busAddr = opts.busAddr, busBit = opts.busBit;
  const trace = [];
  const wrote = [];            // 所有 awid=4 的寫入（{addr, data}）
  const st = { entries: opts.entries || 257, pad: opts.pad == null ? 9 : opts.pad,
               pack: opts.pack || 'p12', corrupt: opts.corrupt || null,
               applyWrites: opts.applyWrites !== false };
  function regByte(a) { const v = regs[a]; return Array.isArray(v) ? v[0] : (v == null ? 0x00 : v); }
  function busOn() { return (busAddr == null) ? false : (((regByte(busAddr) >> busBit) & 1) === 1); }
  function rebuild() {
    const bytes = [];
    wrote.forEach(w => { for (let i = 0; i < w.data.length; i++) bytes[(w.addr - AHB) + i] = w.data[i]; });
    const per = (st.pack === 'p10')
      ? (Math.floor(st.entries / 4) + (st.entries % 4 ? 1 : 0)) * 5
      : (Math.floor(st.entries / 2) + (st.entries % 2 ? 1 : 0)) * 3;
    const vals = [];
    for (let ch = 0; ch < 3; ch++) {
      const off = ch * (per + st.pad);
      vals.push(st.pack === 'p10' ? unpack10(bytes, st.entries, off)
                                  : unpack12(bytes, st.entries, off));
    }
    if (st.corrupt) vals[st.corrupt.ch][st.corrupt.i] = st.corrupt.v;
    mem = buildSram(st.entries, vals);
  }
  const ws = {
    readyState: 1, onmessage: null, trace, wrote,
    send(txt) {
      const m = JSON.parse(txt);
      trace.push(m);
      let rep;
      if (m.type === 'read' && m.awid === 4) {
        const on = busOn();
        const d = [];
        for (let i = 0; i < m.len; i++) {
          const a = ((m.addr >>> 0) + i) >>> 0;
          d.push(on ? (mem.has(a) ? mem.get(a) : 0x00) : 0x00);
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
      } else if (m.type === 'rawwrite' && m.awid === 4) {
        if (opts.writeFailAt != null && wrote.length === opts.writeFailAt) {
          rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: false, status: 7, err: 'no ack' };
        } else {
          wrote.push({ addr: m.addr >>> 0, data: m.data.slice(), busOn: busOn() });
          if (st.applyWrites) rebuild();
          rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0, transferred: m.data.length };
        }
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
    reg: a => regByte(a),
    allWritten() {
      const bytes = [];
      wrote.forEach(w => { for (let i = 0; i < w.data.length; i++) bytes[(w.addr - AHB) + i] = w.data[i]; });
      return bytes;
    }
  };
  return ws;
}
function em01Regs(mode) {
  return { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x05, 0x00A0: 0x00,
           0x1170: (0x0A | ((mode & 7) << 4)) };
}

async function loadSelf(opts) {
  opts = opts || {};
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(opts.src || SELF_SRC), {
    url: ORIGIN + '/dg-selftest.html' + (opts.qs == null ? '?task=1&step=lut' : opts.qs),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  const opener = (opts.opener === null) ? null : (opts.opener || fakeWin());
  if (opener) Object.defineProperty(w, 'opener', { value: opener, writable: true, configurable: true });
  await sleep(160);
  const P = w.dstProbe;
  if (opts.ws) {
    P.__attachFakeWs(opts.ws);
    P.setIcForTest(opts.ic || 'EM01A1', -1);
    P.setSlaveForTest(opts.slave == null ? 0x68 : opts.slave);
  }
  P.__renderBtns();
  await sleep(20);
  return { dom, w, doc: w.document, P, errs, opener, ws: opts.ws };
}

async function loadDg(src) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(src || DG_SRC), {
    url: ORIGIN + '/dg.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const win = dom.window;
  try { win.localStorage.clear(); } catch (e) {}
  const opened = [];
  win.open = function (url) { const w = fakeWin(); w.url = url; opened.push(w); return w; };
  /* jsdom 沒有 layout ⇒ scrollIntoView 不存在。裝一個會記錄「被叫在哪個元素上」的
     假的：第 ⑩ 組驗的就是**有沒有叫它、叫在哪一個元素上**，不是畫面真的捲到哪。 */
  const scrolled = [];
  win.Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.tagName); };
  await sleep(220);
  return { dom, win, doc: win.document, opened, errs, scrolled };
}

/* 把 DG 送出去的那一則丟進自檢頁；再把自檢頁回的每一則丟回 DG。 */
async function relay(dgWin, tconWin, self, ms) {
  while (tconWin.msgs.length) {
    const d = tconWin.msgs.shift();
    const ev = new self.w.MessageEvent('message', { data: d, origin: ORIGIN });
    Object.defineProperty(ev, 'source', { value: self.opener });
    self.w.dispatchEvent(ev);
  }
  /* 🔴 等到**結果那一則**真的出現為止，不用固定睡多久 —— 用固定時間的話，
     慢一點的那條路（例如比對不符要多讀一次）會在結果還沒送出來就被判讀，
     測到的是中途的進度訊息，那種紅／綠都不算數。 */
  const t0 = Date.now(), cap = ms || 4000;
  while (Date.now() - t0 < cap) {
    if (self.opener.msgs.some(m => m && m.type === 'dg-lut-write-result')) break;
    await sleep(25);
  }
  while (self.opener.msgs.length) {
    const d = self.opener.msgs.shift();
    const ev = new dgWin.MessageEvent('message', { data: d, origin: ORIGIN });
    Object.defineProperty(ev, 'source', { value: tconWin });
    dgWin.dispatchEvent(ev);
  }
  await sleep(60);
}

/* DG：算出一份結果（走產品的快捷設定 ＋ 計算鈕，不是夾具自己塞 lastLut）。 */
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

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① 打包格式（純函式）── 第 ⑤ 條的核心
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 打包：位元排法、四種長度、不是 4-byte 展開');
  {
    const { P } = await loadSelf({});

    /* 逐位元組（本檔自己照 struct 算的期望值，不問產品） */
    EQ(P.lutPack12One(0x123, 0xABC), [0x23, 0xC1, 0xAB],
      '🔴 12-bit 一對 → 3 byte：b0=v0[7:0]、b1=v0[11:8]|v1[3:0]<<4、b2=v1[11:4]');
    EQ(P.lutPack12One(0xFFF, 0x000), [0xFF, 0x0F, 0x00], '12-bit：v1=0 時高半邊是 0');
    EQ(P.lutPack10One(0x3FF, 0, 0, 0), [0xFF, 0x03, 0x00, 0x00, 0x00],
      '🔴 10-bit 四個 → 5 byte：第一筆佔 b0 與 b1[1:0]');
    EQ(P.lutPack10One(0, 0x3FF, 0, 0), [0x00, 0xFC, 0x0F, 0x00, 0x00], '10-bit：第二筆佔 b1[7:2] 與 b2[3:0]');
    EQ(P.lutPack10One(0, 0, 0, 0x3FF), [0x00, 0x00, 0x00, 0xC0, 0xFF], '10-bit：第四筆佔 b3[7:6] 與 b4');

    /* 四種長度：spec 算出來的 size 必須等於原廠 UI 上那個欄位的字面值 */
    const cfgEm01 = { modeSel: { addr: 0x1170, shift: 4, width: 3 } };
    const s10 = P.lutWriteSpec(cfgEm01, { val: 0, name: 'DG-10bit', dg: true }, 12, null, 1025);
    const s8 = P.lutWriteSpec(cfgEm01, { val: 5, name: 'DG-8bit', dg: true }, 12, null, 257);
    EQ([s10.ok, s10.size, s10.pack, s10.padPerCh], [true, VENDOR_SIZE.em01_dg10, 'p12', 9],
      '🔴 EM01 LUT_MODE 0 ⇒ 4644 byte（原廠 SDIMAIN.dfm 的字面值）');
    EQ([s8.ok, s8.size, s8.pack, s8.padPerCh], [true, VENDOR_SIZE.em01_dg8, 'p12', 9],
      '🔴 EM01 LUT_MODE 5 ⇒ 1188 byte');
    const t12 = P.lutWriteSpec({}, null, 12, 'target', 257);
    const t10 = P.lutWriteSpec({}, null, 10, 'target', 257);
    EQ([t12.ok, t12.size, t12.pack, t12.padPerCh], [true, VENDOR_SIZE.target12, 'p12', 0],
      '🔴 target ＋ 12-bit ⇒ 1161 byte（沒有保留位元組）');
    EQ([t10.ok, t10.size, t10.pack, t10.padPerCh], [true, VENDOR_SIZE.target10, 'p10', 0],
      '🔴 target ＋ 10-bit ⇒ 975 byte');

    /* 停住那幾條：沒有查證過的排法就不寫 */
    EQ(P.lutWriteSpec({}, null, 12, 'offset', 257).ok, false,
      '🔴 offset 模式 ⇒ 停住（本工具沒有原廠的 offset LUT 產生器，猜不得）');
    EQ(P.lutWriteSpec({}, null, null, 'target', 257).ok, false, '🔴 深度不明 ⇒ 停住');
    EQ(P.lutWriteSpec(cfgEm01, { val: 4, name: 'Dynamic', dg: false }, 12, null, 257).ok, false,
      '🔴 EM01 非 DG 模式 ⇒ 停住');

    /* 🔴 第 ⑤ 條的反面：不能是 4-byte 展開 */
    const vals = { r: fakeTable(257, 0), g: fakeTable(257, 1), b: fakeTable(257, 2) };
    const bin = P.lutBuildBin(vals, s8);
    EQ(bin.length, VENDOR_SIZE.em01_dg8, '🔴 打出來的整包就是 1188 byte');
    CHECK(bin.length !== 257 * 4 * 3,
      '🔴 而且**不是** 4-byte 展開（那會是 ' + (257 * 4 * 3) + ' byte）', bin.length);

    /* 本檔自己的反解器拿得回原值 ⇒ 排法真的對 */
    const per = 128 * 3 + 3;
    for (let ch = 0; ch < 3; ch++) {
      const back = unpack12(bin, 257, ch * (per + 9));
      EQ(back, vals[['r', 'g', 'b'][ch]],
        '🔴 ch' + ch + ' 用本檔獨立寫的反解器解回來，與送進去的 257 筆逐值相同');
    }
    /* 保留位元組是 0，而且真的在每個 channel 的尾巴 */
    EQ([bin[per], bin[per + 8]], [0, 0], '每個 channel 尾端 9 個保留位元組是 0');

    /* 10-bit 那一條也反解一次 */
    const v10 = { r: fakeTable(257, 0).map(x => x & 0x3FF),
                  g: fakeTable(257, 1).map(x => x & 0x3FF),
                  b: fakeTable(257, 2).map(x => x & 0x3FF) };
    const bin10 = P.lutBuildBin(v10, t10);
    EQ(bin10.length, VENDOR_SIZE.target10, '10-bit：整包 975 byte');
    EQ(unpack10(bin10, 257, 325), v10.g, '🔴 10-bit 的第二個 channel 也解得回來');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 寫入流程：bus enable 開／關（第 ⑥ 條）＋ 讀回比對（第 ③ 條）
     ═══════════════════════════════════════════════════════════════════════ */
  H('② 寫入：先開 bus enable、寫壓縮格式、寫完關掉、再讀回比對');
  {
    const N = 257;
    const VALS = [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)];
    const ws = makeBridge({ regs: em01Regs(5), mem: buildSram(N, VALS),
                            busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9 });
    const { P } = await loadSelf({ ws });
    /* 送一份「主表 256 筆」（＝ DG 的一鍵複製 RGB 的範圍），第 257 筆由產品補 4095 */
    const want = [];
    for (let i = 0; i < 256; i++) want.push([i, (i * 5) & 0xFFF, (i * 7) & 0xFFF, (i * 9) & 0xFFF]);
    const res = await P.writeDgLut({ rows: want, depth: 12 });
    EQ([res.ok, res.stage, res.n, res.entries], [true, 'done', 256, 257],
      '🔴 更新成功：主表 256 筆，整張表 257 筆');

    /* 第 ⑥ 條：bus enable 在寫之前被設起來、寫完被清掉 */
    const busWrites = ws.trace.filter(m => m.type === 'rawwrite' && m.addr === EM01.busAddr);
    CHECK(busWrites.length >= 2, '🔴 bus enable 至少被動過兩次（開、關）', busWrites.length);
    EQ((busWrites[busWrites.length - 1].data[0] >> EM01.busBit) & 1, 0,
      '🔴 最後一次是把它**關回去**');
    CHECK(ws.wrote.length > 0 && ws.wrote.every(w => w.busOn),
      '🔴 每一段資料都是在 bus enable 開著的時候寫出去的', ws.wrote.map(w => w.busOn).slice(0, 3));

    /* 第 ⑤ 條：送出去的總量就是壓縮長度 */
    const total = ws.wrote.reduce((s, w) => s + w.data.length, 0);
    EQ(total, VENDOR_SIZE.em01_dg8, '🔴 送出去的總位元組數 ＝ 1188（壓縮格式）');
    CHECK(total !== N * 4 * 3, '🔴 不是 4-byte 展開的 ' + (N * 4 * 3), total);
    EQ(ws.wrote[0].addr, AHB, '第一段從那個記憶體視窗的起點開始');
    CHECK(ws.wrote.every(w => w.data.length <= P.lutWchunk()),
      '每一段都不超過單則上限（' + P.lutWchunk() + '）');

    /* 第 ③ 條：更新之後一定有再讀一次（前後各一次完整的讀） */
    const ahbReads = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    const firstWriteAt = ws.trace.findIndex(m => m.type === 'rawwrite' && m.awid === 4);
    CHECK(ahbReads.length > 0 && firstWriteAt > 0, '前置：有讀也有寫');
    CHECK(ws.trace.findIndex((m, i) => i > firstWriteAt && m.type === 'read' && m.awid === 4) > firstWriteAt,
      '🔴 寫完之後**又讀了一次**（讀回比對，不是寫完就宣稱成功）');

    /* 讀回來的表真的變成新的了（走產品自己的讀取路徑） */
    const rows = P.dgLutRows();
    EQ(rows.length, 256, '讀回來的主表仍是 256 筆');
    EQ(rows[100], [100, 500, 700, 900], '🔴 第 100 筆就是剛剛送出去的那一組值');
    EQ(P.lutWriteLast().n, 256, '最近一次更新的紀錄留下來了');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 讀回不符 ⇒ 明確失敗（第 ④ 條的產品端那一半）
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 讀回來對不上 ⇒ 回報失敗，不假裝成功');
  {
    const N = 257;
    const ws = makeBridge({ regs: em01Regs(5), mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
                            busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9,
                            corrupt: { ch: 1, i: 137, v: 0x111 } });
    const { P } = await loadSelf({ ws });
    const want = [];
    for (let i = 0; i < 256; i++) want.push([i, (i * 5) & 0xFFF, (i * 7) & 0xFFF, (i * 9) & 0xFFF]);
    const res = await P.writeDgLut({ rows: want, depth: 12 });
    EQ([res.ok, res.stage], [false, 'verify'], '🔴 不符 ⇒ ok=false，而且講明是卡在「讀回核對」');
    EQ([res.vars.i, res.vars.ch, res.vars.got], [137, 'G', 0x111],
      '🔴 訊息裡指名是第幾筆、哪一個 channel、讀回來是多少');
    EQ(P.lutWriteLast(), null, '🔴 失敗不留成功紀錄');
  }

  H('③-2 送進來的東西不對 ⇒ 一個位元組都不寫');
  {
    const N = 257;
    const base = () => makeBridge({ regs: em01Regs(5),
      mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
      busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9 });
    const rowsOk = [];
    for (let i = 0; i < 256; i++) rowsOk.push([i, i, i, i]);

    {
      const ws = base(); const { P } = await loadSelf({ ws });
      const r = await P.writeDgLut({ rows: rowsOk.slice(0, 200), depth: 12 });
      EQ([r.ok, r.stage, r.whyKey], [false, 'payload', 'dst.lwCount'], '🔴 筆數不對 ⇒ 擋下');
      EQ(ws.wrote.length, 0, '🔴 而且一個位元組都沒寫出去');
    }
    {
      const ws = base(); const { P } = await loadSelf({ ws });
      const r = await P.writeDgLut({ rows: rowsOk, depth: 10 });
      EQ([r.ok, r.stage, r.whyKey], [false, 'payload', 'dst.lwDepth'],
        '🔴 位元數不對（送 10-bit、IC 是 12-bit）⇒ 擋下');
      EQ(ws.wrote.length, 0, '🔴 一個位元組都沒寫出去');
    }
    {
      const ws = base(); const { P } = await loadSelf({ ws });
      const bad = rowsOk.map(r => r.slice()); bad[17][2] = 99999;
      const r = await P.writeDgLut({ rows: bad, depth: 12 });
      EQ([r.ok, r.stage, r.whyKey], [false, 'payload', 'dst.lwBadVal'], '🔴 值超出範圍 ⇒ 擋下');
      EQ([r.vars.i, r.vars.ch], [17, 'G'], '而且指名是第幾筆、哪一個 channel');
      EQ(ws.wrote.length, 0, '🔴 一個位元組都沒寫出去');
    }
  }

  H('③-3 寫到一半失敗 ⇒ 明講「既不是舊的也不是新的」，而且 bus enable 有關回去');
  {
    const N = 257;
    const ws = makeBridge({ regs: em01Regs(5),
      mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
      busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9, writeFailAt: 2 });
    const { P } = await loadSelf({ ws });
    const rows = [];
    for (let i = 0; i < 256; i++) rows.push([i, i, i, i]);
    const r = await P.writeDgLut({ rows: rows, depth: 12 });
    EQ([r.ok, r.stage, r.whyKey], [false, 'write', 'dst.lwWriteFail'], '🔴 中途失敗 ⇒ stage=write');
    const busWrites = ws.trace.filter(m => m.type === 'rawwrite' && m.addr === EM01.busAddr);
    EQ((busWrites[busWrites.length - 1].data[0] >> EM01.busBit) & 1, 0,
      '🔴 失敗也一定把 bus enable 關回去（finally）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ DG 端：這一層只在自檢模式出現（第 ① 條）
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ 「即時更新 T-CON RGB LUT」只在工作模式＝T-CON 自檢畫面時出現');
  {
    const { win, doc } = await loadDg();
    win.dgApi.wmodeSet('pc');
    await sleep(60);
    doc.getElementById('dg-btn-conf-setup').click();
    await sleep(20);
    win.dgApi.confYesClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'path',
      '🔴 電腦畫面模式：按「要確認結果」⇒ 直接進「量測從哪來」，**沒有**更新那一層');

    win.dgApi.wmodeSet('tcon');
    await sleep(60);
    doc.getElementById('dg-btn-conf-setup').click();
    await sleep(20);
    win.dgApi.confYesClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'push',
      '🔴 自檢模式：按「要確認結果」⇒ 先進「先把新的 RGB LUT 更新到 T-CON」');
  }

  H('④-2 這一層**先告知**、按鈕上不准出現「燒回」');
  {
    const { win, doc } = await loadDg();
    win.dgApi.wmodeSet('tcon');
    await sleep(60);
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    const step = doc.querySelector('#dg-modal-conf .dg-lut-step[data-step="push"]');
    const txt = step.textContent || '';
    CHECK(txt.indexOf('沒更新就去量') >= 0 && txt.indexOf('白量') >= 0,
      '🔴 按鈕之前就先講清楚「不更新就去量等於白量」', txt.slice(0, 80));
    CHECK(txt.indexOf('還沒有在真的機台上跑過') >= 0,
      '🔴 如實標註這條路沒有在真機上跑過');
    EQ(doc.getElementById('dg-btn-conf-push').textContent, '即時更新 T-CON RGB LUT',
      '🔴 按鈕用的是 Bruce 指定的字');
    /* 🔴 只看「使用者看得到的字」：HTML 註解與 JS 註解整段去掉之後再搜
       （與 tools/check_ui_jargon.js 同一個原則 —— 註解裡當理由寫是必要的）。 */
    const DG_VISIBLE = DG_SRC.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    CHECK(txt.indexOf('燒回') < 0 && (DG_VISIBLE.match(/燒回/g) || []).length === 0,
      '🔴 使用者看得到的地方不准出現「燒回」（Bruce 明示：那聽起來像燒錄）',
      (DG_VISIBLE.match(/.{0,20}燒回.{0,20}/) || [''])[0]);
    EQ(win.dgApi.p4PushNextVisible(), false,
      '🔴 還沒更新 ⇒ 「下一步」那一區不出現');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 端到端：DG 按下去 → 自檢頁真的寫 → 相符才給「下一步」（第 ②③④ 條）
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 端到端：更新成功 ⇒ 明講 T-CON 裡是新的，才出現「下一步」');
  {
    const N = 257;
    const ws = makeBridge({ regs: em01Regs(5),
      mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
      busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9 });
    const self = await loadSelf({ ws });
    const { win, doc, opened } = await loadDg();
    /* 🔴 **先選工作模式再算**：切換工作模式會把主分頁整個回出廠再套那一套的紀錄
       （v1.71.0 既有行為），算完再切就會把剛算出來的結果沖掉。 */
    win.dgApi.wmodeSet('tcon');
    await sleep(80);
    CHECK(opened.length >= 1, '前置：自檢分頁被開起來了（同一條既有的路）', opened.length);
    await dgCalc(win, doc, 12);
    CHECK(!!win.dgApi.p4LutSig(), '前置：DG 這邊真的算出一份結果了');
    const tcon = opened[opened.length - 1];

    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'push', '前置：停在更新那一層');
    EQ(win.dgApi.p4Pushed(), false, '前置：還沒更新過');

    tcon.msgs.length = 0;
    doc.getElementById('dg-btn-conf-push').click();
    await sleep(40);
    EQ(tcon.msgs.length, 1, '🔴 按下去 ⇒ 指派給自檢分頁（送一則訊息）');
    EQ(tcon.msgs[0].type, 'dg-lut-write', '訊息型別');
    EQ(tcon.msgs[0].rows.length, 256, '🔴 送過去的是主表 256 筆（與「一鍵複製 RGB」同一個範圍）');
    EQ(tcon.msgs[0].depth, 12, '深度跟著送');
    EQ(tcon.focused, 0, '🔴 **沒有**呼叫 focus()（第 ⑦ 條）');

    await relay(win, tcon, self, 8000);
    EQ(win.dgApi.p4Pushed(), true, '🔴 讀回核對相符 ⇒ DG 這邊記下「這一份表已經在 T-CON 裡」');
    const say = win.dgApi.p4PushSay();
    CHECK(say && say.text.indexOf('T-CON 裡現在是新的 RGB LUT') >= 0,
      '🔴 畫面上明講「T-CON 裡現在是新的 RGB LUT」', say && say.text);
    CHECK(say && say.text.indexOf('256') >= 0, '而且講了核對了幾筆', say && say.text);
    EQ(win.dgApi.p4PushNextVisible(), true, '🔴 相符之後才出現「下一步」');
    win.dgApi.p4PushNextClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'path', '🔴 按「下一步」才進到「這一輪要怎麼量」');

    /* 🔴 表一改，指紋就對不上 ⇒ 自動回到「還沒更新」 */
    const ob = doc.getElementById('dg-outbit');
    ob.value = '10'; ob.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(40);
    EQ(win.dgApi.p4Pushed(), false,
      '🔴 輸出深度一改（表就不同了）⇒ 自動回到「還沒更新」，不會拿舊的綠燈放行');
  }

  H('⑤-2 端到端：讀回不符 ⇒ 擋住，不給「下一步」');
  {
    const N = 257;
    const ws = makeBridge({ regs: em01Regs(5),
      mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
      busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9,
      corrupt: { ch: 0, i: 9, v: 0x222 } });
    const self = await loadSelf({ ws });
    const { win, doc, opened } = await loadDg();
    win.dgApi.wmodeSet('tcon');       // 🔴 先選模式再算（理由同上一組）
    await sleep(80);
    await dgCalc(win, doc, 12);
    const tcon = opened[opened.length - 1];
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    tcon.msgs.length = 0;
    doc.getElementById('dg-btn-conf-push').click();
    await sleep(40);
    await relay(win, tcon, self, 8000);
    EQ(win.dgApi.p4Pushed(), false, '🔴 不符 ⇒ 不記「已經在 T-CON 裡」');
    const say = win.dgApi.p4PushSay();
    CHECK(say && say.cls.indexOf('err') >= 0, '🔴 畫面上是錯誤樣式', say && say.cls);
    CHECK(say && say.text.indexOf('不是這一張新表') >= 0 && say.text.indexOf('請不要量') >= 0,
      '🔴 明講 T-CON 裡不是新表、叫他不要量', say && say.text);
    EQ(win.dgApi.p4PushNextVisible(), false, '🔴 「下一步」不出現');
    EQ(win.dgApi.confStepShown(), 'push', '仍然停在更新那一層');
    /* 🔴 第二道閘：程式化按下去也不准往前 */
    win.dgApi.p4PushNextClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'push',
      '🔴 就算直接點那顆（程式化）也擋得住 —— 不得讓他在沒生效的狀態下去量');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 第 ⑦ 條：分頁切換改成提示、不再呼叫 focus()
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥ 指派任務只給提示，不假裝能切分頁');
  {
    const { win, doc, opened } = await loadDg();
    win.dgApi.wmodeSet('tcon');
    await sleep(80);
    const tcon = opened[opened.length - 1];
    /* 第二次按（分頁已經開著 ⇒ 重用那條路） */
    doc.getElementById('dg-btn-tcon-gray').click();
    await sleep(60);
    EQ(tcon.focused, 0, '🔴 重用分頁時**沒有**呼叫 focus()');
    const st = doc.getElementById('dg-status').textContent || '';
    CHECK(st.indexOf('已指派，請切到自檢分頁繼續') >= 0,
      '🔴 改成中性的「已指派，請切到自檢分頁繼續」', st.slice(0, 60));
    CHECK(st.indexOf('已切換到') < 0,
      '🔴 不再寫「已切換到…」那種像是幫他切好了的話', st.slice(0, 80));
    CHECK(st.indexOf('全螢幕') < 0,
      '🔴 自檢這條路不提「全螢幕」「拖到要量的那台螢幕」（那是電腦畫面那一頁的事）', st.slice(0, 120));
    CHECK(st.indexOf('② 量白灰階') >= 0,
      '🔴 現場提示用的是自檢頁那一顆鈕自己的那一句', st.slice(0, 160));
    CHECK(!/win\.focus\(\)|opener\.focus\(\)|dgLiveWin\.focus\(\)/.test(
      DG_SRC.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')),
      '🔴 程式碼裡（去掉註解後）沒有任何一行在對另一個分頁呼叫 focus()');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ 第 ⑧ 條：量完不關量測儀的埠；中止才關
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ 量完不關量測儀的埠（中止／出錯才關）');
  {
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4], 0x005D: [0x00] } });
    const { P, doc } = await loadSelf({ ws, ic: 'EM02A1', qs: '?task=1&step=prim&mode=prim' });
    P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456'
                                                 : (/^MVS/.test(cmd) ? 'OK00,60.00' : 'OK')));
    doc.getElementById('dst-settle').value = '300';
    EQ(P.caCloseCount(), 0, '前置：還沒關過');
    await P.run();
    await sleep(60);
    EQ(P.runOk(), true, '前置：這一輪是乾淨跑完的');
    EQ(P.caCloseCount(), 0, '🔴 正常跑完 ⇒ **完全沒有**關埠');
    EQ(P.caLinked(), true, '🔴 而且畫面上仍然是「已連線」—— 顯示等於真實狀態');
  }
  {
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4], 0x005D: [0x00] } });
    const { P, doc } = await loadSelf({ ws, ic: 'EM02A1', qs: '?task=1&step=prim&mode=prim' });
    P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456'
                                                 : (/^MVS/.test(cmd) ? 'OK00,60.00' : 'OK')));
    doc.getElementById('dst-settle').value = '300';
    const p = P.run();
    await sleep(40);
    P.abort();
    await p;
    await sleep(60);
    EQ(P.runOk(), false, '前置：這一輪被中止了');
    EQ(P.caCloseCount(), 1, '🔴 中止 ⇒ 埠有被關（狀態不明，關掉比較安全）');
    EQ(P.caLinked(), false, '🔴 而且畫面上變成未連線 —— 顯示等於真實狀態');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑧ 第 ⑨ 條：兩顆返回鈕名實相符
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑧ 兩顆返回鈕：名字＝它真的會做的事');
  {
    const { P, w, doc, opener } = await loadSelf({});
    /* ═══ 🔴 dgself v1.12.0 改判：④ 不再是一顆鈕，左上角的字也換了 ══════════════
       Bruce 2026-09-21 兩條：
         ·「左上角那個按鈕就把它變成『回到首頁』吧」⇒ 字面改，行為（真的導覽）不變。
         ·「第四部分…不要做成按鈕式的…它自己會回傳 DG」⇒ ④ 那顆鈕整顆移除。
       ⇒ 這一組原本驗「兩顆鈕的名字＝它們會做的事」，現在改成驗
         「一顆鈕的名字＝它會做的事」＋「另一件事根本不需要鈕」。 */
    EQ(P.backText(), '‹ 回到首頁', '🔴 v1.12.0：左上角那一顆是「‹ 回到首頁」');
    EQ(P.backHref(), 'index.html', '🔴 而且 href 指向首頁');
    const evTop = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back').dispatchEvent(evTop);
    await sleep(20);
    EQ(evTop.defaultPrevented, false, '🔴 **不攔導覽** —— 按下去真的會去首頁');
    EQ(P.backBotText(), null, '🔴 v1.12.0：④ 那一顆鈕已移除（改成自動回傳）');
    const row = doc.getElementById('dst-step-back');
    CHECK((row.textContent || '').indexOf('自動回傳') >= 0,
      '🔴 v1.12.0：④ 那一列改叫「資料自動回傳 DG」（名字＝它自己會發生）',
      (row.textContent || '').trim());
    CHECK((row.textContent || '').indexOf('回到 DG 頁') < 0, '🔴 不再出現「回到 DG 頁」這個說法');
    CHECK(!row.querySelector('a, button'), '🔴 ④ 那一列裡沒有任何可以按的東西');
    EQ(opener.msgs.length, 0, '它沒有送任何訊息過去（資料是各步驟自己送的）');
    /* 三語都要改到 */
    ['zh-TW', 'en', 'zh-CN'].forEach(L => {
      const v = P.i18nValues('dst.stepBack');
      CHECK(v && v[L] && v[L].indexOf('DG') >= 0 && !/回到 DG 頁|回到 DG 页|Back to the DG page/.test(v[L]),
        '🔴 dst.stepBack 的 ' + L + ' 也改掉了', v && v[L]);
      const h = P.i18nValues('dst.backHome');
      CHECK(h && h[L] && h[L].length > 2, '🔴 dst.backHome 有 ' + L + ' 的翻譯', h && h[L]);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑨ 第 ⑩ 條：資料回到 DG ⇒ 前三部分收折、帶到計算鈕、資料沒被動
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑨ 從自檢分頁回來：收折已備齊的部分、視線帶到計算鈕、資料一個字都沒變');
  {
    const { win, doc, opened, scrolled } = await loadDg();
    /* 🔴 **先選工作模式再填資料**：切換工作模式會把主分頁整個回出廠再套那一套的
       紀錄（v1.71.0 既有行為），先填再切就會被沖掉。 */
    win.dgApi.wmodeSet('tcon');
    await sleep(80);
    /* 再把三份資料備齊（走產品的快捷設定） */
    const sel = doc.getElementById('dg-preset-select');
    sel.value = 'sampleA';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(140);
    const tcon = opened[opened.length - 1];
    EQ(win.dgApi.missingParts ? win.dgApi.missingParts() : [], [], '前置：三份資料都備齊了');
    EQ([win.dgApi.partFolded('lut'), win.dgApi.partFolded('gray'), win.dgApi.partFolded('prim')],
      [false, false, false], '前置：三個部分都是展開的');
    const before = {
      lut: win.dgApi.lutText(), gray: win.dgApi.grayText(),
      white: win.dgApi.whiteText(), prim: win.dgApi.primText()
    };
    scrolled.length = 0;
    /* 自檢頁把第 1 部分的 LUT 送回來（走產品的收訊處理器） */
    const rows = [];
    for (let i = 0; i < 256; i++) rows.push([i, i * 16, i * 16, i * 16]);
    const ev = new win.MessageEvent('message', {
      data: { type: 'dg-measure-result', mode: 'lut', label: '從 T-CON 讀回',
              task: 1, at: '2026-09-21 12:00:00', rows: rows, depth: 12, entries: 257, icKey: 'EM01A1' },
      origin: ORIGIN
    });
    Object.defineProperty(ev, 'source', { value: tcon });
    win.dispatchEvent(ev);
    await sleep(120);
    EQ([win.dgApi.partFolded('lut'), win.dgApi.partFolded('gray'), win.dgApi.partFolded('prim')],
      [true, true, true], '🔴 三份都備齊 ⇒ 三個部分全部收折到最小');
    CHECK(scrolled.indexOf('dg-calc-act') >= 0,
      '🔴 視線帶到「開始計算新的 RGB LUT」那一顆', scrolled);
    /* 🔴 收折**不動資料**：第 1 部分是被這一批蓋掉的（那是既有行為），
       另外三個欄位必須逐字元相同 */
    EQ(win.dgApi.grayText(), before.gray, '🔴 第 2 部分的資料一個字都沒變');
    EQ(win.dgApi.whiteText(), before.white, '🔴 目標白點一個字都沒變');
    EQ(win.dgApi.primText(), before.prim, '🔴 第 3 部分的資料一個字都沒變');
    EQ(win.dgApi.lutText().split('\n').length, 256, '第 1 部分換成了剛送回來的 256 筆（既有行為）');
    /* 收折只是視覺 ⇒ 點標題就展開得回來 */
    EQ(win.dgApi.partHeadClick('gray'), false, '🔴 點一下標題 ⇒ 展開回來（收折是視覺狀態）');
    EQ(win.dgApi.grayText(), before.gray, '🔴 展開之後資料還是原來那一份');
    /* 🔴 不自動按計算 */
    CHECK(win.dgApi.copyLutTsv() === null,
      '🔴 **沒有**自動幫他按計算（Bruce 只說「帶到那裡」）', typeof win.dgApi.copyLutTsv());
  }

  H('⑨-2 資料沒落地（筆數不足）⇒ 不收折、不捲走，讓他看得到退回的原因');
  {
    const { win, doc, opened, scrolled } = await loadDg();
    win.dgApi.wmodeSet('tcon');       // 🔴 先選模式再填（理由同上一組）
    await sleep(80);
    const sel = doc.getElementById('dg-preset-select');
    sel.value = 'sampleA';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(140);
    const tcon = opened[opened.length - 1];
    scrolled.length = 0;
    const ev = new win.MessageEvent('message', {
      data: { type: 'dg-measure-result', mode: 'lut', task: 1, at: 'x', rows: [[0, 1, 2, 3]] },
      origin: ORIGIN
    });
    Object.defineProperty(ev, 'source', { value: tcon });
    win.dispatchEvent(ev);
    await sleep(80);
    EQ([win.dgApi.partFolded('lut'), win.dgApi.partFolded('gray')], [false, false],
      '🔴 沒落地 ⇒ 不收折');
    EQ(scrolled.indexOf('dg-calc-act'), -1, '🔴 也不把畫面捲走');
    CHECK((doc.getElementById('dg-status').textContent || '').indexOf('不足') >= 0,
      '🔴 而且「被退回了」那句話留在畫面上（沒有被導引的訊息蓋掉）',
      (doc.getElementById('dg-status').textContent || '').slice(0, 60));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑩ 突變測試：每一條都把產品端改壞一次
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑩ 突變測試（證明上面每一組真的在驗東西）');

  /* M1（第 ⑤ 條之一）：把 12-bit 的**位元排法**改掉（長度不變，只有擺法錯） */
  {
    const anchor = '          ((v0 >> 8) & 0x0F) | ((v1 & 0x0F) << 4),';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M1：找得到 12-bit 打包的中間那一個位元組');
    /* 把兩個半位元組對調 —— 長度一個 byte 都沒變，所以**只有位元排法那幾條會紅**。 */
    const mut = SELF_SRC.replace(anchor, '          (v1 & 0x0F) | (((v0 >> 8) & 0x0F) << 4),');
    const { P } = await loadSelf({ src: mut });
    EQ(P.lutPack12One(0x123, 0xABC), [0x23, 0x1C, 0xAB], '突變真的套上去了（中間那個 byte 換了）');
    const s8 = P.lutWriteSpec({ modeSel: {} }, { val: 5, name: 'DG-8bit', dg: true }, 12, null, 257);
    const vals = { r: fakeTable(257, 0), g: fakeTable(257, 1), b: fakeTable(257, 2) };
    const bin = P.lutBuildBin(vals, s8);
    EQ(bin.length, VENDOR_SIZE.em01_dg8, '長度沒變（證明這個突變只動排法）');
    CHECK(JSON.stringify(unpack12(bin, 257, 0)) !== JSON.stringify(vals.r),
      '🔴 突變後本檔的獨立反解器就解不回原值 ⇒ 證明第 ① 組的位元排法真的在驗東西');
  }

  /* M1-b（第 ⑤ 條之二）：把「壓縮」改回「每筆 2 byte 展開」 */
  {
    const anchor = '    p = dstLutPack12One(vals[i * 2], vals[i * 2 + 1]);\n    out.push(p[0], p[1], p[2]);';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M1-b：找得到 12-bit 逐對打包那兩行');
    const mut = SELF_SRC.replace(anchor,
      '    out.push(vals[i * 2] & 0xFF, (vals[i * 2] >> 8) & 0x0F,\n'
      + '             vals[i * 2 + 1] & 0xFF, (vals[i * 2 + 1] >> 8) & 0x0F);');
    const { P } = await loadSelf({ src: mut });
    const s8 = P.lutWriteSpec({ modeSel: {} }, { val: 5, name: 'DG-8bit', dg: true }, 12, null, 257);
    let threw = false;
    try { P.lutBuildBin({ r: fakeTable(257, 0), g: fakeTable(257, 1), b: fakeTable(257, 2) }, s8); }
    catch (e) { threw = true; }
    CHECK(threw,
      '🔴 突變成「每筆 2 byte」之後長度對不上 1188 ⇒ 產品自己就擋下來了（證明長度真的有被釘住）');
  }

  /* M2（第 ⑥ 條）：不開 bus enable 就寫 */
  {
    /* 🔴 錨點要帶下一行：讀取那條路上有**一模一樣**的一行，只寫這一行的話
       `String.replace` 會換掉讀取那一支（第一個出現的），於是連第一次讀都失敗，
       根本走不到寫入 —— 那樣的紅是紅錯地方。 */
    const anchor = "      var stuck = await dstLutSetBus(b, true);\n"
      + "      if (!stuck) {\n        return { ok: false, stage: 'bus',";
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M2：找得到寫入那一支「先開 bus enable」那一行');
    const mut = SELF_SRC.replace(anchor,
      "      var stuck = true;\n      if (!stuck) {\n        return { ok: false, stage: 'bus',");
    const N = 257;
    const ws = makeBridge({ regs: em01Regs(5),
      mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
      busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9 });
    const { P } = await loadSelf({ ws, src: mut });
    const rows = [];
    for (let i = 0; i < 256; i++) rows.push([i, i, i, i]);
    await P.writeDgLut({ rows: rows, depth: 12 });
    CHECK(ws.wrote.length > 0 && ws.wrote.some(w => !w.busOn),
      '🔴 突變後有資料在 bus enable 關著的時候被寫出去 ⇒ 證明第 ② 組那條真的在驗東西',
      ws.wrote.map(w => w.busOn).slice(0, 3));
  }

  /* M3（第 ③ 條）：寫完不讀回、直接宣稱成功 */
  {
    const anchor = '    var d = dstLutDiff(sent, dstLut.rgb, main);';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M3：找得到讀回比對那一行');
    const mut = SELF_SRC.replace(anchor, '    var d = { n: 0, first: null, list: [] };');
    const N = 257;
    const ws = makeBridge({ regs: em01Regs(5),
      mem: buildSram(N, [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)]),
      busAddr: EM01.busAddr, busBit: EM01.busBit, entries: N, pad: 9,
      corrupt: { ch: 1, i: 137, v: 0x111 } });
    const { P } = await loadSelf({ ws, src: mut });
    const rows = [];
    for (let i = 0; i < 256; i++) rows.push([i, (i * 5) & 0xFFF, (i * 7) & 0xFFF, (i * 9) & 0xFFF]);
    const res = await P.writeDgLut({ rows: rows, depth: 12 });
    EQ(res.ok, true,
      '🔴 突變後明明讀回來不一樣卻回報成功 ⇒ 證明第 ③ 組那條真的在驗東西');
  }

  /* M4（第 ① 條）：自檢模式也直接跳過更新那一層 */
  {
    const anchor = "      if (DG_WMODE === 'tcon') {\n        dgStepModalStep('dg-modal-conf', 'push');";
    CHECK(DG_SRC.indexOf(anchor) > 0, 'M4：找得到「自檢模式才走更新那一層」那一段');
    const mut = DG_SRC.replace(anchor, "      if (false) {\n        dgStepModalStep('dg-modal-conf', 'push');");
    const { win, doc } = await loadDg(mut);
    win.dgApi.wmodeSet('tcon');
    await sleep(60);
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'path',
      '🔴 突變後自檢模式也跳過更新那一層 ⇒ 證明第 ④ 組那條真的在驗東西');
  }

  /* M5（第 ④ 條）：比對不符也放行 */
  {
    const anchor = '      if (!dgP4Pushed()) { dgP4PushSync(); return; }';
    CHECK(DG_SRC.indexOf(anchor) > 0, 'M5：找得到「沒核對相符就不准往下」那一行');
    const mut = DG_SRC.replace(anchor, '      if (false) { dgP4PushSync(); return; }');
    const { win, doc } = await loadDg(mut);
    win.dgApi.wmodeSet('tcon');
    await sleep(60);
    doc.getElementById('dg-btn-conf-setup').click();
    win.dgApi.confYesClick();
    await sleep(20);
    win.dgApi.p4PushNextClick();
    await sleep(20);
    EQ(win.dgApi.confStepShown(), 'path',
      '🔴 突變後沒更新也能直接往下 ⇒ 證明第 ⑤-2 組那條真的在驗東西');
  }

  /* M6（第 ⑧ 條）：把無條件關埠加回去 */
  {
    const anchor = '    if (!dstRunOk) {\n      try { await dstCaClose(); } catch (e2) {}\n    }';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M6：找得到「只有不 ok 才關埠」那一段');
    const mut = SELF_SRC.replace(anchor, '    try { await dstCaClose(); } catch (e2) {}');
    const ws = makeBridge({ regs: { 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4], 0x005D: [0x00] } });
    const { P, doc } = await loadSelf({ ws, ic: 'EM02A1', src: mut, qs: '?task=1&step=prim&mode=prim' });
    P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456'
                                                 : (/^MVS/.test(cmd) ? 'OK00,60.00' : 'OK')));
    doc.getElementById('dst-settle').value = '300';
    await P.run();
    await sleep(60);
    EQ(P.caCloseCount(), 1,
      '🔴 突變後正常跑完也把埠關了（Bruce 回報的症狀）⇒ 證明第 ⑦ 組那條真的在驗東西');
  }

  /* M7（第 ⑩ 條）：資料落地之後不收折 */
  {
    const anchor = '      var guide = function (landed) { if (guideAfter && landed) dgGuideAfterLive(); };';
    CHECK(DG_SRC.indexOf(anchor) > 0, 'M7：找得到導引那一行');
    const mut = DG_SRC.replace(anchor, '      var guide = function (landed) { };');
    const { win, doc, opened, scrolled } = await loadDg(mut);
    win.dgApi.wmodeSet('tcon');       // 🔴 先選模式再填（理由同第 ⑨ 組）
    await sleep(80);
    const sel = doc.getElementById('dg-preset-select');
    sel.value = 'sampleA';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(140);
    const tcon = opened[opened.length - 1];
    scrolled.length = 0;
    const rows = [];
    for (let i = 0; i < 256; i++) rows.push([i, i * 16, i * 16, i * 16]);
    const ev = new win.MessageEvent('message', {
      data: { type: 'dg-measure-result', mode: 'lut', task: 1, at: 'x', rows: rows },
      origin: ORIGIN
    });
    Object.defineProperty(ev, 'source', { value: tcon });
    win.dispatchEvent(ev);
    await sleep(120);
    EQ(win.dgApi.partFolded('gray'), false,
      '🔴 突變後回來還是一整片展開的 ⇒ 證明第 ⑨ 組那條真的在驗東西');
    EQ(scrolled.indexOf('dg-calc-act'), -1, '🔴 而且也沒有把視線帶過去');
  }

  /* M8（第 ⑨ 條）：把左上角那顆的攔截加回去 */
  {
    /* 🔴 v1.12.0：錨點跟著產品改了（④ 那顆鈕與它的處理器都不在了），插入點改用
       左上角那顆填字的地方。突變目標不變：把 v1.10.1 那段攔截加回左上角。 */
    const anchor = "  var back = $('dst-back');";
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M8：找得到左上角那一顆的插入點');
    const mut = SELF_SRC.replace(anchor,
      "  (function () {\n    var eTop = $('dst-back');\n"
      + "    if (eTop && !eTop.__mut) { eTop.__mut = 1; eTop.addEventListener('click', function (e) {\n"
      + "      if (!dstDgAlive()) return;\n      e.preventDefault();\n    }); }\n"
      + "  })();\n" + anchor);
    const { w, doc } = await loadSelf({ src: mut });
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back').dispatchEvent(ev);
    await sleep(20);
    EQ(ev.defaultPrevented, true,
      '🔴 突變後左上角那顆又不會回首頁了 ⇒ 證明第 ⑧ 組那條真的在驗東西');
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(fail ? ('  🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）')
                   : ('  ✅ 全部通過：' + pass + ' 項'));
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔴 這支驗不到的：**真機**（寫入這條路從來沒有在真的 T-CON 上跑過）、');
  console.log('   真瀏覽器的版面與分頁行為、真治具、真量測儀。');
  process.exit(fail ? 1 : 0);
})();
