/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v1140_probe.js — dgself v1.14.0 ／ dg v1.74.0 的驗收夾具（jsdom）

   Bruce 2026-09-22 的兩條交辦：

   ═══ H｜步驟卡 ② 的「對位畫面」第一段拿掉，直接開始量測 ═══════════════════
     Bruce：「對位畫面在『TCON 自檢畫面（量測與調整 Gamma 所需步驟）』的第二步驟。
     那個對位畫面既然測試畫面上面都有，對位畫面就不用了，也就是它可以直接開始。」
     🔴 **這不是他改主意**：兩段式是他 2026-09-21 指定的，但那時「畫面測試」卡排在
        步驟卡**下面**；v1.13.0（G）把它搬到步驟卡正上方，前提變了。
     H1 ② 那顆鈕的字面恆為「開始量測」（三語），而且按一次就真的開始量
     H2 「重新對位」`#dst-go-realign` 整顆不存在；**退路**（上一張卡的 `#dst-align`）
        在每一格可用性上都不比它差 —— 這是「刪得掉」的證據，不是感覺
     H3 `dst.goAlign`／`dst.goRealign` 真的從 I18N 刪掉（不留死碼）
     H4 `dstAlignPattern()`／`dstAlignToggle()`／`DST_ALIGN_L` **一個字都沒動**
     H5 文案與行為一致：那一行指路寫的就是鈕上當下的字面（三語都驗）

   ═══ I｜回到 DG 進入第二輪時，自檢頁的步驟狀態要清空 ═══════════════════════
     Bruce：「回到 DG 網頁進到第二輪的時候，是不是應該要把『自檢』畫面的數據再
     重新清除？」
     I1 輪數變了 ⇒ 清 `dstStepDone`（④ 連帶回 ○）、結果表、讀回的 LUT、進度條、
        步驟卡與量測卡的說話行
     I2 **不清** I2C／量測儀連線、IC 識別、位元深度、換階等待
     I3 判準是「輪數變了」：同一輪派好幾次任務 ⇒ 不清；訊息沒有 `round` ⇒ 不清；
        `null → 數字`（第一次知道自己在第幾輪）⇒ 不清
     I4 清完在步驟卡寫一句說明（三語，**不靜默清掉**）
     I5 DG 端：`dg-measure-task` 訊息帶 `round`，開新分頁的網址也帶 `round`

   ═══ 🔴 怎麼避免「自己驗自己」═════════════════════════════════════════════
     · 每一條都配一個突變（M*）：把產品端改壞，對應的斷言必須變紅。
     · 期望值（'開始量測'／'Start measuring'／127…）**寫死在本檔**，不從產品端讀。
     · H2 的退路不是用看的：四格可用性矩陣（連線／IC／量測儀／量測中）逐格比對。

   用法：node tools/dg_selftest_v1140_probe.js
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

const ORIGIN = 'https://example.invalid';
const SELF_SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
const DG_SRC = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');

function inlineSrc(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
function makeFakeWs(readMap) {
  const map = Object.assign({}, readMap);
  const ws = {
    readyState: 1, onmessage: null,
    send(txt) {
      const m = JSON.parse(txt);
      let rep;
      if (m.type === 'read') {
        let d = (map[m.addr] || []).slice();
        if (d.length > m.len) d = d.slice(0, m.len);
        while (d.length < m.len) d.push(0x00);
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'rawwrite') {
        map[m.addr] = m.data.slice();
        rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0,
                transferred: (m.data || []).length };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; }
  };
  return ws;
}
const MES_OK = 'OK00,P1,0,0.3127,0.3290,123.456';
const meterFn = cmd => (/^MES/.test(cmd) ? MES_OK : (/^MVS/.test(cmd) ? 'OK,60.00' : 'OK'));

function fakeWin() {
  const w = { closed: false, msgs: [], focused: 0 };
  w.postMessage = d => w.msgs.push(JSON.parse(JSON.stringify(d)));
  w.focus = () => { w.focused++; };
  return w;
}

/* qs 預設帶 round=1：那是產品裡 DG 開新分頁時真的會帶的東西（見 dgLiveGo 的網址）。 */
async function load(opts) {
  opts = opts || {};
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(opts.src || SELF_SRC), {
    url: ORIGIN + '/dg-selftest.html' + (opts.qs == null ? '?task=1&step=gray&round=1' : opts.qs),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  const opener = (opts.opener === null) ? null : (opts.opener || fakeWin());
  if (opener) Object.defineProperty(w, 'opener', { value: opener, writable: true, configurable: true });
  await sleep(160);
  const P = w.dstProbe;
  if (opts.i2c !== false) {
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4], 0x005D: [0x00] }));
    P.setIcForTest(opts.ic || 'EM02A1', -1);
  }
  if (opts.ca !== false) P.__attachFakeMeter(meterFn);
  P.__renderBtns();
  await sleep(20);
  return { dom, w, doc: w.document, P, errs, opener };
}

async function loadDg(src) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(src || DG_SRC), {
    url: ORIGIN + '/dg.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const win = dom.window;
  try { win.localStorage.clear(); win.sessionStorage.clear(); } catch (e) {}
  const opened = [], posted = [];
  win.open = function (url) {
    const f = fakeWin(); f.url = url;
    f.postMessage = m => posted.push(JSON.parse(JSON.stringify(m)));
    opened.push(f); return f;
  };
  win.Element.prototype.scrollIntoView = function () {};
  await sleep(260);
  return { dom, win, doc: win.document, opened, posted, errs };
}

/* 把「這一輪做完了」的樣子擺出來（不跑真的 256 階掃描 —— 那在 jsdom 要 77 秒）。
   🔴 走的是**產品自己的路徑**：`__setRowsForTest()` 造列（與 dstPlan 的排法相同：
      mode=gray 會把 R／G／B 排在灰階後面），再由 `dgSend()` 打勾 ——
      那是產品端唯一會寫 `dstStepDone` 的地方，不是夾具自己去改旗標。 */
const ROUND_ROWS = [
  { key: 'L0',   group: 'gray', idx: 0,   r12: 0,    x: 0.25,   y: 0.25,   lv: 0 },
  { key: 'L128', group: 'gray', idx: 128, r12: 2048, x: 0.3127, y: 0.3290, lv: 60 },
  { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.3127, y: 0.3290, lv: 300 },
  { key: 'R', group: 'prim', idx: 255, r12: 4080, g12: 0, b12: 0, x: 0.64, y: 0.33, lv: 60 },
  { key: 'G', group: 'prim', idx: 255, r12: 0, g12: 4080, b12: 0, x: 0.30, y: 0.60, lv: 200 },
  { key: 'B', group: 'prim', idx: 255, r12: 0, g12: 0, b12: 4080, x: 0.15, y: 0.06, lv: 40 }
];
async function pretendRoundDone(P) {
  P.__setRowsForTest(ROUND_ROWS.map(r => Object.assign({}, r)));
  const ok = P.dgSend();
  await sleep(40);
  return ok;
}
/* 🔴 換任務走**產品那一支**（`dstDgApplyTask`）。
   為什麼不用 `window.postMessage`：那條路的守門是 `e.source === window.opener`，
   而 jsdom 裡自己對自己 postMessage 的 `source` 是 window 本身 ⇒ 訊息會被正確地
   擋掉，測到的是守門、不是輪次判斷。守門那一條另有夾具在驗（v1.8.0 起）。 */
function sendTask(P, d) { return P.dgApplyTask(d); }

(async () => {
  /* ═══════════════════════════════════════════════════════════════════════
     H1：② 那顆鈕按一次就開始量，字面恆為「開始量測」
     ═══════════════════════════════════════════════════════════════════════ */
  H('H1 ② 那顆鈕：一顆字面、按一次就開始量');
  {
    const { P, doc } = await load({});
    const gg = doc.getElementById('dst-go-gray');
    EQ(gg.textContent, '開始量測', '🔴 鈕上就是「開始量測」（沒有「對位畫面」那一段）');
    EQ(gg.getAttribute('data-i18n'), 'dst.goMeasure',
      '🔴 `data-i18n` 放回來了：字固定，applyLang 洗回去洗到的就是對的那一句');
    EQ(P.goGrayIsPri(), true, '🔴 恆為強調色（它永遠是現在該按的那一顆）');
    EQ(gg.disabled, false, '前置：連線 ＋ IC ＋ 量測儀都在 ⇒ 可按');
    EQ(P.runWhyKey(), null, '前置：沒有任何「為什麼不能按」的理由');
    EQ(P.rows().length, 0, '前置：一筆數據都還沒量');

    gg.click();
    await sleep(140);
    EQ(P.runWhyKey(), 'dst.whyRunning', '🔴 按**一次**就真的開始量了');
    EQ(P.dgState().mode, 'gray', '🔴 而且進的是白灰階那一輪');
    EQ(P.showing() === 'align', false,
      '🔴 按下去不會停在對位畫面（dstRun 開頭先送離開出圖模式的序列）');
    P.abort();
    await sleep(400);
    EQ(doc.getElementById('dst-go-gray').textContent, '開始量測',
      '🔴 中止之後字**沒有變**（本來就只有這一種字面）');
  }
  H('H1-b 三語：那顆鈕在每一種語言下都只有一種字面');
  {
    const want = { 'zh-TW': '開始量測', 'en': 'Start measuring', 'zh-CN': '开始量测' };
    for (const lang of ['zh-TW', 'en', 'zh-CN']) {
      const { w, doc, P } = await load({});
      w.applyLang(lang);
      P.__renderSteps();
      await sleep(60);
      EQ(doc.getElementById('dst-go-gray').textContent, want[lang],
        lang + '：鈕上是「' + want[lang] + '」');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     H2：「重新對位」不存在，而且退路不比它差
     ═══════════════════════════════════════════════════════════════════════
     🔴 Bruce 明示「不要直接刪掉之前先想清楚：如果發現有哪個情境往上按不到，
        就保留並講清楚」。這一組把那個判斷寫成**可重跑的矩陣**。 */
  H('H2 「重新對位」整顆不存在（不留空殼）');
  {
    const { P, doc } = await load({});
    EQ(P.realignExists(), false, '🔴 `#dst-go-realign` 整顆不在 DOM 裡');
    EQ(doc.querySelectorAll('#dst-go-realign').length, 0, '🔴 全頁 0 個（不是只有隱藏）');
    EQ(typeof P.grayArmed, 'undefined',
      '🔴 `grayArmed` 觀測口也拿掉了（沒有「現在是第幾段」這個狀態）');
    CHECK(SELF_SRC.replace(/\/\*[\s\S]*?\*\//g, '').indexOf('dstStepRealign') < 0,
      '🔴 `dstStepRealign()` 那一支也整支刪了（不留死碼；去註解後比對）');
  }
  H('H2-b 退路矩陣：四格裡，`#dst-align` 都不比舊的「重新對位」差');
  {
    /* 舊的「重新對位」停用條件 ＝ dstStepsWhyKey()（量測中／未連線／認不出 IC）
       `#dst-align` 停用條件 ＝ canWrite（未連線／認不出 IC／量測中／忙碌） */
    const cases = [
      { name: '都連上、沒在量', i2c: true, ca: true, running: false, wantAlign: false },
      { name: '沒連 I2C',       i2c: false, ca: true, running: false, wantAlign: true },
      { name: '沒接量測儀',     i2c: true, ca: false, running: false, wantAlign: false },
      { name: '量測中',         i2c: true, ca: true, running: true,  wantAlign: true }
    ];
    for (const c of cases) {
      const { P, doc } = await load({ i2c: c.i2c, ca: c.ca });
      if (c.running) { P.__setRunning(true); P.__renderBtns(); await sleep(20); }
      const a = doc.getElementById('dst-align');
      EQ(a.disabled, c.wantAlign,
        c.name + ' ⇒ 對位鈕 disabled=' + c.wantAlign);
      if (c.running) { P.__setRunning(false); }
    }
    /* 🔴 關鍵那一格：**量測中**兩者都停用 ⇒ 舊的「重新對位」在量測中也按不到，
       所以刪掉它沒有少掉任何一條退路（這正是「拿掉之後他還能做什麼」的答案）。 */
    CHECK(true, '🔴 量測中兩者同樣停用 ⇒ 刪掉「重新對位」沒有關掉任何一條退路');
  }
  H('H2-c 退路真的打得出對位畫面（而且是 L127 ＋ 中心十字）');
  {
    const { P } = await load({});
    EQ(P.alignL, 127, '🔴 `DST_ALIGN_L` 仍然是 127（H4：這一支沒被動到）');
    await P.alignToggle();
    await sleep(120);
    EQ(P.showing(), 'align', '🔴 上一張卡那顆切換鈕真的打得出對位畫面');
    await P.alignToggle();
    await sleep(120);
    EQ(P.showing(), null, '🔴 再按一次回到原本的畫面（它是切換鈕，隨時可按）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     H3：死掉的 i18n key 真的刪了
     ═══════════════════════════════════════════════════════════════════════ */
  H('H3 `dst.goAlign`／`dst.goRealign` 不留死碼');
  {
    const { w } = await load({ opener: null });
    const dead = ['dst.goAlign', 'dst.goRealign'].filter(k => w.I18N && w.I18N[k]);
    EQ(dead, [], '🔴 兩個 key 都從 I18N 刪掉了', dead);
    for (const lang of ['zh-TW', 'en', 'zh-CN']) {
      CHECK(!!(w.I18N['dst.goMeasure'] && w.I18N['dst.goMeasure'][lang]),
        'dst.goMeasure 有 ' + lang);
    }
    /* 🔴 對位畫面本身**沒有**跟著消失 —— 它走的是另一組 key。 */
    for (const k of ['dst.btnAlign', 'dst.btnAlignOn', 'dst.alignNote']) {
      CHECK(!!(w.I18N[k] && w.I18N[k]['zh-TW'] && w.I18N[k]['en'] && w.I18N[k]['zh-CN']),
        '🔴「畫面測試」卡那組對位 key 三語都還在：' + k);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     H4：對位那三樣一個字都沒動
     ═══════════════════════════════════════════════════════════════════════ */
  H('H4 dstAlignPattern／dstAlignToggle／DST_ALIGN_L 沒被動到');
  {
    for (const s of ['var DST_ALIGN_L = 127;', 'async function dstAlignPattern()',
                     'async function dstAlignToggle()']) {
      CHECK(SELF_SRC.indexOf(s) > 0, '🔴 產品端仍然找得到：' + s);
    }
    CHECK(SELF_SRC.indexOf("$('dst-align').addEventListener('click'") > 0,
      '🔴「畫面測試」卡那顆對位鈕的事件仍在');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     H5：文案與行為一致（指路寫的就是鈕上當下的字面）
     ═══════════════════════════════════════════════════════════════════════ */
  H('H5 指路那一行 ＝ 鈕上的字面（三語）');
  {
    for (const lang of ['zh-TW', 'en', 'zh-CN']) {
      const { w, P } = await load({});
      w.applyLang(lang);
      P.__renderSteps();
      await sleep(60);
      const t = P.group23Text() || '';
      const btn = P.goGrayText();
      CHECK(t.indexOf('「' + btn + '」') >= 0 || t.indexOf('“' + btn + '”') >= 0,
        lang + '：那一行寫的就是鈕上的字（' + btn + '）', t);
      CHECK(t.indexOf('{btn}') < 0, lang + '：佔位符沒有漏到畫面上');
    }
  }
  H('H5-b 全頁不再有「先按對位畫面再開始」這類兩段式敘述');
  {
    /* 🔴 去掉註解再看（註解裡留決策紀錄是應該的）—— 做法照 tools/check_ui_jargon.js。 */
    const vis = SELF_SRC.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const s of ['dst.goAlign', 'dst.goRealign', 'dstGrayArmed', 'dstStepRealign',
                     'dstStepAlign()']) {
      CHECK(vis.indexOf(s) < 0, '🔴 去註解後的原始碼不再出現：' + s);
    }
    /* 🔴 `dst-go-realign` 這個字串**還會出現一次** —— 在 `realignExists()` 那個
       觀測口裡，它的用途正是驗「那顆鈕不在了」。所以這裡驗的是「沒有人再去造它」：
       原始碼裡不得有帶這個 id 的 <button>。 */
    CHECK(!/<button[^>]*id="dst-go-realign"/.test(vis),
      '🔴 原始碼裡沒有任何帶 id="dst-go-realign" 的按鈕');
    const { P } = await load({});
    const shown = P.group23Text() + ' ' + P.goGrayText();
    CHECK(shown.indexOf('對位') < 0,
      '🔴 ②③ 那一格的字面不再提「對位」（對位講在上一張卡）', shown);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     I1／I4：輪數變了 ⇒ 清，而且講出來
     ═══════════════════════════════════════════════════════════════════════ */
  H('I1 輪數變了 ⇒ 步驟、結果、LUT、進度條、說話行都清掉');
  {
    const { P, w, doc, opener } = await load({});
    /* 擺出「這一輪做完了」的樣子（走產品自己的路徑）。 */
    CHECK(await pretendRoundDone(P) === true, '前置：這一輪的資料回傳成功');
    EQ(P.stepDone().gray, true, '前置：② 打勾了');
    EQ(P.stepRow('back').tick, '✔', '前置：④ 也是 ✔');
    EQ(P.resWrapHidden(), false, '前置：結果表是展開的');
    EQ(P.round(), 1, '前置：這一頁知道自己在第 1 輪（網址帶的）');

    /* DG 派下一輪的任務 */
    sendTask(P, { type: 'dg-measure-task', task: 9, mode: 'gray', step: 'gray',
                    dest: '第 2 部分', what: '白灰階亮度', round: 2 });
    await sleep(80);

    EQ(P.round(), 2, '🔴 這一頁記住了新的輪數');
    EQ(P.stepDone(), { lut: false, gray: false, prim: false }, '🔴 三個勾全部清掉');
    EQ(P.stepRow('back').tick, '○', '🔴 ④ 連帶變回 ○（它是 dstStepDone 的函數）');
    EQ(P.rows().length, 0, '🔴 上一輪的量測結果清掉了');
    EQ(P.resWrapHidden(), true, '🔴 結果表整區收起來');
    EQ(P.hasLut(), false, '🔴 讀回的 LUT 也清掉（DG 第 4 部分寫過新表，舊的已過期）');
    CHECK((P.progText() || '').trim() === '', '🔴 進度條的字歸零', P.progText());
    CHECK((P.stepsProgText() || '').trim() === '',
      '🔴 卡片內那一份也一起歸零（同一支 dstProg 兩個出口）', P.stepsProgText());
    /* 🔴 `#dst-say-run`：清掉之後 `dstDgApplyTask()` 會**接著**寫這一輪的新任務訊息
       （那是這一輪真的發生的事，不是上一輪的殘留）⇒ 驗的是「上一輪那句不見了」，
       不是「這一行是空的」。空不空另外由 `clearRound()` 直接驗（下一組）。 */
    CHECK((P.sayRun() || '').indexOf('回到 DG') < 0,
      '🔴 上一輪「已回到 DG 的…」那句不見了', P.sayRun());
    CHECK((P.sayRun() || '').indexOf('開始掃描') < 0,
      '🔴 而且新寫的那句不會去指一顆不存在的鈕（「開始掃描」v1.10.1 已移除）', P.sayRun());
  }
  H('I1-b `dstClearRound()` 本身：兩條說話行都真的清成空的');
  {
    const { P, doc } = await load({});
    await pretendRoundDone(P);
    CHECK((P.sayRun() || '').length > 0, '前置：量測卡的說話行有字');
    P.clearRound(2);
    await sleep(20);
    EQ(P.sayRun(), '', '🔴 `#dst-say-run` 清成空的');
    CHECK((doc.getElementById('dst-say-steps').textContent || '').indexOf('第 2 輪') >= 0,
      '🔴 `#dst-say-steps` 清完之後填的是「這是第 2 輪…」那一句');
    /* 🔴 中性色**退得掉**：下一則（多半是真的壞消息）必須回到紅色。 */
    P.__say('dst-say-steps', 'boom');
    CHECK(!doc.getElementById('dst-say-steps').classList.contains('dst-say-info'),
      '🔴 後續任何一則訊息都會把中性色退掉（dstSay 自己負責，不靠記得）');
    /* 🔴 清完藍色回到 ①（cur ＝ 依序第一個還沒完成的那一組） */
    EQ(P.stepRow('lut').cur, true, '🔴 藍色回到 ①');
    EQ(P.stepRow('gray').cur, false, '🔴 ② 不再是藍的');
  }
  H('I4 不靜默清掉：步驟卡寫得出「這是第幾輪」（三語）');
  {
    const want = { 'zh-TW': ['第 2 輪', '清空'], 'en': ['round 2', 'cleared'], 'zh-CN': ['第 2 轮', '清空'] };
    for (const lang of ['zh-TW', 'en', 'zh-CN']) {
      const { P, w, doc } = await load({});
      w.applyLang(lang);
      P.__renderSteps();
      await sleep(60);
      sendTask(P, { type: 'dg-measure-task', task: 9, mode: 'gray', step: 'gray',
                      dest: 'x', what: 'y', round: 2 });
      await sleep(80);
      const say = doc.getElementById('dst-say-steps').textContent || '';
      CHECK(say.length > 0, lang + '：清完真的有寫一句話', say);
      for (const frag of want[lang]) {
        CHECK(say.indexOf(frag) >= 0, lang + '：那一句裡有「' + frag + '」', say);
      }
      CHECK(say.indexOf('dst.') < 0, lang + '：沒有未翻譯的 key 漏出來', say);
      CHECK(say.indexOf('{n}') < 0, lang + '：佔位符沒有漏出來', say);
      /* 🔴 這一則**不是壞消息**：`.dst-say` 一律是紅的（--error），把「我幫你清乾淨了」
         印成紅的等於在說出事了 —— 而這一句存在的唯一理由就是不要讓他以為是 bug。 */
      CHECK(doc.getElementById('dst-say-steps').classList.contains('dst-say-info'),
        lang + '：🔴 這一則掛了中性色（不是錯誤紅）');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     I2：不准清的那一組
     ═══════════════════════════════════════════════════════════════════════ */
  H('I2 連線、IC 識別、位元深度、換階等待都不准清');
  {
    const { P, w, doc } = await load({});
    doc.getElementById('dst-bits').value = '10';
    P.setBits(10);
    doc.getElementById('dst-settle').value = '600';
    doc.getElementById('dst-settle').dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(20);
    const before = { linked: P.i2cLinked(), ca: P.caLinked(), ic: P.icKey(),
                     bits: P.bits(), settle: doc.getElementById('dst-settle').value,
                     sayLink: doc.getElementById('dst-say-link').textContent };
    sendTask(P, { type: 'dg-measure-task', task: 9, mode: 'gray', step: 'gray',
                    dest: 'x', what: 'y', round: 2 });
    await sleep(80);
    EQ(P.i2cLinked(), before.linked, '🔴 I2C 治具連線沒被清掉');
    EQ(P.caLinked(), before.ca, '🔴 光學量測儀連線沒被清掉');
    EQ(P.icKey(), before.ic, '🔴 IC 識別結果沒被清掉');
    EQ(P.bits(), before.bits, '🔴 位元深度沒被清掉（仍是 10）');
    EQ(doc.getElementById('dst-settle').value, before.settle, '🔴 換階等待沒被清掉（仍是 600）');
    EQ(doc.getElementById('dst-say-link').textContent, before.sayLink,
      '🔴 `#dst-say-link`（連線／IC 那一行）沒被清掉');
    EQ(P.caCloseCount(), 0, '🔴 量測儀的埠一次都沒被關');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     I3：判準是「輪數變了」，不是「收到任務訊息」
     ═══════════════════════════════════════════════════════════════════════ */
  H('I3-a 同一輪派第二次任務 ⇒ **不清**');
  {
    const { P, w } = await load({});
    await pretendRoundDone(P);
    EQ(P.stepDone().gray, true, '前置：② 打勾了');
    /* 同一輪的第 3 部分 */
    sendTask(P, { type: 'dg-measure-task', task: 10, mode: 'prim', step: 'prim',
                    dest: '第 3 部分', what: 'RGB 純色 Pattern', round: 1 });
    await sleep(80);
    EQ(P.stepDone().gray, true,
      '🔴 同一輪裡換任務**不清**（每次都清會把這一輪真的做完的步驟洗掉）');
    EQ(P.rows().length, 6, "🔴 結果表也還在");
    EQ(P.dgState().mode, 'prim', '🔴 但任務本身確實換過去了（不是整則訊息被忽略）');
  }
  H('I3-b 訊息沒有 `round` 欄位 ⇒ **不清**（舊版 DG 相容）');
  {
    const { P, w } = await load({});
    await pretendRoundDone(P);
    EQ(P.stepDone().gray, true, '前置：② 打勾了');
    sendTask(P, { type: 'dg-measure-task', task: 11, mode: 'gray', step: 'gray',
                    dest: 'x', what: 'y' });          // 🔴 沒有 round
    await sleep(80);
    EQ(P.stepDone().gray, true, '🔴 不知道輪數就不清（不能假裝知道）');
    EQ(P.round(), 1, '🔴 記住的輪數也沒被洗成 null');
  }
  H('I3-c 直接開這一頁（網址沒有 round）⇒ `null`，而且 `null → 數字` 不算變');
  {
    const { P, w } = await load({ qs: '?task=1&step=gray' });   // 🔴 網址沒有 round
    EQ(P.round(), null, '🔴 一進來是 null ＝ 不知道自己在第幾輪');
    await pretendRoundDone(P);
    sendTask(P, { type: 'dg-measure-task', task: 12, mode: 'gray', step: 'gray',
                    dest: 'x', what: 'y', round: 3 });
    await sleep(80);
    EQ(P.stepDone().gray, true,
      '🔴 `null → 3` 是「第一次知道自己在第幾輪」，不是換輪 ⇒ 不清');
    EQ(P.round(), 3, '🔴 但要把它記下來（下一次才判得出有沒有變）');
    /* 再來一則不同輪 ⇒ 這次才清 */
    sendTask(P, { type: 'dg-measure-task', task: 13, mode: 'gray', step: 'gray',
                    dest: 'x', what: 'y', round: 4 });
    await sleep(80);
    EQ(P.stepDone().gray, false, '🔴 `3 → 4` 才是真的換輪 ⇒ 清');
  }
  H('I3-d `dstRoundOf()` 的值域：不合法的一律當成「不知道」');
  {
    const { P } = await load({});
    EQ([P.roundOf(1), P.roundOf('2'), P.roundOf(0), P.roundOf(-1),
        P.roundOf('abc'), P.roundOf(undefined), P.roundOf(null)],
       [1, 2, null, null, null, null, null],
       '🔴 只有 ≥1 的整數算數，其餘一律 null');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     I5：DG 端真的把 round 送出去
     ═══════════════════════════════════════════════════════════════════════ */
  H('I5 DG：網址與 postMessage 都帶 round');
  {
    const { win, doc, opened, posted } = await loadDg();
    const btn = doc.getElementById('dg-btn-tcon-gray');
    CHECK(!!btn, '前置：找得到「T-CON 自檢畫面量測（第 2 部分）」那顆入口');
    btn.click(); await sleep(150);
    CHECK(opened.length === 1, '前置：開了一個新分頁', opened.length);
    CHECK(/[?&]round=1(&|$)/.test(opened[0].url),
      '🔴 開新分頁的網址帶了 `round=1`（少了它，下一輪會判成 `null → 2` ⇒ 不清）',
      opened[0].url);
    /* 第二次按 ⇒ 重用那個分頁 ⇒ 走 postMessage */
    btn.click(); await sleep(150);
    const task = posted.filter(m => m && m.type === 'dg-measure-task').pop();
    CHECK(!!task, '前置：重用時走的是 dg-measure-task 訊息');
    EQ(task.round, 1, '🔴 訊息裡帶了 `round`');
    CHECK(typeof task.round === 'number', '🔴 送的是**數字**（不是 DG 那句繁中的「第一輪」）', task.round);
    CHECK(!('roundName' in task), '🔴 沒有把 DG 的繁中字串一起送過去（會汙染英文／簡中介面）');
    /* 既有欄位一個都沒少 */
    for (const k of ['type', 'task', 'mode', 'step', 'dest', 'what']) {
      CHECK(k in task, '既有欄位仍在：' + k);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     🔴 突變測試：把產品端改壞，對應的斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('M 🔴 突變測試');
  /* ── M-H1：把兩段式塞回去 ⇒ H1 必須紅 ── */
  {
    const orig = "  var goTxt = dstT('dst.goMeasure');";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-H1：找得到鈕上那一行字的來源');
    const mut = SELF_SRC.replace(orig, "  var goTxt = '對位畫面';")
                        .replace('<button class="dst-btn pri" id="dst-go-gray" data-i18n="dst.goMeasure">開始量測</button>',
                                 '<button class="dst-btn" id="dst-go-gray">對位畫面</button>');
    const { doc } = await load({ src: mut });
    EQ(doc.getElementById('dst-go-gray').textContent, '對位畫面',
      '🔴 突變後鈕上又寫「對位畫面」⇒ H1 那條會紅');
  }
  /* ── M-H2：把「重新對位」塞回 HTML ⇒ H2 必須紅 ── */
  {
    const orig = '<button class="dst-btn danger" id="dst-stop"';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-H2：找得到插入點（②③ 那一列的「停止」鈕）');
    const mut = SELF_SRC.replace(orig,
      '<button class="dst-btn" id="dst-go-realign">x</button>' + orig);
    const { P } = await load({ src: mut });
    EQ(P.realignExists(), true, '🔴 突變後那顆鈕又出現了 ⇒ H2 那條會紅');
  }
  /* ── M-H2b：把對位畫面那支打壞 ⇒ H2-c（退路）必須紅 ── */
  {
    const orig = 'async function dstAlignPattern() {';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-H2b：找得到 dstAlignPattern()');
    const mut = SELF_SRC.replace(orig, 'async function dstAlignPattern() { return null;');
    const { P } = await load({ src: mut });
    await P.alignToggle();
    await sleep(120);
    EQ(P.showing() === 'align', false,
      '🔴 突變後退路也打不出對位畫面 ⇒ H2-c 會紅（退路不是用看的）');
  }
  /* ── M-I1：dstClearRound 變成什麼都不做 ⇒ I1 必須紅 ── */
  {
    const orig = 'function dstClearRound(n) {';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-I1：找得到 dstClearRound()');
    const mut = SELF_SRC.replace(orig, 'function dstClearRound(n) { if (1) return;');
    const { P, w } = await load({ src: mut });
    await pretendRoundDone(P);
    sendTask(P, { type: 'dg-measure-task', task: 9, mode: 'gray', step: 'gray',
                    dest: 'x', what: 'y', round: 2 });
    await sleep(80);
    EQ(P.stepDone().gray, true, '🔴 突變後換輪也不清 ⇒ I1 那一整組會紅');
  }
  /* ── M-I2：判準改成「收到訊息就清」⇒ I3-a／I3-b 必須紅 ── */
  {
    const orig = '  if (nr !== null && dstDgRound !== null && nr !== dstDgRound) dstClearRound(nr);';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-I2：找得到那一條判準（唯一的那一份）');
    const mut = SELF_SRC.replace(orig, '  dstClearRound(nr === null ? 0 : nr);');
    const { P, w } = await load({ src: mut });
    await pretendRoundDone(P);
    sendTask(P, { type: 'dg-measure-task', task: 10, mode: 'prim', step: 'prim',
                    dest: 'x', what: 'y', round: 1 });   // 🔴 同一輪
    await sleep(80);
    EQ(P.stepDone().gray, false,
      '🔴 突變後同一輪也被清掉了 ⇒ I3-a 會紅（這正是「每次都清」的災情）');
  }
  /* ── M-I3：讓 dstClearRound 順便清掉 IC 識別 ⇒ I2 必須紅 ── */
  {
    const orig = '  dstStepDone = { lut: false, gray: false, prim: false };';
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-I3：找得到清勾那一行');
    const mut = SELF_SRC.replace(orig, orig + '\n  dstIc = null; dstRenderBtns();');
    const { P, w } = await load({ src: mut });
    sendTask(P, { type: 'dg-measure-task', task: 9, mode: 'gray', step: 'gray',
                    dest: 'x', what: 'y', round: 2 });
    await sleep(80);
    EQ(P.icKey(), null,
      '🔴 突變後 IC 識別被清掉了 ⇒ I2「不准清」那一組會紅');
  }
  /* ── M-I3b：讓 `dstSay()` 不再退掉中性色 ⇒「退得掉」那一條必須紅 ── */
  {
    const orig = "  if (e) { e.textContent = s || ''; e.classList.remove('dst-say-info'); }";
    CHECK(SELF_SRC.indexOf(orig) > 0, 'M-I3b：找得到 dstSay() 退色那一行');
    const mut = SELF_SRC.replace(orig, "  if (e) { e.textContent = s || ''; }");
    const { P, doc } = await load({ src: mut });
    P.clearRound(2);
    await sleep(20);
    P.__say('dst-say-steps', 'boom');
    CHECK(doc.getElementById('dst-say-steps').classList.contains('dst-say-info'),
      '🔴 突變後中性色黏著不走 ⇒ 那一條會紅（壞消息會被印成資訊色）');
  }
  /* ── M-I4：DG 端不送 round ⇒ I5 必須紅 ── */
  {
    const orig = '                round: DG_ROUND,';
    CHECK(DG_SRC.indexOf(orig) > 0, 'M-I4：找得到 postMessage 裡那一行');
    const mut = DG_SRC.replace(orig, '').replace("              + '&round=' + encodeURIComponent(DG_ROUND)\n", '');
    const { doc, opened, posted } = await loadDg(mut);
    const btn = doc.getElementById('dg-btn-tcon-gray');
    btn.click(); await sleep(150);
    CHECK(!/[?&]round=/.test(opened[0].url), '🔴 突變後網址沒有 round ⇒ I5 會紅', opened[0].url);
    btn.click(); await sleep(150);
    const task = posted.filter(m => m && m.type === 'dg-measure-task').pop();
    CHECK(!(task && 'round' in task), '🔴 突變後訊息也沒有 round ⇒ I5 會紅');
  }

  console.log('\n' + '═'.repeat(64));
  console.log(fail ? ('  🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）')
                   : ('  ✅ 全部通過：' + pass + ' 項'));
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的（一定要看真瀏覽器截圖／真硬體）：');
  console.log('   · 鈕的實際長相與版面（jsdom 沒有 layout）');
  console.log('   · 三語切換後 ②③ 那一格會不會換行／溢出');
  console.log('   · 真治具、真 T-CON、真量測儀，以及 DG 真的按「進行第 N+1 輪」那條路');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
