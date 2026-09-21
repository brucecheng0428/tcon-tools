/* ═══════════════════════════════════════════════════════════════════════════
   dg_live_fork_probe.js — 即時量測「二選一」的端到端驗證（jsdom）
   ───────────────────────────────────────────────────────────────────────────
   驗的是 Bruce 2026-09-20 交辦的項目 1：

     ① 每一個即時量測入口都到得了兩條路（v1.68.0 是「一律先跳二選一」；
        v1.69.0 起三個部分改成把兩條路並列在該部分的選單裡，見下面的更新記錄）
     ② 「電腦畫面量測」→ 開 dg-measure.html；「T-CON 自檢畫面量測」
        → 開 dg-selftest.html
     ③ **兩條路拿到的參數逐字相同**（mode／task／dest／what／step／v），
        差別只有檔名
     ④ 重用分頁時送出的 `dg-measure-task` 訊息兩條路也逐字相同
     ⑤ 兩條路回傳的結果都**正確回填 DG**（第 2 部分／第 3 部分／光學資料比較／
        第 4 部分四個目的地各驗一次）
     ⑥ dg-selftest.html 真的讀得到那些參數，而且回傳的訊息形狀與
        dg-measure.html 相同

   ═══ 🔴 v1.69.0 的更新記錄（哪些斷言改了、為什麼）══════════════════════════
   Bruce 2026-09-21：「第 2 部分原本的『即時量測』按下去跳的二選一**取消那層**，
   改成把『電腦畫面量測』與『從 T-CON 取』直接並列在該部分的選單裡，少一層點擊」
   「第 3 部分比照」。⇒ 本檔第 2、3、4、5 節依此更新，逐條說明：

     · **第 2 節**（原本：四個入口按下去都跳二選一）
       改成：**slot／conf 兩個入口**仍然先跳二選一（這一輪沒有動它們，所以這一條
       仍是有效的回歸斷言）；**第 2、3 部分那兩顆改成驗「不跳、直接開」**——
       那正是這一版要的行為，反過來驗才對。
       🔴 每個入口都用**全新的一份 DG**：v1.68.0 那版四個入口共用同一份 DOM，
          在「按了就直接開分頁」之後，第二個入口起就會走重用那條路，
          「還沒選之前不開任何分頁」那種斷言會因為前一個入口留下的分頁而假紅。

     · **第 3 節**（兩條路的參數逐字相同）
       原本兩條路都靠「按入口 → 按二選一裡的某一顆」取得。現在第 2、3 部分的
       兩條路各自有自己的按鈕 ⇒ 改成用 `PATH[kind][入口]` 指定「這一條路要按哪顆」，
       slot／conf 仍走二選一。**比對的內容一個字都沒放寬**（仍然逐欄比 mode／
       dest／what／task／v，並要求除檔名外查詢字串完全相同）。

     · **第 4 節**（重用分頁時的換任務訊息）同上：pc 那一條按 `dg-btn-live-gray`／
       `dg-btn-live-prim`，tcon 那一條按 `dg-btn-tcon-gray`／`dg-btn-tcon-prim`。

     · **第 5 節**（回填）同上。

     · **第 6 節**：`P.dgRows()` 那三條**不是這一版弄壞的，是一直紅著的**。
       v1.4.0 起灰階欄送的是 `idx`（0…255 的索引），而這份夾具的假列還停在
       v1.3.0 的形狀（只有 `key`，沒有 `idx`／`r12`）⇒ 產品正確地把它們全部濾掉。
       這一版把假列補上 `idx`／`r12`（照 dstPlan() 的規則，本檔自己算），
       紅的三條因此變綠。**產品端沒有為此改任何一行。**

   🔴 這支**不是** pre-commit 檢查（要載入兩個大頁面，數秒）。它是改動
      「即時量測入口 → 量測頁」這條路時的手動回歸閘門。

   用法：
     NODE_PATH=<jsdom 所在> node tools/dg_live_fork_probe.js
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
function H(name) { console.log('\n── ' + name + ' ' + '─'.repeat(Math.max(0, 52 - name.length))); }

/* 把 <script src> 就地內嵌（jsdom 不去抓檔案） */
function inline(file) {
  let html = fs.readFileSync(path.join(repo, file), 'utf8');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}

const ORIGIN = 'https://example.invalid';

/* ═══ 假的量測分頁：只記下「我被開成什麼網址」與「我收到什麼訊息」════════ */
function makeFakeWin() {
  const w = { closed: false, msgs: [] };
  w.postMessage = function (d) { w.msgs.push(JSON.parse(JSON.stringify(d))); };
  return w;
}

async function loadDg() {
  const dom = new JSDOM(inline('dg.html'), {
    url: ORIGIN + '/dg.html', runScripts: 'dangerously', pretendToBeVisual: true
  });
  const win = dom.window;
  // localStorage 自動還原會把上一輪的資料帶進來 —— 這支只驗流程，清掉比較乾淨
  try { win.localStorage.clear(); } catch (e) {}
  const opened = [];
  win.open = function (url) { const w = makeFakeWin(); w.url = url; opened.push(w); return w; };
  await new Promise(r => setTimeout(r, 120));
  return { dom, win, opened };
}

/* ═══ 1. 入口全找齊 ═══════════════════════════════════════════════════════ */
(async function main() {
  H('1. 入口盤點（不可以只改一處）');
  const src = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');
  /* 四個「白灰階／純色」的目的地。v1.69.0 起每一個目的地各自對應兩條路：
       pc   ＝ 電腦畫面量測（dg-measure.html）
       tcon ＝ T-CON 自檢畫面量測（dg-selftest.html）
     第 2、3 部分兩條路各有自己的按鈕；slot／conf 仍然共用一顆鈕 ＋ 二選一視窗。 */
  const ENTRIES = ['dg-btn-live-gray', 'dg-btn-live-prim', 'dg-btn-slot-live', 'dg-btn-conf-live'];
  const PICK_ENTRIES = ['dg-btn-slot-live', 'dg-btn-conf-live'];      // 仍走二選一
  const DIRECT_ENTRIES = ['dg-btn-live-gray', 'dg-btn-live-prim'];    // v1.69.0 起直接開
  /* 「要走這一條路，該按哪一顆鈕」。值為 null ＝ 按原入口再按二選一裡的那一顆。 */
  const PATH = {
    pc:   { 'dg-btn-live-gray': 'dg-btn-live-gray', 'dg-btn-live-prim': 'dg-btn-live-prim',
            'dg-btn-slot-live': null, 'dg-btn-conf-live': null },
    tcon: { 'dg-btn-live-gray': 'dg-btn-tcon-gray', 'dg-btn-live-prim': 'dg-btn-tcon-prim',
            'dg-btn-slot-live': null, 'dg-btn-conf-live': null }
  };
  /* 走一次「某個目的地 × 某一條路」。回傳按完之後的狀態由呼叫端自己讀。 */
  async function goPath(win, kind, id) {
    const direct = PATH[kind][id];
    if (direct) {
      win.document.getElementById(direct).click();
      await new Promise(r => setTimeout(r, 10));
      return;
    }
    win.document.getElementById(id).click();
    await new Promise(r => setTimeout(r, 10));
    win.document.getElementById(kind === 'pc' ? 'dg-btn-pick-pc' : 'dg-btn-pick-tcon').click();
    await new Promise(r => setTimeout(r, 10));
  }
  let { dom, win, opened } = await loadDg();
  ENTRIES.forEach(id => CHECK(!!win.document.getElementById(id), '入口存在：' + id));
  /* v1.69.0 新增的三顆 */
  ['dg-btn-tcon-gray', 'dg-btn-tcon-prim', 'dg-btn-tcon-lut']
    .forEach(id => CHECK(!!win.document.getElementById(id), 'v1.69.0 的 T-CON 入口存在：' + id));
  CHECK(!/window\.open\(\s*['"]dg-measure\.html/.test(src),
    'dg.html 裡沒有任何「直接 window.open dg-measure.html」的殘留路徑');
  const files = win.dgApi.livePageFiles();
  EQ(files, { pc: 'dg-measure.html', tcon: 'dg-selftest.html' }, '兩條路各自對應的檔名');

  H('2. slot／conf 仍然先跳二選一（這一輪沒動它們）');
  /* 🔴 每個入口一份全新的 DG —— 見檔頭第 2 節那段說明。 */
  for (const id of PICK_ENTRIES) {
    ({ dom, win, opened } = await loadDg());
    CHECK(!win.dgApi.pickOpen(), '按之前視窗是關的（' + id + '）');
    win.document.getElementById(id).click();
    await new Promise(r => setTimeout(r, 10));
    CHECK(win.dgApi.pickOpen(), '按下去之後二選一視窗打開了：' + id);
    CHECK(opened.length === 0, '還沒選之前不開任何分頁：' + id, opened.length);
    CHECK(win.dgApi.liveTaskId() === 0, '還沒選之前任務編號不動：' + id, win.dgApi.liveTaskId());
    win.document.getElementById('dg-modal-pick-close').click();
    await new Promise(r => setTimeout(r, 10));
    CHECK(!win.dgApi.pickOpen(), '取消就關掉：' + id);
    CHECK(win.dgApi.liveTaskId() === 0, '取消不算一次量測（任務編號仍是 0）：' + id, win.dgApi.liveTaskId());
  }

  H('2-b. 🔴 v1.69.0：第 2、3 部分不再跳二選一（少一層點擊）');
  for (const id of DIRECT_ENTRIES.concat(['dg-btn-tcon-gray', 'dg-btn-tcon-prim', 'dg-btn-tcon-lut'])) {
    ({ dom, win, opened } = await loadDg());
    win.document.getElementById(id).click();
    await new Promise(r => setTimeout(r, 15));
    CHECK(!win.dgApi.pickOpen(), '🔴 按下去**不**跳二選一：' + id);
    CHECK(opened.length === 1, '🔴 按一下就直接開了分頁（只開一個）：' + id, opened.length);
    CHECK(win.dgApi.liveTaskId() === 1, '算一次量測（任務編號 +1）：' + id, win.dgApi.liveTaskId());
  }

  /* ═══ 3. 兩條路的參數逐字相同 ═══════════════════════════════════════════ */
  H('3. 兩條路帶出去的參數（差別只有檔名）');
  const urlsOf = {};
  /* 🔴 每一個入口都用**全新的一份 DG**：分頁一旦開著，下一次按就會走「重用」
     那條路（只送訊息、不開新分頁）—— 用同一份 DG 連按四次，只會拿到第一次
     那個網址四遍，等於什麼都沒驗到。 */
  for (const kind of ['pc', 'tcon']) {
    urlsOf[kind] = {};
    for (const id of ENTRIES) {
      ({ dom, win, opened } = await loadDg());
      await goPath(win, kind, id);            // v1.69.0：兩條路各自的按法，見上面的 PATH
      CHECK(opened.length === 1, '走完這一條路才開分頁，而且只開一個（' + kind + ' / ' + id + '）', opened.length);
      urlsOf[kind][id] = opened[0].url;
    }
  }
  const stripFile = u => u.replace(/^dg-(measure|selftest)\.html/, '<PAGE>');
  const WANT = {
    'dg-btn-live-gray': { mode: null,   dest: '第 2 部分',                what: '白灰階亮度' },
    'dg-btn-live-prim': { mode: 'prim', dest: '第 3 部分',                what: 'RGB 純色 Pattern' },
    'dg-btn-slot-live': { mode: null,   dest: '光學資料比較（匯入或量測）', what: '白灰階亮度' },
    'dg-btn-conf-live': { mode: null,   dest: '第 4 部分（確認結果）',      what: '白灰階亮度' }
  };
  ENTRIES.forEach(id => {
    const a = urlsOf.pc[id], b = urlsOf.tcon[id];
    CHECK(a.startsWith('dg-measure.html'), '電腦畫面量測 → dg-measure.html（' + id + '）', a);
    CHECK(b.startsWith('dg-selftest.html'), 'T-CON 自檢畫面量測 → dg-selftest.html（' + id + '）', b);
    CHECK(stripFile(a) === stripFile(b), '除了檔名以外，查詢字串逐字相同（' + id + '）',
      [stripFile(a), stripFile(b)]);
    /* 🔴 「兩條一樣」還不夠 —— 兩條一起錯也會一樣。所以逐欄比對實際內容。 */
    const q = new (require('url').URLSearchParams)(b.slice(b.indexOf('?')));
    const w = WANT[id];
    CHECK(q.get('mode') === w.mode, `${id}：mode = ${w.mode}`, q.get('mode'));
    CHECK(q.get('dest') === w.dest, `${id}：dest = ${w.dest}`, q.get('dest'));
    CHECK(q.get('what') === w.what, `${id}：what = ${w.what}`, q.get('what'));
    CHECK(/^\d+$/.test(q.get('task')), `${id}：task 是數字`, q.get('task'));
    CHECK(!!q.get('v'), `${id}：v 有帶（快取繞過）`, q.get('v'));
    /* v1.69.0 多的第五個參數。gray／prim 兩步的 step 就等於它的 mode
       （mode 缺席 ＝ gray），所以這四個入口的 step 與它們原本的語意一致。 */
    CHECK(q.get('step') === (w.mode === 'prim' ? 'prim' : 'gray'),
      `${id}：step = ${w.mode === 'prim' ? 'prim' : 'gray'}`, q.get('step'));
  });
  console.log('\n  實際帶出去的網址（T-CON 自檢那一條）：');
  ENTRIES.forEach(id => console.log('    ' + id.padEnd(18) + ' → ' + urlsOf.tcon[id]));

  /* ═══ 4. 重用分頁：訊息兩條路相同 ═══════════════════════════════════════ */
  H('4. 重用分頁時的換任務訊息');
  const msgsOf = {};
  for (const kind of ['pc', 'tcon']) {
    ({ dom, win, opened } = await loadDg());
    // 第一次：開分頁
    await goPath(win, kind, 'dg-btn-live-gray');
    const w = opened[0];
    CHECK(win.dgApi.liveWinsAlive()[kind], '第一次按：' + kind + ' 那個槽有分頁了');
    CHECK(!win.dgApi.liveWinsAlive()[kind === 'pc' ? 'tcon' : 'pc'], '另一條路的槽仍然是空的');
    // 第二次：同一條路 → 應該重用（不開新分頁）
    await goPath(win, kind, 'dg-btn-live-prim');
    CHECK(opened.length === 1, '同一條路第二次：重用原分頁，不開新的（' + kind + '）', opened.length);
    msgsOf[kind] = w.msgs;
  }
  EQ(msgsOf.pc, msgsOf.tcon, '換任務訊息兩條路逐字相同');
  console.log('  實際的換任務訊息：' + JSON.stringify(msgsOf.tcon));

  /* ═══ 5. 兩條路的回填 ═══════════════════════════════════════════════════ */
  H('5. 回填 DG（四個目的地 × 兩條路）');
  const DESTS = [
    ['dg-btn-live-gray', 'gray', 'dg-in-gray'],
    ['dg-btn-live-prim', 'prim', 'dg-in-prim'],
    ['dg-btn-slot-live', 'gray', null],
    ['dg-btn-conf-live', 'gray', null]
  ];
  function grayRows(n) {
    const out = [];
    for (let g = 0; g < n; g++) out.push([g, 0.3127, 0.3290, +(g / (n - 1) * 300).toFixed(4)]);
    return out;
  }
  const PRIM = [['r', 0.64, 0.33, 60], ['g', 0.30, 0.60, 200], ['b', 0.15, 0.06, 20]];

  for (const kind of ['pc', 'tcon']) {
    for (const [id, mode] of DESTS) {
      ({ dom, win, opened } = await loadDg());
      await goPath(win, kind, id);
      const w = opened[0];
      const task = win.dgApi.liveTaskId();
      const rows = (mode === 'prim') ? PRIM : grayRows(256);
      const ev = new win.MessageEvent('message', {
        data: {
          type: 'dg-measure-result', mode: mode, label: '即時量測', task: task,
          at: '2026-09-20 12:00:00', rows: rows,
          prim: (mode === 'gray') ? PRIM : null, durMs: 123456, settleMs: 700
        },
        origin: ORIGIN
      });
      Object.defineProperty(ev, 'source', { value: w });
      win.dispatchEvent(ev);
      await new Promise(r => setTimeout(r, 30));

      if (mode === 'prim') {
        const v = win.document.getElementById('dg-in-prim').value.trim();
        CHECK(v.split('\n').length === 3, `[${kind}] ${id}：第 3 部分收到三列純色`, v.split('\n').length);
      } else if (id === 'dg-btn-live-gray') {
        const v = win.document.getElementById('dg-in-gray').value.trim().split('\n');
        CHECK(v.length === 256, `[${kind}] ${id}：第 2 部分收到 256 列`, v.length);
        CHECK(/^0 /.test(v[0]) && /^255 /.test(v[255]), `[${kind}] ${id}：首末列是 L0 與 L255`, [v[0], v[255]]);
        const pv = win.document.getElementById('dg-in-prim').value.trim();
        CHECK(pv.split('\n').length === 3, `[${kind}] ${id}：順便帶回來的三個純色端點也進了第 3 部分`, pv);
      } else if (id === 'dg-btn-slot-live') {
        const n = win.dgApi.slotCount ? win.dgApi.slotCount() : null;
        const txt = win.document.getElementById('dg-slot-status').textContent || '';
        CHECK(/量測|新增|一組|已/.test(txt), `[${kind}] ${id}：光學資料比較有收到（狀態列有話）`, txt.slice(0, 60));
      } else {
        const txt = win.document.getElementById('dg-conf-status').textContent || '';
        CHECK(txt.length > 0, `[${kind}] ${id}：第 4 部分有收到（狀態列有話）`, txt.slice(0, 60));
      }
    }
  }

  /* ═══ 6. dg-selftest 那一端 ═════════════════════════════════════════════ */
  H('6. dg-selftest.html 真的讀得到那四個參數、也送得出同一種訊息');
  const qs = '?mode=prim&task=7&dest=' + encodeURIComponent('第 3 部分')
    + '&what=' + encodeURIComponent('RGB 純色 Pattern') + '&v=v1.68.0';
  const opener = makeFakeWin();
  const sdom = new JSDOM(inline('dg-selftest.html'), {
    url: ORIGIN + '/dg-selftest.html' + qs, runScripts: 'dangerously', pretendToBeVisual: true
  });
  const sw = sdom.window;
  Object.defineProperty(sw, 'opener', { value: opener, writable: true, configurable: true });
  await new Promise(r => setTimeout(r, 150));
  const P = sw.dstProbe;
  const st = P.dgState();
  EQ({ mode: st.mode, task: st.task, dest: st.dest, what: st.what },
     { mode: 'prim', task: 7, dest: '第 3 部分', what: 'RGB 純色 Pattern' },
     '四個查詢字串參數都讀到了（原樣，不是猜的）');
  CHECK(st.ver && st.ver === (sw.TOOL_VERSIONS && sw.TOOL_VERSIONS.dg),
    'hello 回報的 version 是 TOOL_VERSIONS.dg（與 dg-measure.html 相同欄位語意）', st.ver);

  // prim 模式的掃描計畫只有三步
  EQ(P.plan(8, 'prim').map(x => x.key), ['R', 'G', 'B'], 'mode=prim 的掃描計畫只跑三個純色端點');
  CHECK(P.plan(8, 'gray').length === 259, 'mode=gray 的掃描計畫是 256 階 ＋ 3 純色', P.plan(8, 'gray').length);
  CHECK(P.plan(8).length === 259, '不給 mode 時與 v1.0.0 逐字同結果（256 ＋ 3）', P.plan(8).length);

  // 回傳訊息的形狀
  P.__setRowsForTest([
    { key: 'R', r12: 4080, g12: 0, b12: 0, x: 0.64, y: 0.33, lv: 60 },
    { key: 'G', r12: 0, g12: 4080, b12: 0, x: 0.30, y: 0.60, lv: 200 },
    { key: 'B', r12: 0, g12: 0, b12: 4080, x: 0.15, y: 0.06, lv: 20 }
  ]);
  CHECK(P.dgSend() === true, 'prim 模式：三筆到齊 ⇒ 送得出去');
  const out = opener.msgs[opener.msgs.length - 1];
  EQ(Object.keys(out).sort(),
     ['at', 'durMs', 'label', 'mode', 'prim', 'rows', 'settleMs', 'task', 'type'].sort(),
     '回傳訊息的欄位與 dg-measure.html 逐字相同');
  EQ([out.type, out.mode, out.task, out.rows],
     ['dg-measure-result', 'prim', 7, [['r', 0.64, 0.33, 60], ['g', 0.30, 0.60, 200], ['b', 0.15, 0.06, 20]]],
     'prim 的 rows 形狀 ＝ [[代號, x, y, Lv] × 3]');

  /* gray 模式：灰階欄送的是 **0…255 的索引**。
     🔴 這幾列原本只有 `key`（v1.3.0 的形狀）⇒ **從 dgself v1.4.0 起就一直是紅的**，
        不是這一版弄壞的：v1.4.0 改成「索引一律由 `idx`（或 `r12`）決定，不再解析
        `key` 的字樣」（理由寫在 dg-selftest.html 的 dstDgRows 上方：10/12-bit 的
        `key` 是使用者刻度，送回 DG 會缺 L1 而整批被退掉）。沒有 `idx`／`r12` 的
        假列因此被產品**正確地**濾掉。
     🔴 這一版把假列補上 `idx`／`r12`（照 dstPlan() 的規則，本檔自己算：
        8-bit 的 L(n) ⇒ idx = n、r12 = n × 16），紅的三條因此變綠。
        **產品端沒有為此改任何一行。** */
  P.dgApplyTask({ task: 9, mode: 'gray', step: 'gray', dest: '第 2 部分', what: '白灰階亮度' });
  P.__setRowsForTest([
    { key: 'L0',   group: 'gray', idx: 0,   r12: 0,    x: 0.25,   y: 0.25,   lv: 0 },
    { key: 'L128', group: 'gray', idx: 128, r12: 2048, x: 0.3127, y: 0.3290, lv: 60 },
    { key: 'L255', group: 'gray', idx: 255, r12: 4080, x: 0.3127, y: 0.3290, lv: 300 },
    // 失敗那一階：有 idx，但沒量到值 ⇒ 仍然不可以被送出去
    { key: 'L64',  group: 'gray', idx: 64,  r12: 1024, x: null,   y: null,   lv: null },
    { key: 'R', group: 'prim', idx: 255, r12: 4080, x: 0.64, y: 0.33, lv: 60 },
    { key: 'G', group: 'prim', idx: 255, r12: 4080, x: 0.30, y: 0.60, lv: 200 },
    { key: 'B', group: 'prim', idx: 255, r12: 4080, x: 0.15, y: 0.06, lv: 20 }
  ]);
  const g = P.dgRows();
  EQ(g.gray.map(r => r[0]), [0, 128, 255], 'gray 的第一欄是實際灰階值，失敗那一階不送');
  EQ(g.prim.map(r => r[0]), ['r', 'g', 'b'], '純色端點另外收在 prim 欄位');
  CHECK(P.dgSend() === true, 'gray 模式送得出去');
  const out2 = opener.msgs[opener.msgs.length - 1];
  CHECK(out2.mode === 'gray' && out2.task === 9 && out2.prim && out2.prim.length === 3,
    'gray 的訊息帶著 task=9 與三個純色端點', { mode: out2.mode, task: out2.task, prim: !!out2.prim });

  // hello
  opener.msgs.length = 0;
  P.dgPostHello(11);
  EQ(opener.msgs[0], { type: 'dg-measure-hello', version: st.ver, task: 11, running: false },
    'hello 的形狀與 dg-measure.html 逐字相同');

  // 下載入口讀 HELPER_PKG
  H('7. 下載入口（三頁都讀 HELPER_PKG，不寫死）');
  const pk = P.pkg();
  const href = sw.document.getElementById('dst-dl').getAttribute('href');
  CHECK(href === pk.file + '?v=' + pk.pkg, 'dg-selftest 的下載連結 ＝ HELPER_PKG.file', href);
  ({ dom, win, opened } = await loadDg());
  const href2 = win.document.getElementById('dg-pick-dl').getAttribute('href');
  CHECK(href2 === pk.file + '?v=' + pk.pkg, 'dg.html 二選一視窗的下載連結 ＝ HELPER_PKG.file', href2);
  CHECK(win.document.getElementById('dg-pick-dl-ver').textContent === pk.pkg,
    'dg.html 的按鈕上印的是 HELPER_PKG.pkg', win.document.getElementById('dg-pick-dl-ver').textContent);

  console.log('\n' + '═'.repeat(58));
  if (fail) { console.log('🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）'); process.exit(1); }
  console.log('✅ 全過：' + pass + ' 項');
  console.log('🔴 這支驗不到的：真的治具、真的 TCON、真的量測儀、真瀏覽器的分頁行為。');
})().catch(e => { console.error(e); process.exit(2); });
