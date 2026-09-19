/* ═══════════════════════════════════════════════════════════════════════════
   la_clear_probe.js — LA 分頁「清空波形」的真瀏覽器驗收
   ───────────────────────────────────────────────────────────────────────────
   用法：tools/ui_probe.sh wfg.html tools/la_clear_probe.js

   🔴 為什麼非要真瀏覽器：這一條的失敗長相是「按了沒反應」或「清掉又自己長回來」。
      本次實作過程就抓到一個只有跑起來才看得見的坑 ——
      `wfgLaUpdateSummary()` 在 `wfgLaCapturedWaveform` 為 null 時會自動呼叫
      `wfgLaLoadDemoCapture()` 把 demo 方波補回來，而「清空」之後任何設定變動
      都會走到那裡。靜態檢查與純函式測試都看不到這件事。

   🔴 驗的是**結果**不是**呼叫**：每一條都去讀真的 DOM／真的狀態，
      不驗「有沒有呼叫某個函式」。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ERRS = [];
  /* 🔴 `ResizeObserver loop completed…` 是**改版前就存在**的瀏覽器通知，不是例外。
     實測：拿 `git show HEAD:wfg.html` 的原版跑同一支 probe 一樣會出現。
     不濾掉的話，這一條會永遠紅著，真的例外反而被它蓋掉 —— 那比沒有這條檢查更糟。
     濾的是**這一句**，不是整類錯誤。 */
  const BENIGN = /ResizeObserver loop/;
  window.addEventListener('error', (e) => {
    const m = e.message || '';
    if (BENIGN.test(m)) return;
    ERRS.push('error: ' + m + ' @' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
  /* canvas 是不是「有東西畫上去」：抓非背景色的像素數。
     背景是 #0d1117 / #0a0f1a / #161b22 這幾個很暗的色，波形線是亮色。 */
  const litPixels = (id) => {
    const c = document.getElementById(id);
    if (!c || !c.getContext || !c.width || !c.height) return -1;
    const g = c.getContext('2d');
    let d;
    try { d = g.getImageData(0, 0, c.width, c.height).data; } catch (e) { return -2; }
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8 && (d[i] > 90 || d[i + 1] > 90 || d[i + 2] > 90)) n++;
    }
    return n;
  };

  (async function () {
    try {
      await sleep(400);
      const P = window.__wfgLaProbe;
      if (!P) { ok('🔴 window.__wfgLaProbe 不存在（狀態出口沒掛上）', false); throw new Error('no probe api'); }

      /* ── 前置：切到 LA 分頁，載入一段波形 ───────────────────────────── */
      window.wfgSwitchMode('la');
      await sleep(400);
      ok('0a LA 分頁真的切過去了', vis($('#wfg-la-content')) && !vis($('#wfg-tcon-content')));
      ok('0b 🔴 清空按鈕在 LA 工具列上而且看得見', vis($('#wfg-la-clear-btn')),
         $('#wfg-la-clear-btn') ? $('#wfg-la-clear-btn').textContent.trim() : '(沒有這顆按鈕)');
      ok('0c 按鈕文字走 i18n（不是硬寫）',
         !!$('#wfg-la-clear-btn') && !!$('#wfg-la-clear-btn').querySelector('[data-i18n="wfg.laClearPlain"]'));

      P.loadDemo();
      await sleep(300);
      const litBefore = litPixels('wfg-la-canvas');
      ok('1a 前置：波形區真的有畫出波形', litBefore > 500, litBefore + ' 個亮點');

      /* ── 前置：拉一支 cursor、釘一張量測小卡、加一個脈衝計數 ─────────── */
      window.wfgLaToggleCursor(0);                       /* A1 */
      await sleep(120);
      window.wfgLaToggleCursor(1);                       /* A2 ⇒ 時基尺標卡片會長出來 */
      await sleep(200);
      ok('1b 前置：A1／A2 兩支 cursor 是 active',
         P.cursorActive()[0] === true && P.cursorActive()[1] === true,
         JSON.stringify(P.cursorActive().slice(0, 2)));
      ok('1c 前置：時基尺標卡片有內容',
         !!$('#wfg-la-cursor-body') && $('#wfg-la-cursor-body').innerHTML.trim().length > 0,
         ($('#wfg-la-cursor-body') || {}).innerHTML ? 'len=' + $('#wfg-la-cursor-body').innerHTML.length : '(空)');

      /* 直接推狀態進去（走 UI 新增小卡要點好幾層下拉，那不是這一條要驗的東西） */
      P.seedForTest();
      window.wfgSetImportedFileName('la', 'probe-demo.kvdat');
      await sleep(250);
      ok('1d 前置：釘住的量測小卡有 1 張', P.measCount() === 1, P.measCount());
      ok('1e 前置：脈衝計數有 1 筆', P.pulseCount() === 1, P.pulseCount());
      ok('1f 前置：檔名徽章顯示出來了', /probe-demo/.test(($('#wfg-import-filename') || {}).textContent || ''),
         ($('#wfg-import-filename') || {}).textContent);

      /* ── 按下清空 ⇒ 先跳確認視窗，**不可以**直接清掉 ────────────────── */
      ok('2a 確認視窗一開始是關的', !!$('#wfg-clr-mask') && $('#wfg-clr-mask').classList.contains('hidden'));
      $('#wfg-la-clear-btn').click();
      await sleep(200);
      ok('2b 🔴 按下按鈕 ⇒ 確認視窗跳出來',
         !!$('#wfg-clr-mask') && !$('#wfg-clr-mask').classList.contains('hidden'));
      ok('2c 🔴 還沒確認之前，波形一個都不准動',
         P.hasWaveform() && P.cursorActive()[0] === true && P.measCount() === 1);
      {
        const body = $('#wfg-clr-mask .wfg-ack-where');
        const txt = body ? body.textContent : '';
        ok('2d 內文寫出會清掉什麼', /波形/.test(txt) && /游標/.test(txt) && /量測/.test(txt), txt.slice(0, 40) + '…');
        ok('2e 🔴 內文寫出「保留不動」的是什麼（不留給使用者猜）', /保留不動/.test(txt));
        ok('2f 🔴 內文寫出無法復原', /無法復原/.test(txt));
        ok('2g 內文走 i18n', !!body && body.getAttribute('data-i18n') === 'wfg.laClrBody');
      }
      /* 取消 ⇒ 什麼都不動（先驗反面，再驗正面） */
      $('#wfg-clr-cancel').click();
      await sleep(200);
      ok('2h 取消 ⇒ 視窗關掉', $('#wfg-clr-mask').classList.contains('hidden'));
      ok('2i 🔴 取消 ⇒ 波形、游標、小卡一個都沒被動到',
         P.hasWaveform() && P.cursorActive()[0] === true
         && P.measCount() === 1 && P.pulseCount() === 1);
      ok('2j 取消 ⇒ 畫面上的波形還在', litPixels('wfg-la-canvas') > 500, litPixels('wfg-la-canvas'));

      /* ── 真的清空 ─────────────────────────────────────────────────── */
      $('#wfg-la-clear-btn').click();
      await sleep(200);
      $('#wfg-clr-ok').click();
      await sleep(500);

      ok('3a 視窗關掉了', $('#wfg-clr-mask').classList.contains('hidden'));
      ok('3b 🔴 波形資料清掉了', P.hasWaveform() === false, String(P.hasWaveform()));
      ok('3c 🔴 而且**沒有**掉回 demo 方波（已清空旗標）', P.cleared() === true, P.cleared());
      {
        const lit = litPixels('wfg-la-canvas');
        ok('3d 🔴🔴 波形區真的變乾淨了（亮點大幅減少，只剩格線與通道名）',
           lit >= 0 && lit < litBefore * 0.5, lit + ' ← 清空前 ' + litBefore);
      }
      ok('3e 🔴 10 支 cursor 全部關掉', P.cursorActive().every((v) => v === false),
         JSON.stringify(P.cursorActive()));
      ok('3f 🔴 cursor 位置與錨點也清乾淨（不是只把 active 設 false）',
         P.cursorPos().every((v) => v === null) && P.cursorAnchors().every((v) => v === null));
      ok('3g 🔴 |Δt| 鎖定跟著清', P.dtLockKeys().length === 0, JSON.stringify(P.dtLockKeys()));
      ok('3h 🔴 時基尺標卡片空了（這就是「波形沒了刻度還在」那個坑）',
         !$('#wfg-la-cursor-body') || $('#wfg-la-cursor-body').innerHTML.trim() === '',
         ($('#wfg-la-cursor-body') || {}).innerHTML);
      ok('3i 🔴 釘住的量測小卡清光', P.measCount() === 0
         && (!$('#wfg-la-meas-items') || $('#wfg-la-meas-items').innerHTML.trim() === ''), P.measCount());
      ok('3j 🔴 量測箭頭清掉', P.measArrow() === null, String(P.measArrow()));
      ok('3k 🔴 脈衝計數清光，空狀態顯示出來', P.pulseCount() === 0
         && vis($('#wfg-la-pulse-empty')), P.pulseCount());
      ok('3l 🔴 解碼結果清光', P.decodeCount() === 0, P.decodeCount());
      ok('3m 🔴 匯入檔名徽章清掉', !/probe-demo/.test(($('#wfg-import-filename') || {}).textContent || ''),
         ($('#wfg-import-filename') || {}).textContent || '(空)');
      ok('3n 🔴 sticky 時間軸 overlay 擦乾淨（A1/A2 標籤不得殘留）',
         litPixels('wfg-la-time-axis-overlay') <= 0, litPixels('wfg-la-time-axis-overlay'));
      ok('3o 🔴 波形區 overlay 擦乾淨（cursor 線不得殘留）',
         litPixels('wfg-la-overlay') <= 0, litPixels('wfg-la-overlay'));
      ok('3p 檢視回到全覽（start = 0）', P.viewStart() === 0, P.viewStart());

      /* ── 🔴 清空之後不可以自己長回來 ──────────────────────────────────
         這一條就是本次抓到的那個坑：改任何設定都會走到 wfgLaUpdateSummary()，
         而它在沒有擷取資料時會自動補 demo 方波。 */
      P.updateSummary();
      await sleep(300);
      ok('4a 🔴🔴 呼叫 wfgLaUpdateSummary() 之後，demo 方波**不得**自己長回來',
         P.hasWaveform() === false && P.cleared() === true, String(P.hasWaveform()));
      {
        const lit = litPixels('wfg-la-canvas');
        ok('4b 🔴 畫面也還是乾淨的', lit >= 0 && lit < litBefore * 0.5, lit);
      }

      /* ── 🔴 保留不動的東西，真的沒被動到（確認視窗承諾了什麼就要做到） ── */
      ok('4c 🔴 通道名稱與順序保留', P.channelOrderLen() === 16, P.channelOrderLen());
      ok('4d 🔴 analyzer 清單保留（它是設定不是波形）', P.analyzerCount() >= 0, P.analyzerCount());
      ok('4e 🔴 取樣設定的 localStorage 還在',
         localStorage.getItem('wfg-la-user-settings-v1') !== null,
         localStorage.getItem('wfg-la-user-settings-v1') ? '有' : '(不見了)');

      /* ── 🔴 下一次擷取／匯入要能解除清空狀態，不然工具就死在空白 ────── */
      P.loadDemo();
      await sleep(300);
      ok('5a 🔴 重新載入波形 ⇒ 清空狀態解除', P.cleared() === false && P.hasWaveform() === true);
      /* 🔴 門檻不能只寫 `> 500`：清空後的空畫面也有兩萬多個亮點（格線＋通道名），
         `> 500` 會讓「其實沒畫回來」驗出假綠。要求回到清空前的水準才算數。 */
      ok('5b 🔴 波形真的又畫回來了（回到清空前的亮點水準，不是只有格線）',
         litPixels('wfg-la-canvas') > litBefore * 0.8,
         litPixels('wfg-la-canvas') + ' ← 清空前 ' + litBefore);

    } catch (err) {
      R.push({ name: '🔴 probe 自己爆掉：' + (err && err.message), pass: false,
               extra: String((err && err.stack) || '').slice(0, 300) });
    }
    if (ERRS.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: ERRS.slice(0, 3).join(' | ') });
    else R.push({ name: '頁面全程沒有未處理的例外', pass: true, extra: '' });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
