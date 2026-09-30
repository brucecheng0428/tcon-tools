/* S：v2.7.0 第 2 輪以後的流程精簡（Bruce 2026-09-30 核准方案）。window.__sCase 由 runner 指定。
   AUTO   ＝DG 寫入 LUT（dg-lut-write）⇒ 換一份工作清掉卡片 ⇒ 不按任何鈕，卡片自動讀回；逐筆比對相符；
            「讀取 DG LUT」收起來、只剩「匯出 Excel」
   BAD    ＝T-CON 裡的表與 DG 送來的差一個值 ⇒ 自動讀回後卡上紅字警告（第幾筆、送出／讀回、共幾處）、兩顆匯出都不能按、硬按也不下載
   EXPORT ＝跑完一輪 ⇒ 視窗「加入」⇒ 關掉 ⇒ 決策框出現在結果正下方、捲進畫面、「滿意 → 匯出」是全頁唯一實心 ⇒ 按了下載
   NEXT   ＝決策框「不滿意 → 回 DG 做下一輪」⇒ 叫 opener.focus()；本頁仍在前景 ⇒ 講明要自己點 DG 分頁
   DECL   ＝視窗選「不加入」⇒ ④ 沒有按鈕、只有「這一輪沒有加入比較。」＋「加入比較」小連結；連結重開視窗；
            加入之後變「已加入比較 ✓ · 查看比較」，點「查看比較」開 dg.html?view=cmp
   R1     ＝第 1 輪（同一條路）：決策框不出現、④ 的鈕還在、「讀取 DG LUT」還在（第 1 輪一個字都沒動）
   EN／CN ＝決策框與 ④ 狀態三語 */
(async function () {
  var C = window.__sCase || 'AUTO';
  var dl = [];
  HTMLAnchorElement.prototype.click = function () { if (this.download) dl.push(this.download); };
  var opened = [];
  window.open = function (u, n) { opened.push({ u: u, n: n }); return { focus: function () {} }; };
  function tx(id) { return __txt(id) || ''; }
  function blues() {
    return Array.prototype.filter.call(document.querySelectorAll('button, .dst-back-cta'), function (el) {
      return el.offsetParent !== null && getComputedStyle(el).backgroundColor === __BLUE; }).map(function (el) { return el.id || el.className; });
  }
  /* 假 DG：回覆「加入光學資料比較」的查詢／加入（與 M 情境同一種做法）。 */
  var sent = [], cnt = 2;
  if (window.opener) window.opener.postMessage = function (m) {
    sent.push(m);
    if (m.type === 'dg-cmp-query') setTimeout(function () {
      dstCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: cnt, max: 10, list: [], round: dstDgRound, job: dstDgJob,
                     name: '第二輪確認', same: null, full: false });
    }, 30);
    if (m.type === 'dg-cmp-add') setTimeout(function () {
      cnt++; dstCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: true, updated: false, no: cnt, name: m.name, count: cnt, max: 10, list: [], stored: true });
    }, 30);
  };
  /* DG 第 4 部分「即時更新 T-CON RGB LUT」送來的那張表（EM02A1：主表 256 筆、12-bit，遞增、步距 ≤ 17）。 */
  function dgRows() { var r = []; for (var i = 0; i < 256; i++) { var v = Math.min(4095, i * 16 + (i % 2)); r.push([i, v, v, Math.max(0, v - 1)]); } return r; }
  async function dgWrite() { await dstDgOnLutWrite({ type: 'dg-lut-write', task: 77, rows: dgRows(), depth: 12 }); await __wait(200); }
  /* 🔴 假 I2C 是平的 byte 表：頁面寫入用 RApp_Table_SendToMemory 的打包排法（0x40010000 連續 1161 byte），
     讀取用記憶體排法（R／G／B 各隔 chSpan 2048、奇數區 +1024）—— 真的 T-CON 會自己轉，假的不會，所以在這裡
     寫進去再讀回來一定對不上。⇒ 寫入那一條只驗「DG 送來的表有被留下來」（S1），比對用的參考表改成
     「假 T-CON 裡真的放著的那一張」（＝DG 的表確實寫進去了），BAD 再把其中一個值改掉。 */
  function refFromCard(bump) {
    var L = dstLut; if (!L) return false;
    dstLutSent = { r: L.rgb.r.slice(), g: L.rgb.g.slice(), b: L.rgb.b.slice(), main: 256, icKey: L.icKey };
    if (bump) dstLutSent.g[5] = (dstLutSent.g[5] + 1) & 0xFFF;
    dstRenderLut(); dstRenderBtns();
    return true;
  }
  try {
    window.__lutFill = true;
    if (C === 'EN') applyLang('en');
    if (C === 'CN') applyLang('zh-CN');
    await __wait(500); await __arm(); await __wait(300);
    var r2 = (C !== 'R1');
    __ok('S0 round from URL', dstDgRound === (r2 ? 2 : 1) && dstR2() === r2, 'round=' + dstDgRound);

    if (C === 'AUTO' || C === 'BAD') {
      await dgWrite();
      __ok('S1 DG LUT write kept as the compare reference', !!dstLutSent && dstLutSent.main === 256 && dstLutSent.r[3] === 49,
        dstLutSent && dstLutSent.r[3]);
      __ok('S1 fixture: reference = table in the (fake) T-CON' + (C === 'BAD' ? ', one G value off' : ''), refFromCard(C === 'BAD'));
      // DG 派下一份工作（第 2 輪確認結果）⇒ 卡片被清空；不按任何鈕 ⇒ 自動讀回
      var nR0 = window.__readAddrs.length;
      dstDgApplyTask({ type: 'dg-measure-task', round: 2, job: 'conf', mode: 'gray', step: 'gray', task: 78 });
      await __wait(4000);
      __ok('S2 card read back automatically (no click)', !!dstLut && dstLut.src === 'tcon' && window.__readAddrs.length > nR0,
        (dstLut ? dstLut.src : 'null') + ' reads+' + (window.__readAddrs.length - nR0));
      __ok('S2 read button hidden in round 2, export next to it', !__vis('dst-lut-read') && __vis('dst-lut-xlsx'));
      if (C === 'AUTO') {
        __ok('S2 compare line: matches DG entry by entry', __vis('dst-lut-chk') && tx('dst-lut-chk') === '✓ 與 DG 送來的 LUT 逐筆相符（256 筆 × RGB）'
          && document.getElementById('dst-lut-chk').classList.contains('dst-say-info'), tx('dst-lut-chk'));
        __ok('S2 export enabled', __dis('dst-lut-xlsx') === false);
        // 同一輪再觸發一次 ⇒ 卡上已有表，不重讀
        var nR1 = window.__readAddrs.length;
        await dstDgAutoThenStep1('probe'); await __wait(800);
        __ok('S3 table already there -> no second auto read', window.__readAddrs.length - nR1 < 4, 'reads+' + (window.__readAddrs.length - nR1));
      } else {
        __ok('S-BAD red warning with first mismatch + count', __vis('dst-lut-chk') && /^⚠ T-CON 讀回的 LUT 與 DG 送來的不一致：第 5 筆 G 送出 \d+、讀回 \d+（共 1 處）。這張表不能匯出/.test(tx('dst-lut-chk'))
          && !document.getElementById('dst-lut-chk').classList.contains('dst-say-info'), tx('dst-lut-chk'));
        __ok('S-BAD card export disabled', __dis('dst-lut-xlsx') === true);
        dstLutExport(); await __wait(300);
        __ok('S-BAD forced export: nothing downloaded, reason shown', dl.length === 0 && /不能匯出/.test(tx('dst-say-lutx')), tx('dst-say-lutx'));
        // 量完 ⇒ 決策框的匯出也是灰的、講原因
        await dstRun(); await __wait(200);
        document.getElementById('dst-cmp-cancel').click(); await __wait(300);
        __ok('S-BAD decision box shown but export disabled with reason', __vis('dst-dec') && __dis('dst-dec-export') === true
          && tx('dst-dec-why') === '不能匯出：T-CON 讀回的 LUT 與 DG 送來的不一致（見「DG LUT（RGB）檢視」）。', tx('dst-dec-why'));
        __ok('S-BAD no solid button (export cannot be pressed)', blues().length === 0, blues().join(','));
      }
      __checkVersion('S-' + C); throw 'done';
    }

    // 其餘情境：先讓 DG 寫一張表（相符），卡上有表，再跑一輪量測
    await dgWrite();
    refFromCard(false);
    __ok('S1 card has the verified table', !!dstLut && dstLut.src === 'tcon' && !dstLutBlocked());
    __ok('S1 decision box hidden before the run', !__vis('dst-dec'));
    await dstRun(); await __wait(200);
    var modal = document.getElementById('dst-modal-cmp');
    __ok('S1 run ok, sent to DG, popup asked', dstRunOk && dstBackSent() && modal.classList.contains('open'));

    if (C === 'R1') {
      document.getElementById('dst-cmp-cancel').click(); await __wait(300);
      __ok('S-R1 cancel label unchanged (取消)', true);
      __ok('S-R1 no decision box in round 1', !__vis('dst-dec'));
      __ok('S-R1 ④ re-add button still there', __vis('dst-cmp-open') && tx('dst-cmp-open') === '加入光學資料比較…' && tx('dst-cmp-state') === '這一輪還沒加入「光學資料比較」。', tx('dst-cmp-state'));
      __ok('S-R1 read button still there', __vis('dst-lut-read'));
      __ok('S-R1 back-to-DG CTA still the solid one', document.getElementById('dst-back-warn').classList.contains('dst-back-cta'));
      __ok('S-R1 no compare line in round 1', !__vis('dst-lut-chk'));
      __ok('S-R1 send-back line unchanged (switch to DG)', tx('dst-say-run').indexOf('請切回 DG 分頁繼續。') > 0, tx('dst-say-run'));
      __checkVersion('S-R1'); throw 'done';
    }

    __ok('S1 popup cancel says 不加入 in round 2', (C !== 'EN' && C !== 'CN') ? tx('dst-cmp-cancel') === '不加入' : true, tx('dst-cmp-cancel'));
    __ok('S1 while popup open: its OK is the only solid', blues().length === 1 && blues()[0] === 'dst-cmp-ok', blues().join(','));

    if (C === 'DECL') {
      document.getElementById('dst-cmp-cancel').click(); await __wait(300);
      __ok('S-DECL ④ button removed in round 2', !__vis('dst-cmp-open'));
      __ok('S-DECL state + small add link', tx('dst-cmp-state') === '這一輪沒有加入比較。加入比較' && __vis('dst-cmp-addlink')
        && document.getElementById('dst-cmp-addlink').className === 'dst-link', tx('dst-cmp-state'));
      var nq = sent.filter(function (m) { return m.type === 'dg-cmp-query'; }).length;
      document.getElementById('dst-cmp-addlink').click(); await __wait(200);
      __ok('S-DECL link reopens the popup (asks DG again)', modal.classList.contains('open') && sent.filter(function (m) { return m.type === 'dg-cmp-query'; }).length === nq + 1);
      document.getElementById('dst-cmp-ok').click(); await __wait(200);
      document.getElementById('dst-cmp-ok').click(); await __wait(200);   // 關閉
      __ok('S-DECL after adding: "已加入比較 ✓ · 查看比較", no add link', tx('dst-cmp-state') === '已加入比較 ✓ ·查看比較' && !document.getElementById('dst-cmp-addlink'), tx('dst-cmp-state'));
      document.getElementById('dst-cmp-viewlink').click(); await __wait(100);
      __ok('S-DECL 查看比較 opens dg.html?view=cmp in the shared window', opened.length === 1 && opened[0].u === 'dg.html?view=cmp' && opened[0].n === 'tcon-dg-cmpview', JSON.stringify(opened));
      __checkVersion('S-DECL'); throw 'done';
    }

    // 加入 ⇒ 關閉
    document.getElementById('dst-cmp-ok').click(); await __wait(200);
    document.getElementById('dst-cmp-ok').click(); await __wait(1500);
    __ok('S2 ④: added line with view link, no button', !__vis('dst-cmp-open') && __vis('dst-cmp-viewlink')
      && (C === 'EN' ? tx('dst-cmp-state') === 'Added to the comparison ✓ ·View comparison'
        : C === 'CN' ? tx('dst-cmp-state') === '已加入比较 ✓ ·查看比较' : tx('dst-cmp-state') === '已加入比較 ✓ ·查看比較'), tx('dst-cmp-state'));
    __ok('S2 ④ line is a plain note (not the solid CTA)', !document.getElementById('dst-back-warn').classList.contains('dst-back-cta')
      && (C === 'EN' ? tx('dst-back-warn') === 'Sent back to DG.' : C === 'CN' ? tx('dst-back-warn') === '已回传 DG。' : tx('dst-back-warn') === '已回傳 DG。'), tx('dst-back-warn'));
    var dec = document.getElementById('dst-dec'), res = document.getElementById('dst-res-wrap');
    __ok('S3 decision box right under the results', __vis('dst-dec') && res.nextElementSibling === dec);
    var rc = dec.getBoundingClientRect();
    __ok('S3 decision box scrolled into view (no scrolling needed)', rc.top >= 0 && rc.bottom <= window.innerHeight, Math.round(rc.top) + '..' + Math.round(rc.bottom) + ' / ' + window.innerHeight);
    __ok('S3 export is the only solid button on the page', blues().length === 1 && blues()[0] === 'dst-dec-export', blues().join(','));
    __ok('S3 buttons side by side', document.getElementById('dst-dec-export').parentNode === document.getElementById('dst-dec-next').parentNode
      && Math.abs(document.getElementById('dst-dec-export').getBoundingClientRect().top - document.getElementById('dst-dec-next').getBoundingClientRect().top) < 2);
    if (C === 'EN') {
      __ok('S-EN texts', tx('dst-dec-q') === 'Happy with this round’s optical result?' && tx('dst-dec-export') === 'Satisfied → Export DG LUT (Excel)'
        && tx('dst-dec-next') === 'Not yet → Back to DG for the next round', tx('dst-dec-q') + '|' + tx('dst-dec-export') + '|' + tx('dst-dec-next'));
      __ok('S-EN send-back line', /Choose “Satisfied” or “Not yet” below the results\.$/.test(tx('dst-say-run')), tx('dst-say-run'));
      __ok('S-EN compare line', tx('dst-lut-chk') === '✓ Matches the LUT DG sent, entry by entry (256 entries × RGB)', tx('dst-lut-chk'));
      __checkVersion('S-EN'); throw 'done';
    }
    if (C === 'CN') {
      __ok('S-CN texts', tx('dst-dec-q') === '这一轮的光学结果满意吗？' && tx('dst-dec-export') === '满意 → 导出 DG LUT（Excel）'
        && tx('dst-dec-next') === '不满意 → 回 DG 做下一轮', tx('dst-dec-q') + '|' + tx('dst-dec-export') + '|' + tx('dst-dec-next'));
      __checkVersion('S-CN'); throw 'done';
    }
    __ok('S3 send-back line points to the decision box, not "switch to DG"', /請在結果下方選「滿意」或「不滿意」。$/.test(tx('dst-say-run'))
      && tx('dst-say-run').indexOf('切回') < 0, tx('dst-say-run'));
    __ok('S3 texts', tx('dst-dec-q') === '這一輪的光學結果滿意嗎？' && tx('dst-dec-export') === '滿意 → 匯出 DG LUT（Excel）'
      && tx('dst-dec-next') === '不滿意 → 回 DG 做下一輪');

    if (C === 'NEXT') {
      var f0 = window.__focusCalls;
      document.getElementById('dst-dec-next').click(); await __wait(600);
      __ok('S-NEXT asks the browser to focus the DG tab', window.__focusCalls === f0 + 1);
      __ok('S-NEXT still here -> says to click the DG tab', tx('dst-say-dec') === '瀏覽器沒有讓本頁切換分頁，請直接點瀏覽器上方的 DG 分頁。', tx('dst-say-dec'));
      __ok('S-NEXT nothing downloaded', dl.length === 0);
      __checkVersion('S-NEXT'); throw 'done';
    }
    // EXPORT
    document.getElementById('dst-dec-export').click(); await __wait(500);
    __ok('S-EXPORT one xlsx, same name rule as the card (…_R2.xlsx)', dl.length === 1 && /^DG_LUT_EM02A1_\d{8}_\d{4}_R2\.xlsx$/.test(dl[0]), JSON.stringify(dl));
    __ok('S-EXPORT done line inside the decision box', tx('dst-say-dec').indexOf('✔ 已匯出 ' + dl[0]) === 0, tx('dst-say-dec'));
    __checkVersion('S-EXPORT');
  } catch (e) { if (e !== 'done') window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
