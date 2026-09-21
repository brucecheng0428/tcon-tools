/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v1100_probe.js — dgself v1.10.0 的驗收夾具（jsdom）

   Bruce 2026-09-21 逐條交辦的五件事 ⇒ 七條驗收：
     ① 三樣外接硬體（讀寫治具／T-CON／光學量測儀）都在**同一張卡**裡，
        而且三者的狀態**各自獨立**（一樣通了不會讓另一樣也變成通）
     ② 第一項「讀回目前的 RGB LUT」**一顆按鈕就地完成**讀 ＋ 回傳 ＋ 打勾
     ③ 第二項那顆是**兩段式**：第一次按出對位畫面、第二次按才真的開始量，
        而且進到第二段之後**還能把對位畫面叫回來**（不把人鎖死）
     ④ 量測完成時 ②③ **一起打勾**（同一次量測同時完成 DG 的第 2、3 部分）
     ⑤ 第 3 項**沒有自己的開始按鈕**
     ⑥ 卡片最下方那顆（🔴 dgself v1.11.0 起叫「資料回傳 DG」）：有 opener ⇒ 回傳並
        提示切分頁；沒有 opener ⇒ 走既有退路（不攔導覽，連回 index.html）。
        同一組另驗**左上角那一顆永遠是「‹ 返回主頁」而且真的會導覽**。
     ⑦ 卡片內那條進度條會**隨量測更新**，而且與下面那一份逐字相同

   ═══ 🔴 怎麼避免「自己驗自己」═══════════════════════════════════════════════
     ① 假 SRAM 的 writer 是本檔自己持有的（照抄 v1.7.1／v1.8.0 夾具那一份），
        產品端只有 reader。
     ② 期望的筆數／index 範圍／進度字串本檔自己算，不呼叫產品的函式來對答案。
     ③ **第 ⑧ 組是突變測試**：上面七條各把產品端改壞一次，對應的斷言必須變紅。
        沒有配對突變的斷言 ＝ 不知道它有沒有在驗東西。

   🔴 **沒驗到的（誠實列出）**：
     · 真治具、真 TCON、真 AHB 視窗、真量測儀 —— 這台機器沒有硬體。
     · 真瀏覽器的版面（圈圈有沒有對齊、②③ 那條框線長怎樣）。jsdom 沒有版面，
       `getBoundingClientRect()` 一律回 0×0。**版面一律另外看真瀏覽器截圖。**
     · `opener.focus()` 會不會真的把視窗帶到前面（jsdom 的 focus 是假的）。
     · **②③ 那一輪沒有跑整輪 256 階**：jsdom 裡換階等待是真的 setTimeout，
       256 × 300 ms ≈ 77 秒。第 ③ 組驗的是「第二段按下去真的進到量測」
       （dstRunning ＋ 模式 ＋ 卡片內進度條開始動），然後立刻中止；
       ④ 走回傳那條路（打勾就寫在 dstDgSend 裡面）；
       ⑦ 另外用**純色那一輪**（只有三階）跑完整的 0 → 100%。

   用法：node tools/dg_selftest_v1100_probe.js
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
/* 🔴 走「畫面上那顆鈕的 click」時拿不到 Promise（產品路徑本來就沒有回傳給誰），
   所以用輪詢等它做完 —— **不是**改成直接呼叫內部函式來換取方便。
   逾時就直接往下跑，讓該紅的斷言自己紅（不要在這裡吞掉失敗）。 */
async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 3000)) {
    let ok = false;
    try { ok = !!fn(); } catch (e) { ok = false; }
    if (ok) return true;
    await sleep(25);
  }
  return false;
}

function inlineSrc(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const SELF_SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
const ORIGIN = 'https://example.invalid';

/* ═══ 假的對方視窗（DG）══════════════════════════════════════════════════ */
function fakeWin() {
  const w = { closed: false, msgs: [], focused: 0 };
  w.postMessage = d => w.msgs.push(JSON.parse(JSON.stringify(d)));
  w.focus = () => { w.focused++; };
  return w;
}

/* ═══ EM01 的假 SRAM ＋ 假 I2C Bridge（照抄 v1.8.0 夾具那一份）══════════════ */
const EM01 = { memSlave: 0x58, chSpan: 0x2000, oddOff: 0x1000, group: 4,
               busAddr: 0x00A0, busBit: 5, mask: 0x0F00 };
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
/* mode 5 ＝ DG-8bit ⇒ 257 筆（v1.7.1 的實測結論）。 */
function em01Regs(mode) {
  return { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x05, 0x00A0: 0x00,
           0x1170: (0x0A | ((mode & 7) << 4)) };
}

/* ═══ 載入自檢頁 ═══════════════════════════════════════════════════════════ */
async function loadSelf(opts) {
  opts = opts || {};
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(opts.src || SELF_SRC), {
    url: ORIGIN + '/dg-selftest.html' + (opts.qs || ''),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  if (opts.opener !== null) {
    Object.defineProperty(w, 'opener', {
      value: opts.opener || fakeWin(), writable: true, configurable: true
    });
  }
  await sleep(150);
  const P = w.dstProbe;
  if (opts.ws) {
    P.__attachFakeWs(opts.ws);
    P.setIcForTest(opts.ic || 'EM01A1', -1);
    P.setSlaveForTest(opts.slave == null ? 0x68 : opts.slave);
  }
  P.__renderBtns();
  await sleep(20);
  return { dom, w, doc: w.document, P, errs, opener: w.opener };
}
/* 好用的預設組合：連上 ＋ 認出 EM01 ＋ 假量測儀（回什麼由呼叫端決定）。 */
async function loadReady(opts) {
  opts = opts || {};
  const ws = opts.ws || makeBridge({ regs: em01Regs(5), mem: opts.mem || new Map(),
                                     busAddr: EM01.busAddr, busBit: EM01.busBit });
  const ctx = await loadSelf({ ws, ic: 'EM01A1', opener: opts.opener, src: opts.src,
                              qs: opts.qs == null ? '?task=1&step=gray' : opts.qs });
  if (opts.meter !== false) {
    ctx.P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456' : 'OK'));
  }
  if (opts.settle) ctx.doc.getElementById('dst-settle').value = String(opts.settle);
  ctx.P.__renderBtns();
  await sleep(20);
  ctx.ws = ws;
  return ctx;
}

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① 三樣外接硬體在同一張卡，狀態各自獨立
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 外接硬體：同一張卡 ＋ 狀態各自獨立');
  {
    const { P, doc } = await loadSelf({ opener: null });
    CHECK(!!doc.getElementById('dst-hw-card'), '🔴 那張卡存在（dst-hw-card）');
    /* 卡片名稱：看得出是「外接硬體連線」，而且不是縮寫／實作名詞 */
    const hd = doc.querySelector('#dst-hw-card .card-header');
    const hdTxt = (hd ? hd.textContent : '').trim();
    CHECK(hdTxt.indexOf('外接硬體') >= 0, '🔴 卡片名稱講的是「外接硬體」', hdTxt);
    CHECK(hdTxt.indexOf('I2C') < 0 && hdTxt.indexOf('IC 識別') < 0,
      '🔴 名稱裡沒有縮寫／實作名詞（舊名「I2C 連線與 IC 識別」已不在）', hdTxt);
    /* 🔴 三個控制項全頁各只有一個，而且都在這張卡裡 ＝「搬過來」不是「複製一份」 */
    ['dst-link', 'dst-probe', 'dst-ca'].forEach(id => {
      EQ(P.hwHasCtrl(id), { n: 1, inCard: true },
        '🔴 ' + id + ' 全頁只有一個，而且就在這張卡裡');
    });
    /* 原處沒有留空殼：「量測」那張卡裡沒有任何量測儀的連線鈕
       🔴 dgself v1.10.1 改判：原本用 `#dst-run`（「開始掃描」）當錨點找那張卡，
          而那顆鈕在 v1.10.1 依 Bruce 裁示整顆移除了。改用結果表 `#dst-res-wrap`
          —— 它是「量測」卡**獨有而且不會搬走**的東西（結果一律留在這張卡）。
          這是換錨點，驗的東西一個字都沒變。 */
    const meas = doc.getElementById('dst-res-wrap').closest('.card');
    CHECK(!meas.querySelector('.dst-toggle'),
      '🔴「量測」那張卡裡已經沒有任何連線開關（原處沒留空殼）');
    CHECK(!!meas.querySelector('#dst-v-hz'),
      '量測儀**量到的值**（畫面更新率）仍留在「量測」卡 —— 那是結果不是連線狀態');
    /* 三個圈圈：什麼都沒連 ⇒ 三個都是空心 */
    EQ([P.hwTick('bridge'), P.hwTick('tcon'), P.hwTick('meter')], ['○', '○', '○'],
      '🔴 什麼都沒連 ⇒ 三個圈圈都是空心（一眼看得出三樣都還沒通）');
  }
  {
    /* 只連量測儀（治具沒連）⇒ 只有量測儀那一個打勾 */
    const { P } = await loadSelf({ opener: null });
    P.__attachFakeMeter(() => 'OK');
    await sleep(10);
    EQ([P.hwTick('bridge'), P.hwTick('tcon'), P.hwTick('meter')], ['○', '○', '✔'],
      '🔴 只連上量測儀 ⇒ 只有它打勾（三者狀態各自獨立）');
    EQ([P.hwOk('bridge'), P.hwOk('tcon'), P.hwOk('meter')], [false, false, true],
      '🔴 列的樣式也只有量測儀那一列變成已連');
  }
  {
    /* 連治具 ＋ 認出 IC，但量測儀沒連 ⇒ 前兩個打勾、第三個空心 */
    const { P } = await loadSelf({ ws: makeBridge({ regs: em01Regs(5) }), ic: 'EM01A1' });
    EQ([P.hwTick('bridge'), P.hwTick('tcon'), P.hwTick('meter')], ['✔', '✔', '○'],
      '🔴 治具連上＋認出 IC、量測儀沒連 ⇒ 只有前兩個打勾');
  }
  {
    /* 連上治具但**認不出 IC** ⇒ 治具打勾、T-CON 仍空心（兩者不是同一件事）*/
    const ws = makeBridge({ regs: { 0xFF00: [0xFF, 0xFF, 0xFF] } });
    const { P } = await loadSelf({ opener: null });
    P.__attachFakeWs(ws); P.__renderBtns();
    await sleep(10);
    EQ(P.currentIc(), null, '前置條件：IC 認不出來');
    EQ([P.hwTick('bridge'), P.hwTick('tcon')], ['✔', '○'],
      '🔴 治具通了但認不出 T-CON ⇒ 只有治具打勾');
  }
  {
    /* 三樣全通 */
    const { P } = await loadReady({});
    EQ([P.hwTick('bridge'), P.hwTick('tcon'), P.hwTick('meter')], ['✔', '✔', '✔'],
      '🔴 三樣都通 ⇒ 三個都打勾');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 第一項：一顆按鈕就地完成「讀 ＋ 回傳 ＋ 打勾」
     ═══════════════════════════════════════════════════════════════════════ */
  H('② ① 那一步：一顆按鈕完成讀＋回傳＋打勾');
  const N = 257, MAIN = 256;
  const VALS = [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)];
  {
    const opener = fakeWin();
    const { P, doc } = await loadReady({ mem: buildSram(N, VALS), opener,
      qs: '?task=7&dest=' + encodeURIComponent('第 1 部分') + '&step=lut' });
    /* 🔴 前置條件：那一列上**只有一顆**動作鈕（不是「讀一顆、回傳一顆」兩顆） */
    const row = doc.getElementById('dst-step-lut');
    const btns = Array.prototype.filter.call(row.querySelectorAll('button'),
      b => !b.classList.contains('dst-hidden'));
    EQ(btns.map(b => b.id), ['dst-go-lut'],
      '🔴 有 opener 時那一列上只有一顆看得見的鈕（剪貼簿退路是隱藏的）');
    EQ(P.stepDone(), { lut: false, gray: false, prim: false }, '前置條件：一步都還沒打勾');
    EQ(P.lutState(), null, '前置條件：還沒讀過 LUT');

    /* 🔴 走**畫面上那顆鈕的 click**（產品路徑），不是直接呼叫 dstStepLut() */
    doc.getElementById('dst-go-lut').click();
    await waitFor(() => P.lutState() || P.lutErr(), 5000);
    await sleep(60);

    const st = P.lutState();
    CHECK(!!st && st.entries === N, '① 讀：整張表 257 筆讀回來了', st && st.entries);
    const out = opener.msgs[opener.msgs.length - 1];
    EQ(out.type, 'dg-measure-result', '② 回傳：沿用既有訊息型別');
    EQ(out.mode, 'lut', '② 回傳：mode ＝ lut');
    EQ(out.rows.length, MAIN, '② 回傳：主表 256 筆（本檔自己算的期望值）');
    EQ(out.rows[0], [0, VALS[0][0], VALS[1][0], VALS[2][0]], '② 回傳：第一列 ＝ [0, R0, G0, B0]');
    EQ(P.stepDone(), { lut: true, gray: false, prim: false }, '③ 打勾：只有 ① 打勾');
    EQ(P.stepRow('lut').tick, '✔', '🔴 三件事由**同一次點擊**完成（讀＋回傳＋打勾）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ ②③ 那顆鈕是兩段式，而且退得回對位
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ ②③ 那顆鈕：兩段式 ＋ 退得回對位');
  {
    const { P, ws, doc } = await loadReady({ settle: 300, opener: fakeWin() });
    /* 第一段的長相 */
    EQ(P.grayArmed(), false, '一進來是第一段');
    EQ(P.goGrayText(), '對位畫面', '🔴 第一段：鈕上寫「對位畫面」');
    EQ(P.goGrayIsPri(), false, '第一段不是強調色（沿用 v1.4.0 對位鈕的判準）');
    EQ(P.realignHidden(), true, '🔴 第一段：「重新對位」不顯示（主鈕自己就是對位畫面）');
    EQ(P.showing(), null, '前置條件：畫面上還沒有東西');

    /* ── 第一次按：出對位畫面，**不會開始量測** ── */
    const nBefore = ws.trace.length;
    P.goGrayClick();
    await sleep(120);
    EQ(P.showing(), 'align', '🔴 第一次按 ⇒ 出對位畫面（L127 ＋ 中心十字）');
    EQ(P.runWhyKey(), null, '🔴 第一次按**沒有**開始量測（沒有「正在量測」這個原因）');
    EQ(P.rows().length, 0, '🔴 第一次按一筆數據都沒有量');
    CHECK(ws.trace.length > nBefore, '真的送了出圖序列出去', ws.trace.length - nBefore);
    /* 第二段的長相 */
    EQ(P.grayArmed(), true, '🔴 按過之後進到第二段');
    EQ(P.goGrayText(), '開始量測', '🔴 第二段：同一顆鈕變成「開始量測」');
    EQ(P.goGrayIsPri(), true, '🔴 第二段才轉強調色（這是現在該按的）');
    EQ(P.realignHidden(), false, '🔴 第二段：「重新對位」出現（不把人鎖死）');
    /* 🔴 「畫面測試」那張卡的對位鈕也跟著亮 —— 同一個畫面狀態只有一種長相 */
    const pick = P.pickLabels().filter(x => x.id === 'dst-align')[0];
    EQ(pick.on, true, '🔴「畫面測試」那張卡的對位鈕同時亮起（同一個畫面狀態）');

    /* ── 退回對位：把對位畫面叫回來，仍停在第二段 ── */
    const nBefore2 = ws.trace.length;
    P.realignClick();
    await sleep(120);
    CHECK(ws.trace.length > nBefore2, '🔴「重新對位」真的把對位畫面重送了一次',
      ws.trace.length - nBefore2);
    EQ(P.showing(), 'align', '重送之後畫面仍是對位畫面');
    EQ(P.grayArmed(), true, '🔴 退回對位之後仍停在第二段（不必再按一次才能開始量）');
    EQ(P.goGrayText(), '開始量測', '🔴 鈕上仍寫「開始量測」');
    EQ(P.rows().length, 0, '🔴 到這裡為止一筆數據都還沒量');

    /* ── 第二次按：真的開始量 ── */
    P.goGrayClick();
    await sleep(80);
    EQ(P.dgState().mode, 'gray', '🔴 第二次按 ⇒ 進到白灰階那一輪');
    EQ(P.runWhyKey(), 'dst.whyRunning', '🔴 真的在量了（閘門的理由變成「正在量測」）');
    EQ(P.grayArmed(), false, '🔴 開始量的當下退回第一段（下一輪要重新對位）');
    /* 卡片內那條進度條在量測中就有字了（第 ⑦ 組的另一半） */
    CHECK((P.stepsProgText() || '').trim().length > 0,
      '🔴 量測中，卡片內那條進度條已經在講話了', P.stepsProgText());
    /* 🔴 中止（整輪 256 階在 jsdom 裡要 77 秒，見檔頭） */
    P.abort();
    await sleep(400);
    EQ(P.runWhyKey() === 'dst.whyRunning', false, '中止之後不再是「正在量測」');
    EQ(doc.getElementById('dst-go-gray').textContent, '對位畫面',
      '🔴 中止之後鈕回到第一段（對位畫面）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 量完 ②③ 一起打勾
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ ②③ 一起打勾（同一次量測）');
  {
    const opener = fakeWin();
    const { P } = await loadReady({ opener,
      qs: '?task=13&dest=' + encodeURIComponent('第 2 部分') + '&step=gray' });
    /* 🔴 這一輪的列 ＝ 灰階 ＋ **三個純色端點**（dstPlan 本來就是這樣排的：
       mode=gray 會把 R／G／B 排在灰階後面）。本檔自己照那個規則造。 */
    P.__setRowsForTest([
      { key: 'L0',   group: 'gray', idx: 0,   r12: 0,    x: 0.25,   y: 0.25,   lv: 0 },
      { key: 'L128', group: 'gray', idx: 128, r12: 2048, x: 0.3127, y: 0.3290, lv: 60 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.3127, y: 0.3290, lv: 300 },
      { key: 'R', group: 'prim', idx: 255, r12: 4080, g12: 0, b12: 0, x: 0.64, y: 0.33, lv: 60 },
      { key: 'G', group: 'prim', idx: 255, r12: 0, g12: 4080, b12: 0, x: 0.30, y: 0.60, lv: 200 },
      { key: 'B', group: 'prim', idx: 255, r12: 0, g12: 0, b12: 4080, x: 0.15, y: 0.06, lv: 40 }
    ]);
    EQ(P.dgRows().gray.map(r => r[0]), [0, 128, 255], '前置條件：灰階三筆');
    EQ(P.dgRows().prim.map(r => r[0]), ['r', 'g', 'b'], '前置條件：純色三筆到齊');
    CHECK(P.dgSend() === true, '回傳成功');
    await sleep(20);
    const out = opener.msgs[opener.msgs.length - 1];
    EQ(out.mode, 'gray', '送出去的還是 gray 那一則（訊息格式沒變）');
    EQ(out.prim.map(r => r[0]), ['r', 'g', 'b'], '🔴 純色三筆真的跟著送出去了（prim 欄位）');
    EQ(P.stepDone(), { lut: false, gray: true, prim: true },
      '🔴 ②③ **一起打勾** —— 這一次量測同時完成 DG 的第 2、3 部分');
    EQ([P.stepRow('gray').tick, P.stepRow('prim').tick], ['✔', '✔'],
      '🔴 兩列的符號都變成 ✔');
    CHECK((P.sayRun() || '').indexOf('第 2、3 部分') >= 0,
      '🔴 訊息明講「這一次量測同時完成了第 2、3 部分」', P.sayRun());
  }
  {
    /* 🔴 反面：純色沒湊齊三筆 ⇒ prim 欄位送 null ⇒ ③ **不打勾** */
    const opener = fakeWin();
    const { P } = await loadReady({ opener, qs: '?task=14&step=gray' });
    P.__setRowsForTest([
      { key: 'L0',   group: 'gray', idx: 0,   r12: 0,    x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 },
      { key: 'R', group: 'prim', idx: 255, r12: 4080, g12: 0, b12: 0, x: 0.64, y: 0.33, lv: 60 }
    ]);
    CHECK(P.dgSend() === true, '前置條件：灰階那一半照樣送得出去');
    await sleep(20);
    const out = opener.msgs[opener.msgs.length - 1];
    EQ(out.prim, null, '前置條件：純色只有一筆 ⇒ prim 欄位送 null');
    EQ(P.stepDone(), { lut: false, gray: true, prim: false },
      '🔴 純色沒送出去 ⇒ ③ 不打勾（假勾等於騙他東西在 DG 那邊了）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 第 3 項沒有自己的開始按鈕
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 第 3 項沒有自己的開始鈕');
  {
    const { P, doc } = await loadReady({});
    EQ(P.hasGoBtn('prim'), false, '🔴 `dst-go-prim` 整顆不存在');
    const row = doc.getElementById('dst-step-prim');
    CHECK(!!row, '③ 那一列還在（它仍對應 DG 的第 3 部分，要有地方打勾）');
    EQ(row.querySelectorAll('button').length, 0, '🔴 ③ 那一列上一顆鈕都沒有');
    /* ②③ 在同一組裡，而且旁邊講明是同一次量測 */
    const grp = doc.getElementById('dst-group23');
    CHECK(!!grp, '🔴 ②③ 包在同一組裡（dst-group23）');
    CHECK(grp.contains(doc.getElementById('dst-step-gray'))
       && grp.contains(row), '🔴 ②③ 兩列都在那一組裡面');
    CHECK(grp.contains(doc.getElementById('dst-go-gray')),
      '🔴 那一組裡唯一的開始鈕就是 ② 那一顆（②③ 共用）');
    CHECK((grp.textContent || '').indexOf('同一次量測') >= 0,
      '🔴 旁邊明講「②③ 是同一次量測」', (grp.textContent || '').slice(0, 60));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 卡片最下方那顆「回到 DG 頁」
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥ 卡片最下方的返回出口');
  {
    const opener = fakeWin();
    const { P, w, doc } = await loadReady({ opener });
    CHECK(P.backBotInStepsCard(), '🔴 它真的在三步清單那張卡裡面');
    /* 位置：卡片最下方 ⇒ 它之後不該再有別的控制項 */
    const card = doc.getElementById('dst-steps-card');
    const ctrls = Array.prototype.slice.call(card.querySelectorAll('button, a'));
    EQ(ctrls[ctrls.length - 1].id, 'dst-back-bot', '🔴 它是這張卡裡最後一個控制項');
    /* ═══ 🔴 dgself v1.11.0 改判：名字改了，而且**兩顆不再是同一件事** ═══════════
       刪改原因（不是為了讓測試變綠）：Bruce 2026-09-21 真機實測 ——「那個按鈕名稱
       不應該叫做『回到 DG 頁』，應該叫做『資料回傳 DG』之類。因為按下去並不會回到
       DG 頁」「左上角那邊的按鈕按了也不會回到 DG 頁，所以左上角那個按鈕就把它變成
       『回到首頁』吧」。
       ⇒ 這一顆改名成它真的會做的事；左上角那一顆改回名副其實的返回首頁。
       ⇒ 原本「兩顆文案逐字相同」那一條**必須刪掉**：它們現在做的不是同一件事，
         逼它們同字就是把剛修好的東西再弄壞一次。改驗「兩顆各自正確且不同」。 */
    EQ(P.backBotText(), '資料回傳 DG', '🔴 有 opener ⇒ ④ 那一顆寫「資料回傳 DG」（名字＝它真的會做的事）');
    EQ(P.backText(), '‹ 返回主頁', '🔴 左上角那一顆**永遠**是「‹ 返回主頁」');
    CHECK(P.backBotText() !== P.backText(),
      '🔴 兩顆的字不一樣 —— 它們做的不是同一件事（一個回傳資料、一個離開這一頁）');
    /* ═══ 🔴 dgself v1.10.1 改判：原本這裡驗的是 `opener.focused` 有沒有 +1 ═══════
       刪改原因（不是為了讓測試變綠）：`window.opener.focus()` 在真瀏覽器**本來就
       無效**（Bruce 2026-09-21 真機實測按下去完全沒反應），jsdom 的 focus 是假的
       ⇒ 這一條從一開始就是**假綠**。v1.10.1 依 Bruce 裁示把那個呼叫整支拿掉，
       改成在自檢頁講清楚下一步。改驗使用者真的看得到的那件事。 */
    P.backBotClick();
    await sleep(20);
    CHECK((P.saySteps() || '').indexOf('切回 DG 分頁') >= 0,
      '🔴 按下去 ⇒ 畫面上出現「請切回 DG 分頁繼續」（v1.10.1 起的行為）', P.saySteps());
    EQ(opener.msgs.length, 0, '🔴 它沒有送任何訊息過去');
    EQ(P.backBotHref(), 'index.html', 'href 仍是 index.html（有 opener 時由處理器攔掉導覽）');
    /* 有一步打勾過 ⇒ 兩顆一起轉強調色 */
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 }
    ]);
    P.dgSend();
    await sleep(20);
    /* 🔴 v1.11.0 改判（理由同上）：強調色的語意是「現在該按的是它」，而那件事
       只屬於「資料回傳 DG」那一顆。左上角那一顆只是離開這一頁的出口，不該搶。 */
    EQ([P.backIsPri(), P.backBotIsPri()], [false, true],
      '🔴 有東西送出去過 ⇒ 只有 ④「資料回傳 DG」那一顆轉強調色');
    /* 🔴 有 opener 時按下去要被攔掉（不導覽） */
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back-bot').dispatchEvent(ev);
    await sleep(10);
    EQ(ev.defaultPrevented, true, '🔴 有 opener ⇒ ④ 那一顆攔掉導覽（不開第二個 DG 分頁）');
    /* 🔴 v1.11.0 新增：左上角那一顆**必須真的導覽**（名字叫返回主頁就要回得去）。
       它是 v1.11.0 的核心改動 —— v1.8.1～v1.10.1 有 opener 時會把它攔下來。 */
    const evTop = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back').dispatchEvent(evTop);
    await sleep(10);
    EQ(evTop.defaultPrevented, false,
      '🔴 左上角那一顆**不攔導覽** —— 按下去真的會去 index.html（名字＝行為）');
  }
  {
    /* 沒有 opener ⇒ 走既有退路：文案退回「‹ 返回主頁」、不攔導覽 */
    const { P, w, doc } = await loadReady({ opener: null });
    EQ(P.dgState().linked, false, '前置條件：沒有 opener');
    EQ(P.backBotText(), '‹ 返回主頁', '🔴 沒有 opener ⇒ 退回「‹ 返回主頁」（與左上角那顆一致）');
    EQ(P.backBotHref(), 'index.html', '🔴 而且 href 是 index.html（不留一顆按了沒反應的死鈕）');
    EQ(P.backBotIsPri(), false, '沒有 opener ⇒ 不轉強調色');
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back-bot').dispatchEvent(ev);
    await sleep(10);
    EQ(ev.defaultPrevented, false, '🔴 沒有 opener ⇒ 不攔導覽，照原本的方式回首頁');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ 卡片內的進度條會隨量測更新（而且與下面那一份逐字相同）
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ 卡片內的進度條');
  const seen = [];
  {
    const { P, doc } = await loadReady({ settle: 300, opener: fakeWin(),
      qs: '?mode=prim&task=21&step=prim' });
    CHECK(!!doc.getElementById('dst-steps-prog'), '🔴 卡片內那條進度條存在');
    CHECK(!!doc.getElementById('dst-prog'), '🔴 下面「量測」那張卡原本那一條**還在**（要看細節的地方）');
    EQ(P.stepsProgWidth(), '', '前置條件：還沒量 ⇒ 卡片內那條是空的');

    /* 🔴 純色那一輪只有三階（≈1 秒），跑得完整的 0 → 100%。
       量測中每隔一段時間抄一次兩邊的字，事後比對。 */
    const timer = setInterval(() => {
      seen.push([P.stepsProgText(), P.progText(), P.stepsProgWidth(), P.progWidth()]);
    }, 90);
    await P.stepScan('prim');
    await sleep(80);
    clearInterval(timer);

    CHECK(seen.length > 3, '量測中抄到好幾個時間點', seen.length);
    const moving = seen.filter(s => (s[0] || '').trim().length > 0);
    CHECK(moving.length > 2, '🔴 卡片內那條在量測中一直有話講（不是量完才出現）', moving.length);
    const diff = seen.filter(s => s[0] !== s[1] || s[2] !== s[3]);
    EQ(diff, [], '🔴 兩條進度條在每一個時間點**逐字相同**（同一支 dstProg 寫的）');
    /* 收尾：跑完 ⇒ 兩條都到 100% */
    EQ([P.stepsProgWidth(), P.progWidth()], ['100%', '100%'], '🔴 跑完兩條都是 100%');
    EQ(P.stepsProgText(), P.progText(), '🔴 跑完的字也一樣');
    CHECK((P.stepsProgText() || '').indexOf('3/3') >= 0,
      '🔴 卡片內那條的分數是本輪自己的（純色 3/3）', P.stepsProgText());
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑧ i18n：本版新增的 key 三語齊全
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑧ i18n 三語齊全');
  {
    const keys = ['dst.hdHw', 'dst.hwNote', 'dst.hwBridge', 'dst.hwTcon', 'dst.hwMeter',
                  'dst.goAlign', 'dst.goMeasure', 'dst.goRealign', 'dst.group23',
                  'dst.dgSentBoth'];
    const { w } = await loadSelf({ opener: null });
    const bad = [];
    for (const k of keys) {
      const e = w.I18N && w.I18N[k];
      if (!e) { bad.push(k + ':missing'); continue; }
      for (const lang of ['zh-TW', 'en', 'zh-CN']) if (!e[lang]) bad.push(k + ':' + lang);
    }
    EQ(bad, [], `本版新增的 ${keys.length} 個 key 三語全部齊全`);
    /* 畫面上不可以出現未翻譯的 key 本身（取 .container，理由見 v1.8.0 夾具）。 */
    const shown = (w.document.querySelector('.container') || { textContent: '' }).textContent || '';
    CHECK(shown.indexOf('dst.hw') < 0 && shown.indexOf('dst.go') < 0
          && shown.indexOf('dst.group') < 0,
      '🔴 畫面上沒有任何未翻譯的 key 漏出來');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑨ 🔴 突變測試：上面七條各改壞一次，對應的斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑨ 🔴 突變測試（七條各一個）');

  /* ── M1（①）：量測儀那個圈圈改成看「治具連了沒」⇒ 狀態不再獨立 ── */
  {
    const orig = "[['bridge', dstLinked], ['tcon', !!dstIc], ['meter', dstCaLinked]]";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M1：找得到三個圈圈的狀態來源那一行');
    const mut = SELF_SRC.replace(orig,
      "[['bridge', dstLinked], ['tcon', !!dstIc], ['meter', dstLinked]]");
    const { P } = await loadSelf({ src: mut, opener: null });
    P.__attachFakeMeter(() => 'OK');
    await sleep(10);
    EQ(P.hwTick('meter'), '○',
      '🔴 突變後「只連上量測儀」那一格不會打勾 ⇒ 證明第 ① 組那條真的在驗東西');
  }
  /* ── M1-b（①）：把量測儀那顆**複製**一份回「量測」卡（而不是搬過來）── */
  {
    /* 🔴 v1.10.1 改判：原本插在「開始掃描」那一顆前面，而那顆鈕已移除。
       改插在「量測」卡的結果表前面 —— 插入點換了，驗的東西沒變。 */
    const anchor = '<div class="dst-tbl-wrap dst-hidden" id="dst-res-wrap"';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M1-b：找得到「量測」卡的結果表（插入點）');
    const mut = SELF_SRC.replace(anchor,
      '<button id="dst-ca" class="dst-toggle"></button>' + anchor);
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.hwHasCtrl('dst-ca'), { n: 2, inCard: false },
      '🔴 突變後全頁有兩顆量測儀連線鈕 ⇒ 證明第 ① 組那條擋得住「複製一份」');
  }
  /* ── M2（②）：讀完之後不回傳 ⇒「一顆按鈕完成三件事」必須紅 ── */
  {
    const orig = '  return dstDgSendLut();\n}';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M2：找得到 ① 那一步的回傳那一行');
    const mut = SELF_SRC.replace(orig, '  return false;\n}');
    const opener = fakeWin();
    const { P, doc } = await loadReady({ src: mut, mem: buildSram(N, VALS), opener,
      qs: '?task=7&step=lut' });
    doc.getElementById('dst-go-lut').click();
    await waitFor(() => P.lutState() || P.lutErr(), 5000);
    await sleep(60);
    EQ([P.stepDone().lut, opener.msgs.length], [false, 0],
      '🔴 突變後按了只讀不回傳、也不打勾 ⇒ 證明第 ② 組那三條真的在驗東西');
  }
  /* ── M3（③）：拿掉第一段 ⇒ 第一次按就直接開始量 ── */
  {
    const orig = '  if (!dstGrayArmed) return dstGuard(dstStepAlign);';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M3：找得到兩段式那一行（唯一的那一份）');
    /* 🔴 這個突變第一次跑時**抓到了真的問題**：當時同一個 if 也寫在 click
       處理器裡，把這裡改壞行為卻沒變 ⇒ 產品端已改成只有這一份判斷。 */
    const mut = SELF_SRC.replace(orig, '  if (false) return dstGuard(dstStepAlign);');
    const { P } = await loadReady({ src: mut, settle: 300, opener: fakeWin() });
    P.goGrayClick();
    await sleep(80);
    EQ(P.runWhyKey(), 'dst.whyRunning',
      '🔴 突變後第一次按就直接開始量了 ⇒ 證明第 ③ 組「第一次按不會量」真的在驗東西');
    P.abort();
    await sleep(400);
  }
  /* ── M3-b（③）：「重新對位」變成什麼都不做 ⇒「退得回對位」必須紅 ── */
  {
    const orig = 'function dstStepRealign() { return dstStepAlign(); }';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M3-b：找得到「重新對位」那一支');
    const mut = SELF_SRC.replace(orig,
      'function dstStepRealign() { return Promise.resolve(false); }');
    const { P, ws } = await loadReady({ src: mut, settle: 300, opener: fakeWin() });
    P.goGrayClick();
    await sleep(120);
    EQ(P.grayArmed(), true, '前置條件：已經進到第二段');
    const n0 = ws.trace.length;
    P.realignClick();
    await sleep(120);
    EQ(ws.trace.length, n0,
      '🔴 突變後「重新對位」一個 byte 都不送 ⇒ 證明第 ③ 組那條真的在驗東西');
  }
  /* ── M4（④）：拿掉 ③ 的連帶打勾 ⇒「②③ 一起打勾」必須紅 ── */
  {
    const orig = '  if (primSent) dstStepDone.prim = true;';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M4：找得到 ②③ 一起打勾那一行');
    const mut = SELF_SRC.replace(orig, '  /* mutated */');
    const { P } = await loadReady({ src: mut, opener: fakeWin(), qs: '?task=13&step=gray' });
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 },
      { key: 'R', group: 'prim', idx: 255, r12: 4080, g12: 0, b12: 0, x: 0.64, y: 0.33, lv: 60 },
      { key: 'G', group: 'prim', idx: 255, r12: 0, g12: 4080, b12: 0, x: 0.30, y: 0.60, lv: 200 },
      { key: 'B', group: 'prim', idx: 255, r12: 0, g12: 0, b12: 4080, x: 0.15, y: 0.06, lv: 40 }
    ]);
    P.dgSend();
    await sleep(20);
    EQ(P.stepDone(), { lut: false, gray: true, prim: false },
      '🔴 突變後純色送出去了卻只打 ② ⇒ 證明第 ④ 組那條真的在驗東西');
  }
  /* ── M5（⑤）：把 ③ 那一顆開始鈕加回去 ⇒「沒有自己的鈕」必須紅 ── */
  {
    const anchor = '<span class="dst-step-to" id="dst-to-prim"></span></span>';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M5：找得到 ③ 那一列（插入點）');
    const mut = SELF_SRC.replace(anchor,
      anchor + '\n          <button class="dst-btn" id="dst-go-prim">開始量</button>');
    const { P } = await loadReady({ src: mut });
    EQ(P.hasGoBtn('prim'), true,
      '🔴 突變後 ③ 又有自己的開始鈕了 ⇒ 證明第 ⑤ 組那條真的在驗東西');
  }
  /* ── M6（⑥）：④ 那顆不掛處理器 ⇒「按了會回傳並提示」必須紅 ──
     🔴 v1.11.0：錨點跟著產品改了（兩顆已經拆開，不再共用同一個 forEach）。
        突變的目標**沒有變**：把 ④ 那一顆的點擊處理器拿掉。 */
  {
    const orig = "    var e0 = $('dst-back-bot'); if (!e0) return;";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M6：找得到 ④ 那一顆的點擊處理器');
    const mut = SELF_SRC.replace(orig, "    var e0 = null; if (!e0) return;");
    const opener = fakeWin();
    const { P, w, doc } = await loadReady({ src: mut, opener });
    P.backBotClick();
    await sleep(20);
    CHECK((P.saySteps() || '').indexOf('切回 DG 分頁') < 0,
      '🔴 突變後按 ④ 不會出現「請切回 DG 分頁」⇒ 證明第 ⑥ 組那條真的在驗東西',
      P.saySteps());
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back-bot').dispatchEvent(ev);
    await sleep(10);
    EQ(ev.defaultPrevented, false,
      '🔴 突變後它會真的導覽去 index.html（有 opener 卻開第二個分頁）');
  }
  /* ── 🔴 v1.11.0 新增 M6-b：左上角那一顆**必須真的導覽**（名實相符的反面）──
     這是 v1.11.0 的核心改動：v1.8.1～v1.10.1 有一段 click 處理器會把它攔下來。
     把那段攔截加回去，這一條就必須紅 —— 否則「它真的會回首頁」是假綠。 */
  {
    const anchor = "  (function () {\n    var e0 = $('dst-back-bot'); if (!e0) return;";
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M6-b：找得到 ④ 那一顆處理器的起點（插入點）');
    const mut = SELF_SRC.replace(anchor,
      "  (function () {\n    var eTop = $('dst-back');\n"
      + "    if (eTop) eTop.addEventListener('click', function (e) {\n"
      + "      if (!dstDgAlive()) return;\n      e.preventDefault();\n      dstBackToDg();\n    });\n"
      + "  })();\n  (function () {\n    var e0 = $('dst-back-bot'); if (!e0) return;");
    const opener = fakeWin();
    const { w, doc } = await loadReady({ src: mut, opener });
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('dst-back').dispatchEvent(ev);
    await sleep(10);
    EQ(ev.defaultPrevented, true,
      '🔴 突變（把 v1.10.1 那段攔截加回左上角）⇒ 它又不會回首頁了 ⇒ 證明正面那條真的在驗東西');
  }
  /* ── M7（⑦）：進度只寫下面那一份 ⇒「卡片內那條會動」必須紅 ── */
  {
    const orig = "var DST_PROG_OUT = [['dst-prog', 'dst-progtxt'], ['dst-steps-prog', 'dst-steps-progtxt']];";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M7：找得到兩個進度出口那一行');
    const mut = SELF_SRC.replace(orig, "var DST_PROG_OUT = [['dst-prog', 'dst-progtxt']];");
    const { P } = await loadReady({ src: mut, settle: 300, opener: fakeWin(),
      qs: '?mode=prim&task=21&step=prim' });
    await P.stepScan('prim');
    await sleep(80);
    EQ([P.stepsProgWidth(), P.progWidth()], ['', '100%'],
      '🔴 突變後卡片內那條完全不動、下面那條照樣 100% ⇒ 證明第 ⑦ 組那條真的在驗東西');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的：真治具／真 TCON／真量測儀／真瀏覽器的版面與 focus 行為；');
  console.log('   ②③ 那一輪沒有跑整輪 256 階（見檔頭），第 ⑦ 組用純色三階跑完整的 0→100%。');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
