/* 同事B 10/19：從 PQ Tools 匯入開始的這一輪按「清空」⇒ 回到「匯入 PQ Tools 量測資料」視窗。 */
(async function () { try {
  await __boot(1500);
  var sel = $('dg-preset-select');
  function fill() {
    sel.value = sel.options[sel.options.length - 1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // ── PQ 入口（DG_PQ、還沒選工作模式）
  DG_WMODE = null; DG_PQ = true; dgWmodeSync();
  fill();
  __ok('PQ: three parts filled before clear', dgPartFilled('lut') && dgPartFilled('gray') && dgPartFilled('prim'));
  __ok('PQ: modal closed before clear', !$('dg-modal-pq').classList.contains('open'));
  $('dg-btn-clear').click();
  __ok('PQ: clear opens the PQ import modal', $('dg-modal-pq').classList.contains('open'));
  __ok('PQ: modal is on the file step', !!document.querySelector('#dg-modal-pq [data-step="file"]') &&
       getComputedStyle(document.querySelector('#dg-modal-pq [data-step="file"]')).display !== 'none');
  __ok('PQ: three parts cleared', !dgPartFilled('lut') && !dgPartFilled('gray') && !dgPartFilled('prim'));
  __ok('PQ: hint shown', $('dg-pq-status').style.display !== 'none' && /RaydiumCCT/.test($('dg-pq-status').textContent), $('dg-pq-status').textContent);
  __ok('PQ: still in PQ round (bag stays open)', DG_PQ === true && DG_WMODE === null && $('dg-main-cards').style.display !== 'none');
  __ok('PQ: round reset to 1', DG_ROUND === 1);
  ['en', 'zh-CN'].forEach(function (lang) {
    var s = (I18N['dg.pqCleared'] || {})[lang] || '';
    __ok('PQ: hint ' + lang, /RaydiumCCT/.test(s) && s !== I18N['dg.pqCleared']['zh-TW'], s);
  });
  $('dg-modal-pq-close') ? $('dg-modal-pq-close').click() : dgStepModalClose('dg-modal-pq');
  __ok('PQ: close works', !$('dg-modal-pq').classList.contains('open'));

  // ── 電腦畫面入口：清空不開 PQ 視窗（行為不變）
  DG_WMODE = 'pc'; DG_PQ = false; dgWmodeSync();
  fill();
  $('dg-btn-clear').click();
  __ok('PC: clear does not open the PQ modal', !$('dg-modal-pq').classList.contains('open'));
  __ok('PC: three parts cleared', !dgPartFilled('lut') && !dgPartFilled('gray') && !dgPartFilled('prim'));
} catch (e) { __ok('scenario exception', false, String(e.stack || e)); }
__done(); })();
