/* ═══════════════════════════════════════════════════════════════════════════
   i2c_timeline_diff_probe.js — 在**真實瀏覽器**裡驗兩件事（v1.20.2）

     (一) 耗時紀錄的**順序與分組**
          Bruce 2026-09-19：「應該是越早的紀錄在越下方…它的先寫再讀反而會變成
          先讀再寫」「同一次的操作，最好用一個框框把它們框起來」
     (二) 差異清單的**藍紅不得相同**
          Bruce 2026-09-19：「藍色跟紅色明明值是一樣的，為什麼也要列出來？」

   🔴 為什麼不能用 jsdom：要驗的是「**畫面上由上到下看起來是什麼**」——
      那是 DOM 的實際順序與框線結構，jsdom 驗資料流驗不到這一層。
      （這一支用 tools/ui_probe.sh 跑，結果寫進 document.title 由它取回。）

   🔴 這一支自己帶一個假的 I2C Bridge（MockWS ＋ 一塊假 EEPROM 記憶體），
      因為「寫入 ⇒ 自動回讀驗證」這條路一定要有裝置回話才走得完，
      而那正是 Bruce 抓到的那個情境。

   用法：tools/ui_probe.sh i2c.html tools/i2c_timeline_diff_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const ERRS = [];
  /* headless 沒有人能按 confirm ⇒ 自動答「是」，並記下問過幾次（被問到本身也是要驗的事）。 */
  let CONFIRMS = 0;
  window.confirm = function () { CONFIRMS++; return true; };
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));

  /* ═══ 假 I2C Bridge ══════════════════════════════════════════════════════
     🔴 一定要在頁面**自動連線（載入後 250ms）之前**換掉 window.WebSocket。
        這支 probe 是接在頁面後面的 <script>，parse 階段就會跑到這裡 ⇒ 來得及。
     一塊 {slave,addr} → byte 的假記憶體：rawwrite 寫進去、read 讀回來 ⇒
     「寫完回讀驗證」才走得完，而它正是要驗的情境。 */
  const MEM = new Map();
  const key = (s, a) => s * 0x100000 + a;
  /* 開起來 ⇒ 回讀故意回錯值，用來製造「寫入與回讀不一致」（驗 wrfail 標示仍在）。 */
  let CORRUPT = false;
  /* 黃金向量：讓連線後的自動自檢**通過**，不要在畫面上留紅色橫幅干擾截圖。
     值與頁面裡的 I2CT_GOLDEN.expect 一致（slave 0x68 / 0x0000 起 3 byte）。 */
  [0xA1, 0xD8, 0xFB].forEach((b, i) => MEM.set(key(0x68, i), b));
  class MockWS {
    constructor() {
      this.readyState = 0;
      setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0);
    }
    send(txt) {
      const m = JSON.parse(txt);
      let rep = { ok: true };
      if (m.type === 'ping') rep = { helper: '1.14.0', proto: 2, ok: true };
      else if (m.type === 'open') rep = { ok: true, channels: 1 };
      else if (m.type === 'rawwrite') {
        (m.data || []).forEach((b, i) => MEM.set(key(m.slave, m.addr + i), b & 0xFF));
        rep = { ok: true, us: 300 };
      } else if (m.type === 'read') {
        const d = [];
        for (let i = 0; i < m.len; i++) {
          const v = MEM.get(key(m.slave, m.addr + i));
          const b = (v === undefined) ? 0xFF : v;
          d.push(CORRUPT ? (b ^ 0xFF) : b);
        }
        /* usbrt:1 ⇒ 頁面的 i2ctPathOf() 判成「快速模式」（路徑欄才有字） */
        rep = { ok: true, data: d, us: 200, usbrt: 1 };
      }
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ id: m.id, type: 'result' }, rep)) });
      }, 0);
    }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  window.WebSocket = MockWS;

  /* 畫面上由上到下的實際文字（這就是 Bruce 看到的東西） */
  const rowsText = () => Array.from(document.querySelectorAll('#timeline .trow'))
    .map(r => r.textContent.replace(/\s+/g, ' ').trim());
  const kinds = () => Array.from(document.querySelectorAll('#timeline .trow'))
    .map(r => (r.querySelector('.tk') || {}).textContent || '?');
  /* 每一個框裡各有哪幾筆（沒有框的列不會出現在這裡） */
  const groups = () => Array.from(document.querySelectorAll('#timeline .tgrp'))
    .map(g => Array.from(g.querySelectorAll('.trow')).map(r => r.querySelector('.tk').textContent).join('+'));
  const diffText = () => Array.from(document.querySelectorAll('#diffrows .diffrow'))
    .map(r => r.textContent.replace(/\s+/g, ' ').trim());
  const diffPairs = () => Array.from(document.querySelectorAll('#diffrows .diffrow'))
    .map(r => [r.querySelector('.o').textContent, r.querySelector('.n').textContent]);

  (async function () {
    let A = null;
    for (let i = 0; i < 100 && !A; i++) { A = window.__i2ct; if (!A) await sleep(50); }
    if (!A) { document.title = 'UIPROBE' + JSON.stringify([{ name: '等不到 __i2ct', pass: false, extra: '' }]); return; }
    for (let i = 0; i < 100 && document.readyState !== 'complete'; i++) await sleep(50);
    for (let i = 0; i < 60 && !document.querySelector('#dump td'); i++) await sleep(50);
    const quiesce = async () => { for (let i = 0; i < 200 && A.state().busy; i++) await sleep(10); };
    await sleep(300);
    await quiesce();                       /* 自動連線 ＋ 連線後的自動自檢跑完 */

    try {
      A.eepromAuto('24C32');
      A.abPickAuto('auto');
      ok('前置：假 I2C Bridge 已連上（寫入才會走到回讀驗證）', A.state().linked === true,
         'linked=' + A.state().linked);

      /* ═══ 1. Bruce 的情境：寫入一個會觸發回讀驗證的 EEPROM 檔 ═══════════ */
      A._reset();
      A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '64' });
      A.loadFile('w1.bin', new Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 3) & 0xFF)));
      await sleep(120);
      A.clearTimes();
      await A.doWrite();
      await quiesce(); await sleep(150);
      const k1 = kinds(), t1 = rowsText(), g1 = groups();
      ok('1a 🔴 寫入＋回讀 ⇒ 清單由上到下是「讀」在上、「寫」在下（越下方越早）',
         k1.length === 2 && k1[0] === '讀' && k1[1] === '寫', k1.join(' / '));
      ok('1b 🔴 兩筆被框在同一組（一個 .tgrp 裡就是這兩筆）',
         g1.length === 1 && g1[0] === '讀+寫', JSON.stringify(g1));
      ok('1c 畫面實際文字（由上到下）', t1.length === 2, t1.join('  ⏐  '));

      /* ═══ 2. 單純按讀取（只有一筆）⇒ 不得出現孤立的框 ═══════════════════ */
      A.clearTimes();
      await A.doRead();
      await quiesce(); await sleep(150);
      ok('2a 單純讀取 ⇒ 清單只有一筆', kinds().length === 1 && kinds()[0] === '讀', kinds().join(' / '));
      ok('2b 🔴 只有一筆的操作不畫框（外觀與以前相同）',
         document.querySelectorAll('#timeline .tgrp').length === 0,
         '框數=' + document.querySelectorAll('#timeline .tgrp').length);

      /* ═══ 3. 連續兩次寫入 ⇒ 兩組要分得開，不可併成一組 ═══════════════════ */
      A.clearTimes();
      await A.doWrite(); await quiesce(); await sleep(60);
      await A.doWrite(); await quiesce(); await sleep(150);
      const g3 = groups();
      ok('3a 兩次寫入 ⇒ 兩個獨立的框，各框兩筆',
         g3.length === 2 && g3.every(x => x === '讀+寫'), JSON.stringify(g3));
      ok('3b 四筆的順序仍然是每組「讀」在上「寫」在下',
         kinds().join(',') === '讀,寫,讀,寫', kinds().join(','));

      /* ═══ 4.「比對」那組要在同一個框裡；5. quiet 讀取不得進清單 ══════════ */
      A.clearTimes();
      await A.comparePaths();
      await quiesce(); await sleep(150);
      const k4 = kinds(), g4 = groups();
      ok('4a 🔴 比對的三筆在同一個框裡',
         g4.length === 1 && g4[0].split('+').every(x => x === '比對') && g4[0].split('+').length >= 3,
         JSON.stringify(g4));
      ok('5a 🔴 內部用途（quiet）的讀取不出現在清單裡 —— 比對內部讀了 3 次，一筆「讀」都不該有',
         k4.every(x => x === '比對'), k4.join(' / '));

      /* ═══ 差異清單 ═══════════════════════════════════════════════════════
         狀態重現：A、B 都有內容 ⇒ 載入第三個檔並選「取代 A、保留 B」
         ⇒ 頁面自動切成顯示 A（i2ctShowA = true）⇒ 舊版的差異清單就壞在這裡。 */
      A._reset();
      A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
      const mk = (f) => new Uint8Array(Array.from({ length: 16 }, (_, i) => f(i)));
      A.loadFile('a.bin', mk(i => i)); await sleep(100);
      ok('D3 🔴 只有 A、沒有 B ⇒ 差異清單是空狀態（不是一堆相同值的列）',
         diffText().length === 0 && document.getElementById('diffcount').textContent === '0',
         '列數=' + diffText().length + ' count=' + document.getElementById('diffcount').textContent);

      A.loadFile('b.bin', mk(i => (i === 3 || i === 9) ? (i + 0x80) : i)); await sleep(120);
      const dB = diffText();
      A.abPickAuto('Akeep');
      A.loadFile('c.bin', mk(i => i)); await sleep(150);
      A.abPickAuto('auto');
      ok('D0 前置：確實進到「顯示 A」這個狀態（舊版就是在這裡壞掉）',
         A.showingA() === true, 'showingA=' + A.showingA());
      const pairs = diffPairs(), dA = diffText();
      ok('D1 🔴 顯示 A 時，差異清單**不得出現藍紅相同**的列',
         pairs.length > 0 && pairs.every(p => p[0] !== p[1]),
         '列數=' + pairs.length + '｜' + dA.join('  ⏐  '));

      A.showSide('B'); await sleep(100);
      const dB2 = diffText();
      A.showSide('A'); await sleep(100);
      const dA2 = diffText();
      ok('D2 🔴 差異清單是「A 對 B」這一對資料的屬性 ⇒ 顯示 A 與顯示 B 時內容完全相同',
         dA2.length > 0 && dA2.join('|') === dB2.join('|'),
         'A：' + dA2.join('  ⏐  ') + '　B：' + dB2.join('  ⏐  '));
      ok('D2b（參考）B 剛載入時的差異清單', dB.length >= 0, dB.join('  ⏐  '));

      /* ═══ 第 5 項：dump 取消「本次寫入過」與「已修改未寫入」兩種顏色 ═════════
         Bruce 2026-09-19：「把 dump 的顏色取消…基本上只要有跟快照不同的，
         我覺得就很 OK 了」。
         🔴 取消的是**顏色**不是狀態 ⇒ 底下同時驗「顏色不見了」與「行為還在」。 */
      const clsOf = (i) => {
        const td = document.querySelector('#dump td[data-idx="' + i + '"]');
        return td ? td.className : '(no td)';
      };
      const anyCls = (c) => document.querySelectorAll('#dump td.' + c).length;

      A.abPickAuto('auto'); A._reset();
      A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '16' });
      A.loadFile('base.bin', mk(i => i)); await sleep(150);   /* 這一份成為 A */
      await A.disconnect(); await sleep(80);                  /* 離線編輯才會留下 dirty */
      for (const [i, t] of [[0, 'AA'], [1, 'BB'], [2, 'CC']]) {
        A.beginEdit(i); A.typeInto(t); await A.commitEdit(); await sleep(40);
      }
      ok('5a 🔴 離線改 3 格 ⇒ 狀態仍在（dirtyCount ＝ 3、提醒文字照舊）',
         A.dirtyCount() === 3 && /已修改 3 byte 未寫入/.test(document.getElementById('dirtyline').textContent),
         'count=' + A.dirtyCount() + '｜' + document.getElementById('dirtyline').textContent);
      ok('5b 🔴 但格子上**沒有**「已修改未寫入」的顏色',
         anyCls('dirty') === 0, 'td.dirty 數=' + anyCls('dirty') + '｜第 0 格 class=' + clsOf(0));
      ok('5c 🔴 「與快照不同」的標示**仍然在**（他唯一要留的那個）',
         anyCls('diff') === 3, 'td.diff 數=' + anyCls('diff'));

      const c0 = CONFIRMS;
      await A.connect(); await quiesce(); await sleep(120);
      /* 🔴 只點一格**不算選取**（i2ctSelRange：a === b 回 null）⇒ 要選兩格，
         這樣寫入只會涵蓋 3 格 dirty 裡的 2 格，剩下那 1 格才會觸發提醒。 */
      A.selAnchor(0); A.selMove(1);                     /* 選 0..1 ⇒ 只寫 2 byte */
      await A.doWrite(); await quiesce(); await sleep(200);
      ok('5d 🔴 寫完之後「還有 N byte 改過但沒寫到」的提醒仍然出現（行為沒被誤刪）',
         /還有 1 byte 改過但沒寫到/.test(document.getElementById('readbanner').textContent),
         document.getElementById('readbanner').textContent.replace(/\s+/g, ' ').slice(0, 120));
      ok('5e 🔴 寫完之後格子上**沒有**「本次寫入過」的顏色',
         anyCls('wrote') === 0, 'td.wrote 數=' + anyCls('wrote') + '｜第 0 格 class=' + clsOf(0));

      A.selClear();
      await A.doRead(); await quiesce(); await sleep(200);
      ok('5f 🔴 讀取前的「會蓋掉未寫入修改」確認仍然會跳',
         CONFIRMS > c0, '本段 confirm 被問了 ' + (CONFIRMS - c0) + ' 次');

      /* wrfail：讓假裝置回讀故意回錯值 ⇒ 寫入與回讀不一致 */
      CORRUPT = true;
      A.selAnchor(0); A.selMove(1);
      await A.doWrite(); await quiesce(); await sleep(250);
      ok('5g 🔴 wrfail（寫入與回讀不一致）的紅底標示仍在 —— 沒有被一起清掉',
         anyCls('wrfail') >= 1, 'td.wrfail 數=' + anyCls('wrfail') + '｜第 0 格 class=' + clsOf(0));
      CORRUPT = false;

      /* 收尾：把畫面留在 Bruce 的情境（寫入＋回讀）方便截圖 */
      A.abPickAuto('auto'); A._reset();
      A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '64' });
      A.loadFile('w1.bin', new Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 7) & 0xFF)));
      await sleep(100);
      A.clearTimes();
      await A.doWrite(); await quiesce(); await sleep(200);
    } catch (err) {
      R.push({ name: '🔴 probe 自己爆掉：' + (err && err.message), pass: false,
               extra: String((err && err.stack) || '').slice(0, 200) });
    }
    if (ERRS.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: ERRS.slice(0, 3).join(' | ') });
    else R.push({ name: '頁面全程沒有未處理的例外', pass: true, extra: '' });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
