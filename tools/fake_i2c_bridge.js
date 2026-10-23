/* ═══════════════════════════════════════════════════════════════════════════
   fake_i2c_bridge.js — 測試用假 I2C and AUX Bridge（jsdom 的 window.WebSocket 替身）
   install(w, mode)：mode＝'none'（沒有 Bridge：連線失敗）／'ok'（Bridge 在、可連線）
   'ok' 時每則請求回 { id, ok:true }；ping 另回 helper／proto；read 回 len 個 0。
   w.__fakeWs＝最後一條連線；.drop() 模擬 Bridge 被關掉（伺服器端斷線）。
   只給 tools/check_*.js 用，不進網頁。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
function install(w, mode) {
  function FakeWS(url) {
    const ws = this; ws.url = url; ws.readyState = 0; ws.sent = [];
    w.__fakeWs = ws;
    if (mode === 'throw') throw new Error('no ws');
    setTimeout(() => {
      if (mode !== 'ok') { ws.readyState = 3; if (ws.onerror) ws.onerror({}); if (ws.onclose) ws.onclose({}); return; }
      ws.readyState = 1; if (ws.onopen) ws.onopen({});
    }, 5);
    ws.send = s => {
      let m; try { m = JSON.parse(s); } catch (e) { return; }
      ws.sent.push(m);
      const r = { id: m.id, ok: true, type: m.type };
      if (m.type === 'ping') Object.assign(r, { helper: '1.17.0', proto: 6, type: 'pong' });
      if (m.type === 'read') r.data = new Array(m.len || 1).fill(0);
      setTimeout(() => { if (ws.readyState === 1 && ws.onmessage) ws.onmessage({ data: JSON.stringify(r) }); }, 1);
    };
    ws.close = () => { if (ws.readyState === 3) return; ws.readyState = 3; setTimeout(() => { if (ws.onclose) ws.onclose({}); }, 1); };
    ws.drop = () => { if (ws.readyState === 3) return; ws.readyState = 3; if (ws.onclose) ws.onclose({}); };
    ws.addEventListener = (ev, fn) => { ws['on' + ev] = fn; };
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  w.WebSocket = FakeWS;
}
module.exports = { install };
