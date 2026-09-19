/* ═══════════════════════════════════════════════════════════════════════════
   wfg_clear_ask_probe.js — v4.53.0「四個清除入口共用同一套確認視窗」的真瀏覽器驗收
   ───────────────────────────────────────────────────────────────────────────
   用法：tools/ui_probe.sh wfg.html tools/wfg_clear_ask_probe.js

   驗的四個入口：
     ① WFG 工具列「清除」        #wfg-clear-btn        → wfgClrShow()
     ② LA 工具列「清空」          #wfg-la-clear-btn     → wfgLaClrShow()
     ③ WFG 下拉切回 placeholder   #wfg-preset-select    → wfgLoadPresetFromSelect()
     ④ LA 下拉切回 placeholder    #wfg-la-quick-preset  → wfgLaQuickPresetChanged()

   🔴 為什麼非要真瀏覽器：這一條的失敗長相是「視窗沒跳就直接清掉」與「清掉又自己
      長回來」。兩者在 jsdom 與純函式測試裡都看不見（前者要真的 change 事件與
      真的 DOM class，後者要 canvas 與 render 真的跑過）。

   🔴 驗的是**結果**不是**呼叫**：設定值逐項 dump 字串比對、波形資料與旗標直接讀。
      唯一用到 `Function.prototype.toString()` 的是「四個入口指向同一支實作」那一組，
      那一條要驗的本來就是程式碼結構（Bruce 明講「用程式碼結構證明」）。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ERRS = [];
  /* `ResizeObserver loop…` 是改版前就存在的瀏覽器通知，不是例外（同 la_clear_probe.js）。 */
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
  const shown = (sel) => !!$(sel) && !$(sel).classList.contains('hidden');
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

  /* 🔴 「設定一個欄位都沒變」只能逐項 dump 比對 —— 抽樣看兩三個欄位會漏。
     取的是**使用者看得到的**那一層（左側面板與工具列裡每一個 input/select 的值），
     不是內部變數：視窗開著時內部變數沒動但畫面被改過，一樣是 bug。 */
  const dumpTcon = () => {
    const out = [];
    document.querySelectorAll('#wfg-tcon-content input, #wfg-tcon-content select').forEach((el) => {
      /* 🔴 排除下拉本身：它的值就是使用者正在操作的那個控制項，本來就會變
         （「取消要轉回原值」這件事由 1h／2b 另外驗，不混在「設定有沒有被動到」裡）。 */
      if (el.id === 'wfg-preset-select') return;
      const id = el.id || (el.name || '') + '@' + (el.getAttribute('data-k') || '');
      const v = (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : String(el.value);
      out.push(id + '=' + v);
    });
    return out.join('\n');
  };
  /* 兩份 dump 的前幾筆差異 —— 只說「不同」找不到原因，要把是哪幾個欄位印出來。 */
  const diffOf = (a, b) => {
    if (a === b) return '逐項相同';
    const A = a.split('\n'), B = b.split('\n'), d = [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      if (A[i] !== B[i]) d.push((A[i] || '(缺)') + ' ⇄ ' + (B[i] || '(缺)'));
      if (d.length >= 4) break;
    }
    return d.length ? d.join(' | ') : ('欄位數不同 ' + A.length + '/' + B.length);
  };

  /* 用真的 UI 路徑套一組 preset：focus（記舊值）→ change → 五類選擇視窗按「匯入」。 */
  const loadPresetViaUi = async (key) => {
    const sel = $('#wfg-preset-select');
    sel.dispatchEvent(new Event('focus'));
    sel.value = key;
    sel.dispatchEvent(new Event('change'));
    await sleep(250);
    if (shown('#wfg-imps-mask')) { $('#wfg-imps-ok').click(); await sleep(600); }
  };
  /* 把下拉轉回 placeholder 的真實操作序列（先 focus 再 change，與真人相同）。 */
  const pickPlaceholder = async (selId) => {
    const sel = document.querySelector(selId);
    sel.dispatchEvent(new Event('focus'));
    sel.value = '';
    sel.dispatchEvent(new Event('change'));
    await sleep(250);
  };

  (async function () {
    try {
      await sleep(500);

      /* ══ ④ 結構：四個入口是不是同一支實作 ═══════════════════════════════ */
      ok('0a 共用實作存在（wfgClrAskShow/Cancel/Confirm）',
         typeof window.wfgClrAskShow === 'function' && typeof window.wfgClrAskCancel === 'function'
         && typeof window.wfgClrAskConfirm === 'function');
      {
        const srcs = {
          'WFG 清除鈕 wfgClrShow': window.wfgClrShow,
          'LA 清空鈕 wfgLaClrShow': window.wfgLaClrShow,
          'WFG 切回 placeholder wfgLoadPresetFromSelect': window.wfgLoadPresetFromSelect,
          'LA 切回 placeholder wfgLaQuickPresetChanged': window.wfgLaQuickPresetChanged
        };
        Object.keys(srcs).forEach((k) => {
          const f = srcs[k];
          ok('0b 入口「' + k + '」走共用實作', typeof f === 'function' && /wfgClrAskShow\(/.test(String(f)),
             typeof f === 'function' ? String(f).slice(0, 60).replace(/\n/g, ' ') : '(沒有這支函式)');
        });
      }
      ok('0c 🔴 確認視窗的 DOM 只有一份（v4.48.0 的第二份已併入）',
         document.querySelectorAll('[id$="clr-mask"]').length === 1,
         Array.from(document.querySelectorAll('[id$="clr-mask"]')).map((e) => e.id).join(',') || '(一份都沒有)');
      ok('0d 視窗的兩顆按鈕呼叫的是共用實作',
         ($('#wfg-clr-ok').getAttribute('onclick') || '').indexOf('wfgClrAskConfirm') === 0
         && ($('#wfg-clr-cancel').getAttribute('onclick') || '').indexOf('wfgClrAskCancel') === 0,
         $('#wfg-clr-ok').getAttribute('onclick') + ' / ' + $('#wfg-clr-cancel').getAttribute('onclick'));

      /* ══ ① / ③ WFG 側 ═══════════════════════════════════════════════════ */
      const KEY = 'fhd_60hz_sg_ls_dual_cpv';
      await loadPresetViaUi(KEY);
      ok('1a 前置：真的套進一組設定了（下拉停在該 preset）', $('#wfg-preset-select').value === KEY,
         $('#wfg-preset-select').value);
      const dumpLoaded = dumpTcon();
      ok('1b 前置：dump 抓到足夠多的欄位（不是空的）', dumpLoaded.split('\n').length > 40,
         dumpLoaded.split('\n').length + ' 個欄位');

      await pickPlaceholder('#wfg-preset-select');
      ok('1c 🔴 切回「快捷設定」⇒ 確認視窗跳出來（v4.52.0 以前是直接清掉）',
         shown('#wfg-clr-mask'));
      ok('1d 🔴 還沒確認之前，設定一個欄位都沒變（逐項 dump 比對）',
         dumpTcon() === dumpLoaded, diffOf(dumpLoaded, dumpTcon()));
      ok('1e 文案用的是「清除全部設定」那一組 key（與清除鈕同一個動作 ⇒ 同一份字）',
         $('#wfg-clr-title').getAttribute('data-i18n') === 'wfg.clrTitle'
         && $('#wfg-clr-body').getAttribute('data-i18n') === 'wfg.clrBody',
         $('#wfg-clr-title').getAttribute('data-i18n') + ' / ' + $('#wfg-clr-body').getAttribute('data-i18n'));
      {
        const txt = $('#wfg-clr-body').textContent || '';
        ok('1f 內文寫出會清掉什麼、回到什麼、能不能復原',
           /清空|清除/.test(txt) && /回到/.test(txt) && /無法復原/.test(txt), txt.slice(0, 36) + '…');
      }
      $('#wfg-clr-cancel').click();
      await sleep(250);
      ok('1g 取消 ⇒ 視窗關掉', !shown('#wfg-clr-mask'));
      ok('1h 🔴 取消 ⇒ 下拉轉回原本的 preset', $('#wfg-preset-select').value === KEY,
         $('#wfg-preset-select').value);
      ok('1i 🔴 取消 ⇒ 設定逐項與取消前相同', dumpTcon() === dumpLoaded,
         diffOf(dumpLoaded, dumpTcon()));

      await pickPlaceholder('#wfg-preset-select');
      $('#wfg-clr-ok').click();
      await sleep(700);
      ok('2a 確定 ⇒ 視窗關掉', !shown('#wfg-clr-mask'));
      ok('2b 確定 ⇒ 下拉停在 placeholder', $('#wfg-preset-select').value === '',
         '"' + $('#wfg-preset-select').value + '"');
      ok('2c 🔴 確定 ⇒ 設定真的變了（不是什麼都沒做）', dumpTcon() !== dumpLoaded);
      const dumpViaPreset = dumpTcon();

      /* 「等同 wfgResetToDefault()」的驗法：再套同一組 preset，然後走**清除按鈕**
         那條路（它確認後就是 wfgResetToDefault()），兩邊的 dump 必須逐項相同。 */
      await loadPresetViaUi(KEY);
      /* 🔴 這裡**刻意不要求**與第一次套用逐項相同：實測差在 `#wfg-ui-tcon`
         （開頁預設 em01、清除後的預設 e503，而這組 preset 不涵蓋這個欄位），
         連帶讓該機種的數位訊號表欄位數也不同。這是**既有行為、與本版無關**
         （本版一行都沒動 `wfgResetToDefault()`／`wfgLoadPreset()` 的內部語意）。
         這一條只要確認「preset 真的又套進去了」，終點一致由 2f 負責。 */
      ok('2d 前置：preset 又套回去了（狀態離開了清除後的樣子）',
         dumpTcon() !== dumpViaPreset, diffOf(dumpLoaded, dumpTcon()));
      $('#wfg-clear-btn').click();
      await sleep(250);
      ok('2e 清除按鈕 ⇒ 同一個視窗跳出來', shown('#wfg-clr-mask'));
      $('#wfg-clr-ok').click();
      await sleep(700);
      ok('2f 🔴🔴 切回 placeholder 的結果與「清除」按鈕**逐項相同**（＝ wfgResetToDefault()）',
         dumpTcon() === dumpViaPreset, diffOf(dumpViaPreset, dumpTcon()));

      /* ══ ② / ④ LA 側 ═══════════════════════════════════════════════════ */
      window.wfgSwitchMode('la');
      await sleep(400);
      const P = window.__wfgLaProbe;
      if (!P) { ok('🔴 window.__wfgLaProbe 不存在', false); throw new Error('no probe api'); }
      const laSel = $('#wfg-la-quick-preset');
      const PID = (laSel.options[1] || {}).value || '';
      ok('3a 前置：LA 快捷下拉有可選的 preset', !!PID, PID || '(一個都沒有)');

      P.loadDemo();
      await sleep(300);
      P.setChannelName(0, 'PROBE-CH0');
      P.setAnalyzers([{ id: 901, type: 'i2c', config: P.defaultCfg('i2c') }]);
      window.wfgSetImportedFileName('la', 'probe-ask.kvdat');
      await sleep(250);
      const litBefore = litPixels('wfg-la-canvas');
      ok('3b 前置：波形畫出來了', litBefore > 500, litBefore + ' 個亮點');
      ok('3c 前置：通道名稱改過了', P.channelNames()[0] === 'PROBE-CH0', P.channelNames()[0]);
      ok('3d 前置：加了一個分析器', P.analyzerCount() === 1, P.analyzerCount());
      ok('3e 前置：檔名徽章顯示出來了', /probe-ask/.test(($('#wfg-import-filename') || {}).textContent || ''),
         ($('#wfg-import-filename') || {}).textContent);

      laSel.dispatchEvent(new Event('focus'));
      laSel.value = PID;                 /* 下拉停在某個 preset（不觸發套用） */
      await pickPlaceholder('#wfg-la-quick-preset');
      ok('4a 🔴 LA 切回「快捷設定」⇒ 確認視窗跳出來', shown('#wfg-clr-mask'));
      ok('4b 🔴 還沒確認之前，波形、名稱、分析器一個都沒動',
         P.hasWaveform() && P.channelNames()[0] === 'PROBE-CH0' && P.analyzerCount() === 1);
      ok('4c 用的是這個入口自己的文案 key（不是照抄清空鈕那一組）',
         $('#wfg-clr-title').getAttribute('data-i18n') === 'wfg.laPreClrTitle'
         && $('#wfg-clr-body').getAttribute('data-i18n') === 'wfg.laPreClrBody',
         $('#wfg-clr-title').getAttribute('data-i18n') + ' / ' + $('#wfg-clr-body').getAttribute('data-i18n'));
      {
        const txt = $('#wfg-clr-body').textContent || '';
        ok('4d 🔴 內文寫出這次會多清掉設定（通道名稱／順序／分析器）',
           /通道名稱/.test(txt) && /分析器|analyzer/.test(txt) && /無法復原/.test(txt), txt.slice(0, 40) + '…');
        ok('4e 🔴 內文寫出保留什麼', /保留不動/.test(txt));
        ok('4f 🔴 文案沒有出現未翻譯的 key（t() 查不到會回傳 key 本身）',
           !/^[a-z]+\.[A-Za-z]+$/.test(txt.trim()), txt.slice(0, 20));
      }
      $('#wfg-clr-cancel').click();
      await sleep(250);
      ok('4g 取消 ⇒ 視窗關掉', !shown('#wfg-clr-mask'));
      ok('4h 🔴 取消 ⇒ 下拉轉回原本的 preset', laSel.value === PID, laSel.value);
      ok('4i 🔴 取消 ⇒ 波形、通道名稱、分析器都還在',
         P.hasWaveform() && P.channelNames()[0] === 'PROBE-CH0' && P.analyzerCount() === 1);
      ok('4j 取消 ⇒ 畫面上的波形還在', litPixels('wfg-la-canvas') > 500, litPixels('wfg-la-canvas'));

      await pickPlaceholder('#wfg-la-quick-preset');
      $('#wfg-clr-ok').click();
      await sleep(900);
      ok('5a 確定 ⇒ 視窗關掉', !shown('#wfg-clr-mask'));
      ok('5b 🔴🔴 波形清掉了（v4.52.0 以前這條路不清波形）', P.hasWaveform() === false, String(P.hasWaveform()));
      ok('5c 🔴 已清空旗標有設起來（否則等一下會長回 demo 方波）', P.cleared() === true, String(P.cleared()));
      ok('5d 🔴 匯入的檔案（檔名徽章）清掉了',
         !/probe-ask/.test(($('#wfg-import-filename') || {}).textContent || ''),
         ($('#wfg-import-filename') || {}).textContent || '(空)');
      ok('5e 🔴 通道名稱回預設（內部以空字串表示預設名）',
         P.channelNames().every((v) => v === ''), JSON.stringify(P.channelNames().slice(0, 3)));
      ok('5f 🔴 分析器清光', P.analyzerCount() === 0, P.analyzerCount());
      ok('5g 通道順序回預設 16 條', P.channelOrderLen() === 16, P.channelOrderLen());
      ok('5h 🔴 游標／量測／脈衝／解碼跟著清（走的是清空按鈕同一支函式）',
         P.cursorActive().every((v) => v === false) && P.measCount() === 0
         && P.pulseCount() === 0 && P.decodeCount() === 0,
         [P.measCount(), P.pulseCount(), P.decodeCount()].join('/'));
      {
        const lit = litPixels('wfg-la-canvas');
        ok('5i 🔴 波形區真的變乾淨了', lit >= 0 && lit < litBefore * 0.5, lit + ' ← 清空前 ' + litBefore);
      }
      ok('5j 下拉停在 placeholder', laSel.value === '', '"' + laSel.value + '"');

      /* 🔴 清完之後隨手改一個設定，demo 方波不可以長回來（v4.48.0 踩過的坑）。 */
      P.updateSummary();
      await sleep(300);
      ok('6a 🔴🔴 清完之後動一下設定 ⇒ demo 方波**不得**長回來',
         P.hasWaveform() === false && P.cleared() === true, String(P.hasWaveform()));
      {
        const lit = litPixels('wfg-la-canvas');
        ok('6b 🔴 畫面也還是乾淨的', lit >= 0 && lit < litBefore * 0.5, lit);
      }
      /* 下一次擷取／匯入要能解除清空狀態，否則工具就死在空白畫面。 */
      P.loadDemo();
      await sleep(300);
      ok('6c 🔴 重新載入波形 ⇒ 清空狀態解除、波形回來', P.cleared() === false && P.hasWaveform() === true
         && litPixels('wfg-la-canvas') > litBefore * 0.8,
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
