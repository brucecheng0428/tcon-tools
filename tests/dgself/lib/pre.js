/* tests/dgself/lib/pre.js — 放在 <head> 最前面、比頁面程式早跑。
   · 收集 JS 錯誤到 window.__errs（最後一併回報，有錯就算失敗）。
   · window.__asFromDg 為 true 時假裝「由 DG 開啟」：假的 window.opener（記下 postMessage／focus），
     再加上可控的分頁可見度（window.__hid ⇒ document.hidden／visibilityState／hasFocus）。
   runner 會在這支之前先定義 window.__expectVer、window.__asFromDg 與各情境的選項（__caseI 等）。 */
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push('error: ' + e.message + ' @' + (e.filename || '') + ':' + e.lineno); });
window.addEventListener('unhandledrejection', function (e) { window.__errs.push('unhandled: ' + (e.reason && e.reason.stack || e.reason)); });
if (window.__asFromDg) {
  window.__focusCalls = 0; window.__openerMsgs = [];
  window.opener = { closed: false,
    postMessage: function (m) { window.__openerMsgs.push(m); },
    focus: function () { window.__focusCalls++; } };
  window.__hid = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return window.__hid; } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return window.__hid ? 'hidden' : 'visible'; } });
  document.hasFocus = function () { return !window.__hid; };
}
