/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_link_probe.js — 自檢量測頁 ↔ DG 主控頁「真的兩頁對開」端到端驗證
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼要再寫一支（`dg_live_fork_probe.js` 已經存在且全過）：
      那一支把兩端**分開**驗 —— DG 那一端收的是夾具自己合成的訊息，
      自檢頁那一端送的是夾具自己接住的訊息。**中間那一段從來沒有接起來過。**
      「兩端各自對」不蘊含「接起來會通」：只要有一端的形狀假設寫錯，
      兩支各自的假設會一起錯、而且一起通過。Bruce 2026-09-20 回報「實際用起來
      沒有連動」，正好落在這個沒被驗到的縫裡。

   這一支做的事：
      ① 真的開兩個 jsdom（dg.html 一個、dg-selftest.html 一個）
      ② 把 window.open 接成真的 opener 關係：
         自檢頁呼叫 `window.opener.postMessage(...)` ⇒ 事件真的進到 dg.html 的
         `message` 監聽器，`e.source` 真的是 dg.html 手上那個視窗參照。
         **沒有任何一則訊息是夾具合成的。**
      ③ 走完整四條路（第 2 部分／第 3 部分／光學資料比較／第 4 部分），
         每一條都把 dg.html 端**實際收到的資料筆數與內容**印出來。
      ④ 8 / 10 / 12-bit 三種位元深度各驗一次（10/12-bit 是階段 2 掛帳的地方）。

   用法：node tools/dg_selftest_link_probe.js
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
function H(name) { console.log('\n── ' + name + ' ' + '─'.repeat(Math.max(0, 56 - name.length))); }

function inline(file) {
  let html = fs.readFileSync(path.join(repo, file), 'utf8');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const ORIGIN = 'https://example.invalid';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ═══ 真的把兩個 jsdom 接成 opener／opened 的關係 ═══════════════════════════
   🔴 兩個 window 之間不能直接互丟物件（各自有各自的 MessageEvent 建構式），
      所以兩邊各放一個**代理物件**：
        · dg.html 手上的 `handle`  ＝ 它以為的「量測分頁」（win.open 的回傳值）
        · 自檢頁手上的 `openerPx`  ＝ 它以為的「DG 分頁」（window.opener）
      代理的 postMessage 把資料 structured-clone 一份（JSON round-trip 足夠：
      產品端送的就是純資料）之後，在對面那個 window 上派發真的 MessageEvent，
      並把 `source` 設成對面預期的那個代理 —— 這樣兩邊的來源檢查
      （dgLiveIsOurs / e.source !== window.opener）走的都是產品路徑。 */
function bridge(dgWin, selfWin, handle) {
  const openerPx = {
    closed: false,
    postMessage(data, origin) {
      const ev = new dgWin.MessageEvent('message', {
        data: JSON.parse(JSON.stringify(data)), origin: origin || ORIGIN
      });
      Object.defineProperty(ev, 'source', { value: handle });
      dgWin.dispatchEvent(ev);
    }
  };
  handle.postMessage = function (data, origin) {
    const ev = new selfWin.MessageEvent('message', {
      data: JSON.parse(JSON.stringify(data)), origin: origin || ORIGIN
    });
    Object.defineProperty(ev, 'source', { value: openerPx });
    selfWin.dispatchEvent(ev);
  };
  Object.defineProperty(selfWin, 'opener', { value: openerPx, writable: true, configurable: true });
  return openerPx;
}

async function loadDg() {
  const dom = new JSDOM(inline('dg.html'), {
    url: ORIGIN + '/dg.html', runScripts: 'dangerously', pretendToBeVisual: true
  });
  const win = dom.window;
  try { win.localStorage.clear(); } catch (e) {}
  const opened = [];
  win.open = function (url) {
    const h = { closed: false, url: url };
    opened.push(h);
    return h;
  };
  await sleep(150);
  return { dom, win, opened };
}

async function loadSelftest(url) {
  const dom = new JSDOM(inline('dg-selftest.html'), {
    url: ORIGIN + '/' + url, runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(150);
  return dom;
}

/* 造一輪「掃描跑完」的結果列（形狀與 dstRows 逐欄相同）。
   bits 決定使用者刻度上的階距：8-bit ⇒ L0…L255，10-bit ⇒ L0、L4…L1020。 */
function fakeRows(bits) {
  const step = Math.pow(2, bits - 8), end = 255 * step, mul = Math.pow(2, 12 - bits);
  const out = [];
  for (let u = 0; u <= end; u += step) {
    const v = Math.round(u * mul);
    out.push({ key: 'L' + u, r12: v, g12: v, b12: v,
               x: 0.3127, y: 0.3290, lv: +(Math.pow(u / end, 2.2) * 300).toFixed(4) });
  }
  const top = Math.round(end * mul);
  out.push({ key: 'R', r12: top, g12: 0, b12: 0, x: 0.6400, y: 0.3300, lv: 60 });
  out.push({ key: 'G', r12: 0, g12: top, b12: 0, x: 0.3000, y: 0.6000, lv: 200 });
  out.push({ key: 'B', r12: 0, g12: 0, b12: top, x: 0.1500, y: 0.0600, lv: 20 });
  return out;
}

const ENTRIES = [
  ['dg-btn-live-gray', '第 2 部分',   'gray'],
  ['dg-btn-live-prim', '第 3 部分',   'prim'],
  ['dg-btn-slot-live', '光學資料比較', 'gray'],
  ['dg-btn-conf-live', '第 4 部分',   'gray']
];

/* 走完整一輪：dg.html 按入口 → 選 T-CON 自檢 → 真的開自檢頁 →
   自檢頁把結果 postMessage 回去 → 讀 dg.html 端實際收到什麼。 */
async function oneRound(entryId, bits) {
  const { win: dgWin, opened } = await loadDg();
  dgWin.document.getElementById(entryId).click();
  await sleep(10);
  dgWin.document.getElementById('dg-btn-pick-tcon').click();
  await sleep(10);
  if (opened.length !== 1) throw new Error('沒有開出自檢分頁：' + entryId);
  const handle = opened[0];
  const sdom = await loadSelftest(handle.url);
  const sWin = sdom.window;
  bridge(dgWin, sWin, handle);

  const P = sWin.dstProbe;
  P.__setRowsForTest(fakeRows(bits));
  const sent = P.dgSend();
  await sleep(60);
  return { dgWin, sWin, P, sent, url: handle.url };
}

function grayLines(dgWin) {
  const v = (dgWin.document.getElementById('dg-in-gray').value || '').trim();
  return v ? v.split('\n') : [];
}
function primLines(dgWin) {
  const v = (dgWin.document.getElementById('dg-in-prim').value || '').trim();
  return v ? v.split('\n') : [];
}

(async function main() {
  /* ═══ 1. opener 關係真的成立 ═══════════════════════════════════════════ */
  H('1. 兩頁真的接起來了（不是夾具合成的訊息）');
  {
    const { dgWin, sWin, P, sent } = await oneRound('dg-btn-live-gray', 8);
    CHECK(P.dgState().linked === true, '自檢頁認得 opener（dstDgAlive() === true）', P.dgState().linked);
    CHECK(sent === true, 'dstDgSend() 回報「真的送出去了」', sent);
    const g = grayLines(dgWin);
    console.log('    dg.html 第 2 部分實際收到 ' + g.length + ' 列');
    console.log('      首列：' + JSON.stringify(g[0]));
    console.log('      末列：' + JSON.stringify(g[g.length - 1]));
    CHECK(g.length === 256, '第 2 部分收到 256 列', g.length);
    CHECK(/^0\s/.test(g[0] || ''), '首列是 L0', g[0]);
    CHECK(/^255\s/.test(g[255] || ''), '末列是 L255', g[255]);
  }

  /* ═══ 2. 四個目的地 ════════════════════════════════════════════════════ */
  H('2. 四個目的地各跑一輪（8-bit）');
  for (const [id, name, mode] of ENTRIES) {
    const { dgWin, P, sent } = await oneRound(id, 8);
    console.log('  ── ' + name + '（' + id + '，mode=' + P.dgState().mode + '）');
    CHECK(sent === true, name + '：訊息真的送出去了', sent);
    if (mode === 'prim') {
      const p = primLines(dgWin);
      console.log('      第 3 部分實際內容：' + JSON.stringify(p));
      CHECK(p.length === 3, name + '：第 3 部分收到三列純色', p.length);
    } else if (id === 'dg-btn-live-gray') {
      const g = grayLines(dgWin), p = primLines(dgWin);
      console.log('      第 2 部分 ' + g.length + ' 列；第 3 部分 ' + p.length + ' 列');
      console.log('      第 3 部分實際內容：' + JSON.stringify(p));
      CHECK(g.length === 256, name + '：第 2 部分 256 列', g.length);
      CHECK(p.length === 3, name + '：順便帶回的三個純色端點也進了第 3 部分', p.length);
    } else if (id === 'dg-btn-slot-live') {
      const slots = dgWin.dgApi.slots ? dgWin.dgApi.slots() : null;
      const txt = (dgWin.document.getElementById('dg-slot-status').textContent || '').trim();
      console.log('      光學資料比較組數：' + (slots ? slots.length : '(no hook)'));
      if (slots && slots[0]) {
        console.log('      第 1 組：name=' + JSON.stringify(slots[0].name)
          + '  rows=' + (slots[0].rows ? slots[0].rows.length : '?')
          + '  首列=' + JSON.stringify(slots[0].rows && slots[0].rows[0])
          + '  末列=' + JSON.stringify(slots[0].rows && slots[0].rows[slots[0].rows.length - 1]));
      }
      console.log('      狀態列：' + JSON.stringify(txt.slice(0, 90)));
      CHECK(!!slots && slots.length === 1, name + '：真的多出一組', slots ? slots.length : null);
      const curve = dgWin.dgApi.slotCurve ? dgWin.dgApi.slotCurve(0) : null;
      console.log('      第 1 組的曲線點數：' + (curve && curve.g ? curve.g.length : JSON.stringify(curve && Object.keys(curve))));
      CHECK(/256 筆/.test(txt), name + '：狀態列明講收到 256 筆', txt.slice(0, 40));
    } else {
      const txt = (dgWin.document.getElementById('dg-conf-status').textContent || '').trim();
      const has = dgWin.dgApi.confRows ? dgWin.dgApi.confRows() : null;
      console.log('      狀態列：' + JSON.stringify(txt.slice(0, 90)));
      console.log('      第 4 部分筆數：' + (has === null ? '(no probe hook)' : has));
      CHECK(txt.length > 0, name + '：狀態列有話（收到了）', txt.slice(0, 40));
    }
  }

  /* ═══ 3. 10 / 12-bit ═══════════════════════════════════════════════════
     🔴 這一節是**把已知缺陷釘住**，不是要它通過。
        根因：`dg.html` 的 `dgGrayScan()` 要求灰階集合恰為 {0…n−1}；自檢頁
        10-bit 送的是 0,4,8…1020、12-bit 是 0,16,32…4080 ⇒ `dgGrayGate()`
        擋下，第 2 部分收到 0 列。
        要不要動 `dgGrayGate` 是 DG 既有匯入判準的決定，依專案規則要先回報、
        由 Bruce 裁示 —— 所以這裡**斷言它目前是壞的**。哪天有人改好了，這一節
        會亮紅燈提醒「請一併更新這支夾具與 dst.dgBitsWarn 那句警語」。 */
  H('3. 10-bit / 12-bit 的白灰階（已知缺陷，斷言「目前仍被擋下」）');
  for (const bits of [10, 12]) {
    const { dgWin, P, sent } = await oneRound('dg-btn-live-gray', bits);
    const g = grayLines(dgWin);
    const rows = P.dgRows();
    const st = (dgWin.document.getElementById('dg-status').textContent || '').trim();
    console.log('  ── ' + bits + '-bit：自檢頁組出 ' + rows.gray.length + ' 列，'
      + '首列 ' + JSON.stringify(rows.gray[0]) + '，末列 ' + JSON.stringify(rows.gray[rows.gray.length - 1]));
    console.log('      dg.html 第 2 部分實際收到 ' + g.length + ' 列');
    console.log('      dg.html 狀態列：' + JSON.stringify(st.slice(0, 130)));
    CHECK(sent === true, bits + '-bit：自檢頁這一端確實送出去了（壞的不是這一端）', sent);
    CHECK(g.length === 0, bits + '-bit：【已知缺陷】dg.html 第 2 部分仍是 0 列', g.length);
    /* 🔴 第二個發現（階段 2 沒有記到）：DG 擋下的訊息是用**跳視窗**講的，
       但 `dgApplyLiveRows()` 在 `dgApplyGray()` 之後**照樣把「已帶入」寫進狀態列**
       ⇒ 畫面上同時有「沒有匯入」的視窗與「已帶入 256 階」的狀態列，互相矛盾。
       這一條同樣不自行修（要動的是 dg.html 的既有路徑），但要釘住、要寫進回報。 */
    const noteTitle = (dgWin.document.getElementById('dg-modal-info-title').textContent || '').trim();
    const noteBody = (dgWin.document.getElementById('dg-modal-info-body').textContent || '').trim();
    const noteOpen = dgWin.document.getElementById('dg-modal-info').classList.contains('open');
    console.log('      DG 跳視窗：open=' + noteOpen + '  標題=' + JSON.stringify(noteTitle)
      + '  內文=' + JSON.stringify(noteBody.slice(0, 90)));
    CHECK(noteOpen && /沒有匯入/.test(noteTitle + noteBody),
      bits + '-bit：DG 有跳視窗說明沒有匯入', noteTitle);
    CHECK(/已從「即時量測」分頁帶入/.test(st),
      bits + '-bit：【已知缺陷 ②】狀態列卻仍寫「已帶入」（與跳視窗互相矛盾）', st.slice(0, 40));
  }

  /* ═══ 4. 作廢的一輪不得回傳（item 7 的另一半）═══════════════════════════ */
  H('4. 作廢的一輪：一則訊息都不准送到 DG');
  {
    const { win: dgWin, opened } = await loadDg();
    dgWin.document.getElementById('dg-btn-live-gray').click();
    await sleep(10);
    dgWin.document.getElementById('dg-btn-pick-tcon').click();
    await sleep(10);
    const handle = opened[0];
    const sdom = await loadSelftest(handle.url);
    const sWin = sdom.window;
    bridge(dgWin, sWin, handle);
    /* 真的錄下「自檢頁對 opener 送了幾則」—— 不看回傳值，看線上有沒有東西。 */
    const seen = [];
    const realPost = sWin.opener.postMessage;
    sWin.opener.postMessage = function (d, o) { seen.push(d); return realPost.call(this, d, o); };

    const P = sWin.dstProbe;
    P.__setRowsForTest(fakeRows(8));      // 先擺一整輪的資料進去
    P.__setRunOkForTest(false);           // …然後宣告「這一輪沒有乾淨跑完」
    const r = P.dgSend();
    await sleep(40);
    console.log('    自檢頁 → DG 的訊息數：' + seen.length);
    console.log('    dg.html 第 2 部分列數：' + grayLines(dgWin).length);
    CHECK(r === false, '作廢的一輪：dgSend() 回 false', r);
    CHECK(seen.length === 0, '作廢的一輪：postMessage 收到 0 則（線上什麼都沒有）', seen.length);
    CHECK(grayLines(dgWin).length === 0, '作廢的一輪：DG 第 2 部分仍然是空的', grayLines(dgWin).length);
    CHECK(P.exportBlocked() !== null, '作廢的一輪：匯出被擋（有理由字串）', P.exportBlocked());
    CHECK(sWin.document.getElementById('dst-xlsx').disabled === true, '作廢的一輪：XLSX 鈕是灰的');
    /* dgself v1.3.0：CSV 鈕整顆移除（Bruce 裁示，原廠 UI 只匯 XLSX）。
       🔴 不是放寬 —— 斷言的對象換成「它不存在」，接回來一樣會紅。 */
    CHECK(sWin.document.getElementById('dst-csv') === null, '作廢的一輪：CSV 鈕已不存在（v1.3.0）');
  }

  console.log('\n' + '═'.repeat(60));
  if (fail) { console.log('🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）'); process.exit(1); }
  console.log('✅ 全過：' + pass + ' 項');
})().catch(e => { console.error(e); process.exit(2); });
