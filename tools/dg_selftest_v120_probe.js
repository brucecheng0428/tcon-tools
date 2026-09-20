/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v120_probe.js — dgself v1.2.0 的驗收夾具（jsdom）
   ───────────────────────────────────────────────────────────────────────────
   驗 Bruce 2026-09-20 交辦的：
     ① 通訊自檢不再做 PASS／FAIL 判定（正反都驗），且 IC 識別完全不受它影響
     ② IC 識別的畫面講得清楚（自動識別、支援幾顆、撞號才出現下拉）
     ③ 二選一對話框兩顆鈕都有顏色（dg.html）
     ④ 頁面寬度沿用 common.css 的 .container
     ⑤ 匯出版面逐欄照上游工具（XLSX ＋ CSV）
     ⑦ 量測失敗不准跳過：自動重試 → 跳視窗 → 再試／中止；作廢的一輪不得匯出

   🔴 第 ⑥ 項（連動回 DG）在 `tools/dg_selftest_link_probe.js`，那一支是兩頁對開。

   用法：node tools/dg_selftest_v120_probe.js
         DST_FULL=1 node tools/dg_selftest_v120_probe.js   ← 多跑一輪 259 階的
                                                             完整灰階掃描（約 90 秒）
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 56 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inline(file) {
  let html = fs.readFileSync(path.join(repo, file), 'utf8');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const ORIGIN = 'https://example.invalid';

/* ═══ 假的 I2C Bridge（做法沿用 tools/dg_selftest_i2c.js，不另寫一套）═══════ */
function makeFakeWs(readMap) {
  const wires = [], writes = [];
  const ws = {
    readyState: 1, onmessage: null, sent: wires, writes,
    send(txt) {
      const m = JSON.parse(txt);
      wires.push(m);
      let rep;
      if (m.type === 'read') {
        const key = (readMap && readMap[m.slave] && readMap[m.slave][m.addr])
          || (readMap && readMap[m.addr]);
        let data = key ? key.slice() : new Array(m.len).fill(0x00);
        if (data.length > m.len) data = data.slice(0, m.len);
        while (data.length < m.len) data.push(0x00);
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data };
      } else if (m.type === 'write') {
        writes.push({ addr: m.addr, data: m.data.slice() });
        rep = { type: 'result', id: m.id, cmd: 'write', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; }
  };
  return ws;
}

async function load(qs) {
  const dom = new JSDOM(inline('dg-selftest.html'), {
    url: ORIGIN + '/dg-selftest.html' + (qs || ''), runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(120);
  /* jsdom 沒有 window.confirm 的實作（會印 Not implemented 並回 undefined）。
     🔴 這是**補一個瀏覽器 API**，不是改產品行為 —— 產品那兩處 confirm 一字未動。 */
  Object.defineProperty(dom.window, 'confirm', { value: () => true, configurable: true });
  return dom;
}

const MES_OK = 'OK00,P1,0,0.3127,0.3290,123.456';
/* 三種失敗（Bruce 指定要各驗一次）：儀器回錯誤／回不完整／逾時 */
const MES_ER = 'ER00,1';
const MES_SHORT = 'OK00,P1,0';
const MES_TIMEOUT = null;

/* 假的量測儀：初始化／MVS／ZRC 一律 OK；MES,1 由 mesFn 決定。 */
function meter(mesFn) {
  let n = 0;
  return cmd => {
    if (/^MES/.test(cmd)) return mesFn(++n);
    if (/^MVS/.test(cmd)) return 'OK,60.00';
    return 'OK';
  };
}

/* 準備一份「連得上、認得出 EM02A1、儀器掛著」的頁面。 */
async function armed(mesFn, opts) {
  opts = opts || {};
  const dom = await load(opts.qs);
  const w = dom.window, P = w.dstProbe;
  const ws = makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4] });
  P.__attachFakeWs(ws);
  P.setIcForTest('EM02A1', -1);
  P.__attachFakeMeter(meter(mesFn));
  /* 換階等待選最短的一檔 —— 夾具跑的是邏輯，不是面板的物理穩定時間。 */
  const sel = w.document.getElementById('dst-settle');
  sel.value = '300';
  if (opts.bits) P.setBits(opts.bits);
  return { dom, w, P, ws };
}

(async function main() {

  /* ═══ ① 通訊自檢 ═══════════════════════════════════════════════════════ */
  H('1. 通訊自檢：不再有 PASS／FAIL');
  {
    const src = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
    const i18n = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
    /* \U0001f534 要驗的是「**程式碼**裡沒有這些東西」—— 註解裡提到它們是刻意的
       （下一個人要知道為什麼拿掉），所以先把註解剥掉再比對。 */
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const code = strip(src), i18nCode = strip(i18n);
    CHECK(!/DST_COMM_EXPECT/.test(code), '常數 DST_COMM_EXPECT 已從程式碼消失（不是留著不用）');
    CHECK(!/0xA1\s*,\s*0xD8\s*,\s*0xFB/.test(code), '黃金向量 [0xA1,0xD8,0xFB] 不在程式碼裡');
    CHECK(!/'dst\.commPass'|'dst\.commMismatch'/.test(i18nCode),
      'i18n 的 dst.commPass／dst.commMismatch 兩個 key 已刪除');
    CHECK(!/dst\.commPass|dst\.commMismatch/.test(code), '頁面程式碼也不再引用那兩個 key');
    function i18nEntry(key) {
      const i = i18n.indexOf("'" + key + "':");
      return i < 0 ? '' : i18n.slice(i, i.valueOf() + 900).split('\n  \'')[0];
    }
    ['zh-TW', 'zh-CN', 'en'].forEach(L => {
      CHECK(i18nEntry('dst.commRead').indexOf("'" + L + "'") >= 0, 'dst.commRead 有 ' + L);
      CHECK(i18nEntry('dst.commNote').indexOf("'" + L + "'") >= 0, 'dst.commNote 有 ' + L);
    });

    const dom = await load();
    const P = dom.window.dstProbe;
    // 正面：任何三個 byte 都只回 'read'，而且文字裡不得出現 PASS／FAIL
    [[0xA1, 0xD8, 0xFB], [0x61, 0x41, 0xB4], [0x00, 0x00, 0x00], [0xDE, 0xAD, 0xBE]].forEach(b => {
      const v = P.commVerdict(b);
      CHECK(v.state === 'read', '讀到 ' + b.map(x => x.toString(16)).join(' ') + ' ⇒ state=read', v.state);
      CHECK(!/PASS|FAIL/i.test(v.text), '  …而且文字裡沒有 PASS／FAIL：' + JSON.stringify(v.text));
    });
    // 反面：讀不到才是問題
    [[], [0x61], [0x61, 0x41]].forEach(b => {
      const v = P.commVerdict(b);
      CHECK(v.state === 'noread', '只收到 ' + b.length + ' byte ⇒ state=noread', v.state);
    });
  }

  H('1b. IC 識別完全不受通訊讀回值影響（功能驗證，不是讀註解）');
  for (const comm of [[0xA1, 0xD8, 0xFB], [0x61, 0x41, 0xB4], [0xFF, 0xFF, 0xFF], [0x00, 0x11, 0x22]]) {
    const dom = await load();
    const w = dom.window, P = w.dstProbe;
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: comm }));
    await P.commTest();
    await P.scanIdentify();
    const ic = P.currentIc();
    const commTxt = w.document.getElementById('dst-v-comm').textContent;
    const icTxt = w.document.getElementById('dst-v-ic').textContent;
    console.log('    comm=' + comm.map(x => ('0' + x.toString(16).toUpperCase()).slice(-2)).join(' ')
      + '  →  通訊列：' + JSON.stringify(commTxt) + '   IC 列：' + JSON.stringify(icTxt));
    CHECK(ic === 'EM02A1', '通訊讀回 ' + comm[0].toString(16) + '… ⇒ IC 仍然認成 EM02A1', ic);
    CHECK(!/FAIL|PASS/i.test(commTxt), '  …通訊那一列沒有 PASS／FAIL 字樣');
    CHECK(!w.document.getElementById('dst-v-comm').classList.contains('dst-na'),
      '  …讀得到就不標灰（中性顯示）');
  }
  {
    // 讀不到才標紅／標灰
    const dom = await load();
    const w = dom.window, P = w.dstProbe;
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [] }));
    // 讀不到 ＝ bridge 回的長度不足：用 len 0 的 map 做不到，改直接驗純函式那一半
    const v = P.commVerdict([0x61]);
    CHECK(v.state === 'noread' && /讀不到|Nothing to read/.test(v.text),
      '讀不到時的文字是「讀不到」（這一種才該標紅）', v.text);
  }

  /* ═══ ② IC 識別的畫面 ══════════════════════════════════════════════════ */
  H('2. IC 識別的畫面講得清楚');
  {
    const dom = await load();
    const w = dom.window, P = w.dstProbe;
    const note = w.document.getElementById('dst-auto-note').textContent;
    console.log('    自動識別說明：' + JSON.stringify(note));
    CHECK(/自動識別/.test(note), '有「自動識別」四個字');
    CHECK(/0xFF00/.test(note), '講了是讀哪個位址判的');
    // 支援清單＝主表 ＋ 撞號替代顆，不可漏
    const want = ['E512A1', 'V007SX', 'V512S1', 'EM01A1', 'VM01S1', 'EM02A1', 'V512S2', 'VM02S1'];
    want.forEach(n => CHECK(note.indexOf(n) >= 0, '支援清單列了 ' + n, note));
    CHECK(/共 8 顆|8 顆/.test(note) || /的 8 /.test(note), '顆數是算出來的（8）', note);

    // 撞號才出現下拉；非撞號的顆不出現
    P.setIcForTest('EM02A1', -1);
    w.dstProbe.__setRunOkForTest(false);
    // 直接叫 render（撞號盒是由 dstRenderAlt 決定的）
    P.scanIdentify;  // 只為表明來源；下面用真的 render 路徑
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [1, 2, 3] }));
    await P.scanIdentify();
    const box = w.document.getElementById('dst-alt-box');
    const why = w.document.getElementById('dst-alt-why').textContent;
    const sel = w.document.getElementById('dst-alt');
    console.log('    撞號說明：' + JSON.stringify(why));
    console.log('    下拉選項：' + JSON.stringify(Array.prototype.map.call(sel.options, o => o.textContent)));
    CHECK(!box.classList.contains('dst-hidden'), 'EM02A1（撞號）⇒ 下拉會出現');
    CHECK(/02 EF A0/.test(why), '撞號說明帶了實際讀到的 ID', why);
    CHECK(/EM02A1/.test(why) && /V512S2/.test(why), '撞號說明講了是哪幾顆共用這個 ID', why);
    CHECK(/自動識別/.test(w.document.getElementById('dst-v-ic').textContent),
      'IC 那一列寫的是「自動識別：…」', w.document.getElementById('dst-v-ic').textContent);

    const dom2 = await load();
    const P2 = dom2.window.dstProbe;
    P2.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xF0], 0x0000: [1, 2, 3] }));  // VM02S1，不撞號
    await P2.scanIdentify();
    CHECK(dom2.window.document.getElementById('dst-alt-box').classList.contains('dst-hidden'),
      'VM02S1（不撞號）⇒ 下拉不出現');
  }

  /* ═══ ③ 二選一對話框的配色 ═════════════════════════════════════════════ */
  H('3. dg.html 二選一：兩顆鈕都有顏色');
  {
    const dg = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');
    /* 直接拿整個 <button> 標籤來看 class，不用位置猜。 */
    const tagOf = id => (new RegExp('<button[^>]*id="' + id + '"[^>]*>').exec(dg) || [''])[0];
    const clsOf = t => (/class="([^"]*)"/.exec(t) || [, ''])[1];
    const cpc = clsOf(tagOf('dg-btn-pick-pc')), ctc = clsOf(tagOf('dg-btn-pick-tcon'));
    console.log('    電腦畫面量測 class：' + JSON.stringify(cpc));
    console.log('    T-CON 自檢量測 class：' + JSON.stringify(ctc));
    CHECK(/dg-btn-imp/.test(cpc), '電腦畫面量測：青色 .dg-btn-imp', cpc);
    CHECK(/dg-btn-live/.test(ctc), 'T-CON 自檢：紫色 .dg-btn-live（不再是素面灰）', ctc);
    CHECK(cpc !== ctc, '兩顆的配色不同（分得出是兩條不同的路）');
    CHECK(/\.dg-btn\.dg-btn-live\s*\{[^}]*background:\s*#7c3aed/.test(dg),
      '.dg-btn-live 真的有實心底色（#7c3aed）');
    CHECK(/\.dg-btn\.dg-btn-imp\s*\{[^}]*background:\s*#0e7490/.test(dg),
      '.dg-btn-imp 真的有實心底色（#0e7490）');
  }

  /* ═══ ④ 頁面寬度 ═══════════════════════════════════════════════════════ */
  H('4. 頁面寬度沿用 common.css 的 .container');
  {
    const src = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
    const css = fs.readFileSync(path.join(repo, 'common/common.css'), 'utf8');
    /* 註解裡還提到舊的 .dst-wrap（說明為什麼改掉），所以先剥註解。 */
    const cssCode = src.replace(/\/\*[\s\S]*?\*\//g, '');
    CHECK(!/class="dst-wrap"/.test(cssCode), '不再有自己的 .dst-wrap 外框');
    CHECK(!/\.dst-wrap\s*\{/.test(cssCode), '.dst-wrap 的樣式規則也刪了（不留死樣式）');
    CHECK(/<div class="container">/.test(src), '改用 .container');
    const dom = await load();
    const el = dom.window.document.querySelector('.container');
    CHECK(!!el, '頁面上真的有 .container 節點');
    const widths = (css.match(/\.container\s*\{[^}]*max-width:\s*(\d+)px/g) || [])
      .map(s => +/(\d+)px/.exec(s)[1]);
    console.log('    common.css 的 .container 斷點寬度：' + JSON.stringify(widths));
    CHECK(widths.indexOf(1200) >= 0, 'common.css 的 .container 在桌機是 1200px（比原本 520px 寬得多）', widths);
    // dg.html／calc.html 用的是同一套
    CHECK(/\.container\s*\{\s*max-width:\s*1200px/.test(fs.readFileSync(path.join(repo, 'dg.html'), 'utf8')),
      'dg.html 用的也是同一套 .container 斷點（1200px）');
  }

  /* ═══ ⑤ 匯出格式 ═══════════════════════════════════════════════════════ */
  H('5. 匯出版面逐欄照上游工具');
  {
    const dom = await load();
    const P = dom.window.dstProbe;
    const HEAD = ['Gray', 'W_x', 'W_y', 'W_Y', 'W_T', 'W_duv',
      'R_x', 'R_y', 'R_Y', 'G_x', 'G_y', 'G_Y', 'B_x', 'B_y', 'B_Y',
      'C_x', 'C_y', 'C_Y', 'M_x', 'M_y', 'M_Y', 'Y_x', 'Y_y', 'Y_Y'];
    EQ(P.exportHeader(), HEAD, '表頭 24 欄，逐字＋順序與 BasicMeaForm.cs:1781–1804 相同');

    // 擺一輪 8-bit 的結果進去（含三個純色端點）
    const rows = [];
    for (let u = 0; u <= 255; u++) {
      rows.push({ key: 'L' + u, r12: u * 16, g12: u * 16, b12: u * 16,
        x: 0.3127, y: 0.329, lv: u });
    }
    rows.push({ key: 'R', r12: 4080, g12: 0, b12: 0, x: 0.64, y: 0.33, lv: 60 });
    rows.push({ key: 'G', r12: 0, g12: 4080, b12: 0, x: 0.30, y: 0.60, lv: 200 });
    rows.push({ key: 'B', r12: 0, g12: 0, b12: 4080, x: 0.15, y: 0.06, lv: 20 });
    P.__setRowsForTest(rows);

    const d = P.exportRows();
    console.log('    資料列數：' + d.rows.length);
    console.log('    第 1 列：' + JSON.stringify(d.rows[0]));
    console.log('    第 2 列：' + JSON.stringify(d.rows[1]));
    console.log('    最後一列：' + JSON.stringify(d.rows[d.rows.length - 1]));
    CHECK(d.rows.length === 256, '256 個灰階 ⇒ 256 個資料列（R/G/B 併進最亮那一列）', d.rows.length);
    CHECK(d.rows[0][0] === 0 && d.rows[255][0] === 255, 'Gray 欄 ＝ 12-bit 值 ÷ 16 ⇒ 0…255',
      [d.rows[0][0], d.rows[255][0]]);
    CHECK(d.rows[0][4] === '' && d.rows[0][5] === '', 'W_T／W_duv 留空（儀器回應沒解析這兩欄，不猜）');
    CHECK(d.rows[255][6] === 0.64 && d.rows[255][8] === 60, 'R 的端點落在最亮那一列',
      [d.rows[255][6], d.rows[255][8]]);
    CHECK(d.rows[0][6] === '' && d.rows[100][9] === '', '其餘列的 R／G 欄留空');
    CHECK(d.rows[255].slice(15, 24).every(v => v === ''), 'C／M／Y 九欄全部留空');

    // Gray 欄在 10／12-bit 也必須是 0…255（原廠的 num4 與使用者深度無關）
    for (const bits of [10, 12]) {
      const dom2 = await load();
      const P2 = dom2.window.dstProbe;
      P2.setBits(bits);
      const vals = P2.scanValues(bits);
      const r2 = vals.map((v, i) => ({ key: 'L' + (i * P2.scanStep(bits)), r12: v, g12: v, b12: v,
        x: 0.3, y: 0.3, lv: i }));
      P2.__setRowsForTest(r2);
      const d2 = P2.exportRows();
      CHECK(d2.rows[0][0] === 0 && d2.rows[d2.rows.length - 1][0] === 255,
        bits + '-bit：Gray 欄同樣是 0…255（與原廠 num4 = 2^(8−12) 一致）',
        [d2.rows[0][0], d2.rows[d2.rows.length - 1][0]]);
    }

    // CSV
    const stamp = P.stamp(new Date(2026, 8, 20, 21, 30, 15, 42));
    CHECK(/^\d{17}$/.test(stamp), '時間戳是 yyyyMMddHHmmssfff（17 碼）', stamp);
    CHECK(stamp === '20260920213015042', '時間戳算得對', stamp);
    const csv = P.csvText(stamp).split('\r\n');
    console.log('    CSV 表頭：' + JSON.stringify(csv[0]));
    console.log('    CSV 第 1 筆：' + JSON.stringify(csv[1]));
    console.log('    CSV 最後一筆：' + JSON.stringify(csv[256]));
    console.log('    CSV 尾段：' + JSON.stringify(csv.slice(257, 259)));
    CHECK(csv[0] === HEAD.join(',') + ',', 'CSV 表頭尾端有一個多餘逗號（原廠就是這樣寫的）', csv[0]);
    CHECK(csv[1].slice(-1) === ',', 'CSV 每一筆資料尾端也有一個逗號');
    CHECK(csv[257] === 'Time: ' + stamp, 'CSV 尾段是 Time:（緊接著、不空行）', csv[257]);
    CHECK(csv.length === 259 && csv[258] === '', 'CSV 只有 256 筆 ＋ 表頭 ＋ Time 一行', csv.length);

    // XLSX
    const bytes = P.xlsxBytes(stamp);
    CHECK(bytes[0] === 0x50 && bytes[1] === 0x4B, 'XLSX 真的是 zip（PK 開頭）');
    const buf = Buffer.from(bytes);
    const all = buf.toString('latin1');
    CHECK(all.indexOf('xl/worksheets/sheet1.xml') >= 0, 'zip 裡有 xl/worksheets/sheet1.xml');
    const xml = all.slice(all.indexOf('<worksheet'), all.indexOf('</worksheet>') + 12);
    const rowCount = (xml.match(/<row r="/g) || []).length;
    console.log('    XLSX sheet 列數（含表頭與 Time）：' + rowCount);
    CHECK(rowCount === 258, 'XLSX：1 表頭 ＋ 256 資料 ＋ 1 Time（空的那一列沒有儲存格 ⇒ 不寫出來）', rowCount);
    CHECK(/<c r="A1"[^>]*><is><t[^>]*>Gray</.test(xml), 'A1 是 Gray');
    CHECK(/<c r="F1"[^>]*><is><t[^>]*>W_duv</.test(xml), 'F1 是 W_duv');
    CHECK(/<c r="X1"[^>]*><is><t[^>]*>Y_Y</.test(xml), 'X1 是 Y_Y（第 24 欄）');
    const timeRow = /<row r="(\d+)"><c r="A(\d+)"[^>]*><is><t[^>]*>Time: /.exec(xml);
    console.log('    XLSX 的 Time 落在第 ' + (timeRow && timeRow[1]) + ' 列（資料最後一列是 257）');
    CHECK(timeRow && timeRow[1] === '259',
      'XLSX：Time 在資料最後一列（257）之後空一列 ⇒ 第 259 列（原廠 Cells[2+length+1,1]）',
      timeRow && timeRow[1]);
    CHECK(/name="Sheet1"/.test(all), '工作表名 Sheet1');
    CHECK(P.exportName('xlsx', stamp) === 'TCON_Gamma_20260920213015042.xlsx',
      '檔名 TCON_Gamma_<時間戳>.xlsx（去商標化，其餘一字不差）', P.exportName('xlsx', stamp));
    // 走按鈕自己那條路
    let dl = null;
    /* jsdom 沒有 URL.createObjectURL／<a>.click() 的下載行為 ——
       🔴 這是補兩個瀏覽器 API，產品那一段一字未動。 */
    dom.window.URL.createObjectURL = () => 'blob:fake';
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = function () { dl = this.download; };
    CHECK(P.exportXlsx() === true && /\.xlsx$/.test(dl || ''), '按鈕那條路真的觸發下載 .xlsx', dl);
    CHECK(P.exportCsv() === true && /\.csv$/.test(dl || ''), '按鈕那條路真的觸發下載 .csv', dl);
  }

  /* ═══ ⑦ 量測失敗不准跳過 ═══════════════════════════════════════════════ */
  H('7a. 純函式：三種失敗都判成失敗');
  {
    const dom = await load();
    const P = dom.window.dstProbe;
    CHECK(P.parseMes(MES_TIMEOUT) === null, '逾時（null）⇒ 失敗');
    CHECK(P.parseMes(MES_ER) === null, '儀器回 ER ⇒ 失敗');
    CHECK(P.parseMes(MES_SHORT) === null, '回應不完整（解不出 x/y/Lv）⇒ 失敗');
    CHECK(P.parseMes('OK00,P1,0,abc,def,ghi') === null, '欄位不是數字 ⇒ 失敗');
    EQ(P.parseMes(MES_OK), { x: 0.3127, y: 0.329, lv: 123.456 }, '正常回應解得出 x/y/Lv');
    CHECK(P.mesRetry() === 3, '自動重試 3 次（與 dg-measure.html 的 bad>=3 相同）', P.mesRetry());
  }

  H('7b. 成功的一輪（回歸：不受新邏輯影響）');
  {
    const { w, P } = await armed(() => MES_OK, { qs: '?mode=prim' });
    await P.run();
    const rows = P.rows();
    console.log('    列數：' + rows.length + '　內容：' + JSON.stringify(rows.map(r => r.key)));
    CHECK(rows.length === 3, 'prim 模式跑完三階', rows.length);
    CHECK(rows.every(r => r.x !== null), '沒有任何一列是 null');
    CHECK(P.runOk() === true, 'dstRunOk = true');
    CHECK(P.exportBlocked() === null, '匯出沒有被擋', P.exportBlocked());
    CHECK(w.document.getElementById('dst-xlsx').disabled === false, 'XLSX 鈕是亮的');
    CHECK(w.document.getElementById('dst-void').textContent === '', '作廢橫幅是空的');
    CHECK(P.failOpen() === false, '沒有跳過失敗視窗');
  }

  for (const [name, badRes] of [['儀器回 ER', MES_ER], ['回應不完整', MES_SHORT], ['逾時', MES_TIMEOUT]]) {
    H('7c. 第 2 階失敗（' + name + '）→ 自動重試 3 次 → 跳視窗 → 按「再試一次」');
    const calls = [];
    /* 第 2 階（第 4…7 次 MES）連錯四次（1 次正常 ＋ 3 次重試），第 8 次起恢復。
       prim 的三階各一次 MES ⇒ 第 2 階是第 2 次呼叫。 */
    let failsLeft = 4;
    const { w, P } = await armed(n => {
      calls.push(n);
      if (n >= 2 && failsLeft > 0) { failsLeft--; return badRes; }
      return MES_OK;
    }, { qs: '?mode=prim' });

    const runP = P.run();
    // 等視窗跳出來（重試是真的重跑出圖＋settle，所以要等幾輪）
    for (let i = 0; i < 200 && !P.failOpen(); i++) await sleep(50);
    CHECK(P.failOpen() === true, '重試用完之後，警告視窗真的跳出來了');
    const body = w.document.getElementById('dst-fail-body').textContent;
    console.log('    視窗內文：' + JSON.stringify(body));
    CHECK(/第 2\/3 階/.test(body), '視窗講了是第幾階失敗', body.slice(0, 40));
    CHECK(/G/.test(body), '視窗講了是哪一個階名');
    CHECK(badRes === null ? /逾時/.test(body) : body.indexOf(badRes) >= 0,
      '視窗貼出儀器實際回了什麼', body.slice(0, 80));
    CHECK(/已經自動試了 4 次/.test(body), '視窗講了已經自動試過 4 次（1＋3）', body);
    CHECK(/檢查量測儀器/.test(body), '視窗叫人去檢查量測儀器');
    CHECK(P.rows().length === 1, '卡住的時候只有第 1 階進表（**沒有把第 2 階跳過去**）', P.rows().length);

    w.document.getElementById('dst-fail-retry').click();
    await runP;
    const rows = P.rows();
    console.log('    「再試一次」之後：' + JSON.stringify(rows.map(r => r.key))
      + '　MES 呼叫次數：' + calls.length);
    CHECK(rows.length === 3, '按「再試一次」之後這一輪跑完三階', rows.length);
    EQ(rows.map(r => r.key), ['R', 'G', 'B'], '三階的順序與階名都對，沒有缺漏');
    CHECK(rows.every(r => r.x === 0.3127), '每一階都拿到真的數據（沒有 null、沒有沿用上一階）');
    CHECK(P.runOk() === true, '完整跑完 ⇒ dstRunOk = true');
    CHECK(P.exportBlocked() === null, '可以匯出');
  }

  H('7d. 跳視窗之後按「中止整輪」⇒ 作廢');
  {
    const { w, P } = await armed(n => (n >= 2 ? MES_ER : MES_OK), { qs: '?mode=prim' });
    const runP = P.run();
    for (let i = 0; i < 200 && !P.failOpen(); i++) await sleep(50);
    CHECK(P.failOpen() === true, '視窗跳出來了');
    w.document.getElementById('dst-fail-abort').click();
    await runP;
    const voidTxt = w.document.getElementById('dst-void').textContent;
    console.log('    作廢橫幅：' + JSON.stringify(voidTxt));
    CHECK(P.runOk() === false, 'dstRunOk = false');
    CHECK(P.rows().length === 1, '只留下中止前量到的那一階（表格保留，供診斷）', P.rows().length);
    CHECK(/作廢/.test(voidTxt), '畫面上明講「作廢」', voidTxt.slice(0, 30));
    CHECK(/1\/3/.test(voidTxt), '講了量到第幾階', voidTxt.slice(0, 30));
    CHECK(P.exportBlocked() !== null, '匯出被擋', P.exportBlocked());
    CHECK(w.document.getElementById('dst-xlsx').disabled === true, 'XLSX 鈕是灰的');
    CHECK(w.document.getElementById('dst-csv').disabled === true, 'CSV 鈕是灰的');
    CHECK(P.exportXlsx() === false && P.exportCsv() === false, '直接呼叫匯出也會被拒絕');
    const say = w.document.getElementById('dst-say-run').textContent;
    CHECK(/作廢|完整跑完/.test(say), '說話行也講了原因', say.slice(0, 40));
    CHECK(P.failOpen() === false, '視窗已經收起來');
  }

  H('7e. 視窗開著時按「停止」也收得掉');
  {
    const { w, P } = await armed(n => (n >= 2 ? MES_ER : MES_OK), { qs: '?mode=prim' });
    const runP = P.run();
    for (let i = 0; i < 200 && !P.failOpen(); i++) await sleep(50);
    w.document.getElementById('dst-stop').click();
    await runP;
    CHECK(P.failOpen() === false, '按停止之後視窗收起來了（不會卡住）');
    CHECK(P.runOk() === false, '這一輪作廢');
  }

  /* ═══ 完整灰階掃描（慢，預設不跑）═══════════════════════════════════════ */
  if (process.env.DST_FULL === '1') {
    H('7f. 完整 8-bit 灰階掃描 259 階（DST_FULL=1，約 90 秒）');
    const t0 = Date.now();
    const { w, P } = await armed(n => (n === 130 ? MES_ER : MES_OK));
    const runP = P.run();
    for (let i = 0; i < 4000 && P.rows().length < 259 && !P.failOpen(); i++) await sleep(50);
    await runP;
    const rows = P.rows();
    console.log('    耗時 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒，列數 ' + rows.length);
    console.log('    首列 ' + JSON.stringify(rows[0]) + '  末三列 '
      + JSON.stringify(rows.slice(-3).map(r => r.key)));
    CHECK(rows.length === 259, '256 灰階 ＋ 3 純色 ＝ 259 列（中間那一次失敗被重試吃掉了）', rows.length);
    CHECK(rows.every(r => r.x !== null), '沒有任何一列是 null');
    EQ(rows.slice(-3).map(r => r.key), ['R', 'G', 'B'], '最後三列是三個純色端點');
    CHECK(P.runOk() === true, 'dstRunOk = true');
    CHECK(P.failOpen() === false, '單次失敗由自動重試吞掉，沒有打擾使用者');
  } else {
    console.log('\n  （完整 259 階掃描未跑：需要 DST_FULL=1）');
  }

  console.log('\n' + '═'.repeat(60));
  if (fail) { console.log('🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）'); process.exit(1); }
  console.log('✅ 全過：' + pass + ' 項');
  console.log('🔴 這支驗不到的：真的治具、真的 TCON、真的量測儀、真瀏覽器的版面與配色（另附截圖）。');
})().catch(e => { console.error(e); process.exit(2); });
