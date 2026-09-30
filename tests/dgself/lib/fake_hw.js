/* tests/dgself/lib/fake_hw.js — 自檢頁 headless 測試的共用假硬體與斷言工具。
   注入位置：dg-selftest.html 最後那個 IIFE 的結尾（只在暫存副本裡），所以可以直接碰頁面自己的函式與變數。
   ── 假 I2C（__fakeWs）：取代 I2C Bridge 的 WebSocket。
      __regs        暫存器內容；預設 0x005D＝0x0D（EM02A1 DG_EN byte：bit0 開、bit2 12-bit、bit3 target）
      __dgIdle      true ⇒ 讀 0x005D 回 0xFF（匯流排沒回應）
      __lutFill     true ⇒ 沒設過的位址回非零假資料（避免 LUT 讀成全 0 被判 allZero）
      __ignoreWrites true ⇒ rawwrite 回 ok 但不寫進去（模擬「寫了讀回不對」）
      __replyDelay  每筆回覆延遲 ms（用來抓「切換中…」中間態）
      __rawwrites / __readAddrs 記錄所有寫入與讀取位址
   ── __arm()：把頁面接成「I2C 已連線、IC＝EM02A1、量測儀已連線」，量測／出圖 I/O 全部換成假的。
   ── 斷言：__ok(name, cond, info)；結束呼叫 __done()，結果以 JSON 寫進 <pre id="__out">。 */
window.__errs = window.__errs || [];
window.__posted = [];
window.__rawwrites = []; window.__readAddrs = [];
window.__regs = { 0x005D: 0x0D };
window.__dgIdle = false;
function __fakeWs() {
  var ws = { readyState: 1, onmessage: null, close: function () { ws.readyState = 3; },
    send: function (t) {
      var m = JSON.parse(t), rep;
      if (m.type === 'read') { window.__readAddrs.push(m.addr);
        var d = [];
        for (var i = 0; i < m.len; i++) {
          var a = m.addr + i;
          if (a === 0x005D && window.__dgIdle) d.push(0xFF);
          else d.push(window.__regs[a] != null ? window.__regs[a] : (window.__lutFill ? ((a * 37 + 11) & 0xFF) : 0));
        }
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'rawwrite') {
        window.__rawwrites.push({ addr: m.addr, data: m.data.slice(), was: window.__regs[m.addr] });
        if (!window.__ignoreWrites) for (var j = 0; j < m.data.length; j++) window.__regs[m.addr + j] = m.data[j];
        rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0 };
      } else if (m.type === 'write') {
        for (var k = 0; k < m.data.length; k++) window.__regs[m.addr + k] = m.data[k];
        rep = { type: 'result', id: m.id, cmd: 'write', ok: true, status: 0 };
      } else rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0 };
      setTimeout(function () { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, window.__replyDelay || 0);
    } };
  return ws;
}
function __wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function __vis(id) { var e = document.getElementById(id); return !!(e && e.offsetParent); }
function __txt(id) { var e = document.getElementById(id); return e ? String(e.textContent || '').trim() : null; }
function __cls(id, c) { var e = document.getElementById(id); return !!(e && e.classList.contains(c)); }
function __dis(id) { var e = document.getElementById(id); return e ? !!e.disabled : null; }
function __w5d() { return window.__rawwrites.filter(function (w) { return w.addr === 0x005D; }); }
function __lb(id) { var e = document.querySelector('#' + id + ' .dst-sw-lb'); return e ? e.textContent : null; }
function __ic(id) { var e = document.querySelector('#' + id + ' .dst-sw-ic'); return e ? e.textContent : null; }
function __bg(id) { return getComputedStyle(document.getElementById(id)).backgroundColor; }
var __GREEN = 'rgb(22, 163, 74)', __GRAY = 'rgb(100, 116, 139)', __WHITE = 'rgb(255, 255, 255)', __BLUE = 'rgb(37, 99, 235)';
var __res = [];
function __ok(name, cond, info) { __res.push({ name: name, pass: !!cond, info: info === undefined ? '' : String(info) }); }
async function __arm() {
  dstWs = __fakeWs(); dstWs.onmessage = dstOnMessage;
  dstLinked = true;
  dstIc = DST_ICS.filter(function (x) { return x.key === 'EM02A1'; })[0];
  dstCaLinked = true;
  window.__mes = 0; window.__abortAt = 0;
  dstEnterPattern = async function () {}; dstLeavePattern = async function () {};
  dstSetRgb12 = async function () {}; dstCaClose = async function () {};
  dstWaitOrAbort = function () { return Promise.resolve(!dstAbort); };
  dstCaCmd = async function (cmd) {
    if (/^MES/.test(cmd)) { window.__mes++; if (window.__abortAt && window.__mes >= window.__abortAt) dstAbort = true;
      return 'OK00,P1,0,0.3127,0.3290,123.456'; }
    if (/^MVS,([\d.]+)/.test(cmd)) return 'OK00,60.00';
    return 'OK00';
  };
  await dstReadDgEn();
  /* v2.7.4：整頁依序出現 —— __arm() 代表「硬體都好了、也對位過」，既有情境從步驟卡開始測。
     要測各階段的情境（P_page_stages.js）自己把它設回 false。 */
  if (typeof dstAlignDone !== 'undefined') dstAlignDone = true;
  dstRenderBtns(); dstRenderSteps();
}
function __clickSw(which) { document.getElementById(which === 'on' ? 'dst-dgsw-on' : 'dst-dgsw-off').click(); }
/* 版號一致性：runner 由 common/version.js 讀出 dgself 版號放在 window.__expectVer，這裡比對頁面實際吃到的值。 */
function __checkVersion(tag) {
  var badge = (document.querySelector('[data-tool-version="dgself"]') || {}).textContent;
  __ok(tag + ' version = common/version.js (' + window.__expectVer + ')',
    DST_PAGE_VER === window.__expectVer && TOOL_VERSIONS.dgself === window.__expectVer && badge === window.__expectVer,
    'page=' + DST_PAGE_VER + ' badge=' + badge);
}
function __done() {
  var pre = document.createElement('pre'); pre.id = '__out'; pre.style.cssText = 'position:fixed;left:-9999px';
  pre.textContent = '__JSON__' + JSON.stringify({ res: __res, errs: window.__errs }) + '__END__';
  document.body.appendChild(pre);
}
