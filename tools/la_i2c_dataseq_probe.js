/* ═══════════════════════════════════════════════════════════════════════════
   la_i2c_dataseq_probe.js — LA I2C 分析器四項改動的真瀏覽器驗收
   ───────────────────────────────────────────────────────────────────────────
   用法：tools/ui_probe.sh wfg.html tools/la_i2c_dataseq_probe.js

   涵蓋：
     1. Address Display 新增時預設 7-bit（既有存檔不受影響）
     2. 同型分析器不可重複新增（選單標「已新增」+ disable，刪除後復原）
     3. 新增分析器後，解碼結果自動捲到有內容的位置
        （視野在所有列之後 → 最後一筆；在所有列之前 → 第一筆；重疊 → 舊行為）
     4. 解碼結果 Packet 與 Type 之間的 data 序號欄位，offset 三條優先序

   🔴 為什麼非要真瀏覽器：第 3 項的失敗長相是「捲軸位置不對 / 一片空白」，
      只有真的量 scrollTop / getBoundingClientRect 才看得見；jsdom 的版面全是 0，
      會一路綠燈。
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
  let P = null;

  /* ── 合成 I2C 波形 ─────────────────────────────────────────────────────
     SDA = CH0、SCL = CH1，idle 兩條都是 H（initialSample = 0b11）。
     edgesByChannel[ch] 是「電位翻轉的時間點」，解碼器就是這樣吃的。 */
  function buildI2c(txns, opts) {
    opts = opts || {};
    const p = opts.period || 10e-6;
    const sdaE = [], sclE = [];
    let sda = 1, scl = 1, t = opts.t0 || 200e-6;
    const setSda = (v, tt) => { if (v !== sda) { sdaE.push(tt); sda = v; } };
    const setScl = (v, tt) => { if (v !== scl) { sclE.push(tt); scl = v; } };
    /* 🔴 SDA 一定要在 SCL 轉 low 之後「隔一小段」才動。解碼器的事件排序是
       「同一時刻 SDA 先於 SCL」（wfgLaDecodeI2cRows 的 events.sort），所以
       SDA 與 SCL 下降緣同時間 ⇒ 會被當成「SCL 還在 high 時 SDA 動了」＝
       假的 START/STOP。第一版 probe 就是踩到這個，24 列的波形解出 82 列。 */
    const SKEW = 8;                         /* SDA 相對 SCL 下降緣延後 p/SKEW */
    function bit(b) {                       /* 前提：SCL 目前在 low */
      t += p / SKEW; setSda(b, t);
      t += p / 2 - p / SKEW; setScl(1, t);
      t += p / 2; setScl(0, t);
    }
    function byte(v, nack) {
      for (let i = 7; i >= 0; i--) bit((v >> i) & 1);
      bit(nack ? 1 : 0);                    /* ACK = 0 */
    }
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

  function installWaveform(txns, durationSec) {
    const w = buildI2c(txns);
    const edges = [], counts = [];
    for (let ch = 0; ch < 16; ch++) { edges[ch] = []; counts[ch] = 0; }
    edges[0] = w.sdaE; counts[0] = w.sdaE.length;
    edges[1] = w.sclE; counts[1] = w.sclE.length;
    const dur = durationSec || (w.endTime * 5);
    P.setWaveform({
      preview: [], totalSamples: Math.round(dur * 1e8), transfers: 0,
      initialSample: 0b11, finalSample: 0b11,
      edgesByChannel: edges, edgeCounts: counts,
      durationSec: dur, effectiveRate: 1e8, fileName: 'probe_i2c.kvdat'
    });
    P.setView(0, dur);
    return { duration: dur, dataEnd: w.endTime };
  }

  function addAnalyzer(type) {
    window.wfgLaOpenAnalyzerDialog();
    $('#wfg-la-analyzer-type').value = type;
    window.wfgLaRefreshAnalyzerDialogFields();
    window.wfgLaConfirmAnalyzerDialog(0);
  }
  function setOffsetSetting(id, value) {
    window.wfgLaOpenAnalyzerDialog(id);
    $('#wfg-la-analyzer-offset').value = value;
    window.wfgLaConfirmAnalyzerDialog(id);
  }

  const wrapOf = (i) => document.querySelector('.wfg-la-decode-table-wrap[data-vgroup-idx="' + (i || 0) + '"]');
  function visibleRowIdxRange(wrap) {
    if (!wrap) return { n: -1, first: -1, last: -1 };
    const wr = wrap.getBoundingClientRect();
    let first = -1, last = -1, n = 0;
    wrap.querySelectorAll('tbody tr').forEach((tr) => {
      const rr = tr.getBoundingClientRect();
      if (rr.bottom > wr.top + 1 && rr.top < wr.bottom - 1) {
        const idx = Number(tr.getAttribute('data-vrow-idx'));
        if (first < 0) first = idx;
        last = idx; n++;
      }
    });
    return { n, first, last };
  }
  const geom = (wrap) => wrap ? ('scrollTop=' + Math.round(wrap.scrollTop) + ' scrollH=' + wrap.scrollHeight + ' clientH=' + wrap.clientHeight) : '(no wrap)';
  /* 畫面上的欄位（第 3 欄 = Data #、第 4 欄 = Type） */
  function seqColumn(i) {
    const wrap = wrapOf(i);
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('tbody tr')).map((tr) => {
      const tds = tr.querySelectorAll('td');
      return { seq: (tds[2] ? tds[2].textContent : '').trim(), type: (tds[3] ? tds[3].textContent : '').trim() };
    });
  }
  const seqOfData = (i) => seqColumn(i).filter((r) => r.type === 'DATA').map((r) => r.seq);
  const seqOfNonData = (i) => seqColumn(i).filter((r) => r.type !== 'DATA').map((r) => r.seq);
  const idxOf = (rows, pk) => rows.filter((r) => r.type === 'DATA' && r.packet === pk).map((r) => (r.dataIndex == null ? null : r.dataIndex));

  (async function () {
    try {
      await sleep(400);
      P = window.__wfgLaProbe;
      if (!P || !P.setWaveform) { ok('🔴 window.__wfgLaProbe 缺少本次驗收需要的出口', false); throw new Error('no probe api'); }
      window.wfgSwitchMode('la');
      await sleep(300);
      P.setAnalyzers([]);
      await sleep(80);

      /* ══ 第 1 項 ══════════════════════════════════════════════════════ */
      window.wfgLaOpenAnalyzerDialog();
      await sleep(80);
      {
        const sel = $('#wfg-la-analyzer-address');
        ok('1a 新增 I2C：Address Display 預設 = 7bit', sel && sel.value === '7bit', sel ? sel.value : '(沒有這個下拉)');
        $('#wfg-la-analyzer-type').value = 'i2c_eeprom';
        window.wfgLaRefreshAnalyzerDialogFields();
        const sel2 = $('#wfg-la-analyzer-address');
        ok('1b 新增 I2C-EEPROM：Address Display 預設也是 7bit', sel2 && sel2.value === '7bit', sel2 ? sel2.value : '(無)');
        const off = $('#wfg-la-analyzer-offset');
        ok('1c Offset 長度下拉存在且預設「未知」', off && off.value === 'auto', off ? off.value : '(沒有這個下拉)');
      }
      window.wfgLaCloseAnalyzerDialog();
      ok('1d 🔴 KvParam 0/1/2 ↔ 7bit/8zero/8rw 對應一個字都沒變',
        P.addrKvFrom(0) === '7bit' && P.addrKvFrom(1) === '8zero' && P.addrKvFrom(2) === '8rw' &&
        P.addrKvTo('7bit') === 0 && P.addrKvTo('8zero') === 1 && P.addrKvTo('8rw') === 2,
        [0, 1, 2].map(P.addrKvFrom).join('/') + ' ← → ' + ['7bit', '8zero', '8rw'].map(P.addrKvTo).join('/'));
      P.setAnalyzers([{ id: 9001, type: 'i2c', config: { sda: 0, scl: 1, addressDisplay: '8rw', exportLevel: 'packets' } }]);
      window.wfgLaOpenAnalyzerDialog(9001);
      await sleep(80);
      {
        const sel = $('#wfg-la-analyzer-address');
        ok('1e 🔴 既有存檔（8rw）開設定 ⇒ 維持 8rw，沒有被新預設值蓋掉', sel && sel.value === '8rw', sel ? sel.value : '(無)');
        ok('1f 既有存檔沒有 offset 設定 ⇒ 落在「未知」', $('#wfg-la-analyzer-offset') && $('#wfg-la-analyzer-offset').value === 'auto');
      }
      window.wfgLaConfirmAnalyzerDialog(9001);
      await sleep(150);
      ok('1g 🔴 既有存檔按「確定」存回去 ⇒ addressDisplay 仍是 8rw',
        P.analyzers()[0].config.addressDisplay === '8rw', P.analyzers()[0].config.addressDisplay);

      /* ══ 第 2 項 ══════════════════════════════════════════════════════ */
      window.wfgLaOpenAnalyzerDialog();
      await sleep(80);
      {
        const opts = Array.from(document.querySelectorAll('#wfg-la-analyzer-type option'));
        const byV = (v) => opts.find((o) => o.value === v);
        ok('2a 🔴 已有 I2C ⇒ 選單裡 I2C 被 disable', !!byV('i2c') && byV('i2c').disabled, byV('i2c') ? byV('i2c').textContent : '(無)');
        ok('2b 🔴 I2C 選項標示「已新增」', !!byV('i2c') && /已新增|already added/i.test(byV('i2c').textContent), byV('i2c') ? byV('i2c').textContent : '(無)');
        ok('2c i2c_eeprom 仍可選', !!byV('i2c_eeprom') && !byV('i2c_eeprom').disabled, byV('i2c_eeprom') ? byV('i2c_eeprom').textContent : '(無)');
        ok('2d dp_aux 仍可選', !!byV('dp_aux') && !byV('dp_aux').disabled);
        ok('2e 🔴 對話框開起來時預設選中的是可選型別，不是 disable 的那個',
          !$('#wfg-la-analyzer-type').selectedOptions[0].disabled, $('#wfg-la-analyzer-type').value);
      }
      window.wfgLaCloseAnalyzerDialog();
      window.wfgLaOpenAnalyzerDialog(9001);
      await sleep(80);
      {
        const byV = (v) => Array.from(document.querySelectorAll('#wfg-la-analyzer-type option')).find((o) => o.value === v);
        ok('2f 🔴 編輯既有 I2C ⇒ I2C 自己這一項不可以被 disable', !!byV('i2c') && !byV('i2c').disabled);
      }
      window.wfgLaCloseAnalyzerDialog();
      window.wfgLaRemoveAnalyzer(9001);
      await sleep(120);
      window.wfgLaOpenAnalyzerDialog();
      await sleep(80);
      {
        const byV = (v) => Array.from(document.querySelectorAll('#wfg-la-analyzer-type option')).find((o) => o.value === v);
        ok('2g 🔴 刪掉 I2C 之後 ⇒ I2C 又可以選了', !!byV('i2c') && !byV('i2c').disabled);
      }
      window.wfgLaCloseAnalyzerDialog();
      P.setAnalyzers([
        { id: 1, type: 'i2c', config: { sda: 0, scl: 1, addressDisplay: '7bit', exportLevel: 'packets' } },
        { id: 2, type: 'i2c_eeprom', config: { sda: 0, scl: 1, addressDisplay: '7bit', exportLevel: 'packets' } },
        { id: 3, type: 'dp_aux', config: { channel: 2, bitRate: 1000000, polarity: 'normal', tolerance: 25, syncBits: 16 } }
      ]);
      await sleep(80);
      {
        const btn = document.querySelector('#wfg-la-analyzer-card .wfg-la-panel-add');
        ok('2h 三種型別都加滿 ⇒ ＋ 鈕 disable', !!btn && btn.disabled, btn ? 'disabled=' + btn.disabled : '(找不到 ＋ 鈕)');
      }
      window.wfgLaRemoveAnalyzer(1);
      await sleep(80);
      {
        const btn = document.querySelector('#wfg-la-analyzer-card .wfg-la-panel-add');
        ok('2i 刪掉其中一個 ⇒ ＋ 鈕恢復可按', !!btn && !btn.disabled);
      }
      P.setAnalyzers([]);
      await sleep(80);

      /* ══ 第 3 項 ══════════════════════════════════════════════════════ */
      const W = installWaveform([
        { phases: [{ addr: 0x50, read: false, bytes: [0x12, 0x34] }, { addr: 0x50, read: true, bytes: [0xA0, 0xA1, 0xA2] }] },
        { phases: [{ addr: 0x50, read: false, bytes: [0x00, 0x10, 0xC1, 0xC2, 0xC3] }] },
        { phases: [{ addr: 0x60, read: false, bytes: [0x07, 0xD1, 0xD2] }] }
      ], 0.02);
      P.renderScope();
      await sleep(200);
      ok('3-0 前置：合成 I2C 波形裝進去了', true,
        'SCL 邊緣 ' + (P.setWaveform && document.title ? '' : '') + '資料結束於 ' + (W.dataEnd * 1e3).toFixed(2) + 'ms，總長 ' + (W.duration * 1e3).toFixed(1) + 'ms');

      /* (A) 視野在「所有解碼列之後」的空白區 → 新增 analyzer ⇒ 應停在最後一筆 */
      P.setView(W.duration * 0.6, W.duration * 0.9);
      await sleep(150);
      addAnalyzer('i2c');
      await sleep(450);
      {
        const wrap = wrapOf(0);
        const rows = P.vgroupRows(0);
        const v = visibleRowIdxRange(wrap);
        ok('3a 🔴 視野在所有列「之後」新增 analyzer ⇒ 解碼結果不是一片空白', v.n > 0,
          '可見 ' + v.n + ' 列（idx ' + v.first + '~' + v.last + '，共 ' + rows.length + ' 列）' + geom(wrap));
        ok('3b 🔴 而且停在「最後一筆」', v.last === rows.length - 1,
          '可見 idx ' + v.first + '~' + v.last + '，最後一筆 idx=' + (rows.length - 1));
      }
      window.wfgLaRemoveAnalyzer(P.analyzers()[0].id);
      await sleep(150);

      /* (B) 視野在「所有解碼列之前」的空白區 → 應停在第一筆 */
      P.setView(0, 150e-6);
      await sleep(150);
      addAnalyzer('i2c');
      await sleep(450);
      {
        const wrap = wrapOf(0);
        const rows = P.vgroupRows(0);
        const v = visibleRowIdxRange(wrap);
        ok('3c 🔴 視野在所有列「之前」新增 analyzer ⇒ 停在第一筆', v.first === 0 && v.n > 0,
          '可見 idx ' + v.first + '~' + v.last + '（共 ' + rows.length + ' 列）' + geom(wrap) +
          '；視野 ' + (P.viewRange()[0] * 1e6).toFixed(1) + '~' + (P.viewRange()[1] * 1e6).toFixed(1) + 'us，第一列 ' + (rows[0].time * 1e6).toFixed(1) + 'us');
      }
      window.wfgLaRemoveAnalyzer(P.analyzers()[0].id);
      await sleep(150);

      /* (C) 視野與解碼列「有重疊」→ 維持舊行為 */
      {
        addAnalyzer('i2c');
        await sleep(350);
        const rowsArr = P.vgroupRows(0);
        const midIdx = Math.floor(rowsArr.length * 0.6);
        const midT = rowsArr[midIdx].time;
        window.wfgLaRemoveAnalyzer(P.analyzers()[0].id);
        await sleep(150);
        P.setView(midT - 20e-6, midT + 120e-6);
        await sleep(150);
        addAnalyzer('i2c');
        await sleep(450);
        const wrap = wrapOf(0);
        const v = visibleRowIdxRange(wrap);
        ok('3d 🔴 視野與解碼列有重疊 ⇒ 維持舊行為（停在視野內的列附近，沒有被推到頭尾）',
          v.first <= midIdx && midIdx <= v.last,
          '視野內第一列 idx=' + midIdx + '，可見 idx ' + v.first + '~' + v.last + ' ' + geom(wrap));
      }

      /* (D) Bruce 的實際情境：**已經有一個分析器**（所以他看得出哪裡沒解碼），
             把波形移到空白區之後再「新增第二個」分析器。 */
      {
        P.setAnalyzers([]);
        await sleep(100);
        addAnalyzer('i2c_eeprom');
        await sleep(350);
        P.setView(W.duration * 0.6, W.duration * 0.9);
        await sleep(200);
        addAnalyzer('i2c');
        await sleep(500);
        const rp = document.getElementById('wfg-la-right-panel');
        const outer = document.getElementById('wfg-la-decoder-results');
        const w1 = wrapOf(1);
        const rows1 = P.vgroupRows(1);
        const v1 = visibleRowIdxRange(w1);
        ok('3e 🔴 已有一個分析器、視野在空白區 ⇒ 新增第二個分析器後它不是一片空白', v1.n > 0,
          '第 2 組可見 ' + v1.n + ' 列（idx ' + v1.first + '~' + v1.last + '／共 ' + rows1.length + '）' + geom(w1) +
          '｜右側面板 scrollTop=' + (rp ? Math.round(rp.scrollTop) : 'n/a') + '/' + (rp ? rp.scrollHeight + '/' + rp.clientHeight : '') +
          '｜results scrollTop=' + (outer ? Math.round(outer.scrollTop) + '/' + outer.scrollHeight + '/' + outer.clientHeight : ''));
        ok('3f 🔴 而且停在最後一筆', v1.last === rows1.length - 1,
          '可見 idx ' + v1.first + '~' + v1.last + '，最後一筆 idx=' + (rows1.length - 1));
        P.setAnalyzers([]);
        await sleep(100);
      }

      /* (E) 🔴 直搗 Bruce 那個症狀的成因：**版面還沒算出來就把捲動位置算掉**。
             把解碼表格容器壓成高度 0（模擬 flex 高度尚未分配完），此時新增分析器，
             再把高度放回去。修好的版本必須「還沒算定案」⇒ 下一次呼叫會重算；
             壞掉的版本 dirty flag 已鎖死 ⇒ 永遠停在錯的位置（一片空白）。 */
      {
        const st = document.createElement('style');
        st.id = 'probe-zero-height';
        st.textContent = '.wfg-la-decode-table-wrap{max-height:0!important;min-height:0!important;}';
        document.head.appendChild(st);
        P.setView(W.duration * 0.6, W.duration * 0.9);
        await sleep(120);
        addAnalyzer('i2c');
        await sleep(200);                    /* 讓 rAF 在「高度仍是 0」的情況下跑過一輪 */
        st.remove();                         /* 版面恢復 */
        await sleep(80);
        P.renderScope();                     /* 這條路徑會再呼叫一次 ApplyDecodeScopeFocus */
        await sleep(200);
        const wrap = wrapOf(0);
        const rows = P.vgroupRows(0);
        const v = visibleRowIdxRange(wrap);
        ok('3g 🔴 版面沒算完時算過一次捲動位置 ⇒ 不可以就此定案；版面恢復後要重算成「最後一筆」',
          v.n > 0 && v.last === rows.length - 1,
          '可見 ' + v.n + ' 列（idx ' + v.first + '~' + v.last + '／共 ' + rows.length + '）' + geom(wrap));
        P.setAnalyzers([]);
        await sleep(100);
        addAnalyzer('i2c');
        await sleep(350);
      }

      /* (F) 🔴🔴 Bruce 回報「一片空白」的真正成因（v4.50.1 就有，非本次改動造成）：
             藍框是疊在捲動容器裡的 absolute 元素，**它的高度會撐大 scrollHeight**。
             藍框高度是照「當下列高」算的，展開解碼面板之後列高整個變小
             （窄面板每列會折行 ~79px ⇒ 展開後 ~29px），舊藍框高度卻留著不動
             ⇒ scrollHeight 被撐到 2 倍多、scrollTop 又是舊版面算的 ⇒ 捲到空白區。
             原本的 dirty key 只看 view range 與組數，展開時兩者都沒變 ⇒ early-return
             ⇒ 永遠不重算。這一條驗「藍框高度不得超過實際表格高度太多」。 */
      {
        const wrapN = wrapOf(0);
        const before = { h: wrapN.clientHeight, sH: wrapN.scrollHeight };
        window.wfgLaToggleDecodeExpanded();
        await sleep(600);
        const wrap = wrapOf(0);
        const tbl = wrap.querySelector('table');
        const fr = wrap.querySelector('.wfg-la-decode-scope-frame');
        const tblH = Math.round(tbl.getBoundingClientRect().height);
        const frH = fr ? Math.round(parseFloat(fr.style.height) || 0) : 0;
        const v = visibleRowIdxRange(wrap);
        ok('3h 🔴 展開解碼面板後，藍框高度要跟著新版面重算（不得撐爆 scrollHeight）',
          frH <= tblH + 40 && wrap.scrollHeight <= tblH + 40,
          '展開前 ' + before.h + '/' + before.sH + ' ⇒ 展開後 clientH=' + wrap.clientHeight +
          ' scrollH=' + wrap.scrollHeight + ' 表格實高=' + tblH + ' 藍框高=' + frH);
        ok('3i 🔴 展開後解碼列真的看得見（不是一片空白）', v.n > 0,
          '可見 ' + v.n + ' 列（idx ' + v.first + '~' + v.last + '）' + geom(wrap));
        window.wfgLaToggleDecodeExpanded();
        await sleep(500);
        const w2 = wrapOf(0);
        ok('3j 收合回去也一樣看得見', visibleRowIdxRange(w2).n > 0,
          '可見 ' + visibleRowIdxRange(w2).n + ' 列 ' + geom(w2));
      }

      /* ══ 第 4 項 ══════════════════════════════════════════════════════ */
      P.setView(0, W.duration);
      await sleep(250);
      {
        const head = Array.from(document.querySelectorAll('.wfg-la-decode-table--i2c thead th')).map((th) => th.textContent.trim());
        ok('4a 🔴 表頭：新欄在 Packet 與 Type 之間', head[0] === 'Time' && head[1] === 'Packet' && head[2] === 'Data #' && head[3] === 'Type', JSON.stringify(head));
      }
      {
        const rows = P.vgroupRows(0);
        ok('4b 🔴 推算路徑：0x50 有 combined read（dummy write 2 byte）⇒ 該 slave 純寫入的前 2 byte 判為 offset',
          JSON.stringify(idxOf(rows, 3)) === JSON.stringify([null, null, 1, 2, 3]), JSON.stringify(idxOf(rows, 3)));
        ok('4c 🔴 未知路徑：0x60 從沒被讀過 ⇒ offset 併入 data 一起編號',
          JSON.stringify(idxOf(rows, 4)) === JSON.stringify([1, 2, 3]), JSON.stringify(idxOf(rows, 4)));
        ok('4d 🔴 讀取相位的 data 各自從 1 開始',
          JSON.stringify(idxOf(rows, 2)) === JSON.stringify([1, 2, 3]), JSON.stringify(idxOf(rows, 2)));
        ok('4e 🔴 dummy write 相位（packet 1）全是 offset ⇒ 一個都不編號',
          JSON.stringify(idxOf(rows, 1)) === JSON.stringify([null, null]), JSON.stringify(idxOf(rows, 1)));
        ok('4f 🔴 ADDR / START / STOP 列的序號欄一定是空的',
          seqOfNonData(0).length > 0 && seqOfNonData(0).every((s) => s === ''),
          JSON.stringify(seqOfNonData(0)));
        ok('4g 畫面序號欄與 row.dataIndex 完全一致',
          JSON.stringify(seqOfData(0)) === JSON.stringify(rows.filter((r) => r.type === 'DATA').map((r) => (r.dataIndex == null ? '' : String(r.dataIndex)))),
          JSON.stringify(seqOfData(0)));
        /* 這份波形有兩個寫入 slave：0x50 推算得到 2、0x60 推算不到 ⇒ 標示「依裝置推算」 */
        ok('4h 來源標示：一份側錄裡不同裝置寬度不同 ⇒ 標「依裝置推算」',
          /Offset 依裝置推算/.test(($('#wfg-la-decoder-results') || {}).textContent || ''),
          (($('#wfg-la-decoder-results') || {}).textContent || '').slice(0, 60).replace(/\s+/g, ' '));
        const ri = rows.findIndex((r) => r.dataIndex === 3 && r.packet === 4);
        ok('4i 搜尋文字含序號 token「data#3」', P.searchTextOf(0, ri).indexOf('data#3') >= 0, P.searchTextOf(0, ri));
      }

      /* 只有一個寫入 slave 且推算得到 ⇒ 標示要寫出具體寬度與「推算」 */
      {
        installWaveform([
          { phases: [{ addr: 0x50, read: false, bytes: [0x12, 0x34] }, { addr: 0x50, read: true, bytes: [0xA0, 0xA1] }] },
          { phases: [{ addr: 0x50, read: false, bytes: [0x00, 0x10, 0xC1, 0xC2, 0xC3] }] }
        ], 0.02);
        P.runAnalyzers();
        await sleep(350);
        ok('4h2 🔴 單一裝置且推算得到 ⇒ 標「Offset 2 byte (推算)」',
          /Offset 2 byte \(推算\)/.test(($('#wfg-la-decoder-results') || {}).textContent || ''),
          (($('#wfg-la-decoder-results') || {}).textContent || '').slice(0, 60).replace(/\s+/g, ' '));
        ok('4h3 推算出的 2 byte 套用到同一個 slave 的純寫入',
          JSON.stringify(idxOf(P.vgroupRows(0), 3)) === JSON.stringify([null, null, 1, 2, 3]),
          JSON.stringify(idxOf(P.vgroupRows(0), 3)));
        /* 只有寫入、完全沒有讀取 ⇒ 未知 */
        installWaveform([{ phases: [{ addr: 0x60, read: false, bytes: [0x07, 0xD1, 0xD2] }] }], 0.02);
        P.runAnalyzers();
        await sleep(350);
        ok('4h4 🔴 整份側錄只有寫入 ⇒ 標「Offset 未知，併入編號」，且每一筆都編號',
          /Offset 未知，併入編號/.test(($('#wfg-la-decoder-results') || {}).textContent || '') &&
          JSON.stringify(idxOf(P.vgroupRows(0), 1)) === JSON.stringify([1, 2, 3]),
          (($('#wfg-la-decoder-results') || {}).textContent || '').slice(0, 45).replace(/\s+/g, ' ') + ' ｜ ' + JSON.stringify(idxOf(P.vgroupRows(0), 1)));
        /* 回到三交易版本供後面的指定/0 測試使用 */
        installWaveform([
          { phases: [{ addr: 0x50, read: false, bytes: [0x12, 0x34] }, { addr: 0x50, read: true, bytes: [0xA0, 0xA1, 0xA2] }] },
          { phases: [{ addr: 0x50, read: false, bytes: [0x00, 0x10, 0xC1, 0xC2, 0xC3] }] },
          { phases: [{ addr: 0x60, read: false, bytes: [0x07, 0xD1, 0xD2] }] }
        ], 0.02);
        P.runAnalyzers();
        await sleep(350);
      }

      /* 使用者指定 2 byte ⇒ 0x60 也照指定切 */
      {
        const id = P.analyzers()[0].id;
        setOffsetSetting(id, '2');
        await sleep(400);
        const rows = P.vgroupRows(0);
        ok('4j 🔴 指定路徑：offset=2 ⇒ 0x60 的純寫入前 2 byte 也當 offset',
          JSON.stringify(idxOf(rows, 4)) === JSON.stringify([null, null, 1]), JSON.stringify(idxOf(rows, 4)));
        ok('4k 指定時來源標示寫「指定」',
          /Offset 2 byte \(指定\)/.test(($('#wfg-la-decoder-results') || {}).textContent || ''),
          (($('#wfg-la-decoder-results') || {}).textContent || '').slice(0, 60).replace(/\s+/g, ' '));
      }
      /* offset = 0 ⇒ 全部都是 data */
      {
        const id = P.analyzers()[0].id;
        setOffsetSetting(id, '0');
        await sleep(400);
        const rows = P.vgroupRows(0);
        ok('4l offset=0 ⇒ 每一筆 DATA 都有編號',
          JSON.stringify(idxOf(rows, 3)) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(idxOf(rows, 3)));
      }

      /* 32 byte page write：offset 2 byte ⇒ 序號跑到 32 */
      {
        installWaveform([
          { phases: [{ addr: 0x50, read: false, bytes: [0x1F, 0x00].concat(Array.from({ length: 32 }, (_, i) => i + 1)) }] }
        ], 0.02);
        const id = P.analyzers()[0].id;
        setOffsetSetting(id, '2');
        await sleep(450);
        const rows = P.vgroupRows(0);
        const seq = rows.filter((r) => r.type === 'DATA').map((r) => (r.dataIndex == null ? '' : r.dataIndex));
        ok('4m 🔴 32 byte page write（offset 2 byte）⇒ 序號 1…32，最後一個號碼就是 byte 數',
          seq.length === 34 && seq[0] === '' && seq[1] === '' && seq[2] === 1 && seq[33] === 32, JSON.stringify(seq));
        ok('4n 畫面序號欄同樣是 1…32',
          JSON.stringify(seqOfData(0)) === JSON.stringify(seq.map((v) => (v === '' ? '' : String(v)))),
          JSON.stringify(seqOfData(0)).slice(0, 170));

        /* 匯出 —— Bytes */
        const grp = P.decodeGroups()[0];
        grp.analyzer.config.exportLevel = 'bytes';
        const xml = P.i2cExcelXml(0);
        const rowsXml = xml.match(/<Row>[\s\S]*?<\/Row>/g) || [];
        const cells = (rowXml) => (rowXml.match(/<Data[^>]*>([\s\S]*?)<\/Data>/g) || []).map((c) => c.replace(/<[^>]*>/g, ''));
        ok('4o 🔴 匯出（Bytes）表頭第 3 欄 = Data #',
          cells(rowsXml[1])[2] === 'Data #', JSON.stringify(cells(rowsXml[1])));
        ok('4p 🔴 匯出（Bytes）最後一列的 Data # = 32，且與畫面同一個值',
          cells(rowsXml[rowsXml.length - 1])[2] === '32', JSON.stringify(cells(rowsXml[rowsXml.length - 1])));
        ok('4p2 匯出（Bytes）ADDR 列與 offset 列的 Data # 留空',
          cells(rowsXml[2])[2] === '' && cells(rowsXml[3])[2] === '' && cells(rowsXml[4])[2] === '',
          JSON.stringify([cells(rowsXml[2])[2], cells(rowsXml[3])[2], cells(rowsXml[4])[2]]));
        /* 匯出 —— Packets */
        grp.analyzer.config.exportLevel = 'packets';
        const xml2 = P.i2cExcelXml(0);
        const rows2 = xml2.match(/<Row>[\s\S]*?<\/Row>/g) || [];
        ok('4q 🔴 匯出（Packets）第 3 欄 = Data #，值 = 32（這一段的 data byte 數）',
          cells(rows2[1])[2] === 'Data #' && cells(rows2[2])[2] === '32',
          JSON.stringify(cells(rows2[1])) + ' / ' + JSON.stringify(cells(rows2[2])));
      }

      /* 搜尋序號 */
      {
        window.wfgLaSetDecodeSearch('data#32');
        await sleep(300);
        const n = document.querySelectorAll('.wfg-la-decode-table--i2c tbody tr').length;
        ok('4r 🔴 搜尋「data#32」找得到那一列', n === 1, '命中 ' + n + ' 列');
        window.wfgLaSetDecodeSearch('#1');
        await sleep(300);
        const n2 = document.querySelectorAll('.wfg-la-decode-table--i2c tbody tr').length;
        ok('4s 🔴 既有的「#N」搜尋（只比對 START 列的 Packet 編號）沒有被改掉', n2 === 1, '命中 ' + n2 + ' 列');
        window.wfgLaSetDecodeSearch('');
        await sleep(200);
      }

      ok('頁面全程沒有未處理的例外', ERRS.length === 0, ERRS.slice(0, 3).join(' | '));
    } catch (e) {
      ok('🔴 probe 自己爆了：' + (e && e.message ? e.message : e), false, e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' / ') : '');
    }
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
