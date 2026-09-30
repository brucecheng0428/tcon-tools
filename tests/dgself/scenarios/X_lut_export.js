/* v2.6.0：「DG LUT（RGB）檢視」的「匯出 Excel」。
   __xCase：ON（DG_EN ON 讀 T-CON，第 2 輪）／OFF（等距表 ⇒ 先問、取消不下載、確定才下載）／
            NR（不知道第幾輪 ⇒ 檔名沒有 _R）／ALT（撞號選了別顆 ⇒ 沒有確認過的格式，不匯出）／EN（英文字面）
   檔案內容：直接解 zip（store）讀 sheet／workbook XML，逐列比對卡上的 dstLut。 */
(async function () {
  var C = window.__xCase || 'ON';
  function tx(id) { return __txt(id); }
  var dl = [];
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) dl.push({ name: this.download, href: this.href });
  };
  var blobs = {};
  var oc = URL.createObjectURL;
  URL.createObjectURL = function (b) { var u = oc.call(URL, b); blobs[u] = b; return u; };
  URL.revokeObjectURL = function () {};
  async function unzip(blob) {
    var u8 = new Uint8Array(await blob.arrayBuffer()), out = {}, p = 0;
    while (p + 30 <= u8.length && u8[p] === 0x50 && u8[p + 1] === 0x4B && u8[p + 2] === 3 && u8[p + 3] === 4) {
      var sz = u8[p + 18] | (u8[p + 19] << 8) | (u8[p + 20] << 16) | (u8[p + 21] << 24);
      var nl = u8[p + 26] | (u8[p + 27] << 8), el = u8[p + 28] | (u8[p + 29] << 8);
      var nm = new TextDecoder().decode(u8.subarray(p + 30, p + 30 + nl));
      out[nm] = new TextDecoder().decode(u8.subarray(p + 30 + nl + el, p + 30 + nl + el + sz));
      p += 30 + nl + el + sz;
    }
    return out;
  }
  function cellRows(xml) {   // [[v,v,v,v], …] 依列號
    var rows = {}, re = /<c r="([A-Z]+)(\d+)"[^>]*?(?:t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g, m;
    while ((m = re.exec(xml))) {
      var r = +m[2], c = m[1].charCodeAt(0) - 65;
      (rows[r] = rows[r] || [null, null, null, null])[c] = (m[4] !== undefined) ? +m[4] : m[5];
    }
    return rows;
  }
  try {
    window.__lutFill = true;
    if (C === 'EN') applyLang('en');
    await __wait(500); await __arm(); await __wait(300);
    __ok('X0 export disabled before any table', __dis('dst-lut-xlsx') === true);
    __ok('X0 export is an outline button (no .pri / .dst-main)', !__cls('dst-lut-xlsx', 'pri') && !__cls('dst-lut-xlsx', 'dst-main') && getComputedStyle(document.getElementById('dst-lut-xlsx')).backgroundColor !== __BLUE);
    if (C === 'EN') __ok('X-EN button text', tx('dst-lut-xlsx') === 'Export Excel', tx('dst-lut-xlsx'));
    else __ok('X0 button text', tx('dst-lut-xlsx') === '匯出 Excel', tx('dst-lut-xlsx'));
    __ok('X0 button sits next to read', document.getElementById('dst-lut-xlsx').parentNode === document.getElementById('dst-lut-read').parentNode);

    if (C === 'OFF') { __clickSw('off'); await __wait(1500); }
    document.getElementById('dst-lut-read').click(); await __wait(2500);
    __ok('X1 table on card', !!dstLut && (C === 'OFF' ? dstLut.src === 'ident' : dstLut.src === 'tcon'), dstLut ? dstLut.src : JSON.stringify(dstLutErr));
    __ok('X1 export enabled once a table is shown', __dis('dst-lut-xlsx') === false);

    if (C === 'ALT') {
      dstAltIdx = 0;   // EM02A1 撞號的另一顆
      var alt = dstIc.alts[0].name;
      document.getElementById('dst-lut-xlsx').click(); await __wait(300);
      __ok('X-ALT no download', dl.length === 0, JSON.stringify(dl));
      __ok('X-ALT says no verified format for ' + alt, new RegExp(alt).test(tx('dst-say-lutx')) && /沒有確認過/.test(tx('dst-say-lutx')), tx('dst-say-lutx'));
      __ok('X-ALT no ask modal', !__cls('dst-modal-ask', 'open'));
      __checkVersion('X-ALT'); throw 'done';
    }

    var ask0 = __cls('dst-modal-ask', 'open');
    document.getElementById('dst-lut-xlsx').click(); await __wait(300);
    if (C === 'OFF') {
      __ok('X-OFF asks first', __cls('dst-modal-ask', 'open') && dl.length === 0);
      __ok('X-OFF ask text', tx('dst-ask-body') === '目前是等間距 LUT（DG_EN OFF），確定要匯出？' && tx('dst-ask-yes') === '匯出' && tx('dst-ask-no') === '取消',
        tx('dst-ask-title') + ' | ' + tx('dst-ask-body') + ' | ' + tx('dst-ask-yes') + '/' + tx('dst-ask-no'));
      var solid = Array.prototype.filter.call(document.querySelectorAll('.dst-btn, .dst-toggle'), function (b) {
        return b.offsetParent && getComputedStyle(b).backgroundColor === __BLUE; }).map(function (b) { return b.id; });
      __ok('X-OFF ask: "export" is the only solid button on the page', solid.length === 1 && solid[0] === 'dst-ask-yes', JSON.stringify(solid));
      document.getElementById('dst-ask-no').click(); await __wait(300);
      __ok('X-OFF cancel -> nothing downloaded, no message', dl.length === 0 && !__cls('dst-modal-ask', 'open') && !tx('dst-say-lutx'), tx('dst-say-lutx'));
      __ok('X-OFF closed -> ask styling released', !__cls('dst-ask-yes', 'dst-main') && !document.body.classList.contains('dst-ask-on'));
      document.getElementById('dst-lut-xlsx').click(); await __wait(300);
      document.getElementById('dst-ask-yes').click(); await __wait(500);
    } else {
      __ok('X-ON no ask when DG_EN is on', !ask0 && !__cls('dst-modal-ask', 'open'));
    }
    __ok('X2 exactly one download', dl.length === 1, JSON.stringify(dl.map(function (d) { return d.name; })));
    var d = dl[0] || {};
    var re = (C === 'NR') ? /^DG_LUT_EM02A1_\d{8}_\d{4}\.xlsx$/ : /^DG_LUT_EM02A1_\d{8}_\d{4}_R2\.xlsx$/;
    __ok('X2 file name ' + re, re.test(d.name || ''), d.name);
    var now = new Date(), stamp = now.getFullYear() + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2);
    __ok('X2 file name carries today (local)', (d.name || '').indexOf('_' + stamp + '_') > 0, d.name);
    __ok('X2 fixed-time name', dstLutExportName('E512A1', new Date(2026, 8, 30, 18, 30)) === (C === 'NR' ? 'DG_LUT_E512A1_20260930_1830.xlsx' : 'DG_LUT_E512A1_20260930_1830_R2.xlsx'),
      dstLutExportName('E512A1', new Date(2026, 8, 30, 18, 30)));
    if (C === 'EN') __ok('X-EN done line', /^✔ Exported DG_LUT_EM02A1_.*sheet “DG_12bit”, 256 main entries \+ tail entry/.test(tx('dst-say-lutx')), tx('dst-say-lutx'));
    else __ok('X2 done line names the file and format', tx('dst-say-lutx').indexOf('✔ 已匯出 ' + d.name) === 0 && /工作表「DG_12bit」，主表 256 筆＋附加末筆/.test(tx('dst-say-lutx')), tx('dst-say-lutx'));

    // 檔案內容：逐列比對
    var files = await unzip(blobs[d.href]);
    var wb = files['xl/workbook.xml'] || '', sh = files['xl/worksheets/sheet1.xml'] || '';
    __ok('X3 sheet name DG_12bit (EM02, 12-bit)', /<sheet [^>]*name="DG_12bit"/.test(wb), (wb.match(/<sheet [^>]*>/) || [''])[0]);
    __ok('X3 B1:D1 merged', /<mergeCell ref="B1:D1"\/>/.test(sh));
    var R = cellRows(sh), keys = Object.keys(R).map(Number);
    __ok('X3 259 rows (title + header + 256 + tail)', keys.length === 259 && Math.max.apply(null, keys) === 259, keys.length);
    __ok('X3 title row', R[1][1] === 'DG', JSON.stringify(R[1]));
    __ok('X3 header row', JSON.stringify(R[2]) === JSON.stringify(['Index', 'R', 'G', 'B']), JSON.stringify(R[2]));
    var bad = [];
    for (var i = 0; i <= 256; i++) {
      var w = R[i + 3], e = [i, dstLut.rgb.r[i], dstLut.rgb.g[i], dstLut.rgb.b[i]];
      if (JSON.stringify(w) !== JSON.stringify(e)) bad.push(i + ':' + JSON.stringify(w) + '!=' + JSON.stringify(e));
    }
    __ok('X3 all 257 entries equal the card (incl. tail index 256)', bad.length === 0, bad.slice(0, 3).join(' '));
    // 與卡上表格逐列一致（畫面上看到的就是匯出的）
    var trs = document.querySelectorAll('#dst-lut-tb tr'), badTr = 0;
    for (i = 0; i < trs.length; i++) {
      var tds = trs[i].querySelectorAll('td');
      if ([0, 1, 2, 3].some(function (c) { return +tds[c].textContent !== R[i + 3][c]; })) badTr++;
    }
    __ok('X3 rows equal the table on the card', trs.length === 257 && badTr === 0, trs.length + ' / bad ' + badTr);
    if (C === 'OFF') __ok('X-OFF content is the linear table 0,16,…,4080 + 4095', R[3][1] === 0 && R[4][1] === 16 && R[258][1] === 4080 && R[259][1] === 4095 && R[259][0] === 256,
      JSON.stringify([R[3], R[4], R[258], R[259]]));
    // 同一個格式函式：dg.html 與本頁用的是 common/dglut-fmt.js 同一份
    var f = TCONDgLutFmt.fmtFromTcon('EM02', 12, 12, 256);
    __ok('X4 shared format = DG part-3 format (EM02 12-bit: DG_12bit, Index, tail)', f.sheetName === 'DG_12bit' && f.headerCols[0] === 'Index' && f.hasTail && f.titleText === 'DG');
    __ok('X4 E512 10-bit -> DG_10bit; EM01 -> LUT', TCONDgLutFmt.fmtFromTcon('E512', 10, 10, 256).sheetName === 'DG_10bit' && TCONDgLutFmt.fmtFromTcon('EM01', 12, 12, 1024).sheetName === 'LUT');
    // 讀新表 ⇒ 上一張表的「已匯出」那一行收掉
    document.getElementById('dst-lut-read').click(); await __wait(2500);
    __ok('X5 re-read clears the exported line', !tx('dst-say-lutx'), tx('dst-say-lutx'));
    __checkVersion('X');
  } catch (e) { if (e !== 'done') window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
