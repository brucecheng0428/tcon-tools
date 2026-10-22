/* ST：步驟完成狀態一眼看得出來（dg v2.8.1／dgself v2.9.2，common/step-status.*，Bruce 2026-10-23）。
   Bruce：「第一步驟做完以後要做第二步驟，但是第一步驟實在是太不清楚、字太小了…打勾用綠色、字稍微大一點…不要讓我覺得
   完全不知道現在在第幾步驟、之前的到底有沒有做完。不只電腦畫面，量測、自檢這些也都確認一遍…套用全部的步驟」。
   window.__stCase：
     DG   dg.html 電腦畫面流程（7 步：選畫面→第 1／2／3 部分→計算→下載→第 4 部分）：步驟列「第 N 步（共 M 步）」、
          每一點 ✓／目前／灰、目前那一框外框＋「▶ 第 N 步（共 M 步）· 目前這一步」、做完那一行綠圓勾＋已完成 16px；
          第 2 部分只填一半 ⇒ 不打勾（綁既有完成條件）；一路走到下載 ⇒ 第 4 部分是目前這一步；三語
     CONV dg.html「RGB LUT 深度轉換」兩步
     DM   dg-measure.html 4 步（連線→全螢幕→開始量測→量完送回 DG）：只連線 ⇒ 第 2 步；沒真的全螢幕不打勾；
          全螢幕 ⇒ 第 3 步；量完送回 ⇒ 全部完成；換任務 ⇒ 回到第 3 步；英文
     DST  dg-selftest.html（從 DG 開）5 步（連線→對位→①→②③→④）：__arm() 後 ① 是第 3 步；做完 ① ⇒ 第 4 步；
          I2C 斷線 ⇒ 連線那一步回到目前這一步、① 仍是 ✓；不是從 DG 開 ⇒ 沒有步驟列
     __stShot：停在「前一步已完成、目前這一步」的畫面、捲到頁首（截圖用；改版前的頁面也能跑，斷言照實 FAIL）。 */
(async function () {
  var C = window.__stCase || 'DG', SHOT = !!window.__stShot;
  function q(sel) { return document.querySelector(sel); }
  function vis(el) { if (typeof el === 'string') el = document.getElementById(el); if (!el) return false; var r = el.getBoundingClientRect(); return el.offsetParent !== null && r.width > 0 && r.height > 0; }
  function has(id, c) { var e = document.getElementById(id); return !!(e && e.classList.contains(c)); }
  function bar(id) {
    var el = document.getElementById(id); if (!el) return { el: null, shown: false, dots: '', now: '', name: '' };
    var lis = Array.prototype.map.call(el.querySelectorAll('.tc-sb-i'), function (li) {
      return li.classList.contains('tc-sb-done') ? 'D' : li.classList.contains('tc-sb-cur') ? 'C' : 'T'; }).join('');
    var now = el.querySelector('.tc-sb-now');
    return { el: el, shown: vis(el), dots: lis, now: now ? now.textContent : '', name: (el.querySelector('.tc-sb-name') || {}).textContent || '' };
  }
  function cs(sel, prop, pseudo) { var e = q(sel); return e ? getComputedStyle(e, pseudo || null)[prop] : ''; }   // 找不到就回空字串（改版前的頁面也能跑到截圖）
  function tag(id) { var e = document.getElementById(id), t = e && e.querySelector('.tc-cur-tag'); return t ? t.textContent : ''; }
  function curBoxes() {   // 畫面上看得到的「目前這一步」框（另一個分頁裡的不算）
    return Array.prototype.filter.call(document.querySelectorAll('.tc-step-cur'), function (e) { return vis(e); }).map(function (e) { return e.id; }); }
  function greenLine(id) {   // 做完那一行：綠色圓勾＋「已完成」、16px 以上、不透明
    var ln = document.getElementById(id); if (!ln || !vis(ln)) return false;
    var ico = ln.querySelector('.tc-done-ico'), cs = getComputedStyle(ln);
    return !!ico && getComputedStyle(ico).backgroundColor === 'rgb(22, 163, 74)' && parseFloat(cs.fontSize) >= 16
      && parseFloat(cs.opacity) === 1 && /^"(已完成|Done)"$/.test(getComputedStyle(ln, '::after').content);
  }
  async function shot(el) {
    await __wait(300); await __still();   // 頁面自己的平滑捲動（捲到目前這一步）先停下來
    window.scrollTo(0, 0);
    if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - 8));
    await __wait(200);
  }
  try {
    if (C === 'DG' || C === 'CONV') {
      await __boot(1500);
      window.postMessage = function () {};
      var send = function (d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); };
      var rows = function (k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; };
      var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
      if (C === 'CONV') {
        dgSwitchMode('conv'); await __wait(100);
        var b0 = bar('dg-conv-stepbar');
        __ok('ST-CV0 conversion tab: bar "第 1 步（共 2 步）", dots C T, ① has the current tag', b0 && b0.shown && b0.now === '第 1 步（共 2 步）' && b0.dots === 'CT'
          && /第 1 步（共 2 步）/.test(tag('dg-conv-step-imp')), JSON.stringify(b0 && [b0.now, b0.dots]));
        var f = TCONDgLutFmt.fmtFromTcon('EM02', 12, 12, 256), body = [];
        for (var i = 0; i < 256; i++) body.push([i * 16, i * 16, i * 16]);
        var bytes = TCONXlsx.build([{ name: f.sheetName, rows: TCONDgLutFmt.lutRowsForFmt(f, body), merges: f.merges }]);
        dgConvImport(new File([bytes], 'st.xlsx'));
        await __until(function () { return has('dg-conv-step-imp', 'tc-step-done'); });
        var b1 = bar('dg-conv-stepbar');
        __ok('ST-CV1 imported ⇒ "第 2 步（共 2 步）", dots D C, ① green done line, ② current', b1.now === '第 2 步（共 2 步）' && b1.dots === 'DC'
          && greenLine('dg-done-conv-imp') && has('dg-conv-step-dl', 'tc-step-cur') && !has('dg-conv-step-imp', 'tc-step-cur'), b1.now + ' ' + b1.dots);
        var ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
        $('dg-btn-conv-dl').click(); await __until(function () { return has('dg-conv-step-dl', 'tc-step-done'); });
        HTMLAnchorElement.prototype.click = ac;
        var b2 = bar('dg-conv-stepbar');
        __ok('ST-CV2 downloaded ⇒ "✓ 全部 2 步已完成", no current box', b2.now === '✓ 全部 2 步已完成' && b2.dots === 'DD' && curBoxes().length === 0, b2.now + ' ' + curBoxes());
        __done(); return;
      }
      var b = bar('dg-stepbar');
      __ok('ST-D0 nothing chosen ⇒ bar "第 1 步（共 6 步）" (no download step yet), mode card is the current box',
        b && b.shown && b.now === '第 1 步（共 6 步）' && b.dots === 'CTTTTT' && has('dg-card-wmode', 'tc-step-cur')
        && /▶ 第 1 步（共 6 步） · 目前這一步/.test(tag('dg-card-wmode')), JSON.stringify(b && [b.now, b.dots, tag('dg-card-wmode')]));
      DG_WMODE = 'pc'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1; await __wait(50);
      b = bar('dg-stepbar');
      __ok('ST-D1 電腦畫面 chosen ⇒ 7 steps (download is its own step), "第 2 步（共 7 步）：第 1 部分…"', b.now === '第 2 步（共 7 步）' && b.dots === 'DCTTTTT'
        && b.name.indexOf('第 1 部分') === 0, b.now + ' ' + b.dots + ' ' + b.name);
      __ok('ST-D1 mode line = green tick + 已完成, 16px', greenLine('dg-done-wmode') && $('dg-done-wmode').textContent === '✓ ' + dgT('dg.wmodePc'), $('dg-done-wmode').textContent);
      __ok('ST-D1 part 1 box is the current one (thick frame + tag)', curBoxes().join(',') === 'dg-part-lut' && /第 2 步（共 7 步）/.test(tag('dg-part-lut'))
        && getComputedStyle($('dg-part-lut')).borderTopWidth === '2px', curBoxes().join(','));
      dgFillDefault(); dgRefreshReady(); await __wait(100);
      /* 第 2 部分只填灰階、沒有白點 ⇒ 還沒完成，不可以打勾 */
      $('dg-in-gray').value = rows(1).map(function (r) { return r.join('\t'); }).join('\n'); dgRefreshReady(); await __wait(50);
      b = bar('dg-stepbar');
      __ok('ST-D2 part 1 done; part 2 half filled ⇒ NOT ticked, still "第 3 步（共 7 步）"', b.now === '第 3 步（共 7 步）' && b.dots === 'DDCTTTT'
        && !has('dg-part-gray', 'tc-step-done') && greenLine('dg-done-lut') && curBoxes().join(',') === 'dg-part-gray', b.now + ' ' + b.dots);
      __ok('ST-D2 only the current dot is blue-framed; the bar itself has no solid primary button', cs('#dg-stepbar .tc-sb-cur .tc-sb-dot', 'backgroundColor') !== 'rgb(37, 99, 235)');
      if (SHOT) { $('dg-in-gray').blur(); await shot(null); __done(); return; }
      DG_LIVE_TASKS[31] = 'gray'; DG_LIVE_TASK_KIND[31] = 'pc';
      send({ type: 'dg-measure-result', mode: 'gray', task: 31, rows: rows(1), prim: prim, at: 'r1', cmpAsk: true });
      await __until(function () { return has('dg-part-gray', 'tc-step-done') && has('dg-part-prim', 'tc-step-done'); });
      b = bar('dg-stepbar');
      __ok('ST-D3 parts 2/3 measured ⇒ "第 5 步（共 7 步）" = 計算 is current', b.now === '第 5 步（共 7 步）' && b.dots === 'DDDDCTT'
        && curBoxes().join(',') === 'dg-calc-act', b.now + ' ' + b.dots + ' ' + curBoxes());
      $('dg-btn-calc').click();
      await __until(function () { return !!lastLut && has('dg-card-result', 'tc-step-cur'); });
      b = bar('dg-stepbar');
      __ok('ST-D4 calculated ⇒ "第 6 步（共 7 步）" = 下載 (output card has the tag in its header)', b.now === '第 6 步（共 7 步）' && b.dots === 'DDDDDCT'
        && q('#dg-card-result > .card-header .tc-cur-tag') && /第 6 步（共 7 步）/.test(q('#dg-card-result > .card-header .tc-cur-tag').textContent), b.now + ' ' + b.dots);
      var ac2 = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
      $('dg-btn-lutfile').click(); await __until(function () { return $('dg-modal-conf').classList.contains('open'); });
      HTMLAnchorElement.prototype.click = ac2;
      $('dg-btn-conf-no').click(); await __wait(50);
      b = bar('dg-stepbar');
      __ok('ST-D5 downloaded ⇒ "第 7 步（共 7 步）" = 第 4 部分 current', b.now === '第 7 步（共 7 步）' && b.dots === 'DDDDDDC' && has('dg-card-p4', 'tc-step-cur'), b.now + ' ' + b.dots);
      applyLang('en'); await __wait(50);
      b = bar('dg-stepbar');
      __ok('ST-D6 English: "Step 7 of 7", short names, Done label', b.now === 'Step 7 of 7' && q('#dg-stepbar .tc-sb-i .tc-sb-short').textContent === 'Screen'
        && $('dg-done-lut').getAttribute('data-tc-done') === 'Done' && /Step 7 of 7 · Current step/.test(q('#dg-card-p4 .tc-cur-tag').textContent), b.now);
      applyLang('zh-CN'); await __wait(50);
      b = bar('dg-stepbar');
      __ok('ST-D6 简中: "第 7 步（共 7 步）"、"计算"、已完成', b.now === '第 7 步（共 7 步）' && q('#dg-stepbar .tc-sb-i:nth-child(5) .tc-sb-short').textContent === '计算'
        && $('dg-done-lut').getAttribute('data-tc-done') === '已完成' && /当前这一步/.test(q('#dg-card-p4 .tc-cur-tag').textContent), b.now);
      applyLang('zh-TW');
      __ok('ST version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
      __done(); return;
    }

    if (C === 'DM' || C === 'DM-EN') {
      if (C === 'DM-EN') { try { localStorage.setItem('tcon-lang', 'en'); } catch (e) {} }
      await __boot(300);
      window.opener.postMessage = function () {};
      dgmGateLines = function () { return []; };
      try { Object.defineProperty(navigator, 'serial', { configurable: true, value: {} }); } catch (e) {}
      dgmSerialOn = async function () { return true; };
      closePort = async function () {};
      waitOrAbort = function () { return Promise.resolve(); };
      painted = function () { return Promise.resolve(); };
      dgmPaint = async function () { return true; };
      cmd = async function (t) {
        if (/^MES/.test(t)) return 'OK00,P1,0,0.3127,0.3290,123.456';
        if (/^MVS/.test(t)) return 'OK00,60.00';
        return 'OK00';
      };
      var EN = C === 'DM-EN';
      syncFs();
      var m = bar('dgm-steps');
      __ok('ST-M0 opened ⇒ 4-step bar at the bottom, "第 1 步（共 4 步）" = connect', m && m.shown && m.dots === 'CTTT'
        && m.now === (EN ? 'Step 1 of 4' : '第 1 步（共 4 步）') && (EN ? /Connect/.test(m.name) : /連線/.test(m.name)), JSON.stringify(m && [m.now, m.dots, m.name]));
      dgmSetLink(true);
      m = bar('dgm-steps');
      __ok('ST-M1 connected (and still not full screen) ⇒ "第 2 步（共 4 步）", connect ticked green', m.dots === 'DCTT' && m.now === (EN ? 'Step 2 of 4' : '第 2 步（共 4 步）')
        && cs('#dgm-steps .tc-sb-done .tc-sb-dot', 'backgroundColor') === 'rgb(22, 163, 74)', m.now + ' ' + m.dots);
      __ok('ST-M1 bar text readable on this screen (≥ 15px head, ≥ 13px labels)', parseFloat(cs('#dgm-steps .tc-sb-now', 'fontSize')) >= 15
        && parseFloat(cs('#dgm-steps .tc-sb-short', 'fontSize')) >= 13, cs('#dgm-steps .tc-sb-now', 'fontSize'));
      isFs = function () { return true; }; syncFs();
      m = bar('dgm-steps');
      __ok('ST-M2 really full screen ⇒ "第 3 步（共 4 步）" = aim the probe and press start', m.dots === 'DDCT' && m.now === (EN ? 'Step 3 of 4' : '第 3 步（共 4 步）')
        && (EN ? /red ring/.test(m.name) : /紅圈/.test(m.name)), m.now + ' ' + m.dots + ' ' + m.name);
      if (SHOT) { __done(); return; }
      await run(); await __wait(20); syncFs();
      m = bar('dgm-steps');
      __ok('ST-M3 measured and sent back ⇒ "✓ 全部 4 步已完成"', m.dots === 'DDDD' && m.now === (EN ? '✓ All 4 steps done' : '✓ 全部 4 步已完成'), m.now + ' ' + m.dots);
      dgmSetTask({ mode: 'gray', task: 9, dest: '第 4 部分' });
      m = bar('dgm-steps');
      __ok('ST-M4 DG switched to another task ⇒ back to "第 3 步（共 4 步）" (link and full screen still real)', m.dots === 'DDCT', m.now + ' ' + m.dots);
      __done(); return;
    }

    if (C === 'DST' || C === 'DST-NODG') {
      window.__lutFill = true;
      if (window.opener) window.opener.postMessage = function (m) {
        if (m.type === 'dg-cmp-query') setTimeout(function () {
          dstCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: 1, max: 10, list: [], round: dstDgRound, job: dstDgJob, name: 'x', same: null, full: false });
        }, 20);
      };
      await __boot(500); await __arm(); await __settle();
      if (C === 'DST-NODG') {
        __ok('ST-S-NODG opened directly (not from DG) ⇒ no step bar, no current tags', !vis('dst-stepbar') && curBoxes().length === 0, curBoxes().join(','));
        __checkVersion('ST-S-NODG'); throw 'done';
      }
      var s = bar('dst-stepbar');
      __ok('ST-S0 hardware and alignment done ⇒ bar "第 3 步（共 5 步）" = ①, dots D D C T T', s && s.shown && s.now === '第 3 步（共 5 步）' && s.dots === 'DDCTT'
        && s.name === '① 讀回目前的 RGB LUT' && /第 3 步（共 5 步）/.test(tag('dst-box-lut')) && has('dst-box-lut', 'tc-step-cur'), JSON.stringify(s && [s.now, s.dots, s.name]));
      __ok('ST-S0 hardware / picture-test cards collapsed to green ✓ + 已完成', has('dst-hw-card', 'tc-card-done') && has('dst-test-card', 'tc-card-done')
        && cs('#dst-hw-card .dst-pg-ico', 'backgroundColor') === 'rgb(22, 163, 74)'
        && cs('#dst-hw-card > .card-header', 'content', '::after') === '"已完成"');
      await dstStepLut();
      await __untilIdle(function () { return !!dstStepDone.lut && has('dst-box-lut', 'tc-step-done') && has('dst-group23', 'tc-step-cur'); });
      s = bar('dst-stepbar');
      __ok('ST-S1 ① really sent to DG ⇒ ✓ (green, 已完成), "第 4 步（共 5 步）" = ②③', s.now === '第 4 步（共 5 步）' && s.dots === 'DDDCT'
        && greenLine('dst-fs-line-lut') && curBoxes().join(',') === 'dst-group23' && /第 4 步（共 5 步）/.test(tag('dst-group23')), s.now + ' ' + s.dots + ' ' + curBoxes());
      __ok('ST-S1 bar keeps the "only one solid blue" rule (current dot is outlined)', cs('#dst-stepbar .tc-sb-cur .tc-sb-dot', 'backgroundColor') !== __BLUE);
      if (SHOT) { await shot(null); __done(); return; }
      dstLinked = false; dstRenderBtns(); await __wait(50);
      s = bar('dst-stepbar');
      __ok('ST-S2 I2C dropped ⇒ step 1 (connect) is current again; ① stays ✓', s.dots === 'CDDTT' && s.now === '第 1 步（共 5 步）' && has('dst-hw-card', 'tc-step-cur')
        && has('dst-box-lut', 'tc-step-done'), s.now + ' ' + s.dots);
      dstLinked = true; dstRenderBtns(); await __wait(50);
      applyLang('en'); await __wait(50);
      s = bar('dst-stepbar');
      __ok('ST-S3 English: "Step 4 of 5", short names', s.now === 'Step 4 of 5' && q('#dst-stepbar .tc-sb-i .tc-sb-short').textContent === 'Connect', s.now);
      applyLang('zh-TW');
      __checkVersion('ST-S');
    }
  } catch (e) { if (e !== 'done') window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
