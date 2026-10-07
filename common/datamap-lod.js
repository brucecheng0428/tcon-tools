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
    { name: '1.ZZ+LR', img: '1.Zig-Zag_LR', g: 'single', P: 3, A: 1, L: zz('LR'), d: 'Single Gate Zig-Zag LR：同一直行（如 R1）2N 列接左邊的 Data 線（D1→R1）、2N+1 列接右邊（D2→R1，D1 改接 B-1）。' },
    { name: '2.ZZ+RL', img: '2.Zig-Zag_RL', g: 'single', P: 3, A: 1, L: zz('RL'), d: 'Zig-Zag RL：2N 列接右邊（D2→R1）、2N+1 列接左邊（D1→R1）。' },
    { name: '3.ZZ+LLRR', img: '3.Zig-Zag_LLRR', g: 'single', P: 3, A: 1, L: zz('LLRR'), d: 'Zig-Zag LLRR，4 列一循環：4N、4N+1 接左邊（D1→R1），4N+2、4N+3 接右邊（D2→R1）。' },
    { name: '4.ZZ+RRLL', img: '4.Zig-Zag_RRLL', g: 'single', P: 3, A: 1, L: zz('RRLL'), d: 'Zig-Zag RRLL，4 列一循環：4N、4N+1 接右邊，4N+2、4N+3 接左邊。' },
    { name: '5.ZZ+LRRL', img: '5.Zig-Zag_LRRL', g: 'single', P: 3, A: 1, L: zz('LRRL'), d: 'Zig-Zag LRRL，4 列一循環：R1 那一直行 4N 接左（D1）、4N+1 接右（D2）、4N+2 接右（D2）、4N+3 接左（D1）。', warn: '名稱（命名原理）、接線、暫存器三者一致；原廠圖各列的位置也一致（4N、4N+3 靠左，4N+1、4N+2 往右一格），只是 4N、4N+3 兩列的文字誤用 Mirror 名稱（R4 G4 B4…）＝圖的標字錯。' },
    { name: '6.ZZ+RLLR', img: '6.Zig-Zag_RLLR', g: 'single', P: 3, A: 1, L: zz('RLLR'), d: 'Zig-Zag RLLR，4 列一循環：R1 那一直行 4N 接右、4N+1 接左、4N+2 接左、4N+3 接右。', warn: '名稱（命名原理）、接線、暫存器三者一致；原廠圖各列的位置也一致，只是 4N+1、4N+2 兩列的文字誤用 Mirror 名稱（R4 G4 B4…）＝圖的標字錯。' },
    { name: '7.ZZ+LLLLRRRR', img: '7.Zig-ZagLLLLRRRR', g: 'single', P: 3, A: 1, L: zz('LLLLRRRR'), d: 'Zig-Zag LLLLRRRR，8 列一循環：前 4 列接左、後 4 列接右。' },
    { name: '8.ZZ+RRRRLLLL', img: '8.Zig-ZagRRRRLLLL', g: 'single', P: 3, A: 1, L: zz('RRRRLLLL'), d: 'Zig-Zag RRRRLLLL，8 列一循環：前 4 列接右、後 4 列接左。' },
    { name: '9.ZZ+Mir+LR', img: '9.Zig-Zag+Mirror_LR', g: 'single', P: 3, A: 1, L: zz('LR'), mir: 1, d: '同 1（ZZ+LR）的接線；Mirror＝輸入資料左右反向（原廠圖名稱 R4 G4 B4 R3…）。' },
    { name: '10.ZZ+Mir+RL', img: '10.Zig-Zag+Mirror_RL', g: 'single', P: 3, A: 1, L: zz('RL'), mir: 1, d: '同 2 的接線＋Mirror。' },
    { name: '11.ZZ+Mir+LLRR', img: '11.Zig-Zag+Mirror_LLRR', g: 'single', P: 3, A: 1, L: zz('LLRR'), mir: 1, d: '同 3 的接線＋Mirror。' },
    { name: '12.ZZ+Mir+RRLL', img: '12.Zig-Zag+Mirror_RRLL', g: 'single', P: 3, A: 1, L: zz('RRLL'), mir: 1, d: '同 4 的接線＋Mirror。' },
    { name: '13.ZZ+Mir+LRRL', img: '13.Zig-Zag+Mirror_LRRL', g: 'single', P: 3, A: 1, L: zz('LRRL'), mir: 1, d: '同 5 的接線＋Mirror。' },
    { name: '14.ZZ+Mir+RLLR', img: '14.Zig-Zag+Mirror_RLLR', g: 'single', P: 3, A: 1, L: zz('RLLR'), mir: 1, d: '同 6 的接線＋Mirror。' },
    { name: '15.ZZ+Mir+LLLLRRRR', img: '15.Zig-Zag+Mirror_LLLLRRRR', g: 'single', P: 3, A: 1, L: zz('LLLLRRRR'), mir: 1, d: '同 7 的接線＋Mirror。' },
    { name: '16.ZZ+Mir+RRRRLLLL', img: '16.Zig-Zag+Mirror_RRRRLLLL', g: 'single', P: 3, A: 1, L: zz('RRRRLLLL'), mir: 1, d: '同 8 的接線＋Mirror。' },
    { name: '17.Tri', img: '17.Tri-gate', g: 'tri', P: 1, A: 1, L: [['R1', 'G1', 'B1']], d: 'Tri-Gate：一列子像素由三條 gate（Line k-1、k-2、k-3）控制；Data n 經三條 gate 依序接 pixel n 的 R、G、B（每條 Data 線管 3 顆，Data 線數＝1/3）。三條都接左邊（LLL）。' },
    { name: '18.Tri+ZZ+LR', img: '18.Tri-gate+Zig-Zag_LR', g: 'tri', P: 1, A: 1, L: [['R1', 'G-1', 'B1'],['R-1', 'G1', 'B-1']], d: 'Tri-Gate＋Zig-Zag LR：L／R 依 gate 列輪流：Line 1-1 左、1-2 右、1-3 左、2-1 右、2-2 左、2-3 右（LRLRLR）。' },
    { name: '19.Tri+ZZ+LLLRRR', img: '19.Tri-gate+Zig-Zag_LLLRRR_RRRLLL', g: 'tri', P: 1, A: 1, L: [['R1', 'G1', 'B1'], ['R-1', 'G-1', 'B-1']], d: 'Tri-Gate＋Zig-Zag LLLRRR（設計者說明）：Line 1-1、1-2、1-3 接左邊，Line 2-1、2-2、2-3 接右邊。' },
    { name: '20.Tri+ZZ+RRRLLL', img: '20.Tri-gate+Zig-Zag_LLLRRR_RRRLLL', g: 'tri', P: 1, A: 1, L: [['R-1', 'G-1', 'B-1'], ['R1', 'G1', 'B1']], d: 'Tri-Gate＋Zig-Zag RRRLLL：Line 1-1~1-3 接右邊、Line 2-1~2-3 接左邊（與 19 相反）。', warn: '原廠 19、20 用同一張圖（檔案內容相同，只畫了 LLLRRR）＝20 的圖錯；名稱依命名原理推出 RRRLLL，與暫存器值一致。' },
    { name: '21.Tri, BOE', img: '21.BOE Tri-gate', g: 'tri', P: 6, A: 6, L: [['R1 G1 B1 R2 G2 B2', 'R3 G3 B3 R4 G4 B4', 'R5 G5 B5 R6 G6 B6']], d: 'BOE Tri-Gate：一列子像素三條 gate；6 條 Data 線管 6 個 pixel（18 顆）：Line k-1 送 pixel 1、2，k-2 送 pixel 3、4，k-3 送 pixel 5、6（每條 Data 線接的 3 顆分散在 6 個 pixel 範圍內）。沒有 Zig-Zag（LLL）。' },
    { name: '22.HSD+RBG/GRB', img: '22.HSD_RBG-GBR', g: 'dual', P: 3, A: 2, L: [['R1 B1 G2', 'G1 R2 B2']], d: 'Dual Gate（HSD）：Data n 上 gate 接 R1／B1／G2…、下 gate 接 G1／R2／B2…，每條 Data 線只接左右緊鄰兩顆；兩條 line 相同。' },
    { name: '23.HSD+RBG/GRB+LR', img: '23.HSD_RBG-GBR+Zig-Zag_LR', g: 'dual', P: 3, A: 2, L: [['R1 B1 G2', 'G1 R2 B2'], ['G-1 R1 B1', 'B-1 G1 R2']], d: '同 22，2N+1 整排往右一條（Zig-Zag LR）。與原廠預設樣式 (23) 的 ② 值一致。' },
    { name: '24.HSD+RRB/GBG', img: '24.HSD_RRB-GBG', g: 'dual', P: 3, A: 2, L: [['R1 R2 B2', 'G1 B1 G2']], d: 'Dual Gate（HSD）RRB／GBG：上 gate R1 R2 B2…、下 gate G1 B1 G2…；兩條 line 相同。' },
    { name: '25.HSD+RRB/GBG+LR', img: '25.HSD_RRB-GBG+Zig-Zag_LR', g: 'dual', P: 3, A: 2, L: [['R1 R2 B2', 'G1 B1 G2'], ['B-1 R1 R2', 'G-1 G1 B1']], d: '同 24，2N+1 往右一條。' },
    { name: '26.HSD+RRB/GBG+LR+RB_chg', img: '26.HSD_RRBGBG_LR_RB_chg', g: 'dual', P: 3, A: 2, L: [['B1 B2 R2', 'G1 R1 G2'], ['R-1 B1 B2', 'G-1 G1 R1']], d: '同 25 但 R、B 對換（BBR／GRG）。' },
    { name: '27.HSD+GGB/RBR+2RRRL', img: '27.HSD_GGB-RBR+Zig-Zag_2RRRL', g: 'dual', P: 3, A: 2, L: [['G-1 B-1 G1', 'R-1 R1 B1'], ['B-1 G1 G2', 'R1 B1 R2']], d: 'Dual Gate GGB／RBR：2N 上 gate 從 Data 3 起 G1 G2 B2…、下 gate 從 Data 2 起 R1 B1 R2…；依命名原理實際是 2N 接右、2N+1 接左（RL）。', warn: '名稱尾的「2RRRL」無法用 L／R 逐列定義直接解讀（實際接線是每條 line R、L 交替＝RL）；接線與暫存器 48 值一致，名稱的寫法待設計者確認。' },
    { name: '28.HSD+BRG/GRB+LR', img: '28.HSD_BRG-GBR+Zig-Zag_2RRRL', g: 'dual', P: 3, A: 2, L: [['B1 R1 G2', 'G1 B2 R2'], ['G-1 B1 R1', 'R-1 G1 B2']], d: 'Dual Gate BRG／GBR：上 gate B1 R1 G2…、下 gate G1 B2 R2…；2N+1 往右一條。與原廠預設樣式 (28) 的 ② 值一致。' },
    { name: '29.HSD+GGR-GGR-GGB-GGB/RBR-BBR-BBR-RBR+2RRRL', img: '29.HSD+GGR-GGR-GGB-GGB_RBR-BBR-BBR-RBR+ZZ+2RRRL', g: 'dual', P: 12, A: 8,
      L: [['G-1 B-1 G1 G2 R3 G3 G4 R5 G5 G6 B6 G7', 'R-1 R1 B1 R2 B2 B3 R4 B4 B5 R6 R7 B7'], ['B-1 G1 G2 R3 G3 G4 R5 G5 G6 B6 G7 G8', 'R1 B1 R2 B2 B3 R4 B4 B5 R6 R7 B7 R8']],
      d: 'Dual Gate，週期 12 條 Data 線（8 pixel）：D1~D12 都是主循環，D13 起才重複；上 gate 以 G 為主、下 gate 以 R／B 為主；實際是 2N 接右、2N+1 接左（RL）。D1~D6 與原廠預設樣式 (29) 相同，D7~D12＝預設樣式 (29) 第二組＋4 pixel。',
      warn: '原廠圖欄寬不一致（合併儲存格），2N+1 下 gate 有一格空白（應為 B5）＝圖錯；「2RRRL」同 27 無法直接解讀。以暫存器值（48 值一致）與預設樣式兩組（24/24）為準。' },
    { name: '30.4pixels/4line, BOE+LRLR', img: '30.BOE_', g: 'dual', P: 6, A: 4,
      L: [['R1 R2 B2 G3 R4 B4', 'G1 B1 G2 R3 B3 G4'], ['G-1 G1 B1 G2 G3 B3', 'B-1 R1 R2 B2 R3 R4'], ['G1 R2 B2 R3 R4 B4', 'R1 B1 G2 G3 B3 G4'], ['G-1 G1 B1 G2 G3 B3', 'B-1 R1 R2 B2 R3 R4']],
      d: 'BOE HSD，4 條 line 一循環：4N+1、4N+3 往右一條（LRLR），4N 與 4N+2 的上下 gate 換顏色。',
      warn: 'D1~D6 的 Line 1、2 與原廠「預設樣式」(31) 相同、不是 (30)：RApp_TX.h 的 (30)／(31) 兩筆值和名稱對調了（預設樣式 (31) 第一組＝這裡 Line 1、2，第二組＝Line 3、4，24/24 一致；Line OD 這邊的名稱、圖、暫存器三者一致）。' },
    { name: '31.HSD BOE+4pixel/4line', img: '31.HSD BOE_4pixel4line', g: 'dual', P: 6, A: 4,
      L: [['R1 G3 B1 R4 G2 B4', 'R3 G1 B3 R2 G4 B2'], ['R1 G3 B1 R4 G2 B4', 'R3 G1 B3 R2 G4 B2'], ['R3 G1 B3 R2 G4 B2', 'R1 G3 B1 R4 G2 B4'], ['R3 G1 B3 R2 G4 B2', 'R1 G3 B1 R4 G2 B4']],
      d: 'BOE HSD（原廠圖標題「HSD RGB 4pix 4 line」）：每條 Data 線固定一個顏色（R G B R G B），上下 gate 接同色但隔一個 pixel；4N+2、4N+3 上下對換。',
      warn: '週期是 6 條 Data 線（Dual 每條 2 顆 ⇒ 6 條＝12 顆＝4 pixel），不是 12 條：D7~D12＝D1~D6 往右 4 pixel。照 ② 的 RGB 條紋位置畫，drain 會跨 1~2 顆；實際面板可能不是 RGB 條紋排列。與原廠「預設樣式」(30) 兩組相同（見 30 的說明）。' },
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
  /* ── v1.8.0 命名原理（設計者說明，2026-10-07，Bruce 轉述）──────────────────────────────────
     名稱裡的 L／R 序列（如 LRRL）＝看同一直行（例如 R1 那一行）從上到下每一列，那顆子像素接哪一邊的 Data 線：
     L＝接左側（較小編號的 Data 線）、R＝接右側（多一條）。Single／Dual 一個字母對一條 line（Dual 上下 gate 同一個字母）；
     Tri-Gate 一列子像素由三條 gate（Line k-1、k-2、k-3）控制，字母依序對每一條 gate 列（例：19 的 LLLRRR ＝ 1-1、1-2、1-3 接左，2-1、2-2、2-3 接右）。
     序列不夠長就循環（18 的 LR ⇒ LRLRLR）。名稱沒有 L／R 序列 ⇒ 每列都接左（L…）。 */
  function nameSeq(t) {
    var m = /(?:^|\+)([LR]+)(?=$|\+)/.exec(t.name.replace(/^\d+\./, ''));
    var odd = /\+\d[LR]+/.test(t.name);                       // 27、29 的「2RRRL」：不是逐列序列
    return { seq: m ? m[1] : (odd ? null : ''), unit: t.g === 'tri' ? 'gate' : 'line', raw: odd ? (/\+(\d[LR]+)/.exec(t.name) || [])[1] : null };
  }
  /* 實際接線的 L／R：每條 gate 列，該列送出的子像素用「最左那條 Data 線」為基準，0＝L、1＝R（混合 ⇒ '?'） */
  function sides(t) {
    var L = t.rows.length, G = t.rows[0].length, first = {}, rows = [];
    for (var li = 0; li < L; li++) for (var gi = 0; gi < G; gi++) {
      var mm = {}; for (var c = 0; c < 12 * t.P; c++) { var x = at(t, li, gi, c); if (x === null) continue; mm[x] = c; (first[x] = first[x] || []).push(c); }
      rows.push(mm);
    }
    var lo = at(t, 0, 0, 4 * t.P), hi = at(t, 0, 0, 8 * t.P);
    return rows.map(function (mm) {
      var set = {}; for (var x in mm) { if (+x < lo || +x > hi) continue; set[mm[x] - Math.min.apply(null, first[x])] = 1; }
      var k = Object.keys(set); return k.length === 1 ? (k[0] === '0' ? 'L' : (k[0] === '1' ? 'R' : '?')) : '?';
    });
  }
  /* 名稱推出的每條 gate 列字母（長度＝line 數×每 line gate 數）；名稱無法解讀 ⇒ null */
  function expectSides(t) {
    var ns = nameSeq(t); if (ns.seq === null) return null;
    var L = t.rows.length, G = t.rows[0].length, out = [], s = ns.seq || 'L';
    for (var li = 0; li < L; li++) for (var gi = 0; gi < G; gi++) out.push(s[(ns.unit === 'gate' ? li * G + gi : li) % s.length]);
    return out;
  }
  /* 名稱原理 vs 接線：{ ok, exp, act, note } */
  function nameCheck(t) {
    var exp = expectSides(t), act = sides(t);
    if (!exp) return { ok: null, exp: null, act: act, note: '名稱「' + nameSeq(t).raw + '」不是逐列 L／R 序列，無法直接比對' };
    return { ok: exp.join('') === act.join(''), exp: exp, act: act, note: '' };
  }
  /* 重複週期（Data 線數）：最小的 p（6 的倍數，硬體 force_sel 一組 6 條）使 D(n+p)＝D(n) 往右平移固定格數；回傳 { lines, sub, px } */
  function period(t) {
    for (var p = 6; p <= 48; p += 6) {
      var sh = null, ok = true;
      for (var li = 0; li < t.rows.length && ok; li++) for (var gi = 0; gi < t.rows[0].length && ok; gi++) for (var c = 0; c < 2 * p && ok; c++) {
        var a = at(t, li, gi, c), b = at(t, li, gi, c + p);
        if ((a === null) !== (b === null)) ok = false; else if (a !== null) { if (sh === null) sh = b - a; else if (b - a !== sh) ok = false; }
      }
      if (ok) return { lines: p, sub: sh, px: sh / 3 };
    }
    return null;
  }
  /* 任意條數的 ② 形式：每條 line、每條 gate 的 D1..Dn 名稱 */
  function linesN(t, n) {
    var nl = Math.max(2, t.rows.length), G = t.rows[0].length, out = [];
    for (var li = 0; li < nl; li++) for (var gi = 0; gi < G; gi++) {
      var r = []; for (var c = 0; c < n; c++) { var x = at(t, li, gi, c); r.push(x === null ? 'X' : name(x)); }
      out.push({ line: li + 1, gate: gi + 1, names: r });
    }
    return out;
  }
  /* ── v1.9.0：原廠 E512_V512_data_mapping_diagram（Bruce修改_20250815）.xlsx 的範例（~/TCON/TCON設定相關/，只讀）──────────────
     「register force setting」分頁的 force_sel 值（每格 code 0~29），「diagram」分頁的 Visio 圖示與 code→名稱表（T1~T5）：
       ・Tn 表：code 0~5 ＝ pixel (2n−1)、(2n) 的 RGB；6~11 往左 2 pixel；…（T1：0→R1、6→R-2；T2：0→R3、6→R1、12→R-2；每升一個 T 往右 2 pixel）。
         網頁（Python UI）的 GN1＝T2 表、GN2＝T3 表。
       ・圖示標的 T：1D1G／Zigzag 全部 T1（_0~_3＝G1~G4，第二組＝G5~G8）；HSD 上 gate（_0／_2）T1、下 gate（_1／_3）T2；
         HSD 8-pixel 的 D7~D12（第二組）上 T3、下 T4；HSD 4-pixel 的第二組＝G5~G8（第 3、4 條 line），仍是 T1／T2。
       ・實際解碼要再加一個 T（反推）：Zigzag／HSD 用「圖示 T＋1」的表（Zigzag 有用到 B-1＝17，T1 表沒有 12 以上）；Normal 用圖示 T（code 0＝R1）。
         照此規則，下面 14 筆範例與 Line OD Type 的反推接線逐格一致（zz5／zz6 的 r0 那一欄與其他欄相位相反＝xlsx 本身打錯，見 xlsxCheck）。 */
  var XLSX_CASES = [
  { id: 'nml', lod: 0, hsd: false, nml: true, v: '0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5 0 1 2 3 4 5' },
  { id: 'zz1', lod: 1, hsd: false, nml: false, v: '6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10' },
  { id: 'zz2', lod: 2, hsd: false, nml: false, v: '17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11' },
  { id: 'zz3', lod: 3, hsd: false, nml: false, v: '6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11 17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10' },
  { id: 'zz4', lod: 4, hsd: false, nml: false, v: '17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10 17 6 7 8 9 10 6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11 6 7 8 9 10 11' },
  { id: 'zz5', lod: 5, hsd: false, nml: false, v: '6 6 7 8 9 10 6 6 7 8 9 10 17 7 8 9 10 11 17 7 8 9 10 11 17 7 8 9 10 11 17 7 8 9 10 11 6 6 7 8 9 10 6 6 7 8 9 10' },
  { id: 'zz6', lod: 6, hsd: false, nml: false, v: '17 7 8 9 10 11 17 7 8 9 10 11 6 6 7 8 9 10 6 6 7 8 9 10 6 6 7 8 9 10 6 6 7 8 9 10 17 7 8 9 10 11 17 7 8 9 10 11' },
  { id: 'zz7', lod: 7, hsd: false, nml: false, v: '6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10' },
  { id: 'zz8', lod: 8, hsd: false, nml: false, v: '17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11 17 6 7 8 9 10 6 7 8 9 10 11' },
  { id: 'hsd1', lod: 22, hsd: true, nml: false, v: '6 8 10 0 2 4 6 8 10 0 2 4 13 15 17 7 9 11 13 15 17 7 9 11 6 8 10 0 2 4 6 8 10 0 2 4 13 15 17 7 9 11 13 15 17 7 9 11' },
  { id: 'hsd4', lod: 24, hsd: true, nml: false, v: '6 9 11 0 3 5 6 9 11 0 3 5 13 14 16 7 8 10 13 14 16 7 8 10 6 9 11 0 3 5 6 9 11 0 3 5 13 14 16 7 8 10 13 14 16 7 8 10' },
  { id: 'hsd3_5', lod: 27, hsd: true, nml: false, v: '16 17 7 10 11 1 16 17 7 10 11 1 21 12 14 15 6 8 21 12 14 15 6 8 17 7 10 11 1 4 17 7 10 11 1 4 12 14 15 6 8 9 12 14 15 6 8 9' },
  { id: 'hsd4boe', lod: 25, hsd: true, nml: false, v: '6 9 11 0 3 5 6 9 11 0 3 5 13 14 16 7 8 10 13 14 16 7 8 10 17 6 9 11 0 3 17 6 9 11 0 3 22 13 14 16 7 8 22 13 14 16 7 8' },
  { id: 'hsd8', lod: 29, hsd: true, nml: false, v: '16 17 7 10 0 1 16 6 7 10 11 1 21 12 14 15 17 8 21 23 14 15 6 8 17 7 10 0 1 4 6 7 10 11 1 4 12 14 15 17 8 9 23 14 15 6 8 9' }

  ];
  function tName(n, code) { var g = Math.floor(code / 6), j = code % 6; if (code > 29 || g > n) return null; return 3 * (2 * (n - 1) - 2 * g) + j; }
  /* 範例 → 每條 gate 的 D1..Dn 名稱：single ⇒ G1~G8（第一組 _0~_3、第二組 _0~_3）；hsd ⇒ line 1、2 × 上下，8-pixel 再接 D7~D12 */
  function xlsxRows(c) {
    var v = c.v.split(' ').map(Number), de = c.nml ? 0 : 1, rows = [];
    var at2 = function (slot, ch) { return v[slot * 12 + ch]; };
    if (!c.hsd) {
      for (var gset = 0; gset < 2; gset++) for (var sl = 0; sl < 4; sl++) { var r = []; for (var ch = 0; ch < 6; ch++) r.push(tName(1 + de, at2(sl, ch + 6 * gset))); rows.push({ gate: gset * 4 + sl, names: r }); }
    } else {
      var p8 = c.id === 'hsd8';
      for (var sl2 = 0; sl2 < 4; sl2++) { var rr = [], up = sl2 % 2 === 0; for (var ch2 = 0; ch2 < (p8 ? 12 : 6); ch2++) rr.push(tName((up ? 1 : 2) + (ch2 >= 6 ? 2 : 0) + de, at2(sl2, ch2))); rows.push({ line: sl2 >> 1, gi: sl2 & 1, names: rr }); }
    }
    return rows;
  }
  /* 範例 vs Line OD Type 接線：回傳 { ok, bad:[…] } */
  function xlsxCheck(c) {
    var t = T[c.lod], bad = [];
    xlsxRows(c).forEach(function (r) {
      r.names.forEach(function (x, ch) {
        var exp = c.hsd ? at(t, r.line, r.gi, ch) : at(t, r.gate % t.rows.length, 0, ch);
        if (x !== exp) bad.push((c.hsd ? 'L' + (r.line + 1) + (r.gi ? '↓' : '↑') : 'G' + (r.gate + 1)) + ' D' + (ch + 1) + ' ' + (x === null ? '?' : name(x)) + '≠' + (exp === null ? 'X' : name(exp)));
      });
    });
    return { ok: !bad.length, bad: bad };
  }
  var API = { TYPES: T, XLSX_CASES: XLSX_CASES, tName: tName, xlsxRows: xlsxRows, xlsxCheck: xlsxCheck, lin: lin, name: name, at: at, lines12: lines12, linesN: linesN, deriveReg: deriveReg, nameSeq: nameSeq, sides: sides, expectSides: expectSides, nameCheck: nameCheck, period: period, BK_LOD: 0x0900,
    REGS: { de: '0x09C7[2:0]', spec: '0x09C7[5:4]', line: '0x09C8[3:0]', pix: '0x09C8[6:4]', rgb: '0x09C9~0x09F8（r_0..r_15、g_0..g_15、b_0..b_15，各 6 bit）' } };
  if (typeof module === 'object' && module.exports) module.exports = API; else root.TCONDataMapLOD = API;
})(typeof window !== 'undefined' ? window : this);
