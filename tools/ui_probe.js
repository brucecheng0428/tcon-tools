/* ═══════════════════════════════════════════════════════════════════════════
   ui_probe.js — 在**真實瀏覽器**裡走過主要互動路徑
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼非要這一支不可（2026-09-19 的教訓）：
      `i2c_tool_selftest.js` 是 jsdom，700 多項全綠，**但 Bruce 一打開就說
      「點了根本沒辦法改值」**。原因是 jsdom 驗得了資料流，驗不了
      「使用者點下去會發生什麼」：
        · 單擊的 handler 會 `innerHTML = html` 整片重繪 ⇒ 第二下打在新節點上
          ⇒ **瀏覽器湊不出 dblclick** ⇒ 雙擊改值永遠不會發生。
          jsdom 不會抱怨，因為測試是直接 dispatch dblclick 的。
        · `<td>` 不可聚焦 ⇒ 方向鍵收不到 keydown。
      這兩個都只有在真的瀏覽器裡、用真的事件順序才看得見。

   做法：注入這支 probe，它自己驅動 UI（真的 dispatch 事件、真的等重繪），
   把結果寫進 document.title，由 tools/ui_probe.sh 用 --dump-dom 取回。
   不需要 CDP、不需要任何會跳授權卡片的工具。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  /* 🔴 可以只跑到第 N 條路徑就收工（`?stop=2`）。用途是**二分找出是哪一條把
     瀏覽器卡死** —— 卡死的時候整支拿不到任何結果，只能這樣縮範圍。 */
  const STOP = parseInt((location.search.match(/stop=(\d+)/) || [])[1] || '99', 10);
  const stage = (n) => { if (n > STOP) { document.title = 'UIPROBE' + JSON.stringify(R); throw new Error('__STOP__'); } };
  /* 🔴 頁面自己的例外要抓起來回報。async 事件 handler 裡丟出的例外會變成
     **unhandledrejection**，畫面上什麼都不會顯示 —— 那正是「點了沒反應」的
     典型長相，不抓就只能猜。 */
  const ERRS = [];
  /* 🔴 headless 沒有人可以按 confirm ⇒ `window.confirm()` 會**把頁面卡住**，
     probe 就永遠拿不到結果（第一版誤判成「無窮迴圈」，其實是這個）。
     這裡把它換成自動答「是」，並記錄問過幾次 —— 問了幾次本身也是要驗的事。 */
  let CONFIRMS = 0;
  window.confirm = function () { CONFIRMS++; return true; };
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const cellAt = (idx) => document.querySelector('#dump td[data-idx="' + idx + '"]');
  const mainOf = (idx) => { const t = cellAt(idx); const m = t && t.querySelector('.mv'); return m ? m.textContent : null; };
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (el, k, shift) => {
    const e = new KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };

  (async function () {
    /* 🔴 probe 是接在頁面後面的 <script>，會在頁面自己的初始化（DOMContentLoaded）
       之前跑。要先等 __i2ct 出現，否則整支安靜地什麼都沒做 —— 而「安靜地
       什麼都沒做」正是這一支存在的理由，不能自己也犯。 */
    let A = null;
    for (let i = 0; i < 100 && !A; i++) { A = window.__i2ct; if (!A) await sleep(50); }
    if (!A) { document.title = 'UIPROBE' + JSON.stringify([{ name: '等不到 __i2ct（頁面初始化失敗？）', pass: false }]); return; }
    /* 🔴 光有 __i2ct 還不夠：那個物件在 script 求值時就存在了，但事件接線與
       第一次繪製是在 DOMContentLoaded 之後。太早動手會操作到還沒接線的畫面
       （第一版就是這樣：loadFile 看起來成功，curSet() 卻是 null）。 */
    for (let i = 0; i < 100 && document.readyState !== 'complete'; i++) await sleep(50);
    for (let i = 0; i < 60 && !document.querySelector('#dump td'); i++) await sleep(50);
    await sleep(200);
    /* 🔴 任何例外都要變成一筆 FAIL 回報出去，不能讓 title 停在原樣讓人以為沒跑。 */
    try {

    /* 準備一份離線資料（未連線 ⇒ 編輯只改本地值，不需要 bridge） */
    A._reset();
    const loaded = A.loadFile('probe.bin', new Uint8Array(Array.from({ length: 512 }, (_, i) => i & 0xFF)));
    await sleep(120);
    ok('前置：載入 512 byte', A.curSet() && A.curSet().bytes.length === 512,
       'loadFile=' + loaded + ' len=' + (A.curSet() ? A.curSet().bytes.length : 'null')
       + ' cells=' + document.querySelectorAll('#dump td[data-idx]').length);
    if (!A.curSet()) {
      R.push({ name: 'errs', pass: false, extra: ERRS.join(' | ') });
      document.title = 'UIPROBE' + JSON.stringify(R); return;
    }

    stage(1);
    /* ── 路徑 1：單擊一格就能進編輯（真的滑鼠事件）─────────────────────── */
    click(cellAt(3));
    await sleep(60);
    const edit1 = document.querySelector('#dump td.edit input');
    ok('1a 單擊一格 ⇒ 進入編輯狀態（出現輸入框）', !!edit1);
    ok('1b 編輯狀態看得出來（td 有 edit class）', !!document.querySelector('#dump td.edit'));
    ok('1c 焦點在輸入框上（收得到鍵盤）', document.activeElement === edit1);
    ok('1d 同時也做了十字定位', !!document.querySelector('#dump td.xh, #dump th.xh'));

    stage(2);
    /* ── 路徑 2：打字只顯示、不生效；Enter 才生效 ───────────────────────── */
    if (edit1) {
      edit1.value = 'A'; edit1.dispatchEvent(new Event('input', { bubbles: true }));
      edit1.value = 'AA'; edit1.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);
      ok('2a 打滿兩位**還沒生效**（資料仍是原值）', A.curSet().bytes[3] === 3, A.curSet().bytes[3]);
      key(edit1, 'Enter');
      await sleep(80);
      ok('2b 按 Enter 才生效', A.curSet().bytes[3] === 0xAA, A.curSet().bytes[3]);
      ok('2c 生效後畫面顯示新值', mainOf(3) === 'AA', mainOf(3));
      ok('2d 未連線 ⇒ 標成「尚未寫入」', A.dirtyAt(3) === true);
    }

    stage(3);
    /* ── 路徑 3：Esc 放棄 ──────────────────────────────────────────────── */
    click(cellAt(4));
    await sleep(50);
    const edit3 = document.querySelector('#dump td.edit input');
    if (edit3) {
      edit3.value = 'BB'; edit3.dispatchEvent(new Event('input', { bubbles: true }));
      key(edit3, 'Escape');
      await sleep(60);
      ok('3a Esc ⇒ 值回原狀', A.curSet().bytes[4] === 4, A.curSet().bytes[4]);
      ok('3b Esc ⇒ 離開編輯狀態', !document.querySelector('#dump td.edit'));
    }

    stage(4);
    /* ── 路徑 4：打完點別格 ＝ 完成 ────────────────────────────────────── */
    click(cellAt(5));
    await sleep(50);
    const edit4 = document.querySelector('#dump td.edit input');
    if (edit4) {
      edit4.value = 'CC'; edit4.dispatchEvent(new Event('input', { bubbles: true }));
      click(cellAt(6));
      await sleep(90);
      ok('4a 點別格 ⇒ 前一格的輸入生效', A.curSet().bytes[5] === 0xCC, A.curSet().bytes[5]);
      ok('4b 新點的那一格進入編輯', !!document.querySelector('#dump td.edit input'));
      ok('4c 新格就是剛點的那一格', A.editing() && A.editing().idx === 6, A.editing() && A.editing().idx);
    }

    stage(5);
    /* ── 路徑 5：只打一位 ⇒ 高位補 0 ──────────────────────────────────── */
    click(cellAt(7));
    await sleep(50);
    const edit5 = document.querySelector('#dump td.edit input');
    if (edit5) {
      edit5.value = 'B'; edit5.dispatchEvent(new Event('input', { bubbles: true }));
      key(edit5, 'Enter');
      await sleep(70);
      ok('5a 只打一位 ⇒ 高位補 0（B ⇒ 0B）', A.curSet().bytes[7] === 0x0B, A.curSet().bytes[7]);
    }

    stage(6);
    /* ── 路徑 6：打滿兩位再打第三個 ⇒ 往左移位 ─────────────────────────── */
    click(cellAt(8));
    await sleep(50);
    const edit6 = document.querySelector('#dump td.edit input');
    if (edit6) {
      edit6.value = 'AB'; edit6.dispatchEvent(new Event('input', { bubbles: true }));
      edit6.value = 'ABC'; edit6.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);
      ok('6a 第三個字元 ⇒ 往左移位（ABC ⇒ BC）', edit6.value === 'BC', edit6.value);
      key(edit6, 'Escape');
      await sleep(40);
    }

    stage(7);
    /* ── 路徑 7：方向鍵移動選中格（無 Shift）＋ 不捲頁 ──────────────────── */
    click(cellAt(0x20));
    await sleep(60);
    let el = document.activeElement;
    const prevented = key(el, 'ArrowRight');
    await sleep(70);
    ok('7a 按右 ⇒ 選中格 +1', A.cursorAt() === 0x21, A.cursorAt());
    ok('7b 方向鍵有 preventDefault（頁面不會被捲走）', prevented === true);
    el = document.activeElement; key(el, 'ArrowDown'); await sleep(70);
    ok('7c 按下 ⇒ +16', A.cursorAt() === 0x31, A.cursorAt());
    el = document.activeElement; key(el, 'ArrowLeft'); await sleep(70);
    ok('7d 按左 ⇒ -1', A.cursorAt() === 0x30, A.cursorAt());
    el = document.activeElement; key(el, 'ArrowUp'); await sleep(70);
    ok('7e 按上 ⇒ -16', A.cursorAt() === 0x20, A.cursorAt());
    ok('7f 移動後仍在編輯狀態（可以直接打字）', !!document.querySelector('#dump td.edit input'));

    /* 夾住不繞回 */
    click(cellAt(0)); await sleep(60);
    el = document.activeElement; key(el, 'ArrowLeft'); await sleep(70);
    ok('7g 第 0 格按左 ⇒ 夾住不繞回', A.cursorAt() === 0, A.cursorAt());
    el = document.activeElement; key(el, 'ArrowUp'); await sleep(70);
    ok('7h 第 0 格按上 ⇒ 夾住', A.cursorAt() === 0, A.cursorAt());

    /* 跨頁自動翻頁 */
    click(cellAt(0xF0)); await sleep(60);
    el = document.activeElement; key(el, 'ArrowDown'); await sleep(90);
    ok('7i 跨頁 ⇒ 自動翻到第 2 頁', A.pageIdx() === 1, 'page=' + A.pageIdx());
    ok('7j 跨頁後選中格正確（0x100）', A.cursorAt() === 0x100, A.cursorAt());

    stage(8);
    /* ── 路徑 8：Shift＋方向鍵 ＝ 擴展選取，與無 Shift 區分 ──────────────── */
    A.selClear();
    click(cellAt(0x100)); await sleep(60);
    el = document.activeElement;
    const p2 = key(el, 'ArrowDown', true);
    await sleep(80);
    const r = A.selRange();
    ok('8a Shift+下 ⇒ 選取 17 格', r && r.len === 17, r && r.len);
    ok('8b 區間從 0x100 到 0x110', r && r.from === 0x100 && r.to === 0x110, r && (r.from + '..' + r.to));
    ok('8c Shift 版也有 preventDefault', p2 === true);
    ok('8d 畫面真的標了 17 格', document.querySelectorAll('#dump td.sel').length === 17,
       document.querySelectorAll('#dump td.sel').length);
    ok('8e 按鈕寫出會寫幾個 byte', $('#btn-write').textContent === '寫入 17 byte', $('#btn-write').textContent);

    stage(9);
    /* ── 路徑 9a：選了一段之後載入**更小**的檔 ⇒ 索引不可以指到不存在的位置 ──
       （附帶驗證：有未寫入的本地修改時，載入檔案會先問一次。） */
    /* 🔴 前一段結束時停在第 2 頁，td[data-idx=0] 不在畫面上 ——
       先跳回第 1 頁再點（probe 第一版就是這樣自己爆掉的）。 */
    A.selClear();
    A.jumpTo('000');
    await sleep(60);
    click(cellAt(0)); await sleep(50);
    key(document.activeElement, 'ArrowDown', true); await sleep(60);
    ok('9a 前置：先選起一段', A.selRange() && A.selRange().len === 17, A.selRange() && A.selRange().len);
    A.loadFile('tiny.bin', new Uint8Array([1, 2, 3, 4]));
    await sleep(120);
    ok('9b 載入更小的檔 ⇒ 選取被清掉、索引不越界', A.selRange() === null && A.curSet().bytes.length === 4,
       'len=' + A.curSet().bytes.length + ' sel=' + JSON.stringify(A.selRange()));
    ok('9b2 有未寫入的本地修改 ⇒ 載入前先問過一次', CONFIRMS >= 1, 'confirm 次數=' + CONFIRMS);

    /* ── 路徑 9c：FF 一律不標 ──────────────────────────────────────────── */
    A._reset();
    A.loadFile('ff.bin', new Uint8Array([0xFF, 0xFF, 0xFF, 0x00, 0xFF, 0xFF]));
    await sleep(60);
    ok('9c 載入的 FF 一格都沒標', document.querySelectorAll('#dump td.ff, #dump td.bus').length === 0,
       document.querySelectorAll('#dump td.ff, #dump td.bus').length);
    ok('9d 圖例裡沒有 FF 項目', !/FF/.test(document.querySelector('.legend').textContent),
       document.querySelector('.legend').textContent.replace(/\s+/g, ' ').trim());

    stage(10);
    /* ── 路徑 10：主要按鈕真的按得下去 ─────────────────────────────────── */
    ok('10a 另存新檔在有資料時可以按', $('#btn-save').disabled === false);
    ok('10b 快照按得下去', $('#btn-snap').disabled === false || $('#btn-snap').disabled === undefined);

    } catch (err) {
      if (err && err.message === '__STOP__') return;
      R.push({ name: '🔴 probe 自己爆掉：' + (err && err.message), pass: false, extra: String(err && err.stack || '').slice(0, 200) });
    }
    if (ERRS.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: ERRS.slice(0, 3).join(' | ') });
    else R.push({ name: '頁面全程沒有未處理的例外', pass: true, extra: '' });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
