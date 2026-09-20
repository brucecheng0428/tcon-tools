/* ═══════════════════════════════════════════════════════════════════════════
   common/xlsx.js — 純 JS 的 .xlsx 產生器（zip + XML，零外部相依）
   ───────────────────────────────────────────────────────────────────────────
   🔴 這一份是**搬過來的，不是新寫的**。原地在 `dg.html`（v1.4.4 起），
      一個位元組都沒改：dgCrc32／dgUtf8／dgZip／dgXe／dgColName／dgSheetXml／
      dgBuildXlsx 七支的函式本體逐行相同，只是換了名字前綴與存放位置。
      `dg.html` 那七個名字**原樣保留**，內容改成一行轉呼叫 —— 它的十幾個呼叫端
      與 `dgApi` 的驗證掛勾因此完全不必動。

   🔴 為什麼要搬：`dg-selftest.html` 也要產 xlsx（Bruce 2026-09-20：「量測完以後，
      你確認一下 PQ Tool 的原廠 UI 是匯出 CSV 檔還是匯出 XLSX 檔案，這個要一致」）。
      第二頁要用就只有兩條路 —— 複製一份，或搬成共用。複製出來的兩份遲早分岔
      （`?v=` cache buster、HELPER_PKG 都吃過這個虧），所以搬。

   🔴 改了這個檔 ⇒ **引用它的每一頁都要 bump `?v=`**（tools/check_cache_buster.py
      會擋）。目前引用者：dg.html、dg-selftest.html。

   對外只有一個全域：`TCONXlsx`。
   ═══════════════════════════════════════════════════════════════════════════ */
var TCONXlsx = (function () {
  'use strict';

  var CRCT = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var b = unescape(encodeURIComponent(str)), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  // ZIP，全部用 store（不壓縮）——Excel 照樣開得起來，也省掉自己寫 deflate
  function zip(files) {
    var parts = [], central = [], offset = 0;
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var lh = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(lh), name, data);
      central.push({ name: name, crc: crc, len: data.length, off: offset });
      offset += lh.length + name.length + data.length;
    });
    var cd = [], cdLen = 0;
    central.forEach(function (e) {
      var h = [].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(e.crc), u32(e.len), u32(e.len), u16(e.name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(e.off));
      cd.push(new Uint8Array(h), e.name);
      cdLen += h.length + e.name.length;
    });
    var eocd = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0),
      u16(central.length), u16(central.length), u32(cdLen), u32(offset), u16(0)));
    var all = parts.concat(cd, [eocd]);
    var total = all.reduce(function (a, x) { return a + x.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (x) { out.set(x, pos); pos += x.length; });
    return out;
  }
  function xe(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(n) {
    var s = '', m; n += 1;
    while (n > 0) { m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  function sheetXml(rows, merges) {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri] || [], cells = '';
      for (var ci = 0; ci < row.length; ci++) {
        var v = row[ci];
        if (v === null || v === undefined || v === '') continue;
        var ref = colName(ci) + (ri + 1);
        if (typeof v === 'number' && isFinite(v)) cells += '<c r="' + ref + '"><v>' + v + '</v></c>';
        else cells += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
      }
      if (cells) x += '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }
    x += '</sheetData>';
    if (merges && merges.length) {
      x += '<mergeCells count="' + merges.length + '">';
      merges.forEach(function (m) { x += '<mergeCell ref="' + xe(m) + '"/>'; });
      x += '</mergeCells>';
    }
    return x + '</worksheet>';
  }
  function build(sheets) {
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    sheets.forEach(function (sh, i) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

    var wbSheets = '', wbRels = '';
    sheets.forEach(function (sh, i) {
      wbSheets += '<sheet name="' + xe(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      wbRels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets>' + wbSheets + '</sheets></workbook>';
    var wbr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + wbRels
      + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
      + '<borders count="1"><border/></borders>'
      + '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
      + '<cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>';

    var files = [
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'xl/workbook.xml', data: utf8(wb) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(wbr) },
      { name: 'xl/styles.xml', data: utf8(styles) }
    ];
    sheets.forEach(function (sh, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(sh.rows, sh.merges)) });
    });
    return zip(files);
  }

  return { crc32: crc32, utf8: utf8, zip: zip, xe: xe, colName: colName,
           sheetXml: sheetXml, build: build };
})();
