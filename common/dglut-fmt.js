/* ═══════════════════════════════════════════════════════════════════════════
   common/dglut-fmt.js — TCON UI 能匯入的「RGB LUT 檔」格式（單一來源）
   ───────────────────────────────────────────────────────────────────────────
   🔴 這一份是**從 dg.html 搬過來的，不是新寫的**（dgself v2.6.0／dg v2.3.2，Bruce 2026-09-30）。
      原本 DG_TCON_STYLE／DG_TCON／dgFmtFromTcon()／dgLutRowsForFmt() 只在 dg.html 裡，
      也就是 DG 第 3 部分「下載新產出 RGB LUT 檔（回 TCON 用）」那一顆鈕走的格式。
      自檢頁「DG LUT（RGB）檢視」要匯出同一種檔回 TCON UI，照交辦「有現成就沿用同一個函式
      與同一種格式，不要另外發明」⇒ 搬到這裡兩頁共用，內容逐字未改（只去掉一層縮排）。
      格式的出處（各顆 TCON UI 工具內的 Excel 指令字串＋真檔）寫在 dg.html 原處那段長註解，
      以及下面每一顆的 basis 欄位。
   🔴 xlsx 產生器本體在 common/xlsx.js（TCONXlsx），這一支只管「列怎麼排」。
   目前引用者：dg.html、dg-selftest.html。對外只有一個全域：`TCONDgLutFmt`。
   ═══════════════════════════════════════════════════════════════════════════ */
var TCONDgLutFmt = (function () {
  'use strict';

  var DG_TCON_STYLE = {
    index: {
      titleRow: 1, titleText: 'DG', merges: ['B1:D1'],
      headerRow: 2, headerCols: ['Index', 'R', 'G', 'B'], hasTail: true,
      desc: '第 1 列標題「DG」（B1:D1 合併）、第 2 列表頭 Index／R／G／B，主表之後<b>多一筆</b>索引 N 的附加末筆（值 2^深度 − 1）'
    },
    level: {
      titleRow: 0, titleText: null, merges: [],
      headerRow: 1, headerCols: ['Level', 'R', 'G', 'B'], hasTail: false,
      desc: '沒有標題列，第 1 列就是表頭 Level／R／G／B，主表結束就結束、<b>沒有</b>附加末筆'
    }
  };

  /* frc：選到這顆 TCON 時要連動帶入的 FRC 位元數（Bruce 2026-09-10 裁示，六顆都已裁示）。
       FRC 3 bit：E501（A／B 兩版都是 3，本次不拆選項）、E503
       FRC 4 bit：EM01、EM02、E512、EN01
     frc 為 null／undefined 代表「不連動」，目前六顆都有值，這條路留給日後新增的型號。 */
  var DG_TCON = {
    EM01: {
      group: 'monitor', depths: [10, 12], style: 'index', frc: 4,
      sheet: function () { return 'LUT'; },
      evid: '工具字串',
      basis: '依該顆 TCON UI 工具內寫 DG LUT 的 Excel 指令字串：工作表名只有一個「LUT」，'
        + '不隨輸出深度改變；後面接 A1:D1027（1024 筆）與 A1:D259（256 筆）兩種範圍與 B1:D1 合併。'
    },
    EM02: {
      group: 'monitor', depths: [10, 12], style: 'index', frc: 4,
      sheet: function (hw) { return 'DG_' + hw + 'bit'; },
      evid: '工具字串＋真檔',
      basis: '依該顆 TCON UI 工具內的 Excel 指令字串：「Name → DG_10bit ／ Name → DG_12bit」兩個名字'
        + '並排在同一段，後接 Range A1:D259 與 B1:D1 合併 ⇒ 工作表名隨深度改變。'
        + '真檔佐證：本機一台 MNT 機種的 EM02 DG 檔即為 DG_12bit、259 列、索引 0~256、末筆 4095。'
    },
    E512: {
      group: 'monitor', depths: [10, 12], style: 'index', frc: 4,
      sheet: function (hw) { return 'DG_' + hw + 'bit'; },
      evid: '工具字串＋真檔',
      basis: '與 EM02 同一段 Excel 指令字串（該顆的工具內容相同）：DG_10bit ／ DG_12bit 隨深度換名，'
        + 'Range A1:D259、B1:D1 合併。真檔佐證：本機一台 MNT 機種的 DG 檔為 DG_10bit、259 列、末筆 1023。'
    },
    E501: {
      group: 'nb', depths: [10], style: 'level', frc: 3,
      sheet: function () { return 'RGB'; },
      evid: '真檔',
      basis: '依真檔歸納（<b>非規格</b>）：本機一台 NB 15.6" 機種的 DGM RGB 表，工作表 RGB、'
        + '第 1 列表頭 Level／R／G／B、257 列、索引 0~255、末筆 1008（＝驅動上限碼，沒有附加末筆）。'
        + '在該顆的工具二進位檔裡找不到對應的 Excel 寫檔字串，所以只有檔案證據、沒有程式碼證據。'
    },
    E503: {
      group: 'nb', depths: [10], style: 'level', frc: 3,
      sheet: function () { return 'RGB'; },
      evid: '真檔',
      basis: '依真檔歸納（<b>非規格</b>）：工作表 RGB、第 1 列表頭 Level／R／G／B、256 筆索引 0~255、'
        + '沒有附加末筆。與同族其他型號的真檔結構一致。未找到對應的工具寫檔字串。'
    },
    EN01: {
      group: 'nb', depths: [10], style: 'level', frc: 4,
      sheet: function () { return 'RGB'; },
      evid: '真檔',
      basis: '依真檔歸納（<b>非規格</b>）：與同族其他型號共用同一份 RGB 表結構（Level 表頭、'
        + '256 筆索引 0~255、無附加末筆）。未找到對應的工具寫檔字串。'
    }
  };

  // 依「目標 TCON ＋ 輸出深度 ＋ 主表筆數」組出輸出格式。
  function dgFmtFromTcon(key, sd, hw, entries) {
    var t = DG_TCON[key];
    if (!t) return null;
    var st = DG_TCON_STYLE[t.style], n = entries || 256, name = t.sheet(hw);
    return {
      sheetName: name,
      titleRow: st.titleRow, titleText: st.titleText, merges: st.merges.slice(),
      headerRow: st.headerRow, headerCols: st.headerCols.slice(), headerFirst: st.headerCols[0],
      entries: n, hasTail: st.hasTail, hw: hw,
      cap: (Math.pow(2, sd) - 1) * Math.pow(2, hw - sd),
      sd: sd, sdOk: true, source: 'tcon', tcon: key, evid: t.evid,
      label: key + '／' + hw + ' bit／工作表「' + name + '」／主表 ' + n + ' 筆'
        + (st.hasTail ? '＋附加末筆（共 ' + (n + 1) + ' 筆）' : '（無附加末筆）')
    };
  }

  // 依格式把 LUT 組回列陣列
  function dgLutRowsForFmt(fmt, lut) {
    var rows = [], full = Math.pow(2, fmt.hw) - 1;
    var nRow = Math.max(fmt.titleRow, fmt.headerRow);
    for (var i = 0; i < nRow; i++) rows.push([null, null, null, null]);
    if (fmt.titleRow) {
      var t = [null, null, null, null];
      t[1] = fmt.titleText;
      rows[fmt.titleRow - 1] = t;
    }
    if (fmt.headerRow) rows[fmt.headerRow - 1] = fmt.headerCols.slice();
    for (var k = 0; k < fmt.entries; k++) {
      var v = lut[k] || [0, 0, 0];
      rows.push([k, v[0], v[1], v[2]]);
    }
    if (fmt.hasTail) rows.push([fmt.entries, full, full, full]);
    return rows;
  }

  return { STYLE: DG_TCON_STYLE, TCON: DG_TCON, fmtFromTcon: dgFmtFromTcon, lutRowsForFmt: dgLutRowsForFmt };
})();
