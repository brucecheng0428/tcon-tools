/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v1101_probe.js — dgself v1.10.1 的驗收夾具（jsdom）

   這一版全部是**搬移與改名**，沒有新增任何能力。搬移這種改動最陰險的地方是：
   搬完之後頁面照樣跑得好好的，**沒有任何既有測試會紅** —— 少搬一個、多留一份、
   分錯組，都只有 Bruce 打開畫面才看得到。所以這支專門釘住「東西在不在它該在的
   那一格」「原處有沒有留第二份」。

   驗收五組（每一組都配一個突變：把產品端改回去，對應的斷言必須變紅）：
     ① 最上面那張卡分成三組，而且**各組裝的是對的東西**
        · 讀寫 I2C 治具組 ⊇ 連線鈕 ＋ Bridge 下載入口
        · T-CON 組       ⊇ 重新識別 ＋ IC 型號 ＋ DG_EN
        · 光學量測儀組    ⊉ DG_EN（Bruce 回報的就是這一條被違反）
     ② 「板子上」這個**說法**在三語都不再出現（中文「板子上」＋英文 “on the board”；
        掃 i18n 表 ＋ 三語各渲染一次的畫面。🔴 驗的是說法不是單一詞條 —— 第一版
        只比對「板子上的 T-CON」，漏掉四句同樣說法的文案，Bruce 在 Dispatch 端
        grep 才抓到。列舉式判準必漏，這是第二次實證）
     ③ 換階等待／停止／匯出 XLSX 三者都在「量測與調整 Gamma 所需步驟」卡的
        ②③ 那一格裡，而且**原處（「量測」卡）不再有重複的一份**
     ④ 量測結果（結果表、進度、畫面更新率）**仍在下方那張「量測」卡**
     ⑤ 🔴 v1.10.1 新增的第四項（回到 DG 頁）：排在清單第四、**永遠不打勾**、
        前三步任一完成後轉強調色、並且畫面上如實標註「可能不會動」

   ═══ 🔴 怎麼避免「自己驗自己」═══════════════════════════════════════════════
     · 期望的分組成員、順序、三語字串**全部寫死在本檔**，不從產品端問答案。
     · 每一組都有配對突變（第 ⑥ 組）。沒有配對突變的斷言 ＝ 不知道它在驗什麼。

   🔴 **沒驗到的（誠實列出）**：
     · 真瀏覽器的版面 —— 三組之間那條分隔線長怎樣、換階等待下拉會不會擠爆那一格。
       jsdom 沒有版面（`getBoundingClientRect()` 一律回 0×0）。**版面另看截圖。**
     · 🔴 **「回到 DG 頁」按下去有沒有真的回到 DG**：`window.opener.focus()` 在真
       瀏覽器被擋（Bruce 2026-09-21 實測按了沒反應），而 jsdom 的 focus 是假的，
       一驗就是假綠。本檔**刻意只驗版面與狀態**，行為那一半等 Bruce 裁示改法。
     · 真治具、真 TCON、真量測儀。

   用法：node tools/dg_selftest_v1101_probe.js
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

function fakeWin() {
  const w = { closed: false, msgs: [], focused: 0 };
  w.postMessage = d => w.msgs.push(JSON.parse(JSON.stringify(d)));
  w.focus = () => { w.focused++; };
  return w;
}

/* ═══ EM01 的假 SRAM ＋ 假 I2C Bridge（與 v1.10.0 夾具同一份，本檔自己持有）═══ */
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
async function loadReady(opts) {
  opts = opts || {};
  const ws = opts.ws || makeBridge({ regs: em01Regs(5), mem: opts.mem || new Map(),
                                     busAddr: EM01.busAddr, busBit: EM01.busBit });
  const ctx = await loadSelf({ ws, ic: 'EM01A1', opener: opts.opener, src: opts.src,
                              qs: opts.qs == null ? '?task=1&step=gray' : opts.qs });
  if (opts.meter !== false) {
    ctx.P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456' : 'OK'));
  }
  ctx.P.__renderBtns();
  await sleep(20);
  ctx.ws = ws;
  return ctx;
}

/* 🔴 本檔自己寫死的期望：三組各自該裝哪些控制項。
   產品端被改壞時，答案不會跟著一起變。 */
const GROUP_EXPECT = {
  bridge: ['dst-link', 'dst-v-bridge', 'dst-dl-box', 'dst-dl'],
  tcon:   ['dst-probe', 'dst-v-ic', 'dst-alt', 'dst-v-res', 'dst-v-dg', 'dst-dg-ck', 'dst-dg-warn'],
  meter:  ['dst-ca', 'dst-ca-txt']
};
/* 🔴 反面：量測儀那一組**不可以**裝這些（Bruce 回報的正是 DG_EN 跑進去了）。 */
const METER_FORBID = ['dst-v-dg', 'dst-dg-ck', 'dst-dg-warn', 'dst-dl-box', 'dst-probe'];
/* 🔴 搬進「量測」那一格的三個控制項。 */
const MOVED_TO_GROUP23 = ['dst-settle', 'dst-stop', 'dst-xlsx'];
/* 🔴 量測**結果**留在下面那張卡的東西。 */
const STAY_IN_MEASURE = ['dst-res-wrap', 'dst-res', 'dst-v-hz', 'dst-prog', 'dst-progtxt'];

/* 🔴 「板子上」／“on the board” 這個**說法**的掃描器（第 ② 組與 M2／M2-b 共用
   同一支，不寫兩份判準 —— 兩份遲早會分岔，而分岔的那一刻就是又漏一個詞條）。 */
function scanBadPhrase(P) {
  const hits = [];
  P.i18nKeys().forEach(k => {
    const v = P.i18nValues(k);
    if (!v) return;
    ['zh-TW', 'en', 'zh-CN'].forEach(L => {
      const s = v[L];
      if (typeof s === 'string'
          && (s.indexOf('板子上') >= 0 || s.toLowerCase().indexOf('on the board') >= 0)) {
        hits.push(k + ':' + L);
      }
    });
  });
  return hits;
}

/* jsdom 裡切語言：產品自己那支 applyLang（不是夾具另寫一份翻譯）。 */
function renderLang(w, lang) {
  w.applyLang(lang);
  const c = w.document.querySelector('.container');
  return c ? c.textContent : '';
}

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① 最上面那張卡：三個分組，各組裝的是對的東西
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 外接硬體卡：三個分組，成員正確');
  {
    const { P, doc } = await loadSelf({ opener: null });

    /* 卡名：Bruce 指定加「確認」 */
    const hd = (doc.querySelector('#dst-hw-card .card-header') || {}).textContent || '';
    CHECK(hd.indexOf('外接硬體連線確認') >= 0, '🔴 卡名 ＝「外接硬體連線確認」', hd.trim());

    /* 三組都在，而且都在那張卡裡 */
    ['bridge', 'tcon', 'meter'].forEach(g => {
      const e = doc.getElementById('dst-hwgrp-' + g);
      CHECK(!!e, '分組存在：dst-hwgrp-' + g);
      CHECK(!!(e && doc.getElementById('dst-hw-card').contains(e)),
        '分組在「外接硬體連線確認」卡裡：' + g);
    });

    /* 🔴 正面：每一組該裝的都裝了，而且全頁**只有一個**（＝搬過去，不是複製） */
    Object.keys(GROUP_EXPECT).forEach(g => {
      GROUP_EXPECT[g].forEach(id => {
        EQ(P.ctrlInGroup(id, g), { n: 1, inGroup: true },
          '🔴 ' + id + ' 全頁只有一個，而且就在「' + g + '」那一組裡');
      });
    });

    /* 🔴 反面（Bruce 回報的那一條）：DG_EN 不可以在量測儀那一組 */
    METER_FORBID.forEach(id => {
      const r = P.ctrlInGroup(id, 'meter');
      CHECK(r.inGroup === false, '🔴 量測儀那一組**不含** ' + id, r);
    });

    /* 🔴 下載入口是「搬進治具組」不是「還留在卡片最下面」：
       它的下一個兄弟不該是別組，而且它必須在治具組的 `.dst-hw` 之後。 */
    const box = doc.getElementById('dst-dl-box');
    const grpB = doc.getElementById('dst-hwgrp-bridge');
    CHECK(grpB.contains(box), '🔴 下載 I2C Bridge 的整塊入口在「讀寫 I2C 治具」那一組裡');
    CHECK(box.compareDocumentPosition(doc.getElementById('dst-hwgrp-tcon'))
          & 4 /* DOCUMENT_POSITION_FOLLOWING */,
      '🔴 下載入口排在 T-CON 那一組**之前**（＝不是被擠到整張卡最下面）');

    /* 🔴 `#dst-say-link` 刻意留在三組之外（它不只講治具） */
    const say = doc.getElementById('dst-say-link');
    CHECK(!doc.getElementById('dst-hwgrp-bridge').contains(say)
       && !doc.getElementById('dst-hwgrp-tcon').contains(say)
       && !doc.getElementById('dst-hwgrp-meter').contains(say),
      'dst-say-link 在三組之外（它同時講治具／IC 識別／DG 寫入）');

    /* 讀寫治具那一列的字：Bruce 指定改成「讀寫 I2C 治具」 */
    const bTxt = doc.querySelector('#dst-hw-bridge .dst-step-txt').textContent.trim();
    EQ(bTxt, '讀寫 I2C 治具', '🔴 那一列的字 ＝「讀寫 I2C 治具」');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 「板子上的 T-CON」在三語都不見了
     ═══════════════════════════════════════════════════════════════════════ */
  H('② 文案：全頁拿掉「板子上」這個說法（三語，含英文 on the board）');
  {
    const { P, w } = await loadSelf({ opener: null });

    EQ(P.i18nValues('dst.hwTcon'), { 'zh-TW': 'T-CON', 'en': 'T-CON', 'zh-CN': 'T-CON' },
      '🔴 dst.hwTcon 三語都是「T-CON」（本檔寫死的期望值）');

    /* ═══ 🔴 驗的是**說法**，不是那一個詞條 ══════════════════════════════════
       第一版只掃「板子上的 T-CON」，**漏掉了四句同樣說法的文案**（`dst.txWhyNoIc`／
       `dst.icWhyNoIc` 的繁簡兩面），是 Bruce 在 Dispatch 端 grep 才抓到的。
       根因：他給的是**原則**（「不要用『板子上的』，聽起來很奇怪」），我卻把它
       當成一個待辦事項來勾。⇒ 判準改成掃**這個說法本身**：
         · 中文「板子上」（同時蓋住「板子上的」與「板子上是」）
         · 英文 “on the board”（同一個語感的說法，漏掉它等於只修了三分之二）
       🔴 只掃 i18n 值與畫面，**註解不算** —— 註解正是在記錄「為什麼改掉」。 */
    const BAD_CN = '板子上';
    const BAD_EN = 'on the board';
    EQ(scanBadPhrase(P), [],
      '🔴 整份 i18n 表（含 common/i18n.js）三語都沒有「板子上」／“on the board”');

    /* 🔴 畫面上也要確認：三語各渲染一次，走產品自己的 applyLang */
    ['zh-TW', 'en', 'zh-CN'].forEach(L => {
      const txt = renderLang(w, L);
      CHECK(txt.indexOf(BAD_CN) < 0 && txt.toLowerCase().indexOf(BAD_EN) < 0,
        '🔴 ' + L + ' 的畫面上沒有「板子上」／“on the board”');
      CHECK(txt.indexOf('dst.hwTcon') < 0 && txt.indexOf('dst.hdSteps') < 0
         && txt.indexOf('dst.stepBack') < 0 && txt.indexOf('dst.backHint') < 0,
        '🔴 ' + L + ' 的畫面上沒有漏出未翻譯的 key（t() 查不到會回傳 key 本身）');
    });
    /* 🔴 原始碼層（去掉註解之後）也不留 —— 做法照 tools/check_ui_jargon.js。 */
    const stripped = SELF_SRC.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    CHECK(stripped.indexOf(BAD_CN) < 0,
      '🔴 原始碼（去註解後）也不再有「板子上」這個說法');

    /* 第二張卡的卡名：Bruce 指定的正式寫法 */
    EQ(P.i18nValues('dst.hdSteps')['zh-TW'], '量測與調整 Gamma 所需步驟',
      '🔴 第二張卡名 ＝「量測與調整 Gamma 所需步驟」');
    ['zh-TW', 'en', 'zh-CN'].forEach(L => {
      CHECK((P.i18nValues('dst.hdSteps')[L] || '').indexOf('三件事') < 0,
        '🔴 ' + L + ' 的卡名不再是「接上機台能做的三件事」');
    });
    w.applyLang('zh-TW');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 換階等待／停止／匯出 XLSX 搬進量測那一格，原處不留第二份
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 量測操作搬進 ②③ 那一格，原處沒有第二份');
  {
    const { P, doc } = await loadSelf({ opener: null });
    MOVED_TO_GROUP23.forEach(id => {
      EQ(P.ctrlInGroup23(id), { n: 1, inGroup: true },
        '🔴 ' + id + ' 全頁只有一個，而且就在 ②③ 那一格裡');
      EQ(P.inMeasureCard(id), false,
        '🔴 ' + id + ' **已經不在**下面那張「量測」卡（原處沒留第二份）');
    });
    /* 換階等待要排在按鈕**之前**（設定要先於動作） */
    const g = doc.getElementById('dst-group23');
    const sel = doc.getElementById('dst-settle'), gray = doc.getElementById('dst-step-gray');
    CHECK(sel.compareDocumentPosition(gray) & 4,
      '🔴 換階等待排在 ② 那一列之前（按下去之前要先決定的事）');
    /* 停止就在主鈕旁邊（同一列） */
    CHECK(gray.contains(doc.getElementById('dst-stop')),
      '🔴「停止」與「開始量測」在同一列');
    /* 下拉是真的有選項（搬過去之後 JS 仍然把 DST_SETTLE_CHOICES 填進來） */
    CHECK(sel.options.length > 0, '🔴 換階等待的選項有被填進來（不是一個空下拉）',
      sel.options.length);
    CHECK(String(P.settleMs ? P.settleMs() : sel.value) === '700',
      '🔴 預設仍是 700 ms（這一輪沒有動任何預設值）', sel.value);
    CHECK(g.contains(doc.getElementById('dst-xlsx')), '🔴 匯出 XLSX 在 ②③ 那一格裡');
  }
  {
    /* 🔴 搬過去之後**事件與狀態照舊**：量測中「停止」要能按、按下去真的會停。
       🔴「正在量測」這個事實用產品既有的觀測點 `runWhyKey()` 讀（它回
          `dst.whyRunning` 的唯一來源就是 `dstRunning`），不另開一個只給測試用的旗標。 */
    const isRunning = P => P.runWhyKey() === 'dst.whyRunning';
    const { P, doc } = await loadReady({ qs: '?mode=prim&task=21&step=prim' });
    EQ([doc.getElementById('dst-stop').disabled, doc.getElementById('dst-xlsx').disabled],
      [true, true], '前置條件：還沒量 ⇒ 停止與匯出都是灰的');
    const done = P.stepScan('prim');
    await waitFor(() => isRunning(P), 3000);
    EQ(isRunning(P), true, '前置條件：量測真的開始了');
    EQ(doc.getElementById('dst-stop').disabled, false,
      '🔴 量測中「停止」可以按（搬家沒有弄丟 dstRenderBtns 的那一條）');
    /* 走**畫面上那顆鈕的 click**（產品路徑），不是直接呼叫 P.abort() */
    doc.getElementById('dst-stop').click();
    await waitFor(() => !isRunning(P), 8000);
    await done;
    EQ(isRunning(P), false, '🔴 按下搬過去的那顆「停止」真的會停（事件綁定還在）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 量測結果仍在下方那張卡
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ 量測結果留在下方「量測」卡');
  {
    const { P, doc } = await loadSelf({ opener: null });
    const steps = doc.getElementById('dst-steps-card');
    STAY_IN_MEASURE.forEach(id => {
      EQ(P.inMeasureCard(id), true, '🔴 ' + id + ' 仍在下面那張「量測」卡裡');
      CHECK(!steps.contains(doc.getElementById(id)),
        '🔴 ' + id + ' 沒有被搬進上面那張步驟卡（上面只放操作）');
    });
    /* 結果表真的會被填（走產品那條路量一輪純色三階） */
  }
  {
    const { P, doc } = await loadReady({ qs: '?mode=prim&task=21&step=prim' });
    await P.stepScan('prim');
    await sleep(80);
    const tb = doc.getElementById('dst-res');
    CHECK(tb.children.length === 3, '🔴 量完之後結果三列寫進下面那張卡的表',
      tb.children.length);
    CHECK(!doc.getElementById('dst-steps-card').contains(tb),
      '🔴 那張表不在上面那張步驟卡裡');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 第四項「回到 DG 頁」：版面與狀態（行為這一輪不動，也不驗）
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 第四項：排第四、不打勾、前三步任一完成轉強調色');
  const N = 257;
  const VALS = [fakeTable(N, 0), fakeTable(N, 1), fakeTable(N, 2)];
  {
    const { P, doc } = await loadSelf({ opener: null });
    EQ(P.stepRowOrder(),
      ['dst-step-lut', 'dst-step-gray', 'dst-step-prim', 'dst-step-back'],
      '🔴 ④ 排在清單第四項（本檔寫死的順序）');
    EQ(P.backRowTick(), '○', '🔴 ④ 的圈圈是空心的');
    EQ(P.backRowDone(), false, '🔴 ④ 沒有 done（它本來就不該有完成狀態）');
    /* 沒有 opener ⇒ 那一顆是「返回主頁」，那條路是好的 ⇒ 不貼警語 */
    EQ(P.backWarnHidden(), true,
      '🔴 直接開這一頁（沒有 opener）時不貼「可能不會動」——那時走的是首頁連結，是好的');
  }
  {
    const opener = fakeWin();
    const { P, doc } = await loadReady({ mem: buildSram(N, VALS), opener,
      qs: '?task=7&dest=' + encodeURIComponent('第 1 部分') + '&step=lut' });

    EQ(P.backBotIsPri(), false, '前置條件：一步都還沒完成 ⇒ ④ 還不是強調色');
    EQ(P.backWarnHidden(), false,
      '🔴 從 DG 開過來時**按之前就先講明**：那一行看得見');
    const warn = P.backWarnText() || '';
    CHECK(warn.indexOf('切') >= 0 && warn.indexOf('分頁') >= 0,
      '🔴 那一行講的是「請自己切回 DG 分頁」（中性，不解釋技術原因）', warn);
    CHECK(warn.indexOf('opener') < 0 && warn.indexOf('focus') < 0
       && warn.indexOf('API') < 0 && warn.indexOf('瀏覽器') < 0,
      '🔴 那一行沒有技術名詞', warn);

    /* ═══ 🔴 v1.10.1：按下 ④ 的行為（Bruce 裁示：不關頁、不試圖切分頁）═════════
       🔴 這裡**不驗 `opener.focus()` 有沒有被呼叫** —— 那個呼叫已經整支拿掉，
          而且它本來在真瀏覽器就無效；jsdom 的 focus 是假的，驗了只會得到假綠。
          驗的是使用者真的看得到的三件事：提示出現、④ 轉強調態、④ 仍不打勾。 */
    EQ(P.backRowCur(), false, '前置條件：還沒按 ④ ⇒ 那一列還不是強調態');
    const before = opener.msgs.length;
    doc.getElementById('dst-back-bot').click();
    await sleep(30);
    EQ(P.saySteps(), '已送回 DG，請切回 DG 分頁繼續。',
      '🔴 按下 ④ ⇒ 畫面上出現「已送回 DG，請切回 DG 分頁繼續。」');
    EQ(P.backRowCur(), true, '🔴 按下 ④ ⇒ 那一列轉成強調態（既有的 .cur）');
    EQ(P.backRowTick(), '○', '🔴 按了之後 ④ **仍然不打勾**');
    EQ(P.backRowDone(), false, '🔴 按了之後 ④ 仍然沒有 done');
    EQ(P.stepRowOrder()[3], 'dst-step-back', '🔴 按了之後 ④ 仍然排在第四項');
    EQ(opener.msgs.length, before,
      '🔴 按 ④ **不送任何東西給 DG**（它只是講一句話，不是第二條回傳路徑）');
    CHECK(!doc.defaultView.closed, '🔴 按 ④ **不關頁**（關頁會丟掉 I2C 連線與 IC 識別）');

    /* 走產品那條路完成第一步 */
    doc.getElementById('dst-go-lut').click();
    await waitFor(() => P.stepDone().lut, 5000);
    await sleep(60);
    EQ(P.stepDone().lut, true, '① 已完成（走的是畫面上那顆鈕）');
    EQ(P.backBotIsPri(), true, '🔴 前三步任一完成 ⇒ ④ 轉成強調色');
    EQ(P.backRowTick(), '○', '🔴 ①完成了，④ 的圈圈**仍然**是空心的（永遠不打勾）');
    EQ(P.backRowDone(), false, '🔴 ④ 仍然沒有 done');

    /* 三語都要有字（不漏 key） */
    ['zh-TW', 'en', 'zh-CN'].forEach(L => {
      ['dst.backHint', 'dst.backSwitchTab', 'dst.stepBack'].forEach(k => {
        const v = P.i18nValues(k);
        CHECK(!!(v && v[L] && v[L].length > 2), '🔴 ' + k + ' 有 ' + L + ' 的翻譯');
      });
    });
    /* 🔴 `focus()` 已經從產品端整支拿掉 —— 用原始碼釘住，免得下一個人「順手加回去」。
       🔴 比對前先去掉註解（做法照 tools/check_ui_jargon.js）：這一版的註解正是在
          記錄「為什麼拿掉」，把它算進去等於禁止留下決策紀錄。 */
    const code = SELF_SRC.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
                         .replace(/(^|[^:])\/\/.*$/gm, '$1');
    CHECK(code.indexOf('opener.focus()') < 0,
      '🔴 產品端（去註解後）已經沒有 window.opener.focus()（那個呼叫在真瀏覽器無效）');
    CHECK(code.indexOf('window.close()') < 0,
      '🔴 也沒有改成 window.close()（關頁會丟掉 I2C 連線與 IC 識別，刻意不採用）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 🔴 v1.10.1：「量測」卡不再有自己的開始入口，量測一律走步驟卡那顆
     ═══════════════════════════════════════════════════════════════════════
     Bruce 2026-09-21：「就一起搬上去啊！可是上面不是原本就有『開始檢測』的按鈕嗎？
     就是對完位置以後，就可以直接變成『開始檢測』，不是就同一個就好了嗎？」
     ⇒ `#dst-run`（「開始掃描」）整顆移除。這一組驗兩件事：**真的沒了**，而且
       **步驟卡那顆仍然完整走得完兩段**（移除之後沒有留下沒人管的狀態）。 */
  H('⑥ 「量測」卡沒有開始鈕，量測只走步驟卡那顆兩段式鈕');
  {
    const { P, doc } = await loadSelf({ opener: null });
    CHECK(!doc.getElementById('dst-run'), '🔴 `#dst-run`（開始掃描）整顆不存在了');
    CHECK(SELF_SRC.indexOf('dst.btnRun') < 0,
      '🔴 連 `dst.btnRun` 這個 i18n key 的引用也一併清掉（不留死碼）');
    /* 「量測」卡裡**一顆按鈕都不該有**（它只剩結果與狀態） */
    const meas = doc.getElementById('dst-res-wrap').closest('.card');
    const btns = Array.prototype.map.call(meas.querySelectorAll('button, a'), e => e.id);
    EQ(btns, [], '🔴「量測」那張卡裡一個控制項都沒有了（只剩結果與狀態）', btns);
    /* 🔴 那一行「為什麼還不能開始」跟著搬過去，原處沒留第二份 */
    EQ(P.ctrlInGroup23('dst-run-why'), { n: 1, inGroup: true },
      '🔴「為什麼還不能開始」那一行搬進 ②③ 那一格，全頁只有一份');
    /* 結果與狀態仍在那張卡（與第 ④ 組互補：那邊驗「在」，這邊驗「只剩它們」） */
    ['dst-res-wrap', 'dst-v-hz', 'dst-prog'].forEach(id =>
      CHECK(meas.contains(doc.getElementById(id)), '「量測」卡仍有 ' + id));
  }
  {
    /* 🔴 接手檢查一：沒接量測儀時，第二段必須是**灰的**（不是按得下去卻不動）。
       這一條原本掛在「開始掃描」上，那顆鈕沒了就得有人接。 */
    const { P, doc } = await loadReady({ meter: false, qs: '?task=1&step=gray' });
    const gg = doc.getElementById('dst-go-gray');
    EQ([P.grayArmed(), gg.disabled], [false, false],
      '前置條件：第一段（對位畫面）不需要量測儀 ⇒ 可以按');
    await P.stepAlign();
    await sleep(20);
    EQ(P.grayArmed(), true, '按過對位 ⇒ 進到第二段');
    EQ(gg.disabled, true, '🔴 沒接量測儀 ⇒ 第二段「開始量測」是灰的');
    EQ(P.runWhyKey(), 'dst.whyNoMeter', '🔴 而且畫面上講得出原因：沒有量測儀');
    CHECK((P.runWhyText() || '').indexOf('量測儀') >= 0,
      '🔴 那一行原因真的印在 ②③ 那一格裡', P.runWhyText());
    /* 🔴 反面：① 讀回 RGB LUT **不可以**因為沒接量測儀而變灰（讀 LUT 用不到它） */
    EQ(P.stepRow('lut').disabled, false,
      '🔴 沒接量測儀**不會**連帶把 ①「讀回 RGB LUT」鎖住（那是假的閘門）');
  }
  {
    /* 🔴 接手檢查二：兩段式仍然完整走得完，而且量測中的狀態更新照舊。 */
    const isRunning = P => P.runWhyKey() === 'dst.whyRunning';
    const { P, doc } = await loadReady({ qs: '?mode=prim&task=21&step=prim' });
    const gg = doc.getElementById('dst-go-gray');
    EQ([P.grayArmed(), gg.textContent, gg.disabled], [false, '對位畫面', false],
      '第一段：字是「對位畫面」、可以按');
    gg.click();
    await waitFor(() => P.grayArmed(), 3000);
    await sleep(20);
    EQ([P.grayArmed(), doc.getElementById('dst-go-gray').textContent],
      [true, '開始量測'], '🔴 按一次 ⇒ 第二段，字變成「開始量測」');
    EQ(P.realignHidden(), false, '第二段才出現「重新對位」');
    doc.getElementById('dst-go-gray').click();
    await waitFor(() => isRunning(P), 5000);
    EQ(isRunning(P), true, '🔴 再按一次 ⇒ 真的開始量（沒有「開始掃描」也走得通）');
    EQ(doc.getElementById('dst-stop').disabled, false, '量測中「停止」可以按');
    doc.getElementById('dst-stop').click();
    await waitFor(() => !isRunning(P), 8000);
    EQ(isRunning(P), false, '🔴 停得下來 ⇒ 量測中的狀態更新有人接手');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ 🔴 突變測試：把上面六組各改回去一次，對應的斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ 🔴 突變測試');

  /* ── M1（①）：把 T-CON 組與量測儀組的 id 對調 ＝ 重現 Bruce 回報的分錯組 ── */
  {
    const mut = SELF_SRC
      .replace('id="dst-hwgrp-tcon"', 'id="dst-hwgrp-__X__"')
      .replace('id="dst-hwgrp-meter"', 'id="dst-hwgrp-tcon"')
      .replace('id="dst-hwgrp-__X__"', 'id="dst-hwgrp-meter"');
    CHECK(mut !== SELF_SRC, 'M1：找得到那兩個分組的 id');
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.ctrlInGroup('dst-v-dg', 'tcon').inGroup, false,
      '🔴 突變後「DG_EN 在 T-CON 組」變紅 ⇒ 證明 ① 那一條真的在驗東西');
    EQ(P.ctrlInGroup('dst-v-dg', 'meter').inGroup, true,
      '🔴 突變後 DG_EN 跑進量測儀那一組（＝ v1.10.0 的原狀）⇒ 反面那一條也會紅');
  }
  /* ── M1-b（①）：把下載入口搬回整張卡的最下面 ── */
  {
    const box = '<div id="dst-dl-box" class="dst-hidden"';
    CHECK(SELF_SRC.indexOf(box) > 0, 'M1-b：找得到下載入口那一塊');
    /* 把它的 id 拿掉、另外在 say-link 後面放一個同 id 的空殼 ＝「不在治具組裡」 */
    const mut = SELF_SRC
      .replace(box, '<div id="dst-dl-box-moved" class="dst-hidden"')
      .replace('<div class="dst-say" id="dst-say-link"></div>',
               '<div class="dst-say" id="dst-say-link"></div><div id="dst-dl-box"></div>');
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.ctrlInGroup('dst-dl-box', 'bridge').inGroup, false,
      '🔴 突變後「下載入口在治具組裡」變紅');
  }
  /* ── M2（②）：把 zh-CN 那一面改回舊講法 ── */
  {
    const orig = "I18N['dst.hwTcon']   = { 'zh-TW': 'T-CON', 'en': 'T-CON', 'zh-CN': 'T-CON' };";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M2：找得到 dst.hwTcon 那一行');
    const mut = SELF_SRC.replace(orig,
      "I18N['dst.hwTcon']   = { 'zh-TW': 'T-CON', 'en': 'T-CON', 'zh-CN': '板子上的 T-CON' };");
    const { P, w } = await loadSelf({ src: mut, opener: null });
    const hits = scanBadPhrase(P);
    EQ(hits, ['dst.hwTcon:zh-CN'],
      '🔴 只改繁中、簡中忘了改 ⇒ 全表掃描那一條會紅（這正是最容易漏的那一面）');
    CHECK(renderLang(w, 'zh-CN').indexOf('板子上') >= 0,
      '🔴 突變後簡中畫面上真的會出現那個說法 ⇒ 畫面那一條也在驗東西');
  }
  /* ── 🔴 M2-b（②）：把「另一個詞條」改回舊說法 ════════════════════════════
     這一條就是第一版**真的漏掉**的那一類：`dst.hwTcon` 改好了，但同樣說法還躺在
     `dst.txWhyNoIc`／`dst.icWhyNoIc`／`dst.stepsWhyIc` 裡。舊判準（只比對
     「板子上的 T-CON」這個字串）對這個突變是**綠的** —— 那正是它為什麼該被換掉。
     順便釘住英文那一面：只改中文、英文留 “on the board” 也必須紅。 */
  {
    const orig = "'zh-TW': '還沒認出是哪一顆 IC，所以不知道 LUT 是幾 bit。',";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M2-b：找得到 dst.icWhyNoIc 的繁中那一行');
    const mut = SELF_SRC
      .replace(orig, "'zh-TW': '還沒認出板子上的 IC，所以不知道 LUT 是幾 bit。',")
      .replace("'en': 'The IC has not been identified yet, so the LUT depth is unknown.'",
               "'en': 'The IC on the board has not been identified yet, so the LUT depth is unknown.'");
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(scanBadPhrase(P), ['dst.icWhyNoIc:zh-TW', 'dst.icWhyNoIc:en'],
      '🔴 突變後中文與英文兩面都被抓到 ⇒ 證明判準抓的是**說法**，不是某一個詞條');
  }
  /* ── M3（③）：把「停止」複製一份回「量測」卡 ── */
  {
    const anchor = '<div class="dst-tbl-wrap dst-hidden" id="dst-res-wrap"';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M3：找得到「量測」卡的結果表（插入點）');
    const mut = SELF_SRC.replace(anchor,
      '<button class="dst-btn danger" id="dst-stop" disabled data-i18n="dst.btnStop">■ 停止</button>'
      + anchor);
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.ctrlInGroup23('dst-stop'), { n: 2, inGroup: false },
      '🔴 突變後「全頁只有一個 dst-stop」變紅 ⇒ 證明「搬移不是複製」那一條在驗東西');
  }
  /* ── M3-b（③）：換階等待留在原處沒搬走 ── */
  {
    const orig = '<select id="dst-settle" class="dst-sel"></select>';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M3-b：找得到換階等待那個下拉');
    const mut = SELF_SRC.replace(orig, '<select id="dst-settle-moved" class="dst-sel"></select>')
      .replace('<div class="dst-kv"><span data-i18n="dst.kvHz">',
               orig + '<div class="dst-kv"><span data-i18n="dst.kvHz">');
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.ctrlInGroup23('dst-settle').inGroup, false,
      '🔴 突變後「換階等待在 ②③ 那一格」變紅');
    EQ(P.inMeasureCard('dst-settle'), true,
      '🔴 突變後它回到「量測」卡 ⇒「原處沒留第二份」那一條也會紅');
  }
  /* ── M4（④）：把結果表搬進上面那張步驟卡 ── */
  {
    const orig = '<div class="dst-tbl-wrap dst-hidden" id="dst-res-wrap"';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M4：找得到結果表那一塊');
    const mut = SELF_SRC.replace(orig, '<div class="dst-tbl-wrap dst-hidden" id="dst-res-wrap-moved"')
      .replace('<div class="dst-note" id="dst-steps-why"></div>',
               '<div class="dst-note" id="dst-steps-why"></div><div id="dst-res-wrap"></div>');
    const { P, doc } = await loadSelf({ src: mut, opener: null });
    CHECK(doc.getElementById('dst-steps-card').contains(doc.getElementById('dst-res-wrap')),
      '🔴 突變後結果表跑進步驟卡 ⇒ 第 ④ 組那一條會紅');
  }
  /* ── M5（⑤）：把 ④ 那一列排到最前面 ── */
  {
    const row = /<div class="dst-step" id="dst-step-back">[\s\S]*?<\/div>\s*<\/div>/;
    const m = SELF_SRC.match(/<div class="dst-step" id="dst-step-back">[\s\S]*?<\/a>\s*<\/div>/);
    CHECK(!!m, 'M5：找得到 ④ 那一列');
    const mut = SELF_SRC.replace(m[0], '')
      .replace('<div class="dst-step" id="dst-step-lut">', m[0] + '<div class="dst-step" id="dst-step-lut">');
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.stepRowOrder()[0], 'dst-step-back',
      '🔴 突變後 ④ 跑到第一項 ⇒「排在第四項」那一條會紅');
  }
  /* ── M5-a2（⑤）：按下 ④ 不顯示提示（回到「按了沒反應」那個狀態）── */
  {
    const orig = "  dstSay('dst-say-steps', dstT('dst.backSwitchTab'));";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M5-a2：找得到按下 ④ 之後那一句提示');
    const mut = SELF_SRC.replace(orig, '');
    const opener = fakeWin();
    const { P, doc } = await loadReady({ src: mut, opener, qs: '?task=1&step=lut' });
    doc.getElementById('dst-back-bot').click();
    await sleep(30);
    EQ(P.saySteps(), '',
      '🔴 突變後按 ④ 什麼都不說（＝ Bruce 回報的「按了沒反應」）⇒ 那一條會紅');
  }
  /* ── M5-b（⑤）：把按之前那一行永遠藏起來 ── */
  {
    const orig = "  if (bw) bw.classList.toggle('dst-hidden', !alive);";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M5-b：找得到那一行的顯示判斷');
    const mut = SELF_SRC.replace(orig, "  if (bw) bw.classList.add('dst-hidden');");
    const { P } = await loadSelf({ src: mut, opener: fakeWin() });
    EQ(P.backWarnHidden(), true,
      '🔴 突變後從 DG 開過來也看不到那一行 ⇒「如實標註」那一條會紅');
  }
  /* ── M6（⑥）：把「開始掃描」加回「量測」卡 ── */
  {
    const anchor = '<div class="dst-tbl-wrap dst-hidden" id="dst-res-wrap"';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'M6：找得到插入點');
    const mut = SELF_SRC.replace(anchor,
      '<button class="dst-btn pri" id="dst-run">開始掃描</button>' + anchor);
    const { doc } = await loadSelf({ src: mut, opener: null });
    CHECK(!!doc.getElementById('dst-run'),
      '🔴 突變後「量測」卡又有開始鈕 ⇒ 第 ⑥ 組那兩條會紅');
    const meas = doc.getElementById('dst-res-wrap').closest('.card');
    EQ(Array.prototype.map.call(meas.querySelectorAll('button, a'), e => e.id), ['dst-run'],
      '🔴 而且「量測」卡不再是零控制項');
  }
  /* ── 🔴 M6-b（⑥）：把「沒接量測儀擋第二段」那一條拿掉 ═══════════════════════
     這是「移除之後留下沒人管的狀態」那個破口的配對突變：拿掉之後，沒接量測儀時
     「開始量測」會變成一顆**按得下去、按了只跳一行錯誤**的鈕。 */
  {
    const orig = "    if (dstGrayArmed && dstRunWhyKey()) gg.disabled = true;";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M6-b：找得到第二段那道閘門');
    const mut = SELF_SRC.replace(orig, '');
    const { P, doc } = await loadReady({ src: mut, meter: false, qs: '?task=1&step=gray' });
    await P.stepAlign();
    await sleep(20);
    EQ(doc.getElementById('dst-go-gray').disabled, false,
      '🔴 突變後沒接量測儀也按得下去 ⇒ 第 ⑥ 組「第二段是灰的」那一條會紅');
  }
  /* ── 🔴 M6-c（⑥）：把量測儀那一條**加進 dstStepsWhyKey()**（錯誤的接手方式）──
     這樣做也會讓第二段變灰，但**同時會把 ①「讀回 RGB LUT」一起鎖住** ——
     讀 LUT 根本用不到量測儀。第 ⑥ 組那條反面斷言就是在擋這個。 */
  {
    const orig = "function dstStepsWhyKey() {\n  if (dstRunning) return 'dst.stepsWhyRun';";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M6-c：找得到 dstStepsWhyKey()');
    const mut = SELF_SRC.replace(orig,
      "function dstStepsWhyKey() {\n  if (!dstCaLinked) return 'dst.stepsWhyRun';\n  if (dstRunning) return 'dst.stepsWhyRun';");
    const { P } = await loadReady({ src: mut, meter: false, qs: '?task=1&step=gray' });
    EQ(P.stepRow('lut').disabled, true,
      '🔴 突變後 ① 也被鎖住了 ⇒ 第 ⑥ 組那條反面斷言會紅（接手要接對地方）');
  }
  /* ── M5-c（⑤）：讓 ④ 也會打勾 ── */
  {
    const orig = "  var bw = $('dst-back-warn');";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M5-c：找得到 ④ 那一段的起點');
    const mut = SELF_SRC.replace(orig,
      "  var _bt = $('dst-tick-back'); if (_bt) _bt.textContent = '✔';\n" + orig);
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.backRowTick(), '✔',
      '🔴 突變後 ④ 打勾了 ⇒「永遠不打勾」那一條會紅');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的：真瀏覽器的版面（分隔線、下拉會不會擠爆那一格）；');
  console.log('   🔴 **「回到 DG 頁」按下去有沒有真的回到 DG** —— 真瀏覽器擋 focus()，');
  console.log('      jsdom 的 focus 是假的，驗了就是假綠。行為那一半等 Bruce 裁示。');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
