/* ═══════════════════════════════════════════════════════════════════════════
   common/dpcd-link.js — DPCD 位址 → aux.html 說明的超連結（單一來源）
   由來（Bruce 2026-10-24）：「在第三部分 log 這個地方，應該要跟 LA 的網頁一樣。要可以超連結連動到 AUX 的網頁做查詢說明」
   原本只有 LA（wfg.html 的 wfgLaDpcdLookupUrl）有這段；i2c.html 的 DPCD／IOA 工具要用同一套，
   所以搬來這裡，wfg.html 改成呼叫這一支（不留第二份）。
   格式：aux.html?auxTab=dpcd&dpcd=<5 位 16 進位>[&val=<2 位 16 進位>]，由 aux.html 的 auxApplyUrlParams 讀取。
   API（window.DpcdLink）：
     fmt(addr)              5 位大寫 16 進位（例 0x100 ⇒ '00100'）
     url(addr, val)         相對本頁目錄的 aux.html 網址（pathname＋search）；val 可省略
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  function fmt(addr) { return (Number(addr) >>> 0).toString(16).toUpperCase().padStart(5, '0'); }
  function url(addr, val) {
    var u = new URL('aux.html', g.location.href);
    u.searchParams.set('auxTab', 'dpcd');
    u.searchParams.set('dpcd', fmt(addr));
    if (val !== undefined && val !== null && val !== '') u.searchParams.set('val', String(val).toUpperCase().replace(/^0X/i, '').padStart(2, '0').slice(-2));
    else u.searchParams.delete('val');
    return u.pathname + u.search;
  }
  g.DpcdLink = { VERSION: '1.0', fmt: fmt, url: url };
})(typeof window !== 'undefined' ? window : globalThis);
