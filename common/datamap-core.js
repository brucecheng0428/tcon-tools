/* ═══════════════════════════════════════════════════════════════════════════
   datamap-core.js — Data Mapping 共用核心（v1.2.1，2026-10-07）
   ───────────────────────────────────────────────────────────────────────────
   給 datamap.html 與 tools/check_datamap.js 共用：瀏覽器下 window.TCONDataMap，node 下 module.exports。
   不碰 DOM、不碰 WebSocket；I2C 只透過呼叫端傳進來的 io（io.read(addr,len)、io.write(addr,bytes)）。

   ── v1.2.1（Bruce 10/7 回 Dispatch「要不要也把它改成長循環？」：「ok」）─────────
   ・secondSetRule：Zigzag type7／type8（panel_mode=1、sub_panel_mode=6／7，LOD 8 line×1 pixel）改為長循環 'free'，
     第二組＝line 5~8（_0~_3 依序 line 5、6、7、8）；24 格全開、沒有固定寫 0 的格子（#9b56c775 報告 §1、§2 第 7/8 筆、§5）。
   ── v1.2.0（Bruce 2026-10-07：格子「改成下拉式選單…只能選擇這幾個選項（還包含 X）」）─────────
   ・cellOptions／pickCell／allSameOptions：下拉選單的選項與選取（見各函式說明）；editCell（打字路徑，
     與 PY 逐字相同）保留不動，自測與 --pyui 對拍仍用它。
   ・MNT 第二組 r2..b3（rt7+0x5E～0x75，Python UI 沒有此組）：依 #9b56c775 報告，以 EM02 為準（Bruce 10/7）。
     secondSetRule 判循環（Auto／短循環／長循環），syncSecondSet(policy)／firstEdit 決定改第一組時第二組怎麼寫，
     長循環開放 pickSecond；exportRegs 只在第二組被改寫過才含它。出處見 xInfo 上方。
   ・v512Suspects：用 EM02 規則解析時 Data Mapping byte 的 [7:5]≠0 ⇒ 可能是 V512，頁面只讀不寫。

   ── v1.1.0 依據（Bruce 2026-10-07：「呈現的應該要跟 Python UI 一模一樣」）────────────────
   Python UI ＝ ~/TCON/TCON_UI/Raydium_RomCodeProcessUI/SourceCode_V5.0.4/RomCodeProcessUI.py（下稱 PY）
   ① 支援型號：PY:3516 list_tcon，Data Mapping 用到的字典鍵 PY:1775-1789
      DAZ6111、DAZ6138、DAZ6139、DAZ7353、RM81010（E501A）、RM81011（E501B）、RM81000~RM81004（E503）
      檔名對應 PY:35580-35593（'E501A'→RM81010、'E501B'→RM81011、'E503'→RM81000）。
      EN01（RM81008）不在 PY 的 Data Mapping 裡；Bruce 2026-10-07「EN01 的 data mapping 好像是完全不一樣
      的演算法，所以 EN01 先不用做」⇒ 列為「暫不支援」。
   ② 表格可輸入的名稱與值（X ＝ 31 關閉輸出）：PY:2831-2850
      GN1（Line 1-1／2-1，與 Single-Gate 全部）、GN2（Dual-Gate 的 Line 1-2／2-2）、D6111、D7353。
      輸入驗證一律用 GN1（DAZ 用自己的表）：PY:12517-12519；不在表內 ⇒ 'X'。
      讀 code 時名稱反查：PY:29454-29705（set_dm_info_to_rgb_table）。
      🔴 與 PY 唯一刻意不同：PY 讀到表外的值會顯示成 'X'（之後任何一次改動就把它寫成 31）；
         網頁顯示「非標準值 0xNN」並保留原值，只有使用者在那一格輸入新值才會改（Dispatch 10/7 要求）。
   ③ Gate Type（comboBox_49，PY:4074 ['Non-Hand Mode','Single-Gate','Dual-Gate','Tri-Gate']）
      顯示：PY:28990-29022；改選：PY:29849-29923（Single → PANEL_MODE=1、RD_MODE=0；Dual → 2、1；Tri → 3、2；
      DAZ 只有 PANEL_MODE）。Single 時 Line 1-2／2-2 ＝ Line 1-1／2-1 的複本、不能改（PY:12521-12526、
      29753-29776），底色 (50,50,50)（PY:10603-10609）；Tri 全部暗、不能改。
   ④ 每次改動 PY 都會順手寫：FORCE_DE_EN ＝ Hand Mode、FORCE_DE_SEL[7:4] ＝ 0xE（DAZ613x／E50x，PY:29267-29280）；
      DAZ 的 HAND_LINE_SEL_EN ＝ Hand Mode 與 Line 0~7 type（PY:29253-29315）。網頁照做（只在使用者動作時）。
   ⑤ I2C：PY:32326-32700，slave 0x3E、2-byte offset；DAZ613x／E50x／E503 先 i2c_open_mbus_to_cbus（PY:31832，
      7E:AB←CD；E503 再 3E:0059←1E）。網頁：E503 只在 Check T-CON 確認是 E503 才下 0059。
   ⑥ 匯入 code：PY 依副檔名讀檔（FileProcess.py:485 openauto：.bin 原樣、.hex 取 type 00 資料串接、其他當
      每行一個 hex byte 的文字），再用 map_setting_addr_rom_3e_dict（PY:1759）把 ROM 搬到 3E 位址。
   ⑦ CKS：PY:29971-30022（dm_rgb_cks_dict × single／dual 權重）。
   ⑧ Export／Import Excel：PY:30024-30215（工作表 'Data Mapping'，A 欄 Line 1-1~2-2、右邊 Data 1~6）。
   ⑨ 匯出 script（I2C 關閉時）：
      ・NB（PY 型號）：PY 自己的 SCRIPT Excel 格式（SCRIPT 分頁讀檔 PY:27200-27260、執行 PY:27704-27757；
        範本 Raydium_RomCodeProcessUI_V5.0.4_Release/SCRIPT/SCRIPT_SoftwareReset_20211025.xlsx），
        一列一個欄位：'SCRIPT WR'、0x3E、2、'0x323[4:0]'（跨 byte 的欄位用逗號串、高位在前）、Case 0 值。
      ・MNT（EM01／EM02／E512）：沿用 v1.0.0 的 TCON 工具 Script 格式（write -m AAAA VV MM）。

   ── MNT（EM01／EM02／E512）暫存器（v1.0.0 查證，出處不變）─────────────────────────────
      rt7_data_proc：EM01 0x0400、EM02／E512 0x0480（RApp_Common.h）；h0000[2:1] panel_mode、h0001[7] force_sel_en、
      h0002[0] force_de_en、h0003-h001A reg_force_sel_{r0,g0,b0,r1,g1,b1}_{0..3}[4:0]、h005E-h0075 {r2..b3}_{0..3}、
      rt8_tcon_1 0x0504[7:6] rd_mode。Bruce 2026-10-07：register 名稱與 8100X model 共用 ⇒
      FORCE_SEL_R0_t（8100X model RM8100x_for_FAE_20240925_20250311.model:8588 起，0x323+t）＝ reg_force_sel_r0_t。
      ⇒ PY 表格的 Data 1~6 ＝ r0 g0 b0 r1 g1 b1、Line 1-1~2-2 ＝ _0~_3；r2..b3 PY 沒有 ⇒ v1.2.0 起見上 xInfo／syncX。
      .bin 定位（sys 區 bank 起點表）見 v1.0.0 說明，未改：E512 0x43/0x45、EM02 0x31/0x33、EM01 0x46/0x48、EM01 Flash 平坦。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* 以下由 RomCodeProcessUI.py V5.0.4 的字典逐字轉出（轉出方法見 CHANGELOG datamap v1.1.0），行號：
       map_datamapping_addr_3e_dict :1775
       dm_handmode_en_addr_3e_dict :1791
       dm_panel_mode_addr_3e_dict :1807
       dm_line_type_sel_addr_3e_dict :1823
       dm_hand_datan_type0_addr_3e_dict :1828
       dm_hand_datan_type1_addr_3e_dict :1919
       dm_hand_datan_type2_addr_3e_dict :2010
       dm_hand_datan_type3_addr_3e_dict :2101
       map_setting_addr_rom_3e_dict :1759
     cells[k]：k ＝ type×6 ＋ data（type 0~3 ＝ Line 1-1／1-2／2-1／2-2，data 0~5 ＝ Data 1~6），
     每格是 [addr, msb, lsb] 的串列，前面的是高位（read_value_from_data :34809 由前往後串接）。 */
  var PY_TABLES = {
    DAZ7353: {
      dm: [0x0AD,0x0B8,0x00C,0x0C4,0x0C6,3],  // [3e 起, 3e 迄, bytes, 第二段起, 第二段迄, bytes]
      hand: [0x0A8,7,7], hand2: [0x0A8,6,6],
      panel: [0x0C9,1,0], rd: null,
      lineType: [[0x0B9,1,0],[0x0B9,3,2],[0x0B9,5,4],[0x0B9,7,6],[0x0BA,1,0],[0x0BA,3,2],[0x0BA,5,4],[0x0BA,7,6]],
      rom: [0,0x1FD,0,0x1FD],  // map_setting_addr_rom_3e_dict：[rom 起, rom 迄, 3e 起, 3e 迄]
      cells: [
        [[0x0C4,0,0],[0x0AD,3,0]], [[0x0C5,0,0],[0x0AD,7,4]], [[0x0C6,0,0],[0x0AE,3,0]], [[0x0C4,1,1],[0x0AE,7,4]], [[0x0C5,1,1],[0x0AF,3,0]], [[0x0C6,1,1],[0x0AF,7,4]],
        [[0x0C4,2,2],[0x0B0,3,0]], [[0x0C5,2,2],[0x0B0,7,4]], [[0x0C6,2,2],[0x0B1,3,0]], [[0x0C4,3,3],[0x0B1,7,4]], [[0x0C5,3,3],[0x0B2,3,0]], [[0x0C6,3,3],[0x0B2,7,4]],
        [[0x0C4,4,4],[0x0B3,3,0]], [[0x0C5,4,4],[0x0B3,7,4]], [[0x0C6,4,4],[0x0B4,3,0]], [[0x0C4,5,5],[0x0B4,7,4]], [[0x0C5,5,5],[0x0B5,3,0]], [[0x0C6,5,5],[0x0B5,7,4]],
        [[0x0C4,6,6],[0x0B6,3,0]], [[0x0C5,6,6],[0x0B6,7,4]], [[0x0C6,6,6],[0x0B7,3,0]], [[0x0C4,7,7],[0x0B7,7,4]], [[0x0C5,7,7],[0x0B8,3,0]], [[0x0C6,7,7],[0x0B8,7,4]]
      ]
    },
    DAZ6111: {
      dm: [0x17F,0x18A,0x00C,null,null,0],  // [3e 起, 3e 迄, bytes, 第二段起, 第二段迄, bytes]
      hand: [0x17A,7,7], hand2: [0x17A,6,6],
      panel: [0x032,1,0], rd: null,
      lineType: [[0x18B,1,0],[0x18B,3,2],[0x18B,5,4],[0x18B,7,6],[0x18C,1,0],[0x18C,3,2],[0x18C,5,4],[0x18C,7,6]],
      rom: [0x100,0x2FD,0,0x1FD],  // map_setting_addr_rom_3e_dict：[rom 起, rom 迄, 3e 起, 3e 迄]
      cells: [
        [[0x17F,3,0]], [[0x17F,7,4]], [[0x180,3,0]], [[0x180,7,4]], [[0x181,3,0]], [[0x181,7,4]],
        [[0x182,3,0]], [[0x182,7,4]], [[0x183,3,0]], [[0x183,7,4]], [[0x184,3,0]], [[0x184,7,4]],
        [[0x185,3,0]], [[0x185,7,4]], [[0x186,3,0]], [[0x186,7,4]], [[0x187,3,0]], [[0x187,7,4]],
        [[0x188,3,0]], [[0x188,7,4]], [[0x189,3,0]], [[0x189,7,4]], [[0x18A,3,0]], [[0x18A,7,4]]
      ]
    },
    DAZ6138: {
      dm: [0x183,0x191,0x00F,null,null,0],  // [3e 起, 3e 迄, bytes, 第二段起, 第二段迄, bytes]
      hand: [0x182,0,0], hand2: [0x182,1,1],
      panel: [0x180,1,0], rd: [0x1B0,7,6],
      lineType: null,
      rom: [0x100,0x435,0,0x335],  // map_setting_addr_rom_3e_dict：[rom 起, rom 迄, 3e 起, 3e 迄]
      cells: [
        [[0x183,4,0]], [[0x187,4,0]], [[0x18B,4,0]], [[0x18F,4,0]], [[0x186,5,5],[0x185,7,5],[0x184,7,7]], [[0x18C,7,5],[0x18B,7,6]],
        [[0x184,4,0]], [[0x188,4,0]], [[0x18C,4,0]], [[0x190,4,0]], [[0x187,7,5],[0x186,7,6]], [[0x18E,6,5],[0x18D,7,5]],
        [[0x185,4,0]], [[0x189,4,0]], [[0x18D,4,0]], [[0x191,4,0]], [[0x189,6,5],[0x188,7,5]], [[0x190,5,5],[0x18F,7,5],[0x18E,7,7]],
        [[0x186,4,0]], [[0x18A,4,0]], [[0x18E,4,0]], [[0x184,6,5],[0x183,7,5]], [[0x18B,5,5],[0x18A,7,5],[0x189,7,7]], [[0x191,7,5],[0x190,7,6]]
      ]
    },
    RM81010: {
      dm: [0x3F3,0x401,0x00F,null,null,0],  // [3e 起, 3e 迄, bytes, 第二段起, 第二段迄, bytes]
      hand: [0x3F2,0,0], hand2: [0x3F2,1,1],
      panel: [0x3F0,1,0], rd: [0x420,7,6],
      lineType: null,
      rom: [0xA000,0xA697,0,0x697],  // map_setting_addr_rom_3e_dict：[rom 起, rom 迄, 3e 起, 3e 迄]
      cells: [
        [[0x3F3,4,0]], [[0x3F7,4,0]], [[0x3FB,4,0]], [[0x3FF,4,0]], [[0x3F6,5,5],[0x3F5,7,5],[0x3F4,7,7]], [[0x3FC,7,5],[0x3FB,7,6]],
        [[0x3F4,4,0]], [[0x3F8,4,0]], [[0x3FC,4,0]], [[0x400,4,0]], [[0x3F7,7,5],[0x3F6,7,6]], [[0x3FE,6,5],[0x3FD,7,5]],
        [[0x3F5,4,0]], [[0x3F9,4,0]], [[0x3FD,4,0]], [[0x401,4,0]], [[0x3F9,6,5],[0x3F8,7,5]], [[0x400,5,5],[0x3FF,7,5],[0x3FE,7,7]],
        [[0x3F6,4,0]], [[0x3FA,4,0]], [[0x3FE,4,0]], [[0x3F4,6,5],[0x3F3,7,5]], [[0x3FB,5,5],[0x3FA,7,5],[0x3F9,7,7]], [[0x401,7,5],[0x400,7,6]]
      ]
    },
    RM81000: {
      dm: [0x323,0x331,0x00F,null,null,0],  // [3e 起, 3e 迄, bytes, 第二段起, 第二段迄, bytes]
      hand: [0x322,0,0], hand2: [0x322,1,1],
      panel: [0x320,1,0], rd: [0x350,7,6],
      lineType: null,
      rom: [0x100,0x5D3,0,0x4D3],  // map_setting_addr_rom_3e_dict：[rom 起, rom 迄, 3e 起, 3e 迄]
      cells: [
        [[0x323,4,0]], [[0x327,4,0]], [[0x32B,4,0]], [[0x32F,4,0]], [[0x326,5,5],[0x325,7,5],[0x324,7,7]], [[0x32C,7,5],[0x32B,7,6]],
        [[0x324,4,0]], [[0x328,4,0]], [[0x32C,4,0]], [[0x330,4,0]], [[0x327,7,5],[0x326,7,6]], [[0x32E,6,5],[0x32D,7,5]],
        [[0x325,4,0]], [[0x329,4,0]], [[0x32D,4,0]], [[0x331,4,0]], [[0x329,6,5],[0x328,7,5]], [[0x330,5,5],[0x32F,7,5],[0x32E,7,7]],
        [[0x326,4,0]], [[0x32A,4,0]], [[0x32E,4,0]], [[0x324,6,5],[0x323,7,5]], [[0x32B,5,5],[0x32A,7,5],[0x329,7,7]], [[0x331,7,5],[0x330,7,6]]
      ]
    }
  };
  /* 名稱 ↔ 值（:2831、:2835、:2841、:2846、:2851） */
  var GN1 = { 'R3': 0, 'G3': 1, 'B3': 2, 'R4': 3, 'G4': 4, 'B4': 5, 'R1': 6, 'G1': 7, 'B1': 8, 'R2': 9, 'G2': 10, 'B2': 11, 'R-2': 12, 'G-2': 13, 'B-2': 14, 'R-1': 15, 'G-1': 16, 'B-1': 17, 'X': 31 };
  var GN2 = { 'R5': 0, 'G5': 1, 'B5': 2, 'R6': 3, 'G6': 4, 'B6': 5, 'R3': 6, 'G3': 7, 'B3': 8, 'R4': 9, 'G4': 10, 'B4': 11, 'R1': 12, 'G1': 13, 'B1': 14, 'R2': 15, 'G2': 16, 'B2': 17, 'R-2': 18, 'G-2': 19, 'B-2': 20, 'R-1': 21, 'G-1': 22, 'B-1': 23, 'X': 31 };
  var D6111 = { 'R1': 0, 'G1': 1, 'B1': 2, 'R2': 3, 'G2': 4, 'B2': 5, 'R3': 6, 'G3': 7, 'B3': 8, 'R4': 9, 'G4': 10, 'B4': 11, 'R-1': 12, 'G-1': 13, 'B-1': 14, 'X': 15 };
  var D7353 = { 'R1': 0, 'G1': 1, 'B1': 2, 'R2': 3, 'G2': 4, 'B2': 5, 'R3': 6, 'G3': 7, 'B3': 8, 'R4': 9, 'G4': 10, 'B4': 11, 'R-1': 12, 'G-1': 13, 'B-1': 14, 'X': 31 };
  var CKS_W = { 'R1': 1, 'G1': 2, 'B1': 3, 'R2': 4, 'G2': 5, 'B2': 6, 'R3': 7, 'G3': 8, 'B3': 9, 'R4': 10, 'G4': 11, 'B4': 12, 'R5': 13, 'G5': 14, 'B5': 15, 'R6': 16, 'G6': 17, 'B6': 18, 'R7': 19, 'G7': 20, 'B7': 21, 'R8': 22, 'G8': 23, 'B8': 24, 'R-1': 25, 'G-1': 26, 'B-1': 27, 'R-2': 28, 'G-2': 29, 'B-2': 30, 'X': 31 };
  var CKS_DUAL = [1,118,3,117,5,116,113,8,114,10,115,12,6,112,4,111,2,110,107,11,108,9,109,7];   // :2865
  var CKS_SINGLE = [1,118,3,117,5,116,0,0,0,0,0,0,6,112,4,111,2,110,0,0,0,0,0,0];   // :2872

  /* v1.10.0 SUB_PANEL_MODE 位址（Python UI 字典沒有；出處＝~/TCON/WorkSoftware/I2C_UI/E503_E501/Raydium_RomCodeProcessUI_V5.0.3_Release/*.model）：
       DAZ6111_for_FAE_20240509_20240830.model:531-539  0x32[6:4]（MAIN_PANEL_MODE 0x32[1:0]）
       DAZ7353_20190418.model:711-719                    0xC9[7:4]（4 bit；MAIN_PANEL_MODE 0xC9[1:0]）
       DAZ6138_20230309.model:7440-7449                  0x180[6:4]
       RM81010_for_FAE_20240509_20241127.model:9748-9765 0x3F0[6:4]（E501A／E501B 同；RM81011 model:9605 相同）
       RM8100x_for_FAE_20240925_20250311.model:8522-8540 0x320[6:4]（E503） */
  var SUB_PANEL_REG = { DAZ6111: [0x032, 6, 4], DAZ7353: [0x0C9, 7, 4], DAZ6138: [0x180, 6, 4], RM81010: [0x3F0, 6, 4], RM81000: [0x320, 6, 4] };
  /* ── 型號 ─────────────────────────────────────────────────────────────── */
  /* kind：'nb' ＝ Python UI 型號（暫存器＝3E 位址）；'mnt' ＝ EM01／EM02／E512。
     sem：表格規則（'daz7353'／'daz6111'／'e50x'）；mnt 套 e50x 規則（同一組 GN1／GN2 與 Gate 判準）。 */
  var MODELS = {
    DAZ6111: { key: 'DAZ6111', label: 'DAZ6111', kind: 'nb', py: 'DAZ6111', tbl: 'DAZ6111', sem: 'daz6111', mbus: false },
    DAZ6138: { key: 'DAZ6138', label: 'DAZ6138', kind: 'nb', py: 'DAZ6138', tbl: 'DAZ6138', sem: 'e50x', mbus: true },
    DAZ6139: { key: 'DAZ6139', label: 'DAZ6139', kind: 'nb', py: 'DAZ6139', tbl: 'DAZ6138', sem: 'e50x', mbus: true },
    DAZ7353: { key: 'DAZ7353', label: 'DAZ7353', kind: 'nb', py: 'DAZ7353', tbl: 'DAZ7353', sem: 'daz7353', mbus: false },
    E501A:   { key: 'E501A', label: 'E501A (RM81010)', kind: 'nb', py: 'RM81010', tbl: 'RM81010', sem: 'e50x', mbus: true },
    E501B:   { key: 'E501B', label: 'E501B (RM81011)', kind: 'nb', py: 'RM81011', tbl: 'RM81010', sem: 'e50x', mbus: true },
    E503:    { key: 'E503', label: 'E503 (RM81000~RM81004)', kind: 'nb', py: 'RM81000', tbl: 'RM81000', sem: 'e50x', mbus: true, e503: true },
    EM01: { key: 'EM01', label: 'EM01', kind: 'mnt', sem: 'e50x', rt7: 0x0400, icId: [0x01, 0xEF, 0xA0], deSel: { off: 0x45, shift: 0, bits: 6 } },
    EM02: { key: 'EM02', label: 'EM02', kind: 'mnt', sem: 'e50x', rt7: 0x0480, icId: [0x02, 0xEF, 0xA0], deSel: { off: 0x45, shift: 0, bits: 6 }, lod: 0x0900 },
    E512: { key: 'E512', label: 'E512', kind: 'mnt', sem: 'e50x', rt7: 0x0480, icId: [0x12, 0xE5, 0xA0], deSel: { off: 0x02, shift: 4, bits: 4 } }
  };
  /* 下拉順序照 PY list_tcon（:3516），MNT 接在後面 */
  var MODEL_KEYS = ['DAZ6111', 'DAZ6138', 'DAZ6139', 'DAZ7353', 'E501A', 'E501B', 'E503', 'EM01', 'EM02', 'E512'];
  var MNT_KEYS = ['EM01', 'EM02', 'E512'];
  /* PY tcon 名稱 → 本頁型號（RM81001~RM81004 與 RM81000 的 Data Mapping 表完全相同，PY:1775-1789） */
  var PY_TO_KEY = { DAZ6111: 'DAZ6111', DAZ6138: 'DAZ6138', DAZ6139: 'DAZ6139', DAZ7353: 'DAZ7353', RM81010: 'E501A', RM81011: 'E501B',
                    RM81000: 'E503', RM81001: 'E503', RM81002: 'E503', RM81003: 'E503', RM81004: 'E503' };
  var RD_MODE_REG = 0x0504;
  var CH6 = ['R0', 'G0', 'B0', 'R1', 'G1', 'B1'];
  var CH_NAMES = ['r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'r2', 'g2', 'b2', 'r3', 'g3', 'b3'];

  /* ── 欄位：{ id, parts:[[addr,msb,lsb],…]（高位在前）, name } ─────────────────── */
  function P(a, m, l) { return [a, m, l]; }
  var _fcache = {};
  function fieldsOf(key) {
    if (_fcache[key]) return _fcache[key];
    var m = MODELS[key]; if (!m) return null;
    var f = [];
    if (m.kind === 'nb') {
      var T = PY_TABLES[m.tbl], daz = m.sem !== 'e50x';
      f.push({ id: 'hand', parts: [T.hand], name: daz ? 'HAND_DATA_SEL_EN' : 'FORCE_SEL_EN' });
      if (daz) f.push({ id: 'lineEn', parts: [T.hand2], name: 'HAND_LINE_SEL_EN' });
      else {
        f.push({ id: 'deEn', parts: [T.hand2], name: 'FORCE_DE_EN' });
        f.push({ id: 'deSel', parts: [P(T.hand2[0], 7, 4)], name: 'FORCE_DE_SEL' });
      }
      f.push({ id: 'panel', parts: [T.panel], name: 'PANEL_MODE' });
      /* v1.10.0：Auto Mode（Hand Mode 關）的 Type ＝ PANEL_MODE＋SUB_PANEL_MODE（各型號 .model 檔，見 SUB_PANEL_REG） */
      if (SUB_PANEL_REG[m.tbl]) f.push({ id: 'subPanel', parts: [SUB_PANEL_REG[m.tbl]], name: 'SUB_PANEL_MODE' });
      if (T.rd) f.push({ id: 'rd', parts: [T.rd], name: 'RD_MODE' });
      if (T.lineType) for (var i = 0; i < 8; i++) f.push({ id: 'lt' + i, parts: [T.lineType[i]], name: 'LINE' + i + '_TYPE_SEL' });
      for (var k = 0; k < 24; k++) {
        var t = Math.floor(k / 6), d = k % 6;
        f.push({ id: 'c' + k, parts: T.cells[k], name: daz ? ('HAND_TYPE' + t + '_DATA' + d) : ('FORCE_SEL_' + CH6[d] + '_' + t) });
      }
    } else {
      var b = m.rt7;
      f.push({ id: 'hand', parts: [P(b + 0x01, 7, 7)], name: 'force_sel_en' });
      f.push({ id: 'panel', parts: [P(b + 0x00, 2, 1)], name: 'panel_mode' });
      f.push({ id: 'rd', parts: [P(RD_MODE_REG, 7, 6)], name: 'rd_mode' });
      for (var k2 = 0; k2 < 24; k2++) {
        var t2 = Math.floor(k2 / 6), d2 = k2 % 6;
        f.push({ id: 'c' + k2, parts: [P(b + 0x03 + d2 * 4 + t2, 4, 0)], name: 'force_sel_' + CH_NAMES[d2] + '_' + t2 });
      }
      /* r2..b3：Python UI 沒有這一組；v1.2.0 起依 xInfo／syncX 處理（見該處） */
      for (var k3 = 0; k3 < 24; k3++) {
        var t3 = Math.floor(k3 / 6), d3 = k3 % 6;
        f.push({ id: 'x' + k3, parts: [P(b + 0x5E + d3 * 4 + t3, 4, 0)], name: 'force_sel_' + CH_NAMES[6 + d3] + '_' + t3 });
      }
      f.push({ id: 'ltpsZz', parts: [P(b + 0x00, 4, 3)], name: 'ltps_zigzag_mode' });
      f.push({ id: 'subPanel', parts: [P(b + 0x00, 7, 5)], name: 'sub_panel_mode' });
      f.push({ id: 'mirror', parts: [P(b + 0x01, 0, 0)], name: 'mirror' });
      f.push({ id: 'chrb', parts: [P(b + 0x01, 3, 3)], name: 'chrb' });
      f.push({ id: 'chwb', parts: [P(b + 0x01, 4, 4)], name: 'chwb' });
      f.push({ id: 'deEn', parts: [P(b + 0x02, 0, 0)], name: 'force_de_en' });
      var ds = m.deSel;
      f.push({ id: 'deSel', parts: [P(b + ds.off, ds.shift + ds.bits - 1, ds.shift)], name: 'force_de_sel' });
      f.push({ id: 'rvsL', parts: [P(b + 0x46, 7, 0)], name: 'read_rvs[7:0]' });
      f.push({ id: 'rvsH', parts: [P(b + 0x47, 7, 0)], name: 'read_rvs[15:8]' });
      /* v1.11.0（Bruce 10/7「以 RT7 為主…實際上應該要將 RT7 跟 LineOD 設成是一樣的才對」）：Line OD Mapping 暫存器（EM02 BK_LOD＝0x0900，
         Table_LOD_Reg_st RApp_Table.h:1185-1436；de／spec_line＝+0xC7、line／pix＝+0xC8、map r_0..b_15＝+0xC9..+0xF8，蘇坤 code 實測解出 Type 32）。
         EM01（0x0C00、欄位寬度與 48 值排法不同）與 E512（bin 表頭沒有 lod1_addr）暫不支援。 */
      if (m.lod) {
        var lb = m.lod, CHL = ['r', 'g', 'b'];
        f.push({ id: 'lodDe', parts: [P(lb + 0xC7, 2, 0)], name: 'reg_lod_map_de' });
        f.push({ id: 'lodSpec', parts: [P(lb + 0xC7, 5, 4)], name: 'reg_lod_map_spec_line' });
        f.push({ id: 'lodLine', parts: [P(lb + 0xC8, 3, 0)], name: 'reg_lod_map_line' });
        f.push({ id: 'lodPix', parts: [P(lb + 0xC8, 6, 4)], name: 'reg_lod_map_pix' });
        for (var q = 0; q < 48; q++) f.push({ id: 'lodM' + q, parts: [P(lb + 0xC9 + q, 5, 0)], name: 'reg_lod_map_' + CHL[Math.floor(q / 16)] + '_' + (q % 16) });
      }
    }
    f.forEach(function (x) { x.bits = x.parts.reduce(function (a, p) { return a + p[1] - p[2] + 1; }, 0); });
    _fcache[key] = f;
    return f;
  }
  function fieldById(key, id) { var f = fieldsOf(key); for (var i = 0; i < f.length; i++) if (f[i].id === id) return f[i]; return null; }

  /* 讀：高位在前串接（PY read_value_from_data :34809） */
  function readField(fd, getByte) {
    var v = 0;
    for (var i = 0; i < fd.parts.length; i++) {
      var p = fd.parts[i], w = p[1] - p[2] + 1;
      v = (v << w) | ((getByte(p[0]) >> p[2]) & ((1 << w) - 1));
    }
    return v >>> 0;
  }
  /* 寫：把值切回各段 → [{reg, val, mask}]（最後一段放最低位，PY write_value_to_data :35146） */
  function splitField(fd, v) {
    var out = [], shift = 0;
    for (var i = fd.parts.length - 1; i >= 0; i--) {
      var p = fd.parts[i], w = p[1] - p[2] + 1, mk = ((1 << w) - 1);
      out.push({ reg: p[0], val: ((v >> shift) & mk) << p[2], mask: mk << p[2] });
      shift += w;
    }
    return out;
  }
  function emptyState(key) { var s = {}; fieldsOf(key).forEach(function (f) { s[f.id] = 0; }); return s; }
  function cloneState(s) { var c = {}; for (var k in s) c[k] = s[k]; return c; }
  function decode(key, getByte) { var s = {}; fieldsOf(key).forEach(function (f) { s[f.id] = readField(f, getByte); }); return s; }
  function mergeRegs(list) {
    var acc = {};
    list.forEach(function (e) {
      if (!acc[e.reg]) acc[e.reg] = { reg: e.reg, val: 0, mask: 0 };
      acc[e.reg].val = (acc[e.reg].val & ~e.mask) | (e.val & e.mask); acc[e.reg].mask |= e.mask;
    });
    return Object.keys(acc).map(Number).sort(function (a, b) { return a - b; })
      .map(function (r) { var e = acc[r]; e.val &= 0xFF; e.mask &= 0xFF; return e; });
  }
  function encodeFields(key, s, ids) {
    var list = [];
    fieldsOf(key).forEach(function (f) { if (!ids || ids.indexOf(f.id) >= 0) list = list.concat(splitField(f, s[f.id] | 0)); });
    return mergeRegs(list);
  }
  /* ── MNT 第二組 r2..b3（x0..x23，rt7+0x5E～0x75，每格 [4:0]；Python UI 沒有此組）── v1.2.0
     依據 #9b56c775 報告 EM02_第二組DataMapping規則_報告_20261007.md（Dispatch 抽查原廠 RApp_TX.cpp:10934／10939）；
     Bruce 10/7「以 EM02 的為優先設計」。EM01／E512 位址、編碼、sub 選單與 EM02 相同，同一套條件（rt7 base 依 MODELS）。
     ・x_k 與 c_k 同一個 (type, 通道) 位置：x(type×6＋ch) ↔ c(type×6＋ch)；type＝_0~_3、ch＝r g b（第二組 r2 g2 b2 r3 g3 b3）。
     ・index 0 是有效值（GN1 名稱 R3），不是「空」；關閉輸出一律 31（X）。兩組同一套編碼、限制 ≤29（TX.cpp:9341-9366）。
     ・循環判定（rt7 沒有專屬 bit，由 force_sel_en＋panel_mode＋sub_panel_mode 決定；標籤照 EM02 原廠 UI）：
       force_sel_en＝0（Auto）⇒ 'ignored'：硬體兩組都不讀，第二組隱藏、不寫。
       HSD sub4「8-pixel」⇒ 'free'：第二組＝pixel 5~8（HSD_8pixel.png；xlsx 第 3、5 列）。
       HSD sub5「4line,4pixel」⇒ 'free'：第二組＝第 3~4 列（G5~G8）（HSD_4pixel.png）。
       Zigzag type7／type8（sub 6／7，ZZ+LLLLRRRR／RRRRLLLL，LOD 8×1）⇒ 'free'：第二組＝line 5~8（ZigZag.png；xlsx 第 15、16 列兩組不同）。v1.2.1
       LTPS MUX3（sub 0/2/4/6）⇒ 'mux3'：_0／_2 是第 3 個 mux 時槽，_1／_3 不使用、寫 0（xlsx 第 22-28 列；TX.h:552-555）。
       其他（短循環）⇒ 'copy'：第二組隱藏；使用者改第一組時第二組＝第一組（硬體不讀時無害、會讀時 xlsx 原廠設定就是複本），
       沒改第一組就保留原值（EM02 那 41 支全 0 的真檔維持原樣）。
       （報告另把 nml_4line_4pix_en 列為 free：577 支真檔全是 0、效果未確認，網頁不用它判循環。Zigzag type7/8 v1.2.0 照 Dispatch 歸短循環，
        v1.2.1 依 Bruce 10/7「ok」改為長循環。）
     xInfo.state：'none'（非 MNT）｜'copy'（sub＝main 且 main 不全 0）｜'zero'（sub 全 0）｜'other'。 */
  function xInfo(key, s) {
    if (MODELS[key].kind !== 'mnt') return { state: 'none', diff: [], list: [], mainZero: true };
    var nz = false, mz = true, diff = [], list = [];
    for (var k = 0; k < 24; k++) {
      var xv = s['x' + k] | 0, cv = s['c' + k] | 0;
      if (xv) nz = true;
      if (cv) mz = false;
      if (xv !== cv) diff.push(k);
      list.push({ k: k, name: fieldById(key, 'x' + k).name, val: xv, main: cv });
    }
    return { state: !nz ? 'zero' : (!diff.length && !mz ? 'copy' : 'other'), diff: diff, list: list, mainZero: mz };
  }
  /* 第二組 ＝ 主組複本 */
  function syncX(key, s) {
    if (MODELS[key].kind !== 'mnt') return s;
    var ns = cloneState(s); for (var k = 0; k < 24; k++) ns['x' + k] = ns['c' + k] | 0;
    return ns;
  }
  /* 循環判定：{ mode:'none'|'ignored'|'copy'|'free'|'mux3', cycle:'auto'|'short'|'long', meaning, pm, sub, fse, basis } */
  function secondSetRule(key, s) {
    if (MODELS[key].kind !== 'mnt') return { mode: 'none', cycle: '', meaning: '' };
    var pm = s.panel | 0, sub = s.subPanel | 0, fse = s.hand ? 1 : 0;
    var r = { pm: pm, sub: sub, fse: fse, basis: 'force_sel_en=' + fse + (fse ? ' (Manual)' : ' (Auto)') + ', panel_mode=' + pm + ' ' + PANEL_MODES[pm] +
              ', sub_panel_mode=' + sub + ' ' + ((SUB_PANEL[pm] || [])[sub] || '?') };
    if (!fse) { r.mode = 'ignored'; r.cycle = 'auto'; r.meaning = ''; }
    else if (pm === 2 && sub === 4) { r.mode = 'free'; r.cycle = 'long'; r.meaning = 'pix58'; }
    else if (pm === 2 && sub === 5) { r.mode = 'free'; r.cycle = 'long'; r.meaning = 'row34'; }
    else if (pm === 1 && (sub === 6 || sub === 7)) { r.mode = 'free'; r.cycle = 'long'; r.meaning = 'line58'; }
    else if (pm === 3 && (sub & 1) === 0) { r.mode = 'mux3'; r.cycle = 'long'; r.meaning = 'mux3'; }
    else { r.mode = 'copy'; r.cycle = 'short'; r.meaning = ''; }
    return r;
  }
  /* 第二組寫入策略：'mirror'（＝第一組）｜'zero'（全 0）｜'preserve'（保留原值）。syncSecondSet(policy) 是唯一的寫法實作；
     policy 由 secondPolicy 依循環判定決定（copy ⇒ mirror，其他 ⇒ preserve），呼叫端也可以明確指定。 */
  function secondPolicy(key, s) { return secondSetRule(key, s).mode === 'copy' ? 'mirror' : 'preserve'; }
  function syncSecondSet(key, s, policy) {
    policy = policy || secondPolicy(key, s);
    if (MODELS[key].kind !== 'mnt' || policy === 'preserve') return s;
    if (policy === 'mirror') return syncX(key, s);
    if (policy === 'zero') { var ns = cloneState(s); for (var k = 0; k < 24; k++) ns['x' + k] = 0; return ns; }
    throw new Error('unknown second-set policy: ' + policy);
  }
  function xChanged(a, b) { for (var k = 0; k < 24; k++) if ((a['x' + k] | 0) !== (b['x' + k] | 0)) return true; return false; }
  /* 第一組（c0..c23）有改動 ⇒ 第二組依 policy（預設依循環判定）寫；touched＝第二組的值有沒有因此改變
     （頁面記住後匯出／Write to TCON 才含第二組，見 exportRegs）。第一組沒動 ⇒ 第二組不動。 */
  function firstEdit(key, old, ns, policy) {
    if (MODELS[key].kind !== 'mnt') return { state: ns, touched: false };
    var ch = false;
    for (var k = 0; k < 24; k++) if ((old['c' + k] | 0) !== (ns['c' + k] | 0)) { ch = true; break; }
    if (!ch) return { state: ns, touched: false };
    var out = syncSecondSet(key, ns, policy || secondPolicy(key, ns));
    return { state: out, touched: xChanged(ns, out) };
  }
  /* 長循環時第二組的下拉：0~29 ＋ X(31)。名稱表未確認（報告 §6-4），顯示「數字＋GN1 名稱」（0＝R3…17＝B-1），18~29 只有數字。 */
  function secondOptions() {
    var out = [];
    for (var v = 0; v <= 29; v++) out.push({ value: v, name: inv(GN1, v) || '' });
    out.push({ value: 31, name: 'X' });
    return out;
  }
  /* 第二組某格的實際意義代碼（頁面翻成文字）：line58 依列 ⇒ 'line5'~'line8'；其他長循環整組同一個意義；不能填 ⇒ 'unused' */
  function secondMeaning(key, s, row) {
    var R = secondSetRule(key, s);
    if (!secondEditable(key, s, row)) return 'unused';
    return R.meaning === 'line58' ? 'line' + (5 + row) : R.meaning;
  }
  /* 第二組某格可不可以填：free ⇒ 24 格；mux3 ⇒ 只有 _0／_2（row 0、2） */
  function secondEditable(key, s, row) {
    var m = secondSetRule(key, s).mode;
    return m === 'free' || (m === 'mux3' && (row === 0 || row === 2));
  }
  /* 填第二組某格（row＝type _0~_3、col＝r2 g2 b2 r3 g3 b3）。mux3 時 _1／_3 一律寫 0。 */
  function pickSecond(key, s, row, col, value) {
    var v = +value;
    if (!secondEditable(key, s, row) || !(v === 31 || (v >= 0 && v <= 29) && v === Math.floor(v))) return null;
    var ns = cloneState(s); ns['x' + (row * 6 + col)] = v;
    if (secondSetRule(key, s).mode === 'mux3') for (var c = 0; c < 6; c++) { ns['x' + (6 + c)] = 0; ns['x' + (18 + c)] = 0; }
    return { state: ns, text: String(v) };
  }
  function isSecond(f) { return /^x\d+$/.test(f.id); }
  /* 匯出／Write to TCON 的暫存器清單：second＝false（第二組沒被改寫過）⇒ 不含第二組 r2..b3 的位址 */
  function exportRegs(key, s, second) {
    var ids = fieldsOf(key).filter(function (f) { return second || !isSecond(f); }).map(function (f) { return f.id; });
    return encodeFields(key, s, ids);
  }
  /* EM02 規則解析時，Data Mapping 的 byte 若 [7:5]≠0（值超過 5 bit）⇒ 可能是 V512（同一顆 IC 不同用法），
     頁面只讀不寫。回傳可疑的位址清單（getByte(reg) 取原始 byte）。 */
  function v512Suspects(key, getByte) {
    if (key !== 'EM02') return [];
    var out = [];
    fieldsOf(key).forEach(function (f) {
      if (!/^[cx]\d+$/.test(f.id)) return;
      var a = f.parts[0][0], b = getByte(a);
      if (b != null && (b & 0xE0)) out.push(a);
    });
    return out;
  }
  function encode(key, s) { return encodeFields(key, s, null); }
  function changedIds(key, a, b) {
    return fieldsOf(key).filter(function (f) { return ((a[f.id] | 0) !== (b[f.id] | 0)); }).map(function (f) { return f.id; });
  }
  /* 兩狀態之間有變的欄位 ⇒ byte＋遮罩（只含真的有變的位元，其他位元保持 TCON 上原值） */
  function diffRegs(key, a, b) { var ids = changedIds(key, a, b); return ids.length ? encodeFields(key, b, ids) : []; }
  function regsOf(key) { return encode(key, emptyState(key)).map(function (e) { return { reg: e.reg, mask: e.mask }; }); }
  function maskedMerge(cur, val, mask) { return ((cur & ~mask) | (val & mask)) & 0xFF; }

  /* ── Python UI 表格規則 ────────────────────────────────────────────────── */
  function inv(dict, v) { for (var k in dict) if (dict[k] === v) return k; return null; }
  function semOf(key) { return MODELS[key].sem; }
  /* 'off'｜'single'｜'dual'｜'tri'｜'mismatch'（PY:28990-29022、29454-29705） */
  function gateOf(key, s) {
    if (!s.hand) return 'off';
    var p = s.panel | 0;
    if (semOf(key) !== 'e50x') return p <= 1 ? 'single' : (p === 2 ? 'dual' : 'tri');
    var r = s.rd | 0;
    if (p <= 1 && r === 0) return 'single';
    if (p === 2 && r === 1) return 'dual';
    if (p === 3 && (r === 2 || r === 3)) return 'tri';
    return 'mismatch';
  }
  var GATE_ITEMS = ['Non-Hand Mode', 'Single-Gate', 'Dual-Gate', 'Tri-Gate'];   // PY:4074
  /* comboBox_49 顯示（PY:28958-29005） */
  function gateText(key, s) {
    var p = s.panel | 0;   // PY 先設 Non-Hand Mode（:28962），緊接著又依 PANEL_MODE 覆寫（:28998），所以實際顯示一律依 PANEL_MODE
    return p <= 1 ? GATE_ITEMS[1] : (p === 2 ? GATE_ITEMS[2] : GATE_ITEMS[3]);
  }
  function inputDict(key) { var se = semOf(key); return se === 'daz7353' ? D7353 : (se === 'daz6111' ? D6111 : GN1); }
  /* v1.17.0（Bruce 10/7「Data 6 居然會有非標準 0x17…已經點亮，顯示也都是正常的」）：MNT（EM01／EM02／E512）的 force_sel 是 code 0~29 全部合法
     （EM01 原廠 StringGrid 顯示十進位、>29 才改成 29：RApp_TX.cpp:9328-9361；Kick Off「Data hand mode」code 表 D2:R31 也是 0~29），
     Python UI 的 GN1／GN2 只收 0~17 的名稱，所以 18~29 被標成「非標準」（全民 b1_1／b1_3＝0x17）。MNT 改用完整 30 碼命名：
       ・位置 k＝T 表（Single／Dual 上 gate＝T2、Dual 下 gate＝T3）全範圍：k＝3×(2(T−1)−2⌊code/6⌋)＋code%6；
       ・Mirror＝1：送到 D1 起第 p＝−1−k 顆，名稱照原廠 Pixel mapping 檢視（每組 6×gate 數顆左右反轉；資料顏色＝code 的顏色）。 */
  function linName(k) { var px = Math.floor(k / 3), c = k - px * 3; return 'RGB'.charAt(c) + (px >= 0 ? px + 1 : px); }
  function mntIdx(T, code) { return 3 * (2 * (T - 1) - 2 * Math.floor(code / 6)) + code % 6; }
  /* v1.17.0 T 表（Bruce 10/7「81010 的 Kickoff…可以選 T1、T2、T3、T4，也有一個 register 來設定吧」）：
     RM81010_Kick_Off_Check_20210805.xlsx「Data hand mode」A1「FORCE_DE_SEL 182h[7:4]:」、D1:G1＝0001／0010／0100／1000（code 表 D～G 欄＝T1～T4），
     AN7:AQ7「FORCE_DE_SEL 3F2h[7:4]｜FORCE_DE_SEL：0010(default) NOTE:FORCE_DE_EN=1｜2」⇒ FORCE_DE_EN＝1 時 FORCE_DE_SEL 的 one-hot 位元選 D1~D6 用哪張 T 表；
     預設 0010＝T2（輸出公式 E36 從 E 欄＝T2 開始）。MNT：force_de_en＝rt7+0x02[0]、force_de_sel＝rt7+0x45[5:0]（EM02A1_RegisterBank.model:18200／18905，
     6 bit「[0]~[5]: de phase 0~5」）。多位元值（Python UI 一律寫 0xE：PY pyNormalize；蘇坤 0x0E、全民 0x1F）原廠資料未定義，
     v1.17.1（Bruce 10/8「不能都用 T2」）：不再有預設 T2。Kick Off「Data hand mode」的公式（E36＝INDIRECT(ADDRESS($C36+2,COLUMN(E36)))）
     沒有引用 FORCE_DE_SEL（D1:G1、AQ7 只是表頭／範例值）：code 表每一欄 T1~T15＝沿著一行的第幾組 6 條 Data 線（每往右一欄＝往右 2 pixel），
     同一組內的相對接線和 T 無關，T 只決定整體編號（以及一行開頭往左參照不到的 code）。
     ⇒ 基準 T：FORCE_DE_EN＝1 且 one-hot ⇒ T＝bit＋1（原廠「[n]: de phase n」＋Kick Off D1:G1）；
       其他原廠未定義 ⇒「基準未確定」，依已點亮 code／原廠表反推（見 mntBaseT 內註解）；code 表範圍＝T 欄只到 code＜6×(T＋1)，
       Mirror＝1 時名稱整行反轉，範圍照往後 gate 數張表。 */
  function mntGateOfS(s) { return (s && (s.panel | 0) === 2) ? 'dual' : 'single'; }
  function mntFitT(s, gate, only) {
    var mo = mntMirT(s, gate), best = null;
    for (var T = 1; T <= 6; T++) {
      if (only && !(only & (1 << (T - 1)))) continue;
      var n = 0; for (var i = 0; i < 24; i++) if (!mntInRange(T + mo + mntRel(gate, Math.floor(i / 6)), s['c' + i])) n++;
      if (!best || n < best.out) best = { t: T, out: n };
      if (!n) break;
    }
    return best;
  }
  function mntBaseT(s, gate) {
    if (!s) return { t: 2, why: 'none' };
    var v = (s.deSel | 0) & 0x3F;
    if (s.deEn | 0) for (var b = 0; b < 6; b++) if (v === (1 << b)) return { t: b + 1, why: 'onehot' };
    /* FORCE_DE_EN＝0（auto de phase）：EM02 原廠 RT7 清單 33 型（de_en＝0）算出的 Line OD 只有以 T2 解碼才和原廠 Line OD Type 一致
       （tools/check_datamap_auto.js；EM02 RApp_TX.h:533-566 ⇔ RApp_Table.h Line OD）⇒ auto 時以 T2 解讀（依 EM02 反推；EM01／E512 比照推定）。 */
    if (!(s.deEn | 0)) return { t: 2, why: 'auto' };
    /* 多 bit：在有設的 bit 裡，取 24 格全在 code 表範圍內的最低那張（全民 0x1F ⇒ T2、蘇坤 0x0E ⇒ T2，依已點亮 code 反推）；值 0 ⇒ T1~T6 全部試 */
    var f = mntFitT(s, gate || mntGateOfS(s), v || 0);
    return { t: f.t, why: v ? 'multi' : 'zero', fit: f.out };
  }
  function mntTOf(s, gate, row) { return mntBaseT(s, gate).t + (gate === 'dual' && (row & 1) ? 1 : 0); }
  /* v1.17.1：code 表有定義的範圍（Kick Off「Data hand mode」D2:R31／E512_V512 圖解 code 表：T 欄只列到 code＜6×(T＋1)，再往左＝空白），
     多 bit FORCE_DE_SEL 時逐一列出候選基準 T 的超出格數（原廠未定義多 bit 用哪張；換基準只會整體平移 2 pixel 的倍數） */
  function mntInRange(T, code) { code = code | 0; return code === 31 || (code >= 0 && code < Math.min(30, 6 * (T + 1))); }
  function mntRel(gate, row) { return gate === 'dual' && (row & 1) ? 1 : 0; }
  /* Mirror＝1：名稱整行反轉後＝Kick Off 命名往後 gate 數張表（Single＋1、Dual＋2），範圍也照那張表判斷 */
  function mntMirT(s, gate) { return (s && (s.mirror | 0)) ? (gate === 'dual' ? 2 : 1) : 0; }
  function mntCands(s, gate) {
    var v = (s.deSel | 0) & 0x3F, ts = [], mo = mntMirT(s, gate); for (var b = 0; b < 6; b++) if (v & (1 << b)) ts.push(b + 1);
    return ts.map(function (T) { var n = 0; for (var i = 0; i < 24; i++) if (!mntInRange(T + mo + mntRel(gate, Math.floor(i / 6)), s['c' + i])) n++; return { t: T, out: n }; });
  }
  function mntName(gate, row, code, mirror, base) {
    if (code === 31) return 'X';
    if (code < 0 || code > 29) return null;
    var dual = gate === 'dual', T = (base || 2) + (dual && (row & 1) ? 1 : 0), k = mntIdx(T, code);
    if (mirror) { var S2 = dual ? 12 : 6, p = -1 - k; k = S2 - 1 - p; }   /* v1.17.1：整行反轉（不再每 6×gate 一組各自反轉）⇒ 跨組的 code 落在相鄰位置（全民 0x17＝B-1，Bruce 10/8）；等同 Kick Off 命名的「基準＋gate 數」那張 T */
    return linName(k);
  }
  var _mntDicts = {};
  function mntDict(gate, row, mirror, base) {
    var key = gate + (gate === 'dual' && (row & 1) ? 'L' : 'U') + (mirror ? 'M' : '') + (base || 2);
    if (_mntDicts[key]) return _mntDicts[key];
    var d = {}; for (var c = 0; c < 30; c++) d[mntName(gate, row, c, mirror, base)] = c; d.X = 31;
    return (_mntDicts[key] = d);
  }
  function rowDict(key, row, gate, s) {
    var se = semOf(key);
    if (MODELS[key].kind === 'mnt' && (gate === 'single' || gate === 'dual')) return mntDict(gate, row, !!(s && (s.mirror | 0)), mntBaseT(s, gate).t);
    if (se === 'daz7353') return D7353;
    if (se === 'daz6111') return D6111;
    return (gate === 'dual' && (row & 1)) ? GN2 : GN1;
  }
  function colorOfName(n) {   // PY:10547-10600：依序找 R、G、B、X
    if (!n) return 'x';
    if (n.indexOf('R') >= 0) return 'r';
    if (n.indexOf('G') >= 0) return 'g';
    if (n.indexOf('B') >= 0) return 'b';
    return 'x';
  }
  /* 一格的呈現：{ txt, raw, std, color, dark, editable, blank } */
  function cellView(key, s, row, col) {
    var g = gateOf(key, s), p = s.panel | 0, se = semOf(key);
    var v = { txt: '', raw: null, std: true, color: '', dark: false, editable: false, blank: true, src: -1 };
    if (g === 'off' || col >= 6) return v;
    v.dark = (p <= 1 && (row & 1) === 1) || p === 3;      // PY:10603-10621（依 PANEL_MODE）
    var srcRow = row;
    /* v1.15.0：MNT（EM01／EM02／E512）的 Single＝_0~_3 各是一條 gate（G1~G4，E512 圖解；EM01 原廠 StringGrid 也是 4 列原值），
       不套 Python UI「1-2＝1-1」的複本規則（那是 NB／RM81010 的規則：Kick Off「Data hand mode」寫 Normal & Zigzag 只填第一行）。 */
    var mntSingle = MODELS[key].kind === 'mnt' && g === 'single';
    if (se === 'e50x') {
      if (g === 'single') { if (!mntSingle) srcRow = row - (row & 1); }
      else if (g !== 'dual') return v;                     // Tri／組合不符：PY 不更新表格
    }
    var idx = srcRow * 6 + col, raw = s['c' + idx] | 0, name = inv(rowDict(key, row, g, s), raw);
    v.blank = false; v.raw = raw; v.src = idx;
    v.std = name !== null;
    v.txt = name !== null ? name : ('0x' + hex(raw, 2));
    v.color = name !== null ? colorOfName(name) : 'ns';
    v.editable = se !== 'e50x' || g === 'dual' || (g === 'single' && (mntSingle || (row & 1) === 0));
    return v;
  }
  /* PY 每次改動都會順手寫的連動欄位（PY:29230-29315）。只用在使用者動作之後。 */
  function pyNormalize(key, s) {
    var m = MODELS[key]; if (m.kind !== 'nb') return s;
    if (m.sem === 'e50x') { s.deEn = s.hand ? 1 : 0; s.deSel = 0xE; }
    else {
      s.lineEn = s.hand ? 1 : 0;
      if (s.lineEn) {
        var p = s.panel | 0, lt = (p === 2) ? [0, 1, 2, 3, 0, 1, 2, 3] : (p <= 1 ? [0, 2, 0, 2, 0, 2, 0, 2] : [0, 1, 2, 3, 0, 1, 2, 3]);
        for (var i = 0; i < 8; i++) s['lt' + i] = lt[i];
      }
    }
    return s;
  }
  function normText(t) { return String(t == null ? '' : t).trim().toUpperCase(); }
  /* 在表格某格輸入文字（PY change_table_dm_rgb_item :12484-12565 ＋ set_rgb_table_to_dm_info）。
     回傳 { state, text } 或 null（這格不能改）。 */
  function editCell(key, s, row, col, text) {
    var cv = cellView(key, s, row, col);
    if (!cv.editable) return null;
    var g0 = gateOf(key, s), mnt = MODELS[key].kind === 'mnt';
    var t = normText(text), dict = mnt ? rowDict(key, row, g0, s) : inputDict(key);
    if (!(t in dict)) t = 'X';
    var ns = cloneState(s), g = g0, se = semOf(key);
    if (mnt) ns['c' + (row * 6 + col)] = dict[t];
    else if (se !== 'e50x') ns['c' + (row * 6 + col)] = dict[t];
    else if (g === 'single') { ns['c' + (row * 6 + col)] = GN1[t]; ns['c' + ((row + 1) * 6 + col)] = GN1[t]; }
    else { var dd = rowDict(key, row, g, s); ns['c' + (row * 6 + col)] = (t in dd) ? dd[t] : dd.X; }
    return { state: pyNormalize(key, ns), text: t };
  }
  /* 24 個名稱整批套用（Import Excel、All Same Pixel 共用：PY set_rgb_table_to_dm_info :29707-29847） */
  function applyNames(key, s, names) {
    var g = gateOf(key, s), se = semOf(key), ns = cloneState(s);
    function look(d, n) { n = normText(n); return (n in d) ? d[n] : d.X; }
    if (MODELS[key].kind === 'mnt' && (g === 'single' || g === 'dual')) { for (var m = 0; m < 24; m++) ns['c' + m] = look(rowDict(key, Math.floor(m / 6), g, s), names[m]); }
    else if (se !== 'e50x') { var d0 = inputDict(key); for (var i = 0; i < 24; i++) ns['c' + i] = look(d0, names[i]); }
    else if (g === 'dual') { for (var j = 0; j < 24; j++) ns['c' + j] = look(Math.floor(j / 6) & 1 ? GN2 : GN1, names[j]); }
    else if (g === 'single') { var mntS = MODELS[key].kind === 'mnt'; for (var k = 0; k < 24; k++) { var r = Math.floor(k / 6); ns['c' + k] = look(GN1, names[(mntS ? r : r - (r & 1)) * 6 + k % 6]); } }
    else return null;
    return pyNormalize(key, ns);
  }
  /* All Same Pixel（PY dm_all_same_pixel :29925：先用 GN2 驗證，不在表內 ⇒ 'X'） */
  function allSame(key, s, text) {
    var t = normText(text); if (!(t in GN2) && !(MODELS[key].kind === 'mnt' && t in rowDict(key, 0, gateOf(key, s), s))) t = 'X';
    var names = []; for (var i = 0; i < 24; i++) names.push(t);
    var ns = applyNames(key, s, names);
    return ns ? { state: ns, text: t } : null;
  }
  /* ── v1.2.0 下拉選單（Bruce 10/7「改成下拉式選單，也就是只能選擇這幾個選項（還包含 X）」）──────
     某一格可選的名稱，順序＝PY 字典順序（:2831 GN1、:2836 GN2、:2841 D6111、:2846 D7353），X 在最後。
     e50x：Single 與 Dual 的 Line 1-1／2-1 用 GN1，Dual 的 Line 1-2／2-2 用 GN2（PY 寫這兩列一律查 GN2，
     :29738；All Same Pixel 也能把 R5／R6 寫進這兩列，:29925）。不能改的格回傳 []。 */
  function namesOf(dict) { return Object.keys(dict); }
  function cellOptions(key, s, row, col) {
    var v = cellView(key, s, row, col);
    if (!v.editable) return [];
    var d = rowDict(key, row, gateOf(key, s), s);
    return namesOf(d).map(function (n) { return { name: n, value: d[n] }; });
  }
  /* 下拉選某個名稱。與 editCell 的差別只有一處：Dual 的 Line 1-2／2-2 接受 GN2 名稱（R5／R6…），
     其餘（含 Single 鏡射、連動欄位）完全走 editCell。 */
  function pickCell(key, s, row, col, name) {
    var t = normText(name), g = gateOf(key, s);
    if (MODELS[key].kind !== 'mnt' && semOf(key) === 'e50x' && g === 'dual' && (row & 1) && (t in GN2) && !(t in GN1)) {
      if (!cellView(key, s, row, col).editable) return null;
      var ns = cloneState(s); ns['c' + (row * 6 + col)] = GN2[t];
      return { state: pyNormalize(key, ns), text: t };
    }
    var opts = cellOptions(key, s, row, col).map(function (o) { return o.name; });
    if (opts.indexOf(t) < 0) return null;
    return editCell(key, s, row, col, t);
  }
  /* All Same Pixel 下拉：只列會生效的名稱（PY 先用 GN2 驗證，再依各列字典查，查不到 ⇒ X）。
     e50x Dual ⇒ GN2（R5／R6 只會寫到 Line 1-2／2-2，其他列變 X）；e50x Single ⇒ GN1；DAZ ⇒ 自己的表。 */
  function allSameOptions(key, s) {
    var se = semOf(key), g = gateOf(key, s);
    if (MODELS[key].kind === 'mnt' && (g === 'single' || g === 'dual')) return namesOf(rowDict(key, 0, g, s));
    if (se === 'e50x') return g === 'dual' ? namesOf(GN2) : (g === 'single' ? namesOf(GN1) : []);
    return namesOf(inputDict(key)).filter(function (n) { return n in GN2; });
  }
  /* Gate Type 下拉（PY get_object_to_dm_info :29849） */
  function setGate(key, s, item) {
    var gi = GATE_ITEMS.indexOf(item); if (gi <= 0) return null;
    var ns = cloneState(s);
    ns.panel = gi;
    if (semOf(key) === 'e50x') ns.rd = gi - 1;
    return pyNormalize(key, ns);
  }
  function setHand(key, s, on) { var ns = cloneState(s); ns.hand = on ? 1 : 0; return pyNormalize(key, ns); }
  /* PY 的 list_rgbstr（24 個名稱；表外 ⇒ 'X'） */
  function pyNames(key, s) {
    var out = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 6; c++) { var v = cellView(key, s, r, c); out.push(v.blank || !v.std ? 'X' : v.txt); }
    return out;
  }
  /* DM CKS（PY:29971）。回傳 '0xNNNN'；Hand 關 ⇒ null（PY 顯示 'DM CKS：'）。 */
  function cks(key, s) {
    var g = gateOf(key, s);
    if (g === 'off') return null;
    /* Tri／組合不符：PY 不更新 list_rgbstr，剛開檔時是空的 ⇒ 每格以 'X' 計（KeyError／IndexError 分支），這裡照算 */
    var w = (s.panel | 0) <= 1 ? CKS_SINGLE : CKS_DUAL, n = pyNames(key, s), sum = 0;
    for (var i = 0; i < 24; i++) sum += ((n[i] in CKS_W) ? CKS_W[n[i]] : CKS_W.X) * w[i];
    return '0x' + hex(sum, 4);
  }
  /* 「表格可輸入之文字」前循環那一格（PY dm_label_update :29947） */
  function preLabels(key) { return semOf(key) === 'e50x' ? ['(R-2 / R-1)', '(G-2 / G-1)', '(B-2 / B-1)'] : ['(R-1)', '(G-1)', '(B-1)']; }
  /* Data Mapping Code 表（tableWidget_31）：列出的位址（PY:28911 map_datamapping_addr_3e_dict[0]＋bytes） */
  function codeAddrs(key) {
    var m = MODELS[key], out = [], i;
    if (m.kind === 'nb') { var dm = PY_TABLES[m.tbl].dm; for (i = 0; i < dm[2]; i++) out.push(dm[0] + i); }
    else for (i = 0; i < 24; i++) out.push(m.rt7 + 0x03 + i);
    return out;
  }
  /* 從狀態算某個位址的 byte（遮罩外用 base 或 0） */
  function byteOf(key, s, reg, baseByte) {
    var e = encode(key, s).filter(function (x) { return x.reg === reg; })[0];
    return e ? maskedMerge(baseByte | 0, e.val, e.mask) : (baseByte | 0);
  }
  function fieldsAt(key, reg) {
    return fieldsOf(key).filter(function (f) { return f.parts.some(function (p) { return p[0] === reg; }); });
  }
  function regNote(key, reg) {
    return fieldsAt(key, reg).map(function (f) {
      var p = f.parts.filter(function (q) { return q[0] === reg; })[0];
      return f.name + ' [' + p[1] + ':' + p[2] + ']';
    }).join(' / ');
  }

  /* ── MNT 網頁附加：原廠預設樣式（RApp_TX.h:530-568，34 筆；'x' ＝ 不改）─────────── */
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
  /* 原廠表欄位 → 本核心的欄位 id。原廠索引 k（0..47）的排法是「通道 × 4 ＋ type」（RApp_TX.cpp:9072），
     k<24 ⇒ 表格格子 c(type×6＋通道)；k≥24 ⇒ 附加 x(type×6＋通道−6)。 */
  var PRESET_HEAD = ['rd', 'panel', 'ltpsZz', 'subPanel', 'mirror', 'chrb', 'deEn', 'deSel', 'rvsL', 'rvsH', 'hand'];
  function mntSelId(k) { var ch = Math.floor(k / 4), t = k % 4; return ch < 6 ? 'c' + (t * 6 + ch) : 'x' + (t * 6 + ch - 6); }
  var PRESETS = PRESET_SRC.map(function (p) {
    var h = p[1].split(/\s+/), v = p[2] ? p[2].split(/\s+/) : [], set = {};
    for (var i = 0; i < PRESET_HEAD.length; i++) if (h[i] !== 'x') set[PRESET_HEAD[i]] = +h[i];
    for (var k = 0; k < v.length; k++) if (v[k] !== 'x') set[mntSelId(k)] = +v[k];
    return { name: p[0], set: set };
  });
  /* 套預設樣式（Dispatch 10/7 依 #9b56c775 定案）：兩組都照原廠表 RApp_TX.h:530-567 寫入，'x' 不寫，(23)(28)(32) 第二組寫 0。
     🔴 寫到「語意位址」：原廠索引 k（0..47）＝通道×4＋type（mntSelId）⇒ r0_0 → rt7+0x03、r2_0 → rt7+0x5E。
        原廠 RApp_TX_RT7_DataMapping_RegSet 用 u8reg_force_sel[i-10]／[i-34]（TX.cpp:10934、10939），但 r0_0 的 index 是 11
        （TX.h:57）⇒ 整組錯開 1 byte（r0_0、r2_0 沒寫到；b1_3 寫進 0x1B、b3_3 寫進 0x76）。網頁不照抄這個 bug（CHANGELOG 有註明）。
     second＝'copy'（只供測試／日後切換）：不寫原廠表的第二組。 */
  var PRESET_SECOND = 'vendor';
  function applyPreset(key, s, idx, second) {
    var p = PRESETS[idx]; if (!p || MODELS[key].kind !== 'mnt') return s;
    var out = cloneState(s), mode = second || PRESET_SECOND;
    Object.keys(p.set).forEach(function (id) { var fd = fieldById(key, id); if (fd && (mode === 'vendor' || !isSecond(fd))) out[id] = p.set[id] & ((1 << fd.bits) - 1); });
    return out;
  }
  /* 這個預設樣式有沒有原廠表的第二組值（有 48 格清單的才有） */
  function presetHasSecond(idx) { var p = PRESETS[idx]; return !!p && Object.keys(p.set).some(function (id) { return /^x\d+$/.test(id); }); }
  function matchPreset(key, s) {
    if (MODELS[key].kind !== 'mnt') return -1;
    for (var j = 0; j < PRESETS.length; j++) {
      var ok = true, set = PRESETS[j].set;
      for (var id in set) { var fd = fieldById(key, id); if (!fd || (PRESET_SECOND !== 'vendor' && isSecond(fd))) continue; if (((s[id] | 0) & ((1 << fd.bits) - 1)) !== (set[id] & ((1 << fd.bits) - 1))) { ok = false; break; } }
      if (ok) return j;
    }
    return -1;
  }
  var PANEL_MODES = ['1D1G', 'ZigZag', 'HSD', 'LTPS'];
  var SUB_PANEL = [
    ['Normal'],
    ['type1', 'type2', 'type3', 'type4', 'type5', 'type6', 'type7', 'type8'],
    ['type1', 'type4', 'type3-5', 'type4+BOE zigzag', '8-pixel', '4line,4pixel'],
    ['MUX3 normal type1', 'MUX2 normal type1', 'MUX3 zigzag type1', 'MUX2 zigzag type1',
     'MUX3 normal type2', 'MUX2 normal type2', 'MUX3 zigzag type2', 'MUX2 zigzag type2']
  ];
  var RD_MODES = ['1D1G', 'HSD (dual-gate)', 'LTPS (tri-gate)', '3'];

  /* ── 讀檔（PY FileProcess.py openauto :485）──────────────────────────────── */
  function loadCodeBytes(name, u8) {
    var low = String(name || '').toLowerCase(), out = [], txt, i;
    if (/\.bin$/.test(low)) return u8;
    txt = ''; for (i = 0; i < u8.length; i++) txt += String.fromCharCode(u8[i]);
    var lines = txt.split(/\r?\n|\r/);
    if (/\.hex$/.test(low)) {
      lines.forEach(function (l) {
        l = l.trim().toUpperCase();
        if (l.length < 11 || l.charAt(0) !== ':') return;
        var n = parseInt(l.substr(1, 2), 16);
        if (l.substr(7, 2) !== '00') return;
        for (var k = 0; k < n; k++) out.push(parseInt(l.substr(9 + 2 * k, 2), 16));
      });
    } else {
      lines.forEach(function (l) { var t = l.trim(); if (/^[0-9A-Fa-f]+$/.test(t)) out.push(parseInt(t, 16) & 0xFF); });
    }
    return Uint8Array.from(out);
  }
  /* 檔名 → PY tcon（PY find_a_tcon :35566：先找 list_tcon 名稱，再 E501A／E501B／E503 依序覆寫） */
  var PY_LIST = ['DAZ6111', 'DAZ6138', 'DAZ6139', 'DAZ7353', 'RM81010', 'RM81011', 'RM81000', 'RM81001', 'RM81002', 'RM81003', 'RM81004'];
  function modelFromName(name) {
    var n = String(name || ''), py = null;
    for (var i = 0; i < PY_LIST.length; i++) if (n.indexOf(PY_LIST[i]) >= 0) { py = PY_LIST[i]; break; }
    if (n.indexOf('E501A') >= 0) py = 'RM81010';
    if (n.indexOf('E501B') >= 0) py = 'RM81011';
    if (n.indexOf('E503') >= 0) py = 'RM81000';
    return py ? { py: py, key: PY_TO_KEY[py] } : null;
  }

  /* ── MNT .bin 定位（v1.0.0，未改）──────────────────────────────────────── */
  function u16(b, o) { return (o + 1 < b.length) ? (b[o] | (b[o + 1] << 8)) : -1; }
  var LOCATORS = [
    { model: 'EM02', medium: 'eeprom', hdr7: 0x31, hdr8: 0x33, bankBase: 0x0400, gap: 0x102, lodHdr: 0x3B, lodBase: 0x0900 },   // lod1_addr＝BK_SYS+0x3B（EM02 RApp_BIN_Header.h:669）
    { model: 'E512', medium: 'eeprom', hdr7: 0x43, hdr8: 0x45, bankBase: 0x0400, gap: 0xF9 },
    { model: 'EM01', medium: 'eeprom', hdr7: 0x46, hdr8: 0x48, bankBase: 0x0400, gap: 0xFF }
  ];
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
      var oL = L.lodHdr ? u16(bytes, L.lodHdr) : 0; if (oL <= 0 || oL + 0x100 > bytes.length) oL = 0;
      hits.push({ model: L.model, medium: L.medium, rt7Bank: o7, rt8: o8, lodBank: oL,
        fileOf: function (reg) {
          if (oL && reg >= L.lodBase && reg < L.lodBase + 0x100) return oL + (reg - L.lodBase);
          if (reg >= 0x0500 && reg < 0x0600) return o8 + (reg - 0x0500);
          if (reg >= L.bankBase && reg < 0x0500) return o7 + (reg - L.bankBase);
          return -1;
        } });
    });
    return hits;
  }
  function nbFileOf(key) {
    var r = PY_TABLES[MODELS[key].tbl].rom;
    return function (reg) { return (reg >= r[2] && reg <= r[3]) ? r[0] + (reg - r[2]) : -1; };
  }
  function cksOf(bytes) { var c = 0; for (var i = 0; i < bytes.length; i++) c += bytes[i]; return c >>> 0; }
  function parseWith(key, bytes, fileOf, medium) {
    var gb = function (reg) { var o = fileOf(reg); return (o >= 0 && o < bytes.length) ? bytes[o] : 0; };
    var st = decode(key, gb);
    return { ok: true, model: key, medium: medium, state: st, fileOf: fileOf, cks: cksOf(bytes), v512: v512Suspects(key, gb) };
  }
  /* 匯入。name ＝ 檔名（決定解析方式與 PY 型號）；pick ＝ 頁面目前選的型號。
     規則：MNT 依檔案內容（只接受恰好一個命中）；PY 型號依檔名（同 PY），檔名看不出來才用 pick。 */
  function parseCode(raw, pick, name) {
    var bytes = loadCodeBytes(name || 'x.bin', raw);
    var hits = locate(bytes);
    var fromName = modelFromName(name);
    if (pick && MODELS[pick] && MODELS[pick].kind === 'mnt') {
      var h2 = hits.filter(function (h) { return h.model === pick; });
      if (h2.length === 1) return parseWith(pick, bytes, h2[0].fileOf, h2[0].medium);
      if (hits.length && !fromName) return { ok: false, reason: 'modelMismatch', found: hits.map(function (h) { return h.model; }) };
    }
    if (hits.length === 1 && !fromName) return parseWith(hits[0].model, bytes, hits[0].fileOf, hits[0].medium);
    if (hits.length > 1 && !fromName) return { ok: false, reason: 'ambiguous', found: hits.map(function (h) { return h.model; }) };
    var key = fromName ? fromName.key : (pick && MODELS[pick] && MODELS[pick].kind === 'nb' ? pick : null);
    if (!key) return { ok: false, reason: 'noMatch' };
    var r = PY_TABLES[MODELS[key].tbl].rom;
    if (bytes.length < r[1] + 1) return { ok: false, reason: 'short', model: key, need: r[1] + 1, got: bytes.length };
    var res = parseWith(key, bytes, nbFileOf(key), 'rom');
    res.byName = !!fromName; res.py = fromName ? fromName.py : MODELS[key].py;
    return res;
  }

  /* ── 匯出 ─────────────────────────────────────────────────────────────── */
  function hex(v, n) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < n) s = '0' + s; return s.slice(-n); }
  function asciiOnly(s) { return String(s || '').replace(/[^\x20-\x7E]/g, '?'); }
  /* MNT：TCON 工具 Script 格式（write -m AAAA VV MM，ASCII；格式照 wfg.html wfgEm02BuildScript） */
  function buildScript(key, s, opt) {
    opt = opt || {};
    var lines = [], regs = exportRegs(key, s, opt.second !== false);   // opt.second＝false：第一組沒動過 ⇒ 不寫 r2..b3
    if (opt.comments !== false) {
      lines.push('// DataMap ' + asciiOnly(opt.version || '') + ' - exported ' + key + ' Data Mapping settings');
      lines.push('// Load this file from the Script page of the TCON tool.');
      lines.push('// Data Mapping registers only (rt7 data mapping + rd_mode) - masked writes, no TX, no timing.');
      lines.push('// ' + (opt.now || new Date()).toISOString());
      if (opt.source) lines.push('// source: ' + asciiOnly(opt.source));
      if (typeof opt.cks === 'number' && opt.cks >= 0) lines.push('// source CKS: 0x' + hex(opt.cks, 6));
      lines.push('');
    }
    for (var i = 0; i < regs.length; i++) {
      var e = regs[i], l = 'write -m ' + hex(e.reg, 4) + ' ' + hex(e.val, 2) + ' ' + hex(e.mask, 2);
      if (opt.comments !== false) l += '    // ' + asciiOnly(regNote(key, e.reg));
      lines.push(l);
    }
    var text = lines.join('\n') + '\n';
    for (var c = 0; c < text.length; c++) if (text.charCodeAt(c) > 0x7F) return { ok: false, reason: 'non-ASCII at ' + c };
    return { ok: true, text: text, count: regs.length };
  }
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
  /* NB：PY SCRIPT Excel（表頭逐字照 SCRIPT_SoftwareReset_20211025.xlsx；PY:27207 用 'TCON\n(內部型號)' 比對） */
  var PY_SCRIPT_HEAD = ['TCON\n(內部型號)', 'Check Item', 'Slave Address\n(HEX)', 'Offset-Bytes', 'Offset\n(HEX)', 'Default Case',
    'Case 0 Value\n(HEX)', 'Case 1 Value\n(HEX)', 'Case 2 Value\n(HEX)', 'Case 3 Value\n(HEX)', 'Case 4 Value\n(HEX)',
    'Case 5 Value\n(HEX)', 'Case 6 Value\n(HEX)', 'Case 7 Value\n(HEX)', 'Description Case 0', 'Description Case 1',
    'Description Case 2', 'Description Case 3', 'Description Case 4', 'Description Case 5', 'Description Case 6', 'Description Case 7'];
  function offsetText(fd) { return fd.parts.map(function (p) { return '0x' + hex(p[0], 3) + '[' + p[1] + ':' + p[2] + ']'; }).join(','); }
  function pyScriptRows(key, s, opt) {
    opt = opt || {};
    var m = MODELS[key], rows = [PY_SCRIPT_HEAD.slice()];
    var tcon = opt.tcon || m.py;
    fieldsOf(key).forEach(function (fd) {
      var r = [tcon, 'SCRIPT WR', '0x3E', '2', offsetText(fd), '0', '0x' + hex(s[fd.id] | 0, 2)];
      while (r.length < 14) r.push('');
      r.push(fd.name);
      while (r.length < PY_SCRIPT_HEAD.length) r.push('');
      rows.push(r);
    });
    return rows;
  }
  /* 讀回 PY SCRIPT 列 → 套到 3E 影像（自測用：每列照 PY 的 bit 切法寫回） */
  function applyPyScriptRows(rows, image) {
    var n = 0;
    rows.slice(1).forEach(function (r) {
      var parts = String(r[4]).split(',').map(function (t) {
        var mm = /0x([0-9A-Fa-f]+)\[(\d):(\d)\]/.exec(t); return [parseInt(mm[1], 16), +mm[2], +mm[3]];
      });
      splitField({ parts: parts }, parseInt(r[6], 16)).forEach(function (e) { image.set(e.reg, maskedMerge(image.get(e.reg), e.val, e.mask)); });
      n++;
    });
    return n;
  }
  /* Export Excel（PY:30024）：檔名與表格內容 */
  function excelName(key, s, glass, now) {
    var d = now || new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var g = (s.panel | 0) <= 1 ? 'SingleGate' : ((s.panel | 0) === 2 ? 'DualGate' : '');
    return 'DataMapping_Table_Glass(' + glass + ')_GateType(' + g + ')_CKS(' + (cks(key, s) || '') + ')_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.xlsx';
  }
  function excelRows(key, s) {
    var rows = [['', 'Data 1', 'Data 2', 'Data 3', 'Data 4', 'Data 5', 'Data 6']], L = ['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'];
    for (var r = 0; r < 4; r++) {
      var row = [L[r]];
      for (var c = 0; c < 6; c++) { var v = cellView(key, s, r, c); row.push(v.blank ? 'X' : v.txt); }
      rows.push(row);
    }
    return rows;
  }
  /* Import Excel（PY:30161、read_excel_horizontal_data_to_list :36847）：A 欄找 'Line 1-1'…，取右邊非空的格。 */
  function excelToNames(rows) {
    var L = ['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'], names = [];
    for (var i = 0; i < 4; i++) {
      var row = null;
      for (var r = 0; r < rows.length; r++) if (rows[r] && rows[r][0] === L[i]) { row = rows[r]; break; }
      if (!row) return { ok: false, reason: 'no ' + L[i] };
      var vals = row.slice(1).filter(function (v) { return v !== '' && v != null; });
      if (vals.length !== 6) return { ok: false, reason: L[i] + ': ' + vals.length + ' cells' };
      names = names.concat(vals.map(String));
    }
    return { ok: true, names: names };
  }

  /* ── 最小 xlsx 讀取（只讀第一張工作表；inflateRaw 由呼叫端提供）──────────────── */
  function rd16(b, o) { return b[o] | (b[o + 1] << 8); }
  function rd32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  async function unzip(u8, inflateRaw) {
    var eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) if (rd32(u8, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip');
    var n = rd16(u8, eocd + 10), off = rd32(u8, eocd + 16), files = {};
    for (var k = 0; k < n; k++) {
      var method = rd16(u8, off + 10), csize = rd32(u8, off + 20), nlen = rd16(u8, off + 28), xlen = rd16(u8, off + 30), clen = rd16(u8, off + 32), lho = rd32(u8, off + 42);
      var nm = ''; for (var j = 0; j < nlen; j++) nm += String.fromCharCode(u8[off + 46 + j]);
      var dataStart = lho + 30 + rd16(u8, lho + 26) + rd16(u8, lho + 28), data = u8.subarray(dataStart, dataStart + csize);
      files[nm] = { method: method, data: data };
      off += 46 + nlen + xlen + clen;
    }
    var out = {};
    for (var f in files) out[f] = files[f].method === 0 ? files[f].data : await inflateRaw(files[f].data);
    return out;
  }
  function utf8dec(u8) { if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8); return Buffer.from(u8).toString('utf8'); }
  function xmlUnesc(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&amp;/g, '&'); }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref)[1], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + (m.charCodeAt(i) - 64); return n - 1; }
  async function readXlsxRows(u8, inflateRaw) {
    var z = await unzip(u8, inflateRaw), ss = [];
    if (z['xl/sharedStrings.xml']) {
      var sx = utf8dec(z['xl/sharedStrings.xml']);
      (sx.match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
        ss.push((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(function (t) { return xmlUnesc(t.replace(/<[^>]+>/g, '')); }).join(''));
      });
    }
    var sheet = null, wb = z['xl/workbook.xml'] ? utf8dec(z['xl/workbook.xml']) : '';
    var first = /<sheet [^>]*r:id="([^"]+)"/.exec(wb), rels = z['xl/_rels/workbook.xml.rels'] ? utf8dec(z['xl/_rels/workbook.xml.rels']) : '';
    if (first && rels) {
      var re = new RegExp('<Relationship [^>]*Id="' + first[1] + '"[^>]*Target="([^"]+)"'), mm = re.exec(rels) || new RegExp('Target="([^"]+)"[^>]*Id="' + first[1] + '"').exec(rels);
      if (mm) { var tg = mm[1].replace(/^\/?xl\//, '').replace(/^\//, ''); sheet = z['xl/' + tg]; }
    }
    if (!sheet) sheet = z['xl/worksheets/sheet1.xml'];
    if (!sheet) throw new Error('no worksheet');
    var xml = utf8dec(sheet), rows = [];
    (xml.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || []).forEach(function (rw) {
      var rn = +(/ r="(\d+)"/.exec(rw) || [0, rows.length + 1])[1], row = [];
      (rw.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(function (c) {
        var ref = /r="([A-Z]+\d+)"/.exec(c), t = /t="(\w+)"/.exec(c), v = /<v>([\s\S]*?)<\/v>/.exec(c), is = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c);
        var val = '';
        if (t && t[1] === 's' && v) val = ss[+v[1]];
        else if (t && t[1] === 'inlineStr' && is) val = xmlUnesc(is[1]);
        else if (v) val = xmlUnesc(v[1]);
        row[ref ? colIdx(ref[1]) : row.length] = val;
      });
      for (var i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      rows[rn - 1] = row;
    });
    for (var i2 = 0; i2 < rows.length; i2++) if (!rows[i2]) rows[i2] = [];
    return rows;
  }

  /* ── I2C ─────────────────────────────────────────────────────────────── */
  /* 讀-改-寫，遮罩外保持原值，寫後讀回比對。io.read(addr,len) → bytes、io.write(addr,bytes)。 */
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
      } catch (err) { failed.push(e.reg); log('e', 'W 0x' + hex(e.reg, 4) + ' FAIL ' + (err && err.message || err)); }
    }
    return { ok: failed.length === 0, written: written, failed: failed };
  }
  /* 要讀的位址區段（Data Mapping 欄位用到的全部 byte，連續的合併） */
  function readSpans(key) {
    var addrs = {}; fieldsOf(key).forEach(function (f) { f.parts.forEach(function (p) { addrs[p[0]] = 1; }); });
    var list = Object.keys(addrs).map(Number).sort(function (a, b) { return a - b; }), spans = [];
    list.forEach(function (a) { var l = spans[spans.length - 1]; if (l && a === l[0] + l[1]) l[1]++; else spans.push([a, 1]); });
    return spans;
  }
  async function readState(io, key) {
    var mem = {}, sp = readSpans(key);
    for (var i = 0; i < sp.length; i++) {
      var b = await io.read(sp[i][0], sp[i][1]);
      if (!b || b.length < sp[i][1]) throw new Error('short read @0x' + hex(sp[i][0], 4));
      for (var k = 0; k < sp[i][1]; k++) mem[sp[i][0] + k] = b[k];
    }
    return { state: decode(key, function (r) { return mem[r] | 0; }), bytes: mem };
  }
  function modelByIcId(id) {
    for (var i = 0; i < MNT_KEYS.length; i++) {
      var m = MODELS[MNT_KEYS[i]];
      if (id && id.length >= 3 && id[0] === m.icId[0] && id[1] === m.icId[1] && (id[2] & 0xF0) === m.icId[2]) return m.key;
    }
    return null;
  }

  var API = {
    MODELS: MODELS, MODEL_KEYS: MODEL_KEYS, MNT_KEYS: MNT_KEYS, PY_TO_KEY: PY_TO_KEY, PY_TABLES: PY_TABLES,
    GN1: GN1, GN2: GN2, D6111: D6111, D7353: D7353, CKS_W: CKS_W, GATE_ITEMS: GATE_ITEMS, RD_MODE_REG: RD_MODE_REG,
    PANEL_MODES: PANEL_MODES, SUB_PANEL: SUB_PANEL, SUB_PANEL_REG: SUB_PANEL_REG, RD_MODES: RD_MODES, PRESETS: PRESETS, CH_NAMES: CH_NAMES,
    fieldsOf: fieldsOf, fieldById: fieldById, readField: readField, splitField: splitField,
    emptyState: emptyState, cloneState: cloneState, decode: decode, encode: encode, encodeFields: encodeFields,
    changedIds: changedIds, diffRegs: diffRegs, regsOf: regsOf, maskedMerge: maskedMerge,
    gateOf: gateOf, gateText: gateText, cellView: cellView, editCell: editCell, applyNames: applyNames, allSame: allSame,
    mntName: mntName, mntIdx: mntIdx, linName: linName, mntBaseT: mntBaseT, mntTOf: mntTOf, mntInRange: mntInRange, mntRel: mntRel, mntCands: mntCands, mntMirT: mntMirT,
    setGate: setGate, setHand: setHand, pyNormalize: pyNormalize, pyNames: pyNames, cks: cks, preLabels: preLabels,
    inputDict: inputDict, colorOfName: colorOfName, codeAddrs: codeAddrs, byteOf: byteOf, regNote: regNote, fieldsAt: fieldsAt,
    applyPreset: applyPreset, matchPreset: matchPreset, PRESET_SECOND: PRESET_SECOND, presetHasSecond: presetHasSecond,
    cellOptions: cellOptions, pickCell: pickCell, allSameOptions: allSameOptions, xInfo: xInfo, syncX: syncX, syncSecondSet: syncSecondSet, secondSetRule: secondSetRule, secondMeaning: secondMeaning, secondPolicy: secondPolicy, firstEdit: firstEdit, exportRegs: exportRegs,
    secondOptions: secondOptions, secondEditable: secondEditable, pickSecond: pickSecond, xChanged: xChanged, v512Suspects: v512Suspects,
    loadCodeBytes: loadCodeBytes, modelFromName: modelFromName, locate: locate, parseCode: parseCode, nbFileOf: nbFileOf, cksOf: cksOf,
    buildScript: buildScript, applyScript: applyScript, pyScriptRows: pyScriptRows, applyPyScriptRows: applyPyScriptRows,
    excelName: excelName, excelRows: excelRows, excelToNames: excelToNames, readXlsxRows: readXlsxRows,
    writeRegs: writeRegs, readSpans: readSpans, readState: readState, modelByIcId: modelByIcId, hex: hex
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.TCONDataMap = API;
})(typeof window !== 'undefined' ? window : this);
