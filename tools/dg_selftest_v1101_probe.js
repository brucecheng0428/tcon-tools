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
/* 🔴 搬進「量測」那一格的控制項。
   ═══ 🔴 v1.13.0：三個變一個（Bruce 2026-09-22 兩道裁示）═══════════════════════
     · `dst-settle`（換階等待）→ 搬進第一張卡「光學量測儀」那一組（E）
       ——「那個『換接等待』的選項，應該要移到『光學量測儀』上面那張卡片的那個
         group 裡面吧。」它是儀器設定，不是步驟。
     · `dst-xlsx`（匯出 XLSX）→ **整顆移除**（B1），匯出收斂到 DG 的「光學資料比較」。
     · `dst-stop`（停止）→ 留在原地，它是量測當下的動作。
   🔴 離開的那兩個各自補了**正面斷言**（見第 ⑤ 組），不是把名單縮短了事。 */
const MOVED_TO_GROUP23 = ['dst-stop'];
/* 🔴 v1.13.0（E）：搬到「光學量測儀」那一組（`#dst-hwgrp-meter`）的控制項。 */
const MOVED_TO_METER = ['dst-settle'];
/* 🔴 v1.13.0（B1）：全頁都不該再存在的控制項。 */
const REMOVED_CTRLS = ['dst-xlsx'];
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
    /* ═══ 🔴 v1.13.0（E）：換階等待搬進「光學量測儀」那一組 ═══════════════════════
       原本這裡驗的是「它排在 ② 那一列之前」。Bruce 2026-09-22 把它整個移出這一格
       ⇒ 期望值換成三件事：在新家、全頁只有一份、舊家沒有留第二份。 */
    const g = doc.getElementById('dst-group23');
    const sel = doc.getElementById('dst-settle'), gray = doc.getElementById('dst-step-gray');
    MOVED_TO_METER.forEach(id => {
      EQ(doc.querySelectorAll('#' + id).length, 1, '🔴（E）' + id + ' 全頁只有一個');
      CHECK(doc.getElementById('dst-hwgrp-meter').contains(doc.getElementById(id)),
        '🔴（E）' + id + ' 已搬進「光學量測儀」那一組');
      CHECK(!g.contains(doc.getElementById(id)),
        '🔴（E）' + id + ' 已不在 ②③ 那一格（舊家沒留第二份）');
      EQ(P.inMeasureCard(id), false, '🔴（E）' + id + ' 也不在下面那張「量測」卡');
    });
    REMOVED_CTRLS.forEach(id => {
      EQ(doc.getElementById(id), null, '🔴（B1）' + id + ' 已整顆移除，全頁找不到');
    });
    /* 停止就在主鈕旁邊（同一列） */
    CHECK(gray.contains(doc.getElementById('dst-stop')),
      '🔴「停止」與「開始量測」在同一列');
    /* 下拉是真的有選項（搬過去之後 JS 仍然把 DST_SETTLE_CHOICES 填進來） */
    CHECK(sel.options.length > 0, '🔴 換階等待的選項有被填進來（不是一個空下拉）',
      sel.options.length);
    /* 🔴 dgself v1.12.0 改判：Bruce 2026-09-21 指定「量測 Gamma 換接等待預設改成
       300ms 好了」。這一條原本是 v1.10.1 用來釘「搬家沒有順手改掉預設值」的，
       現在預設值**是這一版刻意要改的東西**，所以改成釘新值，並多釘一條
       「清單一格沒少」—— 他要調回 700 仍然選得到。 */
    CHECK(String(P.settleMs ? P.settleMs() : sel.value) === '300',
      '🔴 v1.12.0：預設改成 300 ms（Bruce 指定）', sel.value);
    EQ(P.settleChoices(), [300, 400, 500, 600, 700, 800, 900, 1000],
      '🔴 清單一格都沒少（他要調回 700 仍然選得到）');
  }
  {
    /* 🔴 搬過去之後**事件與狀態照舊**：量測中「停止」要能按、按下去真的會停。
       🔴「正在量測」這個事實用產品既有的觀測點 `runWhyKey()` 讀（它回
          `dst.whyRunning` 的唯一來源就是 `dstRunning`），不另開一個只給測試用的旗標。 */
    const isRunning = P => P.runWhyKey() === 'dst.whyRunning';
    const { P, doc } = await loadReady({ qs: '?mode=prim&task=21&step=prim' });
    /* 🔴 v1.13.0（B1）：匯出鈕已整顆移除 ⇒ 這一行只剩「停止」可驗。 */
    EQ(doc.getElementById('dst-stop').disabled, true, '前置條件：還沒量 ⇒ 停止是灰的');
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
    /* ═══ 🔴 dgself v1.12.0 改判：這一行的工作換了 ═══════════════════════════
       v1.10.1 時它是「按之前的警告」，沒有 opener 時貼上去會變成假警告 ⇒ 藏起來。
       v1.12.0 起 ④ 沒有鈕、改成自動回傳，而「沒有 opener ⇒ 永遠不會自動回傳」
       正是使用者最需要被告知的一件事（Bruce：失敗要「講清楚原因與退路」）
       ⇒ 這一行改成**一定看得見**，內容換成原因＋退路。 */
    EQ(P.backWarnHidden(), false,
      '🔴 v1.12.0：沒有 opener 時那一行要看得見（要講為什麼不會自動回傳）');
    CHECK((P.backWarnText() || '').indexOf('不是從 DG 開的') >= 0,
      '🔴 講出原因', P.backWarnText());
  }
  {
    const opener = fakeWin();
    const { P, doc } = await loadReady({ mem: buildSram(N, VALS), opener,
      qs: '?task=7&dest=' + encodeURIComponent('第 1 部分') + '&step=lut' });

    EQ(P.backBotIsPri(), null, '🔴 v1.12.0：④ 那一顆鈕已移除 ⇒ 沒有強調色可言');
    EQ(P.backSent(), false, '前置條件：還沒送出去任何東西 ⇒ ④ 不打勾');
    EQ(P.backWarnHidden(), false,
      '🔴 從 DG 開過來時**送出去之前就先講明**：那一行看得見');
    const warn = P.backWarnText() || '';
    CHECK(warn.indexOf('自動回傳') >= 0,
      '🔴 v1.12.0：先講「量完會自動回傳，不必按任何東西」', warn);
    CHECK(warn.indexOf('切') >= 0 && warn.indexOf('分頁') >= 0,
      '🔴 那一行仍然講「請自己切回 DG 分頁」（中性，不解釋技術原因）', warn);
    CHECK(warn.indexOf('opener') < 0 && warn.indexOf('focus') < 0
       && warn.indexOf('API') < 0 && warn.indexOf('瀏覽器') < 0,
      '🔴 那一行沒有技術名詞', warn);

    /* ═══ 🔴 v1.10.1：按下 ④ 的行為（Bruce 裁示：不關頁、不試圖切分頁）═════════
       🔴 這裡**不驗 `opener.focus()` 有沒有被呼叫** —— 那個呼叫已經整支拿掉，
          而且它本來在真瀏覽器就無效；jsdom 的 focus 是假的，驗了只會得到假綠。
          驗的是使用者真的看得到的三件事：提示出現、④ 轉強調態、④ 仍不打勾。 */
    /* ═══ 🔴 dgself v1.12.0 改判：沒有 ④ 那一顆鈕可以按了 ═══════════════════════
       Bruce 2026-09-21 需求變更：「不要做成按鈕式的…第三部分跑完以後，第四部分就
       自動打勾，也就是它自己會回傳 DG」。
       ⇒ 原本這一段驗的是「按下去會怎樣」。現在改驗**不按任何東西、走產品那條路
         真的回傳一次之後**會怎樣 —— 驗的事情一件沒少（提示出現、④ 的狀態正確、
         沒有第二條回傳路徑），只是觸發點從「他按」換成「它自己」。 */
    EQ(P.backRowCur(), false, '前置條件：還沒送出去 ⇒ 那一列還不是強調態');
    EQ(doc.getElementById('dst-back-bot'), null, '🔴 v1.12.0：④ 那一顆鈕不在 DOM 裡');
    const before = opener.msgs.length;

    /* 走產品那條路完成第一步（① 讀回 LUT 並回傳）*/
    doc.getElementById('dst-go-lut').click();
    await waitFor(() => P.stepDone().lut, 5000);
    await sleep(60);
    EQ(P.stepDone().lut, true, '① 已完成（走的是畫面上那顆鈕）');
    EQ(opener.msgs.length, before + 1, '🔴 而且真的送了一則出去（只有一則）');
    /* ═══ 🔴 v1.13.0（A）：期望值翻面 —— ① 送出去**不代表** ④ 完成 ═══════════════
       Bruce 2026-09-22 實機：「為什麼在第三步驟還在量的時候，第四步驟的資料自動
       回傳 DG 就已經打勾了？…這個等於是先偷跑囉。」根因就是 `dstDgSendLut()`
       （這一段走的正是它）也設了 `dstBackSent = true` ⇒ v1.12.0 這幾條驗的是那個
       bug 本身（綠著的假綠）。④ 現在只看 ②③ 那一組。
       🔴 「②③ 都送 ⇒ ④ 會打勾」那個正面在 v1120／v180 兩支夾具各釘一組，
          不是改成「永遠不打勾」的假安全。 */
    EQ(P.backSent(), false, '🔴（A）① 送出去了但 ②③ 還沒 ⇒ ④ **不打勾**');
    EQ(P.backRowTick(), '○', '🔴（A）④ 那一列維持 ○');
    EQ(P.backRowDone(), false, '🔴（A）④ 沒有 done');
    CHECK((P.backWarnText() || '').indexOf('自動回傳') >= 0,
      '🔴（A）提示仍然是「量完會自動回傳」，不能提前說已送回', P.backWarnText());
    EQ(P.stepRowOrder()[3], 'dst-step-back', '🔴 ④ 仍然排在第四項');
    CHECK(!doc.defaultView.closed, '🔴 **不關頁**（關頁會丟掉 I2C 連線與 IC 識別）');

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
  /* ── M3-b（③）：換階等待沒搬到「光學量測儀」那一組（🔴 v1.13.0 換了新家）── */
  {
    const orig = '<select id="dst-settle" class="dst-sel"></select>';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M3-b：找得到換階等待那個下拉');
    const mut = SELF_SRC.replace(orig, '<select id="dst-settle-moved" class="dst-sel"></select>')
      .replace('<div class="dst-kv"><span data-i18n="dst.kvHz">',
               orig + '<div class="dst-kv"><span data-i18n="dst.kvHz">');
    const { P, doc } = await loadSelf({ src: mut, opener: null });
    CHECK(!doc.getElementById('dst-hwgrp-meter').contains(doc.getElementById('dst-settle')),
      '🔴（E）突變後它不在「光學量測儀」那一組 ⇒ E 那一條會紅');
    EQ(P.inMeasureCard('dst-settle'), true,
      '🔴（E）突變後它掉回「量測」卡 ⇒「新家沒收到」那一條也會紅');
  }
  /* ── 🔴 v1.13.0 新增 MB1：把匯出鈕接回 ②③ 那一格 ⇒ B1 那一條必須紅 ── */
  {
    const anchor = '<div class="dst-note" id="dst-group23-note">';
    CHECK(SELF_SRC.indexOf(anchor) > 0, 'MB1：找得到 ②③ 那一格的指路行（插入點）');
    const mut = SELF_SRC.replace(anchor,
      '<button class="dst-btn" id="dst-xlsx" disabled>匯出 XLSX</button>' + anchor);
    const { doc } = await loadSelf({ src: mut, opener: null });
    CHECK(!!doc.getElementById('dst-xlsx'),
      '🔴（B1）突變後匯出鈕又回到頁面上 ⇒ B1 那一條會紅');
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
    /* 🔴 v1.12.0：④ 那一列裡已經沒有 <a>（鈕移除了），所以錨點收在 </span> 上。
       突變目標不變：把 ④ 那一列搬到第一項 ⇒「排在第四項」那一條必須紅。 */
    const m = SELF_SRC.match(/<div class="dst-step" id="dst-step-back">[\s\S]*?<\/span>\s*<\/div>/);
    CHECK(!!m, 'M5：找得到 ④ 那一列');
    const mut = SELF_SRC.replace(m[0], '')
      .replace('<div class="dst-step" id="dst-step-lut">', m[0] + '<div class="dst-step" id="dst-step-lut">');
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.stepRowOrder()[0], 'dst-step-back',
      '🔴 突變後 ④ 跑到第一項 ⇒「排在第四項」那一條會紅');
  }
  /* ── M5-a2（⑤）🔴 v1.12.0 換了突變目標 ────────────────────────────────────
     原本突變的是「按下 ④ 之後那一句提示」，而 v1.12.0 起沒有鈕可以按，提示改由
     `dstRenderSteps()` 依「有沒有真的送出去」決定。
     ⇒ 突變成**永遠顯示「還沒送出去」那一句**（＝回傳成功了畫面卻不說）
       ⇒ 「提示自動換成已送回 DG」那幾條必須紅。 */
  {
    /* 🔴 v1.13.0：錨點與前置條件都跟著 A 改了 ——
       · 錨點：產品端那一行現在讀的是本地變數 `sent`（＝ `dstBackSent()` 算一次的結果）
       · 前置：「送出去了」的定義變成 **②③ 都送出去**，所以這裡改成一次送齊
         白灰階 ＋ 三個純色端點（走產品端 primSent 那條路），不再只按 ①。 */
    const orig = "      : (sent ? dstT('dst.backSwitchTab') : dstT('dst.backHint'));";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M5-a2：找得到那一行三選一的提示');
    const mut = SELF_SRC.replace(orig, "      : dstT('dst.backHint');");
    const opener = fakeWin();
    const { P } = await loadReady({ src: mut, opener, qs: '?task=1&step=gray' });
    P.__setRowsForTest([
      { key: 'L0', group: 'gray', idx: 0, r12: 0, x: 0.25, y: 0.25, lv: 0 },
      { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.31, y: 0.33, lv: 300 },
      { key: 'R', group: 'prim', idx: 255, r12: 4080, x: 0.64, y: 0.33, lv: 60 },
      { key: 'G', group: 'prim', idx: 255, r12: 4080, x: 0.30, y: 0.60, lv: 200 },
      { key: 'B', group: 'prim', idx: 255, r12: 4080, x: 0.15, y: 0.06, lv: 25 }
    ]);
    CHECK(P.dgSend() === true, '突變前置：②③ 確實都送出去了');
    await sleep(20);
    EQ(P.backSent(), true, '突變前置：④ 已完成');
    EQ(P.backWarnIsSwitchTab(), false,
      '🔴 突變後送出去了畫面卻還在講「量完會自動回傳」（＝沒告訴他該切分頁了）⇒ 那一條會紅');
  }
  /* ── M5-b（⑤）：把按之前那一行永遠藏起來 ── */
  {
    /* 🔴 v1.12.0：錨點跟著產品改了（那一行現在一定看得見，內容三選一）。
       突變目標不變：把那一行藏起來 ⇒「如實標註」那幾條必須紅。 */
    const orig = "    bw.classList.remove('dst-hidden');";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M5-b：找得到那一行的顯示判斷');
    const mut = SELF_SRC.replace(orig, "    bw.classList.add('dst-hidden');");
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
  /* ── M5-c（⑤）🔴 v1.12.0 反轉：④ 現在**會**打勾，要釘的是「打勾＝真的送到了」──
     Bruce 2026-09-21：「自動回傳失敗時不准自動打勾…打勾必須等於真的送到了，
     不能是『我送了，不知道有沒有到』。」
     ⇒ 突變成「不管送沒送出去都打勾」⇒「沒有 opener ⇒ ④ 維持 ○」那幾條必須紅。 */
  {
    /* 🔴 v1.13.0：錨點跟著 A 改了（`dstBackSent` 從變數變成推導函式，
       這一行現在讀的是本地變數 `sent`）。突變目標與要釘的事情一件都沒變。 */
    const orig = "  if (bt) bt.textContent = sent ? '✔' : '○';";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M5-c：找得到 ④ 那一列的打勾判定');
    const mut = SELF_SRC.replace(orig, "  if (bt) bt.textContent = '✔';");
    const { P } = await loadSelf({ src: mut, opener: null });
    EQ(P.backSent(), false, '突變前置：沒有 opener ⇒ 什麼都沒送出去');
    EQ(P.backRowTick(), '✔',
      '🔴 突變後「什麼都沒送出去」也打勾了 ⇒「打勾＝真的送到了」那一條會紅');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的：真瀏覽器的版面（分隔線、下拉會不會擠爆那一格）；');
  console.log('   🔴 **「回到 DG 頁」按下去有沒有真的回到 DG** —— 真瀏覽器擋 focus()，');
  console.log('      jsdom 的 focus 是假的，驗了就是假綠。行為那一半等 Bruce 裁示。');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
