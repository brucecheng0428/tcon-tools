/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v180_probe.js — dgself v1.8.0 ／ dg v1.69.0 的驗收夾具（jsdom）

   Bruce 2026-09-21 交辦的四件事：
     ① 三個部分都要有進自檢的入口，而且**開的是同一個視窗**，從哪一部分進來就把
        對應那一步標成「目前這一步」
     ② 自檢頁上一張三步清單，每一步做完當場回傳 DG 並打勾（不強迫三件都做）
     ③ 「回到 DG 頁」＝**左上角那一顆返回出口**（v1.8.1 起與它合成一顆）：
        `opener.focus()`，有打勾過就轉強調色；沒有 opener 時退回「‹ 返回主頁」
        並照舊指向 index.html，剪貼簿退路則出現
     ④ 第 1 部分的回填：index 0 ～ N−1（不含附加末筆），來源標示「從 T-CON 讀回」

   ═══ 這支釘住的東西（逐條對應上面四件事）═══════════════════════════════════
     ① 三個入口都走 DG_LIVE_PAGES.tcon 那**一個槽**（第二、三次是重用、不開新視窗）；
        三條路各自帶出去的 `step` 是 lut／gray／prim
     ② 三步各自打勾，而且**打勾與「真的送出去了」綁在一起**（第 ⑧ 組突變測試證明）
     ③ 有／沒有 opener 兩種情形下左上角那一顆的**文案與去向**，以及「複製到剪貼簿」
        的出現與消失
     ④ 回填進 #dg-in-lut 的筆數、index 範圍、來源徽章、以及**三個選單沒有被動到**

   ═══ 🔴 怎麼避免「自己驗自己」═══════════════════════════════════════════════
     ① 假 SRAM 的 writer 是本檔獨立寫的（照抄 v1.7.1 夾具那一份），產品端只有 reader。
     ② 期望的 TSV／筆數／index 範圍在本檔自己算一遍，不呼叫產品的函式來對答案。
     ③ 第 ⑧ 組是**突變測試**：把產品端三個關鍵行為各改壞一次，對應的斷言必須變紅。

   🔴 **沒驗到的（誠實列出）**：
     · 真治具、真 TCON、真 AHB 視窗、真量測儀 —— 這台機器沒有硬體。
     · 真瀏覽器的分頁行為（`window.open` 的視窗位置、`opener.focus()` 會不會真的把
       視窗帶到前面、剪貼簿權限）。jsdom 的 window.open／focus 都是假的。
     · **② 白灰階那一步沒有跑整輪 259 階**：jsdom 裡換階等待是真的 setTimeout，
       259 × 300 ms ≈ 78 秒。這裡驗的是「回傳那條路會打勾」（打勾就寫在 dstDgSend
       裡面），整輪掃描跑得完由 v1.7.0 的夾具第 ⑤ 組負責。③ 純色那一步只有三階，
       所以**有**走完整的 dstStepScan → dstRun → dstDgSend 端到端。

   用法：node tools/dg_selftest_v180_probe.js
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

/* ═══ 假的對方視窗：記下「我被開成什麼網址」「我收到什麼訊息」「被 focus 幾次」══ */
function fakeWin() {
  const w = { closed: false, msgs: [], focused: 0 };
  w.postMessage = d => w.msgs.push(JSON.parse(JSON.stringify(d)));
  w.focus = () => { w.focused++; };
  return w;
}

/* ═══════════════════════════════════════════════════════════════════════════
   EM01 的假 SRAM ＋ 假 I2C Bridge（照抄 tools/dg_selftest_v171_probe.js 的那一份，
   本檔自己持有一份 writer —— 產品端只有 reader）
   ═══════════════════════════════════════════════════════════════════════════ */
const EM01 = { memSlave: 0x58, chSpan: 0x2000, oddOff: 0x1000, group: 4,
               busAddr: 0x00A0, busBit: 5, mask: 0x0F00,
               modeAddr: 0x1170, modeShift: 4, modeWidth: 3 };
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
/* 可辨識的假表：每個 channel 的值互不相同，才驗得出 R／G／B 有沒有串在一起。
   🔴 值刻意落在 12-bit 之內（mask 0x0F00 ＝ 12 bit）。 */
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
/* mode 5 ＝ DG-8bit ⇒ 257 筆（v1.7.1 的實測結論）。低 4 位塞殘值 0x0A。 */
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

/* ═══ 載入 DG 主頁 ═════════════════════════════════════════════════════════ */
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
  await sleep(200);
  return { dom, win, doc: win.document, opened, errs };
}

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① DG 端：三個部分都有入口，而且開的是**同一個視窗**
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 三個部分的 T-CON 入口 ＋ 同一個視窗');
  const ENTRY = [
    ['dg-btn-tcon-lut',  'lut',  '第 1 部分', 'RGB 的 LUT',       null],
    ['dg-btn-tcon-gray', 'gray', '第 2 部分', '白灰階亮度',        null],
    ['dg-btn-tcon-prim', 'prim', '第 3 部分', 'RGB 純色 Pattern', 'prim']
  ];
  {
    const { win, doc } = await loadDg();
    ENTRY.forEach(e => CHECK(!!doc.getElementById(e[0]), '入口存在：' + e[0]));
    CHECK(!!doc.getElementById('dg-btn-live-gray'), '🔴 既有的「電腦畫面量測」入口還在：dg-btn-live-gray');
    CHECK(!!doc.getElementById('dg-btn-live-prim'), '🔴 既有的「電腦畫面量測」入口還在：dg-btn-live-prim');
    /* 二選一視窗**沒有被刪掉** —— 光學資料比較與第 4 部分仍在用它 */
    CHECK(!!doc.getElementById('dg-modal-pick'), '二選一視窗仍存在（slot／conf 還在用）');
    CHECK(!!doc.getElementById('dg-btn-slot-live') && !!doc.getElementById('dg-btn-conf-live'),
      'slot／conf 兩個入口沒有被動到');
    EQ(win.dgApi.livePageFiles(), { pc: 'dg-measure.html', tcon: 'dg-selftest.html' },
      '兩條路各自對應的檔名沒變');
  }

  /* 三個入口各自**單獨**按（每次都用全新的 DG）⇒ 驗網址帶的 step */
  const urlOf = {};
  for (const [id, step, dest, what, mode] of ENTRY) {
    const { win, doc, opened } = await loadDg();
    doc.getElementById(id).click();
    await sleep(20);
    CHECK(!win.dgApi.pickOpen(), '🔴 三個部分的入口**不再跳二選一**：' + id);
    CHECK(opened.length === 1, '按一下就直接開了自檢分頁（只開一個）：' + id, opened.length);
    const u = opened[0].url;
    urlOf[step] = u;
    CHECK(u.indexOf('dg-selftest.html') === 0, '開的是 dg-selftest.html：' + id, u);
    const q = new (require('url').URLSearchParams)(u.slice(u.indexOf('?')));
    EQ(q.get('step'), step, id + '：step = ' + step);
    EQ(q.get('dest'), dest, id + '：dest = ' + dest);
    EQ(q.get('what'), what, id + '：what = ' + what);
    EQ(q.get('mode'), mode, id + '：mode = ' + mode + '（lut 那一步的 mode 仍是缺席＝gray）');
    EQ(win.dgApi.liveWinsAlive(), { pc: false, tcon: true }, id + '：只有 tcon 那一槽有分頁');
  }
  console.log('\n  三個入口實際帶出去的網址：');
  ENTRY.forEach(e => console.log('    ' + e[0].padEnd(18) + ' → ' + urlOf[e[1]]));

  /* 🔴 核心：三個入口**連按**只會有一個視窗（第二、三次走重用那條路） */
  {
    const { win, doc, opened } = await loadDg();
    doc.getElementById('dg-btn-tcon-gray').click(); await sleep(15);
    doc.getElementById('dg-btn-tcon-prim').click(); await sleep(15);
    doc.getElementById('dg-btn-tcon-lut').click();  await sleep(15);
    CHECK(opened.length === 1, '🔴 三個入口連按 ⇒ 只開過一個視窗（沿用單槽 tcon.win）', opened.length);
    const msgs = opened[0].msgs;
    EQ(msgs.map(m => m.step), ['prim', 'lut'],
      '🔴 第二、三次是送 dg-measure-task 換任務（帶對應的 step），不是重開');
    EQ(msgs.map(m => m.dest), ['第 3 部分', '第 1 部分'], '換任務訊息帶的 dest 也對');
    EQ(msgs.map(m => m.what), ['RGB 純色 Pattern', 'RGB 的 LUT'], '換任務訊息帶的 what 也對');
    EQ(msgs.map(m => m.type), ['dg-measure-task', 'dg-measure-task'], '型別沿用既有的 dg-measure-task');
    /* 🔴 按下去的那個浮動視窗要收掉，否則它會蓋住剛寫出去的狀態列 */
    EQ([win.dgApi.stepModalOpen('dg-modal-lut'), win.dgApi.stepModalOpen('dg-modal-gray'),
        win.dgApi.stepModalOpen('dg-modal-prim')], [false, false, false],
      '🔴 按完之後三個設定視窗都收掉了');
  }

  /* 既有四個入口（pc 那一條與 slot／conf）行為不變 */
  {
    const { win, doc, opened } = await loadDg();
    doc.getElementById('dg-btn-live-gray').click();
    await sleep(15);
    CHECK(!win.dgApi.pickOpen(), '「電腦畫面量測」也不跳二選一（它自己就是答案）');
    CHECK(opened.length === 1 && opened[0].url.indexOf('dg-measure.html') === 0,
      '「電腦畫面量測」開的仍是 dg-measure.html', opened[0] && opened[0].url);
    const q = new (require('url').URLSearchParams)(opened[0].url.slice(opened[0].url.indexOf('?')));
    EQ(q.get('step'), 'gray', 'pc 那一條也帶 step=gray（值等於 mode ⇒ 語意沒變）');
    EQ(q.get('what'), '白灰階亮度', '🔴 pc 那一條的 what 與 v1.68.1 逐字相同');
  }
  {
    const { win, doc, opened } = await loadDg();
    doc.getElementById('dg-btn-slot-live').click();
    await sleep(15);
    CHECK(win.dgApi.pickOpen(), '🔴 光學資料比較那個入口**仍然**先跳二選一（這一輪沒動它）');
    CHECK(opened.length === 0, '還沒選之前不開分頁');
    doc.getElementById('dg-btn-conf-live').click();
    await sleep(15);
    CHECK(win.dgApi.pickOpen(), '🔴 第 4 部分那個入口也仍然先跳二選一');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 自檢頁：三步清單的初始長相、「目前這一步」、停用與原因
     ═══════════════════════════════════════════════════════════════════════ */
  H('② 三步清單：目前這一步、未連線停用');
  {
    /* 從第 1 部分進來 ⇒ ① 標成「目前這一步」 */
    const { P } = await loadSelf({ qs: '?task=1&dest=' + encodeURIComponent('第 1 部分')
      + '&what=' + encodeURIComponent('RGB 的 LUT') + '&step=lut&v=v1.69.0' });
    EQ(P.stepCur(), 'lut', 'step=lut 讀到了');
    EQ([P.stepRow('lut').cur, P.stepRow('gray').cur, P.stepRow('prim').cur], [true, false, false],
      '🔴 ① 被標成「目前這一步」，另外兩步沒有');
    EQ([P.stepRow('lut').done, P.stepRow('gray').done, P.stepRow('prim').done], [false, false, false],
      '一開始三步都沒打勾');
    EQ([P.stepRow('lut').tick, P.stepRow('gray').tick, P.stepRow('prim').tick], ['○', '○', '○'],
      '打勾符號一開始都是 ○');
    EQ(P.stepRow('lut').to, '→ 回 DG 的第 1 部分', '① 那一列寫著回 DG 第 1 部分');
    EQ(P.stepRow('gray').to, '→ 回 DG 的第 2 部分', '② 那一列寫著回 DG 第 2 部分');
    EQ(P.stepRow('prim').to, '→ 回 DG 的第 3 部分', '③ 那一列寫著回 DG 第 3 部分');
    /* 🔴 未連線 ⇒ 三步都停用，而且畫面上講明原因（不要讓人按了才失敗） */
    EQ(P.stepsWhyKey(), 'dst.stepsWhyLink', '未連線 ⇒ 原因是「還沒連上 I2C」');
    /* 🔴 dgself v1.10.0 起 ③ **沒有自己的動作鈕**（Bruce：「第 3 項不得有自己的
       獨立開始按鈕」，②③ 共用一顆）⇒ `stepRow('prim').disabled` 回 null。
       原本這一行期望 `[true, true, true]`，第三個值已經不存在，改判前兩顆；
       「③ 沒有按鈕」本身由 dg_selftest_v1100_probe.js 第 ③ 組正面釘住。 */
    EQ([P.stepRow('lut').disabled, P.stepRow('gray').disabled, P.stepRow('prim').disabled],
       [true, true, null], '🔴 未連線 ⇒ ①② 兩顆動作鈕停用（③ v1.10.0 起沒有自己的鈕）');
    CHECK((P.stepsWhyText() || '').indexOf('I2C') >= 0, '🔴 原因真的印在畫面上了', P.stepsWhyText());
  }
  {
    /* 從第 2 部分進來（沒有 step 欄位的舊 DG）⇒ 退回 mode */
    const { P } = await loadSelf({ qs: '?task=2&dest=' + encodeURIComponent('第 2 部分')
      + '&what=' + encodeURIComponent('白灰階亮度') });
    EQ(P.stepCur(), 'gray', '🔴 沒帶 step（舊版 DG）⇒ 退回 mode＝gray');
    EQ(P.stepRow('gray').cur, true, '② 被標成「目前這一步」');
  }
  {
    const { P } = await loadSelf({ qs: '?mode=prim&task=3&step=prim' });
    EQ(P.stepCur(), 'prim', 'step=prim 讀到了');
    EQ(P.stepRow('prim').cur, true, '③ 被標成「目前這一步」');
  }
  {
    /* 連上了但認不出 IC ⇒ 停用，原因換成 IC */
    const ws = makeBridge({ regs: { 0xFF00: [0xFF, 0xFF, 0xFF] } });
    const { P } = await loadSelf({ qs: '?step=lut' });
    P.__attachFakeWs(ws);
    P.__renderBtns();
    await sleep(10);
    EQ(P.currentIc(), null, '前置條件：IC 認不出來');
    EQ(P.stepsWhyKey(), 'dst.stepsWhyIc', '🔴 連上了但認不出 IC ⇒ 原因換成 IC');
    EQ(P.stepRow('lut').disabled, true, '🔴 認不出 IC ⇒ 還是停用（不會讓人按了才失敗）');
  }
  {
    /* 連上 ＋ 認出 EM01 ⇒ 三步都可按、原因一個字都不出現 */
    const ws = makeBridge({ regs: em01Regs(5), mem: new Map(),
                            busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P } = await loadSelf({ ws, ic: 'EM01A1', qs: '?step=lut' });
    EQ(P.stepsWhyKey(), null, '🔴 連上 ＋ 認出 IC ⇒ 沒有原因');
    EQ(P.stepsWhyText(), '', '🔴 可按時畫面上一個字都不出現');
    /* 🔴 同上：v1.10.0 起 ③ 沒有自己的鈕 ⇒ 第三個值是 null。 */
    EQ([P.stepRow('lut').disabled, P.stepRow('gray').disabled, P.stepRow('prim').disabled],
       [false, false, null], '🔴 ①② 兩顆動作鈕都可以按（③ v1.10.0 起沒有自己的鈕）');
    /* 🔴 三步彼此獨立：①②③ 沒有任何一顆因為「前一步沒做」而變暗 —— 上面那一行
       已經證明（三步都沒打勾，三顆都可按）。這一行把它寫成明示的斷言。 */
    EQ(P.stepDone(), { lut: false, gray: false, prim: false },
      '🔴 一步都沒做，三顆卻都可按 ＝ 三步彼此獨立、不強迫按順序');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ ① 那一步：讀回 LUT → 送回 DG → 打勾
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ ① 讀回 RGB LUT ⇒ 送出 ＋ 打勾');
  const N = 257;                         // EM01 mode 5 的整張表
  const MAIN = 256;                      // 主表（不含附加末筆）—— 本檔自己算
  const VALS = [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)];
  {
    const mem = buildSram(N, VALS);
    const ws = makeBridge({ regs: em01Regs(5), mem, busAddr: EM01.busAddr, busBit: EM01.busBit });
    const opener = fakeWin();
    const { P } = await loadSelf({ ws, ic: 'EM01A1', opener,
      qs: '?task=7&dest=' + encodeURIComponent('第 1 部分') + '&step=lut' });
    EQ(P.lutMainCount(257), 256, '主表筆數：257 ⇒ 256（附加末筆不送）');
    EQ(P.lutMainCount(1025), 1024, '主表筆數：1025 ⇒ 1024');
    EQ(P.lutMainCount(256), 256, '🔴 萬一某顆就是 256 筆（沒有末筆）⇒ 整張送，不誤砍一筆');

    const ok = await P.stepLut();        // 🔴 產品路徑：就是那顆鈕呼叫的同一支
    await sleep(60);
    CHECK(ok === true, '🔴 讀回並回傳：回傳 true');
    const st = P.lutState();
    EQ(st && st.entries, N, '讀回來的整張表是 257 筆（LUT_MODE 決定，v1.7.1 那條沒被動到）');
    const out = opener.msgs[opener.msgs.length - 1];
    EQ(out.type, 'dg-measure-result', '🔴 沿用既有的訊息型別 dg-measure-result');
    EQ(out.mode, 'lut', '🔴 只多一個 mode 值 lut');
    EQ(out.task, 7, 'task 原封帶回去');
    EQ(out.rows.length, MAIN, '🔴 送出去的是主表 256 筆（不含附加末筆）');
    EQ(out.rows[0], [0, VALS[0][0], VALS[1][0], VALS[2][0]], '第一列 ＝ [0, R0, G0, B0]');
    EQ(out.rows[MAIN - 1], [MAIN - 1, VALS[0][MAIN - 1], VALS[1][MAIN - 1], VALS[2][MAIN - 1]],
      '🔴 最後一列 ＝ index 255（第 257 筆那個末筆沒有跟來）');
    EQ(out.entries, N, '附帶說明用的 entries ＝ 257');
    EQ(out.depth, 12, '附帶說明用的 depth（EM01 mask 0x0F00 ⇒ 12 bit）');
    /* 打勾 */
    EQ(P.stepDone(), { lut: true, gray: false, prim: false }, '🔴 只有 ① 打勾，另外兩步不動');
    EQ(P.stepRow('lut').tick, '✔', '🔴 ① 那一列的符號變成 ✔');
    EQ(P.stepRow('lut').done, true, '① 那一列掛上 done');
    CHECK((P.saySteps() || '').indexOf('256') >= 0 && (P.saySteps() || '').indexOf('第 1 部分') >= 0,
      '🔴 訊息沿用既有格式：「256 筆 RGB LUT 已回到 DG 的第 1 部分」', P.saySteps());
    /* 左上角的返回出口：有打勾 ⇒ 轉強調色 */
    EQ(P.backText(), '‹ 回到 DG 頁', '🔴 有 opener ⇒ 左上角那顆寫「‹ 回到 DG 頁」');
    EQ(P.backIsPri(), true, '🔴 有一步打勾過 ⇒ 它轉成強調色');
    EQ(P.copyHidden(), true, '有 opener ⇒ 剪貼簿退路不出現');
    /* focus，不重開 */
    const before = opener.focused;
    /* 🔴 走的是**畫面上那顆 <a> 的 click**（產品路徑），不是直接呼叫 dstBackToDg() */
    P.backClick();
    await sleep(20);
    EQ(opener.focused, before + 1, '🔴 按左上角那顆 ⇒ opener.focus()（把既有那個 DG 視窗叫到前面）');
    EQ(opener.msgs.length, 1, '🔴 它沒有再送任何訊息過去，也沒有重開視窗');
    EQ(P.backHref(), 'index.html',
      'href 仍是 index.html（有 opener 時由 click 處理器攔掉導覽，不動 href）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ ③ 那一步：純色端到端（走完整的 dstStepScan → dstRun → dstDgSend）
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ ③ 量 RGB 純色：端到端 ⇒ 送出 ＋ 打勾');
  {
    const ws = makeBridge({ regs: em01Regs(5), mem: new Map(),
                            busAddr: EM01.busAddr, busBit: EM01.busBit });
    const opener = fakeWin();
    const { P, doc } = await loadSelf({ ws, ic: 'EM01A1', opener,
      qs: '?mode=prim&task=11&dest=' + encodeURIComponent('第 3 部分') + '&step=prim' });
    /* 換階等待取最短的一檔（清單裡的 300 ms），三階 ≈ 1 秒 */
    doc.getElementById('dst-settle').value = '300';
    P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456' : 'OK'));
    P.__renderBtns();
    await P.stepScan('prim');
    await sleep(80);
    EQ(P.rows().length, 3, '前置條件：三個純色端點都量到了');
    const out = opener.msgs[opener.msgs.length - 1];
    EQ(out.mode, 'prim', '回傳的 mode ＝ prim');
    EQ(out.task, 11, 'task 原封帶回去');
    EQ(out.rows.map(r => r[0]), ['r', 'g', 'b'], 'rows 形狀與 v1.1.0 逐字相同');
    EQ(P.stepDone(), { lut: false, gray: false, prim: true }, '🔴 只有 ③ 打勾');
    EQ(P.stepRow('prim').tick, '✔', '🔴 ③ 那一列變成 ✔');
    EQ(P.backIsPri(), true, '🔴 打勾過 ⇒ 左上角那顆轉強調色');
  }

  /* ② 白灰階：驗回傳那條路會打勾（整輪 259 階太慢，見檔頭「沒驗到的」）*/
  H('④-2 ② 量白灰階：回傳 ⇒ 打勾');
  {
    const ws = makeBridge({ regs: em01Regs(5), mem: new Map(),
                            busAddr: EM01.busAddr, busBit: EM01.busBit });
    const opener = fakeWin();
    const { P } = await loadSelf({ ws, ic: 'EM01A1', opener,
      qs: '?task=13&dest=' + encodeURIComponent('第 2 部分') + '&step=gray' });
    /* 🔴 `idx`／`r12` 是產品端 dstPlan() 產生的欄位（v1.4.0 起灰階欄送的是 0…255
       的索引，不是使用者刻度上的值）。本檔自己按那個規則造，不呼叫產品的函式。 */
    P.__setRowsForTest([
      { key: 'L0',   group: 'gray', idx: 0,   r12: 0,    x: 0.25,   y: 0.25,   lv: 0 },
      { key: 'L128', group: 'gray', idx: 128, r12: 2048, x: 0.3127, y: 0.3290, lv: 60 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.3127, y: 0.3290, lv: 300 }
    ]);
    EQ(P.dgRows().gray.map(r => r[0]), [0, 128, 255], '前置條件：灰階欄是 0…255 的索引');
    CHECK(P.dgSend() === true, '回傳成功');
    await sleep(20);
    EQ(P.stepDone(), { lut: false, gray: true, prim: false }, '🔴 只有 ② 打勾');
    EQ(P.stepRow('gray').tick, '✔', '🔴 ② 那一列變成 ✔');
    /* 🔴 這一輪作廢 ⇒ 不送 ⇒ **不打勾** */
    const { P: P2 } = await loadSelf({ ws: makeBridge({ regs: em01Regs(5) }), ic: 'EM01A1',
      opener: fakeWin(), qs: '?task=14&step=gray' });
    P2.__setRowsForTest([{ key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
                         { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 }]);
    P2.__setRunOkForTest(false);
    CHECK(P2.dgSend() === false, '前置條件：作廢的一輪不回傳');
    EQ(P2.stepDone(), { lut: false, gray: false, prim: false },
      '🔴 沒送出去就**沒有打勾**（假勾等於騙他東西在 DG 那邊了）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 沒有 opener：左上角那顆退回「‹ 返回主頁」，剪貼簿退路出現
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 沒有 opener：剪貼簿退路');
  {
    const mem = buildSram(N, VALS);
    const ws = makeBridge({ regs: em01Regs(5), mem, busAddr: EM01.busAddr, busBit: EM01.busBit });
    const { P, w } = await loadSelf({ ws, ic: 'EM01A1', opener: null, qs: '' });
    EQ(P.dgState().linked, false, '前置條件：沒有 opener');
    EQ(P.backText(), '‹ 返回主頁',
      '🔴 沒有 opener ⇒ 左上角那顆退回「‹ 返回主頁」（不留一顆按了沒反應的死鈕）');
    EQ(P.backHref(), 'index.html', '🔴 而且 href 是 index.html');
    EQ(P.backIsPri(), false, '沒有 opener ⇒ 不會轉強調色（沒有東西送過去）');
    EQ(P.copyHidden(), false, '🔴 沒有 opener ⇒「複製到剪貼簿」出現');
    EQ(P.copyDisabled(), true, '還沒讀過 ⇒ 複製鈕是灰的（沒東西可複製）');
    EQ([P.stepRow('lut').to, P.stepRow('gray').to, P.stepRow('prim').to], ['', '', ''],
      '🔴 沒有 DG 可回 ⇒ 三列都不寫「→ 回 DG 的第 N 部分」（那句話會是假的）');
    EQ([P.stepRow('lut').cur, P.stepRow('gray').cur, P.stepRow('prim').cur], [false, false, false],
      '沒有 opener ⇒ 沒有「目前這一步」這回事');

    /* 讀回來 ⇒ 不打勾（沒送出去），改講退路 */
    const ok = await P.stepLut();
    await sleep(60);
    CHECK(ok === false, '🔴 沒有 opener ⇒ 回傳 false（沒有送出去）');
    EQ(P.stepDone(), { lut: false, gray: false, prim: false }, '🔴 沒送出去 ⇒ 不打勾');
    CHECK((P.saySteps() || '').indexOf('複製到剪貼簿') >= 0,
      '🔴 改講退路：叫他按「複製到剪貼簿」', P.saySteps());
    EQ(P.copyDisabled(), false, '讀到資料了 ⇒ 複製鈕可以按');

    /* TSV 的內容：本檔自己算一份期望值，不問產品 */
    let want = 'Index\tRLUT\tGLUT\tBLUT';
    for (let i = 0; i < MAIN; i++) want += '\r\n' + i + '\t' + VALS[0][i] + '\t' + VALS[1][i] + '\t' + VALS[2][i];
    want += '\r\n';
    EQ(P.lutTsv(), want, '🔴 TSV 與 DG 的「一鍵複製 RGB」逐字同格式（表頭、tab、CRLF、結尾換行）');
    EQ(P.lutTsv().split('\r\n').length, MAIN + 2, 'TSV 行數 ＝ 表頭 1 ＋ 256 列 ＋ 結尾空行');

    /* 複製：jsdom 沒有 navigator.clipboard，補一個假的（驗的是「送什麼出去」）*/
    let copied = null;
    Object.defineProperty(w.navigator, 'clipboard', {
      value: { writeText: t => { copied = t; return Promise.resolve(); } },
      configurable: true
    });
    CHECK(P.copyLut() === true, '「複製到剪貼簿」回傳 true');
    EQ(copied, want, '🔴 真的把那一份 TSV 交給剪貼簿了');
    CHECK((P.saySteps() || '').indexOf('256') >= 0, '訊息講了幾筆', P.saySteps());
    EQ(P.backToDg(), false, '🔴 沒有 opener ⇒ 回到 DG 那條路什麼都不做');
    /* 🔴 按下去**不可以**被攔掉 —— 它此刻就是原本那顆返回主頁的鈕。
       jsdom 不會真的導覽，所以驗的是「click 沒有被 preventDefault」。 */
    var ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    w.document.getElementById('dst-back').dispatchEvent(ev);
    await sleep(10);
    EQ(ev.defaultPrevented, false, '🔴 沒有 opener ⇒ 不攔導覽，照原本的方式回首頁');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ DG 端的回填：第 1 部分
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥ DG 第 1 部分的回填');
  {
    const { win, doc, opened, errs } = await loadDg();
    doc.getElementById('dg-btn-tcon-lut').click();
    await sleep(15);
    const task = win.dgApi.liveTaskId();
    /* 🔴 用**自檢頁真的會送出去的那一份**：上面第 ③ 組已經把它印出來過，
       這裡照同一個形狀組（本檔自己算，不從產品拿）。 */
    const rows = [];
    for (let i = 0; i < MAIN; i++) rows.push([i, VALS[0][i], VALS[1][i], VALS[2][i]]);
    const sdBefore = doc.getElementById('dg-sd').value;
    const frcBefore = doc.getElementById('dg-frc').value;
    const entBefore = doc.getElementById('dg-entry').value;

    const ev = new win.MessageEvent('message', {
      data: { type: 'dg-measure-result', mode: 'lut', label: '從 T-CON 讀回', task: task,
              at: '2026-09-21 10:00:00', rows: rows, depth: 12, entries: N, icKey: 'EM01A1' },
      origin: ORIGIN
    });
    Object.defineProperty(ev, 'source', { value: opened[0] });
    win.dispatchEvent(ev);
    await sleep(80);

    const lines = win.dgApi.lutText().trim().split('\n');
    EQ(lines.length, MAIN, '🔴 第 1 部分收到 256 列');
    EQ(lines[0], '0 ' + VALS[0][0] + ' ' + VALS[1][0] + ' ' + VALS[2][0],
      '🔴 第一列是 index 0 ＋ R／G／B（格式與匯入 LUT 檔那一條逐字相同）');
    EQ(lines[MAIN - 1], (MAIN - 1) + ' ' + VALS[0][MAIN - 1] + ' ' + VALS[1][MAIN - 1] + ' ' + VALS[2][MAIN - 1],
      '🔴 最後一列是 index 255');
    EQ(win.dgApi.srcOf('lut'), { kind: 'tcon', name: '2026-09-21 10:00:00', edited: false },
      '🔴 來源種類是 tcon，時間就是自檢頁送來的 at');
    EQ(win.dgApi.badgeOf('lut').text, '從 T-CON 讀回', '🔴 來源標示寫「從 T-CON 讀回」');
    CHECK(/live/.test(win.dgApi.badgeOf('lut').cls), '徽章沿用既有的 live 樣式（不新增 class）',
      win.dgApi.badgeOf('lut').cls);
    /* 🔴 三個選單不准被它動到 */
    EQ([doc.getElementById('dg-sd').value, doc.getElementById('dg-frc').value,
        doc.getElementById('dg-entry').value], [sdBefore, frcBefore, entBefore],
      '🔴 Source Driver／FRC／LUT Entry 一個都沒被動到');
    const box = win.dgApi.fmtBoxText() || '';
    CHECK(box.indexOf('256') >= 0 && box.indexOf('257') >= 0,
      '方框裡講了「主表 256 筆／IC 裡 257 筆」', box.slice(0, 120));
    CHECK(box.indexOf('沒有被動到') >= 0, '🔴 方框裡明講三個選單沒被動到');
    EQ(errs, [], 'DG 這一頁沒有拋出任何 jsdom 錯誤');

    /* 覆蓋：再收一次（只有兩筆），照本頁既有做法直接蓋掉、不問 */
    const ev2 = new win.MessageEvent('message', {
      data: { type: 'dg-measure-result', mode: 'lut', label: '從 T-CON 讀回', task: task,
              at: '2026-09-21 11:00:00', rows: [[0, 1, 2, 3], [1, 4, 5, 6]] },
      origin: ORIGIN
    });
    Object.defineProperty(ev2, 'source', { value: opened[0] });
    win.dispatchEvent(ev2);
    await sleep(60);
    EQ(win.dgApi.lutText().trim().split('\n'), ['0 1 2 3', '1 4 5 6'],
      '🔴 第 1 部分已有資料時直接覆蓋（與匯入檔／出廠等距表／進行下一輪同一個做法）');

    /* 筆數不足 ⇒ 不帶入，也不清掉現有的 */
    const ev3 = new win.MessageEvent('message', {
      data: { type: 'dg-measure-result', mode: 'lut', task: task, at: 'x', rows: [[0, 1, 2, 3]] },
      origin: ORIGIN
    });
    Object.defineProperty(ev3, 'source', { value: opened[0] });
    win.dispatchEvent(ev3);
    await sleep(40);
    EQ(win.dgApi.lutText().trim().split('\n'), ['0 1 2 3', '1 4 5 6'],
      '🔴 只有一筆 ⇒ 不帶入，也沒有把原本那兩筆弄掉');
    CHECK((doc.getElementById('dg-status').textContent || '').indexOf('不足') >= 0,
      '而且狀態列講了原因', (doc.getElementById('dg-status').textContent || '').slice(0, 60));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥-2 🔴 Bug 3：I2C Bridge 狀態碼對照表
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥-2 🔴 Bug 3：狀態碼對照表');
  {
    const { P, doc } = await loadSelf({ opener: null });
    /* 🔴 「說明區塊存在且預設收起」——Bruce 指定的兩條 */
    CHECK(!!doc.getElementById('dst-sc-det'), '🔴 狀態碼說明區塊存在');
    EQ(P.scOpen(), false, '🔴 預設是收起來的（不佔版面）');
    const rows = P.scRows();
    /* 🔴 順序照 i2c_bridge.c 的判定優先序，不是字母序；且**不含 B** */
    EQ(rows.map(r => r[0]), ['P', 'T', 'D', 'F', 'X', 'J', 'U', 'G'],
      '🔴 八個字母都在，順序 ＝ bridge 的判定優先序');
    CHECK(rows.every(r => r[1] && r[1].length > 10), '每一列都有一句處置，不是空的',
      rows.map(r => r[1].length));
    CHECK(rows.every(r => r[1].indexOf('dst.sc') < 0), '🔴 沒有未翻譯的 key 漏在表格裡');
    const txt = P.scText() || '';
    /* 🔴 Bruce 的裁示：不要寫管理者權限那句 */
    CHECK(txt.indexOf('管理者') < 0 && txt.indexOf('系統管理') < 0 && txt.indexOf('管理員') < 0,
      '🔴 一個字都沒有提「管理者權限」（那是誤歸因，會讓人停止找真原因）', txt.slice(0, 80));
    /* 🔴 B 不在表裡（v1.7.0 起 exe 不開瀏覽器 ⇒ 那個字母印不出來）*/
    CHECK(rows.every(r => r[0] !== 'B'), '🔴 不列 B —— 現在的 exe 印不出那個字母');
    /* 源碼佐證：判定鏈上真的沒有 B 這一支（不是我說沒有就沒有）*/
    const bridge = fs.readFileSync(path.join(repo, 'tools/i2c-bridge/i2c_bridge.c'), 'utf8');
    CHECK(/g_browserOk\s*=\s*1;/.test(bridge),
      '🔴 源碼佐證：g_browserOk 被無條件設成 1（所以 B 那一支永遠不成立）');
    CHECK(!/code\s*=\s*'B'/.test(bridge), '🔴 源碼佐證：判定鏈上沒有任何一行寫 code = \'B\'');
    /* 四個「真正常見」的原因都在表裡，而且講的是 README 那個處置 */
    const by = {}; rows.forEach(r => { by[r[0]] = r[1]; });
    CHECK(by.T.indexOf('解壓') >= 0, 'T 講的是「整包解壓到一個資料夾」', by.T);
    CHECK(by.F.indexOf('ftd2xx.dll') >= 0, 'F 講的是 ftd2xx.dll 載不到', by.F);
    CHECK(by.U.indexOf('別的程式') >= 0, 'U 講的是治具被別的程式佔著', by.U);
    CHECK(by.P.indexOf('8899') >= 0, 'P 講的是 127.0.0.1:8899 被佔用', by.P);
    /* 🔴 去商標化：畫面上不留廠商產品名，也不留「原廠」
       （`tools/check_ui_jargon.js` 自己的理由：他自己寫的 UI 也會來搶治具）。 */
    CHECK(txt.indexOf('PQ Tool') < 0 && txt.indexOf('AUX GUI') < 0 && txt.indexOf('原廠') < 0,
      '🔴 表格裡沒有廠商產品名、也沒有「原廠」字樣');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ i18n：本版新增的 key 三語齊全
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ i18n 三語齊全');
  {
    const keys = ['dst.hdSteps', 'dst.stepLut', 'dst.stepGray', 'dst.stepPrim', 'dst.goLut',
                  'dst.goScan', 'dst.copyLut', 'dst.backDg', 'dst.stepTo', 'dst.stepsWhyRun',
                  'dst.stepsWhyLink', 'dst.stepsWhyIc', 'dst.stepLutNoDg', 'dst.dgLabelLut',
                  'dst.dgSentLut', 'dst.dgLutTooFew', 'dst.copyOk', 'dst.copyFail',
                  'dst.scSum', 'dst.scThCode', 'dst.scThWhat', 'dst.scLog',
                  'dst.scG', 'dst.scT', 'dst.scD', 'dst.scF', 'dst.scX', 'dst.scJ',
                  'dst.scU', 'dst.scP'];
    const { w } = await loadSelf({ opener: null });
    const bad = [];
    for (const k of keys) {
      const e = w.I18N && w.I18N[k];
      if (!e) { bad.push(k + ':missing'); continue; }
      for (const lang of ['zh-TW', 'en', 'zh-CN']) if (!e[lang]) bad.push(k + ':' + lang);
    }
    EQ(bad, [], `本版新增的 ${keys.length} 個 key 三語全部齊全`);
    /* 畫面上不可以出現未翻譯的 key 本身。
       🔴 取 `.container` 而不是 `document.body`：本頁的 `<script>` 也在 body 裡，
          而它的 textContent 含 `I18N['dst.stepLut']` 這種字面 ⇒ 抓 body 會恆真地紅。 */
    const shown = (w.document.querySelector('.container') || { textContent: '' }).textContent || '';
    CHECK(shown.indexOf('dst.step') < 0 && shown.indexOf('dst.go') < 0
          && shown.indexOf('dst.sc') < 0,
      '🔴 畫面上沒有任何未翻譯的 key 漏出來');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑧ 🔴 突變測試：把三件事各改壞一次，對應的斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑧ 🔴 突變測試');
  {
    /* 突變 1：把「送出去才打勾」拿掉 ⇒ 第 ④-2 組那條「沒送出去不打勾」必須紅 */
    const orig1 = 'dstStepDone[dstDgMode] = true;';
    CHECK(SELF_SRC.indexOf(orig1) > 0, '找得到「回傳成功才打勾」那一行');
    const mut1 = SELF_SRC.replace(
      'function dstDgSend() {\n  if (!dstDgAlive()) return false;',
      'function dstDgSend() {\n  dstStepDone[dstDgMode] = true;\n  if (!dstDgAlive()) return false;');
    CHECK(mut1 !== SELF_SRC, '突變 1 真的套上去了');
    const { P } = await loadSelf({ ws: makeBridge({ regs: em01Regs(5) }), ic: 'EM01A1',
      opener: fakeWin(), src: mut1, qs: '?task=1&step=gray' });
    P.__setRowsForTest([{ key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
                        { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 }]);
    P.__setRunOkForTest(false);
    P.dgSend();
    await sleep(20);
    EQ(P.stepDone().gray, true,
      '🔴 突變後「作廢的一輪也打勾」了 ⇒ 證明第 ④-2 組那條真的在驗東西');
  }
  {
    /* 突變 2：把 `step` 缺席時退回 mode 的那一段改壞 ⇒ 第 ② 組那條必須紅 */
    const orig2 = "return (DST_STEPS.indexOf(v) >= 0) ? v : ((mode === 'prim') ? 'prim' : 'gray');";
    CHECK(SELF_SRC.indexOf(orig2) > 0, '找得到 step 退回 mode 的那一行');
    const mut2 = SELF_SRC.replace(orig2, "return (DST_STEPS.indexOf(v) >= 0) ? v : 'lut';");
    const { P } = await loadSelf({ src: mut2, opener: fakeWin(),
      qs: '?task=2&dest=' + encodeURIComponent('第 2 部分') });
    EQ(P.stepCur(), 'lut',
      '🔴 突變後舊版 DG（不帶 step）會標錯那一步 ⇒ 證明第 ② 組那條真的在驗東西');
  }
  {
    /* 突變 3：把「主表筆數」改成整張表 ⇒ 第 ③ 組的 256 必須變成 257 */
    const orig3 = 'return (n > 0 && (n & (n - 1)) === 0) ? n : entries;';
    CHECK(SELF_SRC.indexOf(orig3) > 0, '找得到主表筆數那一行');
    const mut3 = SELF_SRC.replace(orig3, 'return entries;');
    const mem = buildSram(N, VALS);
    const ws = makeBridge({ regs: em01Regs(5), mem, busAddr: EM01.busAddr, busBit: EM01.busBit });
    const opener = fakeWin();
    const { P } = await loadSelf({ ws, ic: 'EM01A1', opener, src: mut3, qs: '?task=3&step=lut' });
    await P.stepLut();
    await sleep(60);
    const out = opener.msgs[opener.msgs.length - 1];
    EQ(out.rows.length, N,
      '🔴 突變後把附加末筆也送出去了（257）⇒ 證明第 ③ 組那個 256 真的是這一行決定的');
  }
  {
    /* 突變 4：把「按完關掉所在的浮動視窗」拿掉 ⇒ 第 ① 組那條必須紅 */
    const orig4 = "if (host && host.id) dgStepModalClose(host.id);";
    CHECK(DG_SRC.indexOf(orig4) > 0, '找得到「關掉所在浮動視窗」那一行');
    const mut4 = DG_SRC.replace(orig4, '/* mutated */');
    const { win, doc } = await loadDg(mut4);
    doc.getElementById('dg-btn-gray-setup').click();
    await sleep(10);
    doc.getElementById('dg-btn-tcon-gray').click();
    await sleep(20);
    EQ(win.dgApi.stepModalOpen('dg-modal-gray'), true,
      '🔴 突變後第 2 部分那張視窗留在畫面上（會蓋住狀態列）⇒ 證明第 ① 組那條真的在驗東西');
  }

  {
    /* 突變 5：把 dstBind() 開頭那次 applyLang 拿掉 ⇒ 第 ⑦ 組的「畫面上沒有未翻譯
       的 key」必須紅。🔴 這一條**就是這支夾具當場抓到的 bug**（v1.8.0 第一版畫面上
       印的是 dst.hdSteps／dst.stepLut／dst.goLut／dst.scSum 這些 key 本身），
       留著突變版本才能證明那個修正真的在起作用。 */
    const orig5 = "try { applyLang(typeof currentLang === 'string' ? currentLang : 'zh-TW'); } catch (e) {}";
    CHECK(SELF_SRC.indexOf(orig5) > 0, '找得到 dstBind() 開頭那次 applyLang');
    const mut5 = SELF_SRC.replace(orig5, '/* mutated */');
    const { w } = await loadSelf({ src: mut5, opener: null });
    const shown = (w.document.querySelector('.container') || { textContent: '' }).textContent || '';
    CHECK(shown.indexOf('dst.hdSteps') >= 0 && shown.indexOf('dst.scSum') >= 0,
      '🔴 突變後 key 本身又印在畫面上了 ⇒ 證明第 ⑦ 組那條真的在驗東西',
      shown.slice(shown.indexOf('dst.') - 20, shown.indexOf('dst.') + 40));
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的：真治具、真 TCON、真量測儀、真瀏覽器的分頁與剪貼簿行為；');
  console.log('   ② 白灰階沒有跑整輪 259 階（見檔頭），驗的是回傳那條路。');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
