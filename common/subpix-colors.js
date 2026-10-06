/* ═══════════════════════════════════════════════════════════════════════════
   subpix-colors.js — R／G／B sub-pixel 底色的單一來源（2026-10-07）
   ───────────────────────────────────────────────────────────────────────────
   Bruce 2026-10-07：「data mapping 的格子顏色…B 實在是太像紫色了…仿照那個 4×4 pixel
   調整後的顏色來做。」⇒ Pattern 分頁手動 4×4 編輯格（pattern.html pgCellColor）與
   Data Mapping 分頁的 R／G／B 格子**共用這一支**，兩頁以後一起變。
   ・css(c, v)：c ＝ 0／1／2（R／G／B），v ＝ 0..255 灰階。輸出字串與 pattern v3.8.2 的
     pgCellColor 逐字相同（'rgb(v,0,0)'…），Pattern 頁外觀不變。
   ・textOn(r, g, b)：依 WCAG 對比度挑黑或白字，深色／淺色底都看得清楚。
   瀏覽器下掛在 window.TCONSubpix，node 下 module.exports。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  function rgbOf(c, v) {
    v = v | 0;
    if (c === 0) return [v, 0, 0];
    if (c === 1) return [0, v, 0];
    return [0, 0, v];
  }
  function css(c, v) { var a = rgbOf(c, v); return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
  function lin(x) { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
  function lum(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
  /* 黑字對比 (L+0.05)/0.05、白字對比 1.05/(L+0.05)，取大的那個 */
  function textOn(r, g, b) { var L = lum(r, g, b); return ((L + 0.05) / 0.05 >= 1.05 / (L + 0.05)) ? '#000' : '#fff'; }
  var API = { rgbOf: rgbOf, css: css, textOn: textOn, lum: lum };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.TCONSubpix = API;
})(typeof window !== 'undefined' ? window : this);
