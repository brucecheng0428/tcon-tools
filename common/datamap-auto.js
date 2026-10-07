/* ═══════════════════════════════════════════════════════════════════════════
   datamap-auto.js — v1.10.0 ② Auto Mode（Hand Mode 關）的 Data Mapping Type：各型號 Type 清單、寫入欄位、③ 接線來源、隱藏表填錯修正
   瀏覽器 window.TCONDataMapAuto（需先載入 datamap-core.js、datamap-lod.js），node module.exports。

   出處（全部只讀）：
     ・RT7 清單與值：VCL_TV_TCON_EM02_Tool/App/TX/RApp_TX.h:530-568 stRt7MapType[35]（＝datamap-core PRESETS，(0) 分 Normal／Mirror 兩筆、最後 (33) User define）；
       清單建立 RApp_TX.cpp:729-731；點選 RApp_TX.cpp:11117 → RApp_TX_RT7_DataMapping_RegSet（:10873）。
     ・隱藏表：~/TCON/TCON設定相關/E512_V512_data_mapping_diagram(Bruce修改_20250815).xlsx 工作表「register force setting」（state=hidden，無公式）
       A＝序號、B＝normal／mirror、C＝設定名（rt7_2p_*）；第 2 列表頭（normal, zigzag 版面）r0_0~r0_3＝G1~G4、r2_0~r2_3＝G5~G8；
       第 3 列表頭（hsd, ltps 版面）每個通道 8 欄＝line 0 的時槽 T1~T4（r0_0、r0_1、r2_0、r2_1）＋line 1（r0_2、r0_3、r2_2、r2_3），第 5 列標 R0/R2/R4/R6＝該時槽送第幾個 pixel；
       r0 g0 b0 r1 g1 b1＝Data 1~6（第二組 r2..b3 在 Single＝G5~G8、在 HSD＝時槽 T3／T4、在 MUX3／Tri＝第 3 個時槽）。code 的意義見 diagram 分頁的 T1~T5 表（datamap-lod.js tName）。
     ・Raydium_TCON_DataMapping查詢_20260424.xlsx「Data mapping」：每個樣式的 PANEL_MODE（3F0h[1:0]）／SUB_PANEL_MODE（3F0h[6:4]）／LTPS_ZIGZAG_MODE 與 Pixel Structure 圖。
   解碼規則（反推，與 Line OD 反推接線逐格驗證）：Normal 用 T1；Zigzag 用 T2；HSD 上 gate T2、下 gate T3，8-pixel 的 D7~D12 用 T4／T5；
     Tri（MUX3）三個時槽 T3、T4、T5（第 3 個用第二組 r2..b3）。Mirror：資料左右反向，實體接線同對應的非 Mirror 樣式（隱藏表 mirror 列只做邏輯檢查、不另解碼）。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var DM = root.TCONDataMap || (typeof require === 'function' ? require('./datamap-core.js') : null);
  var LOD = root.TCONDataMapLOD || (typeof require === 'function' ? require('./datamap-lod.js') : null);
  var CH = ['r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'r2', 'g2', 'b2', 'r3', 'g3', 'b3'];
  /* 隱藏表 44 列：[序號, normal/mirror, 設定名, 值（slot 0~3 × r0..b3，'.'＝空格）, 儲存格位址（同順序）] */
  var HIDDEN_SRC = [
    ['1', 'normal', 'rt7_2p_nml', '0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5', 'D8 X8 AR8 BL8 CF8 CZ8 P8 AJ8 BD8 BX8 CR8 DL8 H8 AB8 AV8 BP8 CJ8 DD8 R8 AL8 BF8 BZ8 CT8 DN8 L8 AF8 AZ8 BT8 CN8 DH8 T8 AN8 BH8 CB8 CV8 DP8 N8 AH8 BB8 BV8 CP8 DJ8 V8 AP8 BJ8 CD8 CX8 DR8'],
    ['2', 'normal', 'rt7_2p_zigzag_type1', '6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10', 'D9 X9 AR9 BL9 CF9 CZ9 P9 AJ9 BD9 BX9 CR9 DL9 H9 AB9 AV9 BP9 CJ9 DD9 R9 AL9 BF9 BZ9 CT9 DN9 L9 AF9 AZ9 BT9 CN9 DH9 T9 AN9 BH9 CB9 CV9 DP9 N9 AH9 BB9 BV9 CP9 DJ9 V9 AP9 BJ9 CD9 CX9 DR9'],
    ['3', 'normal', 'rt7_2p_zigzag_type2', '17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11', 'D10 X10 AR10 BL10 CF10 CZ10 P10 AJ10 BD10 BX10 CR10 DL10 H10 AB10 AV10 BP10 CJ10 DD10 R10 AL10 BF10 BZ10 CT10 DN10 L10 AF10 AZ10 BT10 CN10 DH10 T10 AN10 BH10 CB10 CV10 DP10 N10 AH10 BB10 BV10 CP10 DJ10 V10 AP10 BJ10 CD10 CX10 DR10'],
    ['4', 'normal', 'rt7_2p_zigzag_type3', '6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10', 'D11 X11 AR11 BL11 CF11 CZ11 P11 AJ11 BD11 BX11 CR11 DL11 H11 AB11 AV11 BP11 CJ11 DD11 R11 AL11 BF11 BZ11 CT11 DN11 L11 AF11 AZ11 BT11 CN11 DH11 T11 AN11 BH11 CB11 CV11 DP11 N11 AH11 BB11 BV11 CP11 DJ11 V11 AP11 BJ11 CD11 CX11 DR11'],
    ['5', 'normal', 'rt7_2p_zigzag_type4', '17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11', 'D12 X12 AR12 BL12 CF12 CZ12 P12 AJ12 BD12 BX12 CR12 DL12 H12 AB12 AV12 BP12 CJ12 DD12 R12 AL12 BF12 BZ12 CT12 DN12 L12 AF12 AZ12 BT12 CN12 DH12 T12 AN12 BH12 CB12 CV12 DP12 N12 AH12 BB12 BV12 CP12 DJ12 V12 AP12 BJ12 CD12 CX12 DR12'],
    ['6', 'normal', 'rt7_2p_zigzag_type5', '6 6 7 8 9 10 6 6 7 8 9 10 17 7 8 9 10 11 17 7 8 9 10 11 17 7 8 9 10 11 17 7 8 9 10 11 6 6 7 8 9 10 6 6 7 8 9 10', 'D13 X13 AR13 BL13 CF13 CZ13 P13 AJ13 BD13 BX13 CR13 DL13 H13 AB13 AV13 BP13 CJ13 DD13 R13 AL13 BF13 BZ13 CT13 DN13 L13 AF13 AZ13 BT13 CN13 DH13 T13 AN13 BH13 CB13 CV13 DP13 N13 AH13 BB13 BV13 CP13 DJ13 V13 AP13 BJ13 CD13 CX13 DR13'],
    ['7', 'normal', 'rt7_2p_zigzag_type6', '17 7 8 9 10 11 17 7 8 9 10 11 6 6 7 8 9 10 6 6 7 8 9 10 6 6 7 8 9 10 6 6 7 8 9 10 17 7 8 9 10 11 17 7 8 9 10 11', 'D14 X14 AR14 BL14 CF14 CZ14 P14 AJ14 BD14 BX14 CR14 DL14 H14 AB14 AV14 BP14 CJ14 DD14 R14 AL14 BF14 BZ14 CT14 DN14 L14 AF14 AZ14 BT14 CN14 DH14 T14 AN14 BH14 CB14 CV14 DP14 N14 AH14 BB14 BV14 CP14 DJ14 V14 AP14 BJ14 CD14 CX14 DR14'],
    ['8', 'normal', 'rt7_2p_zigzag_type7', '6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10', 'D15 X15 AR15 BL15 CF15 CZ15 P15 AJ15 BD15 BX15 CR15 DL15 H15 AB15 AV15 BP15 CJ15 DD15 R15 AL15 BF15 BZ15 CT15 DN15 L15 AF15 AZ15 BT15 CN15 DH15 T15 AN15 BH15 CB15 CV15 DP15 N15 AH15 BB15 BV15 CP15 DJ15 V15 AP15 BJ15 CD15 CX15 DR15'],
    ['9', 'normal', 'rt7_2p_zigzag_type8', '17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11', 'D16 X16 AR16 BL16 CF16 CZ16 P16 AJ16 BD16 BX16 CR16 DL16 H16 AB16 AV16 BP16 CJ16 DD16 R16 AL16 BF16 BZ16 CT16 DN16 L16 AF16 AZ16 BT16 CN16 DH16 T16 AN16 BH16 CB16 CV16 DP16 N16 AH16 BB16 BV16 CP16 DJ16 V16 AP16 BJ16 CD16 CX16 DR16'],
    ['10', 'normal', 'rt7_2p_hsd_type1', '6 8 10 0 2 4 6 8 10 0 2 4 13 15 17 7 9 11 13 15 17 7 9 11 6 8 10 0 2 4 6 8 10 0 2 4 13 15 17 7 9 11 13 15 17 7 9 11', 'D17 X17 AR17 BL17 CF17 CZ17 F17 Z17 AT17 BN17 CH17 DB17 E17 Y17 AS17 BM17 CG17 DA17 G17 AA17 AU17 BO17 CI17 DC17 H17 AB17 AV17 BP17 CJ17 DD17 J17 AD17 AX17 BR17 CL17 DF17 I17 AC17 AW17 BQ17 CK17 DE17 K17 AE17 AY17 BS17 CM17 DG17'],
    ['11', 'normal', 'rt7_2p_hsd_type4', '6 9 11 0 3 5 6 9 11 0 3 5 13 14 16 7 8 10 13 14 16 7 8 10 6 9 11 0 3 5 6 9 11 0 3 5 13 14 16 7 8 10 13 14 16 7 8 10', 'D18 X18 AR18 BL18 CF18 CZ18 F18 Z18 AT18 BN18 CH18 DB18 E18 Y18 AS18 BM18 CG18 DA18 G18 AA18 AU18 BO18 CI18 DC18 H18 AB18 AV18 BP18 CJ18 DD18 J18 AD18 AX18 BR18 CL18 DF18 I18 AC18 AW18 BQ18 CK18 DE18 K18 AE18 AY18 BS18 CM18 DG18'],
    ['12', 'normal', 'rt7_2p_hsd_type3-5', '16 17 7 10 11 1 16 17 7 10 11 1 21 12 14 15 6 8 21 12 14 15 6 8 17 7 10 11 1 4 17 7 10 11 1 4 12 14 15 6 8 9 12 14 15 6 8 9', 'D19 X19 AR19 BL19 CF19 CZ19 F19 Z19 AT19 BN19 CH19 DB19 E19 Y19 AS19 BM19 CG19 DA19 G19 AA19 AU19 BO19 CI19 DC19 H19 AB19 AV19 BP19 CJ19 DD19 J19 AD19 AX19 BR19 CL19 DF19 I19 AC19 AW19 BQ19 CK19 DE19 K19 AE19 AY19 BS19 CM19 DG19'],
    ['13', 'normal', 'rt7_2p_hsd_type4+boe', '6 9 11 0 3 5 6 9 11 0 3 5 13 14 16 7 8 10 13 14 16 7 8 10 17 6 9 11 0 3 17 6 9 11 0 3 22 13 14 16 7 8 22 13 14 16 7 8', 'D20 X20 AR20 BL20 CF20 CZ20 F20 Z20 AT20 BN20 CH20 DB20 E20 Y20 AS20 BM20 CG20 DA20 G20 AA20 AU20 BO20 CI20 DC20 H20 AB20 AV20 BP20 CJ20 DD20 J20 AD20 AX20 BR20 CL20 DF20 I20 AC20 AW20 BQ20 CK20 DE20 K20 AE20 AY20 BS20 CM20 DG20'],
    ['13_1', 'normal', 'rt7_2p_hsd_8pixel', '16 17 7 10 0 1 16 6 7 10 11 1 21 12 14 15 17 8 21 23 14 15 6 8 17 7 10 0 1 4 6 7 10 11 1 4 12 14 15 17 8 9 23 14 15 6 8 9', 'D21 X21 AR21 BL21 CF21 CZ21 F21 Z21 AT21 BN21 CH21 DB21 E21 Y21 AS21 BM21 CG21 DA21 G21 AA21 AU21 BO21 CI21 DC21 H21 AB21 AV21 BP21 CJ21 DD21 J21 AD21 AX21 BR21 CL21 DF21 I21 AC21 AW21 BQ21 CK21 DE21 K21 AE21 AY21 BS21 CM21 DG21'],
    ['14', 'normal', 'rt7_2p_ltps_type1_nml_mux3', '12 15 6 9 0 3 26 29 20 23 14 17 19 22 13 16 7 10 . . . . . . 12 15 6 9 0 3 26 29 20 23 14 17 19 22 13 16 7 10 . . . . . .', 'D22 X22 AR22 BL22 CF22 CZ22 F22 Z22 AT22 BN22 CH22 DB22 E22 Y22 AS22 BM22 CG22 DA22       H22 AB22 AV22 BP22 CJ22 DD22 J22 AD22 AX22 BR22 CL22 DF22 I22 AC22 AW22 BQ22 CK22 DE22      '],
    ['15', 'normal', 'rt7_2p_ltps_type1_nml_mux2', '12 14 16 6 8 10 12 14 16 6 8 10 19 21 23 13 15 17 19 21 23 13 15 17 12 14 16 6 8 10 12 14 16 6 8 10 19 21 23 13 15 17 19 21 23 13 15 17', 'D23 X23 AR23 BL23 CF23 CZ23 F23 Z23 AT23 BN23 CH23 DB23 E23 Y23 AS23 BM23 CG23 DA23 G23 AA23 AU23 BO23 CI23 DC23 H23 AB23 AV23 BP23 CJ23 DD23 J23 AD23 AX23 BR23 CL23 DF23 I23 AC23 AW23 BQ23 CK23 DE23 K23 AE23 AY23 BS23 CM23 DG23'],
    ['16', 'normal', 'rt7_2p_ltps_type1_zigzag_mux3', '12 15 6 9 0 3 26 29 20 23 14 17 19 22 13 16 7 10 . . . . . . 23 14 17 8 11 2 25 28 19 22 13 16 18 21 12 15 6 9 . . . . . .', 'D24 X24 AR24 BL24 CF24 CZ24 F24 Z24 AT24 BN24 CH24 DB24 E24 Y24 AS24 BM24 CG24 DA24       H24 AB24 AV24 BP24 CJ24 DD24 J24 AD24 AX24 BR24 CL24 DF24 I24 AC24 AW24 BQ24 CK24 DE24      '],
    ['17', 'normal', 'rt7_2p_ltps_type1_zigzag_mux2', '12 14 16 6 8 10 12 14 16 6 8 10 19 21 23 13 15 17 19 21 23 13 15 17 23 13 15 17 7 9 23 13 15 17 7 9 18 20 22 12 14 16 18 20 22 12 14 16', 'D25 X25 AR25 BL25 CF25 CZ25 F25 Z25 AT25 BN25 CH25 DB25 E25 Y25 AS25 BM25 CG25 DA25 G25 AA25 AU25 BO25 CI25 DC25 H25 AB25 AV25 BP25 CJ25 DD25 J25 AD25 AX25 BR25 CL25 DF25 I25 AC25 AW25 BQ25 CK25 DE25 K25 AE25 AY25 BS25 CM25 DG25'],
    ['18', 'normal', 'rt7_2p_ltps_type2_nml_mux3', '12 15 6 9 0 3 26 29 20 23 14 17 22 19 16 13 10 7 . . . . . . 12 15 6 9 0 3 26 29 20 23 14 17 22 19 16 13 10 7 . . . . . .', 'D26 X26 AR26 BL26 CF26 CZ26 F26 Z26 AT26 BN26 CH26 DB26 E26 Y26 AS26 BM26 CG26 DA26       H26 AB26 AV26 BP26 CJ26 DD26 J26 AD26 AX26 BR26 CL26 DF26 I26 AC26 AW26 BQ26 CK26 DE26      '],
    ['19', 'normal', 'rt7_2p_ltps_type2_nml_mux2', '12 13 16 17 8 9 12 13 16 17 8 9 20 21 12 13 16 17 20 21 12 13 16 17 12 13 16 17 8 9 12 13 16 17 8 9 20 21 12 13 16 17 20 21 12 13 16 17', 'D27 X27 AR27 BL27 CF27 CZ27 F27 Z27 AT27 BN27 CH27 DB27 E27 Y27 AS27 BM27 CG27 DA27 G27 AA27 AU27 BO27 CI27 DC27 H27 AB27 AV27 BP27 CJ27 DD27 J27 AD27 AX27 BR27 CL27 DF27 I27 AC27 AW27 BQ27 CK27 DE27 K27 AE27 AY27 BS27 CM27 DG27'],
    ['20', 'normal', 'rt7_2p_ltps_type2_zigzag_mux3', '12 15 6 9 0 3 26 29 20 23 14 17 22 19 16 13 10 7 . . . . . . 23 14 17 8 11 2 25 28 19 22 13 16 21 18 15 12 9 6 . . . . . .', 'D28 X28 AR28 BL28 CF28 CZ28 F28 Z28 AT28 BN28 CH28 DB28 E28 Y28 AS28 BM28 CG28 DA28       H28 AB28 AV28 BP28 CJ28 DD28 J28 AD28 AX28 BR28 CL28 DF28 I28 AC28 AW28 BQ28 CK28 DE28      '],
    ['21', 'normal', 'rt7_2p_ltps_type2_zigzag_mux2', '12 13 16 17 8 9 12 13 16 17 8 9 20 21 12 13 16 17 20 21 12 13 16 17 23 12 15 16 7 8 23 12 15 16 7 8 19 20 23 12 15 16 19 20 23 12 15 16', 'D29 X29 AR29 BL29 CF29 CZ29 F29 Z29 AT29 BN29 CH29 DB29 E29 Y29 AS29 BM29 CG29 DA29 G29 AA29 AU29 BO29 CI29 DC29 H29 AB29 AV29 BP29 CJ29 DD29 J29 AD29 AX29 BR29 CL29 DF29 I29 AC29 AW29 BQ29 CK29 DE29 K29 AE29 AY29 BS29 CM29 DG29'],
    ['22', 'mirror', 'rt7_2p_nml', '3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2', 'D30 X30 AR30 BL30 CF30 CZ30 P30 AJ30 BD30 BX30 CR30 DL30 H30 AB30 AV30 BP30 CJ30 DD30 R30 AL30 BF30 BZ30 CT30 DN30 L30 AF30 AZ30 BT30 CN30 DH30 T30 AN30 BH30 CB30 CV30 DP30 N30 AH30 BB30 BV30 CP30 DJ30 V30 AP30 BJ30 CD30 CX30 DR30'],
    ['23', 'mirror', 'rt7_2p_zigzag_type1', '15 16 17 12 13 14 15 15 17 12 13 14 8 15 16 17 12 13 8 15 16 17 12 13 15 16 17 12 13 14 15 15 17 12 13 14 8 15 16 17 12 13 8 15 16 17 12 13', 'D31 X31 AR31 BL31 CF31 CZ31 P31 AJ31 BD31 BX31 CR31 DL31 H31 AB31 AV31 BP31 CJ31 DD31 R31 AL31 BF31 BZ31 CT31 DN31 L31 AF31 AZ31 BT31 CN31 DH31 T31 AN31 BH31 CB31 CV31 DP31 N31 AH31 BB31 BV31 CP31 DJ31 V31 AP31 BJ31 CD31 CX31 DR31'],
    ['24', 'mirror', 'rt7_2p_zigzag_type2', '8 15 16 17 12 13 8 16 16 17 12 13 15 16 17 12 13 14 15 16 17 12 13 14 8 15 16 17 12 13 8 16 16 17 12 13 15 16 17 12 13 14 15 16 17 12 13 14', 'D32 X32 AR32 BL32 CF32 CZ32 P32 AJ32 BD32 BX32 CR32 DL32 H32 AB32 AV32 BP32 CJ32 DD32 R32 AL32 BF32 BZ32 CT32 DN32 L32 AF32 AZ32 BT32 CN32 DH32 T32 AN32 BH32 CB32 CV32 DP32 N32 AH32 BB32 BV32 CP32 DJ32 V32 AP32 BJ32 CD32 CX32 DR32'],
    ['25', 'mirror', 'rt7_2p_zigzag_type3', '15 16 17 12 13 14 15 15 17 12 13 14 15 16 17 12 13 14 15 15 17 12 13 14 8 15 16 17 12 13 8 15 16 17 12 13 8 15 16 17 12 13 8 15 16 17 12 13', 'D33 X33 AR33 BL33 CF33 CZ33 P33 AJ33 BD33 BX33 CR33 DL33 H33 AB33 AV33 BP33 CJ33 DD33 R33 AL33 BF33 BZ33 CT33 DN33 L33 AF33 AZ33 BT33 CN33 DH33 T33 AN33 BH33 CB33 CV33 DP33 N33 AH33 BB33 BV33 CP33 DJ33 V33 AP33 BJ33 CD33 CX33 DR33'],
    ['26', 'mirror', 'rt7_2p_zigzag_type4', '8 15 16 17 12 13 8 16 16 17 12 13 8 15 16 17 12 13 8 16 16 17 12 13 15 16 17 12 13 14 15 16 17 12 13 14 15 16 17 12 13 14 15 16 17 12 13 14', 'D34 X34 AR34 BL34 CF34 CZ34 P34 AJ34 BD34 BX34 CR34 DL34 H34 AB34 AV34 BP34 CJ34 DD34 R34 AL34 BF34 BZ34 CT34 DN34 L34 AF34 AZ34 BT34 CN34 DH34 T34 AN34 BH34 CB34 CV34 DP34 N34 AH34 BB34 BV34 CP34 DJ34 V34 AP34 BJ34 CD34 CX34 DR34'],
    ['27', 'mirror', 'rt7_2p_zigzag_type5', '15 15 16 17 12 13 15 15 16 17 12 13 8 16 17 12 13 14 8 15 17 12 13 14 8 16 17 12 13 14 8 15 17 12 13 14 15 15 16 17 12 13 15 15 16 17 12 13', 'D35 X35 AR35 BL35 CF35 CZ35 P35 AJ35 BD35 BX35 CR35 DL35 H35 AB35 AV35 BP35 CJ35 DD35 R35 AL35 BF35 BZ35 CT35 DN35 L35 AF35 AZ35 BT35 CN35 DH35 T35 AN35 BH35 CB35 CV35 DP35 N35 AH35 BB35 BV35 CP35 DJ35 V35 AP35 BJ35 CD35 CX35 DR35'],
    ['28', 'mirror', 'rt7_2p_zigzag_type6', '8 16 17 12 13 14 8 16 17 12 13 14 15 15 16 17 12 13 15 16 16 17 12 13 15 15 16 17 12 13 15 16 16 17 12 13 8 16 17 12 13 14 8 16 17 12 13 14', 'D36 X36 AR36 BL36 CF36 CZ36 P36 AJ36 BD36 BX36 CR36 DL36 H36 AB36 AV36 BP36 CJ36 DD36 R36 AL36 BF36 BZ36 CT36 DN36 L36 AF36 AZ36 BT36 CN36 DH36 T36 AN36 BH36 CB36 CV36 DP36 N36 AH36 BB36 BV36 CP36 DJ36 V36 AP36 BJ36 CD36 CX36 DR36'],
    ['29', 'mirror', 'rt7_2p_zigzag_type7', '15 16 17 12 13 14 8 15 16 17 12 13 15 16 17 12 13 14 8 15 16 17 12 13 15 16 17 12 13 14 8 15 16 17 12 13 15 16 17 12 13 14 8 15 16 17 12 13', 'D37 X37 AR37 BL37 CF37 CZ37 P37 AJ37 BD37 BX37 CR37 DL37 H37 AB37 AV37 BP37 CJ37 DD37 R37 AL37 BF37 BZ37 CT37 DN37 L37 AF37 AZ37 BT37 CN37 DH37 T37 AN37 BH37 CB37 CV37 DP37 N37 AH37 BB37 BV37 CP37 DJ37 V37 AP37 BJ37 CD37 CX37 DR37'],
    ['30', 'mirror', 'rt7_2p_zigzag_type8', '8 15 16 17 12 13 15 16 17 12 13 14 8 15 16 17 12 13 15 16 17 12 13 14 8 15 16 17 12 13 15 16 17 12 13 14 8 15 16 17 12 13 15 16 17 12 13 14', 'D38 X38 AR38 BL38 CF38 CZ38 P38 AJ38 BD38 BX38 CR38 DL38 H38 AB38 AV38 BP38 CJ38 DD38 R38 AL38 BF38 BZ38 CT38 DN38 L38 AF38 AZ38 BT38 CN38 DH38 T38 AN38 BH38 CB38 CV38 DP38 N38 AH38 BB38 BV38 CP38 DJ38 V38 AP38 BJ38 CD38 CX38 DR38'],
    ['31', 'mirror', 'rt7_2p_hsd_type1', '3 5 1 9 11 7 3 5 1 9 11 7 10 6 8 16 12 14 10 6 8 16 12 14 3 5 1 9 11 7 3 5 1 9 11 7 10 6 8 16 12 14 10 6 8 16 12 14', 'D39 X39 AR39 BL39 CF39 CZ39 F39 Z39 AT39 BN39 CH39 DB39 E39 Y39 AS39 BM39 CG39 DA39 G39 AA39 AU39 BO39 CI39 DC39 H39 AB39 AV39 BP39 CJ39 DD39 J39 AD39 AX39 BR39 CL39 DF39 I39 AC39 AW39 BQ39 CK39 DE39 K39 AE39 AY39 BS39 CM39 DG39'],
    ['32', 'mirror', 'rt7_2p_hsd_type4', '3 0 2 9 6 8 3 0 2 9 6 8 10 11 7 16 17 13 10 11 7 16 17 13 3 0 2 9 6 8 3 0 2 9 6 8 10 11 7 16 17 13 10 11 7 16 17 13', 'D40 X40 AR40 BL40 CF40 CZ40 F40 Z40 AT40 BN40 CH40 DB40 E40 Y40 AS40 BM40 CG40 DA40 G40 AA40 AU40 BO40 CI40 DC40 H40 AB40 AV40 BP40 CJ40 DD40 J40 AD40 AX40 BR40 CL40 DF40 I40 AC40 AW40 BQ40 CK40 DE40 K40 AE40 AY40 BS40 CM40 DG40'],
    ['33', 'mirror', 'rt7_2p_hsd_type3-5', '7 8 16 13 14 22 7 8 16 13 14 22 12 21 23 18 27 29 12 21 23 18 27 29 8 16 13 14 22 19 8 16 13 14 22 19 21 23 18 27 29 24 21 23 18 27 29 24', 'D41 X41 AR41 BL41 CF41 CZ41 F41 Z41 AT41 BN41 CH41 DB41 E41 Y41 AS41 BM41 CG41 DA41 G41 AA41 AU41 BO41 CI41 DC41 H41 AB41 AV41 BP41 CJ41 DD41 J41 AD41 AX41 BR41 CL41 DF41 I41 AC41 AW41 BQ41 CK41 DE41 K41 AE41 AY41 BS41 CM41 DG41'],
    ['34', 'mirror', 'rt7_2p_hsd_type4+boe', '15 12 14 21 18 20 15 12 14 21 18 20 22 23 19 28 29 25 22 23 19 28 29 25 8 15 12 14 21 18 8 15 12 14 21 18 13 22 23 19 28 29 13 22 23 19 28 29', 'D42 X42 AR42 BL42 CF42 CZ42 F42 Z42 AT42 BN42 CH42 DB42 E42 Y42 AS42 BM42 CG42 DA42 G42 AA42 AU42 BO42 CI42 DC42 H42 AB42 AV42 BP42 CJ42 DD42 J42 AD42 AX42 BR42 CL42 DF42 I42 AC42 AW42 BQ42 CK42 DE42 K42 AE42 AY42 BS42 CM42 DG42'],
    ['34_1', 'mirror', 'rt7_2p_hsd_8pixel', '7 8 16 13 21 22 7 15 16 13 14 22 12 21 23 18 20 29 12 14 23 18 27 29 8 16 13 21 22 19 15 16 13 14 22 19 21 23 18 20 29 24 14 23 18 27 29 24', 'D43 X43 AR43 BL43 CF43 CZ43 F43 Z43 AT43 BN43 CH43 DB43 E43 Y43 AS43 BM43 CG43 DA43 G43 AA43 AU43 BO43 CI43 DC43 H43 AB43 AV43 BP43 CJ43 DD43 J43 AD43 AX43 BR43 CL43 DF43 I43 AC43 AW43 BQ43 CK43 DE43 K43 AE43 AY43 BS43 CM43 DG43'],
    ['35', 'mirror', 'rt7_2p_ltps_type1_nml_mux3', '3 0 9 6 15 12 17 14 23 20 29 26 10 7 16 13 22 19 . . . . . . 3 0 9 6 15 12 17 14 23 20 29 26 10 7 16 13 22 19 . . . . . .', 'D44 X44 AR44 BL44 CF44 CZ44 F44 Z44 AT44 BN44 CH44 DB44 E44 Y44 AS44 BM44 CG44 DA44       H44 AB44 AV44 BP44 CJ44 DD44 J44 AD44 AX44 BR44 CL44 DF44 I44 AC44 AW44 BQ44 CK44 DE44      '],
    ['36', 'mirror', 'rt7_2p_ltps_type1_nml_mux2', '9 11 7 15 17 13 9 11 7 15 17 13 16 12 14 22 18 20 16 12 14 22 18 20 9 11 7 15 17 13 9 11 7 15 17 13 16 12 14 22 18 20 16 12 14 22 18 20', 'D45 X45 AR45 BL45 CF45 CZ45 F45 Z45 AT45 BN45 CH45 DB45 E45 Y45 AS45 BM45 CG45 DA45 G45 AA45 AU45 BO45 CI45 DC45 H45 AB45 AV45 BP45 CJ45 DD45 J45 AD45 AX45 BR45 CL45 DF45 I45 AC45 AW45 BQ45 CK45 DE45 K45 AE45 AY45 BS45 CM45 DG45'],
    ['37', 'mirror', 'rt7_2p_ltps_type1_zigzag_mux3', '9 6 15 12 21 18 23 20 29 26 31 30 16 13 22 19 28 25 . . . . . . 2 11 8 17 14 23 22 19 28 25 31 30 15 12 21 18 27 24 . . . . . .', 'D46 X46 AR46 BL46 CF46 CZ46 F46 Z46 AT46 BN46 CH46 DB46 E46 Y46 AS46 BM46 CG46 DA46       H46 AB46 AV46 BP46 CJ46 DD46 J46 AD46 AX46 BR46 CL46 DF46 I46 AC46 AW46 BQ46 CK46 DE46      '],
    ['38', 'mirror', 'rt7_2p_ltps_type1_zigzag_mux2', '9 11 7 15 17 13 9 11 7 15 17 13 16 12 14 22 18 20 16 12 14 22 18 20 2 10 6 8 16 12 2 10 6 8 16 12 15 17 13 21 23 19 15 17 13 21 23 19', 'D47 X47 AR47 BL47 CF47 CZ47 F47 Z47 AT47 BN47 CH47 DB47 E47 Y47 AS47 BM47 CG47 DA47 G47 AA47 AU47 BO47 CI47 DC47 H47 AB47 AV47 BP47 CJ47 DD47 J47 AD47 AX47 BR47 CL47 DF47 I47 AC47 AW47 BQ47 CK47 DE47 K47 AE47 AY47 BS47 CM47 DG47'],
    ['39', 'mirror', 'rt7_2p_ltps_type2_nml_mux3', '3 0 9 6 15 12 17 14 23 20 29 26 7 10 13 16 19 22 . . . . . . 3 0 9 6 15 12 17 14 23 20 29 26 7 10 13 16 19 22 . . . . . .', 'D48 X48 AR48 BL48 CF48 CZ48 F48 Z48 AT48 BN48 CH48 DB48 E48 Y48 AS48 BM48 CG48 DA48       H48 AB48 AV48 BP48 CJ48 DD48 J48 AD48 AX48 BR48 CL48 DF48 I48 AC48 AW48 BQ48 CK48 DE48      '],
    ['40', 'mirror', 'rt7_2p_ltps_type2_nml_mux2', '9 10 7 8 17 12 9 10 7 8 17 12 17 12 21 22 19 20 17 12 21 22 19 20 9 10 7 8 17 12 9 10 7 8 17 12 17 12 21 22 19 20 17 12 21 22 19 20', 'D49 X49 AR49 BL49 CF49 CZ49 F49 Z49 AT49 BN49 CH49 DB49 E49 Y49 AS49 BM49 CG49 DA49 G49 AA49 AU49 BO49 CI49 DC49 H49 AB49 AV49 BP49 CJ49 DD49 J49 AD49 AX49 BR49 CL49 DF49 I49 AC49 AW49 BQ49 CK49 DE49 K49 AE49 AY49 BS49 CM49 DG49'],
    ['41', 'mirror', 'rt7_2p_ltps_type2_zigzag_mux3', '9 6 15 12 21 18 23 20 29 26 31 30 13 16 19 22 25 28 . . . . . . 2 11 8 17 14 23 22 19 28 25 31 30 12 15 18 21 24 27 . . . . . .', 'D50 X50 AR50 BL50 CF50 CZ50 F50 Z50 AT50 BN50 CH50 DB50 E50 Y50 AS50 BM50 CG50 DA50       H50 AB50 AV50 BP50 CJ50 DD50 J50 AD50 AX50 BR50 CL50 DF50 I50 AC50 AW50 BQ50 CK50 DE50      '],
    ['42', 'mirror', 'rt7_2p_ltps_type2_zigzag_mux2', '9 10 7 8 17 12 9 10 7 8 17 12 17 12 21 22 19 20 17 12 21 22 19 20 2 9 6 7 16 17 2 9 6 7 16 17 16 17 14 21 18 19 16 17 14 21 18 19', 'D51 X51 AR51 BL51 CF51 CZ51 F51 Z51 AT51 BN51 CH51 DB51 E51 Y51 AS51 BM51 CG51 DA51 G51 AA51 AU51 BO51 CI51 DC51 H51 AB51 AV51 BP51 CJ51 DD51 J51 AD51 AX51 BR51 CL51 DF51 I51 AC51 AW51 BQ51 CK51 DE51 K51 AE51 AY51 BS51 CM51 DG51']
  ];
  var HIDDEN = {};
  HIDDEN_SRC.forEach(function (r) {
    var v = r[3].split(' ').map(function (x) { return x === '.' ? null : +x; }), a = r[4].split(' ');
    HIDDEN[r[0]] = { id: r[0], mode: r[1], name: r[2], v: v, cell: a };
  });
  function hv(h, ch, slot) { return h.v[slot * 12 + CH.indexOf(ch)]; }
  function hcell(h, ch, slot) { return h.cell[slot * 12 + CH.indexOf(ch)]; }
  /* ── 依表格邏輯找填錯的格子（Zigzag：同一條 gate 上 6 條 Data 線送 6 顆不同子像素；整列只有「接左」或「接右」兩種固定組合；
        L／R 序列依原廠 RT7 sub_panel 0~7 的名稱與 Raydium 查詢表 Pixel Structure 圖：LR、RL、LLRR、RRLL、LRRL、RLLR、LLLLRRRR、RRRRLLLL；
        G1~G4＝第一組 _0~_3、G5~G8＝第二組 _0~_3。接左／接右的 code 取自同模式 type1 列（normal：L 6 7 8 9 10 11、R 17 6 7 8 9 10；
        mirror：L 15 16 17 12 13 14、R 8 15 16 17 12 13）。 */
  var ZZ_SEQ = ['LR', 'RL', 'LLRR', 'RRLL', 'LRRL', 'RLLR', 'LLLLRRRR', 'RRRRLLLL'];
  var ZZ_PAT = { normal: { L: [6, 7, 8, 9, 10, 11], R: [17, 6, 7, 8, 9, 10] }, mirror: { L: [15, 16, 17, 12, 13, 14], R: [8, 15, 16, 17, 12, 13] } };
  function zzFixes(h) {
    var m = /zigzag_type(\d)$/.exec(h.name); if (!m) return [];
    var seq = ZZ_SEQ[+m[1] - 1], P = ZZ_PAT[h.mode], out = [];
    for (var G = 0; G < 8; G++) {
      var set = G < 4 ? 0 : 1, slot = G % 4, L = seq[G % seq.length];
      for (var c = 0; c < 6; c++) {
        var ch = CH[c + 6 * set], v = hv(h, ch, slot), exp = P[L][c];
        if (v !== exp) out.push({ cell: hcell(h, ch, slot), reg: ch + '_' + slot, gate: 'G' + (G + 1), side: L, from: v, to: exp });
      }
    }
    return out;
  }
  var FIXES = {}; Object.keys(HIDDEN).forEach(function (id) { var f = zzFixes(HIDDEN[id]); if (f.length) FIXES[id] = f; });
  /* ── LTPS MUX3（Tri）解碼：三個時槽＝r0_(2l)、r0_(2l+1)、r2_(2l)，用 T3／T4／T5 表（RT7 (18)~(21) 與 Line OD 17~21 逐格驗證） */
  function mux3Type(h, label) {
    var rows = [];
    for (var l = 0; l < 2; l++) {
      var line = [];
      for (var g = 0; g < 3; g++) {
        var r = [];
        for (var c = 0; c < 6; c++) { var ch = g === 2 ? CH[c + 6] : CH[c], v = hv(h, ch, 2 * l + (g === 1 ? 1 : 0)); r.push(v === null || v === 31 ? null : LOD.tName(3 + g, v)); }
        line.push(r);
      }
      rows.push(line);
    }
    return { no: -1, name: label, g: 'tri', P: 6, A: 6, rows: rows, reg: null };
  }
  /* ── v1.12.0 LTPS MUX2（Dual）解碼（Bruce 10/7「選擇到不是 Hand Mode，也要可以顯示它的實際 DataMapping架構列在第三部分」）：
     兩個時槽＝r0_(2l)（T3 表）、r0_(2l+1)（T4 表）；6 條 Data 線 × 2 時槽＝4 pixel 的 12 顆，normal 列每顆剛好一次（zigzag 整體往左 1 顆），
     與 MUX3 用 T3／T4／T5 同一套表（第二組 r2..b3 在 MUX2 列只是第一組的複本，不用）。四列 normal／zigzag × type1／type2 均驗證為 12 顆排列。 */
  function mux2Type(h, label) {
    var rows = [];
    for (var l = 0; l < 2; l++) {
      var line = [];
      for (var g = 0; g < 2; g++) { var r = []; for (var c = 0; c < 6; c++) { var v = hv(h, CH[c], 2 * l + g); r.push(v === null || v === 31 ? null : LOD.tName(3 + g, v)); } line.push(r); }
      rows.push(line);
    }
    return { no: -1, name: label, g: 'dual', P: 6, A: 4, rows: rows, reg: null };
  }
  /* ── 各型號 Auto Mode Type 清單（Hand Mode 關＝依 PANEL_MODE＋SUB_PANEL_MODE 自動選；出處見 datamap-core SUB_PANEL_REG 與 Obsidian 筆記） */
  function fam(model) {
    var M = DM.MODELS[model]; if (!M) return null;
    if (M.kind === 'mnt') return 'mnt';
    return { DAZ6111: 'daz6111', DAZ7353: 'daz7353', DAZ6138: 'daz6138', RM81010: 'e50x', RM81000: 'e50x' }[M.tbl] || null;
  }
  var LTPS = ['LTPS Type 1 Normal MUX3', 'LTPS Type 1 Normal MUX2', 'LTPS Type 1 Z-Zag MUX3', 'LTPS Type 1 Z-Zag MUX2',
              'LTPS Type 2 Normal MUX3', 'LTPS Type 2 Normal MUX2', 'LTPS Type 2 Z-Zag MUX3', 'LTPS Type 2 Z-Zag MUX2'];
  var LTPS_HID = ['14', '15', '16', '17', '18', '19', '20', '21'];
  function ltpsList() { return LTPS.map(function (n, i) { return { name: n, set: { panel: 3, subPanel: i, rd: (i & 1) ? 1 : 2 }, lod: i === 0 ? 17 : null, hid: LTPS_HID[i], mux2: !!(i & 1) }; }); }
  var _lists = {};
  /* ── v1.14.0 DAZ6111／DAZ7353 Auto Type 架構（Bruce 10/7「要知道每一個設定對應的 Type 是什麼，請去查 Model File」）──────────
     model 檔（11 個不同版本全文查過，見 Obsidian「DAZ_DataMapping_Type對照」）只寫名稱：
       DAZ7353_20190418.model:710/717-719  MAIN_PANEL_MODE「0:Normal 1:Zinv 2: HSD」；SUB_PANEL_MODE「Zinv : select type 0 ~7」
         「HSD : 0 : type0 1:type1 2: type2 3: type3 4:type 3-5 5:Z 6:Z2 7:N1 8:N2 9:N3 10:N4」
       DAZ6111_for_FAE_20240509_20240830.model:530/537-539「Zinv : select type 0 1 2 3」「HSD : 0 : type0 … 4:type 3-5」
     接線定義在同一顆 IC 的 datasheet 圖（~/TCON/Datasheet，只讀）：
       DAZ7353_Datasheet_V0.16.pdf 第 6 章 p.14-20：7-1 Normal、7-3 HSD0 (Z1 Type1)、7-4 HSD1 (Type2)、7-5 HSD2 (Type3)、7-6 HSD3 (Type4)、
         7-7 HSD4 (Type5)、7-8 HSD5 (弓)、7-9 HSD6 (Z2)、7-10 HSD7 (N1)、7-11 HSD8 (N2)、7-12 HSD9 (N3)、7-13 HSD10 (N4) ⇒ HSDn＝SUB n；
       DAZ7353_Datasheet_V0.4.pdf p.14-15 ZIGZAG – TYPE1~TYPE4（LR、RL、LLRR、RRLL）＝Zinv type0~3；
       Raydium_DAZ6111_QFN46_Datasheet_V0.6_20210701.pdf p.15-16 HSD Type1~Type5（與 DAZ7353 HSD0~4 同圖）、p.17 Z-inversion Type1（LR）、Type2（LLRR）。
     下列 rows 由圖逐顆 TFT 讀出（index：0＝R0（畫面 R1）、1＝G0、2＝B0、3＝R1…；負數＝前一 pixel，圖上 X dummy 欄＝B-1）。 */
  var DS73 = 'DAZ7353_Datasheet_V0.16.pdf', DS73a = 'DAZ7353_Datasheet_V0.4.pdf', DS61 = 'Raydium_DAZ6111_QFN46_Datasheet_V0.6_20210701.pdf';
  function stepRows(per, add, n) {   // 每條 line：[[上 gate…],[下 gate…]]，per＝一個小週期（D 條數）的 [上,下]，往右每 per 條 +add
    return per.map(function (row) { var u = [], l = []; for (var k = 0; k < n; k++) { var q = Math.floor(k / row.length), c = row[k % row.length]; u.push(c[0] + q * add); l.push(c[1] + q * add); } return [u, l]; });
  }
  var H_U = [0, 3, 4, 7, 8, 11], H_L = [1, 2, 5, 6, 9, 10], A3 = [[0, 2, 4], [1, 3, 5]], B3 = [[1, 3, 5], [0, 2, 4]];
  var DAZ_W = {
    hsd1: { no: -1, name: 'HSD1 (Type2)', g: 'dual', P: 6, A: 4, rows: [[H_U, H_L]], reg: null },
    hsd2: { no: -1, name: 'HSD2 (Type3)', g: 'dual', P: 6, A: 4, rows: [[H_U, H_L], [H_L, H_U]], reg: null },
    hsd5: { no: -1, name: 'HSD5 (弓)', g: 'dual', P: 3, A: 2, rows: [A3, B3], reg: null },
    hsd6: { no: -1, name: 'HSD6 (Z2)', g: 'dual', P: 3, A: 2, rows: [A3, A3, B3, B3], reg: null },
    n1: { no: -1, name: 'HSD7 (N1)', g: 'dual', P: 6, A: 4, rows: stepRows([[[0, 2], [1, 3]], [[-1, 1], [0, 2]]], 4, 6), reg: null },
    n2: { no: -1, name: 'HSD8 (N2)', g: 'dual', P: 6, A: 4, rows: stepRows([[[1, -1], [2, 0]], [[2, 0], [3, 1]]], 4, 6), reg: null },
    n3: { no: -1, name: 'HSD9 (N3)', g: 'dual', P: 12, A: 8, rows: stepRows([[[0, 4], [1, 5], [2, 6], [3, 7]], [[-1, 3], [0, 4], [1, 5], [2, 6]]], 8, 12), reg: null },
    n4: { no: -1, name: 'HSD10 (N4)', g: 'dual', P: 12, A: 8, rows: stepRows([[[3, -1], [4, 0], [5, 1], [6, 2]], [[4, 0], [5, 1], [6, 2], [7, 3]]], 8, 12), reg: null }
  };
  /* SUB n → [datasheet 名稱, 接線（LOD 編號或 DAZ_W 鍵）, 出處頁, 同義] */
  var DAZ_HSD = [
    ['HSD0 (Z1 Type1)', 22, 'p.15 7-3', '＝E50x HSD Type 1＝Line OD 22（HSD+RBG/GRB）'],
    ['HSD1 (Type2)', 'hsd1', 'p.15 7-4', ''],
    ['HSD2 (Type3)', 'hsd2', 'p.16 7-5', ''],
    ['HSD3 (Type4)', 24, 'p.16 7-6', '＝E50x HSD Type 4＝Line OD 24（HSD+RRB/GBG）'],
    ['HSD4 (Type5)', 27, 'p.17 7-7', '＝E50x HSD Type 3-5＝Line OD 27（HSD+GGB/RBR+2RRRL）'],
    ['HSD5 (弓)', 'hsd5', 'p.17 7-8', ''],
    ['HSD6 (Z2)', 'hsd6', 'p.18 7-9', ''],
    ['HSD7 (N1)', 'n1', 'p.18 7-10', ''],
    ['HSD8 (N2)', 'n2', 'p.19 7-11', ''],
    ['HSD9 (N3)', 'n3', 'p.19 7-12', ''],
    ['HSD10 (N4)', 'n4', 'p.20 7-13', '']
  ];
  var ZZ_NM = ['LR', 'RL', 'LLRR', 'RRLL'];
  function dazList(f) {
    var L = [], n6111 = f === 'daz6111';
    L.push({ name: 'Normal', set: { panel: 0, subPanel: 0 }, lod: 0, src: DS73 + ' p.14 7-1 Normal data mapping（＝Line OD 0）' + (n6111 ? '；DAZ6111 model 的 MAIN_PANEL_MODE 寫法與 DAZ7353 相同（0:Normal 1:Zinv 2: HSD）' : '') });
    for (var a = 0; a < (n6111 ? 4 : 8); a++) {
      if (a < 4) L.push({ name: 'Zinv type' + a, set: { panel: 1, subPanel: a }, lod: a + 1,
        src: DS73a + ' p.' + (a < 2 ? 14 : 15) + ' ZIGZAG – TYPE' + (a + 1) + '＝' + ZZ_NM[a] + '（＝E50x Z-Zag Type ' + (a + 1) + '＝Line OD ' + (a + 1) + '）' + (n6111 ? '；' + DS61 + ' p.17 Z-inversion Type1＝LR、Type2＝LLRR 同組' : '') });
      else L.push({ name: 'Zinv type' + a, set: { panel: 1, subPanel: a }, lod: null,
        why: 'DAZ7353 model 檔只寫「Zinv : select type 0 ~7」；datasheet V0.4 只畫 ZIGZAG TYPE1~4（＝type0~3）、V0.16 只畫一張通用 Zigzag 圖，type4~7 查無接線定義（查過：11 個 DAZ model 檔、DAZ7353 datasheet V0.4／V0.16、DAZ6111 datasheet V0.6、Raydium_TCON_DataMapping查詢 xlsx、Set_6111_Timing pptx）' });
    }
    DAZ_HSD.slice(0, n6111 ? 5 : 11).forEach(function (d, i) {
      var nm = ['type0', 'type1', 'type2', 'type3', 'type 3-5', 'Z', 'Z2', 'N1', 'N2', 'N3', 'N4'][i];
      var e = { name: 'HSD ' + nm, set: { panel: 2, subPanel: i }, ds: d[0],
        src: (n6111 ? DS61 + ' HSD Type' + (i + 1) + '（同 ' + DS73 + ' ' + d[2] + ' ' + d[0] + '）' : DS73 + ' ' + d[2] + ' ' + d[0]) + (d[3] ? ' ' + d[3] : '') };
      if (typeof d[1] === 'number') e.lod = d[1]; else { e.lod = null; e.wire = DAZ_W[d[1]]; }
      L.push(e);
    });
    return L;
  }
  function list(model) {
    var f = fam(model); if (!f) return [];
    if (_lists[f]) return _lists[f];
    var L = [];
    if (f === 'e50x' || f === 'daz6138') {
      L.push({ name: 'Normal', set: { panel: 0, subPanel: 0, rd: 0 }, lod: 0, hid: '1' });
      for (var z = 1; z <= (f === 'e50x' ? 8 : 4); z++) L.push({ name: 'Z-Zag Type ' + z, set: { panel: 1, subPanel: z - 1, rd: 0 }, lod: z, hid: String(z + 1) });
      L.push({ name: 'HSD Type 1', set: { panel: 2, subPanel: 0, rd: 1 }, lod: 22, hid: '10' });
      L.push({ name: 'HSD Type 4', set: { panel: 2, subPanel: 1, rd: 1 }, lod: 24, hid: '11' });
      L.push({ name: 'HSD Type 3-5', set: { panel: 2, subPanel: 2, rd: 1 }, lod: 27, hid: '12' });
      if (f === 'e50x') L.push({ name: 'HSD Type 4+Z-Zag(BOE)', set: { panel: 2, subPanel: 3, rd: 1 }, lod: 25, hid: '13' });
      L = L.concat(ltpsList());
    } else if (f === 'daz6111' || f === 'daz7353') {
      L = dazList(f);
    } else {   // mnt：原廠 RT7 清單中 force_sel_en＝0 的樣式
      var HID = { 0: '1', 17: '14', 22: '10', 24: '11', 25: '13', 26: '13', 27: '12' };
      DM.PRESETS.forEach(function (p, pi) {
        if (p.set.hand !== 0) return;
        var n = +/^\((\d+)\)/.exec(p.name)[1], mir = !!p.set.mirror, hid = n >= 1 && n <= 8 ? String(n + 1) : (n >= 9 && n <= 16 ? String(n + 14) : (n === 0 && mir ? '22' : HID[n]));
        L.push({ name: p.name, set: p.set, lod: n, hid: hid, preset: pi, mirror: mir });
      });
    }
    _lists[f] = L;
    return L;
  }
  var KEYS = { mnt: ['panel', 'subPanel', 'mirror', 'chrb'], other: ['panel', 'subPanel'] };
  function match(model, s) {
    var L = list(model), f = fam(model), keys = KEYS[f === 'mnt' ? 'mnt' : 'other'];
    for (var i = 0; i < L.length; i++) {
      var e = L[i], ok = keys.every(function (k) { return ((s[k] | 0) === ((e.set[k] === undefined ? 0 : e.set[k]) | 0)); });
      if (ok && f !== 'mnt' && e.set.panel === 0 && (s.subPanel | 0) !== 0) ok = false;
      if (ok) return i;
    }
    return -1;
  }
  /* v1.12.0 Hand 關、但 panel／sub／mirror／chrb 組合不在清單（例：EM01 B19 code panel 0＋sub 0＋mirror 1＋chrb 1）：
     依 panel／sub 找同一個 Type（mirror 相同者優先），mirror 不影響接線（Line OD 0、9~16 與 0、1~8 接線相同，只是輸入資料左右反向），
     chrb 不同 ⇒ R、B 對換（依據：RT7 (25)→(26) RB_chg 只差 chrb，Line OD 25／26 接線正好 R↔B）。回傳 { i, rb } 或 null。 */
  function matchLoose(model, s) {
    var L = list(model), best = -1;
    for (var i = 0; i < L.length; i++) {
      var e = L[i]; if ((s.panel | 0) !== (e.set.panel | 0) || (s.subPanel | 0) !== ((e.set.subPanel | 0))) continue;
      if (best < 0) best = i;
      if (fam(model) === 'mnt' && (s.mirror | 0) === (e.set.mirror | 0) && (s.chrb | 0) === (e.set.chrb | 0)) { best = i; break; }
      if (fam(model) === 'mnt' && (s.mirror | 0) === (e.set.mirror | 0) && (L[best].set.mirror | 0) !== (s.mirror | 0)) best = i;
    }
    if (best < 0) return null;
    return { i: best, rb: fam(model) === 'mnt' && (s.chrb | 0) !== (L[best].set.chrb | 0) };
  }
  function rbIdx(k) { if (k === null || k === undefined) return k; var m = ((k % 3) + 3) % 3; return m === 1 ? k : k - m + (2 - m); }
  function rbSwap(t) {
    var o = {}; for (var k in t) o[k] = t[k];
    o.rows = t.rows.map(function (line) { return line.map(function (g) { return g.map(rbIdx); }); });
    o.reg = null; o.no = -1; o.name = t.name + ' + R↔B（chrb）';
    if (t.L) o.L = t.L.map(function (r) { return r.map(function (x) { return x.replace(/[RB]/g, function (c) { return c === 'R' ? 'B' : 'R'; }); }); });
    return o;
  }
  function apply(model, s, i) {
    var e = list(model)[i]; if (!e) return s;
    if (e.preset !== undefined) return DM.applyPreset(model, s, e.preset);
    var ns = DM.cloneState(s);
    Object.keys(e.set).forEach(function (k) { if (DM.fieldById(model, k)) ns[k] = e.set[k]; });
    return ns;
  }
  /* 這個 Type 的接線（給 ③ 畫）：Line OD 反推接線（datamap-lod.js）或隱藏表解碼；沒有 ⇒ null */
  function wiring(e) {
    if (!e) return null;
    if (e.wire) return e.wire;
    if (e.lod !== null && e.lod !== undefined && LOD.TYPES[e.lod]) return LOD.TYPES[e.lod];
    if (e.hid && /mux3$/.test(HIDDEN[e.hid].name)) return mux3Type(HIDDEN[e.hid], e.name);
    if (e.hid && /mux2$/.test(HIDDEN[e.hid].name)) return mux2Type(HIDDEN[e.hid], e.name);
    return null;
  }
  function fixesFor(e) { return e && e.hid && FIXES[e.mirror ? e.hid : e.hid] ? { row: HIDDEN[e.hid], list: FIXES[e.hid] } : null; }
  /* 「未知（0xNN）」：PANEL_MODE 所在的那個 byte */
  function rawByte(model, s) {
    var f = DM.fieldById(model, 'panel'), sp = DM.fieldById(model, 'subPanel'), b = 0;
    [f, sp].forEach(function (fd) { if (!fd) return; var p = fd.parts[0]; b |= ((s[fd.id] | 0) << p[2]) & ((1 << (p[1] + 1)) - (1 << p[2])); });
    return b;
  }
  /* Hand Mode 開（MNT）：② 的 force_sel 值若＝原廠 RT7 某個 Manual（force_sel_en＝1）樣式，回傳該樣式與「Panel Mode 應設值」的比對
     （RApp_TX.h:530-568；RegSet RApp_TX.cpp:10873 會一併寫 rd／panel／ltps_zz／sub／mirror／chrb／force_de／read_rvs） */
  var PM_KEYS = ['rd', 'panel', 'ltpsZz', 'subPanel', 'mirror', 'chrb', 'deEn', 'deSel', 'rvsL', 'rvsH'];
  function manualMatch(model, s) {
    if (fam(model) !== 'mnt') return null;
    for (var i = 0; i < DM.PRESETS.length; i++) {
      var p = DM.PRESETS[i]; if (p.set.hand !== 1) continue;
      var ids = Object.keys(p.set).filter(function (k) { return /^[cx]\d+$/.test(k); });
      if (!ids.length || !ids.every(function (k) { return (s[k] | 0) === p.set[k]; })) continue;
      var diff = PM_KEYS.filter(function (k) { return p.set[k] !== undefined && DM.fieldById(model, k) && (s[k] | 0) !== (p.set[k] & ((1 << DM.fieldById(model, k).bits) - 1)); });
      return { preset: i, name: p.name, set: p.set, diff: diff };
    }
    return null;
  }
  /* ── v1.11.0 Line OD 跟著 RT7（Bruce 10/7「以 RT7 為主…實際上應該要將 RT7 跟 LineOD 設成是一樣的才對」）──────────────
     應有的 Line OD：
       ・Hand 關（Auto）：Auto Type 對應的 Line OD Type（Line OD n ↔ RT7 (n)；(0) Normal／Mirror 都是 0）。
       ・Hand 開：由 ② 的 force_sel 解出實際接線（Single T2；Dual 上 T2／下 T3；HSD 8-pixel 的 D7~D12＝第二組 T4／T5；
         4line,4pixel 的 Line 3、4＝第二組；Tri 三個時槽 T3／T4／T5），再用 LOD.autoReg 反推 48 值，最後比對是哪個 Line OD Type。
         原廠 (30)／(31) 名稱與值對調的問題因此自動按接線交叉；(32)（要 driver 對調）先做 D1↔D3、D4↔D6 再反推（面板實際接線）。
       ・算不出來（Tri 以外的 Gate 組合不符、非標準值、找不到合法的 de）⇒ ok:false，不寫 LOD。 */
  /* v1.12.0 單一 RT7 Type Select 目前對應哪一項（DM.PRESETS 索引；-1 ⇒ User define）：
     Hand 關 ⇒ Auto 清單比對（panel／sub／mirror／chrb）；Hand 開 ⇒ 兩組 force_sel 與 Panel Mode 都和某個 Manual 樣式完全相同 */
  function rt7Match(model, s) {
    if (fam(model) !== 'mnt') return -1;
    if (!(s.hand | 0)) { var i = match(model, s); return i >= 0 ? list(model)[i].preset : -1; }
    var mm = manualMatch(model, s); return mm && !mm.diff.length ? mm.preset : -1;
  }
  function lodSupported(model) { return !!(DM.MODELS[model] && DM.MODELS[model].lod); }
  function lodOf(s) {
    var r = { de: s.lodDe | 0, spec: s.lodSpec | 0, line: s.lodLine | 0, pix: s.lodPix | 0, r: [], g: [], b: [] };
    for (var q = 0; q < 48; q++) r[['r', 'g', 'b'][Math.floor(q / 16)]].push(s['lodM' + q] | 0);
    return r;
  }
  function lodSet(s, reg) {
    var ns = DM.cloneState(s); ns.lodDe = reg.de; ns.lodSpec = reg.spec | 0; ns.lodLine = reg.line; ns.lodPix = reg.pix;
    for (var q = 0; q < 48; q++) ns['lodM' + q] = reg[['r', 'g', 'b'][Math.floor(q / 16)]][q % 16];
    return ns;
  }
  var SWAP6 = [2, 1, 0, 5, 4, 3];
  function wiringFromState(model, s, swap) {
    var g = DM.gateOf(model, s), R = DM.secondSetRule(model, s), tn = function (T, v) { return v === 31 ? null : LOD.tName(T, v); };
    var c = function (slot, ch) { return s['c' + (slot * 6 + ch)] | 0; }, x = function (slot, ch) { return s['x' + (slot * 6 + ch)] | 0; };
    var bad = false, lin = function (T, v) { if (v === 31) return null; var l = tn(T, v); if (l === null) bad = true; return l; };
    var rows = [], P = 6, A, G;
    if (g === 'single') {
      G = 1; A = 2;
      for (var sl = 0; sl < 4; sl++) { var r = []; for (var h = 0; h < 6; h++) r.push(lin(2, c(sl, h))); rows.push([r]); }
      if (R.meaning === 'line58') for (var s2 = 0; s2 < 4; s2++) { var r2 = []; for (var h2 = 0; h2 < 6; h2++) r2.push(lin(2, x(s2, h2))); rows.push([r2]); }
    } else if (g === 'dual') {
      G = 2; A = 4;
      var p8 = R.meaning === 'pix58';
      if (p8) { P = 12; A = 8; }
      for (var l = 0; l < 2; l++) {
        var line = [];
        for (var gi = 0; gi < 2; gi++) {
          var rr = []; for (var hh = 0; hh < 6; hh++) rr.push(lin(2 + gi, c(2 * l + gi, hh)));
          if (p8) for (var h3 = 0; h3 < 6; h3++) rr.push(lin(4 + gi, x(2 * l + gi, h3)));
          line.push(rr);
        }
        rows.push(line);
      }
      if (R.meaning === 'row34') for (var l2 = 0; l2 < 2; l2++) { var ln = []; for (var g2 = 0; g2 < 2; g2++) { var r3 = []; for (var h4 = 0; h4 < 6; h4++) r3.push(lin(2 + g2, x(2 * l2 + g2, h4))); ln.push(r3); } rows.push(ln); }
    } else if (g === 'tri') {
      G = 3; A = 6;
      for (var l3 = 0; l3 < 2; l3++) {
        var t3 = [];
        for (var g3 = 0; g3 < 3; g3++) { var r4 = []; for (var h5 = 0; h5 < 6; h5++) r4.push(lin(3 + g3, g3 === 2 ? x(2 * l3, h5) : c(2 * l3 + (g3 === 1 ? 1 : 0), h5))); t3.push(r4); }
        rows.push(t3);
      }
    } else return { ok: false, why: 'gate' };
    if (bad) return { ok: false, why: 'code' };
    /* X（31）補位：同一列其他 Data 線是等距（如 Tri 每條差 1 pixel）時，依同一間距補上。原廠 Tri+ZZ (18)~(20) 的 B-1 在 T5 表沒有 code，寫 31 */
    var filled = 0;
    rows.forEach(function (ln) { ln.forEach(function (r) {
      var idx = []; r.forEach(function (v, i) { if (v !== null) idx.push(i); });
      if (idx.length < 3 || idx.length === r.length) return;
      var d = (r[idx[1]] - r[idx[0]]) / (idx[1] - idx[0]);
      if (d !== Math.round(d) || !idx.every(function (i, k) { return !k || r[i] - r[idx[k - 1]] === d * (i - idx[k - 1]); })) return;
      r.forEach(function (v, i) { if (v === null) { r[i] = r[idx[0]] + d * (i - idx[0]); filled++; } });
    }); });
    if (swap) rows = rows.map(function (line) { return line.map(function (r) { return r.map(function (v, i) { return r[6 * Math.floor(i / 6) + SWAP6[i % 6]]; }); }); });
    /* 最小的 line 循環（原廠 1 line 的 Type 會把兩列寫成一樣） */
    var n = rows.length, key = function (ln) { return JSON.stringify(ln); };
    for (var Lm = 1; Lm <= n; Lm++) if (n % Lm === 0 && rows.every(function (ln, i) { return key(ln) === key(rows[i % Lm]); })) { rows = rows.slice(0, Lm); break; }
    return { ok: true, filled: filled, t: { g: g, P: P, A: A, rows: rows, mir: !!s.mirror } };
  }
  function expectedLod(model, s) {
    if (!lodSupported(model)) return { ok: false, why: 'model' };
    if (!s.hand) {
      var i = match(model, s), e = i >= 0 ? list(model)[i] : null;
      if (!e || e.lod === null || e.lod === undefined) return { ok: false, why: 'auto' };
      return { ok: true, type: e.lod, reg: LOD.TYPES[e.lod].reg, src: 'auto', from: e.name };
    }
    var mm = manualMatch(model, s), swap = !!(mm && /^\(32\)/.test(mm.name));
    var w = wiringFromState(model, s, swap); if (!w.ok) return { ok: false, why: w.why };
    var reg = LOD.autoReg(w.t); if (!reg) return { ok: false, why: 'de' };
    return { ok: true, type: LOD.typeOfReg(reg), reg: reg, src: 'wiring', from: mm ? mm.name : null, swap: swap, filled: w.filled };
  }
  function lodDiff(a, b) {
    var out = [];
    ['de', 'spec', 'line', 'pix'].forEach(function (k) { if ((a[k] | 0) !== (b[k] | 0)) out.push({ k: k, from: a[k] | 0, to: b[k] | 0 }); });
    ['r', 'g', 'b'].forEach(function (c) { for (var i = 0; i < 16; i++) if (a[c][i] !== b[c][i]) out.push({ k: c + '_' + i, from: a[c][i], to: b[c][i] }); });
    return out;
  }
  /* 一致性：{ state:'na'|'ok'|'diff'|'fail', cur:{reg,type}, exp } */
  function lodCheck(model, s) {
    if (!lodSupported(model)) return { state: 'na' };
    var cur = lodOf(s), ct = LOD.typeOfReg(cur), exp = expectedLod(model, s);
    if (!exp.ok) return { state: 'fail', cur: cur, curType: ct, exp: exp };
    var d = lodDiff(cur, exp.reg);
    return { state: d.length ? 'diff' : 'ok', cur: cur, curType: ct, exp: exp, diff: d };
  }
  function lodApply(model, s) { var e = expectedLod(model, s); return e.ok ? lodSet(s, e.reg) : null; }
  var API = { HIDDEN: HIDDEN, manualMatch: manualMatch, rt7Match: rt7Match, matchLoose: matchLoose, DAZ_W: DAZ_W, rbSwap: rbSwap, mux2Type: mux2Type, lodSupported: lodSupported, lodOf: lodOf, lodSet: lodSet, wiringFromState: wiringFromState, expectedLod: expectedLod, lodCheck: lodCheck, lodApply: lodApply, PM_KEYS: PM_KEYS, FIXES: FIXES, ZZ_SEQ: ZZ_SEQ, fam: fam, list: list, match: match, apply: apply, wiring: wiring, fixesFor: fixesFor, mux3Type: mux3Type, rawByte: rawByte };
  if (typeof module === 'object' && module.exports) module.exports = API; else root.TCONDataMapAuto = API;
})(typeof window !== 'undefined' ? window : this);
