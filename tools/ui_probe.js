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
    /* ── 路徑 12：🔴 A／B 兩狀態（Bruce 2026-09-19 第三次定義，逐條照走）──────
       A ＝ 快照值（恆定）、B ＝ 改變後的值（隨修改更新）。
       狀態 1：主值 B、左上 A、右上空 ｜ 狀態 2：主值 A、左上空、右上 B。
       **左上與右上絕不同時出現。** */
    {
      const P = (i) => A.cellParts(i);
      const both = (i) => { const p = P(i); return !!(p && p.snap !== null && p.old !== null); };
      A._reset();
      A.loadFile('ab.bin', new Uint8Array(Array.from({ length: 64 }, () => 0x11)));
      await sleep(80);
      A.snapshot(); await sleep(40);
      ok('12-1 快照（值 A=11）⇒ 兩角都空', P(2) && P(2).snap === null && P(2).old === null, JSON.stringify(P(2)));
      /* 改成 B = 0x22 */
      click(cellAt(2)); await sleep(60);
      let e = document.querySelector('#dump td.edit input');
      if (e) { e.value = '22'; e.dispatchEvent(new Event('input', { bubbles: true })); key(e, 'Enter'); await sleep(90); }
      ok('12-2 改成 B=22 ⇒ 主值 22、左上 11、右上空',
         P(2).main === '22' && P(2).snap === '11' && P(2).old === null, JSON.stringify(P(2)));
      /* 點左上 ⇒ 狀態 2 */
      A.slotClick(2, 'sv'); await sleep(50);
      ok('12-3 點左上 ⇒ 主值 11、左上空、右上 22',
         P(2).main === '11' && P(2).snap === null && P(2).old === '22', JSON.stringify(P(2)));
      /* 點右上 ⇒ 回狀態 1 */
      A.slotClick(2, 'ov'); await sleep(50);
      ok('12-4 點右上 ⇒ 主值 22、左上 11、右上空',
         P(2).main === '22' && P(2).snap === '11' && P(2).old === null, JSON.stringify(P(2)));
      /* 來回 10 次，每次都檢查兩角不同時有值 */
      let loopOk = true, everBoth = false;
      for (let i = 0; i < 10; i++) {
        A.slotClick(2, 'sv');
        if (both(2)) everBoth = true;
        if (!(P(2).main === '11' && P(2).snap === null && P(2).old === '22')) { loopOk = false; break; }
        A.slotClick(2, 'ov');
        if (both(2)) everBoth = true;
        if (!(P(2).main === '22' && P(2).snap === '11' && P(2).old === null)) { loopOk = false; break; }
      }
      await sleep(40);
      ok('12-5a 來回 10 次每次狀態都正確', loopOk, JSON.stringify(P(2)));
      ok('12-5b 🔴 全程沒有任何一刻兩角同時有值', !everBoth);
      /* 在狀態 2（主值 A）再改成 C ⇒ A 不變、C 成為新的 B、回狀態 1 */
      A.slotClick(2, 'sv'); await sleep(50);
      ok('12-6a 前置：先回到狀態 2（主值＝A）', P(2).main === '11', P(2).main);
      click(cellAt(2)); await sleep(60);
      e = document.querySelector('#dump td.edit input');
      if (e) { e.value = '33'; e.dispatchEvent(new Event('input', { bubbles: true })); key(e, 'Enter'); await sleep(90); }
      ok('12-6b 改成 C=33 ⇒ 主值 33、左上仍是 A=11、右上空',
         P(2).main === '33' && P(2).snap === '11' && P(2).old === null, JSON.stringify(P(2)));
      ok('12-6c 🔴 A 沒有變（只有重新快照才會變）', A.refBytesAt(2) === 0x11, A.refBytesAt(2));
      /* 重新快照 ⇒ A 更新成當前值、兩角清空 */
      A.snapshot(); await sleep(50);
      ok('12-7a 重新快照 ⇒ A 更新成 33', A.refBytesAt(2) === 0x33, A.refBytesAt(2));
      ok('12-7b 重新快照 ⇒ 兩角都空', P(2).snap === null && P(2).old === null, JSON.stringify(P(2)));
      /* A 與 B 相等 ⇒ 兩角都空 */
      click(cellAt(2)); await sleep(60);
      e = document.querySelector('#dump td.edit input');
      if (e) { e.value = '33'; e.dispatchEvent(new Event('input', { bubbles: true })); key(e, 'Enter'); await sleep(90); }
      ok('12-8 A 與 B 相等 ⇒ 兩角都空', P(2).snap === null && P(2).old === null, JSON.stringify(P(2)));
      /* 整張表：任何時刻都不該有格子兩角同時有值 */
      let anyBoth = 0;
      document.querySelectorAll('#dump td[data-idx]').forEach((td) => {
        if (td.querySelector('.sv') && td.querySelector('.ov')) anyBoth++;
      });
      ok('12-9 🔴 整張表沒有任何一格兩角同時有值', anyBoth === 0, anyBoth);
    }

    /* ── 路徑 11：🔴 三槽走「手動改值」這條路（Bruce 2026-09-19 實測壞掉）──────
       他的操作順序：已中斷 → 讀 256 byte → 按快照 → 改值 →
       期望「左上出現快照值」，實際兩個角落都沒有。
       根因：`i2ctRef = d` 存的是同一個 Uint8Array，就地改值連快照一起改掉。 */
    A._reset();
    A.loadFile('snap.bin', new Uint8Array(Array.from({ length: 256 }, (_, i) => i & 0xFF)));
    await sleep(80);
    A.snapshot();
    await sleep(40);
    ok('11a 前置：按下快照', A.refBytesAt(0x10) === 0x10, A.refBytesAt(0x10));
    /* 改值 */
    click(cellAt(0x10)); await sleep(60);
    let ed = document.querySelector('#dump td.edit input');
    if (ed) {
      ed.value = '99'; ed.dispatchEvent(new Event('input', { bubbles: true }));
      key(ed, 'Enter'); await sleep(90);
    }
    ok('11b 值改成 0x99', A.curSet().bytes[0x10] === 0x99, A.curSet().bytes[0x10]);
    ok('11c 🔴 快照沒有被一起改掉（alias bug 的核心）', A.refBytesAt(0x10) === 0x10, A.refBytesAt(0x10));
    let parts = A.cellParts(0x10);
    ok('11d 🔴 左上出現快照值 10', parts && parts.snap === '10', JSON.stringify(parts));
    ok('11e 🔴 右上此時是空的（狀態 A）', parts && parts.old === null, parts && parts.old);
    /* 點左上 ⇒ 狀態 B */
    A.slotClick(0x10, 'sv'); await sleep(50);
    parts = A.cellParts(0x10);
    ok('11f 點左上 ⇒ 主值變快照值 10', parts && parts.main === '10', parts && parts.main);
    ok('11g 點左上 ⇒ 右上出現剛才改的 99', parts && parts.old === '99', parts && parts.old);
    /* 點右上 ⇒ 回到狀態 A */
    A.slotClick(0x10, 'ov'); await sleep(50);
    parts = A.cellParts(0x10);
    ok('11h 點右上 ⇒ 主值回 99', parts && parts.main === '99', parts && parts.main);
    ok('11i 點右上 ⇒ 左上又是快照值 10', parts && parts.snap === '10', parts && parts.snap);
    ok('11j 點右上 ⇒ 右上清空', parts && parts.old === null, parts && parts.old);
    /* 🔴 連續來回 10 次都不能壞 */
    let okLoop = true;
    for (let i = 0; i < 10; i++) {
      A.slotClick(0x10, 'sv');
      if (A.curSet().bytes[0x10] !== 0x10) { okLoop = false; break; }
      A.slotClick(0x10, 'ov');
      if (A.curSet().bytes[0x10] !== 0x99) { okLoop = false; break; }
    }
    await sleep(40);
    ok('11k 🔴 來回 10 次兩個值都沒遺失', okLoop && A.curSet().bytes[0x10] === 0x99 && A.refBytesAt(0x10) === 0x10,
       'cur=' + A.curSet().bytes[0x10] + ' ref=' + A.refBytesAt(0x10));
    /* 🔴 「沒按過快照就改值」其實不會發生：載入檔案與讀取都會**自動建立基準**
       （i2ctIngest 在不可比時就把當下這份當基準）。所以左上一定有東西可比，
       他不必先按快照也能還原。（我一度以為要靠右上補位，實測是我想錯了 ——
       程式的行為比我設計的更好，測試改成釘住真實行為。） */
    A._reset();
    A.loadFile('nosnap.bin', new Uint8Array([0x11, 0x22, 0x33, 0x44]));
    await sleep(70);
    click(cellAt(1)); await sleep(50);
    ed = document.querySelector('#dump td.edit input');
    if (ed) { ed.value = 'EE'; ed.dispatchEvent(new Event('input', { bubbles: true })); key(ed, 'Enter'); await sleep(80); }
    parts = A.cellParts(1);
    ok('11l 沒按快照就改值 ⇒ 載入時的自動基準讓左上仍然顯示原值 22',
       parts && parts.snap === '22' && parts.main === 'EE', JSON.stringify(parts));
    A.slotClick(1, 'sv'); await sleep(40);
    ok('11m 點左上 ⇒ 還原成 22', A.curSet().bytes[1] === 0x22, A.curSet().bytes[1]);
    ok('11n 而且剛改的 EE 進了右上，可以再換回去', A.cellParts(1).old === 'EE', A.cellParts(1).old);

    /* ── 路徑 9e：列標與欄標的 highlight 要一致（Bruce：「垂直最上方沒有一併亮」）── */
    A._reset();
    A.loadFile('hdr.bin', new Uint8Array(256));
    await sleep(80);
    click(cellAt(0x35)); await sleep(70);
    {
      const rowHead = document.querySelectorAll('#dump tr')[4].querySelector('th.rh');
      const colHead = document.querySelectorAll('#dump tr')[0].querySelectorAll('th')[6];
      const cs = (el) => el ? getComputedStyle(el).boxShadow : '(null)';
      ok('9e 列標（最左）有 highlight', /rgb/.test(cs(rowHead)), cs(rowHead).slice(0, 40));
      ok('9f 欄標（最上）有 highlight', /rgb/.test(cs(colHead)), cs(colHead).slice(0, 40));
      ok('9g 🔴 兩者的底色疊層完全相同', cs(rowHead) === cs(colHead),
         'row=' + cs(rowHead).slice(0, 30) + ' col=' + cs(colHead).slice(0, 30));
      /* 🔴 他看到的差別其實是**文字顏色**：原本只有列標會轉亮藍。 */
      const col = (el) => el ? getComputedStyle(el).color : '(null)';
      ok('9g2 🔴 兩者的文字顏色也相同（他看到的差別在這裡）', col(rowHead) === col(colHead),
         'row=' + col(rowHead) + ' col=' + col(colHead));
      const corner = document.querySelector('#dump th.corner');
      ok('9g3 左上角那格刻意不亮（它是位址輸入框）',
         getComputedStyle(corner).boxShadow === 'none', getComputedStyle(corner).boxShadow.slice(0, 24));
      ok('9h 列標真的是那一列（0x0030）', (rowHead && rowHead.textContent) === '0x0030', rowHead && rowHead.textContent);
      ok('9i 欄標真的是那一欄（+5）', (colHead && colHead.textContent) === '+5', colHead && colHead.textContent);
      /* 換一格 ⇒ 舊的熄滅 */
      click(cellAt(0x02)); await sleep(70);
      const oldRow = document.querySelectorAll('#dump tr')[4].querySelector('th.rh');
      ok('9j 換一格 ⇒ 舊的列標熄滅', !/rgb\(56/.test(getComputedStyle(oldRow).boxShadow),
         getComputedStyle(oldRow).boxShadow.slice(0, 30));
      /* 方向鍵移動 ⇒ 標頭跟著走 */
      key(document.activeElement, 'ArrowDown'); await sleep(80);
      const r2 = document.querySelectorAll('#dump tr')[2].querySelector('th.rh');
      ok('9k 方向鍵移動 ⇒ 標頭跟著移動', /rgb/.test(getComputedStyle(r2).boxShadow), r2 && r2.textContent);
    }

    /* ── 🔴 路徑 13：搜尋（v1.15.0）—— 真的按畫面上的按鈕，不呼叫內部函式 ──
       jsdom 那邊驗的是邏輯；這裡驗的是「他點下去會發生什麼」。 */
    A._reset();
    {
      const b = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) b[i] = (i * 7) & 0xFF;
      [0x0005, 0x0123].forEach((p) => { b[p] = 0x61; b[p + 1] = 0x41; b[p + 2] = 0xB4; });
      A.loadFile('find.bin', b);
      await sleep(80);
      const fi = $('#in-find');
      fi.value = '61 41 B4';
      fi.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);
      ok('13a 打字就開始找，並顯示第幾筆／共幾筆', $('#findinfo').textContent === '1 / 2',
         $('#findinfo').textContent);
      ok('13b 有命中時上下鍵可以按', $('#btn-find-next').disabled === false);
      click($('#btn-find-next')); await sleep(80);
      ok('13c 按「下」跳到下一筆並自動翻頁', A.pageIdx() === 1, 'page=' + A.pageIdx());
      ok('13d 用既有的十字標示命中位置', document.querySelectorAll('#dump td.xc').length === 1,
         document.querySelectorAll('#dump td.xc').length);
      click($('#btn-find-next')); await sleep(80);
      ok('13e 在最後一筆按「下」⇒ 循環回第一筆', A.pageIdx() === 0 && A.findState().at === 0,
         'page=' + A.pageIdx() + ' at=' + A.findState().at);
      click($('#btn-find-prev')); await sleep(80);
      ok('13f 在第一筆按「上」⇒ 循環到最後一筆', A.findState().at === 1, A.findState().at);
      fi.value = 'DE AD'; fi.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60);
      ok('13g 找不到就講一句', $('#findinfo').textContent === '找不到', $('#findinfo').textContent);
    }

    /* ── 🔴 路徑 14：bit7–bit0 核取方塊（v1.15.0）─────────────────────────
       🔴 這條路徑只有真實瀏覽器驗得到：點格子會進入編輯狀態（輸入框拿到焦點），
          接著點右邊的核取方塊會先觸發輸入框的 blur ⇒ commit ⇒ 整張表重繪。
          「重繪把後續事件吃掉」正是 2026-09-19 那個 dblclick 失效的老問題。 */
    A._reset();
    A.loadFile('bits.bin', new Uint8Array([0x00, 0xA5, 0xFF, 0x10]));
    await sleep(80);
    {
      ok('14a 還沒點任何格 ⇒ 位元區是空狀態', A.bitsEmpty() === true);
      click(cellAt(1)); await sleep(80);          /* 0xA5，同時會進入編輯狀態 */
      ok('14b 點一格之後位元區出現八個核取方塊',
         A.bits() && A.bits().length === 8, JSON.stringify(A.bits()));
      ok('14c 0xA5 ⇒ b7..b0 = 1,0,1,0,0,1,0,1',
         JSON.stringify(A.bits()) === JSON.stringify([true, false, true, false, false, true, false, true]),
         JSON.stringify(A.bits()));
      /* 🔴 直接**點畫面上的核取方塊**（此時該格正處於編輯狀態） */
      const cb = document.querySelector('#bitgrid input[data-bit="1"]');
      cb.click(); await sleep(120);
      ok('14d 勾 b1 ⇒ 那一格真的變成 0xA7（編輯狀態下點也要生效）',
         A.curSet().bytes[1] === 0xA7, A.curSet().bytes[1]);
      ok('14e dump 上那一格的顯示也跟著變', /A7/.test(cellAt(1).textContent), cellAt(1).textContent.trim());
      ok('14f 核取方塊自己也同步了',
         JSON.stringify(A.bits()) === JSON.stringify([true, false, true, false, false, true, true, true]),
         JSON.stringify(A.bits()));
      ok('14g 走的是與手動改格同一條提交路徑（dirty 標記有上）', A.dirtyAt(1) === true);
      click(cellAt(2)); await sleep(80);
      ok('14h 換一格 ⇒ 位元區跟著換（0xFF ⇒ 八個都勾）',
         JSON.stringify(A.bits()) === JSON.stringify([true, true, true, true, true, true, true, true]),
         JSON.stringify(A.bits()));
    }

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
