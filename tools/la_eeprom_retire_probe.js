/* ═══════════════════════════════════════════════════════════════════════════
   la_eeprom_retire_probe.js — I2C-EEPROM 分析器「下架」的真瀏覽器驗收
   ───────────────────────────────────────────────────────────────────────────
   用法：tools/ui_probe.sh wfg.html tools/la_eeprom_retire_probe.js
        （加 WFG_LANG=zh-TW|zh-CN|en 驗三語的選單文字）

   Bruce 2026-09-19：「分析器裡面的 I2C-EEPROM 這個是有問題的，請直接把它移除，
   不要讓使用者選到。」下架原因寫在 wfg.html 的 wfgLaDecodeEepromRows() 上方。

   🔴 這支釘住的是「移除功能」最容易出事的那一半 —— **不是「選不到了」，
      而是「舊設定檔還打得開嗎」**。移除入口誰都會寫，會爆的是使用者手上那份
      存著 I2C-EEPROM analyzer 的 .kvset：載入時若拋錯，整個 LA 檢視會死掉。
      所以下面第 ② 組是走 wfgLaApplyKvsetText()（＝真正的載入路徑，只扣掉讀檔），
      不是自己往 wfgLaAnalyzers 塞一顆 —— 手動塞的驗不到 kvdatReadAnalyzersFromXml。

   🔴 wfg.html 的 JS 全包在一個 IIFE 裡，頂層 var/function 不是 window 屬性，
      所以狀態一律走 window.__wfgLaProbe。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ERRS = [];
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
  const typeOpts = () => Array.from(document.querySelectorAll('#wfg-la-analyzer-type option'));
  const byV = (v) => typeOpts().find((o) => o.value === v);
  let P = null;

  /* 一份含 I2C-EEPROM analyzer 的 .kvset —— 結構照 原廠軟體 的 <settings> 格式。
     I2C 的 parameters 欄位格式與 wfgLaParseI2cParameters 相同（sda/scl 在 2/3）。 */
  const KVSET_WITH_EEPROM = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<settings>',
    '  <global>',
    '    <version>3.6.5</version>',
    '    <devModel>7</devModel>',
    '    <analyzerAlias>;</analyzerAlias>',
    '  </global>',
    '  <devices>',
    '    <LA2016>',
    '      <trgPosition>5</trgPosition>',
    '      <chnEnable>1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0</chnEnable>',
    '      <smpDepth>5000000</smpDepth>',
    '      <smpFrequ>200000</smpFrequ>',
    '      <chnLevel>2.5V CMOS</chnLevel>',
    '    </LA2016>',
    '  </devices>',
    '  <analyzers>',
    '    <item0>',
    '      <fileName>I2C-EEPROM.dll</fileName>',
    '      <format>2</format>',
    '      <parameters>0,0,0,1,0,0,</parameters>',
    '    </item0>',
    '  </analyzers>',
    '</settings>'
  ].join('\n');

  /* 合成一段最小可解的 I2C 波形（SDA=CH0 / SCL=CH1，idle 兩條都 H）。
     目的只是讓「載入設定後 LA 還能不能正常解碼」有東西可解。 */
  function buildI2c(txns) {
    const p = 10e-6, SKEW = 8;
    const sdaE = [], sclE = [];
    let sda = 1, scl = 1, t = 200e-6;
    const setSda = (v, tt) => { if (v !== sda) { sdaE.push(tt); sda = v; } };
    const setScl = (v, tt) => { if (v !== scl) { sclE.push(tt); scl = v; } };
    function bit(b) { t += p / SKEW; setSda(b, t); t += p / 2 - p / SKEW; setScl(1, t); t += p / 2; setScl(0, t); }
    function byte(v, nack) { for (let i = 7; i >= 0; i--) bit((v >> i) & 1); bit(nack ? 1 : 0); }
    function start() { setSda(1, t); setScl(1, t); t += p / 2; setSda(0, t); t += p / 4; setScl(0, t); }
    function repStart() { t += p / SKEW; setSda(1, t); t += p / 2; setScl(1, t); t += p / 2; setSda(0, t); t += p / 4; setScl(0, t); }
    function stop() { t += p / SKEW; setSda(0, t); t += p / 2; setScl(1, t); t += p / 2; setSda(1, t); t += p * 2; }
    txns.forEach((tx) => {
      start();
      tx.phases.forEach((ph, i) => {
        if (i > 0) repStart();
        byte((ph.addr << 1) | (ph.read ? 1 : 0));
        ph.bytes.forEach((b, bi) => byte(b, ph.read && bi === ph.bytes.length - 1));
      });
      stop();
    });
    return { sdaE, sclE, endTime: t };
  }

  function installWaveform() {
    const w = buildI2c([
      { phases: [{ addr: 0x50, read: false, bytes: [0x12, 0x34, 0x56] }] },
      { phases: [{ addr: 0x50, read: false, bytes: [0x00] }, { addr: 0x50, read: true, bytes: [0xA0, 0xA1] }] }
    ]);
    const edges = [], counts = [];
    for (let ch = 0; ch < 16; ch++) { edges[ch] = []; counts[ch] = 0; }
    edges[0] = w.sdaE; counts[0] = w.sdaE.length;
    edges[1] = w.sclE; counts[1] = w.sclE.length;
    const dur = w.endTime * 3;
    P.setWaveform({
      preview: [], totalSamples: Math.round(dur * 1e8), transfers: 0,
      initialSample: 0b11, finalSample: 0b11,
      edgesByChannel: edges, edgeCounts: counts,
      durationSec: dur, effectiveRate: 1e8, fileName: 'probe_eeprom_retire.kvdat'
    });
    P.setView(0, dur);
    return dur;
  }

  (async function () {
    try {
      await sleep(400);
      P = window.__wfgLaProbe;
      if (!P || !P.applyKvsetText) { ok('🔴 window.__wfgLaProbe 缺少本次驗收需要的出口（applyKvsetText）', false); throw new Error('no probe api'); }
      window.wfgSwitchMode('la');
      await sleep(300);
      P.setAnalyzers([]);
      await sleep(80);

      /* ══ ① 使用者選不到 ═══════════════════════════════════════════════ */
      ok('1a 🔴 可新增型別清單裡沒有 i2c_eeprom',
        P.typesAddable().indexOf('i2c_eeprom') < 0, P.typesAddable().join(','));
      ok('1b i2c_eeprom 被標記為「已下架型別」', P.typeRetired('i2c_eeprom') === true);
      ok('1c i2c / dp_aux 沒有被誤標成下架',
        P.typeRetired('i2c') === false && P.typeRetired('dp_aux') === false);

      window.wfgLaOpenAnalyzerDialog();
      await sleep(120);
      ok('1d 🔴 新增對話框的 Analyzer 下拉裡看不到 I2C-EEPROM',
        !byV('i2c_eeprom'), typeOpts().map((o) => o.value + ':' + o.textContent).join(' | '));
      ok('1e 下拉裡的文字不含 EEPROM 字樣',
        !/EEPROM/i.test(typeOpts().map((o) => o.textContent).join(' ')),
        typeOpts().map((o) => o.textContent).join(' | '));
      ok('1f 新增對話框沒有 Memory Address 欄位', !$('#wfg-la-analyzer-memory'));
      window.wfgLaCloseAnalyzerDialog();

      /* ══ ② 舊設定檔載入後不可以爆掉 ═══════════════════════════════════ */
      const dur = installWaveform();
      P.renderScope();
      await sleep(150);
      let applyErr = '';
      try {
        P.applyKvsetText(KVSET_WITH_EEPROM);
      } catch (e) {
        applyErr = (e && (e.message || e)) + '';
      }
      await sleep(400);
      ok('2a 🔴 載入含 I2C-EEPROM 的舊 .kvset ⇒ 沒有拋錯', applyErr === '', applyErr || '(無例外)');
      const ana = P.analyzers();
      ok('2b 🔴 那一顆分析器有被載進來（不是被安靜吃掉）',
        ana.length === 1 && ana[0].type === 'i2c_eeprom',
        ana.map((a) => a.type).join(',') || '(空)');
      ok('2c 設定檔裡的 SDA/SCL 有跟著進來', ana[0] && Number(ana[0].config.sda) === 0 && Number(ana[0].config.scl) === 1,
        ana[0] ? 'sda=' + ana[0].config.sda + ' scl=' + ana[0].config.scl : '(無)');

      P.runAnalyzers();
      await sleep(350);
      const grp = P.decodeGroups()[0];
      ok('2d 🔴 LA 檢視照常運作：這一顆仍解得出東西（沒有變成 not implemented）',
        !!grp && !grp.note && grp.rows.length > 0,
        grp ? ('note=' + (grp.note || '(無)') + ' rows=' + grp.rows.length) : '(沒有解碼結果)');
      ok('2e 解碼表格畫得出來（畫面上真的有列）',
        document.querySelectorAll('.wfg-la-decode-table-wrap tbody tr').length > 0,
        '畫面列數=' + document.querySelectorAll('.wfg-la-decode-table-wrap tbody tr').length);
      ok('2f 波形畫布還在（LA 檢視沒有半死）',
        !!document.querySelector('#wfg-la-scope-canvas, .wfg-la-scope canvas'));
      {
        const nameEl = document.querySelector('#wfg-la-analyzer-list .wfg-la-analyzer-name');
        ok('2g 🔴 列表上標出「已停用」，使用者才知道它為什麼加不回去',
          !!nameEl && /I2C-EEPROM/.test(nameEl.textContent) && nameEl.textContent.indexOf('（') > 0,
          nameEl ? nameEl.textContent.split('\n')[0].trim() : '(找不到列表項)');
      }

      /* ══ ③ 編輯既有的那一顆：型別不可以被安靜改掉 ═════════════════════ */
      const eid = ana[0].id;
      window.wfgLaOpenAnalyzerDialog(eid);
      await sleep(150);
      {
        const sel = $('#wfg-la-analyzer-type');
        ok('3a 🔴 型別下拉的 value 仍是 i2c_eeprom（沒有 fallback 到第一個選項）',
          !!sel && sel.value === 'i2c_eeprom', sel ? sel.value : '(無)');
        ok('3b 🔴 型別下拉是唯讀的（改不成別的型別）', !!sel && sel.disabled === true);
        ok('3c 對話框裡沒有 Memory Address 欄位（那個下拉已隨型別下架移除）', !$('#wfg-la-analyzer-memory'));
        ok('3d 有一行說明講清楚它為什麼不能新增',
          !!$('.wfg-la-analyzer-form #wfg-la-analyzer-fields div'),
          ($('#wfg-la-analyzer-fields div') || {}).textContent || '(沒有說明)');
        ok('3e SDA/SCL 等一般設定仍然可以改', !!$('#wfg-la-analyzer-sda') && !!$('#wfg-la-analyzer-scl'));
        $('#wfg-la-analyzer-sda').value = '2';
        $('#wfg-la-analyzer-scl').value = '3';
      }
      window.wfgLaConfirmAnalyzerDialog(eid);
      await sleep(250);
      {
        const a = P.analyzers()[0];
        ok('3f 🔴 按下「確定」之後型別仍是 i2c_eeprom（沒有被安靜換成 i2c）',
          !!a && a.type === 'i2c_eeprom', a ? a.type : '(沒了)');
        ok('3g 改過的 SDA/SCL 有存回去', !!a && Number(a.config.sda) === 2 && Number(a.config.scl) === 3,
          a ? 'sda=' + a.config.sda + ' scl=' + a.config.scl : '(無)');
        ok('3h 🔴 沒有 UI 的 memoryAddress 仍被原樣保留（重新上架時不必去猜使用者選過什麼）',
          !!a && a.config.memoryAddress === 'lowbits', a ? String(a.config.memoryAddress) : '(無)');
      }

      /* ══ ④ 程式面的最後一道防線：繞過 UI 也新增不了 ════════════════════ */
      {
        const before = P.analyzers().length;
        window.wfgLaOpenAnalyzerDialog();          /* 新增模式 */
        await sleep(120);
        const sel = $('#wfg-la-analyzer-type');
        /* 模擬「有人把選項動回去」：直接把 option 插進 DOM 再選它。 */
        sel.insertAdjacentHTML('beforeend', '<option value="i2c_eeprom">I2C-EEPROM</option>');
        sel.value = 'i2c_eeprom';
        window.wfgLaRefreshAnalyzerDialogFields();
        window.wfgLaConfirmAnalyzerDialog(0);
        await sleep(200);
        ok('4a 🔴 繞過選單直接送出 i2c_eeprom 新增 ⇒ 不收（分析器數量沒變）',
          P.analyzers().length === before, before + ' → ' + P.analyzers().length);
        window.wfgLaCloseAnalyzerDialog();
      }

      /* ══ ⑤ 刪掉之後就真的回不來了 ═════════════════════════════════════ */
      window.wfgLaRemoveAnalyzer(P.analyzers()[0].id);
      await sleep(200);
      window.wfgLaOpenAnalyzerDialog();
      await sleep(120);
      ok('5a 刪掉唯一那顆 I2C-EEPROM 之後，選單裡仍然沒有這一項', !byV('i2c_eeprom'),
        typeOpts().map((o) => o.value).join(','));
      {
        const btn = document.querySelector('#wfg-la-analyzer-card .wfg-la-panel-add');
        ok('5b ＋ 鈕沒有被下架型別害成永久 disable', !!btn && !btn.disabled);
      }
      window.wfgLaCloseAnalyzerDialog();

      /* ══ ⑥ 三語各驗一次：哪一語都不可以冒出 I2C-EEPROM ══════════════════
         下架若只清了繁中那一份字串，換語言就又冒出來了 —— 所以三語逐一切過去看。 */
      for (const lang of ['zh-TW', 'zh-CN', 'en']) {
        window.applyLang(lang);
        await sleep(150);
        window.wfgLaOpenAnalyzerDialog();
        await sleep(150);
        const txt = typeOpts().map((o) => o.textContent).join(' | ');
        ok('6-' + lang + ' 新增選單看不到 I2C-EEPROM', !byV('i2c_eeprom') && !/EEPROM/i.test(txt), txt);
        window.wfgLaCloseAnalyzerDialog();
        await sleep(60);
      }
      window.applyLang('zh-TW');
      await sleep(100);

      ok('5c 全程沒有未攔截的 JS 例外', ERRS.length === 0, ERRS.join(' ／ ') || '(無)');
      void dur;
    } catch (err) {
      ok('🔴 probe 自己爆了：' + ((err && err.message) || err), false);
    }
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
