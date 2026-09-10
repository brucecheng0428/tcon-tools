/* ═══════════════════════════════════════════════════════════════════════════
   common/zoomprobe.js — 「畫面不是 1:1」的偵測判準（跨頁共用，單一來源）

   出處：本檔的內容原封搬自 `pattern.html` v3.7.0／v3.8.1 的 `pgZoomProbe()`。
   搬出來的理由只有一個：dg-measure.html（DG 即時量測）需要同一組判準，而
   **判準有兩份就一定會分岔**。呈現方式（文案、視窗長相、i18n）留在各頁自己
   決定，這裡只負責「算出現在是不是 1:1」。

   🔴 判準的實測依據（2026-09-09，真實 Chrome、獨立 profile、System Events
      實際按 ⌘+／⌘-；原始表格保留在 pattern.html 該處註解）：

     設定                                       outerW/innerW   devicePixelRatio
     ---------------------------------------------------------------------------
     Retina(dsf 2) + 瀏覽器 100%                   1.00000            2
     Retina(dsf 2) + 瀏覽器 110%                   1.09991            2.2
     Retina(dsf 2) + 瀏覽器 125%                   1.25000            2.5
     Retina(dsf 2) + 瀏覽器 150%                   1.50000            3
     Retina(dsf 2) + 瀏覽器 175%                   1.75182            3.5
     Retina(dsf 2) + 瀏覽器  90%                   0.90023            1.8
     Retina(dsf 2) + 瀏覽器  67%                   0.66667            1.3333
     --force-device-scale-factor=2   + 100%        1.00000            2      ← HiDPI 原生
     --force-device-scale-factor=1.5 + 100%        1.00000            1.5    ← OS 顯示縮放
     （全螢幕下同樣成立：100% → 1.00000、110% → 1.10008、200% → 2.00000）

   ⇒ (A) outerWidth/innerWidth **只反映瀏覽器頁面縮放**，完全不受 HiDPI／OS
         顯示縮放影響 —— 這是「Retina 的 devicePixelRatio 本來就是 2，不可以
         被誤報成放大 200%」的唯一分辨依據。
     (B) OS 顯示縮放要另外看：把瀏覽器縮放除掉之後的 dPR（base）不是整數，
         才代表 1 個 CSS 像素對不到整數個實體像素。
     **兩條判準缺一不可**：只看 dPR 會誤報 Retina；只看比值抓不到 dsf 1.5。

   🔴 反向縮放（CSS transform / zoom 抵銷）刻意不做（Bruce 2026-09-09 裁示）。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  // 瀏覽器的離散縮放檔位
  var STEPS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 4 / 5, 9 / 10, 1,
               11 / 10, 5 / 4, 3 / 2, 7 / 4, 2, 5 / 2, 3, 4, 5];

  function tconZoomProbe() {
    var dpr = w.devicePixelRatio || 1;
    var iw = w.innerWidth || 0, ow = w.outerWidth || 0;
    var raw = (iw > 0 && ow > 0) ? (ow / iw) : 1;
    // 對到瀏覽器的離散縮放檔位。
    // |raw - 1| <= 0.05 一律當成 100%：視窗邊框寬度會混進 outerWidth，這個容差用來吸收它。
    // 縮放檔位最小的一格差距是 ±10%，5% 容差不會把 110%／90% 誤判成 100%。
    var zoom = 1, bestD = Infinity;
    for (var i = 0; i < STEPS.length; i++) {
      var d = Math.abs(raw - STEPS[i]);
      if (d < bestD) { bestD = d; zoom = STEPS[i]; }
    }
    // 不像任何檔位（例如某些瀏覽器的 outerWidth 不可靠）→ 寧可漏報，也不誤報
    var reliable = (bestD <= 0.06);
    if (Math.abs(raw - 1) <= 0.05) { zoom = 1; reliable = true; }
    if (!reliable) zoom = 1;
    var base = dpr / zoom;
    var vv = (w.visualViewport && w.visualViewport.scale) || 1;
    return {
      dpr: dpr, raw: raw, zoom: zoom, base: base, vv: vv, reliable: reliable,
      zoomBad: reliable && Math.abs(zoom - 1) > 1e-6,
      osBad: Math.abs(base - Math.round(base)) > 0.02,
      pinchBad: Math.abs(vv - 1) > 0.01
    };
  }

  w.TCON_ZOOM_STEPS = STEPS;
  w.tconZoomProbe = tconZoomProbe;
})(window);
