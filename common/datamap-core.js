/* ═══════════════════════════════════════════════════════════════════════════
   datamap-core.js — MNT T-CON（EM01／EM02／E512）Data Mapping 共用核心
   ───────────────────────────────────────────────────────────────────────────
   給 datamap.html（Data Mapping 分頁）與 tools/check_datamap.js（自測）共用：
   瀏覽器下掛在 window.TCONDataMap，node 下 module.exports。
   這支**不碰 DOM、不碰 WebSocket**；I2C 只透過呼叫端傳進來的 io 介面
   （io.read(addr,len) → bytes、io.write(addr,bytes)）。

   ── 資料來源（全部查證過，行號是 2026-10-06 的版本）─────────────────────────
   ① 暫存器位置（rt7_data_proc bank）
      EM01：`VCL_TV_TCON_EM01_Tool/App/RApp_Common.h:61` BK_RT7_DATA_PROC 0x0400
            `VCL_TV_TCON_EM01_Tool/Docs/rt7_data_proc.md`（register bank 轉出）
              h0000[2:1] reg_panel_mode、[4:3] reg_ltps_zigzag_mode、[7:5] reg_sub_panel_mode
              h0001[0] reg_mirror、[3] reg_chrb、[7] reg_force_sel_en
              h0002[0] reg_force_de_en、h0045[5:0] reg_force_de_sel、h0046-47 reg_read_rvs
              h0003-h001A reg_force_sel_{r0,g0,b0,r1,g1,b1}_{0..3}[4:0]
              h005E-h0075 reg_force_sel_{r2,g2,b2,r3,g3,b3}_{0..3}[4:0]
      EM02：`VCL_TV_TCON_EM02_Tool/App/RApp_Common.h:62` BK_RT7_DATA_PROC 0x0480
            `App/TX/RApp_TX.h:84-160,279-284`（Reg_RT7Data_Proc_t 結構，偏移同上）
            `EM02A1_register_bank_svn213_final.xls` rt7_data_proc（同上；h0001[4] reg_chwb）
      E512：`VCL_TV_TCON_E512_Tool/App/RApp_Common.h:18` BK_RT7_DATA_PROC 0x0480
            `e512_register_bank_final.xls` rt7_data_proc：
              🔴 **reg_force_de_sel 在 h0002[7:4]（4 bit）**，不是 EM01／EM02 的 h0045[5:0]。
              其餘欄位偏移與 EM02 相同。
      三顆共用：rt8_tcon_1 h0004[7:6] reg_rd_mode（regAddr 0x0504；wfg.html 的
                WFG_EM02_RD_MODE_REG 同一格），原廠工具在套 Data Mapping 樣式時一併寫入
                （`VCL_TV_TCON_EM02_Tool/App/TX/RApp_TX.cpp:10886-10936`）。
   ② 原廠 UI 怎麼讀寫這些欄位：`VCL_TV_TCON_EM02_Tool/App/TX/RApp_TX.cpp`
        :8966  RApp_TX_MAPPING_RadioGroup_Force_sel_en（0x01 bit7）
        :9072  RApp_TX_MAPPING_Stringgrid_Update（0x03+i…0x17+i、0x5E+i…0x72+i，& 0x1F）
        :9328  RApp_TX_MAPPING_StringGrid_data_mapping_Keypress（寫回時上限 29）
        :8722-8790 sub panel mode 選單文字
      預設樣式表：`VCL_TV_TCON_EM02_Tool/App/TX/RApp_TX.h:530-568` stRt7MapType（34 筆）
      （EM01、E512 的原廠工具沒有這張表，欄位位置相同 ⇒ 共用。）
   ③ 索引值（0~29）的意義：`~/TCON/TCON設定相關/E512_V512_data_mapping_diagram(Bruce修改_20250815).xlsx`
      `diagram` 分頁：index i 在時槽 T1~T5 的對應像素。規則（逐格核對過）：
        顏色 = 'RGB'[i % 3]；g = ⌊i/6⌋；s = ⌊i/3⌋ % 2；m = T − g
        m < 0 ⇒ 該時槽沒定義；m = 0 ⇒ 前一組（s=0 → −2，s=1 → −1）；m ≥ 1 ⇒ 第 1+2(m−1)+s 個
      Python UI（RomCodeProcessUI.py:2836-2846）的 E50x 名稱表恰好是這張表的 T2／T3 欄，
      所以「依時槽命名」與 Python UI 的顯示方式一致。30／31 在 diagram 裡沒有定義。
   ④ .bin 裡 rt7 在哪裡（regAddr ≠ fileOff，每個 bank 各自一個基準，見 wfg.html:46280 的說明）
      每份 code 的 sys 區都有一張「各 bank 在檔案裡的起點」表，直接讀它：
        E512：0x43/0x44 ＝ rt8tcon2rt7 bank 起點（regBase 0x0400、payload 0xF7），
              0x45/0x46 ＝ rt8_tcon_1 起點；兩者必須差 0xF7+2（CRC）。
              出處：`~/TCON/TCON_UI/E512/04.EEPROM/mapping/Mapping Layout_20240118.xlsx`
              `E512A1_EEPROM` bank 4 size 247 end 0x04F6 start 0x02DE；`Mapping` 分頁
              reg_reg_rt8tcon2rt7_offset @0x43、reg_reg_rt8tcon1_offset @0x45。
        EM02：0x31/0x32 ＝ rt8tcon2rt7（regBase 0x0400、payload 0x100），0x33/0x34 ＝ rt8_tcon_1；
              差 0x102。實測 61 份 RM80103 code 都是 0x033E／0x0440（0x0440 與
              wfg.html WFG_EM02_BASE1 相同）。
        EM01 EEPROM：0x46/0x47 ＝ rt7 bank（regBase 0x0400、payload 0xFD），0x48/0x49 ＝ rt8_tcon_1；
              差 0xFF。實測 0x0358／0x0457（0x0457 與 wfg.html WFG_EM01_LAYOUT.eeprom.base1 相同）。
        EM01 Flash：平坦映像，fileOff ＝ regAddr（wfg.html:46780 同一結論）。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var CH_NAMES = ['r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'r2', 'g2', 'b2', 'r3', 'g3', 'b3'];
  var RD_MODE_REG = 0x0504;

  /* 型號表。icId ＝ regAddr 0xFF00 讀回的 3 bytes（dg-selftest.html DST_ICS 同一張表：
     E512A1 :2597、EM01A1 :2705、EM02A1 :2821）。EM02A1 與 V512S2 共用同一組 ID（上游工具也分不出來）。 */
  var MODELS = {
    EM01: { key: 'EM01', rt7: 0x0400, icId: [0x01, 0xEF, 0xA0], deSel: { off: 0x45, shift: 0, bits: 6 } },
    EM02: { key: 'EM02', rt7: 0x0480, icId: [0x02, 0xEF, 0xA0], deSel: { off: 0x45, shift: 0, bits: 6 } },
    E512: { key: 'E512', rt7: 0x0480, icId: [0x12, 0xE5, 0xA0], deSel: { off: 0x02, shift: 4, bits: 4 } }
  };
  var MODEL_KEYS = ['EM01', 'EM02', 'E512'];

  /* 每顆的欄位清單（regAddr 絕對位址）。🔴 這張清單就是「Data Mapping 相關暫存器」的全部 ——
     匯出 script、I2C 寫入都只會碰到這裡列出的 byte 與 bit，別的一律不碰
     （例如 0x00 bit0 reg_isp_mlvds_sel 是 TX 介面選擇，遮罩刻意不含它）。 */
  function fieldsOf(modelKey) {
    var m = MODELS[modelKey]; if (!m) return null;
    var b = m.rt7, f = [];
    f.push({ id: 'panelMode', reg: b + 0x00, shift: 1, bits: 2 });
    f.push({ id: 'ltpsZz',    reg: b + 0x00, shift: 3, bits: 2 });
    f.push({ id: 'subPanel',  reg: b + 0x00, shift: 5, bits: 3 });
    f.push({ id: 'mirror',    reg: b + 0x01, shift: 0, bits: 1 });
    f.push({ id: 'chrb',      reg: b + 0x01, shift: 3, bits: 1 });
    f.push({ id: 'chwb',      reg: b + 0x01, shift: 4, bits: 1 });
    f.push({ id: 'handMode',  reg: b + 0x01, shift: 7, bits: 1 });
    f.push({ id: 'forceDeEn', reg: b + 0x02, shift: 0, bits: 1 });
    f.push({ id: 'forceDeSel', reg: b + m.deSel.off, shift: m.deSel.shift, bits: m.deSel.bits });
    f.push({ id: 'rvsL',      reg: b + 0x46, shift: 0, bits: 8 });
    f.push({ id: 'rvsH',      reg: b + 0x47, shift: 0, bits: 8 });
    for (var i = 0; i < 24; i++) f.push({ id: 'sel' + i, reg: b + 0x03 + i, shift: 0, bits: 5 });
    for (var j = 0; j < 24; j++) f.push({ id: 'sel' + (24 + j), reg: b + 0x5E + j, shift: 0, bits: 5 });
    f.push({ id: 'rdMode',    reg: RD_MODE_REG, shift: 6, bits: 2 });
    return f;
  }

  /* 依位址合併成「byte ＋ 遮罩」清單，位址由小到大。 */
  function regsOf(modelKey) {
    var f = fieldsOf(modelKey), map = {}, out = [];
    for (var i = 0; i < f.length; i++) {
      var mk = ((1 << f[i].bits) - 1) << f[i].shift;
      map[f[i].reg] = (map[f[i].reg] || 0) | mk;
    }
    Object.keys(map).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (r) { out.push({ reg: r, mask: map[r] & 0xFF }); });
    return out;
  }

  function emptyState() {
    var s = { panelMode: 0, ltpsZz: 0, subPanel: 0, mirror: 0, chrb: 0, chwb: 0, handMode: 0,
              forceDeEn: 0, forceDeSel: 0, rvs: 0, rdMode: 0, sel: [] };
    for (var i = 0; i < 48; i++) s.sel.push(0);
    return s;
  }
  function cloneState(s) { var c = JSON.parse(JSON.stringify(s)); return c; }

  function getField(s, id) {
    if (id === 'rvsL') return s.rvs & 0xFF;
    if (id === 'rvsH') return (s.rvs >> 8) & 0xFF;
    if (id.indexOf('sel') === 0) return s.sel[+id.slice(3)] | 0;
    return s[id] | 0;
  }
  function setField(s, id, v) {
    if (id === 'rvsL') { s.rvs = (s.rvs & 0xFF00) | (v & 0xFF); return; }
    if (id === 'rvsH') { s.rvs = (s.rvs & 0x00FF) | ((v & 0xFF) << 8); return; }
    if (id.indexOf('sel') === 0) { s.sel[+id.slice(3)] = v; return; }
    s[id] = v;
  }

  /* getByte(regAddr) → 0..255 */
  function decode(modelKey, getByte) {
    var f = fieldsOf(modelKey), s = emptyState();
    for (var i = 0; i < f.length; i++) {
      var v = (getByte(f[i].reg) >> f[i].shift) & ((1 << f[i].bits) - 1);
      setField(s, f[i].id, v);
    }
    return s;
  }

  /* 狀態 → [{reg, val, mask}]（val 只在 mask 內有意義） */
  function encode(modelKey, s) {
    var f = fieldsOf(modelKey), acc = {};
    for (var i = 0; i < f.length; i++) {
      var mk = ((1 << f[i].bits) - 1);
      var v = (getField(s, f[i].id) & mk) << f[i].shift;
      if (!acc[f[i].reg]) acc[f[i].reg] = { reg: f[i].reg, val: 0, mask: 0 };
      acc[f[i].reg].val |= v; acc[f[i].reg].mask |= (mk << f[i].shift);
    }
    return Object.keys(acc).map(Number).sort(function (a, b) { return a - b; })
      .map(function (r) { var e = acc[r]; e.val &= 0xFF; e.mask &= 0xFF; return e; });
  }

  /* 兩個狀態之間有變的**欄位**，合併成 byte ＋ 遮罩（I2C 即時寫入用）。
     遮罩只含「真的有變」的欄位：同一個 byte 裡沒動到的欄位維持 TCON 上的原值，
     不會被頁面上的值順手蓋掉（例如只勾 Hand Mode，就不會連帶改 Mirror）。 */
  function diffRegs(modelKey, a, b) {
    var f = fieldsOf(modelKey), acc = {};
    for (var i = 0; i < f.length; i++) {
      var mk = (1 << f[i].bits) - 1, va = getField(a, f[i].id) & mk, vb = getField(b, f[i].id) & mk;
      if (va === vb) continue;
      if (!acc[f[i].reg]) acc[f[i].reg] = { reg: f[i].reg, val: 0, mask: 0 };
      acc[f[i].reg].val |= vb << f[i].shift; acc[f[i].reg].mask |= mk << f[i].shift;
    }
    return Object.keys(acc).map(Number).sort(function (x, y) { return x - y; })
      .map(function (r) { var e = acc[r]; e.val &= 0xFF; e.mask &= 0xFF; return e; });
  }

  function maskedMerge(cur, val, mask) { return ((cur & ~mask) | (val & mask)) & 0xFF; }

  /* ── 索引值命名（見檔頭 ③）────────────────────────────────────────────── */
  function idxName(i, T) {
    i = i | 0;
    if (i < 0 || i > 29) return null;
    var c = 'RGB'.charAt(i % 3), g = Math.floor(i / 6), s = Math.floor(i / 3) % 2, m = T - g;
    if (m < 0) return null;
    if (m === 0) return c + (s ? '-1' : '-2');
    return c + (1 + 2 * (m - 1) + s);
  }
  function idxColor(i) { return (i < 0 || i > 29) ? 'x' : 'RGB'.charAt(i % 3).toLowerCase(); }
  /* 自動時槽：讓用到的最大索引落在已定義範圍（T = 1 + ⌊max/6⌋，1..5）。 */
  function autoSlot(sel) {
    var mx = 0;
    for (var i = 0; i < sel.length; i++) if (sel[i] <= 29 && sel[i] > mx) mx = sel[i];
    var T = 1 + Math.floor(mx / 6);
    return T < 1 ? 1 : (T > 5 ? 5 : T);
  }

  /* ── 原廠預設樣式（RApp_TX.h:530-568，34 筆；'x' ＝ 不改）──────────────────
     欄位順序：rd_mode panel_mode ltps_zigzag_mode sub_panel_mode mirror chrb
               force_de_en force_de_sel read_rvs[7:0] read_rvs[15:8] force_sel_en | 48 個索引 */
  var PRESET_SRC = [
    ['(0) 1D1G(Normal)', '0 0 0 0 0 0 x x 0 0 0', ''],
    ['(0) 1D1G(Mirror)', '0 0 0 0 1 0 x x 255 255 0', ''],
    ['(1) ZZ+LR', '0 1 0 0 0 0 x x 0 0 0', ''],
    ['(2) ZZ+RL', '0 1 0 1 0 0 x x 0 0 0', ''],
    ['(3) ZZ+LLRR', '0 1 0 2 0 0 x x 0 0 0', ''],
    ['(4) ZZ+RRLL', '0 1 0 3 0 0 0 0 0 0 0', ''],
    ['(5) ZZ+LRRL', '0 1 0 4 0 0 0 0 0 0 0', ''],
    ['(6) ZZ+RLLR', '0 1 0 5 0 0 0 0 0 0 0', ''],
    ['(7) ZZ+LLLLRRRR', '0 1 0 6 0 0 0 0 0 0 0', ''],
    ['(8) ZZ+RRRRLLLL', '0 1 0 7 0 0 0 0 0 0 0', ''],
    ['(9) ZZ+Mir+LR', '0 1 0 0 1 0 0 0 255 255 0', ''],
    ['(10) ZZ+Mir+RL', '0 1 0 1 1 0 0 0 255 255 0', ''],
    ['(11) ZZ+Mir+LLRR', '0 1 0 2 1 0 0 0 255 255 0', ''],
    ['(12) ZZ+Mir+RRLL', '0 1 0 3 1 0 0 0 255 255 0', ''],
    ['(13) ZZ+Mir+LRRL', '0 1 0 4 1 0 0 0 255 255 0', ''],
    ['(14) ZZ+Mir+RLLR', '0 1 0 5 1 0 0 0 255 255 0', ''],
    ['(15) ZZ+Mir+LLLLRRRR', '0 1 0 6 1 0 0 0 255 255 0', ''],
    ['(16) ZZ+Mir+RRRRLLLL', '0 1 0 7 1 0 0 0 255 255 0', ''],
    ['(17) Trigate', '2 3 0 0 0 0 0 0 0 0 0', ''],
    ['(18) Tri+ZZ+LR', '2 3 0 2 0 0 0 0 0 0 1',
      '12 28 21 19 15 19 12 22 6 22 15 13 9 13 6 16 0 16 9 7 3 7 0 10 26 0 31 0 29 0 26 0 20 0 29 0 23 0 20 0 14 0 23 0 17 0 14 0'],
    ['(19) Tri+ZZ+LLLRRR', '2 3 0 2 0 0 0 0 0 0 1',
      '12 19 21 28 15 22 12 19 6 13 15 22 9 16 6 13 0 7 9 16 3 10 0 7 26 0 31 0 29 0 26 0 20 0 29 0 23 0 20 0 14 0 23 0 17 0 14 0'],
    ['(20) Tri+ZZ+RRRLLL', '2 3 0 2 0 0 0 0 0 0 1',
      '21 28 12 19 12 19 15 22 15 22 6 13 6 13 9 16 9 16 0 7 0 7 3 10 31 0 26 0 26 0 29 0 29 0 20 0 20 0 23 0 23 0 14 0 14 0 17 0'],
    ['(21) Tri+BOE', '2 3 0 2 0 0 0 0 0 0 1',
      '12 12 12 12 13 13 13 13 14 14 14 14 15 15 15 15 16 16 16 16 17 17 17 17 12 0 12 0 13 0 13 0 14 0 14 0 15 0 15 0 16 0 16 0 17 0 17 0'],
    ['(22) HSD+RBG/GRB', '1 2 0 0 0 0 0 0 0 0 0', ''],
    ['(23) HSD+RBG/GRB+LR', '1 2 0 2 0 0 0 0 0 0 1',
      '6 13 16 23 8 15 6 13 10 17 8 15 0 7 10 17 2 9 0 7 4 11 2 9 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0'],
    ['(24) HSD+RRB/GBG', '1 2 0 1 0 0 0 0 0 0 0', ''],
    ['(25) HSD+RRB/GBG+LR', '1 2 0 3 0 0 0 0 0 0 0', ''],
    ['(26) HSD+RRB/GBG+LR+RB_chg', '1 2 0 3 0 1 0 0 0 0 0', ''],
    ['(27) HSD+GGB/RBR+2RRRL', '1 2 0 2 0 0 0 0 0 0 0', ''],
    ['(28) HSD+BRG/GRB+LR', '1 2 0 2 0 0 0 0 0 0 1',
      '8 13 16 21 6 17 8 13 10 15 6 17 2 7 10 15 0 11 2 7 4 9 0 11 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0'],
    ['(29) HSD+GGR-GGR-GGB-GGB/RBR-BBR-BBR-RBR+2RRRL', '1 2 0 4 0 0 0 0 0 0 1',
      '16 21 17 12 17 12 7 14 7 14 10 15 10 15 0 17 0 17 1 8 1 8 4 9 16 21 6 23 6 23 7 14 7 14 10 15 10 15 11 6 11 6 1 8 1 8 4 9'],
    ['(30) HSD BOE+4pixel/4line+LRLR', '1 2 0 5 0 0 0 0 0 0 1',
      '6 6 6 6 1 13 1 13 8 8 8 8 3 15 3 15 10 10 10 10 5 17 5 17 0 12 0 12 7 7 7 7 2 14 2 14 9 9 9 9 4 16 4 16 11 11 11 11'],
    ['(31) HSD BOE+4pixel/4line', '1 2 0 5 0 0 0 0 0 0 1',
      '6 13 16 23 9 14 7 12 11 16 8 15 1 6 10 17 3 8 1 6 5 10 2 9 7 12 16 23 9 14 7 12 11 16 8 15 0 7 10 17 3 8 1 6 5 10 2 9'],
    ['(32) HSD BOE+GBG/RRB+LR', '1 2 0 0 0 0 1 14 0 0 1',
      '10 17 8 15 8 15 7 12 7 12 16 23 4 11 2 9 2 9 1 6 1 6 10 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0']
  ];
  var PRESET_HEAD = ['rdMode', 'panelMode', 'ltpsZz', 'subPanel', 'mirror', 'chrb', 'forceDeEn', 'forceDeSel', 'rvsL', 'rvsH', 'handMode'];
  var PRESETS = PRESET_SRC.map(function (p) {
    var h = p[1].split(/\s+/), v = p[2] ? p[2].split(/\s+/) : [], set = {};
    for (var i = 0; i < PRESET_HEAD.length; i++) if (h[i] !== 'x') set[PRESET_HEAD[i]] = +h[i];
    for (var k = 0; k < v.length; k++) if (v[k] !== 'x') set['sel' + k] = +v[k];
    return { name: p[0], set: set };
  });

  function applyPreset(modelKey, s, idx) {
    var p = PRESETS[idx]; if (!p) return s;
    var f = fieldsOf(modelKey), byId = {}, out = cloneState(s);
    for (var i = 0; i < f.length; i++) byId[f[i].id] = f[i];
    Object.keys(p.set).forEach(function (id) {
      var fd = byId[id]; if (!fd) return;
      setField(out, id, p.set[id] & ((1 << fd.bits) - 1));
    });
    return out;
  }
  /* 與原廠 RApp_TX_RT7_DataMapping_ListBox_IndexCal() 同一個判準：非 'x' 的欄位全部相等才算吻合。 */
  function matchPreset(modelKey, s) {
    var f = fieldsOf(modelKey), byId = {};
    for (var i = 0; i < f.length; i++) byId[f[i].id] = f[i];
    for (var j = 0; j < PRESETS.length; j++) {
      var ok = true, set = PRESETS[j].set;
      for (var id in set) {
        if (!byId[id]) continue;
        var mk = (1 << byId[id].bits) - 1;
        if ((getField(s, id) & mk) !== (set[id] & mk)) { ok = false; break; }
      }
      if (ok) return j;
    }
    return -1;
  }

  /* ── sub panel mode 選單文字（RApp_TX.cpp:8722-8790）────────────────────── */
  var PANEL_MODES = ['1D1G', 'ZigZag', 'HSD', 'LTPS'];
  var SUB_PANEL = [
    ['Normal'],
    ['type1', 'type2', 'type3', 'type4', 'type5', 'type6', 'type7', 'type8'],
    ['type1', 'type4', 'type3-5', 'type4+BOE zigzag', '8-pixel', '4line,4pixel'],
    ['MUX3 normal type1', 'MUX2 normal type1', 'MUX3 zigzag type1', 'MUX2 zigzag type1',
     'MUX3 normal type2', 'MUX2 normal type2', 'MUX3 zigzag type2', 'MUX2 zigzag type2']
  ];
  var RD_MODES = ['1D1G', 'HSD (dual-gate)', 'LTPS (tri-gate)', '3'];

  /* ── .bin 解析：找 rt7 與 rt8_tcon_1 在檔案裡的位置（見檔頭 ④）──────────────── */
  function u16(b, o) { return (o + 1 < b.length) ? (b[o] | (b[o + 1] << 8)) : -1; }
  var LOCATORS = [
    { model: 'EM02', medium: 'eeprom', hdr7: 0x31, hdr8: 0x33, bankBase: 0x0400, gap: 0x102 },
    { model: 'E512', medium: 'eeprom', hdr7: 0x43, hdr8: 0x45, bankBase: 0x0400, gap: 0xF9 },
    { model: 'EM01', medium: 'eeprom', hdr7: 0x46, hdr8: 0x48, bankBase: 0x0400, gap: 0xFF }
  ];
  /* EM01 Flash：平坦映像。只看大小會把 NB 的 128 KB Flash 也收進來（真檔實測 26 份誤收），
     所以再加兩條：大小 ≥ 256 KB（EM01 Flash 真檔一律 262144），且 rt8_tcon_1 的
     reg_hap（0x0500，13 bit）／reg_val（0x0502，13 bit）是合理的面板解析度。 */
  var EM01_FLASH_MIN = 0x40000;
  function em01FlashSane(b) {
    var hap = u16(b, 0x0500) & 0x1FFF, val = u16(b, 0x0502) & 0x1FFF;
    return hap >= 640 && hap <= 7680 && val >= 360 && val <= 4320;
  }

  function locate(bytes) {
    var hits = [];
    if (!bytes || bytes.length < 0x100) return hits;
    if (bytes.length >= EM01_FLASH_MIN) {
      if (em01FlashSane(bytes)) hits.push({ model: 'EM01', medium: 'flash', fileOf: function (reg) { return reg; } });
      return hits;
    }
    LOCATORS.forEach(function (L) {
      var o7 = u16(bytes, L.hdr7), o8 = u16(bytes, L.hdr8);
      if (o7 <= 0 || o8 <= 0 || o8 !== o7 + L.gap) return;
      if (o8 + 8 > bytes.length) return;
      var m = MODELS[L.model];
      if (o7 + (m.rt7 - L.bankBase) + 0x76 > bytes.length) return;
      hits.push({ model: L.model, medium: L.medium, rt7Bank: o7, rt8: o8,
        fileOf: function (reg) {
          if (reg >= 0x0500 && reg < 0x0600) return o8 + (reg - 0x0500);
          if (reg >= L.bankBase && reg < 0x0500) return o7 + (reg - L.bankBase);
          return -1;
        } });
    });
    return hits;
  }

  function cksOf(bytes) { var c = 0; for (var i = 0; i < bytes.length; i++) c += bytes[i]; return c >>> 0; }

  /* 匯入。modelHint 可省略；只接受恰好一個型號通過（與 wfg 的「寧可不能匯，不要匯錯」同一原則）。 */
  function parseCode(bytes, modelHint) {
    var hits = locate(bytes);
    if (modelHint) {
      var h2 = hits.filter(function (h) { return h.model === modelHint; });
      if (h2.length === 1) hits = h2;
      else if (hits.length) return { ok: false, reason: 'modelMismatch', found: hits.map(function (h) { return h.model; }) };
    }
    if (hits.length === 0) return { ok: false, reason: 'noMatch' };
    if (hits.length > 1) return { ok: false, reason: 'ambiguous', found: hits.map(function (h) { return h.model; }) };
    var h = hits[0];
    var st = decode(h.model, function (reg) { var o = h.fileOf(reg); return (o >= 0 && o < bytes.length) ? bytes[o] : 0; });
    return { ok: true, model: h.model, medium: h.medium, state: st, fileOf: h.fileOf,
             rt7File: h.fileOf(MODELS[h.model].rt7), rt8File: h.fileOf(0x0500), cks: cksOf(bytes) };
  }

  /* ── 匯出 script（格式照 wfg.html wfgEm02BuildScript：write -m AAAA VV MM，ASCII）── */
  function hex(v, n) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < n) s = '0' + s; return s.slice(-n); }
  function asciiOnly(s) { return String(s || '').replace(/[^\x20-\x7E]/g, '?'); }
  function regNote(modelKey, reg) {
    var b = MODELS[modelKey].rt7, o = reg - b;
    if (reg === RD_MODE_REG) return 'rd_mode [7:6]';
    if (o === 0x00) return 'panel_mode [2:1] / ltps_zigzag_mode [4:3] / sub_panel_mode [7:5]';
    if (o === 0x01) return 'mirror [0] / chrb [3] / chwb [4] / force_sel_en [7]';
    if (o === 0x02) return (MODELS[modelKey].deSel.off === 0x02) ? 'force_de_en [0] / force_de_sel [7:4]' : 'force_de_en [0]';
    if (o === 0x45) return 'force_de_sel [5:0]';
    if (o === 0x46) return 'read_rvs [7:0]';
    if (o === 0x47) return 'read_rvs [15:8]';
    if (o >= 0x03 && o <= 0x1A) { var k = o - 0x03; return 'force_sel_' + CH_NAMES[Math.floor(k / 4)] + '_' + (k % 4); }
    if (o >= 0x5E && o <= 0x75) { var k2 = o - 0x5E; return 'force_sel_' + CH_NAMES[6 + Math.floor(k2 / 4)] + '_' + (k2 % 4); }
    return '';
  }
  function buildScript(modelKey, s, opt) {
    opt = opt || {};
    var lines = [], regs = encode(modelKey, s);
    if (opt.onlyRegs) {
      var want = {}; opt.onlyRegs.forEach(function (r) { want[r] = 1; });
      regs = regs.filter(function (e) { return want[e.reg]; });
    }
    if (opt.comments !== false) {
      lines.push('// DataMap ' + asciiOnly(opt.version || '') + ' - exported ' + modelKey + ' Data Mapping settings');
      lines.push('// Load this file from the Script page of the TCON tool.');
      lines.push('// Data Mapping registers only (rt7 data mapping + rd_mode) - masked writes, no TX, no timing.');
      lines.push('// ' + (opt.now || new Date()).toISOString());
      if (opt.source) lines.push('// source: ' + asciiOnly(opt.source));
      if (typeof opt.cks === 'number' && opt.cks >= 0) lines.push('// source CKS: 0x' + hex(opt.cks, 6));
      lines.push('');
    }
    for (var i = 0; i < regs.length; i++) {
      var e = regs[i];
      var l = 'write -m ' + hex(e.reg, 4) + ' ' + hex(e.val, 2) + ' ' + hex(e.mask, 2);
      if (opt.comments !== false) l += '    // ' + regNote(modelKey, e.reg);
      lines.push(l);
    }
    var text = lines.join('\n') + '\n';
    for (var c = 0; c < text.length; c++) {
      if (text.charCodeAt(c) > 0x7F) return { ok: false, reason: 'non-ASCII at ' + c };
    }
    return { ok: true, text: text, count: regs.length };
  }

  /* 把 script 套到一份 register 影像上（自測：套回原檔比對用）。
     image: { get(reg) → byte, set(reg, byte) }。只認 `write -m`，其他行一律回報。 */
  function applyScript(text, image) {
    var n = 0, bad = [];
    String(text).split(/\r?\n/).forEach(function (raw, li) {
      var line = raw.replace(/\/\/.*$/, '').trim();
      if (!line) return;
      var m = /^write\s+-m\s+([0-9A-Fa-f]{4})\s+([0-9A-Fa-f]{2})\s+([0-9A-Fa-f]{2})$/.exec(line);
      if (!m) { bad.push(li + 1); return; }
      var reg = parseInt(m[1], 16), val = parseInt(m[2], 16), mask = parseInt(m[3], 16);
      image.set(reg, maskedMerge(image.get(reg), val, mask)); n++;
    });
    return { count: n, bad: bad };
  }

  /* ── I2C：把變更寫進 TCON（讀-改-寫，遮罩外的位元保持原值，寫後讀回比對）──────
     io.read(addr, len) → Promise<bytes>、io.write(addr, bytes) → Promise。
     log(kind, text)：kind = 'w'（寫入）/'e'（錯誤）/'n'。回傳 { ok, written, failed }。 */
  async function writeRegs(io, regs, log) {
    log = log || function () {};
    var written = 0, failed = [];
    for (var i = 0; i < regs.length; i++) {
      var e = regs[i];
      try {
        var cur = (await io.read(e.reg, 1))[0];
        if (cur === undefined) throw new Error('read empty');
        var nv = maskedMerge(cur, e.val, e.mask);
        if (nv === cur) { log('n', 'W 0x' + hex(e.reg, 4) + ' ' + hex(cur, 2) + ' = ' + hex(nv, 2) + ' (mask ' + hex(e.mask, 2) + ', no change)'); continue; }
        log('n', 'W 0x' + hex(e.reg, 4) + ' before ' + hex(cur, 2) + ' -> ' + hex(nv, 2) + ' (mask ' + hex(e.mask, 2) + ')');
        await io.write(e.reg, [nv]);
        var back = (await io.read(e.reg, 1))[0];
        if (back !== nv) { failed.push(e.reg); log('e', 'W 0x' + hex(e.reg, 4) + ' readback ' + hex(back, 2) + ' != ' + hex(nv, 2)); }
        else { written++; log('w', 'W 0x' + hex(e.reg, 4) + ' after  ' + hex(back, 2) + ' OK'); }
      } catch (err) {
        failed.push(e.reg); log('e', 'W 0x' + hex(e.reg, 4) + ' FAIL ' + (err && err.message || err));
      }
    }
    return { ok: failed.length === 0, written: written, failed: failed };
  }

  /* 從 TCON 讀回目前的 Data Mapping（rt7 一段 ＋ rd_mode 一個 byte）。 */
  async function readState(io, modelKey) {
    var m = MODELS[modelKey], len = 0x76;
    var blk = await io.read(m.rt7, len);
    var rd = await io.read(RD_MODE_REG, 1);
    if (!blk || blk.length < len || !rd || rd.length < 1) throw new Error('short read');
    return decode(modelKey, function (reg) {
      if (reg === RD_MODE_REG) return rd[0];
      return blk[reg - m.rt7] | 0;
    });
  }

  function modelByIcId(id) {
    for (var i = 0; i < MODEL_KEYS.length; i++) {
      var m = MODELS[MODEL_KEYS[i]];
      if (id && id.length >= 3 && id[0] === m.icId[0] && id[1] === m.icId[1] && id[2] === m.icId[2]) return m.key;
    }
    return null;
  }

  var API = {
    MODELS: MODELS, MODEL_KEYS: MODEL_KEYS, CH_NAMES: CH_NAMES, RD_MODE_REG: RD_MODE_REG,
    PANEL_MODES: PANEL_MODES, SUB_PANEL: SUB_PANEL, RD_MODES: RD_MODES, PRESETS: PRESETS,
    fieldsOf: fieldsOf, regsOf: regsOf, emptyState: emptyState, cloneState: cloneState,
    decode: decode, encode: encode, diffRegs: diffRegs, maskedMerge: maskedMerge,
    idxName: idxName, idxColor: idxColor, autoSlot: autoSlot,
    applyPreset: applyPreset, matchPreset: matchPreset,
    locate: locate, parseCode: parseCode, cksOf: cksOf,
    buildScript: buildScript, applyScript: applyScript, regNote: regNote, hex: hex,
    writeRegs: writeRegs, readState: readState, modelByIcId: modelByIcId
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.TCONDataMap = API;
})(typeof window !== 'undefined' ? window : this);
