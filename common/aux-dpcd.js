/* ═══════════════════════════════════════════════════════════════════════════
   common/aux-dpcd.js — i2c.html「DPCD／IOA 工具」（只在 AUX 模式出現）
   Bruce 2026-10-23：照 AUX_GUI 1.48.0 的 DPCD 分頁；跟我們家 T-CON 無關，任何廠牌的 sink 都能用；
   連線不送任何初始化；螢幕要能自己選。🔴 不下「內建／外接」結論（Bruce 2026-10-23「是不是內建的由使用者自己來判斷」），
   只列事實：編號、\\.\DISPLAYn、EDID、Windows 回報接口（outputTechnology 原話）、我家 TCON 有沒有回應（實測）。
   出處（反編譯 Raydium_AUX_GUI 1.48.0，只讀）：
     App/E_DPCD_OPERATION.cs        操作與 script 開頭碼：9 DPCD Read｜8 DPCD Write｜1 IOA Read｜0 IOA Write｜5 IOA Read MOT｜4 IOA Write MOT｜Sleep
     App/DpcdWrapper.cs:226–239     script 正規式（RegexDpcdFormat／RegexScriptComment／RegexScriptSleep）
     App/DpcdWrapper.cs:891–1135    執行：非 AMD 逐行（DPCD_Read/Write、I2C_Read/Write）；AMD 把「IOA 寫 offset ＋ 下一筆 IOA 讀」合成一次 IOA_Read
     App/DpcdWrapper.cs:301–355     log 兩欄：Data（0x …）／AUX Analyzer（SYS DPCD RD n bytes from [0x…]、ACK + 0x…、NACK）
     FormMain.cs:2644–2660          ADD：{碼}{位址 19:16} {15:8} {7:0} {長度−1}[ 資料…]
   bridge（1.23.0／proto 10）：auxlist（只讀：Initial、DPCD 0x000／0x400、EDID、Windows DisplayConfig）、
     open raw:1（只 Initial）、dpcdread／dpcdwrite、i2craw、ioaread。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var VERSION = '1.0';
  var T = {
    tabFlow: ['讀寫流程', 'Read/write flow', '读写流程'],
    tabTool: ['DPCD／IOA 工具', 'DPCD / IOA tool', 'DPCD／IOA 工具'],
    intro: ['通用 DPCD／IOA 測試：不限廠牌、連線不送任何初始化，只送你列的那幾筆。', 'Generic DPCD / IOA test: any sink, no initialisation on connect; only the lines you list are sent.', '通用 DPCD／IOA 测试：不限厂牌、连接不送任何初始化，只送你列的那几笔。'],
    secDisp: ['① 選螢幕', '① Pick the display', '① 选屏幕'],
    btnList: ['列出螢幕', 'List displays', '列出屏幕'],
    btnCheck: ['Check 我家 TCON', 'Check our TCON', 'Check 我家 TCON'],
    checkTip: ['只讀 DPCD 0x43C（瑞鼎 T-CON 名稱），不寫任何東西', 'Reads DPCD 0x43C only (Raydium T-CON name); writes nothing', '只读 DPCD 0x43C（瑞鼎 T-CON 名称），不写任何东西'],
    listTip: ['只讀：每台 Initial、讀 DPCD 0x000／0x400 與 EDID，不寫入', 'Read-only: Initial, DPCD 0x000 / 0x400 and EDID on each display; nothing is written', '只读：每台 Initial、读 DPCD 0x000／0x400 与 EDID，不写入'],
    listing: ['列出中…', 'Listing…', '列出中…'],
    none: ['沒有 AUX 開得起來的螢幕', 'No display opens over AUX', '没有 AUX 打得开的屏幕'],
    needBridge: ['要 I2C and AUX Bridge 1.23.0 以上', 'Needs I2C and AUX Bridge 1.23.0 or later', '要 I2C and AUX Bridge 1.23.0 以上'],
    colNo: ['編號', 'No.', '编号'], colGpu: ['GPU', 'GPU', 'GPU'], colName: ['名稱（Windows／EDID）', 'Name (Windows / EDID)', '名称（Windows／EDID）'],
    colConn: ['Windows 回報接口', 'Connector (reported by Windows)', 'Windows 回报接口'], colDpcd: ['DPCD', 'DPCD', 'DPCD'], colTcon: ['我家 TCON', 'Our TCON', '我家 TCON'],
    techDp: ['DisplayPort', 'DisplayPort', 'DisplayPort'], techEdp: ['內嵌 DisplayPort（eDP）', 'Embedded DisplayPort (eDP)', '内嵌 DisplayPort（eDP）'],
    techHdmi: ['HDMI', 'HDMI', 'HDMI'], techUnk: ['未知', 'unknown', '未知'],
    connTag: ['Windows 回報接口：{v}', 'Connector reported by Windows: {v}', 'Windows 回报接口：{v}'],
    mon: ['螢幕 {m}', 'display {m}', '屏幕 {m}'],
    isOurs: ['我家 TCON 回應（{n}）', 'our TCON answered ({n})', '我家 TCON 回应（{n}）'], notChecked: ['—', '—', '—'], notOurs: ['沒有回應', 'no answer', '没有回应'],
    btnConn: ['連線（不初始化）', 'Connect (no init)', '连接（不初始化）'],
    btnDisc: ['中斷', 'Disconnect', '断开'],
    linked: ['已連線（AUX · {d}）', 'Connected (AUX · {d})', '已连接（AUX · {d}）'],
    notLinked: ['未連線', 'Not connected', '未连接'],
    pickFirst: ['先列出螢幕並選一台', 'List the displays and pick one first', '先列出屏幕并选一台'],
    secScript: ['② Script', '② Script', '② Script'],
    op: ['操作', 'Operation', '操作'], addr: ['位址(h)', 'Address(h)', '地址(h)'], bytes: ['Bytes', 'Bytes', 'Bytes'], data: ['資料(h)', 'Data(h)', '数据(h)'],
    addrIoa: ['Slave(h)', 'Slave(h)', 'Slave(h)'], sleepMs: ['毫秒', 'ms', '毫秒'],
    btnAdd: ['＋ 加入', '+ Add', '＋ 加入'],
    btnRun: ['▶ 依序執行', '▶ Run', '▶ 依序执行'], btnStop: ['中止', 'Stop', '中止'],
    btnLoad: ['載入 script', 'Load script', '载入 script'], btnSave: ['存成 script', 'Save script', '存成 script'],
    btnClear: ['清除 log', 'Clear log', '清除 log'], btnCsv: ['存 log（CSV）', 'Save log (CSV)', '存 log（CSV）'],
    ioaNote: ['IOA ＝ I2C over AUX：要靠 sink 轉送到它的 I2C 匯流排，不同板子不一定接得到（例如 7D／7E 要經 M-Bus）。', 'IOA = I2C over AUX: the sink has to forward it to its I2C bus; not every board reaches every slave (e.g. 7D / 7E need the M-Bus).', 'IOA ＝ I2C over AUX：要靠 sink 转送到它的 I2C 总线，不同板子不一定接得到（例如 7D／7E 要经 M-Bus）。'],
    fmtNote: ['一行一筆：碼 9 DPCD 讀、8 DPCD 寫、1／0 IOA 讀／寫、5／4 IOA 讀／寫（MOT）；例「90 00 00 00」＝讀 DPCD 0x00000 一個 byte。「Sleep 10 ms」、「// 註解」。', 'One line each: 9 DPCD read, 8 DPCD write, 1 / 0 IOA read / write, 5 / 4 IOA read / write (MOT); e.g. "90 00 00 00" reads 1 byte at DPCD 0x00000. "Sleep 10 ms", "// comment".', '一行一笔：码 9 DPCD 读、8 DPCD 写、1／0 IOA 读／写、5／4 IOA 读／写（MOT）；例「90 00 00 00」＝读 DPCD 0x00000 一个 byte。「Sleep 10 ms」、「// 注释」。'],
    secLog: ['③ Log', '③ Log', '③ Log'], colData: ['Data', 'Data', 'Data'], colAna: ['說明', 'AUX Analyzer', '说明'],
    errLine: ['第 {n} 筆 Script 格式不正確：{l}', 'Line {n} is not a valid script line: {l}', '第 {n} 笔 Script 格式不正确：{l}'],
    errAddN: ['Bytes 數量與資料數量不同', 'Bytes does not match the number of data bytes', 'Bytes 数量与数据数量不同'],
    errAddr: ['位址要 5 位以內的十六進位（IOA 是 7-bit slave，00–7F）', 'Address: up to 5 hex digits (IOA: 7-bit slave 00–7F)', '地址要 5 位以内的十六进制（IOA 是 7-bit slave，00–7F）'],
    errData: ['資料要十六進位 byte，用空白分開', 'Data: hex bytes separated by spaces', '数据要十六进制 byte，用空格分开'],
    errNotLinked: ['還沒連線（先在 ① 按「連線（不初始化）」）', 'Not connected (press “Connect (no init)” in ① first)', '还没连接（先在 ① 按「连接（不初始化）」）'],
    errEmpty: ['Script 是空的', 'The script is empty', 'Script 是空的'],
    errAmdOff: ['AMD：IOA 寫 offset 只能 1 或 2 byte 才能跟下一筆讀合併', 'AMD: the IOA offset write must be 1 or 2 bytes to merge with the next read', 'AMD：IOA 写 offset 只能 1 或 2 byte 才能跟下一笔读合并'],
    confirmHead: ['即將寫入：\n目標：{d}\n\n', 'About to write:\nTarget: {d}\n\n', '即将写入：\n目标：{d}\n\n'],
    confirmTail: ['\n共 {n} 筆寫入。確定要送出嗎？', '\n{n} write(s). Send them?', '\n共 {n} 笔写入。确定要送出吗？'],
    cancelled: ['已取消，沒有送出', 'Cancelled; nothing was sent', '已取消，没有送出'],
    done: ['完成 {n} 筆（{ms} ms）', 'Done: {n} line(s) ({ms} ms)', '完成 {n} 笔（{ms} ms）'],
    stopped: ['已中止（做完 {n} 筆）', 'Stopped after {n} line(s)', '已中止（做完 {n} 笔）'],
    rawFlow: ['目前是 DPCD／IOA 工具的連線（不初始化），讀寫流程的 T-CON 操作已停用；要用請先中斷，再按 ① 的「連線」。', 'This is a DPCD / IOA tool connection (no init); T-CON operations in the read/write flow are disabled. Disconnect, then press “Connect” in ①.', '目前是 DPCD／IOA 工具的连接（不初始化），读写流程的 T-CON 操作已停用；要用请先断开，再按 ① 的「连接」。'],
    oursFound: ['找到我家 TCON：{d}（已自動選這台）', 'Found our TCON: {d} (selected)', '找到我家 TCON：{d}（已自动选这台）'],
    oursNone: ['沒有螢幕回應我家 TCON（0x43C 不是 E5 03）', 'No display answered as our TCON (0x43C is not E5 03)', '没有屏幕回应我家 TCON（0x43C 不是 E5 03）']
  };
  var OPS = [
    { k: 'dr', c: '9', n: 'DPCD Read' }, { k: 'dw', c: '8', n: 'DPCD Write' },
    { k: 'ir', c: '1', n: 'IOA Read' }, { k: 'iw', c: '0', n: 'IOA Write' },
    { k: 'irm', c: '5', n: 'IOA Read MOT' }, { k: 'iwm', c: '4', n: 'IOA Write MOT' },
    { k: 'sl', c: 'S', n: 'Sleep' }
  ];
  var RX_CMD = /^((?:[951])|(?:[840]))([0-9a-fA-F])((?: [0-9a-fA-F]{2}){2}) (0[0-9a-fA-F])((?: [0-9a-fA-F]{2}){0,16})$/;
  var RX_SLEEP = /^sleep ?([0-9]|[1-9][0-9]{1,4}|100000)( ?ms)?$/i;
  var RX_COMMENT = /^\/\/.+$/;

  function langIdx() { var l = (g.document && g.document.documentElement.lang) || 'zh-TW'; return l === 'en' ? 1 : (l === 'zh-CN' ? 2 : 0); }
  function t(k, v) { var a = T[k]; if (!a) return k; var s = a[langIdx()] || a[0]; if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(String(v[n])); }); return s; }
  function h2(n) { return ('0' + ((n | 0) & 0xFF).toString(16).toUpperCase()).slice(-2); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ── script 解析（DpcdWrapper.ScriptAnalyzer 同規則；寫入的資料數要等於長度，否則不合法） ── */
  function parseLine(line) {
    var s = String(line || '').trim();
    if (!s || RX_COMMENT.test(s)) return { skip: true };
    var m = RX_SLEEP.exec(s);
    if (m) return { op: 'sl', ms: parseInt(m[1], 10), src: s };
    m = RX_CMD.exec(s);
    if (!m) return null;
    var c = m[1], ah = parseInt(m[2], 16), ab = m[3].trim().split(' ');
    var addr = (ah << 16) | (parseInt(ab[0], 16) << 8) | parseInt(ab[1], 16);
    var n = parseInt(m[4], 16) + 1;
    var data = m[5] ? m[5].trim().split(' ').map(function (x) { return parseInt(x, 16); }) : [];
    var op = { '9': 'dr', '8': 'dw', '1': 'ir', '0': 'iw', '5': 'irm', '4': 'iwm' }[c];
    var isW = (op === 'dw' || op === 'iw' || op === 'iwm');
    if (isW && data.length !== n) return null;
    if (!isW && data.length) return null;
    if (op[0] === 'i' && addr > 0x7F) return null;
    return { op: op, addr: addr, n: n, data: data, w: isW, mot: (op === 'irm' || op === 'iwm'), ioa: op[0] === 'i', src: s };
  }
  function parseScript(text) {
    var lines = String(text || '').split(/\r?\n/), out = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parseLine(lines[i]);
      if (!p) return { err: t('errLine', { n: i + 1, l: lines[i].trim() }) };
      if (!p.skip) out.push(p);
    }
    return { list: out };
  }
  /* FormMain.ButtonDpcdAdd_Click 的格式 */
  function makeLine(opk, addr, n, data, ms) {
    if (opk === 'sl') return 'Sleep ' + (ms | 0) + ' ms';
    var o = OPS.filter(function (x) { return x.k === opk; })[0];
    var s = o.c + ((addr >> 16) & 0xF).toString(16).toUpperCase() + ' ' + h2(addr >> 8) + ' ' + h2(addr) + ' ' + h2(n - 1);
    if (data && data.length) s += ' ' + data.map(h2).join(' ');
    return s;
  }
  /* AMD：DpcdWrapper.ScriptAmdRun —— IOA 寫（offset）＋ 下一筆 IOA 讀 ⇒ 一次 IOA_Read；之後連續的 IOA 讀位址往下接 */
  function plan(list, amd) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (amd && a.ioa && a.w && i + 1 < list.length && list[i + 1].ioa && !list[i + 1].w) {
        if (a.n !== 1 && a.n !== 2) return { err: t('errAmdOff') };
        var start = a.n === 2 ? ((a.data[0] << 8) | a.data[1]) : a.data[0], j = i + 1, first = true;
        while (j < list.length && list[j].ioa && !list[j].w && list[j].addr === a.addr) {
          out.push({ kind: 'ioaread', slave: a.addr, obytes: a.n, start: start, n: list[j].n, src: list[j], pre: first ? a : null });
          start += list[j].n; first = false; j++;
          if (!list[j - 1].mot) break;
        }
        i = j - 1; continue;
      }
      if (amd && a.ioa && !a.w) { out.push({ kind: 'ioaread', slave: a.addr, obytes: 0, start: 0, n: a.n, src: a, pre: null }); continue; }
      out.push({ kind: a.op, src: a });
    }
    return { steps: out };
  }

  /* 沒持有 AUX 時，另開一條 WebSocket 只送 auxlist（bridge 端只讀：Initial／Release、DPCD 0x000／0x400、EDID；不碰治具） */
  function listTemp(url, tcon) {
    return new Promise(function (resolve) {
      var ws, done = false, fin = function (r) { if (done) return; done = true; try { ws.close(); } catch (e) {} resolve(r); };
      try { ws = new WebSocket(url); } catch (e) { resolve({ ok: false, err: String(e && e.message || e) }); return; }
      ws.onopen = function () { ws.send(JSON.stringify({ type: 'auxlist', id: 1, tcon: tcon ? 1 : 0 })); };
      ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.cmd === 'auxlist') fin(m); };
      ws.onerror = function () { fin({ ok: false, err: 'I2C and AUX Bridge not reachable' }); };
      setTimeout(function () { fin({ ok: false, err: 'auxlist: no reply in 30 s' }); }, 30000);
    });
  }
  /* ── 狀態 ── */
  var H = null;              /* 頁面給的接口 */
  var S = { tab: 'flow', disp: [], win: [], winApi: false, sel: -1, checked: false, running: false, abort: false, log: [], target: null };
  function $(id) { return g.document.getElementById(id); }
  /* Bruce 2026-10-23：不下「內建／外接」結論，只列 Windows 原話（outputTechnology），由使用者判斷 */
  function techText(d) {
    if (!d.win) return t('techUnk');
    var id = d.win.techId >>> 0;
    if (id === 10) return t('techDp');
    if (id === 11) return t('techEdp');
    if (id === 5) return t('techHdmi');
    return d.win.tech || t('techUnk');
  }
  function hasWin() { return S.winApi; }
  function dispName(d) {
    var parts = [d.cardName + ' · ' + t('mon', { m: d.monitor })];
    if (d.win && d.win.gdi) parts.push(d.win.gdi);
    if (d.win && d.win.name) parts.push(d.win.name);
    if (d.edid) parts.push('EDID ' + d.edid.mfg + ' ' + d.edid.prod + (d.edid.name ? ' ' + d.edid.name : ''));
    if (hasWin()) parts.push(t('connTag', { v: techText(d) }));
    if (d.ours) parts.push(t('isOurs', { n: d.ours }));
    return parts.join(' · ');
  }
  function oursName(d) { return (d.tcon43c && d.tcon43c[0] === 0xE5 && d.tcon43c[1] === 0x03) ? 'E503' : ''; }

  function render() {
    var p = $('dpcd-panel'); if (!p) return;
    var linked = H && H.rawLinked();
    var rows = S.disp.map(function (d, i) {
      return '<tr' + (d.ours ? ' class="dp-ours"' : '') + '><td><input type="radio" name="dp-sel" value="' + i + '"' + (S.sel === i ? ' checked' : '') + (S.running || linked ? ' disabled' : '') + '></td>'
        + '<td class="mono">' + esc(d.cardName) + ' / ' + d.monitor + '</td>'
        + '<td><span class="mono">' + esc((d.win && d.win.gdi) || '') + '</span>' + (d.win && d.win.name ? ' ' + esc(d.win.name) : '')
        + (d.edid ? '<div class="sub mono">EDID ' + esc(d.edid.mfg + ' ' + d.edid.prod + (d.edid.name ? ' · ' + d.edid.name : '')) + '</div>' : '') + '</td>'
        + (hasWin() ? '<td>' + esc(techText(d)) + (d.win ? '<div class="sub mono">' + esc(d.win.tech) + '</div>' : '') + '</td>' : '')
        + '<td class="mono">' + (d.dpcdRev != null ? h2(d.dpcdRev) : '—') + (d.devId ? '<div class="sub">' + esc(d.oui + ' ' + d.devId) + '</div>' : '') + '</td>'
        + '<td>' + (d.tcon43c ? (d.ours ? t('isOurs', { n: d.ours }) : t('notOurs')) : t('notChecked')) + '</td></tr>';
    }).join('');
    var sd = S.sel >= 0 ? S.disp[S.sel] : null;
    var warn = '';
    var opOpts = OPS.map(function (o) { return '<option value="' + o.k + '">' + o.n + '</option>'; }).join('');
    var nOpts = ''; for (var k = 1; k <= 16; k++) nOpts += '<option value="' + k + '">' + h2(k - 1) + '（' + k + '）</option>';
    var keepScript = $('dp-script') ? $('dp-script').value : '';
    var keep = { op: $('dp-op') ? $('dp-op').value : 'dr', addr: $('dp-addr') ? $('dp-addr').value : '00000', n: $('dp-n') ? $('dp-n').value : '1', data: $('dp-data') ? $('dp-data').value : '' };
    p.innerHTML =
      '<div class="note">' + esc(t('intro')) + '</div>'
      + '<div class="card stp"><div class="stp-hd"><span class="stp-t">' + esc(t('secDisp')) + '</span></div>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">'
      + '<button id="dp-list" title="' + esc(t('listTip')) + '"' + (S.running || linked ? ' disabled' : '') + '>' + esc(t('btnList')) + '</button>'
      + '<button id="dp-check" title="' + esc(t('checkTip')) + '"' + (S.running || linked ? ' disabled' : '') + '>' + esc(t('btnCheck')) + '</button>'
      + '<button id="dp-conn" class="pri"' + (S.running || (!linked && !sd) ? ' disabled' : '') + '>' + esc(linked ? t('btnDisc') : t('btnConn')) + '</button>'
      + '<span id="dp-state" class="' + (linked ? 'ok' : 'sub') + '">' + esc(linked ? t('linked', { d: S.target ? dispName(S.target) : '' }) : (sd ? '' : t('pickFirst'))) + '</span></div>'
      + '<div id="dp-msg" class="sub" style="margin-top:6px"></div>'
      + (S.disp.length ? '<div class="dp-tw"><table class="dp-t"><thead><tr><th></th><th>' + t('colNo') + '</th><th>' + t('colName') + '</th>' + (hasWin() ? '<th>' + t('colConn') + '</th>' : '') + '<th>' + t('colDpcd') + '</th><th>' + t('colTcon') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '')
      + (warn ? '<div id="dp-warn" class="dp-warn">' + esc(warn) + '</div>' : '')
      + '</div>'
      + '<div class="card stp"><div class="stp-hd"><span class="stp-t">' + esc(t('secScript')) + '</span></div>'
      + '<div class="row dp-add" style="gap:6px;flex-wrap:wrap;align-items:flex-end">'
      + '<label class="f">' + t('op') + '<select id="dp-op">' + opOpts + '</select></label>'
      + '<label class="f"><span id="dp-addr-l">' + t('addr') + '</span><input id="dp-addr" class="mono" size="7" value="00000"></label>'
      + '<label class="f">' + t('bytes') + '<select id="dp-n">' + nOpts + '</select></label>'
      + '<label class="f" style="flex:1;min-width:180px"><span id="dp-data-l">' + t('data') + '</span><input id="dp-data" class="mono" style="width:100%"></label>'
      + '<button id="dp-add">' + esc(t('btnAdd')) + '</button></div>'
      + '<div class="sub" style="margin:6px 0">' + esc(t('fmtNote')) + '</div>'
      + '<div class="sub dp-ioa">' + esc(t('ioaNote')) + '</div>'
      + '<textarea id="dp-script" class="mono" rows="8" spellcheck="false" style="width:100%"></textarea>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">'
      + '<button id="dp-run" class="pri"' + (S.running ? ' disabled' : '') + '>' + esc(t('btnRun')) + '</button>'
      + '<button id="dp-stop"' + (S.running ? '' : ' disabled') + '>' + esc(t('btnStop')) + '</button>'
      + '<button id="dp-load">' + esc(t('btnLoad')) + '</button><input type="file" id="dp-file" accept=".txt,text/plain" multiple hidden>'
      + '<button id="dp-save">' + esc(t('btnSave')) + '</button>'
      + '<span id="dp-prog" class="sub"></span></div></div>'
      + '<div class="card stp"><div class="stp-hd"><span class="stp-t">' + esc(t('secLog')) + '</span>'
      + '<span style="margin-left:auto;display:inline-flex;gap:6px"><button id="dp-clear">' + esc(t('btnClear')) + '</button><button id="dp-csv">' + esc(t('btnCsv')) + '</button></span></div>'
      + '<div class="dp-tw"><table class="dp-t mono"><thead><tr><th>#</th><th>' + t('colData') + '</th><th>' + t('colAna') + '</th></tr></thead><tbody id="dp-log">'
      + S.log.map(logRow).join('') + '</tbody></table></div></div>';
    $('dp-script').value = keepScript;
    $('dp-op').value = keep.op; $('dp-addr').value = keep.addr; $('dp-n').value = keep.n; $('dp-data').value = keep.data;
    syncAdd();
    wire();
  }
  function logRow(r, i) { return '<tr class="' + (r.bad ? 'bad' : (r.rx ? 'rx' : '')) + '"><td>' + (i + 1) + '</td><td>' + esc(r.d) + '</td><td>' + esc(r.a) + '</td></tr>'; }
  function addLog(d, a, bad, rx) {
    S.log.push({ d: d, a: a, bad: !!bad, rx: !!rx });
    var tb = $('dp-log'); if (tb) { tb.insertAdjacentHTML('beforeend', logRow(S.log[S.log.length - 1], S.log.length - 1)); var w = tb.closest('.dp-tw'); if (w) w.scrollTop = w.scrollHeight; }
  }
  function msg(s, bad) { var m = $('dp-msg'); if (m) { m.textContent = s || ''; m.className = bad ? 'err' : 'sub'; } }
  function syncAdd() {
    var op = $('dp-op').value, w = (op === 'dw' || op === 'iw' || op === 'iwm');
    $('dp-addr').disabled = op === 'sl'; $('dp-n').disabled = op === 'sl';
    $('dp-data').disabled = !(w || op === 'sl');
    $('dp-addr-l').textContent = op[0] === 'i' ? t('addrIoa') : t('addr');
    $('dp-data-l').textContent = op === 'sl' ? t('sleepMs') : t('data');
  }
  function addFromInputs() {
    var op = $('dp-op').value;
    if (op === 'sl') { var ms = parseInt($('dp-data').value, 10); if (!(ms >= 0 && ms <= 100000)) { msg(t('errData'), true); return; } appendLine(makeLine('sl', 0, 0, null, ms)); return; }
    var as = $('dp-addr').value.trim().replace(/^0x/i, ''), addr = parseInt(as, 16), n = parseInt($('dp-n').value, 10);
    if (!/^[0-9a-fA-F]{1,5}$/.test(as) || (op[0] === 'i' && addr > 0x7F)) { msg(t('errAddr'), true); return; }
    var data = [];
    if (op === 'dw' || op === 'iw' || op === 'iwm') {
      var parts = $('dp-data').value.trim().split(/\s+/).filter(Boolean);
      if (parts.some(function (x) { return !/^(0x)?[0-9a-fA-F]{1,2}$/i.test(x); })) { msg(t('errData'), true); return; }
      data = parts.map(function (x) { return parseInt(x.replace(/^0x/i, ''), 16); });
      if (data.length !== n) { msg(t('errAddN'), true); return; }
    }
    appendLine(makeLine(op, addr, n, data));
  }
  function appendLine(l) { var ta = $('dp-script'); ta.value = (ta.value && !/\n$/.test(ta.value) ? ta.value + '\n' : ta.value) + l + '\n'; msg(''); }

  function wire() {
    $('dp-op').onchange = syncAdd;
    $('dp-add').onclick = addFromInputs;
    $('dp-list').onclick = function () { list(false); };
    $('dp-check').onclick = function () { list(true); };
    Array.prototype.forEach.call(g.document.querySelectorAll('input[name="dp-sel"]'), function (r) {
      r.onchange = function () { pick(parseInt(r.value, 10), true); };
    });
    $('dp-conn').onclick = function () { if (H.rawLinked()) H.disconnect().then(render); else connect(); };
    $('dp-run').onclick = run;
    $('dp-stop').onclick = function () { S.abort = true; };
    $('dp-load').onclick = function () { $('dp-file').click(); };
    $('dp-file').onchange = function () { loadFiles(this.files); this.value = ''; };
    $('dp-save').onclick = function () { download('dpcd_script.txt', $('dp-script').value, 'text/plain'); };
    $('dp-clear').onclick = function () { S.log = []; render(); };
    $('dp-csv').onclick = function () {
      var csv = 'Data,AUX Analyzer\r\n' + S.log.map(function (r) { return '"' + r.d.replace(/"/g, '""') + '","' + r.a.replace(/"/g, '""') + '"'; }).join('\r\n');
      download('dpcd_logs.csv', '﻿' + csv, 'text/csv');
    };
  }
  function download(name, text, type) {
    var a = g.document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name;
    g.document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function loadFiles(files) {
    var arr = Array.prototype.slice.call(files || []), out = [];
    var next = function (i) {
      if (i >= arr.length) { $('dp-script').value = out.join('\n') + (out.length ? '\n' : ''); var p = parseScript($('dp-script').value); msg(p.err || '', !!p.err); return; }
      var r = new FileReader(); r.onload = function () { out.push(String(r.result).replace(/\s+$/, '')); next(i + 1); }; r.readAsText(arr[i]);
    };
    next(0);
  }

  /* ── 螢幕清單（bridge auxlist，只讀） ── */
  function list(checkTcon) {
    msg(t('listing'));
    return H.auxlist(checkTcon).then(function (r) {
      if (!r || !r.ok) { msg((r && r.err) || t('needBridge'), true); return; }
      S.disp = (r.displays || []).map(function (d) { d.ours = d.tcon43c ? oursName(d) : ''; return d; });
      S.win = r.windows || []; S.checked = !!checkTcon; S.winApi = S.win.length > 0;
      /* 預設：Check 找到我家 TCON 回應的那台；否則只有一台就選它；其餘由使用者自己選（不替他猜內建／外接） */
      var ours = S.disp.map(function (d, i) { return d.ours ? i : -1; }).filter(function (i) { return i >= 0; });
      S.sel = ours.length === 1 ? ours[0] : (S.disp.length === 1 ? 0 : -1);
      render();
      if (!S.disp.length) msg(t('none'), true);
      else if (checkTcon) msg(ours.length ? t('oursFound', { d: dispName(S.disp[ours[0]]) }) : t('oursNone'), !ours.length);
      else msg('');
    }, function (e) { msg(String(e && e.message || e), true); });
  }
  function pick(i, byUser) {
    var d = S.disp[i]; if (!d) return;
    void byUser; S.sel = i; render();
  }
  function connect() {
    var d = S.disp[S.sel]; if (!d) { msg(t('pickFirst'), true); return; }
    S.target = d;
    H.connectRaw(d.card, d.monitor).then(function (ok) { render(); if (!ok) msg(H.lastErr() || 'open failed', true); });
  }

  /* ── 執行 ── */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hexs(a) { return (a || []).map(h2).join(' '); }
  function run() {
    if (S.running) return;
    if (!H.rawLinked()) { msg(t('errNotLinked'), true); return; }
    var p = parseScript($('dp-script').value);
    if (p.err) { msg(p.err, true); return; }
    if (!p.list.length) { msg(t('errEmpty'), true); return; }
    var info = H.auxInfo() || {}, amd = /AMD/i.test(info.card || '');
    var pl = plan(p.list, amd); if (pl.err) { msg(pl.err, true); return; }
    var writes = p.list.filter(function (x) { return x.w; });
    if (writes.length) {
      var d = S.target || {}, txt = t('confirmHead', { d: dispName(d) })
        + writes.slice(0, 20).map(function (x) { return '  ' + x.src; }).join('\n') + (writes.length > 20 ? '\n  …' : '') + t('confirmTail', { n: writes.length });
      if (!g.confirm(txt)) { msg(t('cancelled')); return; }
    }
    S.running = true; S.abort = false; render();
    var t0 = Date.now(), k = 0;
    var step = function () {
      if (S.abort) { S.running = false; render(); msg(t('stopped', { n: k })); return; }
      if (k >= pl.steps.length) { S.running = false; render(); msg(t('done', { n: p.list.length, ms: Date.now() - t0 })); return; }
      var s = pl.steps[k++], a = s.src, pr = $('dp-prog'); if (pr) pr.textContent = k + ' / ' + pl.steps.length;
      return exec(s, a).then(step, function (e) { addLog('', String(e && e.message || e), true); S.running = false; render(); msg(String(e && e.message || e), true); });
    };
    step();
  }
  function exec(s, a) {
    if (s.kind === 'sl') return sleep(a.ms);
    if (s.kind === 'dr') { addLog('0x ' + a.src, 'SYS DPCD RD ' + a.n + ' bytes from [0x' + ('0000' + a.addr.toString(16).toUpperCase()).slice(-5) + ']');
      return H.send({ type: 'dpcdread', addr: a.addr, len: a.n }).then(function (r) { if (r.ok) addLog('0x 00 ' + hexs(r.data), 'ACK + 0x' + (r.data || []).map(h2).join(''), false, true); else addLog('', 'NACK' + (r.err ? '（' + r.err + '）' : ''), true); }); }
    if (s.kind === 'dw') { addLog('0x ' + a.src, 'SYS DPCD WR ' + a.n + ' bytes to [0x' + ('0000' + a.addr.toString(16).toUpperCase()).slice(-5) + '] + 0x' + a.data.map(h2).join(''));
      return H.send({ type: 'dpcdwrite', addr: a.addr, data: a.data }).then(function (r) { addLog(r.ok ? '0x 00' : '', r.ok ? 'ACK' : ('NACK' + (r.err ? '（' + r.err + '）' : '')), !r.ok, r.ok); }); }
    if (s.kind === 'ioaread') {
      if (s.pre) addLog('0x ' + s.pre.src, 'SYS I2C WR(MOT = ' + (s.pre.mot ? 1 : 0) + ') ' + s.pre.n + ' bytes to [0x' + h2(s.slave) + '] + 0x' + s.pre.data.map(h2).join('') + ' (I2C over AUX)');
      addLog('0x ' + a.src, 'SYS I2C RD(MOT = ' + (a.mot ? 1 : 0) + ') ' + s.n + ' bytes from [0x' + h2(s.slave) + '] (I2C over AUX' + (s.obytes ? ', AMD IOA_Read offset 0x' + s.start.toString(16).toUpperCase() : ', AMD IOA_Read') + ')');
      return H.send({ type: 'ioaread', slave: s.slave, obytes: s.obytes, start: s.start, len: s.n }).then(function (r) { if (r.ok) addLog('0x 00 ' + hexs(r.data), 'ACK + 0x' + (r.data || []).map(h2).join(''), false, true); else addLog('', 'NACK' + (r.err ? '（' + r.err + '）' : ''), true); });
    }
    if (a.ioa) {
      if (a.w) { addLog('0x ' + a.src, 'SYS I2C WR(MOT = ' + (a.mot ? 1 : 0) + ') ' + a.n + ' bytes to [0x' + h2(a.addr) + '] + 0x' + a.data.map(h2).join('') + ' (I2C over AUX)');
        return H.send({ type: 'i2craw', dir: 'w', addr: a.addr, data: a.data, mot: a.mot ? 1 : 0 }).then(function (r) { addLog(r.ok ? '0x 00' : '', r.ok ? 'ACK' : ('NACK' + (r.err ? '（' + r.err + '）' : '')), !r.ok, r.ok); }); }
      addLog('0x ' + a.src, 'SYS I2C RD(MOT = ' + (a.mot ? 1 : 0) + ') ' + a.n + ' bytes from [0x' + h2(a.addr) + '] (I2C over AUX)');
      return H.send({ type: 'i2craw', dir: 'r', addr: a.addr, len: a.n, mot: a.mot ? 1 : 0 }).then(function (r) { if (r.ok) addLog('0x 00 ' + hexs(r.data), 'ACK + 0x' + (r.data || []).map(h2).join(''), false, true); else addLog('', 'NACK' + (r.err ? '（' + r.err + '）' : ''), true); });
    }
    return Promise.resolve();
  }

  /* ── 分頁切換（只在 AUX 模式出現） ── */
  var FLOW_IDS = ['stp-bar', 'stp-next', 'card-conn', 'stp-ck', 'stp-mode', 'stp-run', 'stp-res'];
  function sync(xport) {
    var bar = $('aux-tabs'), p = $('dpcd-panel'); if (!bar || !p) return;
    var aux = xport === 'aux';
    if (!aux && S.tab === 'tool') S.tab = 'flow';
    bar.style.display = aux ? '' : 'none';
    var tool = aux && S.tab === 'tool';
    FLOW_IDS.forEach(function (id) { var e = $(id); if (e) e.style.display = tool ? 'none' : ''; });
    p.style.display = tool ? '' : 'none';
    Array.prototype.forEach.call(bar.querySelectorAll('.mseg-b'), function (b) {
      var on = b.getAttribute('data-tab') === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = t(b.getAttribute('data-tab') === 'tool' ? 'tabTool' : 'tabFlow');
    });
  }
  function setTab(tab) { S.tab = tab; if (H) { H.onTab(tab); } if (tab === 'tool') render(); }
  function init(hooks) {
    H = hooks;
    var bar = $('aux-tabs'); if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll('.mseg-b'), function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); }); });
  }

  g.AuxDpcd = { VERSION: VERSION, init: init, listTemp: listTemp, sync: sync, render: render, setTab: setTab, text: t,
    parseLine: parseLine, parseScript: parseScript, makeLine: makeLine, plan: plan, state: function () { return S; } };
})(typeof window !== 'undefined' ? window : globalThis);
