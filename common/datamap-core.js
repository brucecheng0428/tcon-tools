/* ═══════════════════════════════════════════════════════════════════════════
   datamap-core.js — Data Mapping 共用核心（v1.3.2，2026-10-12）
   ───────────────────────────────────────────────────────────────────────────
   給 datamap.html 與 tools/check_datamap.js 共用：瀏覽器下 window.TCONDataMap，node 下 module.exports。
   不碰 DOM、不碰 WebSocket；I2C 只透過呼叫端傳進來的 io（io.read(addr,len)、io.write(addr,bytes)）。
   ── v1.3.0（Bruce 2026-10-09「將EN01先完整調查完source code後，還有model file，將EN01也整合進datamap網頁」）──
   ・新增 EN01（RM81008）：kind 'en01'，依原廠 WPF RomCodeProcessUI（PY 沒有 EN01），細節與出處見下方「EN01」區塊；
     調查報告 assistant_kb/reference/EN01_DataMapping調查_20261009.md。MODEL_KEYS（PY＋MNT）不變，下拉另用 SELECT_KEYS。

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
   ④ 每次改動 PY 都會順手寫：FORCE_DE_EN ＝ Hand Mode、FORCE_DE_SEL[7:4] ＝ 0xE（DAZ613x／E50x，PY:29267-29280／29377-29390；MNT 不在 PY、不動）；
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
  /* v1.18.21（Bruce 10/8「E503 應該也要有 Mirror……CHRB、CHWB 都有」）：NB 的 Mirror／CHRB／CHWB／READ_RVS（Python UI 字典沒有；出處同上 .model 檔）：
       RM8100x_for_FAE_20240925_20250311.model:8850-8898（E503）          CHWB 0x321[4]、CHRB 0x321[3]、MIRROR 0x321[0]、READ_RVS 0x343[7:0]
       RM81010_for_FAE_20240509_20241127.model:10076-10124（E501A）       CHWB 0x3F1[4]、CHRB 0x3F1[3]、MIRROR 0x3F1[0]、READ_RVS 0x413[7:0]（RM81011 model:9933-9981 相同）
       DAZ6138_20230309.model:7708-7770（DAZ6138／6139）                  MIRROR 0x181[0]、READ_RVS 0x1A2[5:0]（bit n＝iSP Port n）、CHRB 0x181[3]、CHWB 0x181[4]
       DAZ6111_for_FAE_20240509_20240830.model:2906-2912                  CHWB 0x17E[7]（沒有 MIRROR；MIRROR_Function 只有 SW_REV 0x17C[3]；CHRB 只有 hand 模式 0x17B[0]/0x17C[0]，for RD test ⇒ 未確認，不加）
       DAZ7353_20190418.model:2923-2929                                   CHWB 0xAC[7]（沒有 MIRROR；CHRB 只有 hand 模式 ⇒ 未確認，不加）
     原廠註解：MIRROR=0 ⇒ READ_RVS=00；MIRROR=1 ⇒ READ_RVS=FF（DAZ6138：Check READ_RVS = 1）；FORCE_SEL need manual readjustment。 */
  var NB_EXTRA = {
    RM81000: { mirror: [0x321, 0, 0], chrb: [0x321, 3, 3], chwb: [0x321, 4, 4], rvsL: [0x343, 7, 0] },
    RM81010: { mirror: [0x3F1, 0, 0], chrb: [0x3F1, 3, 3], chwb: [0x3F1, 4, 4], rvsL: [0x413, 7, 0] },
    DAZ6138: { mirror: [0x181, 0, 0], chrb: [0x181, 3, 3], chwb: [0x181, 4, 4], rvsL: [0x1A2, 5, 0] },
    DAZ6111: { chwb: [0x17E, 7, 7] },
    DAZ7353: { chwb: [0x0AC, 7, 7] }
  };
  var NB_EXTRA_NAME = { mirror: 'MIRROR', chrb: 'CHRB', chwb: 'CHWB', rvsL: 'READ_RVS' };

  /* ══ v1.3.0 EN01（RM81008）════════════════════════════════════════════════════════════
     原廠依據＝WPF_RomCodeProcessUI v2.0.23.0（acdb7f9）；PY 沒有 EN01。縮寫：
       ICD＝DLL_Raydium_CommonLibrary/Raydium.Core/Models/ICDefine.cs（GetRM81008 :40-1106）
       DMM＝Wpf.RomCodeProcessUI/Modules/DataMappingModule.cs、MODEL＝Wpf.RomCodeProcessUI/ModelFiles/RM81008.model
       HDR＝Raydium.Core/Models/DynamicHeader/EN01/、GUIDE＝Wpf.RomCodeProcessUI/Docs/DataMapping_新手指南.md
     ・表格（DataMappingVersion.Version2，ICD:48）：24 列 × 12 欄（R0 G0 B0 R1 G1 B1 R2 G2 B2 R3 G3 B3），
       列＝line×6＋相位（標題 L1-1…L4-6，DMM:335-342），一格一個 byte（沒有打包）。
       P1 0x3D4–0x41B（72）、P2 0x1000–0x1047（72）、P3 0x1100–0x118F（144）（ICD:857-875）；位址換算＝DMM:170-218 的讀法：
       row 0~2／6~8＝P1＋6c＋{0,1,2}／{3,4,5}；row 3~5／9~11＝P2 同上；row 12~23＝P3＋12c＋(row−12)。
       P3 不在 MODEL（FORCE_SEL_* 只到 _11，MODEL:11176-12177），依 WPF 程式＋GUIDE 附錄 B 原廠實檔驗證。
     ・候選值（ICD:1055-1077 GenDataMappingDefine）：階數 T1~T10（TabNum 2,4,…,1024；TabNumDisplayConverter.cs），
       gValues＝(T,T−1,…,0) 每塊 4 個編號（T1＝5 6 7 8 1 2 3 4），值 v ⇒ 'RGB'[v%3]＋gValues[v/3]，共 12(T+1) 個，X＝0xFF。
       TabNum 不寫進 ROM，只決定「名稱 ↔ byte」；WPF V2 每列預設 16（T4，DMM:106-108）。
       「SW1→T1…SW6→T6」等規則原廠也標待設計端確認（GUIDE 附錄 C-1）⇒ 網頁照 WPF 預設 T4、每列可改。
     ・Hand Mode：讀＝FORCE_DE_EN 與 FORCE_SEL_EN 都非 0；切換＝兩者一起寫、FORCE_DE_SEL 整 byte 寫 0x0E（DMM:224-245）。
     ・Gate Type：只寫 RD_MODE 0x41C[2:0]（Single 0／Dual 1／Tri 2，DMM:421-458；MODEL:3525-3532 另有 3＝MUX4、5＝MUX6），
       不寫 PANEL_MODE（EN01 的 PANEL_MODE 是 0 Normal／1 ZigZag／2 HSD／3 LTPS，與 Gate 數無關，MODEL:11051-11059）。V2 不遮格（DMM:423-433）。
     ・其他欄位（MODEL）：SUB_PANEL_MODE 0x390[6:4]（:11061）、LTPS_ZIGZAG_MODE 0x390[3:2]（:11081）、MIRROR 0x392[6]（:12244）、
       CHRB 0x392[4]（:12219）、CHWB 0x392[5]（:12212）、READ_RVS 0x3A5[7:0]（:12253）。
       ⚠ MODEL:11092 也把 0x392[7] 定義成 FORCE_DIV3_EN（與 FORCE_DE_EN 同 bit）⇒ 照 ICD 當 FORCE_DE_EN，列入未確認。 */
  var EN01_CH = ['R0', 'G0', 'B0', 'R1', 'G1', 'B1', 'R2', 'G2', 'B2', 'R3', 'G3', 'B3'];   // 暫存器名稱用（FORCE_SEL_R0_0…，MODEL／ICD 原名，不改）
  /* v1.35.19（Bruce 10/16 21:0x「上方的 R0、G0、B0 一直到 R3、G3、B3，這些應該要改成像是其他 TCON 的寫法，就是 Data1、Data2、Data3 一直到 Data12」）：
     畫面欄標題、Excel 匯出表頭、Benchmark、記錄訊息改 Data1～Data12（R0→Data1 … B3→Data12，同一順序）；暫存器名稱仍是 FORCE_SEL_R0_0…。
     WPF Import 依欄位置讀（DataMappingModule.cs Import：cellIdx＝欄號−1，不看表頭）⇒ 表頭改名不影響 WPF 匯入網頁匯出的檔。 */
  var EN01_HD = ['Data1', 'Data2', 'Data3', 'Data4', 'Data5', 'Data6', 'Data7', 'Data8', 'Data9', 'Data10', 'Data11', 'Data12'];
  var EN01_TABS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  var EN01_TDEF = 1;   // v1.36.0：沒有 state 時的預設＝0x0E 的 SW1（舊版 4＝WPF TabNum 16）
  var EN01_REG = {
    hand: [0x393, 7, 7, 'FORCE_SEL_EN'], deEn: [0x392, 7, 7, 'FORCE_DE_EN'], deSel: [0x394, 7, 0, 'FORCE_DE_SEL'],
    panel: [0x390, 1, 0, 'PANEL_MODE'], subPanel: [0x390, 6, 4, 'SUB_PANEL_MODE'], ltpsZz: [0x390, 3, 2, 'LTPS_ZIGZAG_MODE'],
    rd: [0x41C, 2, 0, 'RD_MODE'], mirror: [0x392, 6, 6, 'MIRROR'], chrb: [0x392, 4, 4, 'CHRB'], chwb: [0x392, 5, 5, 'CHWB'], rvsL: [0x3A5, 7, 0, 'READ_RVS'],
    hsdInv: [0x391, 4, 4, 'HSD_MAP_INV']   // v1.36.0（派工 237945451570647040；Bruce 10/19 22:3x「Data mapping 的盤點，我們可以自己做、還沒做的，現在就進行。」）：RM81008.model:12233-12238；HSD 兩個 SW 的 sub-pixel 對調（E507 HSD!H213 vs H229）
  };
  var EN01_REG_IDS = ['hand', 'deEn', 'deSel', 'panel', 'subPanel', 'ltpsZz', 'rd', 'mirror', 'chrb', 'chwb', 'rvsL', 'hsdInv'];
  var EN01_PANEL = ['Normal', 'ZigZag (ZINV)', 'HSD', 'LTPS'];   // MODEL:11056-11059
  function en01Seg(row) { return row >= 12 ? 'p3' : ((row % 6) >= 3 ? 'p2' : 'p1'); }
  function en01Addr(row, col) {
    if (row >= 12) return 0x1100 + col * 12 + (row - 12);
    var ph = row % 6, k = (ph % 3) + Math.floor(row / 6) * 3;
    return (ph < 3 ? 0x3D4 : 0x1000) + col * 6 + k;
  }
  function en01RowLabel(row) { return 'L' + (Math.floor(row / 6) + 1) + '-' + (row % 6 + 1); }
  /* v1.3.1（Bruce 10/9「需要用到6條gate才能顯示完全的意思嗎？」）：列的「-n」＝同一條 line 的第 n 個輸出時槽 SWn，不是第 n 條 gate。
     RD_MODE 決定一條 line 用幾個時槽（MODEL:3532-3535「1 line in 1／2 half／3×1/3 line out」「MUX4 1 line 4 read」「MUX6 1 line 6 read」；
     DMM:334-335、452：列＝line×相位、RD_MODE 只決定相位數）。HSD／Tri-Gate 的 2／3 份 half line 才各對一條 gate（MODEL:3680
     ST_LINE「Each line may have 1/2/3 start point by different RD_MODE」；GUIDE 1.5），MUX4／MUX6 是 source 端 demux，同一條 gate。
     回傳該 RD_MODE 用到的時槽數；4／6／7（model 寫 not support）回 null。 */
  function en01Phases(rd) { return ({ 0: 1, 1: 2, 2: 3, 3: 4, 5: 6 })[rd | 0] || null; }
  /* 顯示哪些列：P1 一定有；P2／P3 依 code 的 header 有沒有載入那一段（DMM:356-374）。seg 缺省＝全部 */
  function en01Rows(seg) { var out = []; for (var r = 0; r < 24; r++) { var g = en01Seg(r); if (g === 'p1' || !seg || seg[g]) out.push(r); } return out; }
  /* v1.36.0（Bruce 10/16「peera 那邊表格是 6 個 subpixel 為一組…EN01 是 12 個 subpixel 為一組…原理是一樣的，只是一個是 6 的倍數，一個是 12 的倍數」；
     依據＝同事E 10/16 轉寄 同事D 4/8 指定的 E507_rt7_sram_w_hand(1T4P).xlsm「FORCE」分頁＋同事H 3/17 EN01 表）：
     ・EN01 改用和 MNT 同一個 pool 公式 poolIdx（每個 T 往右 step 個 subpixel；MNT step 6、EN01 step 12＝1T4P），名稱＝linName（負＝R-1…）。
       FORCE 分頁第 S n 欄（8'h0x 表頭：欄 I＝8'h01、J＝8'h02＝S1…）code v ⇒ subpixel 12n−12⌊v/12⌋＋v%12，即 EN01 的 T n＝pool 第 n+1 欄。
       正 pixel 與 FORCE 分頁 S1～S10 逐格相同（1320/1320）；表上空白格（⌊v/12⌋＞n）照同一公式得負 pixel（例 S1 的 code 24～35＝R-4～B-1）。
       code 0～131（11 組×12）每個 T 都有名稱（＝MNT 的 code 0～29 在每欄都有定義）；T0＝8'h01 那欄（FORCE 分頁欄 I）。
     ・每列預設 T＝FORCE_DE_SEL 最小設 1 的 bit n（8'h02⇒T1、8'h01⇒T0；0x0E⇒T1，與 MNT 同一個 deSelTs）＋SW 時槽 k−1（en01Rel）：
       同事H 表 FORCE_DE_SEL 8'h02 時 SW1 在 S1、SW2 在 S2 解讀，4 條 line 都一樣（例 L1-1 R0＝14⇒B1、L1-2 R0＝24⇒R1）；
       Tri／MUX4／MUX6 照 MNT「每多一條 gate 往右一欄」同理推廣（Bruce 10/16 17:3x）。Mirror 不改名稱（同 MNT，同事A 10/13）。
       FORCE_DE_EN＝0 或值 0 ⇒ 當 WPF 預設 0x0E（EN01 沒有 auto 等效表的依據）。
     ・v1.35.19（Bruce 10/16 21:2x 依 Dispatch 建議 A）：每列 T 改唯讀、只由 FORCE_DE_SEL＋SW 自動推出（拿掉手動下拉）。依據＝WPF 原始碼：
       DataMappingLine.cs:24-37 TabNum 改變只換名稱對照表＋TabNumChangeHandle（→ DataMappingModule.cs:409 MappingCellInfoValueChanged＝重跑 TaskInitial 重讀畫面），
       不寫暫存器；寫 byte 的只有 cell code 值；Hand Mode 只寫 FORCE_DE_EN／FORCE_SEL_EN／FORCE_DE_SEL＝0xE（:260-272）。要換欄＝改 FORCE_DE_SEL（會寫入 TCON）。
       顯示用 MNT 同樣的「相對」編號：T1＝FORCE_DE_SEL 起始欄（SW1），SW k＝T k；括號保留 同事E FORCE 分頁的 S 欄名（J～S 欄表頭 S1～S10，xlsm 第 1 列）。
       例 0x02 SW1＝T1（S1）、0x04 SW1＝T1（S2）、0x0E＋HSD SW2＝T2（S2）。內部換算仍用絕對欄 en01RowT（＝S 編號），名稱與 byte 不變。 */
  var EN01_TMAX = 12;   // 8'h80（n＝7）＋SW6（＋5）
  function en01T(t) { if (t === null || t === undefined || t === '' || isNaN(+t)) return EN01_TDEF; t = +t | 0; return t < 0 ? 0 : (t > EN01_TMAX ? EN01_TMAX : t); }
  function en01BaseT(s) {
    var en = !!(s && (s.deEn | 0)), v = en ? ((s.deSel | 0) & 0xFF) : 0;
    if (!v) v = 0x0E;   // FORCE_DE_EN＝0 或值 0：EN01 的 auto 等效值原廠沒定義 ⇒ 當 WPF 開 Hand 會寫的 0x0E（不套 MNT 的 panel 等效表）
    return deSelTs(v, 8)[0] - 1;   // 與 MNT 同一函式（同事A BOE 分頁：起始欄＝最小設 1 的 bit，bit n＝第 n+1 欄）；EN01 的 T n＝第 n+1 欄 ⇒ T＝bit n
  }
  /* 相位右移（Bruce 10/16 17:3x「原理應該是一樣的」）：MNT 每多一條 gate 往右一欄（Dual 下 gate＝起始欄＋1、Tri 第 k 條＝＋k，同事A BOE 分頁／mntRel）；
     EN01 每個 SW 時槽同理：SW k＝起始 T＋(k−1)（同事E FORCE 分頁 HSD 範例 SW1→S1、SW2→S2 證實）。只對 RD_MODE 用到的時槽右移，未用的列＝起始 T。 */
  function en01Rel(s, row) { var np = en01Phases(s && s.rd) || 1, ph = (row | 0) % 6; return ph < np ? ph : 0; }
  function en01RowT(s, row) { return en01T(en01BaseT(s) + en01Rel(s, row)); }
  /* v1.35.19：顯示用。相對 T（SW1＝T1，同 MNT deSelText 的 T1＝起始欄）；S 名＝同事E FORCE 分頁欄名（只有 S1～S10 有表頭：欄 I＝8'h01 沒標、S11 以後分頁沒有） */
  function en01TRel(s, row) { return en01RowT(s, row) - en01BaseT(s) + 1; }
  function en01SName(t) { t = en01T(t); return t >= 1 && t <= 10 ? 'S' + t : ''; }
  function en01TLabel(s, row) { var sn = en01SName(en01RowT(s, row)); return 'T' + en01TRel(s, row) + (sn ? '（' + sn + '）' : ''); }
  var _en01Defs = {};
  /* 某階數的候選（R→G→B、編號小→大，X 最後）；名稱＝共用 pool（poolIdx step 12） */
  function en01Defs(t) {
    t = en01T(t);
    if (_en01Defs[t]) return _en01Defs[t];
    var list = [], v;
    for (v = 0; v < EN01_POOL.n; v++) { var nm = linName(poolIdx(EN01_POOL.step, t + 1, v)); list.push({ name: nm, value: v, c: v % 3, n: linPx(nm) }); }
    list.sort(function (x, y) { return x.c - y.c || x.n - y.n; });
    list = list.map(function (x) { return { name: x.name, value: x.value }; });
    list.push({ name: 'X', value: 0xFF });
    return (_en01Defs[t] = list);
  }
  /* v1.35.24（Bruce 10/17 20:0x「31 跟 255，有可能也會對應到負的 subpixel…就要靠你網頁版的程式來判斷」）：EN01 X（255）照 Pool 公式（poolIdx，與負 pixel 延伸同一式）外推的位置；
     原廠 Pool 只到 131，255 實際送什麼未確認 ⇒ 只當提示（推論）。回傳 { name, n }：n＝負第 n 個 subpixel（B-1＝1）；外推不是負數 ⇒ null */
  function en01XApprox(t) { var k = poolIdx(EN01_POOL.step, en01T(t) + 1, 0xFF); return k < 0 ? { name: linName(k), n: -k } : null; }
  function en01Name(t, v) { var d = en01Defs(t); for (var i = 0; i < d.length; i++) if (d[i].value === v) return d[i].name; return null; }
  function en01Value(t, name) { var d = en01Defs(t); for (var i = 0; i < d.length; i++) if (d[i].name === name) return d[i].value; return null; }
  /* 'off'｜'single'｜'dual'｜'tri'｜'mux4'｜'mux6'｜'rdx'（RD_MODE 4／6／7＝model 寫 not support） */
  function en01Gate(s) {
    if (!((s.hand | 0) && (s.deEn | 0))) return 'off';
    return ({ 0: 'single', 1: 'dual', 2: 'tri', 3: 'mux4', 5: 'mux6' })[s.rd | 0] || 'rdx';
  }
  /* v1.35.28（Bruce 10/19 13:0x「mux2/mux3，不應該再將切換設定用到面板設定那一區吧，應該是要配合tcon設定，自動切換才對」；
     13:2x「不能選single gate，要不然data是沒法分三段」；派工 237802378187255808）：面板是 Gate 還是 Source MUX 改由 TCON 暫存器自動判定，
     不再有 ③「RD_MODE 1/2 面板」手動選項。依據（assistant_kb datamap/型號/EN01 §11）：
       ・PANEL_MODE 0x390[1:0]：0 Normal／1 ZigZag／2 HSD／3 LTPS（RM81008.model:11051-11059）；
       ・SUB_PANEL_MODE 0x390[6:4]，PANEL_MODE＝3 時 [0] 0＝MUX3／1＝MUX2、[1] 1＝Zigzag 或 Hand Mode with Dummy、[2] 0＝Type 1／1＝Type 2（model:11061-11079）；
         瑞鼎 Raydium_TCON_DataMapping查詢_20260424.xlsx B15:D22 同一套編碼（LTPS Type1/2 × Normal/Z-Zag × MUX3/MUX2＝PANEL 3、SUB 0～7）；
       ・RD_MODE 0x41C[2:0]＝一條 line 的 data 分幾段（model:3529-3533；原理 12.8.4）：0＝1 段、1＝2 段、2＝3 段、3＝MUX4、5＝MUX6。
     ⇒ RD 1：PANEL≠3＝Dual(HSD)、PANEL 3＋SUB[0]＝1＝MUX2；RD 2：PANEL≠3＝Tri-Gate、PANEL 3＋SUB[0]＝0＝MUX3；RD 3／5＝MUX4／MUX6（只看 RD_MODE，
       model 的 SUB 註解只列 MUX3／MUX2）。PANEL 3 配 RD 0（MUX 卻只分 1 段）或 SUB[0] 和 RD 段數不符＝矛盾 'bad'（③ 不畫、寫原因）。
     MUX2／MUX3 的 TYPE 由 SUB[2] 決定；MUX4 原廠只有 TYPE 1；MUX6 沒有暫存器 ⇒ ③ 保留手動 TYPE（待 同事D）。 */
  function en01Panel(s) {
    var rd = s.rd | 0, pm = s.panel | 0, sb = s.subPanel | 0, ltps = pm === 3, m2 = (sb & 1) === 1;
    var o = { kind: '', mux: 0, type: 0, typeReg: false, zz: ltps ? (sb >> 1) & 1 : 0, why: '' };
    if (rd === 0) { if (ltps) { o.kind = 'bad'; o.why = 'single'; } else o.kind = 'single'; }
    else if (rd === 1 || rd === 2) {
      if (!ltps) o.kind = rd === 1 ? 'dual' : 'tri';
      else if (m2 === (rd === 1)) { o.kind = rd === 1 ? 'mux2' : 'mux3'; o.mux = rd + 1; o.type = ((sb >> 2) & 1) + 1; o.typeReg = true; }
      else { o.kind = 'bad'; o.why = rd === 1 ? 'sub3' : 'sub2'; }
    } else if (rd === 3) { o.kind = 'mux4'; o.mux = 4; o.type = 1; }
    else if (rd === 5) { o.kind = 'mux6'; o.mux = 6; }
    else o.kind = 'rdx';
    return o;
  }
  /* v1.35.29（Bruce 10/19 12:5x「為何Data mapping網頁，其他tcon的mux接線，沒有一併更新成最新的畫法?」；派工 237801403670081536）：
     全型號共用的「面板是 Gate 還是 Source MUX」判定（單一來源；EN01 照 en01Panel）。MNT（EM01／EM02／E512）與 NB（E503／E501A／E501B／DAZ6138／6139）：
       ・PANEL_MODE＝3（LTPS）＝Source MUX 面板：SUB_PANEL_MODE[0] 0＝MUX3／1＝MUX2、[1]＝Zigzag、[2]＝TYPE 1／2
         （原廠 MNT Tool ComboBox_TX_sub_panel_mode「MUX3 normal type1…MUX2 zigzag type2」EM01 RApp_TX.cpp:8963-8970；同事A EM01A1 LTPS!AC1:AJ9；
          瑞鼎查詢 Excel B15:D22；RM8100x model SUB_PANEL_MODE）。gate 不分段（一列 pixel 一條 gate），SW1～SWk 在 Source 端 demux（原理 12.8）。
       ・例外：MNT Hand 的 Tri-Gate（BOE tri-gate）。同事A EM01A1 LTPS!AK8:AK10「LTPS BOE tri-gate」Manual setting 和 MUX3 zigzag type1 同一組暫存器
         （panel 3、sub 2、force_sel_en 1）⇒ TCON 暫存器分不出來，是面板（玻璃）不同 ⇒ 由 ②-1 Gate Type 選 Tri-Gate 記在 state.triGate（不是暫存器、不寫入 TCON）；
         沒選過（匯入 code／I2C 讀回／套原廠樣式）時用 同事A BOE 表的特徵判斷：每個 Data 三個時段填同一個 code、6 個 Data 各不相同、沒有 X
         （LTPS!AK12:AK29、(21) Tri+BOE RApp_TX.h；mux3 的三個時段一定不同 code：同事A LTPS!AC12:AJ29 全部 0 例外）。
       ・PANEL 0／1＝1 段（Single），2＝2 段（Dual／HSD）。 */
  function triSig(s) {
    for (var l = 0; l < 2; l++) {
      var seen = {};
      for (var c = 0; c < 6; c++) {
        var a = s['c' + (12 * l + c)] | 0, b = s['c' + (12 * l + 6 + c)] | 0, x = s['x' + (12 * l + c)] | 0;
        if (a !== b || b !== x || a > 29 || seen[a]) return false;
        seen[a] = 1;
      }
    }
    return true;
  }
  function muxPanel(key, s) {
    var M = MODELS[key]; s = s || {};
    if (!M) return { kind: '', mux: 0, type: 0, typeReg: false, zz: 0 };
    if (M.kind === 'en01') return en01Panel(s);
    var pm = s.panel | 0, sb = s.subPanel | 0, o = { kind: pm === 2 ? 'dual' : 'single', mux: 0, type: 0, typeReg: false, zz: 0, why: '' };
    if (pm !== 3 || !fieldById(key, 'panel') || !(M.kind === 'mnt' || M.sem === 'e50x')) return o;   // DAZ6111／DAZ7353 的 PANEL 只有 0～2（沒有 LTPS），panel 3 不當 MUX
    if (M.kind === 'mnt' && (s.hand | 0) && (s.triGate !== undefined ? !!s.triGate : triSig(s))) { o.kind = 'tri'; return o; }
    o.mux = (sb & 1) ? 2 : 3; o.kind = 'mux' + o.mux; o.type = ((sb >> 2) & 1) + 1; o.typeReg = true; o.zz = (sb >> 1) & 1;
    return o;
  }
  /* v1.35.29（Bruce 10/19 13:4x「如果是 Mux 的做法，是不是就不適合叫做 Line 1-1、Line 1-2…可以跟真的增加 gate 來做區別」；Dispatch 定案）：
     ② 表格、③ 接線圖、Excel、Benchmark 列名單一來源：Single＝Line n；真的 gate 分段（Dual／HSD／Tri-gate）＝Line n-k；MUX（MUX2／3／4／6）＝Line n-SWk */
  function lineName(n, k, kind) { return kind === 'mux' ? 'Line ' + n + '-SW' + k : (kind === 'gate' ? 'Line ' + n + '-' + k : 'Line ' + n); }
  /* 舊列名（v1.35.28 以前的 Line n-k、Line n·SWk）⇒ 新列名也認得：匯入 Excel 時用 */
  function lineAlias(label) {
    var m = /^Line\s*(\d+)\s*(?:-|·|_)\s*(?:SW)?\s*(\d+)$/i.exec(String(label || '').trim());
    return m ? [lineName(+m[1], +m[2], 'gate'), lineName(+m[1], +m[2], 'mux')] : [String(label || '').trim()];
  }
  function sameLine(a, b) { var A = lineAlias(a), B = lineAlias(b); return A.some(function (x) { return B.indexOf(x) >= 0; }); }
  /* [選單文字, RD_MODE, MUX（2／3＝要寫 PANEL_MODE＝3＋SUB[0]）]；沒有「Single＋MUX」這種組合（MUX 至少分 2 段） */
  var EN01_GATES = [['Single-Gate', 0], ['Dual-Gate', 1], ['Tri-Gate', 2], ['MUX2 (RD_MODE=1)', 1, 2], ['MUX3 (RD_MODE=2)', 2, 3], ['MUX4 (RD_MODE=3)', 3], ['MUX6 (RD_MODE=5)', 5]];
  var EN01_GKIND = { single: 0, dual: 1, tri: 2, mux2: 3, mux3: 4, mux4: 5, mux6: 6 };
  function en01GateText(s) {
    var k = en01Panel(s).kind, i = EN01_GKIND[k];
    return i === undefined ? 'RD_MODE=' + (s.rd | 0) + (k === 'bad' ? ' + PANEL_MODE=3' : '') : EN01_GATES[i][0];
  }
  /* 選 Gate Type：Single／Dual／Tri／MUX4／MUX6 照舊只寫 RD_MODE（WPF DMM:436-449）；MUX2／MUX3 另寫 PANEL_MODE＝3 與 SUB[0]（保留 SUB[1]／[2]）；
     原本是 LTPS（PANEL 3）改回 Single／Dual／Tri 時 PANEL_MODE 一定要離開 3（否則仍判成 MUX）：Dual⇒2（HSD）、Single／Tri⇒0（Normal），SUB 歸 0 */
  function en01SetGate(s, item) {
    for (var q = 0; q < EN01_GATES.length; q++) if (EN01_GATES[q][0] === item) {
      var G = EN01_GATES[q], es = cloneState(s); es.rd = G[1];
      if (G[2]) { es.panel = 3; es.subPanel = ((es.subPanel | 0) & 6) | (G[2] === 2 ? 1 : 0); }
      else if (G[1] <= 2 && (es.panel | 0) === 3) { es.panel = G[1] === 1 ? 2 : 0; es.subPanel = 0; }
      return es;
    }
    return null;
  }
  /* MUX2／MUX3 的 TYPE＝SUB_PANEL_MODE[2]（0＝TYPE 1、1＝TYPE 2） */
  function en01SetMuxType(s, ty) { var es = cloneState(s); es.subPanel = ((es.subPanel | 0) & 3) | (ty === 2 ? 4 : 0); return es; }
  /* ── v1.35.30 EN01 Auto（FORCE_SEL_EN＝0）預設排列（Bruce 10/19 12:5x「en01應該也有對應的auto mode吧，怎麼現在看來只能用hand mode才能看到跟mux有關的接線圖?」、
     15:0x「為何…en01 auto mode，仍然無法像是其他tcon可以選擇不同預設的data mapping?」；派工 237801892587515904）：
     ・EN01 的 PANEL_MODE／SUB_PANEL_MODE 編碼和 NB RM8100x 相同（RM81008.model:11051-11079：ZigZag Type 1～8、HSD Type 1／Type 4／Type 3-5／Type 4+zigzag(BOE)、
       LTPS [0] MUX3／MUX2、[1] Zigzag、[2] Type 1／2），Auto 時晶片依這兩顆（＋RD_MODE 段數）自動排列；原廠沒有 Auto 對照表。
     ・同事D 指定的 E507_rt7_sram_w_hand(1T4P).xlsm 各分頁（NORMAL／ZIGZAG／HSD TYPE 1／4／3-5／4+ZIGZAG／MUX2／MUX3／MUX4／MUX6 的 NORMAL／ZIGZAG TYPE 1／2）
       是「用 Hand 模式填 code 重現該面板排列」的原廠範例 ⇒ 網頁把它當成該 PANEL／SUB 的 Auto 預設排列（推論：xlsm 是 Hand 填法，晶片 Auto 實際輸出未經 RD 確認）。
       只取 mirror＝0 的範例（Auto 不套 Mirror，同 MNT／NB Auto）；有 line 0／line 1 兩組的照用，Line 3、4 重複 Line 1、2（推論）。
     ・ZigZag Type 1～8 只有 data_sft 0／1 兩組範例（ZIGZAG!H48／H64）；每條 line 用哪組＝xlsm image5 data_sft 表 z0～z7（01010101、10101010、00110011、
       11001100、01100110、10011001、00001111、11110000；與瑞鼎查詢 Excel Z-Zag Type 1～8＝LR、RL、LLRR、RRLL、LRRL、RLLR、LLLLRRRR、RRRRLLLL 一致，0＝L、1＝R）。
     ・推不出的組合（例 Tri-Gate、PANEL 0／1 配 RD_MODE 1、HSD 配 RD_MODE 0、MUX6 ZIGZAG TYPE 2、HSD sub 4～7）回 null，畫面寫「此組合原廠無資料（待 RD）」。
     資料由 E507 xlsm 逐格抽出（tools/datamap_en01_auto_examples.json，產生程式 tools/datamap_en01_auto_build.py）；codes＝12 個 Data × SW 數，sF＝起始 S 欄（FORCE_DE_SEL＝1<<sF）。 */
  var EN01_AUTO_EX = {
    normal: { m: 1, sF: 0, ref: ["NORMAL!H47"], L: [[0,1,2,3,4,5,6,7,8,9,10,11]] },
    zz_sft0: { m: 1, sF: 1, ref: ["ZIGZAG!H48"], L: [[12,13,14,15,16,17,18,19,20,21,22,23]] },
    zz_sft1: { m: 1, sF: 1, ref: ["ZIGZAG!H64"], L: [[35,12,13,14,15,16,17,18,19,20,21,22]] },
    hsd1: { m: 2, sF: 1, ref: ["HSD!H148"], L: [[[12,25],[14,27],[16,29],[18,31],[20,33],[22,35],[0,13],[2,15],[4,17],[6,19],[8,21],[10,23]]] },
    hsd4: { m: 2, sF: 1, ref: ["HSD!H213"], L: [[[12,25],[15,26],[17,28],[18,31],[21,32],[23,34],[0,13],[3,14],[5,16],[6,19],[9,20],[11,22]]] },
    /* v1.36.0（派工 237945451570647040；Bruce 10/19 22:3x「Data mapping 的盤點，我們可以自己做、還沒做的，現在就進行。」）：HSD TYPE 4＋HSD_MAP_INV＝1＝E507 HSD!H229（J228 標 HSD_MAP_INV＝1）；逐格＝H213 每個 Data 的 SW1、SW2 對調（12/25→13/24…） */
    hsd4inv: { m: 2, sF: 1, ref: ["HSD!H229"], L: [[[13,24],[14,27],[16,29],[19,30],[20,33],[22,35],[1,12],[2,15],[4,17],[7,18],[8,21],[10,23]]] },
    hsd35: { m: 2, sF: 1, ref: ["HSD!H280", "HSD!H296"], L: [[[34,45],[35,24],[13,26],[16,27],[17,30],[19,32],[22,33],[23,12],[1,14],[4,15],[5,18],[7,20]], [[35,24],[13,26],[16,27],[17,30],[19,32],[22,33],[23,12],[1,14],[4,15],[5,18],[7,20],[10,21]]] },
    hsd4zz: { m: 2, sF: 1, ref: ["HSD!H348", "HSD!H365"], L: [[[12,25],[15,26],[17,28],[18,31],[21,32],[23,34],[0,13],[3,14],[5,16],[6,19],[9,20],[11,22]], [[35,46],[12,25],[15,26],[17,28],[18,31],[21,32],[23,34],[0,13],[3,14],[5,16],[6,19],[9,20]]] },
    mux2_n1: { m: 2, sF: 2, ref: ["MUX2!H97"], L: [[[24,37],[26,39],[28,41],[30,43],[32,45],[34,47],[12,25],[14,27],[16,29],[18,31],[20,33],[22,35]]] },
    mux2_n2: { m: 2, sF: 2, ref: ["MUX2!H128"], L: [[[24,38],[25,39],[28,42],[29,43],[32,46],[33,47],[12,26],[13,27],[16,30],[17,31],[20,34],[21,35]]] },
    mux2_z1: { m: 2, sF: 2, ref: ["MUX2!H162", "MUX2!H178"], L: [[[24,37],[26,39],[28,41],[30,43],[32,45],[34,47],[12,25],[14,27],[16,29],[18,31],[20,33],[22,35]], [[47,36],[25,38],[27,40],[29,42],[31,44],[33,46],[35,24],[13,26],[15,28],[17,30],[19,32],[21,34]]] },
    mux2_z2: { m: 2, sF: 2, ref: ["MUX2!H227", "MUX2!H243"], L: [[[24,38],[25,39],[28,42],[29,43],[32,46],[33,47],[12,26],[13,27],[16,30],[17,31],[20,34],[21,35]], [[47,37],[24,38],[27,41],[28,42],[31,45],[32,46],[35,25],[12,26],[15,29],[16,30],[19,33],[20,34]]] },
    mux3_n1: { m: 3, sF: 2, ref: ["MUX3!H97"], L: [[[24,37,50],[27,40,53],[30,43,56],[33,46,59],[12,25,38],[15,28,41],[18,31,44],[21,34,47],[0,13,26],[3,16,29],[6,19,32],[9,22,35]]] },
    mux3_n2: { m: 3, sF: 2, ref: ["MUX3!H128"], L: [[[24,40,50],[27,37,53],[30,46,56],[33,43,59],[12,28,38],[15,25,41],[18,34,44],[21,31,47],[0,16,26],[3,13,29],[6,22,32],[9,19,35]]] },
    mux3_z1: { m: 3, sF: 2, ref: ["MUX3!H160", "MUX3!H176"], L: [[[24,37,50],[27,40,53],[30,43,56],[33,46,59],[12,25,38],[15,28,41],[18,31,44],[21,34,47],[0,13,26],[3,16,29],[6,19,32],[9,22,35]], [[47,36,49],[26,39,52],[29,42,55],[32,45,58],[35,24,37],[14,27,40],[17,30,43],[20,33,46],[23,12,25],[2,15,28],[5,18,31],[8,21,34]]] },
    mux3_z2: { m: 3, sF: 2, ref: ["MUX3!H225", "MUX3!H241"], L: [[[24,40,50],[27,37,53],[30,46,56],[33,43,59],[12,28,38],[15,25,41],[18,34,44],[21,31,47],[0,16,26],[3,13,29],[6,22,32],[9,19,35]], [[47,39,49],[26,36,52],[29,45,55],[32,42,58],[35,27,37],[14,24,40],[17,33,43],[20,30,46],[23,15,25],[2,12,28],[5,21,31],[8,18,34]]] },
    mux4_n1: { m: 4, sF: 3, ref: ["MUX4!G107"], L: [[[36,50,64,78],[37,51,65,79],[44,58,48,62],[45,59,49,63],[28,42,56,70],[29,43,57,71],[12,26,40,54],[13,27,41,55],[20,34,24,38],[21,35,25,39],[4,18,32,46],[5,19,33,47]]] },
    mux4_z1: { m: 4, sF: 3, ref: ["MUX4!G139", "MUX4!G155"], L: [[[59,49,63,77],[36,50,64,78],[43,57,71,61],[44,58,48,62],[27,41,55,69],[28,42,56,70],[35,25,39,53],[12,26,40,54],[19,33,47,37],[20,34,24,38],[3,17,31,45],[4,18,32,46]], [[36,50,64,78],[37,51,65,79],[44,58,48,62],[45,59,49,63],[28,42,56,70],[29,43,57,71],[12,26,40,54],[13,27,41,55],[20,34,24,38],[21,35,25,39],[4,18,32,46],[5,19,33,47]]] },
    mux6_n1: { m: 6, sF: 5, ref: ["MUX6!H143"], L: [[[60,73,86,99,112,125],[69,82,95,102,115,128],[48,61,74,87,100,113],[57,70,83,90,103,116],[36,49,62,75,88,101],[45,58,71,78,91,104],[24,37,50,63,76,89],[33,46,59,66,79,92],[12,25,38,51,64,77],[21,34,47,54,67,80],[0,13,26,39,52,65],[9,22,35,42,55,68]]] },
    mux6_n2: { m: 6, sF: 5, ref: ["MUX6!H183"], L: [[[60,82,86,102,112,128],[69,73,95,99,115,125],[48,70,74,90,100,116],[57,61,83,87,103,113],[36,58,62,78,88,104],[45,49,71,75,91,101],[24,46,50,66,76,92],[33,37,59,63,79,89],[12,34,38,54,64,80],[21,25,47,51,67,77],[0,22,26,42,52,68],[9,13,35,39,55,65]]] },
    mux6_z1: { m: 6, sF: 5, ref: ["MUX6!H215", "MUX6!H231"], L: [[[60,73,86,99,112,125],[69,82,95,102,115,128],[48,61,74,87,100,113],[57,70,83,90,103,116],[36,49,62,75,88,101],[45,58,71,78,91,104],[24,37,50,63,76,89],[33,46,59,66,79,92],[12,25,38,51,64,77],[21,34,47,54,67,80],[0,13,26,39,52,65],[9,22,35,42,55,68]], [[61,74,87,100,113,126],[70,83,72,103,116,129],[49,62,75,88,101,114],[58,71,60,91,104,117],[37,50,63,76,89,102],[46,59,48,79,92,105],[25,38,51,64,77,90],[34,47,36,67,80,93],[13,26,39,52,65,78],[22,35,24,55,68,81],[1,14,27,40,53,66],[10,23,12,43,56,69]]] }
  };
  var EN01_ZZ_SFT = ['01010101', '10101010', '00110011', '11001100', '01100110', '10011001', '00001111', '11110000'];
  var EN01_SUB_NAMES = [
    ['Normal'],
    ['ZigZag Type 1', 'ZigZag Type 2', 'ZigZag Type 3', 'ZigZag Type 4', 'ZigZag Type 5', 'ZigZag Type 6', 'ZigZag Type 7', 'ZigZag Type 8'],
    ['HSD Type 1', 'HSD Type 4', 'HSD Type 3-5', 'HSD Type 4 + zigzag(BOE)'],
    ['MUX3 normal type1', 'MUX2 normal type1', 'MUX3 zigzag type1', 'MUX2 zigzag type1', 'MUX3 normal type2', 'MUX2 normal type2', 'MUX3 zigzag type2', 'MUX2 zigzag type2']
  ];
  /* 回傳 { key, name, refs, m, sF, lines:[4 條 line 的 12×m code], note } 或 { none: 原因 }；mux6Ty＝MUX6 的 TYPE（③ 手動，沒有暫存器） */
  function en01AutoOf(s, mux6Ty) {
    s = s || {}; var pm = s.panel | 0, sb = s.subPanel | 0, PJ = en01Panel(s), k = '', lines = null, nm = '', note = '';
    var zz3 = pm === 3 && ((sb >> 1) & 1);
    if (PJ.kind === 'bad' || PJ.kind === 'rdx') return { none: PJ.kind };
    if (PJ.kind === 'single') {
      if (pm === 0) { k = 'normal'; nm = 'Normal'; }
      else if (pm === 1) {
        var pat = EN01_ZZ_SFT[sb & 7];
        nm = 'ZigZag Type ' + ((sb & 7) + 1) + '（data_sft ' + pat + '）';
        /* v1.36.0（派工 237945451570647040；Bruce 10/19 22:3x「Data mapping 的盤點，我們可以自己做、還沒做的，現在就進行。」）：Type 7／8（00001111／11110000）每 8 條 line 一循環 ⇒ 列 8 條（Line 5～8 只在 Auto 顯示；Hand 的 FORCE_SEL 只有 4 條 line） */
        var nL = (sb & 7) >= 6 ? 8 : 4;
        lines = []; for (var zL = 0; zL < nL; zL++) lines.push(EN01_AUTO_EX[pat.charAt(zL) === '1' ? 'zz_sft1' : 'zz_sft0'].L[0]);
        var E0 = EN01_AUTO_EX.zz_sft0;
        if (nL === 8) note = 'period8';
        return { key: 'zz' + (sb & 7), name: nm, refs: ['ZIGZAG!H48（data_sft 0）', 'ZIGZAG!H64（data_sft 1）', 'ZIGZAG image5 z' + (sb & 7)], m: 1, sF: E0.sF, lines: lines, note: note };
      }
    } else if (PJ.kind === 'dual') {
      if (pm === 2) {
        k = ['hsd1', 'hsd4', 'hsd35', 'hsd4zz'][sb] || ''; nm = EN01_SUB_NAMES[2][sb] || '';
        /* v1.36.0（派工 237945451570647040；Bruce 10/19 22:3x「Data mapping 的盤點，我們可以自己做、還沒做的，現在就進行。」）：HSD_MAP_INV＝1 只有 TYPE 4 有原廠範例（H229）⇒ 用它；其他 HSD 子類型＋INV＝1 沒有範例 ⇒ 待 RD（TYPE 1 的 H164 內容是 SW 對調但標 INV＝0，標示矛盾不採用） */
        if (s.hsdInv | 0) { if (sb === 1) { k = 'hsd4inv'; nm += '・HSD_MAP_INV＝1'; } else return { none: 'nodata', inv: 1 }; }
      }
    } else if (PJ.mux === 2 || PJ.mux === 3) {
      k = 'mux' + PJ.mux + '_' + (PJ.zz ? 'z' : 'n') + PJ.type; nm = EN01_SUB_NAMES[3][sb & 7];
    } else if (PJ.mux === 4) {
      k = 'mux4_' + (zz3 ? 'z' : 'n') + '1'; nm = 'MUX4 ' + (zz3 ? 'zigzag' : 'normal') + ' type1';
    } else if (PJ.mux === 6) {
      var t6 = mux6Ty === 2 ? 2 : 1; k = 'mux6_' + (zz3 ? 'z' : 'n') + t6; nm = 'MUX6 ' + (zz3 ? 'zigzag' : 'normal') + ' type' + t6;
    }
    var E = k && EN01_AUTO_EX[k];
    if (!E) return { none: 'nodata' };
    return { key: k, name: nm, refs: E.ref, m: E.m, sF: E.sF, lines: [0, 1, 2, 3].map(function (L) { return E.L[L % E.L.length]; }), note: E.L.length > 1 ? 'line01' : '' };
  }
  /* Auto 推得的虛擬 state（只給 ② 顯示與 ③ 畫圖用，不寫入）：FORCE_SEL 依範例填、FORCE_DE_SEL＝1<<sF、Mirror／CHRB 清 0（Auto 不套） */
  function en01AutoState(s, mux6Ty) {
    var A = en01AutoOf(s, mux6Ty); if (!A || A.none) return null;
    var v = cloneState(s); v.deEn = 1; v.deSel = 1 << A.sF; v.mirror = 0; v.chrb = 0;
    for (var L = 0; L < A.lines.length; L++) for (var j = 0; j < 6; j++) for (var c = 0; c < 12; c++) {   // v1.36.0：ZigZag Type 7／8 有 8 條（e 288～575 只給顯示用，不寫入）
      var row = A.lines[L][c], val = A.m === 1 ? row : (j < A.m ? row[j] : row[0]);
      v['e' + ((L * 6 + j) * 12 + c)] = typeof val === 'number' ? val : (Array.isArray(val) ? val[0] : 0);
    }
    v.autoOf = A;
    return v;
  }
  /* ── v1.35.30 全型號 Auto 介面統一（Bruce 10/19 16:1x「E503的auto mode做法為何不能像是EM01這種，可以選擇1D1G/ZZag/HSD/LTPS(就是mux)…
     甚至看能否也開放single gate那一項可以更改，再連動到對應的panel mode的那些選項，盡量讓每一顆tcon的設定模式相同」）：
     Auto（Hand 關）時每顆 TCON 都是「Panel_mode＋sub_panel_mode」兩個下拉（EM01 原廠 UI 範本），Gate Type 也能改並與 panel／sub／rd 雙向連動。
     各型號 sub 清單與 rd 寫法以該型號原廠為準：MNT＝DM.SUB_PANEL＋原廠 MNT Tool rd（LTPS 一律 2）；NB＝datamap-auto.js 的 Auto 清單（PY／model；MUX2 rd 1）；
     EN01＝RM81008.model 註解（同 NB 編碼）＋RD_MODE 段數（MUX2 1、MUX3 2、MUX4 3、MUX6 5）。 */
  function autoPanelNames(key) {
    var M = MODELS[key]; if (!M) return [];
    if (M.kind === 'nb' && M.sem !== 'e50x') return ['1D1G', 'Zigzag', 'HSD'];   // DAZ6111／DAZ7353：PANEL 只有 0～2
    return ['1D1G', 'Zigzag', 'HSD', 'LTPS (MUX)'];
  }
  /* Auto 的 Gate Type 項目：MNT／NB 不列 Tri-Gate（BOE tri-gate 和 MUX3 zigzag type1 同一組暫存器，只在 Hand 由使用者指定）；NB e50x／DAZ613x 多 MUX2／MUX3（LTPS）；EN01 同 Hand */
  function autoGateItems(key) {
    var M = MODELS[key]; if (!M) return [];
    if (M.kind === 'en01') return EN01_GATES.map(function (x) { return x[0]; });
    var L = ['Single-Gate', 'Dual-Gate'];
    if (M.kind === 'mnt' || M.sem === 'e50x') L = L.concat(['MUX2', 'MUX3']);
    return L;
  }
  function autoGateText(key, s) {
    var M = MODELS[key]; if (!M) return '';
    if (M.kind === 'en01') return en01GateText(s);
    var p = s.panel | 0;
    if (p === 3 && (M.kind === 'mnt' || M.sem === 'e50x')) return (s.subPanel | 0) & 1 ? 'MUX2' : 'MUX3';
    return p === 2 ? 'Dual-Gate' : (p <= 1 ? 'Single-Gate' : 'PANEL_MODE=' + p);
  }
  /* rd_mode（Auto）依 panel／sub：rd＝一條 line 的 data 分幾段－1，MNT／NB／EN01 同一條規則——1D1G／Zigzag 0、HSD 1、LTPS MUX2 1、MUX3 2；EN01 MUX4／MUX6 保留 RD 3／5。
     v1.35.31（Bruce 10/19 19:4x「mux 2不是跟hsd(dual gate)行為上一樣嗎？所以理論上rd mode應該設定也是」；派工 237903570581180416）：
     MNT MUX2 由 2 改 1。依據：NB 同一顆 rt8（0x350／0x420／0x1B0[7:6]，同 byte 也是 tcon_mode[3:0]／rd_non_stop／mgoa_rotate，與 MNT 0x0504 位元配置相同）
     RM8100x_for_FAE model:4061-4070「1: HSD or MUX2 panel (1 line in 2 half line out)」、RM81010 Kick Off「1: 1line 2 read (mux2 HSD) 2: 1 line 3 read(mux3, tri_gate)」；
     EM02 model:19498-19504「1: HSD (dual-gate) 2: LTPS (tri-gate)」＝分 2／3 段；同事A EM01A1 LTPS 分頁 MUX2 每條 line 2 格（同事A 10/19 回信問題一「對」）。
     原廠 MNT Tool 寫 2 是因為它只依 panel_mode 決定 rd（EM01 RApp_TX.cpp:8911-8994，換 sub 不重算；RT7 清單 RApp_TX.h:552-556 只有 MUX3），不是硬體要求；
     ⚠ 原廠 MNT Tool 讀回 panel 3＋rd 1 會跳「rt7 Panel mode/rt8 rd mode not match」（RApp_TX.cpp:9457-9496，只比 panel 與 rd）。（型號/MNT §10.10） */
  function autoRd(key, s) {
    var M = MODELS[key], p = s.panel | 0, sb = s.subPanel | 0;
    if (M.kind === 'en01' && p === 3 && ((s.rd | 0) === 3 || (s.rd | 0) === 5)) return s.rd | 0;
    if (M.kind === 'mnt' && p === 3 && s.triGate) return 2;   // BOE tri-gate（gate 分 3 段）
    return p === 3 ? ((sb & 1) ? 1 : 2) : (p === 2 ? 1 : 0);
  }
  /* 改 Panel_mode（Auto）：sub 回第一項（原廠 EM01 UI），rd 依 autoRd */
  function autoSetPanel(key, s, pm) {
    var ns = cloneState(s); ns.panel = pm | 0; ns.subPanel = 0;
    if (MODELS[key].kind === 'en01' && pm === 3 && ((s.rd | 0) === 3 || (s.rd | 0) === 5)) { /* MUX4／MUX6 保留 */ } else if (fieldById(key, 'rd')) ns.rd = autoRd(key, ns);
    if (MODELS[key].kind === 'mnt') ns.triGate = 0;
    return MODELS[key].kind === 'nb' ? pyNormalize(key, ns) : ns;
  }
  function autoSetSub(key, s, sb) {
    var ns = cloneState(s); ns.subPanel = sb | 0;
    if (fieldById(key, 'rd') && !(MODELS[key].kind === 'en01' && ((s.rd | 0) === 3 || (s.rd | 0) === 5))) ns.rd = autoRd(key, ns);
    return MODELS[key].kind === 'nb' ? pyNormalize(key, ns) : ns;
  }
  /* 改 Gate Type（Auto）：Single＝panel 0／1 保留（否則 0）、rd 0；Dual＝panel 2（原本 HSD 保留 sub）、rd 1；MUX2／MUX3＝panel 3、SUB[0]（原本 LTPS 保留 [1]／[2]）、rd 依 autoRd；
     EN01 另有 Tri-Gate（RD 2、PANEL≠3）、MUX4／MUX6（RD 3／5、PANEL 3）。回傳新 state 或 null（不支援） */
  function autoSetGate(key, s, item) {
    var M = MODELS[key]; if (!M) return null;
    var ns = cloneState(s), p = s.panel | 0, sb = s.subPanel | 0;
    if (M.kind === 'en01') {
      if (item === 'MUX4 (RD_MODE=3)' || item === 'MUX6 (RD_MODE=5)') { ns.panel = 3; if (p !== 3) ns.subPanel = 0; ns.rd = item.charAt(3) === '4' ? 3 : 5; return ns; }
      if (item === 'Tri-Gate') { if (p > 1) { ns.panel = 0; ns.subPanel = 0; } ns.rd = 2; return ns; }   // Tri-Gate（gate 分 3 段）：PANEL 不是 LTPS／HSD ⇒ 0（Normal）
    }
    if (item === 'Single-Gate') { if (p > 1) { ns.panel = 0; ns.subPanel = 0; } }
    else if (item === 'Dual-Gate') { ns.panel = 2; if (p !== 2) ns.subPanel = 0; }
    else if (/^MUX[23]/.test(item)) { ns.panel = 3; ns.subPanel = (p === 3 ? sb & 6 : 0) | (item.charAt(3) === '2' ? 1 : 0); }
    else return null;
    if (M.kind === 'en01') { ns.rd = item === 'Single-Gate' ? 0 : (item === 'Dual-Gate' ? 1 : (item.charAt(3) === '2' ? 1 : 2)); return ns; }
    if (fieldById(key, 'rd')) ns.rd = autoRd(key, ns); else delete ns.rd;
    if (M.kind === 'mnt') ns.triGate = 0;
    return M.kind === 'nb' ? pyNormalize(key, ns) : ns;
  }
  /* 一格：{ raw, std, txt, color, editable, id, addr, name }。Hand 關時照樣顯示值（WPF 整張表停用但看得到），不能改 */
  function en01CellView(s, row, col, t) {
    var id = 'e' + (row * 12 + col), raw = s[id] | 0, name = en01Name(t, raw);
    return { raw: raw, std: name !== null, txt: name !== null ? name : '0x' + hex(raw, 2), color: name !== null ? colorOfName(name) : 'ns',
             editable: en01Gate(s) !== 'off', id: id, addr: en01Addr(row, col), name: 'FORCE_SEL_' + EN01_CH[col] + '_' + row };
  }
  function en01Pick(s, row, col, t, name) {
    if (en01Gate(s) === 'off') return null;
    var v = en01Value(t, name); if (v === null) return null;
    var ns = cloneState(s); ns['e' + (row * 12 + col)] = v; return { state: ns, text: name };
  }
  /* All Same Pixel（WPF AssignList／AllAssign，DMM:398-410、684-692）：清單＝各列階數候選的聯集（X 先，再 R→G→B、編號小→大）；
     套用＝每一格在「自己那列的階數」裡找同名的候選，找不到就不改那一格 */
  function en01SameOptions(rows, tabs) {
    var seen = {}, all = [];
    rows.forEach(function (r) { en01Defs(tabs ? tabs[r] : EN01_TDEF).forEach(function (d) { if (!seen[d.name]) { seen[d.name] = 1; all.push(d.name); } }); });
    var key = function (n) { return n === 'X' ? [-1, 0] : ['RGB'.indexOf(n.charAt(0)), +n.slice(1)]; };
    return all.sort(function (a, b) { var x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
  }
  function en01AllSame(s, name, rows, tabs) {
    if (en01Gate(s) === 'off') return null;
    var ns = cloneState(s), n = 0;
    rows.forEach(function (r) { var v = en01Value(tabs ? tabs[r] : EN01_TDEF, name); if (v === null) return; for (var c = 0; c < 12; c++) { ns['e' + (r * 12 + c)] = v; n++; } });
    return { state: ns, text: name, cells: n };
  }
  /* 匯出／寫入用的欄位：非表格欄位全部＋目前有的段（沒載入的 P2／P3 不寫） */
  function en01Ids(seg) {
    var rows = {}; en01Rows(seg).forEach(function (r) { rows[r] = 1; });
    return fieldsOf('EN01').filter(function (f) { return !/^e\d+$/.test(f.id) || rows[f.row]; }).map(function (f) { return f.id; });
  }
  function en01ExportRegs(s, seg) { return encodeFields('EN01', s, en01Ids(seg)); }
  /* Excel（WPF Export/Import，DMM:510-616）：第一張表、第 1 列 ['', R0…B3]；第 (row＋2) 列 A 欄＝L?-?、儲存格＝名稱（不在候選內＝空白）。
     P2／P3 沒開時列號會跳（照 WPF：g.Key＋1）。Import：只在 Hand Mode、空白格略過、名稱要在該列階數的候選內才採用。 */
  function en01ExcelName(now) {
    var d = now || new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }, h = d.getHours() % 12 || 12;   // WPF 用 .NET 'hh'（12 小時制）
    return 'DataMapping Export ' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(h) + p(d.getMinutes()) + p(d.getSeconds()) + '.xlsx';
  }
  function en01ExcelRows(s, rows, tabs) {
    var out = [[''].concat(EN01_HD)];   // v1.35.19：表頭 Data1～Data12（WPF Import 只看欄位置）
    rows.forEach(function (r) {
      var row = [en01RowLabel(r)];
      for (var c = 0; c < 12; c++) { var v = en01CellView(s, r, c, tabs ? tabs[r] : EN01_TDEF); row.push(v.std ? v.txt : ''); }
      out[r + 1] = row;
    });
    for (var i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    return out;
  }
  function en01ExcelApply(s, xrows, rows, tabs) {
    if (en01Gate(s) === 'off') return null;
    var ns = cloneState(s), n = 0, skip = 0;
    rows.forEach(function (r) {
      var xr = xrows[r + 1]; if (!xr) return;
      for (var c = 0; c < 12; c++) {
        var t = xr[c + 1]; if (t == null || String(t).trim() === '') continue;
        var v = en01Value(tabs ? tabs[r] : EN01_TDEF, String(t)); if (v === null) { skip++; continue; }
        ns['e' + (r * 12 + c)] = v; n++;
      }
    });
    return { state: ns, cells: n, skipped: skip };
  }
  /* code：Dynamic Header（ICD:45 DynamicHeader＝true；HDR EN01HeaderDefine.cs:292-316 ComputeRegisterMappings）。
     EEPROM：header 在檔案 0x100（EN01HeaderDefine.cs HeaderStartAddr），Header0＋第 1~19 筆 × 8 B（第 20 筆 eSOL 不映射）：
       From＝((b0&0x7F)<<8)|b1、Len＝((b2&0x7F)<<8)|b3、To＝((b4&7)<<16)|(b5<<8)|b6、b7＝前 7 byte 和；Len＞0 才啟用
       （EN01HeaderDefineEEPROM.cs；與 wfg.html wfgEn01ParseHeader 同規則，2 份實檔 checksum 全對）。
     FLASH：header 在 0x000，22 筆 × 16 B：ST_ADDR＝b0<<8|b1（×0x100）、RD_LEN＝b2<<16|b3<<8|b4、MAP_ST_ADDR＝b5<<8|b6、
       b8[1] MCU_CODE、b8[0] EDID、b9[7] CHECKSUM_EN；Enable＝RD_LEN＞1；映射長度＝RD_LEN−1（CHECKSUM_EN＝1）／RD_LEN＋1（＝0）
       （EN01HeaderDefineFLASH.cs:19-34、796、809-830）；只收 MAP_ST_ADDR 表內的暫存器 Bank（:228-249，排除 PWR_FLU／ASCII／ADIF、EDID、MCU）。
       FLASH 每筆 header 也有 checksum（b14/b15＝前 14 B 和 −1、低位元組在 b14；EN01HeaderDefineFLASH.cs；2026-10-19 3 份 Flash 實檔 item 20/20、Bank 17/17 全對，
       v1.36.0 更正舊註解「FALSH.bin 驗算對不上」——當時是位元組順序／−1 沒算對；assistant_kb datamap/型號/EN01 §12）；這裡仍不靠它判定，改要求 Bank0_5（MAP 0x0000）長度涵蓋到 RD_MODE 0x41C、
       至少 3 個不同 Bank、起點在檔案內且不重複（避免把別顆 code 的 EDID 誤認成 header）。 */
  var EN01_FLASH_MAP = [0x0000, 0x0600, 0x0700, 0x0800, 0x0900, 0x0A00, 0x0B00, 0x0C00, 0x0D00, 0x0E00, 0x0F00, 0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1800];
  function en01Maps(b) {
    var i, o, items = [], bad = 0;
    if (!b) return null;
    var ck = function (o) { var s = 0; for (var k = 0; k < 7; k++) s += b[o + k]; return (s & 0xFF) === b[o + 7]; };
    if (b.length >= 0x100 + 8 * 20 && ck(0x100)) {
      for (i = 1; i < 20; i++) {
        o = 0x100 + i * 8;
        if (!ck(o)) { bad++; continue; }
        var frm = ((b[o] & 0x7F) << 8) | b[o + 1], len = ((b[o + 2] & 0x7F) << 8) | b[o + 3], to = ((b[o + 4] & 7) << 16) | (b[o + 5] << 8) | b[o + 6];
        if (!len) continue;
        if (frm + len > b.length) { bad++; continue; }
        items.push({ from: frm, to: to, len: len });
      }
      if (items.length && bad <= items.length) return { medium: 'eeprom', maps: items };
    }
    if (b.length < 0x2000) return null;
    items = []; var basic = false, seen = {};
    for (i = 0; i < 22; i++) {
      o = i * 16;
      var st = ((b[o] << 8) | b[o + 1]) * 0x100, rd = (b[o + 2] << 16) | (b[o + 3] << 8) | b[o + 4], mp = (b[o + 5] << 8) | b[o + 6];
      if (rd <= 1 || (b[o + 8] & 3) || EN01_FLASH_MAP.indexOf(mp) < 0) continue;
      var ln = rd - 1 + ((b[o + 9] & 0x80) ? 0 : 2);
      if (!st || st + ln > b.length || seen[mp]) return null;
      seen[mp] = 1; items.push({ from: st, to: mp, len: ln });
      if (mp === 0 && ln >= 0x41D) basic = true;
    }
    return basic && items.length >= 3 ? { medium: 'flash', maps: items } : null;
  }
  function parseEn01(bytes) {
    var M = en01Maps(bytes);
    if (!M) return { ok: false, reason: 'en01Header' };
    var fileOf = function (reg) { for (var i = 0; i < M.maps.length; i++) { var m = M.maps[i]; if (reg >= m.to && reg < m.to + m.len) return m.from + (reg - m.to); } return -1; };
    var has = function (a, n) { for (var k = 0; k < n; k++) if (fileOf(a + k) < 0) return false; return true; };
    if (!has(0x390, 5) || !has(0x3D4, 0x49)) return { ok: false, reason: 'en01Header' };   // P1＋RD_MODE（0x3D4–0x41C）要在 Tcon Basic 內
    var res = parseWith('EN01', bytes, fileOf, M.medium);
    res.seg = { p2: has(0x1000, 72), p3: has(0x1100, 144) }; res.maps = M.maps; res.py = 'RM81008';
    return res;
  }
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
    EN01:    { key: 'EN01', label: 'EN01 (RM81008)', kind: 'en01', py: 'RM81008', sem: 'en01', mbus: true },   // v1.3.0（WPF RomCodeProcessUI；見 EN01 區塊）
    EM01: { key: 'EM01', label: 'EM01', kind: 'mnt', sem: 'e50x', rt7: 0x0400, deSel: { off: 0x45, shift: 0, bits: 6 } },
    EM02: { key: 'EM02', label: 'EM02', kind: 'mnt', sem: 'e50x', rt7: 0x0480, deSel: { off: 0x45, shift: 0, bits: 6 }, lod: 0x0900 },
    /* v1.36.2（Bruce 10/20「MNT， A」；派工 238132856823291904；型號/MNT §14.4）：E512 force_de_sel 由 rt7+0x02[7:4]（4 bit）改 rt7+0x45[5:0]（6 bit），同 EM01／EM02。
       出處：E512_ModelFile_20250902152136.model（RCP 1.1.6.0）[reg_force_de_sel] RegAddr0＝0x445、RegMsb0＝5、RegBits0＝6（:16283-16288，model 用 0x400 基底，rt7 相對 +0x45）；
       0x402[7:4] 是 reg_nml_4line_4pix_en[4]／all_port_mask_data_en[5]／last_port_mask_data_en[6]／now_dummy_in_act_en[7]（:15695-15732），舊設定會把 FORCE_DE_SEL 寫進這 4 個 enable。
       EM02A1_RegisterBank.model:18905 reg_force_de_sel＝0x4C5[5:0] 相同。rt7 基底仍照原廠 E512 Tool 0x0480（RApp_Common.h:18；§14.5） */
    E512: { key: 'E512', label: 'E512', kind: 'mnt', sem: 'e50x', rt7: 0x0480, deSel: { off: 0x45, shift: 0, bits: 6 } }
  };
  /* 下拉順序照 PY list_tcon（:3516），MNT 接在後面 */
  var MODEL_KEYS = ['DAZ6111', 'DAZ6138', 'DAZ6139', 'DAZ7353', 'E501A', 'E501B', 'E503', 'EM01', 'EM02', 'E512'];
  var MNT_KEYS = ['EM01', 'EM02', 'E512'];
  /* v1.3.0：頁面下拉＝PY 型號、EN01、MNT（EN01 接在 E503 後）；MODEL_KEYS 仍只含 PY＋MNT（既有 PY／MNT 規則的回歸測試逐一跑它） */
  var SELECT_KEYS = MODEL_KEYS.slice(0, 7).concat(['EN01'], MNT_KEYS);
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
      var X = NB_EXTRA[m.tbl];
      if (X) ['mirror', 'chrb', 'chwb', 'rvsL'].forEach(function (id) { if (X[id]) f.push({ id: id, parts: [X[id]], name: NB_EXTRA_NAME[id] }); });
      if (T.lineType) for (var i = 0; i < 8; i++) f.push({ id: 'lt' + i, parts: [T.lineType[i]], name: 'LINE' + i + '_TYPE_SEL' });
      for (var k = 0; k < 24; k++) {
        var t = Math.floor(k / 6), d = k % 6;
        f.push({ id: 'c' + k, parts: T.cells[k], name: daz ? ('HAND_TYPE' + t + '_DATA' + d) : ('FORCE_SEL_' + CH6[d] + '_' + t) });
      }
    } else if (m.kind === 'en01') {
      EN01_REG_IDS.forEach(function (id) { var R = EN01_REG[id]; f.push({ id: id, parts: [P(R[0], R[1], R[2])], name: R[3] }); });
      for (var er = 0; er < 24; er++) for (var ec = 0; ec < 12; ec++)
        f.push({ id: 'e' + (er * 12 + ec), parts: [P(en01Addr(er, ec), 7, 0)], name: 'FORCE_SEL_' + EN01_CH[ec] + '_' + er, row: er, seg: en01Seg(er) });
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
         Table_LOD_Reg_st RApp_Table.h:1185-1436；de／spec_line＝+0xC7、line／pix＝+0xC8、map r_0..b_15＝+0xC9..+0xF8，同事C code 實測解出 Type 32）。
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
  /* 長循環時第二組的下拉：0~29 ＋ X(31)。
     v1.35.23（Bruce 10/17「第二組下拉名稱固定取 GN1。GN1 到底是什麼意思？這是哪來的名稱？我這邊好像沒有命名過」；#c8911321 缺口 2）：
     舊版固定用 Python UI 的 GN1 字典（＝Single-Gate 名稱表＝起始欄第 2 欄 code 0～17），18～29 只有數字、也不跟起始欄 ⇒ 改成和 ③ TFT 接線圖、Auto 接線同一個位置：
     secondT＝起始欄（mntBaseT）＋該組相對欄（與 datamap-auto.js wiringFromState 同一規則：pix58＝＋2＋上/下 gate、row34＝＋上/下 gate、line58＝＋0、mux3（Tri 第 3 條 gate）＋2），
     名稱＝pool（mntIdx，code 0～29 每欄都有名稱）。沒給 key／s（Benchmark 只取值）⇒ 只有數字。30 未定義（同事A 隱藏表有用到、意義待問），不列。 */
  function secondT(key, s, row) {
    if (!key || !s || MODELS[key].kind !== 'mnt') return null;
    var R = secondSetRule(key, s), g = gateOf(key, s), b = mntBaseT(s, g === 'tri' || g === 'dual' || g === 'single' ? g : undefined).t, lo = row & 1;
    if (R.meaning === 'pix58') return b + 2 + lo;
    if (R.meaning === 'row34') return b + lo;
    if (R.meaning === 'line58') return b;
    if (R.meaning === 'mux3') return b + 2;
    return null;
  }
  function secondName(key, s, row, code) {
    code = code | 0;
    var zz = ltpsZzPool(key, s) && secondSetRule(key, s).meaning === 'mux3' ? ltpsZzKind(key, s, row === 2) : 0;   // v1.35.24：mux3 第二組＝Tri 第 3 條 gate（_0＝line 0、_2＝line 1）
    if (zz && (code === 30 || code === 31)) { var Tz = secondT(key, s, row); return Tz === null ? null : linName(ltpsZzIdx(Tz, code, zz)); }
    if (code === 31) return 'X';
    var T = secondT(key, s, row); if (T === null || code < 0 || code > 29) return null;
    return linName(mntIdx(T, code));
  }
  function secondOptions(key, s, row) {
    var out = [], zz = ltpsZzPool(key, s) && secondSetRule(key, s).meaning === 'mux3' ? ltpsZzKind(key, s, row === 2) : 0;
    for (var v = 0; v <= (zz ? 31 : 29); v++) out.push({ value: v, name: key ? (secondName(key, s, row, v) || '') : '' });
    if (!zz) out.push({ value: 31, name: 'X' });
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
    var v = +value, zz30 = v === 30 && ltpsZzPool(key, s) && secondSetRule(key, s).meaning === 'mux3';   // v1.35.24：LTPS MUX3 zigzag 的 30 是 Pool 內的 subpixel
    if (!secondEditable(key, s, row) || !(v === 31 || zz30 || (v >= 0 && v <= 29) && v === Math.floor(v))) return null;
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
    if (MODELS[key].kind === 'en01') return en01Gate(s);
    if (!s.hand) return 'off';
    var p = s.panel | 0;
    /* v1.35.29：MNT 的 gate 值＝data 一條 line 分幾段（表格列數）：LTPS MUX2 分 2 段（同事A LTPS!AD11:AD24 line／pixel 只到 _0／_1）⇒ 'dual'；
       MUX3 與 Tri-Gate 分 3 段 ⇒ 'tri'（v1.35.28 以前 LTPS 一律 'tri'，MUX2 被當成 6 列）。面板是 gate 分段還是 MUX 見 muxPanel */
    if (semOf(key) !== 'e50x') return p <= 1 ? 'single' : (p === 2 ? 'dual' : (muxPanel(key, s).mux === 2 ? 'dual' : 'tri'));
    var r = s.rd | 0;
    if (p <= 1 && r === 0) return 'single';
    if (p === 2 && r === 1) return 'dual';
    /* v1.36.2（Bruce 10/20「MNT， A」；派工 238132856823291904；型號/MNT §14.3）：e50x（MNT EM01／EM02／E512、NB E503 等）的 LTPS 也看 SUB[0]：
       MUX2＝一條 line 分 2 段 ⇒ 'dual'（4 列 Line n-SWk）。rd 1＝v1.35.31 起網頁 Auto／Hand 寫法、rd 2＝原廠 MNT Tool 寫法（只依 panel 設 rd，型號/MNT §12.4），兩者都畫 MUX2；
       MUX3／BOE Tri-Gate 照舊 rd 2／3 ⇒ 'tri'。v1.35.29～v1.36.1 這段只認 panel 3＋rd 2／3，Hand MUX2（rd 1）判 mismatch 表格不顯示、rd 2 畫成 6 列 */
    if (p === 3) {
      if (muxPanel(key, s).mux === 2) return (r === 1 || r === 2) ? 'dual' : 'mismatch';
      return (r === 2 || r === 3) ? 'tri' : 'mismatch';
    }
    return 'mismatch';
  }
  var GATE_ITEMS = ['Non-Hand Mode', 'Single-Gate', 'Dual-Gate', 'Tri-Gate'];   // PY:4074
  /* comboBox_49 顯示（PY:28958-29005） */
  function gateText(key, s) {
    if (MODELS[key].kind === 'en01') return en01GateText(s);
    var p = s.panel | 0;   // PY 先設 Non-Hand Mode（:28962），緊接著又依 PANEL_MODE 覆寫（:28998），所以實際顯示一律依 PANEL_MODE
    if (p === 3 && (MODELS[key].kind === 'mnt' || MODELS[key].sem === 'e50x')) { var J = muxPanel(key, s); if (J.mux) return MNT_GATES[J.mux === 2 ? 3 : 4]; }   // v1.36.3：NB e50x 同（Python UI 依 PANEL_MODE 顯示 Tri-Gate；model PANEL_MODE 3＝LTPS、SUB[0] 0 MUX3／1 MUX2，同 Auto autoGateText）   // v1.35.29：MNT LTPS＝MUX2／MUX3（Tri-Gate＝BOE tri-gate）
    return p <= 1 ? GATE_ITEMS[1] : (p === 2 ? GATE_ITEMS[2] : GATE_ITEMS[3]);
  }
  function inputDict(key) { var se = semOf(key); return se === 'daz7353' ? D7353 : (se === 'daz6111' ? D6111 : GN1); }
  /* v1.17.0（Bruce 10/7「Data 6 居然會有非標準 0x17…已經點亮，顯示也都是正常的」）：MNT（EM01／EM02／E512）的 force_sel 是 code 0~29 全部合法
     （EM01 原廠 StringGrid 顯示十進位、>29 才改成 29：RApp_TX.cpp:9328-9361；Kick Off「Data hand mode」code 表 D2:R31 也是 0~29），
     Python UI 的 GN1／GN2 只收 0~17 的名稱，所以 18~29 被標成「非標準」（全民 b1_1／b1_3＝0x17）。MNT 改用完整 30 碼命名：
       ・位置 k＝T 表（Single／Dual 上 gate＝T2、Dual 下 gate＝T3）全範圍：k＝3×(2(T−1)−2⌊code/6⌋)＋code%6；
       ・Mirror＝1：送到 D1 起第 p＝−1−k 顆，名稱照原廠 Pixel mapping 檢視（每組 6×gate 數顆左右反轉；資料顏色＝code 的顏色）。 */
  function linName(k) { var px = Math.floor(k / 3), c = k - px * 3; return 'RGB'.charAt(c) + (px >= 0 ? px + 1 : px); }
  /* v1.36.0：pool 公式單一來源——第 col 欄的 code ⇒ subpixel 位置 step(col−1) − step⌊code/step⌋ ＋ code%step。
     MNT／NB e50x：step 6（2 pixel／T，code 0～29）；EN01：step 12（4 pixel／T＝1T4P，code 0～131）。mntIdx＝poolIdx(6, …)，數值與舊式相同。 */
  var MNT_POOL = { step: 6, n: 30 }, EN01_POOL = { step: 12, n: 132 };
  function poolIdx(step, col, code) { return step * (col - 1) - step * Math.floor(code / step) + code % step; }
  function mntIdx(T, code) { return poolIdx(MNT_POOL.step, T, code); }
  /* v1.35.24（Bruce 10/17 20:0x「X 其實只是把它選到最後一個而已，並不是真的不送…31 跟 255，有可能也會對應到負的 subpixel…這個就要靠你網頁版的程式來判斷」；
     派工 237187824600842240）：依模式判斷 code 30／31 是 subpixel 還是 X。寫入值不變（X 仍寫 31）。
     出處：瑞鼎 同事A reply_110503_0924 EM01A1_rt7_register_force_mapping.xlsx LTPS!A185:S251（MUX3 zigzag type1）、LTPS!A322:S388（type2）：
       Pool 第 216～217 列（type2 第 353～354 列）code 30＝B1、31＝B2，從第 6 欄（K 欄）起每往右一欄 +2 pixel（B3／B4、B5／B6…）；
       「Only for line=1, mirror=1」那份（第 250～251 列、type2 第 387～388 列）30＝G1、31＝G2；其他 Pool（MUX3 normal、MUX2、BOE tri-gate、1D1G、Zigzag、HSD）都只到 29。
     ⇒ 第 T 欄：30＝第 6(T−6)+2 顆（B）／+1 顆（G），31＝再 +3 顆（下一個 pixel 同色）。前 5 欄 Excel 是空白，依決策 A5（空白＝負 pixel）同公式延伸成 B-1、B-2…
       （原廠 RT7 (18)～(20) Tri+ZZ 第 3 條 gate 第 5 欄寫 31，舊版靠「X 補位」推成 B-1；本公式直接得 B-1，兩者一致）。
     模式＝MNT 且 PANEL_MODE＝3（LTPS）、SUB_PANEL_MODE＝2（MUX3 zigzag type1）或 6（MUX3 zigzag type2）（SUB_PANEL[3]）；
     line1Mir＝Mirror＝1 且為 line 1（Tri 的 Line 2-1～2-3）。回傳 0＝不是這個模式（30 未定義、31＝X）、1＝B 版、2＝G 版。 */
  function ltpsZzPool(key, s) { return !!(key && s && MODELS[key] && MODELS[key].kind === 'mnt' && (s.panel | 0) === 3 && ((s.subPanel | 0) === 2 || (s.subPanel | 0) === 6)); }
  function ltpsZzKind(key, s, line1) { return ltpsZzPool(key, s) ? ((s.mirror | 0) && line1 ? 2 : 1) : 0; }
  function ltpsZzIdx(T, code, kind) { code = code | 0; if (!kind || (code !== 30 && code !== 31)) return null; return 6 * (T - 6) + (kind === 2 ? 1 : 2) + (code === 31 ? 3 : 0); }
  function linPx(name) { var m = /^[RGB](-?\d+)$/.exec(name || ''); return m ? +m[1] : null; }
  /* 起始欄 c、各列額外右移 rel 欄時，全部列都選得到的 pixel 索引範圍（MNT 與 EN01 共用；P＝每欄 pixel 數、B＝code 組數） */
  function poolCov(pool, c, rel) { var P = pool.step / 3, B = pool.n / pool.step; return [P * (c + (rel | 0) - 1) - P * (B - 1), P * c - 1]; }
  /* v1.3.2（Bruce 10/12「要去看所有的演算法有沒有矛盾的地方…統一」）：名稱⇄線性位置、code⇄位置、R↔B 的唯一換算。
     datamap.html 原本各自另寫一份（pvLin／pvName／pvRawIdx 與三處 R↔B regex），改成全部呼叫這裡，避免日後只改一邊。
     linIdx 是 linName 的反函數（R1＝0、G1＝1、B1＝2、R2＝3…；R-1＝−3、B-1＝−1）；codeIdx＝mntIdx 加上 code 範圍（0~29，其餘＝null）。 */
  function linIdx(name) { var m = /^([RGB])(-?\d+)$/.exec(name || ''); if (!m) return null; var p = +m[2]; return (p > 0 ? p - 1 : p) * 3 + 'RGB'.indexOf(m[1]); }
  function codeIdx(T, code) { code = code | 0; return code < 0 || code > 29 ? null : mntIdx(T, code); }   // v1.35.23：也擋 code<0（30＝未定義、31＝X 都回 null）
  function rbSwapName(n) { return String(n).replace(/^[RB]/, function (x) { return x === 'R' ? 'B' : 'R'; }); }
  /* v1.17.0 T 表（Bruce 10/7「81010 的 Kickoff…可以選 T1、T2、T3、T4，也有一個 register 來設定吧」）：
     RM81010_Kick_Off_Check_20210805.xlsx「Data hand mode」A1「FORCE_DE_SEL 182h[7:4]:」、D1:G1＝0001／0010／0100／1000（code 表 D～G 欄＝T1～T4），
     AN7:AQ7「FORCE_DE_SEL 3F2h[7:4]｜FORCE_DE_SEL：0010(default) NOTE:FORCE_DE_EN=1｜2」⇒ FORCE_DE_EN＝1 時 FORCE_DE_SEL 的 one-hot 位元選 D1~D6 用哪張 T 表；
     預設 0010＝T2（輸出公式 E36 從 E 欄＝T2 開始）。MNT：force_de_en＝rt7+0x02[0]、force_de_sel＝rt7+0x45[5:0]（EM02A1_RegisterBank.model:18200／18905，
     6 bit「[0]~[5]: de phase 0~5」）。多位元值（Python UI 一律寫 0xE：PY pyNormalize；同事C 0x0E、全民 0x1F）原廠資料未定義，
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
    /* v1.27.0（同事A 10/13 回信）：reg_force_de_en＝0 ⇒ 1D1G 從第 1 欄（T1）、Zigzag／HSD 從第 2 欄（T2）；其他（LTPS）沿用第 2 欄（推定）。 */
    /* v1.28.1：同事A 10/14 14:44 定案——force_de_en＝0 等同 de_sel（1D1G 0x01／Zigzag 0x06／HSD 0x0A／LTPS 0x0C）⇒ 起始欄 1／2／2／3（LTPS 改第 3 欄）；與 tWin 共用 deAutoBase */
    if (!(s.deEn | 0)) return { t: deAutoBase(s), why: 'auto', sel: deAutoSel(s) };
    /* v1.26.0（Bruce 10/13 決定，依 RD：「data 永遠都是從 T1 開始…14 代表最前面那一行不用，T1 移到第二行才開始用；31 其實 T1 就在最前面那行」）：
       多 bit ⇒ T1 起始欄＝最小設 1 的 bit＋1（0x0E＝第 2 欄、0x1F＝第 1 欄），不再依 code 反推（取代 v1.17.1「24 格都在範圍內的最低那張」）。
       全民 0x1F 因此從第 1 欄解讀，名稱會用到 R-3～R-6 等左側 dummy（Bruce：全民的 DataMapping 參考圖少畫了前面的 dummy，不可當驗證基準）。
       值 0（沒有設任何 bit）⇒ 仍依 code 反推。回傳值 t＝起始欄（＝mntIdx 用的欄號）。 */
    if (v) { var lo = 0; while (!(v & (1 << lo))) lo++; return { t: lo + 1, why: 'multi', fit: 0 }; }
    var f = mntFitT(s, gate || mntGateOfS(s), 0);
    return { t: f.t, why: 'zero', fit: f.out };
  }
  function mntTOf(s, gate, row) { return mntBaseT(s, gate).t + mntRel(gate, row); }
  /* v1.17.1：code 表有定義的範圍（Kick Off「Data hand mode」D2:R31／E512_V512 圖解 code 表：T 欄只列到 code＜6×(T＋1)，再往左＝空白），
     多 bit FORCE_DE_SEL 時逐一列出候選基準 T 的超出格數（原廠未定義多 bit 用哪張；換基準只會整體平移 2 pixel 的倍數） */
  /* v1.26.0：Excel code 表（Kick Off「Data hand mode」、E512／EM01A1 diagram、Pool 表）每欄只列到 code＜6×(欄＋1)，最左只畫到 R-2；
     Bruce 10/13（附瑞鼎 UI 照片）：空白處都是負的，照「每 2 pixel 一組、上小下大、往下遞減、沒有 0」延伸，可以用到 R-3、R-4…R-6 等左側 dummy；
     mntIdx 的公式本來就是這個規律 ⇒ code 0~29 在每一欄都有定義。mntInTable 保留「Excel 表上有列出」的範圍，只作說明用。 */
  function mntInRange(T, code) { code = code | 0; return code === 31 || (code >= 0 && code < 30); }
  function mntInTable(T, code) { code = code | 0; return code === 31 || (code >= 0 && code < Math.min(30, 6 * (T + 1))); }
  /* v1.28.1：Tri（LTPS）的第 2 條 gate（_1／_3 列）與 Dual 下 gate 同樣＝起始欄＋1（datamap-auto wiringFromState：Tri 第 k 條 gate＝起始欄＋k；第 3 條 gate 在 x 表） */
  function mntRel(gate, row) { return (gate === 'dual' || gate === 'tri') && (row & 1) ? 1 : 0; }
  /* Mirror＝1：名稱整行反轉後＝Kick Off 命名往後 gate 數張表（Single＋1、Dual＋2），範圍也照那張表判斷 */
  /* v1.27.0（同事A 10/13：BOE 分頁 INDEX 17..12 在第 1 欄＝B-3 G-3 R-3 B-4 G-4 R-4，Mirror 範例也是直接查 Pool 表）：Mirror 不改變名稱與 T 表 ⇒ 恆為 0（保留介面） */
  function mntMirT(s, gate) { return 0; }
  function mntCands(s, gate) {
    var ts = deSelTs(s.deSel, 6), mo = mntMirT(s, gate);   // v1.27.6：候選欄＝BOE 連續視窗（只在值 0 時顯示 ⇒ 實際為空）
    return ts.map(function (T) { var n = 0; for (var i = 0; i < 24; i++) if (!mntInRange(T + mo + mntRel(gate, Math.floor(i / 6)), s['c' + i])) n++; return { t: T, out: n }; });
  }
  /* v1.24.0（Bruce 10/13「設定 3 應該是 T2 跟 T1 兩個是 or；設定 5 就是 T3 跟 T1」）：FORCE_DE_SEL 換算成 T 組合。
     規格：EM02A1_RegisterBank.model force_de_sel 6 bit「[0]~[5]: de phase 0~5」＋Kick Off「Data hand mode」D1:G1＝0001／0010／0100／1000＝T1～T4
     ⇒ bit n ＝ T(n+1)，與 Bruce 的例子一致（3＝T1|T2、5＝T1|T3、14＝T2|T3|T4）。原廠只定義 one-hot；多 bit 時晶片怎麼用（OR？取最低？）原廠資料沒寫。
     ※ v1.27.6 起此段的「設 1 的 bit＝可用 T」已作廢，改依 同事A 10/14 BOE 分頁（見下方 deSelTs）。 */
  /* v1.27.6（同事A 10/14 09:24 新版 EM01A1_rt7_register_force_mapping.xlsx「BOE」分頁 reg_force_de_sel 0x01～0x3F 每列 T 欄位；取代 v1.24.0／v1.26.2 的「可用 T＝設 1 的 bit」）：
     force_de_en＝1：T1＝最小設 1 的 bit 那欄（bit n＝第 n+1 欄），T2、T3…連續往右不跳欄，最後一個 T＝最大設 1 的 bit 那欄＋4
     ⇒ 可用 T 數＝(最大 bit − 最小 bit)＋5。0x05＝第 1～7 欄、0x0E＝第 2～8 欄、0x3F＝第 1～10 欄、0x20＝第 6～10 欄。
     回傳 T1、T2…依序所在的 Pool 欄號（ts[i]＝T(i+1) 的欄）。值 0 ⇒ []（BOE 分頁沒有定義）。tools/check_datamap_boe.js 逐列逐格比對。 */
  var DE_TAIL = 4;
  function deSelTs(v, bits) {
    v = (v | 0) & ((1 << (bits || 6)) - 1); if (!v) return [];
    var lo = 0, hi = 0, ts = []; while (!(v & (1 << lo))) lo++; for (var b = 0; b < (bits || 6); b++) if (v & (1 << b)) hi = b;
    for (var c = lo + 1; c <= hi + 1 + DE_TAIL; c++) ts.push(c);
    return ts;
  }
  function deSelText(v, bits) { var ts = deSelTs(v, bits); return ts.length ? 'T1～T' + ts.length + '＝第' + ts[0] + '～' + ts[ts.length - 1] + '欄' : ''; }
  /* v1.28.1（同事A 10/14 14:44 回信「是等效的」，演算法定案；取代 v1.27.0／v1.27.6 的「起始欄＋往右 4 欄」）：
     force_de_en＝0 時，晶片依 panel_mode 等同一個 reg_force_de_sel 值，直接套用上面 FORCE_DE_SEL 的 BOE 規則（deSelTs），不另寫一套：
       panel 0 1D1G   ＝0x01（6'b00_0001）⇒ 第 1～5 欄
       panel 1 Zigzag ＝0x06（6'b00_0110）⇒ 第 2～7 欄
       panel 2 HSD    ＝0x0A（6'b00_1010）⇒ 第 2～8 欄（與 force_de_en＝1＋0x0E 的 T1 起始欄相同，同事A：RT7 (26) 0/0 與 1＋0x0E 等效）
       panel 3 LTPS   ＝0x0C（6'b00_1100）⇒ 第 3～8 欄（同事A 修正：LTPS DE＝T3，第 3 欄）
     panel_mode 只有 2 bit（0～3），每個值都有定義；所有型號共用，不做機種特例。 */
  var DE_AUTO_SEL = [0x01, 0x06, 0x0A, 0x0C];
  function deAutoSel(s) { return DE_AUTO_SEL[((s && s.panel) | 0) & 3]; }
  function deAutoBase(s) { return deSelTs(deAutoSel(s), 6)[0]; }
  /* T 欄位視窗（單一來源）：{ base：T1 所在欄（null＝未定義）, ts：T1、T2…的欄號, sel：實際套用的 de_sel（force_de_en＝0 時＝等效值） } */
  function tWin(key, s) {
    var bits = (fieldById(key, 'deSel') || { bits: 6 }).bits;
    var en = s && (s.deEn | 0) ? 1 : 0, v = en ? (s.deSel | 0) : deAutoSel(s), ts = deSelTs(v, en ? bits : 6);
    return { base: ts.length ? ts[0] : null, ts: ts, en: en, bits: bits, sel: v };
  }
  /* v1.30.0（Bruce 10/14「要多輸入一個數值：最大的 pixel 會用到多少、最小的 pixel 會用到多少…回過頭去改 FORCE_DE_SEL，讓這個範圍裡面都選得到」
     ＋追加「常用的設定像 force_de_sel 等於 14、等於 31…有些預設的可以盡量選到」）：pixel 範圍 → FORCE_DE_SEL。
     依據＝mntName／mntIdx（同一份 Pool 命名）：第 c 欄（T1 起始欄）的 code 0~29 ⇒ 線性位置 k＝6(c−1)−6⌊code/6⌋＋code%6 ∈ [6c−30, 6c−1]
       ⇒ 該欄可選 pixel 索引 [2c−10, 2c−1]（索引≥0 ⇒ 名稱 idx+1；負＝dummy 名稱＝idx）。例：第 2 欄＝R-6～B4、第 1 欄＝R-8～B2。
     Dual／Tri 的下 gate 列用 起始欄＋mntRel（＝＋1）⇒ 每一列都選得到＝各列欄位的交集 [2(c+rel)−10, 2c−1]（與表格下拉同一來源，不另寫規則）。
     選值：先依序試常用值（0x0E、0x1F、同事A 自動等效 0x01／0x06／0x0A／0x0C、0x3F），起始欄能涵蓋就用；都不行才只設起始欄那個 bit。
     範圍大於一欄能涵蓋的 ⇒ over＝true，取涵蓋最多的起始欄（同分先取有常用值的、再取較小欄）。 */
  var DE_COMMON = [0x0E, 0x1F, 0x01, 0x06, 0x0A, 0x0C, 0x3F];
  function pxIdx(p) { p = p | 0; return p > 0 ? p - 1 : p; }
  function idxPx(i) { return i >= 0 ? i + 1 : i; }
  /* v1.31.0：起始欄 c 可選 pixel 索引（各 gate 列取交集；Dual／Tri 下 gate 列用 c＋1）——deSelForPx 與 pxForDeSel 共用這一份 */
  function pxCovIdx(c, g) { if (g === 'tri3') return triPxCov(c); if (/^en01:/.test(g)) return poolCov(EN01_POOL, c, +g.slice(5) - 1); return poolCov(MNT_POOL, c, mntRel(g, 1)); }   // v1.34.0：MNT Hand Tri（triOn ⇒ 'tri3'）走獨立分支（3 條 gate、triCodeOk）
  /* v1.36.0：EN01 ⇒ 'en01:<相位數>'（poolCov step 12；SW n 列＝起始欄＋n−1，與 en01RowT 同規則 ⇒ 全部用到的列取交集）。
     MNT／NB 仍是 poolCov step 6（＝舊式 [2(c+rel)−10, 2c−1]）。 */
  function pxGate(key, s, gate) {
    if (MODELS[key] && MODELS[key].kind === 'en01') return 'en01:' + (en01Phases(s && s.rd) || 1);   // en01Rel：SW k＝起始＋(k−1) ⇒ 各列交集
    return gate || (triOn(key, s) ? 'tri3' : gateOf(key, s));
  }
  /* v1.31.0（Bruce 10/14「匯入 code 時依 FORCE_DE_EN／FORCE_DE_SEL 反算出目前涵蓋的 pixel 最小～最大」）：deSelForPx 的反方向。
     FORCE_DE_EN＝0 用 panel 等效值（deAutoSel，與 tWin／tUse 同一規則）；起始欄＝deSelTs 第一欄。 */
  function pxForDeSel(key, s, gate) {
    var bits = (fieldById(key, 'deSel') || { bits: 6 }).bits, g = pxGate(key, s, gate);
    var en = (s.deEn | 0) === 1, v = en ? (s.deSel | 0) : deAutoSel(s), c = deSelTs(v, en ? bits : 6)[0];
    if (nbE50x(key)) { v = nbSel(key, s); c = deSelTs(v, 4)[0]; }   // v1.35.21：NB e50x 起始欄與 ② 名稱（rowDict）同一來源
    if (MODELS[key] && MODELS[key].kind === 'en01') { c = en01BaseT(s) + 1; v = en && (s.deSel & 0xFF) ? (s.deSel & 0xFF) : 0x0E; }   // v1.36.0：起始欄與表格名稱同一來源（en01BaseT）
    if (!c) return null;
    var r = pxCovIdx(c, g);
    return { v: v, en: en, base: c, from: idxPx(r[0]), to: idxPx(r[1]) };
  }
  function deSelForPx(key, s, lo, hi, gate) {
    var bits = (fieldById(key, 'deSel') || { bits: 6 }).bits, mask = (1 << bits) - 1, g = pxGate(key, s, gate);
    var a = pxIdx(Math.min(lo, hi)), b = pxIdx(Math.max(lo, hi));
    function cov(c) { return pxCovIdx(c, g); }
    function hit(c) { var r = cov(c); return Math.max(0, Math.min(b, r[1]) - Math.max(a, r[0]) + 1); }
    function common(c) { for (var i = 0; i < DE_COMMON.length; i++) { var v = DE_COMMON[i]; if ((v & mask) === v && deSelTs(v, bits)[0] === c) return v; } return 0; }
    var need = b - a + 1, cs = []; for (var c = 1; c <= bits; c++) cs.push(c);
    var ok = cs.filter(function (c) { return hit(c) === need; }), over = !ok.length, pick = null, v = 0;
    if (!over) {
      for (var i = 0; i < DE_COMMON.length && !pick; i++) { var cv = DE_COMMON[i]; if ((cv & mask) === cv && ok.indexOf(deSelTs(cv, bits)[0]) >= 0) { v = cv; pick = deSelTs(cv, bits)[0]; } }
      if (!pick) { pick = ok[0]; v = 1 << (pick - 1); }
    } else {
      var best = Math.max.apply(null, cs.map(hit)), cand = cs.filter(function (c) { return hit(c) === best; });
      pick = cand.filter(common)[0] || cand[0]; v = common(pick) || (1 << (pick - 1));
    }
    var r = cov(pick);
    return { v: v, base: pick, common: DE_COMMON.indexOf(v) >= 0, over: over, from: idxPx(r[0]), to: idxPx(r[1]), ok: ok };
  }
  /* v1.24.0 T 使用分析（Bruce 10/13 轉述 RD 原話：「它一樣是 OR 的概念，就是你到底會用到哪幾個 T，只是它會從你所選的 T 裡面最小的 T 開始用…
     設定 14…最小的會是在 T2，也就是從 T2 開始推…某些 data mapping 下它除了 T2 以外還會用到 T3…最多用到 T4…要看它的 line buffer（那個 T 其實是 line buffer 的意思）」）：
     ・v1.27.6：可用欄＝tWin（BOE 分頁：最小 bit 那欄起連續到最大 bit 那欄＋4；force_de_en＝0＝panel 等效 de_sel 套同一規則，v1.28.1）；基準＝T1 那欄。
       （取代 v1.24.0「可用 T＝遮罩中為 1 的 bit」——同事A 10/14 新表證明是錯的。）
     ・每條 gate 一個 line buffer：Single 只用基準；Dual 的下 gate（Line x-2）用基準＋1（與 mntTOf 相同）。
     ・MNT 另依 code 表範圍：某格的 code 在該 T 表沒有定義（code≥6×(T＋1)）⇒ 往上找到第一張有定義的 T（＝這格要用到更大的 line buffer）。
       NB（E50x／DAZ613x）的名稱是固定的 GN1／GN2 表，不隨 T 變 ⇒ 只用 gate 規則。
     ・用到的 T 不在可用集合（沒設那個 bit、或超過最大 T）⇒ 列為警告。X（31）不需要 T，不列。依 RD 定義＋code 表推定，未經實機量測。 */
  function deSelBase(v, bits) { var ts = deSelTs(v, bits); return ts.length ? ts[0] : null; }
  function tUse(key, s, gate) {
    var m = MODELS[key], mnt = m && m.kind === 'mnt', bits = (fieldById(key, 'deSel') || { bits: 6 }).bits;
    var g = gate || gateOf(key, s), W = tWin(key, s), ts = W.ts, base = W.base;   // v1.27.6：可用欄＝tWin（連續視窗），不再是設 1 的 bit
    var mo = mnt ? mntMirT(s, g) : 0, per = {}, warn = [], cells = [];
    if (base === null) return { base: null, ts: ts, used: [], per: per, warn: warn, unused: ts.slice(), cells: cells, gate: g, bits: bits, en: W.en };
    for (var i = 0; i < 24; i++) {
      var row = Math.floor(i / 6), col = i % 6, code = s['c' + i] | 0, rel = mntRel(g, row);
      if (code === 31) continue;
      if (!mnt && g === 'single' && (row & 1)) continue;   // NB Single：Line x-2＝Line x-1 的複本
      var T = base + rel;
      if (mnt) { while (T <= 15 && !mntInRange(T + mo, code)) T++; if (T > 15) T = null; }
      var cell = { i: i, row: row, col: col, code: code, t: T };
      cells.push(cell);
      if (T === null || ts.indexOf(T) < 0) warn.push(cell);
      if (T !== null) (per[T] = per[T] || []).push(cell);
    }
    var used = Object.keys(per).map(Number).sort(function (a, b) { return a - b; });
    return { base: base, ts: ts, used: used, per: per, warn: warn, unused: ts.filter(function (t) { return used.indexOf(t) < 0; }), cells: cells, gate: g, bits: bits, en: W.en };
  }
  function mntName(gate, row, code, mirror, base) {
    if (code === 31) return 'X';
    if (code < 0 || code > 29) return null;
    var T = (base || 2) + mntRel(gate, row), k = mntIdx(T, code);
    /* v1.27.0：Mirror 不再平移名稱（取代 v1.17.1 的 +6×gate）；名稱＝Pool 表直接查（同事A BOE 分頁） */   /* v1.17.1：整行反轉（不再每 6×gate 一組各自反轉）⇒ 跨組的 code 落在相鄰位置（全民 0x17＝B-1，Bruce 10/8）；等同 Kick Off 命名的「基準＋gate 數」那張 T */
    return linName(k);
  }
  var _mntDicts = {};
  function mntDict(gate, row, mirror, base) {
    var key = gate + (gate === 'dual' && (row & 1) ? 'L' : 'U') + (mirror ? 'M' : '') + (base || 2);
    if (_mntDicts[key]) return _mntDicts[key];
    var d = {}; for (var c = 0; c < 30; c++) d[mntName(gate, row, c, mirror, base)] = c; d.X = 31;
    return (_mntDicts[key] = d);
  }
  /* v1.35.7（Bruce 10/15「E503（以及其他 NB 機種）用的候選 pool 和 MNT 是同一套，所以也可以用到 R-6」「Python UI 很可能只是把 E503 的能力限縮了」）：
     NB 的 e50x 語意（E501A／E501B／E503／DAZ6138／DAZ6139，Python UI 共用 dm_e50x_daz613x_gn 字典）改用和 MNT 同一個 pool（mntDict：code 0～29 依 T 表起始欄命名，
     Dual 下 gate 列＝起始欄＋1）。起始欄同樣由 FORCE_DE_SEL 決定（mntBaseT；NB 固定 0xE ⇒ 第 2 欄）。code 0～17／0～23 的名稱與 Python UI 的 GN1／GN2 逐一相同
     （GN1＝第 2 欄 code 0～17、GN2＝第 3 欄 code 0～23），差別只在 Python UI 沒列出 code 18～29（R-3～R-6 等）。下拉、反推、Pixel 範圍三邊都走這一個函式。
     DAZ6111／DAZ7353 是另一套字典（D6111／D7353），不變。 */
  function nbBaseT() { return deSelTs(0xE, 4)[0]; }   // ＝2（0xE 最小設 1 的 bit＝bit1）
  /* v1.35.21（派工 236884173342228480，網頁已知問題 NB 第 1 項）：NB e50x 實際用的 FORCE_DE_SEL（單一來源）。② 名稱（rowDict）、Pixel 範圍（pxForDeSel）、
     頁面 nbDeSelNow 都用這一個值（tWin 照舊描述暫存器本身的值，給 FORCE_DE_SEL 輸入框旁說明用） ⇒ 起始欄＝它最低設 1 的 bit＋1（原理 2.1）。state.deRev（使用者手改 FORCE_DE_SEL、套用 Pixel、自動反推，或匯入／讀回 code 的值≠0xE：
     datamap.html afterLoad）且 FORCE_DE_EN＝1、值≠0 ⇒ 依該值（Bruce 10/16「預設 14，但是可以改」「有 code／連線時依 code 值」）；其他 ⇒ 0xE（pyNormalize 下次改表格會寫回 0xE，
     名稱要和寫出去的值一致；Python UI 開 Hand 寫 0xE：PY:29274-29280；FORCE_DE_EN 不開時 FORCE_DE_SEL 預設 2＝第 2 欄：PY:1793）。判斷＝v1.35.20 rowDict（名稱不變）；
     舊版 Pixel 範圍／tWin 看暫存器值（FORCE_DE_EN＝0 還套 同事A 的 MNT panel 等效值）、頁面 nbDeSelNow 只看 deRev，三邊對不上。預設 14（Single -6～4／Dual -4～4）與可改（v1.35.15）不變。 */
  function nbE50x(key) { return !!MODELS[key] && MODELS[key].kind === 'nb' && semOf(key) === 'e50x'; }
  /* v1.36.0（Bruce 10/19 22:4x「E503 我就可以回答你，實際上它的結果是跟 MNT 的提案是一樣的」、22:3x「我之前就說可以改，不用寫 0xE，但是預設的要 0xE」「501 跟 503 是同一個家族」）：
     RM8100x 家族（E501A／E501B／E503）code 18～29（R-3～R-6）正式支援、FORCE_DE_SEL 同 MNT 可改 ⇒ FORCE_DE_EN＝1 且值≠0 就照值（不再需要 deRev）；預設仍 0xE。
     DAZ6138／DAZ6139 不在 Bruce 這句範圍 ⇒ 維持 v1.35.15 規則（deRev）。 */
  function nbRm8100x(key) { return key === 'E501A' || key === 'E501B' || key === 'E503'; }
  function nbSel(key, s) { var v = s ? (s.deSel | 0) & 0xF : 0; return (s && (s.deRev || nbRm8100x(key)) && (s.deEn | 0) && v) ? v : 0xE; }
  function poolKind(key) { return MODELS[key].kind === 'mnt' || semOf(key) === 'e50x'; }
  function rowDict(key, row, gate, s) {
    var se = semOf(key);
    /* NB：Python UI 開 Hand 一律寫 FORCE_DE_SEL＝0xE（PY:29280，pyNormalize），GN1／GN2 對應的就是第 2 欄 ⇒ NB 起始欄固定用 0xE 的第 2 欄（不隨匯入 code 裡殘留的 de_sel 改變，舊存檔名稱不變） */
    if (poolKind(key) && (gate === 'single' || gate === 'dual')) return mntDict(gate, row, !!(s && (s.mirror | 0)), MODELS[key].kind === "mnt" ? mntBaseT(s, gate).t : deSelTs(nbSel(key, s), 4)[0]);   // v1.35.21：NB 起始欄＝nbSel（與 pxForDeSel、頁面 nbDeSelNow 同一來源）
    if (se === 'daz7353') return D7353;
    if (se === 'daz6111') return D6111;
    return (gate === 'dual' && (row & 1)) ? GN2 : GN1;
  }
  /* v1.35.14（Bruce 10/16「E503 Hand Single、表格填 R-4／B-5…，右邊 TFT 接線圖整個是空的」）：某一列暫存器 code → 名稱，
     與 ② 表格（cellView）、下拉（cellOptions）同一份 rowDict；③ TFT 的 NB e50x Single 解碼改用這個，不再自己查 GN1（GN1 只有 code 0～17）。 */
  function codeName(key, s, row, gate, v) { return inv(rowDict(key, row, gate, s), v | 0); }
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
    if (g === 'off' || col >= 6 || se === 'en01') return v;   // EN01 用 en01CellView
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
    /* v1.25.2（Bruce 10/13「你要看 Python UI 有哪些 Tcon 會強制寫回…就照著做就對了。Python UI 沒有定義到的就不要去動它…MNT 的 Tcon 在 Python UI 就不會定義」）：
       完全照瑞鼎 Python UI V5.0.4 write_dm_info_to_code：A 檔 PY:29267 集合 {DAZ6138, DAZ6139, RM81010, RM81011, RM81000~RM81004} → PY:29280 寫 FORCE_DE_SEL[7:4]＝0xE；
       B 檔 PY:29377 同集合 → PY:29390。呼叫點：改表格 PY:28881／28894（dm_update_all_from_dmrgb_table_change）、改 Gate PY:29917。
       ⇒ 網頁型號 E501A（RM81010）、E501B（RM81011）、E503（RM81000~04）、DAZ6138、DAZ6139（＝sem 'e50x' 的 NB）強制；DAZ6111／DAZ7353 與所有 MNT（PY 沒有）不動。
       （v1.25.1 曾改成只套 E503，依本則更正撤回。） */
    if (m.sem === "e50x" && nbRm8100x(key)) { s.deEn = s.hand ? 1 : 0; if (!((s.deSel | 0) & 0xF)) s.deSel = 0xE; }   // v1.36.0（Bruce 10/19 22:3x「我之前就說可以改，不用寫 0xE，但是預設的要 0xE」）：E501A／E501B／E503 不再蓋回 0xE，只有 0（沒設）才補預設 0xE
    else if (m.sem === "e50x") { s.deEn = s.hand ? 1 : 0; if (!(s.deRev && s.deEn)) s.deSel = 0xE; }   // v1.35.9（Bruce 10/15「預設值維持 0xE，只有按下自動反推、而且需要改的時候才去動它；其他情況包括 Hand 開著一律照舊寫 0xE」）：只有反推選出的值（state.deRev）保留
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
  /* v1.35.23（#c8911321 缺口 3）：Excel 匯出把非標準值寫成「0x1E」，匯入時接受「0xNN」（0～max，max＝該欄 X 值：MNT／NB 31、DAZ6111 15）原值寫回；超出或不是 0xNN ⇒ null（照舊當 X） */
  function rawCodeText(t, max) { var m = /^0X([0-9A-F]{1,2})$/.exec(normText(t)); if (!m) return null; var v = parseInt(m[1], 16); return v <= (max === undefined ? 31 : max) ? v : null; }
  /* 在表格某格輸入文字（PY change_table_dm_rgb_item :12484-12565 ＋ set_rgb_table_to_dm_info）。
     回傳 { state, text } 或 null（這格不能改）。 */
  function editCell(key, s, row, col, text) {
    var cv = cellView(key, s, row, col);
    if (!cv.editable) return null;
    var g0 = gateOf(key, s), mnt = MODELS[key].kind === 'mnt';
    var t = normText(text), dict = poolKind(key) ? rowDict(key, row, g0, s) : inputDict(key);   // v1.35.7：NB e50x 與 MNT 同一個 pool
    if (!(t in dict)) t = 'X';
    var ns = cloneState(s), g = g0, se = semOf(key);
    if (mnt) ns['c' + (row * 6 + col)] = dict[t];
    else if (se !== 'e50x') ns['c' + (row * 6 + col)] = dict[t];
    else if (g === 'single') { ns['c' + (row * 6 + col)] = dict[t]; ns['c' + ((row + 1) * 6 + col)] = dict[t]; }
    else { var dd = rowDict(key, row, g, s); ns['c' + (row * 6 + col)] = (t in dd) ? dd[t] : dd.X; }
    return { state: pyNormalize(key, ns), text: t };
  }
  /* 24 個名稱整批套用（Import Excel、All Same Pixel 共用：PY set_rgb_table_to_dm_info :29707-29847） */
  function applyNames(key, s, names) {
    if (MODELS[key].kind === 'en01') return null;
    var g = gateOf(key, s), se = semOf(key), ns = cloneState(s);
    function look(d, n) { n = normText(n); if (n in d) return d[n]; var rv = rawCodeText(n, d.X); return rv !== null ? rv : d.X; }   // v1.35.23：匯出的非標準值「0x1E」匯入時原值保留（舊版默默變 X）
    if (MODELS[key].kind === 'mnt' && (g === 'single' || g === 'dual')) { for (var m = 0; m < 24; m++) ns['c' + m] = look(rowDict(key, Math.floor(m / 6), g, s), names[m]); }
    else if (se !== 'e50x') { var d0 = inputDict(key); for (var i = 0; i < 24; i++) ns['c' + i] = look(d0, names[i]); }
    else if (g === 'dual') { for (var j = 0; j < 24; j++) ns['c' + j] = look(rowDict(key, Math.floor(j / 6), g, s), names[j]); }   // v1.35.7：同一個 pool
    else if (g === 'single') { var mntS = MODELS[key].kind === 'mnt'; for (var k = 0; k < 24; k++) { var r = Math.floor(k / 6), sr = mntS ? r : r - (r & 1); ns['c' + k] = look(rowDict(key, sr, g, s), names[sr * 6 + k % 6]); } }
    else return null;
    return pyNormalize(key, ns);
  }
  /* All Same Pixel（PY dm_all_same_pixel :29925：先用 GN2 驗證，不在表內 ⇒ 'X'） */
  function allSame(key, s, text) {
    var t = normText(text); if (!(t in GN2) && !(poolKind(key) && (t in rowDict(key, 0, gateOf(key, s), s) || t in rowDict(key, 1, gateOf(key, s), s)))) t = 'X';
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
    if (MODELS[key].kind === 'en01') return [];
    var v = cellView(key, s, row, col);
    if (!v.editable) return [];
    var d = rowDict(key, row, gateOf(key, s), s);
    return mntKeepT(key, s, namesOf(d), function (n) { return editCell(key, s, row, col, n); }).map(function (n) { return { name: n, value: d[n] }; });
  }
  /* v1.3.2（Bruce 10/12 全面審查，矩陣測試 A1／A2 抓到）：MNT 的 T 表基準由 code 推定時（FORCE_DE_EN＝1 且 FORCE_DE_SEL 多位元或 0，
     mntBaseT why＝multi／zero；例 Python UI 預設 0x0E、Manual 樣式 (32)），下拉裡有些名稱的 code 超出目前那張 T 表的範圍（code ≥ 6×(T＋1)），
     選下去推定的 T 就換一張，整張表的名稱一起平移 2 pixel：選 R-4 讀回 R-2，而且其他格的名稱也跟著變。
     ⇒ 這種情況下拉（含 All Same Pixel）只列「選了以後 T 表基準不變」的名稱；X 一律保留。FORCE_DE_SEL one-hot（T 由暫存器決定）／Auto（T2）不受影響。 */
  function mntKeepT(key, s, names, apply) {
    if (MODELS[key].kind !== 'mnt') return names;
    var g = gateOf(key, s); if (g !== 'single' && g !== 'dual') return names;
    var b = mntBaseT(s, g); if (b.why !== 'zero') return names;   // v1.26.0：多 bit 的起始欄固定＝最小 bit，不隨格子改變 ⇒ 只剩值 0 要擋
    return names.filter(function (n) { if (n === 'X') return true; var r = apply(n); return !!r && mntBaseT(r.state, g).t === b.t; });
  }
  /* 下拉選某個名稱。與 editCell 的差別只有一處：Dual 的 Line 1-2／2-2 接受 GN2 名稱（R5／R6…），
     其餘（含 Single 鏡射、連動欄位）完全走 editCell。 */
  function pickCell(key, s, row, col, name) {
    var t = normText(name), g = gateOf(key, s);
    if (MODELS[key].kind !== 'mnt' && semOf(key) === 'e50x' && !poolKind(key) && g === 'dual' && (row & 1) && (t in GN2) && !(t in GN1)) {   // v1.35.21：e50x 走 pool（rowDict 已含 R5／R6…且跟起始欄），GN2 固定第 3 欄的捷徑不再用
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
    if (MODELS[key].kind === 'en01') return [];
    var se = semOf(key), g = gateOf(key, s);
    if (MODELS[key].kind === 'mnt' && (g === 'single' || g === 'dual')) return mntKeepT(key, s, namesOf(rowDict(key, 0, g, s)), function (n) { return allSame(key, s, n); });
    if (se === 'e50x') return g === 'dual' ? namesOf(rowDict(key, 1, g, s)) : (g === 'single' ? namesOf(rowDict(key, 0, g, s)) : []);   // v1.35.7：同一個 pool
    return namesOf(inputDict(key)).filter(function (n) { return n in GN2; });
  }
  /* v1.35.29（Bruce 10/19 13:4x「依你的建議吧，是不是應該一起連動會比較好？」；Dispatch 定案 (1)；派工 237801403670081536）：
     MNT Gate Type 選單＝Single／Dual／Tri（BOE tri-gate）／MUX2／MUX3，選了就一併寫 reg_panel_mode、reg_sub_panel_mode、reg_rd_mode（rt8 0x0504[7:6]，三型號同位址：
     EM02A1_RegisterBank.model:19498-19504、E512_ModelFile_20250902152136.model:17851-17857、EM01 RApp_TX.cpp:8994 BK_TX_RT8_1＋0x04 mask 0xC0（RApp_Common.h:62 BK_RT8_TCON_1＝0x0500））。
     rd_mode＝data 一條 line 分幾段－1（與 autoRd 同一條規則）：1D1G／Zigzag＝0、HSD＝1、MUX2＝1、MUX3／Tri-Gate＝2。
     v1.35.31 起 MUX2 寫 1（v1.35.29／30 照原廠 MNT Tool 寫 2；依據與原廠 Tool 讀回會跳 not match 的提醒見 autoRd 上方、型號/MNT §10.10）。
       Single：panel 保留 0／1（1D1G／Zigzag；原本是 HSD／LTPS 才改 0、sub 歸 0），rd 0（v1.35.28 以前一律寫 panel＝1＝Zigzag，MNT 已知問題 3）
       Dual：panel 2（原本不是 HSD 才 sub 歸 0），rd 1
       Tri-Gate：panel 3（sub 保留；BOE tri-gate 的 同事A 表是 sub 2），rd 2，triGate＝1
       MUX2／MUX3：panel 3、SUB[0]＝1／0（保留 SUB[1] Zigzag、[2] TYPE；原本不是 LTPS 則歸 0），rd 1／2（v1.35.31），triGate＝0 */
  var MNT_GATES = ['Single-Gate', 'Dual-Gate', 'Tri-Gate', 'MUX2', 'MUX3'];
  function mntSetGate(key, s, item) {
    var gi = MNT_GATES.indexOf(item); if (gi < 0) return null;
    var ns = cloneState(s), p = s.panel | 0, sb = s.subPanel | 0;
    if (gi === 0) { if (p > 1) { ns.panel = 0; ns.subPanel = 0; } ns.rd = 0; ns.triGate = 0; }
    else if (gi === 1) { ns.panel = 2; if (p !== 2) ns.subPanel = 0; ns.rd = 1; ns.triGate = 0; }
    else if (gi === 2) { ns.panel = 3; ns.rd = 2; ns.triGate = 1; }
    else { ns.panel = 3; ns.subPanel = (p === 3 ? sb & 6 : 0) | (gi === 3 ? 1 : 0); ns.rd = gi === 3 ? 1 : 2; ns.triGate = 0; }
    if (!fieldById(key, 'rd')) delete ns.rd;
    return pyNormalize(key, ns);
  }
  /* Gate Type 下拉（PY get_object_to_dm_info :29849） */
  function setGate(key, s, item) {
    if (MODELS[key].kind === 'en01') return en01SetGate(s, item);   // DMM:436-449 只寫 RD_MODE；v1.35.28 MUX2／MUX3 另寫 PANEL_MODE／SUB_PANEL_MODE（en01SetGate）
    if (MODELS[key].kind === 'mnt') return mntSetGate(key, s, item);   // v1.35.29：MNT Gate Type 與 rd_mode／panel_mode／sub_panel_mode 連動
    var gi = GATE_ITEMS.indexOf(item); if (gi <= 0) return null;
    var ns = cloneState(s);
    ns.panel = gi;
    if (semOf(key) === 'e50x') ns.rd = gi - 1;
    return pyNormalize(key, ns);
  }
  function setHand(key, s, on) {
    var ns = cloneState(s); ns.hand = on ? 1 : 0;
    if (MODELS[key].kind === 'en01') { ns.deEn = ns.hand; ns.deSel = 0x0E; return ns; }   // DMM:235-245
    return pyNormalize(key, ns);
  }
  /* PY 的 list_rgbstr（24 個名稱；表外 ⇒ 'X'） */
  function pyNames(key, s) {
    var out = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 6; c++) { var v = cellView(key, s, r, c); out.push(v.blank || !v.std ? 'X' : v.txt); }
    return out;
  }
  /* DM CKS（PY:29971）。回傳 '0xNNNN'；Hand 關 ⇒ null（PY 顯示 'DM CKS：'）。 */
  function cks(key, s) {
    if (MODELS[key].kind === 'en01') return null;   // WPF 沒有 DM CKS
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
    else if (m.kind === 'en01') { for (i = 0; i < 288; i++) out.push(en01Addr(Math.floor(i / 12), i % 12)); }
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
    out.triGate = (out.panel | 0) === 3 && (out.hand | 0) && triSig(out) ? 1 : 0;   // v1.35.29：原廠樣式的面板由內容判斷（(21) Tri+BOE＝Tri-Gate，(17)～(20)＝MUX3；muxPanel triSig）
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
    if (/RM81008|EN01/.test(n)) return { py: 'RM81008', key: 'EN01' };   // v1.3.0：放最前面（例：RM81008(RM81002like) 不可認成 E503）
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
  /* v1.29.0（Bruce 10/14 依建議：EM01／EM02 SYS CRC 第二道確認，見 common/syscrc.js）：型號判斷不變，判斷完再驗 CRC */
  var SC = root.TCONSysCrc || (typeof require === 'function' ? require('./syscrc.js') : null);
  function parseWith(key, bytes, fileOf, medium) {
    var gb = function (reg) { var o = fileOf(reg); return (o >= 0 && o < bytes.length) ? bytes[o] : 0; };
    var st = decode(key, gb);
    return { ok: true, model: key, medium: medium, state: st, fileOf: fileOf, cks: cksOf(bytes), v512: v512Suspects(key, gb),
      sysCrc: SC ? SC.sysCrcCheck(bytes, key, medium) : null };
  }
  /* 匯入。name ＝ 檔名（決定解析方式與 PY 型號）；pick ＝ 頁面目前選的型號。
     規則：MNT 依檔案內容（只接受恰好一個命中）；PY 型號依檔名（同 PY），檔名看不出來才用 pick。 */
  function parseCode(raw, pick, name) {
    var bytes = loadCodeBytes(name || 'x.bin', raw);
    var hits = locate(bytes);
    var fromName = modelFromName(name);
    /* v1.3.0 EN01：檔名有 RM81008／EN01，或檔名看不出來但選的是 EN01 ⇒ 依 Dynamic Header 解析 */
    if ((fromName && fromName.key === 'EN01') || (!fromName && pick === 'EN01')) {
      var e1 = parseEn01(bytes);
      if (e1.ok) { e1.byName = !!fromName; return e1; }
      if (!fromName && hits.length === 1) return { ok: false, reason: 'modelMismatch', found: [hits[0].model] };
      return e1;
    }
    if (pick && MODELS[pick] && MODELS[pick].kind === 'mnt') {
      var h2 = hits.filter(function (h) { return h.model === pick; });
      if (h2.length === 1) return parseWith(pick, bytes, h2[0].fileOf, h2[0].medium);
      if (hits.length && !fromName) return { ok: false, reason: 'modelMismatch', found: hits.map(function (h) { return h.model; }) };
    }
    if (hits.length === 1 && !fromName) return parseWith(hits[0].model, bytes, hits[0].fileOf, hits[0].medium);
    if (hits.length > 1 && !fromName) return { ok: false, reason: 'ambiguous', found: hits.map(function (h) { return h.model; }) };
    var key = fromName ? fromName.key : (pick && MODELS[pick] && MODELS[pick].kind === 'nb' ? pick : null);
    if (!fromName && parseEn01(bytes).ok) return { ok: false, reason: 'modelMismatch', found: ['EN01'] };   // v1.3.0：選了別顆、內容是 EN01 header
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
    var lines = [], regs = MODELS[key].kind === 'en01' ? en01ExportRegs(s, opt.seg) : exportRegs(key, s, opt.second !== false);   // opt.second＝false：第一組沒動過 ⇒ 不寫 r2..b3；EN01：opt.seg＝沒載入的 P2／P3 不寫
    if (opt.comments !== false) {
      lines.push('// DataMap ' + asciiOnly(opt.version || '') + ' - exported ' + key + ' Data Mapping settings');
      lines.push('// Load this file from the Script page of the TCON tool.');
      lines.push(MODELS[key].kind === 'en01'
        ? '// EN01 (RM81008) Data Mapping registers only (0x390-0x394, 0x3A5, 0x41C, FORCE_SEL P1' + (opt.seg && !opt.seg.p2 ? '' : '+P2') + (opt.seg && !opt.seg.p3 ? '' : '+P3') + ') - masked writes, register addresses (slave 0x3E).'
        : '// Data Mapping registers only (rt7 data mapping + rd_mode) - masked writes, no TX, no timing.');
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
    if (MODELS[key].kind === 'mnt' && muxPanel(key, s).mux === 2) L = L.map(function (x) { return lineAlias(x)[1]; });   // v1.35.29：MNT LTPS MUX2＝Line n-SWk（其他維持 Python UI 的 Line 1-1…）
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
      for (var r = 0; r < rows.length; r++) if (rows[r] && sameLine(rows[r][0], L[i])) { row = rows[r]; break; }   // v1.35.29：Line 1-SW1 也認（MNT MUX2 匯出的新列名）
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
        /* v1.18.22（Bruce 10/8「不要動到沒有包含到的 bit」）：read-modify-write 只改欄位 mask 內的 bit；回讀只比 mask 內（mask 外由 TCON 自己決定，不當成失敗） */
        if (((back ^ nv) & e.mask) !== 0) { failed.push(e.reg); log('e', 'W 0x' + hex(e.reg, 4) + ' readback ' + hex(back, 2) + ' != ' + hex(nv, 2) + ' (mask ' + hex(e.mask, 2) + ')'); }
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

  /* ── v1.32.0 Tri-Gate（Bruce 2026-10-15 核可規劃 assistant_kb/reference/DataMapping_TriGate規劃_20261015.md 方案 A）──────────────
     硬性限制（Bruce 10/15「任何 tri-gate 的新增設定，千萬不要影響到原本 single gate 跟 dual gate 的結果」）：以下全是新函式，
     既有 Single／Dual 函式一行不改；只在 TRI.on 且 gateOf＝'tri' 時由頁面呼叫。TRI.on＝false ⇒ 行為與 v1.31.4 相同（退回開關）。
     MNT（EM01／EM02／E512）6 列（瑞鼎 EM01A1_rt7_register_force_mapping.xlsx LTPS 分頁 Z／AA／AB 欄：r0_0＝line0 時槽0、r0_1＝時槽1、r2_0＝時槽2，
       r0_2／r0_3／r2_2＝line1 三個時槽）：Line k-1＝主組 _(2k-2)、k-2＝主組 _(2k-1)、k-3＝第二組 r2..b3 _(2k-2)；第二組 _1／_3 固定寫 0（原廠 RT7 17~21）。
       名稱表：第 g 條 gate（0~2）＝起始欄（mntBaseT）＋g（datamap-auto wiringFromState Tri 分支同一規則），code 0～29 每一欄都可選（v1.35.22，與 Single／Dual 的 mntInRange、Auto 的 LOD.tName 同一政策；Bruce 10/17「Tri Gate 其實也有可能用到負數，都是一樣的」）。
     NB（E503／E501A／E501B／DAZ6138／DAZ6139）：force_sel 只有一組 _0~_3 × R0..B1（RM8100x_for_FAE_20240925_20250311.model:8588-8790，24 格，0x323~0x331），
       沒有第二組 r2..b3、沒有第 3 條 gate 的暫存器；Python UI V5.0.4 Tri 時表格停用（PY:12513-12528、10613-10620）⇒ NB 不做手動 Tri（Bruce 10/15「如果真的 NB 的 Tcon
       沒辦法手動編輯 tri-gate，就不用」）：Hand Mode 的 Gate Type 不列 Tri；DAZ6111／DAZ7353 model PANEL 只有 0~2 也不列。EN01 不動。 */
  var TRI = { on: true };
  var TRI_ROWS = [
    { label: 'Line 1-1', f: 'c', slot: 0, g: 0 }, { label: 'Line 1-2', f: 'c', slot: 1, g: 1 }, { label: 'Line 1-3', f: 'x', slot: 0, g: 2 },
    { label: 'Line 2-1', f: 'c', slot: 2, g: 0 }, { label: 'Line 2-2', f: 'c', slot: 3, g: 1 }, { label: 'Line 2-3', f: 'x', slot: 2, g: 2 }
  ];
  function triOn(key, s) { return !!TRI.on && MODELS[key] && MODELS[key].kind === 'mnt' && gateOf(key, s) === 'tri'; }
  function gateItems(key) {
    if (MODELS[key] && MODELS[key].kind === 'mnt') return MNT_GATES.slice();   // v1.35.29：MNT 多 MUX2／MUX3（Tri-Gate＝BOE tri-gate）
    var all = GATE_ITEMS.slice(1);
    if (!TRI.on || !MODELS[key] || MODELS[key].kind !== 'nb') return all;
    return all.filter(function (g) { return g !== 'Tri-Gate'; });
  }
  function triId(row, col) { var R = TRI_ROWS[row]; return R.f + (R.slot * 6 + col); }
  function triT(s, row) { return mntBaseT(s, 'tri').t + TRI_ROWS[row].g; }
  /* v1.35.22（Bruce 10/17「放寬到 0 至 29…Tri Gate 其實也有可能用到負數，都是一樣的」；派工 237015171729031168）：拿掉 ⌊code/6⌋≤欄，
     改用 MNT 同一份 mntInRange（code 0～29＋X 31，每一欄都合法；空白處＝負 pixel／AA 區外 dummy，決策 A5；同事A EM01A1 1D1G!C26:C55、RApp_TX.cpp:9506-9511）。 */
  function triCodeOk(T, code) { return mntInRange(T, code); }
  /* v1.35.24：zz＝ltpsZzKind（LTPS MUX3 zigzag 的 Pool 有 30／31 ⇒ 名稱＝subpixel，不當 X；其他模式 31＝X、30 未定義，與舊版相同） */
  function triName(T, code, zz) { code = code | 0; if (zz && (code === 30 || code === 31)) return linName(ltpsZzIdx(T, code, zz)); if (code === 31) return 'X'; if (code < 0 || code > 29) return null; return linName(mntIdx(T, code)); }
  function triZz(key, s, row) { return ltpsZzKind(key, s, row >= 3); }   // TRI_ROWS 3～5＝Line 2-x＝line 1
  function triCellView(key, s, row, col) {
    var id = triId(row, col), raw = s[id] | 0, T = triT(s, row), zz = triZz(key, s, row), nm = triName(T, raw, zz);
    return { id: id, raw: raw, t: T, txt: nm !== null ? nm : '0x' + hex(raw, 2), std: nm !== null, inTable: zz && (raw === 30 || raw === 31) ? true : triCodeOk(T, raw), color: nm !== null ? colorOfName(nm) : 'ns',
      field: fieldById(key, id).name, low: TRI_ROWS[row].g === 2, zz: zz && (raw === 30 || raw === 31) ? zz : 0 };
  }
  function triCellOptions(key, s, row) {
    var T = triT(s, row), zz = triZz(key, s, row), out = [];
    for (var c = 0; c < 30; c++) if (triCodeOk(T, c)) out.push({ name: triName(T, c), value: c });
    if (zz) { out.push({ name: triName(T, 30, zz), value: 30 }); out.push({ name: triName(T, 31, zz), value: 31 }); }
    else out.push({ name: 'X', value: 31 });
    return out;
  }
  function triPick(key, s, row, col, name) {
    if (!triOn(key, s)) return null;
    var o = triCellOptions(key, s, row).filter(function (x) { return x.name === name; })[0];
    if (!o) return null;
    var ns = cloneState(s); ns[triId(row, col)] = o.value;
    for (var c = 0; c < 6; c++) { ns['x' + (6 + c)] = 0; ns['x' + (18 + c)] = 0; }
    return { state: ns, text: o.name };
  }
  /* ── v1.34.0 Tri 下的整批功能（Bruce 10/15「all same pixel…benchmark 反推表…應該都要可以用才對」）：全部只在 triOn 時被呼叫，Single／Dual 不經過。
     36 個名稱＝TRI_ROWS 列序（Line 1-1、1-2、1-3、2-1、2-2、2-3）× Data 1~6。每列名稱表＝triCellOptions（與 triPick／下拉同一來源，T 以套用前的 state 計），
     不在該列表內 ⇒ X(31)；第二組 _1／_3 一律寫 0（與 triPick 相同）。All Same Pixel 下拉＝Line 1-1 那列的名稱（同 MNT Dual 用上 gate 那列：其他列沒有的名稱寫 X）。 */
  function triNames(key, s) { var out = []; for (var r = 0; r < 6; r++) for (var c = 0; c < 6; c++) { var v = triCellView(key, s, r, c); out.push(v.txt); } return out; }   // v1.35.23：非標準值寫「0x1E」（與 Single／Dual excelRows 同寫法；舊版寫 X，匯入後變 31）
  function triApplyNames(key, s, names) {
    if (!triOn(key, s) || !names || names.length !== 36) return null;
    var ns = cloneState(s);
    for (var r = 0; r < 6; r++) {
      var d = {}; triCellOptions(key, s, r).forEach(function (o) { d[o.name] = o.value; });
      for (var c = 0; c < 6; c++) { var n = normText(names[r * 6 + c]), rv = rawCodeText(n, 31); ns[triId(r, c)] = (n in d) ? d[n] : (rv !== null ? rv : 31); }
    }
    for (var q = 0; q < 6; q++) { ns['x' + (6 + q)] = 0; ns['x' + (18 + q)] = 0; }
    return ns;
  }
  function triAllSameOptions(key, s) { return triOn(key, s) ? triCellOptions(key, s, 0).map(function (o) { return o.name; }) : []; }
  function triAllSame(key, s, text) {
    if (!triOn(key, s)) return null;
    var t = normText(text); if (triAllSameOptions(key, s).indexOf(t) < 0) t = 'X';
    var names = []; for (var i = 0; i < 36; i++) names.push(t);
    return { state: triApplyNames(key, s, names), text: t };
  }
  /* Excel：與 excelRows 同格式（A 欄列名、B~G＝Data 1~6），列＝6 列 Tri；檔名 GateType(TriGate) */
  function triExcelRows(key, s) {
    var rows = [['', 'Data 1', 'Data 2', 'Data 3', 'Data 4', 'Data 5', 'Data 6']], N = triNames(key, s);
    for (var r = 0; r < 6; r++) rows.push([triLabel(key, s, r)].concat(N.slice(r * 6, r * 6 + 6)));   // v1.35.29：MUX3＝Line n-SWk
    return rows;
  }
  function triExcelToNames(rows) {
    var names = [];
    for (var i = 0; i < 6; i++) {
      var L = TRI_ROWS[i].label, row = null;   // v1.35.29：舊檔 Line 1-1 與新檔 Line 1-SW1 都認（sameLine）
      for (var r = 0; r < rows.length; r++) if (rows[r] && sameLine(rows[r][0], L)) { row = rows[r]; break; }
      if (!row) return { ok: false, reason: 'no ' + L };
      var vals = row.slice(1).filter(function (v) { return v !== '' && v != null; });
      if (vals.length !== 6) return { ok: false, reason: L + ': ' + vals.length + ' cells' };
      names = names.concat(vals.map(String));
    }
    return { ok: true, names: names };
  }
  function triExcelName(key, s, glass, now) { return excelName(key, s, glass, now).replace('_GateType()_', '_GateType(TriGate)_'); }
  /* Pixel 範圍（deSelForPx／pxForDeSel 的 Tri 分支）：起始欄 c 時 3 條 gate 各用第 c、c+1、c+2 欄，每欄可選 code＝triCodeOk ⇒ 每列可選 pixel 索引取交集
     v1.35.22：triCodeOk＝mntInRange 後，交集＝poolCov(MNT_POOL, c, 2)（與 Dual 的 poolCov(…, 1) 同一公式；tools/check_datamap_tri.js 逐欄比對兩者相同） */
  function triPxCov(c) {
    var lo = -Infinity, hi = Infinity;
    for (var g = 0; g < 3; g++) {
      var T = c + g, a = Infinity, b = -Infinity;
      for (var code = 0; code < 30; code++) if (triCodeOk(T, code)) { var p = Math.floor(mntIdx(T, code) / 3); if (p < a) a = p; if (p > b) b = p; }
      lo = Math.max(lo, a); hi = Math.min(hi, b);
    }
    return [lo, hi];
  }

  /* v1.35.20（Bruce 10/16 21:2x「不管是 Monitor、EN01 還是 E503，都應該要做到對應不同的 Gate 就要有對應的隱藏。像是 Single Gate、Dual Gate 或是 Tri Gate，
     都要有各自的搭配才對」「這個請跟 monitor 的做法都一致化」；Dispatch 統一方案 Bruce 21:3x「依你建議」；派工 236845185584205824，依據 3×3 對照 236839557071507456）：
     三種型號共用的「列清單」——② 表格、Benchmark 表、EN01 Excel 匯出入、All Same Pixel 的列都從這裡取，不再各自判斷。
     回傳 [{ r, label, show, hide, copyOf }]：r＝列號（MNT／NB 0~3、MNT Tri 0~5＝TRI_ROWS、EN01 0~23＝FORCE_SEL_*_r）；
       show＝false ⇒ 畫面不顯示、不能改；hide＝不顯示或不能改的列怎麼寫：
         'copy'＝NB Single 複本列（Line x′＝上一列，自動複製；PY:12521-12526、29753-29776；畫面照舊顯示暗色、不能改）；
         'keep'＝EN01 這個 RD_MODE 用不到的 SW 時槽：不顯示、保留原值不改（原廠 WPF V2 不遮格、不改值 DataMappingModule.cs:447-457；
                晶片依 RD_MODE 不讀＝推論；要不要填某值、line 循環 2 或 4 條＝未確認）。
         MNT Tri 第二組 _1／_3 寫 0 是 triApply 的寫法（不是列），MNT 第二組短循環複製是 syncX（既有），這裡不重複。
     命名對齊 MNT：Single＝Line n、Dual／HSD＝Line n-1、n-2、Tri＝Line n-1～n-3；EN01 MUX4／MUX6（MNT 沒有）＝Line n·SW1～SWk；括號＝暫存器列尾碼。
     EN01 line 數照 code header（en01Rows：P3 有載入才有 Line 3、4；I2C 讀回／沒匯入＝全部）。
     MNT／NB 4 列的列名與複本列＝v1.15.0 datamap.html rowLabel／renderGrid copyRow 原樣搬來（畫面 0 差異）。opt.four＝只要 4 列表（不換成 Tri 6 列）。 */
  var ROWS4 = ['Line 1-1', 'Line 1-2', 'Line 2-1', 'Line 2-2'];
  /* v1.35.29：第二個參數可給整個 state（MUX2／MUX3 要看 PANEL_MODE／SUB_PANEL_MODE）；只給 RD_MODE 數字時 1／2 當 gate 分段（舊呼叫相容） */
  function en01RowName(s, row) {
    var st = typeof s === 'object' && s ? s : { rd: s }, n = Math.floor(row / 6) + 1, k = row % 6 + 1, np = en01Phases(st.rd);
    if (np === 1) return lineName(n, k, 'single');
    if ((np === 2 || np === 3) && !en01Panel(st).mux) return lineName(n, k, 'gate');
    return lineName(n, k, 'mux');   // MUX2／3／4／6；RD_MODE 4／6／7（model 寫 not support）全部顯示（v1.35.28 以前 MUX 寫 Line n·SWk）
  }
  /* MNT Tri 6 列的列名：Tri-Gate＝Line n-k；MUX3＝Line n-SWk（列順序、暫存器同 TRI_ROWS） */
  function triLabel(key, s, row) { var R = TRI_ROWS[row], n = row < 3 ? 1 : 2, k = R.g + 1; return lineName(n, k, key && s && muxPanel(key, s).mux ? 'mux' : 'gate'); }
  function rowsFor(key, s, opt) {
    var M = MODELS[key]; if (!M) return [];
    s = s || {}; opt = opt || {};
    if (M.kind === 'en01') {
      var np = en01Phases(s.rd);
      return en01Rows(opt.seg).map(function (r) {
        var on = np === null || (r % 6) < np;
        return { r: r, label: en01RowName(s, r) + '（_' + r + '）', show: on, hide: on ? null : 'keep', copyOf: null, seg: en01Seg(r) };
      });
    }
    if (!opt.four && triOn(key, s)) return TRI_ROWS.map(function (R, i) { return { r: i, label: triLabel(key, s, i), show: true, hide: null, copyOf: null }; });   // v1.35.29：MUX3＝Line n-SWk
    var g = gateOf(key, s), mnt = M.kind === 'mnt', out = [], mx = g === 'dual' && muxPanel(key, s).mux === 2;   // v1.36.3（Bruce 10/20「NB 的部分就處理」；派工 238148574474215424）：NB e50x（E503／E501A／E501B／DAZ6138／6139）Hand MUX2 也是 Line n-SWk（muxPanel 只對 MNT／e50x 回 mux，DAZ6111／7353 不受影響）
    for (var r = 0; r < 4; r++) {
      var suf = '（_' + r + '）', lb;
      if (g === 'dual') lb = lineName((r >> 1) + 1, (r & 1) + 1, mx ? 'mux' : 'gate') + suf;   // v1.35.29：MNT LTPS MUX2＝Line n-SWk
      else if (g === 'single') lb = mnt ? 'Line ' + (r + 1) + suf : 'Line ' + ((r >> 1) + 1) + ((r & 1) ? '′' : '') + suf;
      else lb = ROWS4[r];
      var cp = M.sem === 'e50x' && g === 'single' && (r & 1) === 1 && !mnt;
      out.push({ r: r, label: lb, show: true, hide: cp ? 'copy' : null, copyOf: cp ? r - 1 : null });
    }
    return out;
  }
  /* 顯示中的列號（rowsFor 的 show） */
  function rowsShown(key, s, opt) { return rowsFor(key, s, opt).filter(function (x) { return x.show; }).map(function (x) { return x.r; }); }

  var API = {
    triNames: triNames, triApplyNames: triApplyNames, secondT: secondT, secondName: secondName, rawCodeText: rawCodeText, triAllSameOptions: triAllSameOptions, triAllSame: triAllSame,
    triExcelRows: triExcelRows, triExcelToNames: triExcelToNames, triExcelName: triExcelName, triPxCov: triPxCov,
    TRI: TRI, TRI_ROWS: TRI_ROWS, triOn: triOn, gateItems: gateItems, triCellView: triCellView, triCellOptions: triCellOptions, triPick: triPick, triName: triName, triT: triT,
    MODELS: MODELS, MODEL_KEYS: MODEL_KEYS, MNT_KEYS: MNT_KEYS, PY_TO_KEY: PY_TO_KEY, PY_TABLES: PY_TABLES,
    GN1: GN1, GN2: GN2, D6111: D6111, D7353: D7353, CKS_W: CKS_W, GATE_ITEMS: GATE_ITEMS, RD_MODE_REG: RD_MODE_REG,
    PANEL_MODES: PANEL_MODES, SUB_PANEL: SUB_PANEL, SUB_PANEL_REG: SUB_PANEL_REG, RD_MODES: RD_MODES, PRESETS: PRESETS, CH_NAMES: CH_NAMES,
    fieldsOf: fieldsOf, fieldById: fieldById, readField: readField, splitField: splitField,
    emptyState: emptyState, cloneState: cloneState, decode: decode, encode: encode, encodeFields: encodeFields,
    changedIds: changedIds, diffRegs: diffRegs, regsOf: regsOf, maskedMerge: maskedMerge,
    gateOf: gateOf, gateText: gateText, cellView: cellView, codeName: codeName, editCell: editCell, applyNames: applyNames, allSame: allSame,
    nbSel: nbSel, nbE50x: nbE50x, nbRm8100x: nbRm8100x, mntName: mntName, mntIdx: mntIdx, linName: linName, linIdx: linIdx, codeIdx: codeIdx, rbSwapName: rbSwapName, mntBaseT: mntBaseT, mntTOf: mntTOf, mntInRange: mntInRange, mntInTable: mntInTable, mntRel: mntRel, mntCands: mntCands, mntMirT: mntMirT, deSelTs: deSelTs, deSelText: deSelText, deSelForPx: deSelForPx, pxForDeSel: pxForDeSel, pxCovIdx: pxCovIdx, DE_COMMON: DE_COMMON, deSelBase: deSelBase, tWin: tWin, deAutoBase: deAutoBase, deAutoSel: deAutoSel, DE_AUTO_SEL: DE_AUTO_SEL, tUse: tUse,
    setGate: setGate, setHand: setHand, pyNormalize: pyNormalize, pyNames: pyNames, cks: cks, preLabels: preLabels,
    inputDict: inputDict, colorOfName: colorOfName, codeAddrs: codeAddrs, byteOf: byteOf, regNote: regNote, fieldsAt: fieldsAt,
    applyPreset: applyPreset, matchPreset: matchPreset, PRESET_SECOND: PRESET_SECOND, presetHasSecond: presetHasSecond,
    cellOptions: cellOptions, pickCell: pickCell, allSameOptions: allSameOptions, xInfo: xInfo, syncX: syncX, syncSecondSet: syncSecondSet, secondSetRule: secondSetRule, secondMeaning: secondMeaning, secondPolicy: secondPolicy, firstEdit: firstEdit, exportRegs: exportRegs,
    secondOptions: secondOptions, secondEditable: secondEditable, pickSecond: pickSecond, xChanged: xChanged, v512Suspects: v512Suspects,
    loadCodeBytes: loadCodeBytes, modelFromName: modelFromName, locate: locate, parseCode: parseCode, nbFileOf: nbFileOf, cksOf: cksOf,
    buildScript: buildScript, applyScript: applyScript, pyScriptRows: pyScriptRows, applyPyScriptRows: applyPyScriptRows,
    excelName: excelName, excelRows: excelRows, excelToNames: excelToNames, readXlsxRows: readXlsxRows,
    writeRegs: writeRegs, readSpans: readSpans, readState: readState, hex: hex,
    SELECT_KEYS: SELECT_KEYS, EN01_CH: EN01_CH, EN01_HD: EN01_HD, en01TRel: en01TRel, en01SName: en01SName, en01TLabel: en01TLabel, EN01_TABS: EN01_TABS, EN01_TDEF: EN01_TDEF, EN01_TMAX: EN01_TMAX, EN01_POOL: EN01_POOL, MNT_POOL: MNT_POOL, ltpsZzPool: ltpsZzPool, ltpsZzKind: ltpsZzKind, ltpsZzIdx: ltpsZzIdx, en01XApprox: en01XApprox,
    poolIdx: poolIdx, poolCov: poolCov, linPx: linPx, en01BaseT: en01BaseT, en01RowT: en01RowT, EN01_GATES: EN01_GATES, EN01_PANEL: EN01_PANEL,
    en01Seg: en01Seg, en01Addr: en01Addr, en01RowLabel: en01RowLabel, en01Phases: en01Phases, en01Rows: en01Rows, en01Defs: en01Defs, en01Name: en01Name, en01Value: en01Value,
    en01Gate: en01Gate, en01Panel: en01Panel, en01SetMuxType: en01SetMuxType, en01CellView: en01CellView, en01Pick: en01Pick, en01SameOptions: en01SameOptions, en01AllSame: en01AllSame,
    en01Ids: en01Ids, en01ExportRegs: en01ExportRegs, en01ExcelName: en01ExcelName, en01ExcelRows: en01ExcelRows, en01ExcelApply: en01ExcelApply,
    en01Maps: en01Maps, parseEn01: parseEn01, rowsFor: rowsFor, rowsShown: rowsShown, en01RowName: en01RowName,
    EN01_AUTO_EX: EN01_AUTO_EX, EN01_ZZ_SFT: EN01_ZZ_SFT, EN01_SUB_NAMES: EN01_SUB_NAMES, en01AutoOf: en01AutoOf, en01AutoState: en01AutoState, en01GateText: en01GateText,
    autoPanelNames: autoPanelNames, autoGateItems: autoGateItems, autoGateText: autoGateText, autoRd: autoRd, autoSetPanel: autoSetPanel, autoSetSub: autoSetSub, autoSetGate: autoSetGate,
    muxPanel: muxPanel, triSig: triSig, lineName: lineName, lineAlias: lineAlias, sameLine: sameLine, triLabel: triLabel, MNT_GATES: MNT_GATES, mntSetGate: mntSetGate
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.TCONDataMap = API;
})(typeof window !== 'undefined' ? window : this);
