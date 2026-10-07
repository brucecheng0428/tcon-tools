/* ═══════════════════════════════════════════════════════════════════════════
   datamap-lod.js — EM02 原廠 Line OD「Mapping」分頁 Type Select（0~32）反推的接線（v1.7.0，測試用，不與 code 連動）
   給 datamap.html ③ 預覽的「測試：Line OD Type」下拉與 tools/check_datamap_lod.js 共用；瀏覽器 window.TCONDataMapLOD，node module.exports。

   出處（原廠檔只讀）：
     ・選項與暫存器值：VCL_TV_TCON_EM02_Tool/App/Table/RApp_Table.h:933-1018 stLOD_DataType[]（33 筆＋User define）
       欄位 de／spec_line／line／pix／r_0..r_15／g_0..g_15／b_0..b_15；LOD_DATA_MAPPTING_TYPE_MAX＝33（RApp_Table.h:62）
     ・UI：SDIMAIN.dfm:6622 TabSheet_Line_OD_Mapping、:6802 ListBox_LOD_mapping_type、Image4；清單建立 RApp_Table.cpp:11880-11884
       （最後一項 "User define"）；點選 RApp_Table.cpp:10937 RApp_Table_LOD_ListBox_onClick（畫 VirtualImageList1 第 idx 張、
       把 stLOD_DataType[idx] 填進右側 Register Table）
     ・示意圖：VCL_TV_TCON_EM02_Tool/Image/LineOD/<n>.*.png（ImageCollection1，SDIMAIN.dfm:160206）
     ・暫存器位址（BK_LOD＝0x0900，RApp_Common.h:67；Table_LOD_Reg_st 以 gcc 位元欄位排法推算）：
       0x09C7[2:0] reg_lod_map_de、0x09C7[5:4] reg_lod_map_spec_line、0x09C8[3:0] reg_lod_map_line、0x09C8[6:4] reg_lod_map_pix、
       0x09C9..0x09F8 reg_lod_map_r_0..b_15（各 6 bit；0~17＝前一條 gate 列的資料、18~35（以上）＝同一 line 前一條 gate、63＝不管）

   反推方法（tools/check_datamap_lod.js 逐 Type 驗算）：
     原廠圖每一欄＝一條 Data 線（CH0＝Data 1），每一列＝一條 gate 列，格子＝該 Data 線在這條 gate 列送的子像素。
     Line OD 表的值＝「這顆子像素所在的 Data 線，上一條 gate 列送的是誰」：
       上一條 gate 屬上一條 line ⇒ 值＝3×(de−dx)＋色；屬同一條 line ⇒ 值＝18＋3×(de＋1−dx)＋色（dx＝那顆的 pixel − 自己的 pixel）。
     索引 ＝ line 相位×(pix＋1)＋pixel 相位。用圖讀出的接線算回 48 個值，和原廠表逐格比對。

   每個 Type：
     g    ＝ 'single'｜'dual'｜'tri'（每條 line 的 gate 列數 1／2（上、下）／3（R、G、B 列））
     P、A ＝ 每 P 條 Data 線往右重複一次、名稱往右平移 A 個 pixel
     L    ＝ 每條 line 的 gate 列；每列是 CH0..CH(P−1) 的名稱（實體位置命名：R1 G1 B1 R2…，-1 ＝ R1 左邊那個 pixel）
     mir  ＝ 原廠圖用左右反向的名稱（R4 G4 B4 R3…）；接線結構同對應的非 Mirror Type，驗算時把 pixel 反向
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var N = 'R1 G1 B1', S = 'B-1 R1 G1';   // Single 條紋：不位移（L）／往右一條（R）
  function zz(seq) { return seq.split('').map(function (c) { return [c === 'L' ? N : S]; }); }
  var VREG = [
    '0 0 0 0|0 63 63 63 63 63 63 63 63 63 63 63 63 63 63 63|1 63 63 63 63 63 63 63 63 63 63 63 63 63 63 63|2 63 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 0|8 4 63 63 63 63 63 63 63 63 63 63 63 63 63 63|3 5 63 63 63 63 63 63 63 63 63 63 63 63 63 63|4 0 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 0|4 8 63 63 63 63 63 63 63 63 63 63 63 63 63 63|5 3 63 63 63 63 63 63 63 63 63 63 63 63 63 63|0 4 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|8 3 4 3 63 63 63 63 63 63 63 63 63 63 63 63|3 4 5 4 63 63 63 63 63 63 63 63 63 63 63 63|4 5 0 5 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|4 3 8 3 63 63 63 63 63 63 63 63 63 63 63 63|5 4 3 4 63 63 63 63 63 63 63 63 63 63 63 63|0 5 4 5 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|3 4 3 8 63 63 63 63 63 63 63 63 63 63 63 63|4 5 4 3 63 63 63 63 63 63 63 63 63 63 63 63|5 0 5 4 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|3 8 3 4 63 63 63 63 63 63 63 63 63 63 63 63|4 3 4 5 63 63 63 63 63 63 63 63 63 63 63 63|5 4 5 0 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 7 0|8 3 3 3 4 3 3 3 63 63 63 63 63 63 63 63|3 4 4 4 5 4 4 4 63 63 63 63 63 63 63 63|4 5 5 5 0 5 5 5 63 63 63 63 63 63 63 63',
    '1 0 7 0|4 3 3 3 8 3 3 3 63 63 63 63 63 63 63 63|5 4 4 4 3 4 4 4 63 63 63 63 63 63 63 63|0 5 5 5 4 5 5 5 63 63 63 63 63 63 63 63',
    '1 0 1 0|2 4 63 63 63 63 63 63 63 63 63 63 63 63 63 63|3 5 63 63 63 63 63 63 63 63 63 63 63 63 63 63|4 6 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 0|4 2 63 63 63 63 63 63 63 63 63 63 63 63 63 63|5 3 63 63 63 63 63 63 63 63 63 63 63 63 63 63|6 4 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|2 3 4 3 63 63 63 63 63 63 63 63 63 63 63 63|3 4 5 4 63 63 63 63 63 63 63 63 63 63 63 63|4 5 6 5 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|4 3 2 3 63 63 63 63 63 63 63 63 63 63 63 63|5 4 3 4 63 63 63 63 63 63 63 63 63 63 63 63|6 5 4 5 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|3 4 3 2 63 63 63 63 63 63 63 63 63 63 63 63|4 5 4 3 63 63 63 63 63 63 63 63 63 63 63 63|5 6 5 4 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 3 0|3 2 3 4 63 63 63 63 63 63 63 63 63 63 63 63|4 3 4 5 63 63 63 63 63 63 63 63 63 63 63 63|5 4 5 6 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 7 0|2 3 3 3 4 3 3 3 63 63 63 63 63 63 63 63|3 4 4 4 5 4 4 4 63 63 63 63 63 63 63 63|4 5 5 5 6 5 5 5 63 63 63 63 63 63 63 63',
    '1 0 7 0|4 3 3 3 2 3 3 3 63 63 63 63 63 63 63 63|5 4 4 4 3 4 4 4 63 63 63 63 63 63 63 63|6 5 5 5 4 5 5 5 63 63 63 63 63 63 63 63',
    '0 0 0 0|2 63 63 63 63 63 63 63 63 63 63 63 63 63 63 63|21 63 63 63 63 63 63 63 63 63 63 63 63 63 63 63|22 63 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 0|8 2 63 63 63 63 63 63 63 63 63 63 63 63 63 63|21 27 63 63 63 63 63 63 63 63 63 63 63 63 63 63|28 22 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 0|8 2 63 63 63 63 63 63 63 63 63 63 63 63 63 63|24 24 63 63 63 63 63 63 63 63 63 63 63 63 63 63|25 25 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 0|2 8 63 63 63 63 63 63 63 63 63 63 63 63 63 63|24 24 63 63 63 63 63 63 63 63 63 63 63 63 63 63|25 25 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '4 0 0 5|0 0 39 39 39 39 63 63 63 63 63 63 63 63 63 63|1 1 40 40 40 40 63 63 63 63 63 63 63 63 63 63|2 2 41 41 41 41 63 63 63 63 63 63 63 63 63 63',
    '1 0 0 1|4 29 63 63 63 63 63 63 63 63 63 63 63 63 63 63|24 5 63 63 63 63 63 63 63 63 63 63 63 63 63 63|0 25 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 1|8 29 0 29 63 63 63 63 63 63 63 63 63 63 63 63|24 3 24 1 63 63 63 63 63 63 63 63 63 63 63 63|4 25 2 25 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 0 1|4 8 63 63 63 63 63 63 63 63 63 63 63 63 63 63|24 26 63 63 63 63 63 63 63 63 63 63 63 63 63 63|21 4 63 63 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 1|7 7 5 4 63 63 63 63 63 63 63 63 63 63 63 63|24 26 24 26 63 63 63 63 63 63 63 63 63 63 63 63|21 8 21 1 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 1|23 6 23 1 63 63 63 63 63 63 63 63 63 63 63 63|26 24 26 24 63 63 63 63 63 63 63 63 63 63 63 63|7 7 3 4 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 1|29 25 29 25 63 63 63 63 63 63 63 63 63 63 63 63|0 0 3 8 63 63 63 63 63 63 63 63 63 63 63 63|25 2 25 3 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 1|4 25 0 25 63 63 63 63 63 63 63 63 63 63 63 63|26 5 26 1 63 63 63 63 63 63 63 63 63 63 63 63|6 27 2 27 63 63 63 63 63 63 63 63 63 63 63 63',
    '1 0 1 7|29 25 5 25 5 25 29 25 29 25 6 25 6 25 29 25|0 5 0 5 0 0 0 0 3 8 8 8 8 8 3 8|25 21 25 21 25 2 25 2 25 21 25 21 25 3 25 3',
    '1 0 3 3|8 6 25 6 25 29 25 29 25 6 8 6 25 29 25 29|24 26 8 26 5 0 5 1 8 26 24 26 5 1 5 0|21 3 21 3 1 25 1 25 21 3 21 3 1 25 1 25',
    '2 0 3 3|6 21 33 6 0 21 33 12 21 6 6 33 21 0 12 33|22 7 7 34 22 1 13 34 7 22 34 7 1 22 34 13|8 23 35 8 2 23 35 14 23 8 8 35 23 2 14 35',
    '1 0 1 1|25 29 25 29 63 63 63 63 63 63 63 63 63 63 63 63|8 3 0 0 63 63 63 63 63 63 63 63 63 63 63 63|3 25 2 25 63 63 63 63 63 63 63 63 63 63 63 63'
  ];
  var T = [
    { name: '0.Normal/Mirror', img: '0.Normal_Mirror', g: 'single', P: 3, A: 1, L: [[N]], d: 'Single Gate 1D1G，每條 Data 線只接正下方那一顆（R1 G1 B1 R2…），兩列相同。Mirror 只是資料左右反向，接線相同。' },
    { name: '1.ZZ+LR', img: '1.Zig-Zag_LR', g: 'single', P: 3, A: 1, L: zz('LR'), d: 'Single Gate Zig-Zag：2N 列接右邊（D1→R1），2N+1 列整排往右一條（D1→B-1、D2→R1）。' },
    { name: '2.ZZ+RL', img: '2.Zig-Zag_RL', g: 'single', P: 3, A: 1, L: zz('RL'), d: 'Zig-Zag：2N 列往右一條、2N+1 列不位移（與 1 相反）。' },
    { name: '3.ZZ+LLRR', img: '3.Zig-Zag_LLRR', g: 'single', P: 3, A: 1, L: zz('LLRR'), d: 'Zig-Zag 4 列一循環：4N、4N+1 不位移，4N+2、4N+3 往右一條。' },
    { name: '4.ZZ+RRLL', img: '4.Zig-Zag_RRLL', g: 'single', P: 3, A: 1, L: zz('RRLL'), d: 'Zig-Zag 4 列一循環：4N、4N+1 往右一條，4N+2、4N+3 不位移。' },
    { name: '5.ZZ+LRRL', img: '5.Zig-Zag_LRRL', g: 'single', P: 3, A: 1, L: zz('LRRL'), d: 'Zig-Zag 4 列一循環：L、R、R、L。', warn: '原廠圖 4N、4N+3 兩列用了 Mirror 的名稱（R4 G4 B4…），應是畫圖時複製錯；暫存器值與 L、R、R、L 吻合。' },
    { name: '6.ZZ+RLLR', img: '6.Zig-Zag_RLLR', g: 'single', P: 3, A: 1, L: zz('RLLR'), d: 'Zig-Zag 4 列一循環：R、L、L、R。', warn: '原廠圖 4N+1、4N+2 兩列用了 Mirror 的名稱（R4 G4 B4…），應是畫圖時複製錯；暫存器值與 R、L、L、R 吻合。' },
    { name: '7.ZZ+LLLLRRRR', img: '7.Zig-ZagLLLLRRRR', g: 'single', P: 3, A: 1, L: zz('LLLLRRRR'), d: 'Zig-Zag 8 列一循環：前 4 列不位移、後 4 列往右一條。' },
    { name: '8.ZZ+RRRRLLLL', img: '8.Zig-ZagRRRRLLLL', g: 'single', P: 3, A: 1, L: zz('RRRRLLLL'), d: 'Zig-Zag 8 列一循環：前 4 列往右一條、後 4 列不位移。' },
    { name: '9.ZZ+Mir+LR', img: '9.Zig-Zag+Mirror_LR', g: 'single', P: 3, A: 1, L: zz('LR'), mir: 1, d: '同 1（ZZ+LR）的接線；Mirror＝輸入資料左右反向（原廠圖名稱 R4 G4 B4 R3…）。' },
    { name: '10.ZZ+Mir+RL', img: '10.Zig-Zag+Mirror_RL', g: 'single', P: 3, A: 1, L: zz('RL'), mir: 1, d: '同 2 的接線＋Mirror。' },
    { name: '11.ZZ+Mir+LLRR', img: '11.Zig-Zag+Mirror_LLRR', g: 'single', P: 3, A: 1, L: zz('LLRR'), mir: 1, d: '同 3 的接線＋Mirror。' },
    { name: '12.ZZ+Mir+RRLL', img: '12.Zig-Zag+Mirror_RRLL', g: 'single', P: 3, A: 1, L: zz('RRLL'), mir: 1, d: '同 4 的接線＋Mirror。' },
    { name: '13.ZZ+Mir+LRRL', img: '13.Zig-Zag+Mirror_LRRL', g: 'single', P: 3, A: 1, L: zz('LRRL'), mir: 1, d: '同 5 的接線＋Mirror。' },
    { name: '14.ZZ+Mir+RLLR', img: '14.Zig-Zag+Mirror_RLLR', g: 'single', P: 3, A: 1, L: zz('RLLR'), mir: 1, d: '同 6 的接線＋Mirror。' },
    { name: '15.ZZ+Mir+LLLLRRRR', img: '15.Zig-Zag+Mirror_LLLLRRRR', g: 'single', P: 3, A: 1, L: zz('LLLLRRRR'), mir: 1, d: '同 7 的接線＋Mirror。' },
    { name: '16.ZZ+Mir+RRRRLLLL', img: '16.Zig-Zag+Mirror_RRRRLLLL', g: 'single', P: 3, A: 1, L: zz('RRRRLLLL'), mir: 1, d: '同 8 的接線＋Mirror。' },
    { name: '17.Tri', img: '17.Tri-gate', g: 'tri', P: 1, A: 1, L: [['R1', 'G1', 'B1']], d: 'Tri-Gate：一個 pixel 的 R、G、B 上下疊成三條 gate 列，Data n 只接第 n 個 pixel 的三顆。' },
    { name: '18.Tri+ZZ+LR', img: '18.Tri-gate+Zig-Zag_LR', g: 'tri', P: 1, A: 1, L: [['R1', 'G-1', 'B1'],['R-1', 'G1', 'B-1']], d: 'Tri-Gate＋Zig-Zag：2N 的 R、B 列不位移、G 列往右一條；2N+1 相反。' },
    { name: '19.Tri+ZZ+LLLRRR', img: '19.Tri-gate+Zig-Zag_LLLRRR_RRRLLL', g: 'tri', P: 1, A: 1, L: [['R1', 'G1', 'B1'], ['R-1', 'G-1', 'B-1']], d: 'Tri-Gate＋Zig-Zag：2N 三列都不位移，2N+1 三列都往右一條。' },
    { name: '20.Tri+ZZ+RRRLLL', img: '20.Tri-gate+Zig-Zag_LLLRRR_RRRLLL', g: 'tri', P: 1, A: 1, L: [['R-1', 'G-1', 'B-1'], ['R1', 'G1', 'B1']], d: 'Tri-Gate＋Zig-Zag：2N 三列往右一條，2N+1 不位移（與 19 相反）。', warn: '原廠 19、20 用同一張圖（檔案內容相同，只畫了 LLLRRR）；20 的 RRRLLL 由暫存器值反推。' },
    { name: '21.Tri, BOE', img: '21.BOE Tri-gate', g: 'tri', P: 6, A: 6, L: [['R1 G1 B1 R2 G2 B2', 'R3 G3 B3 R4 G4 B4', 'R5 G5 B5 R6 G6 B6']], d: 'BOE Tri-Gate：一條 line 三條 gate 列，6 條 Data 線一組；第一列送 pixel 1、2，第二列 pixel 3、4，第三列 pixel 5、6。' },
    { name: '22.HSD+RBG/GRB', img: '22.HSD_RBG-GBR', g: 'dual', P: 3, A: 2, L: [['R1 B1 G2', 'G1 R2 B2']], d: 'Dual Gate（HSD）：Data n 上 gate 接 R1／B1／G2…、下 gate 接 G1／R2／B2…，每條 Data 線只接左右緊鄰兩顆；兩條 line 相同。' },
    { name: '23.HSD+RBG/GRB+LR', img: '23.HSD_RBG-GBR+Zig-Zag_LR', g: 'dual', P: 3, A: 2, L: [['R1 B1 G2', 'G1 R2 B2'], ['G-1 R1 B1', 'B-1 G1 R2']], d: '同 22，2N+1 整排往右一條（Zig-Zag LR）。與原廠預設樣式 (23) 的 ② 值一致。' },
    { name: '24.HSD+RRB/GBG', img: '24.HSD_RRB-GBG', g: 'dual', P: 3, A: 2, L: [['R1 R2 B2', 'G1 B1 G2']], d: 'Dual Gate（HSD）RRB／GBG：上 gate R1 R2 B2…、下 gate G1 B1 G2…；兩條 line 相同。' },
    { name: '25.HSD+RRB/GBG+LR', img: '25.HSD_RRB-GBG+Zig-Zag_LR', g: 'dual', P: 3, A: 2, L: [['R1 R2 B2', 'G1 B1 G2'], ['B-1 R1 R2', 'G-1 G1 B1']], d: '同 24，2N+1 往右一條。' },
    { name: '26.HSD+RRB/GBG+LR+RB_chg', img: '26.HSD_RRBGBG_LR_RB_chg', g: 'dual', P: 3, A: 2, L: [['B1 B2 R2', 'G1 R1 G2'], ['R-1 B1 B2', 'G-1 G1 R1']], d: '同 25 但 R、B 對換（BBR／GRG）。' },
    { name: '27.HSD+GGB/RBR+2RRRL', img: '27.HSD_GGB-RBR+Zig-Zag_2RRRL', g: 'dual', P: 3, A: 2, L: [['G-1 B-1 G1', 'R-1 R1 B1'], ['B-1 G1 G2', 'R1 B1 R2']], d: 'Dual Gate GGB／RBR：2N 上 gate 從 Data 3 起 G1 G2 B2…、下 gate 從 Data 2 起 R1 B1 R2…；2N+1 整排往左一條。' },
    { name: '28.HSD+BRG/GRB+LR', img: '28.HSD_BRG-GBR+Zig-Zag_2RRRL', g: 'dual', P: 3, A: 2, L: [['B1 R1 G2', 'G1 B2 R2'], ['G-1 B1 R1', 'R-1 G1 B2']], d: 'Dual Gate BRG／GBR：上 gate B1 R1 G2…、下 gate G1 B2 R2…；2N+1 往右一條。與原廠預設樣式 (28) 的 ② 值一致。' },
    { name: '29.HSD+GGR-GGR-GGB-GGB/RBR-BBR-BBR-RBR+2RRRL', img: '29.HSD+GGR-GGR-GGB-GGB_RBR-BBR-BBR-RBR+ZZ+2RRRL', g: 'dual', P: 12, A: 8,
      L: [['G-1 B-1 G1 G2 R3 G3 G4 R5 G5 G6 B6 G7', 'R-1 R1 B1 R2 B2 B3 R4 B4 B5 R6 R7 B7'], ['B-1 G1 G2 R3 G3 G4 R5 G5 G6 B6 G7 G8', 'R1 B1 R2 B2 B3 R4 B4 B5 R6 R7 B7 R8']],
      d: 'Dual Gate，12 條 Data 線（8 pixel）一循環，上 gate 以 G 為主、下 gate 以 R／B 為主；2N+1 往左一條。D1~D6 與原廠預設樣式 (29) 的 ② 值一致。',
      warn: '原廠圖欄寬不一致（合併儲存格），2N+1 下 gate 有一格空白（應為 B5）；以暫存器值與原廠預設樣式 (29) 為準。' },
    { name: '30.4pixels/4line, BOE+LRLR', img: '30.BOE_', g: 'dual', P: 6, A: 4,
      L: [['R1 R2 B2 G3 R4 B4', 'G1 B1 G2 R3 B3 G4'], ['G-1 G1 B1 G2 G3 B3', 'B-1 R1 R2 B2 R3 R4'], ['G1 R2 B2 R3 R4 B4', 'R1 B1 G2 G3 B3 G4'], ['G-1 G1 B1 G2 G3 B3', 'B-1 R1 R2 B2 R3 R4']],
      d: 'BOE HSD，4 條 line 一循環：4N+1、4N+3 往右一條（LRLR），4N 與 4N+2 的上下 gate 換顏色。',
      warn: 'D1~D6 的 Line 1、2 與原廠「預設樣式」(31) 相同、不是 (30)：RApp_TX.h 的 (30)／(31) 兩筆值和名稱對調了（Line OD 這邊的名稱、圖、暫存器三者一致）。' },
    { name: '31.HSD BOE+4pixel/4line', img: '31.HSD BOE_4pixel4line', g: 'dual', P: 6, A: 4,
      L: [['R1 G3 B1 R4 G2 B4', 'R3 G1 B3 R2 G4 B2'], ['R1 G3 B1 R4 G2 B4', 'R3 G1 B3 R2 G4 B2'], ['R3 G1 B3 R2 G4 B2', 'R1 G3 B1 R4 G2 B4'], ['R3 G1 B3 R2 G4 B2', 'R1 G3 B1 R4 G2 B4']],
      d: 'BOE HSD（原廠圖標題「HSD RGB 4pix 4 line」）：每條 Data 線固定一個顏色（R G B R G B），上下 gate 接同色但隔一個 pixel；4N+2、4N+3 上下對換。',
      warn: '照 ② 的 RGB 條紋位置畫，drain 會跨 1~2 顆；實際面板可能不是 RGB 條紋排列（名稱「HSD RGB」），預覽只代表資料接線。與原廠「預設樣式」(30) 相同（見 30 的說明）。' },
    { name: '32.HSD BOE+GBG/RRB+LR', img: '32.HSD BOE_GBGRRB_LR', g: 'dual', P: 3, A: 2, L: [['G1 B1 G2', 'R1 R2 B2'], ['G-1 G1 B1', 'B-1 R1 R2']], d: 'BOE HSD GBG／RRB：上 gate G1 B1 G2…、下 gate R1 R2 B2…；2N+1 往右一條。',
      warn: '原廠「預設樣式」(32) 的 ② 值＝這張圖再做 D1↔D3、D4↔D6 對調：用 (32) 的 code 時要勾「模擬 Source Driver 輸出對調」才對得上這張圖（與蘇坤 BOE B4 27" 的結論相同）。' }
  ];
  var CH = ['R', 'G', 'B'];
  function lin(n) { var m = /^([RGB])(-?\d+)$/.exec(n || ''); if (!m) return null; var p = +m[2]; return (p > 0 ? p - 1 : p) * 3 + CH.indexOf(m[1]); }
  function name(l) { var px = Math.floor(l / 3), c = l - px * 3; return CH[c] + (px >= 0 ? px + 1 : px); }
  T.forEach(function (t, i) {
    var v = VREG[i].split('|'), h = v[0].split(' ').map(Number);
    t.no = i; t.reg = { de: h[0], spec: h[1], line: h[2], pix: h[3], r: v[1].split(' ').map(Number), g: v[2].split(' ').map(Number), b: v[3].split(' ').map(Number) };
    t.rows = t.L.map(function (line) { return line.map(function (s) { return s.split(' ').map(lin); }); });
  });
  /* 第 li 條 line、第 gi 條 gate 列、第 c 條 Data 線（0 起，可大於 P）送的子像素（線性索引） */
  function at(t, li, gi, c) {
    var base = t.rows[li % t.rows.length][gi], k = Math.floor(c / t.P), j = c - k * t.P;
    return base[j] === null ? null : base[j] + 3 * t.A * k;
  }
  /* ② 表格形式（D1..D12）：Single ⇒ 每條 line 一列（Line k-1）；Dual ⇒ 每條 line 兩列（Line k-1 上、k-2 下）；Tri ⇒ null（② 不支援） */
  function lines12(t) {
    if (t.g === 'tri') return null;
    var n = Math.max(2, t.rows.length), out = [];
    for (var li = 0; li < n; li++) for (var gi = 0; gi < (t.g === 'dual' ? 2 : 1); gi++) {
      var r = []; for (var c = 0; c < 12; c++) { var x = at(t, li, gi, c); r.push(x === null ? 'X' : name(x)); }
      out.push({ line: li + 1, gate: gi + 1, names: r });
    }
    return out;
  }
  /* 由接線算回 Line OD 的 48 個值（驗算用；mir ⇒ pixel 反向） */
  function deriveReg(t, order) {
    var G = t.rows[0].length, L = t.reg.line + 1, X = t.reg.pix + 1, out = { r: [], g: [], b: [] }, clash = [];
    for (var i = 0; i < 16; i++) { out.r.push(63); out.g.push(63); out.b.push(63); }
    var seen = {};
    var px = function (l) { var p = Math.floor(l / 3); return t.mir ? -p : p; };
    for (var li = 0; li < L; li++) for (var gi = 0; gi < G; gi++) for (var c = 4 * t.P; c < 8 * t.P; c++) {
      var x = at(t, li, gi, c); if (x === null) continue;
      var y = gi > 0 ? at(t, li, gi - 1, c) : at(t, (li - 1 + L) % L, G - 1, c), cur = gi > 0;
      var val = 63;
      if (y !== null) { var dx = px(y) - px(x), p = cur ? t.reg.de + 1 - dx : t.reg.de - dx; val = (cur ? 18 : 0) + 3 * p + (((y % 3) + 3) % 3); }
      var ph = ((px(x) % X) + X) % X, idx = order === 'pl' ? ph * L + li : li * X + ph, col = CH[((x % 3) + 3) % 3].toLowerCase(), key = col + idx;
      if (key in seen && seen[key] !== val) clash.push(key + ':' + seen[key] + '/' + val);
      seen[key] = val; out[col][idx] = val;
    }
    return { reg: out, clash: clash };
  }
  var API = { TYPES: T, lin: lin, name: name, at: at, lines12: lines12, deriveReg: deriveReg, BK_LOD: 0x0900,
    REGS: { de: '0x09C7[2:0]', spec: '0x09C7[5:4]', line: '0x09C8[3:0]', pix: '0x09C8[6:4]', rgb: '0x09C9~0x09F8（r_0..r_15、g_0..g_15、b_0..b_15，各 6 bit）' } };
  if (typeof module === 'object' && module.exports) module.exports = API; else root.TCONDataMapLOD = API;
})(typeof window !== 'undefined' ? window : this);
