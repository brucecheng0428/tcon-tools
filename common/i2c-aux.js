/* ═══════════════════════════════════════════════════════════════════════════
   common/i2c-aux.js — DP AUX 連線方式（I2C and AUX Bridge 1.18.0 起，open mode 4）網頁端共用規則
   ───────────────────────────────────────────────────────────────────────────
   Bruce 2026-10-23：「AUX bridge 可以的話跟 i2c bridge 做在一起，用一套轉發就好」
                     「先用 I2C 網頁加入 AUX 控制（但一定要透過 tcon 來控制 i2c，不能直接對 eeprom 也寫入）」
   ⇒ 同一支 I2C and AUX Bridge、同一條 WebSocket、同一組 read／rawwrite／write／batchwrite 訊息；
     選 DP AUX 時 bridge 依 slave 路由到顯示卡 AUX（3E／7C 走 DPCD 視窗、7D／7E 走 I2C-over-AUX）。

   🔴 安全規則有兩道，內容一致：
     ・網頁（本檔 TconAux.check）：送出前擋，訊息三語。
     ・bridge（tools/i2c-bridge/i2c_bridge_aux.h dgh_aux_check）：網頁整個壞掉也擋得住。
     白名單只有 T-CON 的 slave：0x3E、0x7C、0x7D、0x7E。EEPROM 0x50–0x57 讀寫一律擋；
     其他 slave 也擋（AUX 只到得了 T-CON）。DPCD 寫入擋 0x480–0x48F（T-CON 的 EEPROM 控制窗）。
     tools/check_i2c_aux.mjs 比對兩份清單一致。

   API（window.TconAux）：
     MODE（4）、NEED_PROTO（7）、SIMUL_PROTO（8：I2C 治具與 DP AUX 同時使用，bridge 1.19.0）、
     IOA_PROTO（9：3E／7C 讀取走 I2C over AUX、EEPROM 可讀不可寫，bridge 1.20.0）、SLAVES、EE_LO／EE_HI、DPCD_EE_LO／DPCD_EE_HI
     allowed(slave)            這個 slave 在 AUX 模式能不能用
     eeReadOk(proto)           這支 bridge 在 AUX 模式能不能讀 EEPROM（proto ≥ 9）
     check(msg, proto)         送出前檢查一則 bridge 訊息；可以送回 null，不行回 { code, slave }
                               proto ≥ 9：EEPROM 0x50–0x57 的 read 放行（offset 1／2 byte），寫入一律擋

   v1.2（Bruce 2026-10-23「靠 AUX 應該也要可以讀取 EEPROM 的資料，也就是靠 I2C over AUX（簡稱 IOA）的方式去讀 0x50 的內容」）：
     EEPROM 只放行「讀」，寫入照舊擋（Bruce 10-23「不能直接對 eeprom 也寫入」）。舊 bridge（proto ≤ 8）一律擋讀，
     並說要 1.20.0。
     text(code, vars)          錯誤／說明文字（依 <html lang>）
     dpcdWriteOk(addr, n)      raw DPCD 寫入是否放行
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  /* 1.4（2026-10-23 臨時止血，Bruce「不可透過 i2c去讀 7C 跟 7D 喔…實際上客戶端應用不一定是這種解法，所以不可以用 i2c over aux的做法」）：
     7C／7D／7E 在原廠 AUX 流程要靠 IOA（I2C over AUX）打 M-Bus 導通（7E:AB←CD），客戶板 M-Bus 與 C-Bus 不一定相連 ⇒ AUX 模式先只開放
     0x3E（DPCD 視窗 430／431→435，不經 M-Bus）與 EEPROM 0x50–0x57 唯讀（DDC over AUX）。最終方案待 Bruce 決定。 */
  var SLAVES = [0x3E];
  var EE_LO = 0x50, EE_HI = 0x57, DPCD_EE_LO = 0x480, DPCD_EE_HI = 0x48F, IOA_PROTO = 9;
  var BUS = { read: 1, rawwrite: 1, write: 1, batchwrite: 1 };
  var T = {
    ee: ['DP AUX 模式不能直接存取 EEPROM（slave 0x{s}）：EEPROM 只能透過 T-CON 控制。這一筆沒有送出。',
         'DP AUX mode cannot access the EEPROM directly (slave 0x{s}): the EEPROM may only be reached through the T-CON. Nothing was sent.',
         'DP AUX 模式不能直接存取 EEPROM（slave 0x{s}）：EEPROM 只能通过 T-CON 控制。这一笔没有送出。'],
    notTcon: ['DP AUX 模式目前只開放 0x3E（DPCD 視窗）與 EEPROM 0x50–0x57 唯讀；0x7C、0x7D、0x7E 要經 M-Bus，客戶板不一定接通，已暫停。slave 0x{s} 這一筆沒有送出。',
              'DP AUX mode currently allows only 0x3E (DPCD window) and read-only EEPROM 0x50–0x57; 0x7C, 0x7D and 0x7E need the M-Bus, which a customer board may not connect, so they are paused. Slave 0x{s}: nothing was sent.',
              'DP AUX 模式目前只开放 0x3E（DPCD 窗口）与 EEPROM 0x50–0x57 只读；0x7C、0x7D、0x7E 要经 M-Bus，客户板不一定接通，已暂停。slave 0x{s} 这一笔没有送出。'],
    ckManual: ['AUX 模式需手動選擇 TCON', 'AUX mode: select the TCON manually', 'AUX 模式需手动选择 TCON'],
    ckManualTip: ['AUX 認不出這顆 T-CON，請手動選擇 TCON。AUX 只走 DPCD 視窗（3E、7C、43C），不經 M-Bus；需要更多資訊請改用 I2C 治具再按 Check T-CON。',
                  'AUX could not identify this T-CON: select the TCON manually. AUX uses only the DPCD window (3E, 7C, 43C), never the M-Bus; for more, connect with the I2C jig and press Check T-CON.',
                  'AUX 认不出这颗 T-CON，请手动选择 TCON。AUX 只走 DPCD 窗口（3E、7C、43C），不经 M-Bus；需要更多信息请改用 I2C 治具再按 Check T-CON。'],
    ckAuxTip: ['AUX 的 Check T-CON 只走 DPCD 視窗（3E、7C、43C），不送 I2C over AUX、不下 7E:AB←CD；E503 只判到「E503」，不分版本。',
               'AUX Check T-CON uses only the DPCD window (3E, 7C, 43C): no I2C over AUX, no 7E:AB<-CD; E503 is reported as "E503" without the revision.',
               'AUX 的 Check T-CON 只走 DPCD 窗口（3E、7C、43C），不送 I2C over AUX、不下 7E:AB←CD；E503 只判到“E503”，不分版本。'],
    noMbusRead: ['AUX：0x{s} 要經 M-Bus 才讀得到（客戶板不一定接通），這一筆不讀。', 'AUX: 0x{s} is only reachable through the M-Bus (a customer board may not connect it); not read.', 'AUX：0x{s} 要经 M-Bus 才读得到（客户板不一定接通），这一笔不读。'],
    noMbusWrite: ['AUX 的 Check T-CON 不寫入（不下 7E:AB←CD）', 'AUX Check T-CON does not write (no 7E:AB<-CD)', 'AUX 的 Check T-CON 不写入（不下 7E:AB←CD）'],
    awid: ['DP AUX 模式：slave 0x{s} 的 offset 寬度要 {w} byte。這一筆沒有送出。',
           'DP AUX mode: slave 0x{s} needs a {w}-byte offset. Nothing was sent.',
           'DP AUX 模式：slave 0x{s} 的 offset 宽度要 {w} byte。这一笔没有送出。'],
    xport: ['連線方式', 'Connection', '连接方式'],
    jig: ['I2C 治具', 'I2C jig', 'I2C 治具'],
    aux: ['DP AUX（顯示卡）', 'DP AUX (graphics card)', 'DP AUX（显卡）'],
    tipX: ['DP AUX：不用治具，經筆電的顯示卡直接讀寫面板上的 T-CON；只能讀寫 T-CON，不能直接寫 EEPROM。',
           'DP AUX: no jig; reads and writes the panel T-CON through this computer\'s graphics card. T-CON only; the EEPROM cannot be written directly.',
           'DP AUX：不用治具，经笔电的显卡直接读写面板上的 T-CON；只能读写 T-CON，不能直接写 EEPROM。'],
    reconnect: ['連線方式已改，請重新按「連線」。', 'Connection type changed. Press Connect again.', '连接方式已改，请重新按「连接」。'],
    oldBridge: ['這個 I2C and AUX Bridge（{have}）不支援 DP AUX，請下載新版 I2C and AUX Bridge（1.18.0 以上）。',
                'This I2C and AUX Bridge ({have}) does not support DP AUX. Download the new I2C and AUX Bridge (1.18.0 or later).',
                '这个 I2C and AUX Bridge（{have}）不支持 DP AUX，请下载新版 I2C and AUX Bridge（1.18.0 以上）。'],
    info: ['DP AUX：{card} · 螢幕 {mon}', 'DP AUX: {card} · display {mon}', 'DP AUX：{card} · 屏幕 {mon}'],
    adminOk: ['系統管理員 ✔', 'administrator ✔', '系统管理员 ✔'],
    adminNo: ['不是系統管理員', 'not administrator', '不是系统管理员'],
    psrOff: ['PSR 已關（關閉連線時還原）', 'PSR off (restored on disconnect)', 'PSR 已关（关闭连接时还原）'],
    psrOffNat: ['PSR 關', 'PSR off', 'PSR 关'],
    psrOn: ['PSR 開著', 'PSR on', 'PSR 开着'],
    bnAdmin: ['Intel 顯示卡的 AUX 寫入要系統管理員：關掉 I2C and AUX Bridge 黑視窗，在 i2c-aux-bridge.exe 按右鍵 →「以系統管理員身分執行」，再回來按連線。讀取不受影響。',
              'Intel graphics need administrator rights for AUX writes: close the I2C and AUX Bridge window, right-click i2c-aux-bridge.exe → "Run as administrator", then press Connect again. Reads are not affected.',
              'Intel 显卡的 AUX 写入要系统管理员：关掉 I2C and AUX Bridge 黑窗口，在 i2c-aux-bridge.exe 按右键 →「以管理员身份运行」，再回来按连接。读取不受影响。'],
    bnPsr: ['PSR（面板自我更新）還開著，AUX 寫入可能失敗。', 'PSR (panel self refresh) is still on; AUX writes may fail.', 'PSR（面板自我刷新）还开着，AUX 写入可能失败。'],
    /* v1.36.0（I2C and AUX Bridge 1.19.0／proto 8）：I2C 治具與 DP AUX 同時使用 */
    parked: ['{x} 保持連線（切回來不必重連）。', '{x} stays connected (no reconnect when you switch back).', '{x} 保持连接（切回来不必重连）。'],
    resumed: ['切回 {x}：沿用原本的連線。', 'Back to {x}: reusing the existing connection.', '切回 {x}：沿用原本的连接。'],
    simulConnect: ['{x} 保持連線中；這一種請按「連線」（兩種可以同時用）。', '{x} stays connected; press Connect for this one (both can be used at the same time).', '{x} 保持连接中；这一种请按「连接」（两种可以同时用）。'],
    parkedNote: ['{x} 也連著', '{x} also connected', '{x} 也连着'],
    parkedGone: ['保持連線的 {x} 斷了（I2C and AUX Bridge 關閉或被另一頁接手）。', 'The kept {x} connection dropped (I2C and AUX Bridge closed, or another page took it over).', '保持连接的 {x} 断了（I2C and AUX Bridge 关闭或被另一页接手）。'],
    simulOld: ['這個 I2C and AUX Bridge（{have}）比 1.19.0 舊：I2C 治具與 DP AUX 不能同時用，換連線方式會中斷另一種。下載 1.19.0（i2c-aux-bridge.exe）就能同時用。',
               'This I2C and AUX Bridge ({have}) is older than 1.19.0: the I2C jig and DP AUX cannot be used at the same time, and switching drops the other one. Download 1.19.0 (i2c-aux-bridge.exe) to use both at once.',
               '这个 I2C and AUX Bridge（{have}）比 1.19.0 旧：I2C 治具与 DP AUX 不能同时用，换连接方式会中断另一种。下载 1.19.0（i2c-aux-bridge.exe）就能同时用。'],
    noAutoSteal: ['{x} 在另一個頁面使用中，這一頁不自動搶（要拿過來按「接手」）。', '{x} is in use on another page; this page does not grab it automatically (press Take over to get it).', '{x} 在另一个页面使用中，这一页不自动抢（要拿过来按「接手」）。'],
    simulBusyHint: ['要在這一頁同時用另一種，把「連線方式」切成 {x} 再按連線。', 'To use the other type on this page at the same time, set Connection to {x} and press Connect.', '要在这一页同时用另一种，把「连接方式」切成 {x} 再按连接。'],
    tconBusy: ['另一種連線正在對 T-CON 跑一串操作，這一筆排隊等太久沒有送出；等它做完再試一次。', 'The other connection is running a sequence on the T-CON; this request waited too long and was not sent. Try again when it finishes.', '另一种连接正在对 T-CON 跑一串操作，这一笔排队等太久没有送出；等它做完再试一次。'],
    eeOff: ['DP AUX 模式不能直接讀寫 EEPROM（只能透過 T-CON）', 'Not available in DP AUX mode (EEPROM only through the T-CON)', 'DP AUX 模式不能直接读写 EEPROM（只能通过 T-CON）'],
    /* v1.2（bridge 1.20.0／proto 9） */
    eeWrite: ['DP AUX 模式只能讀 EEPROM（I2C over AUX），不能寫（slave 0x{s}）。這一筆沒有送出。',
              'DP AUX mode can only READ the EEPROM (I2C over AUX), not write it (slave 0x{s}). Nothing was sent.',
              'DP AUX 模式只能读 EEPROM（I2C over AUX），不能写（slave 0x{s}）。这一笔没有送出。'],
    eeOld: ['這個 I2C and AUX Bridge（{have}）在 DP AUX 模式不能讀 EEPROM（slave 0x{s}）。下載 1.20.0 以上就能用 I2C over AUX 讀。這一筆沒有送出。',
            'This I2C and AUX Bridge ({have}) cannot read the EEPROM in DP AUX mode (slave 0x{s}). Download 1.20.0 or later to read it over I2C over AUX. Nothing was sent.',
            '这个 I2C and AUX Bridge（{have}）在 DP AUX 模式不能读 EEPROM（slave 0x{s}）。下载 1.20.0 以上就能用 I2C over AUX 读。这一笔没有送出。'],
    eeAwid: ['DP AUX 讀 EEPROM：offset 要 1 或 2 byte（slave 0x{s}）。這一筆沒有送出。',
             'DP AUX EEPROM read: the offset must be 1 or 2 bytes (slave 0x{s}). Nothing was sent.',
             'DP AUX 读 EEPROM：offset 要 1 或 2 byte（slave 0x{s}）。这一笔没有送出。'],
    eeRO: ['DP AUX：EEPROM 只能讀（I2C over AUX），寫入鈕停用', 'DP AUX: EEPROM is read-only (I2C over AUX); writing is disabled', 'DP AUX：EEPROM 只能读（I2C over AUX），写入钮停用'],
    /* v1.3（2026-10-23 實機：AMD、非系統管理員，3E／7C／7D 經 IOA 全回 00 ⇒ 共用辨認錯判成 E503A1 T1）：
       原廠 AUX 工具認 T-CON 前看 DPCD 0x4D1＝DA（Tcon81008.cs Identify）；不是 DA ⇒ T-CON 沒開放，不辨認。 */
    noTcon: ['AUX 讀不到 T-CON（{v} 讀不到：DPCD 位址暫存器寫不進去，通常要用系統管理員執行 I2C and AUX Bridge）', 'AUX cannot reach the T-CON ({v} read failed: the DPCD address register cannot be written; usually run I2C and AUX Bridge as administrator)', 'AUX 读不到 T-CON（{v} 读不到：DPCD 地址寄存器写不进去，通常要用系统管理员执行 I2C and AUX Bridge）'],
    noTconLog: ['DP AUX：讀 3E:0000（DPCD 0x430/0x431→0x435，同原廠 AUX 工具）失敗：{v}。不辨認、不寫入；讀 EEPROM（I2C over AUX）不受影響。', 'DP AUX: reading 3E:0000 (DPCD 0x430/0x431 -> 0x435, as the vendor AUX tool) failed: {v}. No detection, nothing written; EEPROM reads (I2C over AUX) are not affected.', 'DP AUX：读 3E:0000（DPCD 0x430/0x431→0x435，同原厂 AUX 工具）失败：{v}。不辨认、不写入；读 EEPROM（I2C over AUX）不受影响。'],
    bnInit: ['DP AUX 已連線，但 T-CON 初始化沒成功（顯示卡 {card}：DPCD 寫入失敗）。讀取會改走 I2C over AUX；要寫入 T-CON，請關掉 I2C and AUX Bridge 黑視窗，在 i2c-aux-bridge.exe 按右鍵 →「以系統管理員身分執行」，再按連線。',
             'DP AUX is connected but the T-CON init did not succeed ({card} graphics: DPCD writes fail). Reads go over I2C over AUX; to write the T-CON, close the I2C and AUX Bridge window, right-click i2c-aux-bridge.exe → "Run as administrator", then press Connect again.',
             'DP AUX 已连接，但 T-CON 初始化没成功（显卡 {card}：DPCD 写入失败）。读取会改走 I2C over AUX；要写入 T-CON，请关掉 I2C and AUX Bridge 黑窗口，在 i2c-aux-bridge.exe 按右键 →「以管理员身份运行」，再按连接。']
  };
  function langIdx() {
    var l = (g.document && g.document.documentElement && g.document.documentElement.lang) || 'zh-TW';
    return l === 'en' ? 1 : (l === 'zh-CN' ? 2 : 0);
  }
  function text(k, v) {
    var a = T[k]; if (!a) return k;
    var s = a[langIdx()] || a[0];
    if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(String(v[n])); });
    return s;
  }
  function hex2(n) { return ('0' + ((n | 0) & 0xFF).toString(16).toUpperCase()).slice(-2); }
  function allowed(slave) { return SLAVES.indexOf(slave | 0) >= 0; }
  function awidFor(slave) { return slave === 0x3E ? 2 : (slave === 0x7C ? 1 : 0); }
  function eeReadOk(proto) { return (proto | 0) >= IOA_PROTO; }
  function check(msg, proto, have) {
    if (!msg || !BUS[msg.type]) return null;
    var s = msg.slave | 0;
    if (s >= EE_LO && s <= EE_HI) {
      if (msg.type === 'read') {
        if (!eeReadOk(proto)) return { code: 'eeOld', slave: s, msg: text('eeOld', { s: hex2(s), have: have || '?' }) };
        var ea = (msg.awid == null) ? 2 : (msg.awid | 0);
        if (ea !== 1 && ea !== 2) return { code: 'eeAwid', slave: s, msg: text('eeAwid', { s: hex2(s) }) };
        return null;
      }
      return { code: 'ee', slave: s, msg: text(eeReadOk(proto) ? 'eeWrite' : 'ee', { s: hex2(s) }) };
    }
    if (!allowed(s)) return { code: 'notTcon', slave: s, msg: text('notTcon', { s: hex2(s) }) };
    var want = awidFor(s), aw = (msg.awid == null) ? 2 : (msg.awid | 0);
    if (msg.type !== 'write' && want && aw !== want) return { code: 'awid', slave: s, msg: text('awid', { s: hex2(s), w: want }) };
    return null;
  }
  function dpcdWriteOk(addr, n) {
    addr = addr | 0; n = n | 0;
    if (n < 1 || n > 16 || addr < 0 || addr + n - 1 > 0xFFFFF) return false;
    return (addr + n - 1 < DPCD_EE_LO) || (addr > DPCD_EE_HI);
  }
  g.TconAux = {
    VERSION: '1.5', MODE: 4, NEED_PROTO: 7, SIMUL_PROTO: 8, IOA_PROTO: IOA_PROTO, eeReadOk: eeReadOk,
    SLAVES: SLAVES.slice(), EE_LO: EE_LO, EE_HI: EE_HI, DPCD_EE_LO: DPCD_EE_LO, DPCD_EE_HI: DPCD_EE_HI,
    allowed: allowed, awidFor: awidFor, check: check, text: text, dpcdWriteOk: dpcdWriteOk
  };
  if (typeof module === 'object' && module.exports) module.exports = g.TconAux;
})(typeof window !== 'undefined' ? window : globalThis);
