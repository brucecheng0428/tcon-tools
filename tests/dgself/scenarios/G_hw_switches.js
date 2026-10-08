/* G：硬體卡三組開關（I2C 治具、DG_EN、光學量測儀）同一套 ON／OFF 元件：連線中／中斷、連線失敗原因、量測儀取消選埠、
   「全頁只有一個實心藍」主按鈕規則、收合時三個都在摘要列、量測中停用、三語、版號。用假 WebSocket／假 Web Serial 走真正的連線函式。 */
(async function () {
  try {
    function lb(id) { var e = document.querySelector('#' + id + ' .dst-sw-lb'); return e ? e.textContent : null; }
    function ic(id) { var e = document.querySelector('#' + id + ' .dst-sw-ic'); return e ? e.textContent : null; }
    function bg(id) { return getComputedStyle(document.getElementById(id)).backgroundColor; }
    function par(id) { var e = document.getElementById(id); return e && e.parentNode ? e.parentNode.id : null; }
    function mains() { return Array.prototype.map.call(document.querySelectorAll('.dst-main'), function (e) { return e.id; }); }
    function nexts() { return Array.prototype.map.call(document.querySelectorAll('.dst-sw .next'), function (e) { return e.id; }); }
    var GREEN = 'rgb(22, 163, 74)', GRAY = 'rgb(100, 116, 139)';
    // fake WebSocket for the real dstConnect()/dstDisconnect()
    window.WebSocket = function (url) {
      var ws = __fakeWs(); ws.readyState = 0;
      var send0 = ws.send;
      ws.send = function (t) {
        var m = JSON.parse(t);
        if (m.type === 'ping' || m.type === 'open') {
          var rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0, helper: 'v9.9.9', proto: 3, channels: 1 };
          setTimeout(function () { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, window.__replyDelay || 0);
          return;
        }
        send0(t);
      };
      ws.close = function () { if (ws.readyState === 3) return; ws.readyState = 3; setTimeout(function () { if (ws.onclose) ws.onclose(); }, 0); };
      setTimeout(function () {
        if (window.__wsFail) { if (ws.onerror) ws.onerror(); }
        else { ws.readyState = 1; if (ws.onopen) ws.onopen(); }
      }, 50);
      return ws;
    };
    window.WebSocket.OPEN = 1;
    // fake Web Serial
    function fakePort() {
      /* 2026-10-09 去偶發：開埠延遲 300 → 1200ms，讓「連線中…」中間態夠長，不會在 CI 卡頓時被錯過 */
      return { open: function () { return window.__portOpenFail ? Promise.reject(new Error('Failed to open serial port.')) : new Promise(function (r) { setTimeout(r, 1200); }); },
        close: function () { return Promise.resolve(); },
        writable: { getWriter: function () { return { write: function () { return Promise.resolve(); }, releaseLock: function () {} }; } },
        readable: { getReader: function () { return { read: function () { return new Promise(function () {}); }, cancel: function () { return Promise.resolve(); }, releaseLock: function () {} }; } } };
    }
    window.__reqPort = 0;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      getPorts: function () { return Promise.resolve([]); },
      requestPort: function () { window.__reqPort++; return window.__cancelPick ? Promise.reject(new DOMException('No port selected by the user.', 'NotFoundError')) : Promise.resolve(fakePort()); } } });
    dstCaCmd = async function (cmd) { return 'OK00'; };

    await __boot(700);
    var box = document.getElementById('dst-hw-more');
    await __until(function () { return box.open && par('dst-lnsw') === 'dst-lnsw-slot-row' && par('dst-casw') === 'dst-casw-slot-row'; });
    // ── G1 nothing connected
    __ok('G1 three switches built once each', ['ln', 'dg', 'ca'].every(function (k) { return document.querySelectorAll('#dst-' + k + 'sw').length === 1; }));
    __ok('G1 old connect buttons gone', !document.getElementById('dst-link') && !document.getElementById('dst-ca'));
    __ok('G1 box open, I2C switch in its row, OFF lit gray ●', box.open && par('dst-lnsw') === 'dst-lnsw-slot-row' && bg('dst-lnsw-off') === GRAY && ic('dst-lnsw-off') === '●' && ic('dst-lnsw-on') === '○', bg('dst-lnsw-off'));
    __ok('G1 meter switch in its row, OFF lit', par('dst-casw') === 'dst-casw-slot-row' && bg('dst-casw-off') === GRAY);
    __ok('G1 DG_EN switch hidden (no IC)', document.getElementById('dst-dgsw').classList.contains('dst-hidden'));
    __ok('G1 main rule: no solid blue, I2C ON has blue ring', mains().length === 0 && nexts().join() === 'dst-lnsw-on', 'main=' + mains() + ' next=' + nexts());
    // ── G2 connect I2C (slow bridge)
    // 2026-10-09 去偶發：第一筆（ping）回覆延遲 1000ms，讓「連線中…」中間態夠長；點下後「等到出現連線中…」才判斷，
    // 看到之後其餘命令回到原本的慢 Bridge（150ms）。
    window.__replyDelay = 1000;
    document.getElementById('dst-lnsw-on').click(); await __until(function () { return lb('dst-lnsw-on') === '連線中…'; }, 1000);
    __ok('G2 connecting: ON shows ◌ 連線中… dashed, both disabled', lb('dst-lnsw-on') === '連線中…' && ic('dst-lnsw-on') === '◌' && getComputedStyle(document.getElementById('dst-lnsw-on')).borderTopStyle === 'dashed' && __dis('dst-lnsw-on') && __dis('dst-lnsw-off'), lb('dst-lnsw-on'));
    __ok('G2 connecting: no blue ring', nexts().length === 0, nexts().join());
    window.__replyDelay = 150;
    await __until(function () { return !dstBusy && !dstLnPending; }, 30000);
    window.__replyDelay = 0;
    __ok('G3 connected: ON lit green ●, label ON', dstLinked && bg('dst-lnsw-on') === GREEN && ic('dst-lnsw-on') === '●' && lb('dst-lnsw-on') === 'ON' && !__cls('dst-lnsw-on', 'pending'), 'linked=' + dstLinked + ' ic=' + (dstIc && dstIc.key));
    __ok('G3 bridge version shown', /v9\.9\.9/.test(__txt('dst-v-bridge')), __txt('dst-v-bridge'));
    // ── G4 disconnect
    window.__replyDelay = 1000;
    document.getElementById('dst-lnsw-off').click(); await __until(function () { return lb('dst-lnsw-off') === '切換中…'; }, 1000);
    var midOff = lb('dst-lnsw-off');
    window.__replyDelay = 300;
    await __until(function () { return !dstBusy && !dstLnPending; }, 20000);
    window.__replyDelay = 0;
    __ok('G4 disconnect: OFF showed 切換中… then OFF lit', midOff === '切換中…' && !dstLinked && bg('dst-lnsw-off') === GRAY, midOff);
    // ── G5 connect fails (bridge not running)
    window.__wsFail = true;
    document.getElementById('dst-lnsw-on').click();
    await __until(function () { return !dstBusy && !dstLnPending && __txt('dst-say-link').length > 0; }, 20000);
    __ok('G5 fail: back to OFF, reason shown', !dstLinked && __cls('dst-lnsw-off', 'on') && !__cls('dst-lnsw-on', 'pending') && lb('dst-lnsw-on') === 'ON' && __txt('dst-say-link').length > 0, __txt('dst-say-link'));
    window.__wsFail = false;
    // ── G6 meter: user cancels the port picker
    window.__cancelPick = true;
    document.getElementById('dst-casw-on').click();
    await __until(function () { return !dstCaPending && /No port selected/.test(__txt('dst-say-link')); }, 20000);
    __ok('G6 meter cancel: picker asked, back to OFF, reason in hw card', window.__reqPort === 1 && !dstCaLinked && __cls('dst-casw-off', 'on') && /No port selected/.test(__txt('dst-say-link')), __txt('dst-say-link'));
    window.__cancelPick = false;
    // ── G7 meter connects
    document.getElementById('dst-casw-on').click(); await __until(function () { return lb('dst-casw-on') === '連線中…'; }, 1200);
    __ok('G7 meter connecting: ◌ 連線中…', lb('dst-casw-on') === '連線中…' && ic('dst-casw-on') === '◌');
    await __until(function () { return !dstCaPending && dstCaLinked; }, 20000);
    __ok('G7 meter connected: ON green', dstCaLinked && bg('dst-casw-on') === GREEN && lb('dst-casw-on') === 'ON');
    // ── G8 main rule with I2C linked (arm = linked + EM02A1)
    await __arm(); await __settle();
    dstCaLinked = false; dstRenderBtns(); await __wait(100);
    __ok('G8 IC ok, meter off: meter ON ring, no solid blue', mains().length === 0 && nexts().join() === 'dst-casw-on', 'main=' + mains() + ' next=' + nexts());
    dstCaLinked = true; dstRenderBtns(); await __wait(100);
    __ok('G8 all connected: exactly one solid blue, it is a step button, no ring', mains().length === 1 && /^dst-go-/.test(mains()[0]) && nexts().length === 0, 'main=' + mains());
    dstIc = null; dstRenderBtns(); await __wait(100);
    __ok('G8 IC unknown: solid blue = 重新識別', mains().join() === 'dst-probe' && nexts().length === 0, 'main=' + mains());
    await __arm(); dstCaLinked = true; dstRenderBtns(); await __settle();
    // ── G9 collapsed: all three in the summary
    box.open = false; await __until(function () { return par('dst-lnsw') === 'dst-lnsw-slot-sum' && par('dst-dgsw') === 'dst-dgsw-slot-sum' && par('dst-casw') === 'dst-casw-slot-sum'; });
    __ok('G9 collapsed: all three switches in summary', par('dst-lnsw') === 'dst-lnsw-slot-sum' && par('dst-dgsw') === 'dst-dgsw-slot-sum' && par('dst-casw') === 'dst-casw-slot-sum');
    __ok('G9 summary labels visible', __vis('dst-lnsw') && getComputedStyle(document.querySelector('#dst-lnsw .dst-sw-t')).display !== 'none', document.querySelector('#dst-lnsw .dst-sw-t').textContent);
    document.getElementById('dst-lnsw-on').click(); await __wait(100);
    __ok('G9 clicking the lit side in summary: no toggle, no action', !box.open && dstLinked && !dstLnPending);
    box.open = true; await __until(function () { return par('dst-lnsw') === 'dst-lnsw-slot-row' && par('dst-casw') === 'dst-casw-slot-row'; });
    __ok('G9 expanded: back in rows, names hidden there', par('dst-lnsw') === 'dst-lnsw-slot-row' && par('dst-casw') === 'dst-casw-slot-row' && getComputedStyle(document.querySelector('#dst-lnsw .dst-sw-t')).display === 'none');
    // ── G10 running: disabled but state colour kept
    dstRunning = true; dstRenderBtns(); await __wait(50);
    __ok('G10 running: both connection switches disabled, ON keeps green', __dis('dst-lnsw-on') && __dis('dst-lnsw-off') && __dis('dst-casw-on') && __dis('dst-casw-off') && bg('dst-lnsw-on') === GREEN && bg('dst-casw-on') === GREEN);
    dstRunning = false; dstRenderBtns();
    // ── G11 languages
    applyLang('en'); await __wait(100);
    __ok('G11 en: ON/OFF + names', lb('dst-lnsw-on') === 'ON' && lb('dst-casw-off') === 'OFF' && /I2C/.test(document.querySelector('#dst-lnsw .dst-sw-t').textContent), document.querySelector('#dst-casw .dst-sw-t').textContent);
    dstCaPending = 'on'; dstCaLinked = false; dstRenderBtns();
    __ok('G11 en: Connecting…', lb('dst-casw-on') === 'Connecting…', lb('dst-casw-on'));
    applyLang('zh-CN'); dstRenderBtns();
    __ok('G11 zh-CN: 连线中…', lb('dst-casw-on') === '连线中…', lb('dst-casw-on'));
    dstCaPending = null; dstCaLinked = true; applyLang('zh-TW'); dstRenderBtns();
    __checkVersion('G12');
  } catch (e) { __ok('G exception', false, String(e && e.stack || e)); }
  __done();
})();
