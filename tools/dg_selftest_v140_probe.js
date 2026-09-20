/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v140_probe.js — dgself v1.4.0 的驗收夾具（jsdom）
   ───────────────────────────────────────────────────────────────────────────
   驗 Bruce 2026-09-20 第三／四／五輪交辦的每一項（逐條對回他的原話）：

     A. 灰階索引一律 0…255（回傳 DG 的那個欄位）——「當然永遠都不會有 L1 啊」
     B. DG_EN 讀得到、顯示得出來，讀不到是「未知」不是「關閉」
     C. DG_EN 核取方塊可以強制開／關（read-modify-write，只動 bit0，寫完讀回確認）
     D. DG_EN=0 ⇒ 記錄 R=G=B＝送出值；DG_EN=1 ⇒ 需要 LUT，讀不到就留空（不冒充）
     E. XLSX 尾端追加 Drive_R/G/B 三欄，前 24 欄一格不動
     F. 連線卡片砍六項（警語／ID／匯流排讀回／可寫入位址／自動識別說明／slave 行）
        ＋ 型號 highlight ＋ 撞號下拉合併在型號旁
     G. 解析度：讀不到就說讀不到，**不再印 1920×1080（預設值）**
     H. 對位鈕關著時不帶 .pri（灰的）；而且**不限制「開始掃描」**
     I. 進度條：灰階 1-based `N/256`、RGB 純色獨立 `N/3`，分母不得是 259
     J. 回填完成訊息兩組分開講（灰階去哪、RGB 純色去第 3 部分）

   🔴 這一支只驗得到**邏輯與 DOM**。真的治具、真的 TCON、真的量測儀、真瀏覽器的
      版面與配色驗不到 —— 另附 tools/dg_selftest_v140_handoff.js（真 Chrome）。

   用法：node tools/dg_selftest_v140_probe.js
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
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 58 - n.length))); }
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

/* 假的 I2C Bridge。🔴 v1.4.0 新增 `rawwrite`（DG_EN 走的就是它）與
   **可變的讀回值**（`set(addr, bytes)`）—— 寫完要讀回確認，回的值必須跟著變，
   不然「讀回確認」這件事根本驗不到。 */
function makeFakeWs(readMap, opts) {
  opts = opts || {};
  const map = Object.assign({}, readMap);
  const wires = [], writes = [], raws = [];
  const ws = {
    readyState: 1, onmessage: null, sent: wires, writes, raws,
    set(addr, bytes) { map[addr] = bytes.slice(); },
    get(addr) { return (map[addr] || []).slice(); },
    send(txt) {
      const m = JSON.parse(txt);
      wires.push(m);
      let rep;
      if (m.type === 'read') {
        const key = (map[m.slave] && map[m.slave][m.addr]) || map[m.addr];
        let data = key ? key.slice() : new Array(m.len).fill(0x00);
        if (data.length > m.len) data = data.slice(0, m.len);
        while (data.length < m.len) data.push(0x00);
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data };
      } else if (m.type === 'write') {
        writes.push({ addr: m.addr, data: m.data.slice() });
        rep = { type: 'result', id: m.id, cmd: 'write', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'rawwrite') {
        raws.push({ addr: m.addr, awid: m.awid, data: m.data.slice() });
        /* 真 bridge 的行為：寫進去之後讀回來就是新值。不模擬這一點，
           「讀回確認」那一段會永遠是假的通過。 */
        if (!opts.rawFails) map[m.addr] = m.data.slice();
        rep = opts.rawFails
          ? { type: 'result', id: m.id, cmd: 'rawwrite', ok: false, status: 7, err: 'fake failure' }
          : { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0, transferred: m.data.length };
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
  return dom;
}

const MES_OK = 'OK00,P1,0,0.3127,0.3290,123.456';
function meter(mesFn) {
  return cmd => {
    if (/^MES/.test(cmd)) return mesFn ? mesFn() : MES_OK;
    if (/^MVS/.test(cmd)) return 'OK,60.00';
    return 'OK';
  };
}
/* 連得上、認得出 EM02A1、儀器掛著的一頁。`dg` 給 0x005D 的初值。 */
async function armed(opts) {
  opts = opts || {};
  const dom = await load(opts.qs);
  const w = dom.window, P = w.dstProbe;
  const base = { 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4] };
  if (opts.dg !== undefined) base[0x005D] = [opts.dg];
  if (opts.res) { base[0xFF26] = opts.res.slice(0, 2); base[0xFF28] = opts.res.slice(2, 4); }
  const ws = makeFakeWs(base, opts);
  P.__attachFakeWs(ws);
  P.setIcForTest(opts.ic || 'EM02A1', -1);
  P.__attachFakeMeter(meter(opts.mes));
  w.document.getElementById('dst-settle').value = '300';
  if (opts.bits) P.setBits(opts.bits);
  return { dom, w, P, ws };
}

(async function main() {

  const SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
  const I18N = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const CODE = strip(SRC), I18NCODE = strip(I18N);
  /* 🔴 只取 <body> 裡、且**剝掉 <script>** 的那一段當「畫面標記」。
     `SRC.split('<script')[0]` 會在 head 的第一個 <script src> 就切斷，
     拿到的是 head 而不是 body —— 那樣的檢查永遠成立，等於沒驗。 */
  const BODY = (/<body[^>]*>([\s\S]*)<\/body>/.exec(SRC) || [, ''])[1]
                 .replace(/<script[\s\S]*?<\/script>/g, '');

  /* ═══ A. 灰階索引一律 0…255 ═════════════════════════════════════════════ */
  H('A. 回傳 DG 的灰階欄一律是 0…255 的索引');
  {
    const { P } = await armed({});
    /* 三種位元深度各跑一次**完整的 dstDgRows 路徑**（不是直接看 plan）。 */
    for (const bits of [8, 10, 12]) {
      P.setBits(bits);
      const plan = P.plan(bits, 'gray');
      /* 用 plan 造出「跑完一輪」的列，走的是產品那一支 __setRowsForTest ＋ dgRows。 */
      P.__setRowsForTest(plan.map(p => ({
        key: p.key, idx: p.idx, r12: p.r, g12: p.g, b12: p.b,
        drv: { r: p.r, g: p.g, b: p.b, from: 'sent' },
        x: 0.3127, y: 0.329, lv: 100
      })));
      const g = P.dgRows().gray;
      CHECK(g.length === 256, bits + '-bit：回傳 256 筆', g.length);
      CHECK(g[0][0] === 0, bits + '-bit：第一筆是 0', g[0][0]);
      CHECK(g[1][0] === 1, bits + '-bit：🔴 第二筆是 **1**（不是 4、不是 16）', g[1][0]);
      CHECK(g[255][0] === 255, bits + '-bit：最後一筆是 255', g[255][0]);
      const set = {}; g.forEach(r => { set[r[0]] = 1; });
      let miss = null;
      for (let i = 0; i < 256; i++) if (!set[i]) { miss = i; break; }
      CHECK(miss === null, bits + '-bit：0…255 一個都不缺（dg.html 的 dgGrayGate 判準）', miss);
      /* 送進 IC 的值**不准跟著變** */
      CHECK(plan[1].r === 16, bits + '-bit：🔴 送進 IC 的第二階仍是 4096/256=16', plan[1].r);
      CHECK(plan[255].r === 4080, bits + '-bit：🔴 送進 IC 的最白階仍是 4080', plan[255].r);
    }
    /* 純函式那一半 */
    CHECK(P.idxOf12(0) === 0 && P.idxOf12(16) === 1 && P.idxOf12(4080) === 255,
      'dstIdxOf12：0→0、16→1、4080→255');
    CHECK(P.idxOf12(null) === null, 'dstIdxOf12：非數字回 null（不回 0）');
  }

  /* ═══ B. DG_EN 讀取與顯示 ═══════════════════════════════════════════════ */
  H('B. DG_EN 讀得到、顯示得出來；讀不到是「未知」不是「關閉」');
  {
    /* 逐顆位址照規格 §23.1 —— 表寫錯這裡就會叫 */
    const { P } = await armed({});
    const want = {
      E512AX: [0x002F, 0], V512SX: [0x005D, 0], EM01A1: [0x1160, 0],
      EM02A1: [0x005D, 0], VM02AX: [0x008A, 0]
    };
    const tbl = P.icTable();
    Object.keys(want).forEach(k => {
      const ic = tbl.filter(x => x.key === k)[0];
      CHECK(ic && ic.dgEn && ic.dgEn.addr === want[k][0] && ic.dgEn.bit === want[k][1],
        k + ' 的 DG_EN 位址 = 0x' + want[k][0].toString(16).toUpperCase() + ' bit0',
        ic && ic.dgEn);
    });
    CHECK(!tbl.filter(x => x.key === 'V007SX')[0].dgEn,
      'V007SX 沒有 dgEn（查不到就不填，不猜）');
    /* 🔴 DG_EN 的位址一個都不准落在寫入白名單裡 */
    tbl.forEach(ic => {
      if (!ic.dgEn) return;
      CHECK(!P.writeAllowedIn(P.wrRangesOfKey(ic.key, -1), ic.dgEn.addr, 1),
        ic.key + '：DG_EN 位址不在 dstWriteReg 的白名單裡（出圖那條路碰不到它）');
    });
    /* 解碼：EM02 的 bit 配置（en=0, depth=2, target=3） */
    const d = { addr: 0x005D, bit: 0, depthBit: 2, targetBit: 3 };
    EQ(P.dgDecode(0x00, d), { state: 'off', raw: 0, depth: 10, target: 'offset', whyKey: null }, '0x00 ⇒ 關、10-bit、Offset');
    EQ(P.dgDecode(0x0D, d), { state: 'on', raw: 13, depth: 12, target: 'target', whyKey: null }, '0x0D ⇒ 開、12-bit、Target');
  }
  {
    // 讀到 1 ⇒ 開；讀到 0 ⇒ 關；全 0xFF ⇒ 未知（不是開）
    const a = await armed({ dg: 0x01 }); await a.P.readDgEn();
    CHECK(a.P.dgEnState().state === 'on', '讀回 0x01 ⇒ 開啟中', a.P.dgEnState());
    CHECK(/開啟中/.test(a.P.dgText()), '畫面上寫「開啟中」', a.P.dgText());
    CHECK(!a.w.document.getElementById('dst-dg-warn').classList.contains('dst-hidden'),
      'DG 開著 ⇒ 那一行黃字會出現');

    const b = await armed({ dg: 0x00 }); await b.P.readDgEn();
    CHECK(b.P.dgEnState().state === 'off', '讀回 0x00 ⇒ 關閉', b.P.dgEnState());
    CHECK(b.w.document.getElementById('dst-dg-warn').classList.contains('dst-hidden'),
      'DG 關著 ⇒ 黃字不佔位');

    const c = await armed({ dg: 0xFF }); await c.P.readDgEn();
    CHECK(c.P.dgEnState().state === 'unknown',
      '🔴 讀回全 0xFF ⇒ **未知**（不是「開啟中」）', c.P.dgEnState());
    CHECK(/未知/.test(c.P.dgText()) && !/開啟中|關閉/.test(c.P.dgText()),
      '畫面上寫「未知」並說明原因', c.P.dgText());

    // 認不出 IC ⇒ 未知，而且核取方塊是停用的
    const e = await load();
    CHECK(e.window.dstProbe.dgEnState().state === 'unknown', '沒連線 ⇒ 未知');
    CHECK(e.window.document.getElementById('dst-dg-ck').disabled === true,
      '沒連線 ⇒ 強制開關停用');
  }

  /* ═══ C. DG_EN 強制開／關 ═══════════════════════════════════════════════ */
  H('C. 核取方塊強制開／關：只動 bit0、寫完讀回確認');
  {
    /* 純函式：read-modify-write 與守門 */
    const P0 = (await armed({})).P;
    CHECK(P0.dgEnFrame(0xB6, 0, true) === 0xB7, '0xB6 開 bit0 ⇒ 0xB7（其餘 7 位不動）', P0.dgEnFrame(0xB6, 0, true));
    CHECK(P0.dgEnFrame(0xB7, 0, false) === 0xB6, '0xB7 關 bit0 ⇒ 0xB6', P0.dgEnFrame(0xB7, 0, false));
    CHECK(P0.dgEnFrame(null, 0, true) === null, '非數字 ⇒ null（不寫）');
    CHECK(P0.dgEnWriteOk(0xB6, 0xB7, 0) === true, '只有 bit0 變 ⇒ 放行');
    CHECK(P0.dgEnWriteOk(0xB6, 0xF7, 0) === false, '🔴 bit4 也變了 ⇒ 擋下（這是最後一道防線）');
    CHECK(P0.dgEnWriteOk(0xB6, 0xB6 ^ 0x80, 0) === false, '🔴 bit7 變了 ⇒ 擋下');

    /* 真的按一次：0xB6（DG 關）⇒ 勾起來 ⇒ 應寫 0xB7 並讀回 on */
    const { w, P, ws } = await armed({ dg: 0xB6 });
    await P.readDgEn();
    CHECK(P.dgEnState().state === 'off', '起始狀態：關（0xB6 的 bit0 = 0）');
    const ok = await P.setDgEn(true);
    CHECK(ok === true, '強制開啟回報成功');
    CHECK(ws.raws.length === 1, '只送出一筆寫入', ws.raws.length);
    EQ(ws.raws[0], { addr: 0x005D, awid: 2, data: [0xB7] },
      '🔴 寫的是 0x005D ← 0xB7（read-modify-write，只動 bit0）');
    CHECK(ws.writes.length === 0, '🔴 沒有走 `write`（那條會被 bridge 白名單擋掉）');
    CHECK(P.dgEnState().state === 'on', '寫完讀回來是「開」', P.dgEnState());
    CHECK(w.document.getElementById('dst-dg-ck').checked === true, '核取方塊跟著變成勾選');

    /* 關回去 */
    const ok2 = await P.setDgEn(false);
    CHECK(ok2 === true && P.dgEnState().state === 'off', '再按一次 ⇒ 關回去');
    EQ(ws.raws[1], { addr: 0x005D, awid: 2, data: [0xB6] }, '關回去寫的是 0xB6（原值原封不動）');

    /* 已經是那個狀態 ⇒ 一個 byte 都不寫 */
    const n = ws.raws.length;
    await P.setDgEn(false);
    CHECK(ws.raws.length === n, '已經是關的 ⇒ 不重複寫');

    /* 寫失敗 ⇒ 不准靜默當成功 */
    const f = await armed({ dg: 0xB6, rawFails: true });
    await f.P.readDgEn();
    const bad = await f.P.setDgEn(true);
    CHECK(bad === false, '🔴 bridge 回 ok:false ⇒ 回報失敗（不是靜默成功）');
    CHECK(f.P.dgEnState().state === 'off', '失敗後畫面回到 IC 的真實狀態（仍是關）');
    CHECK(/失敗/.test(f.w.document.getElementById('dst-say-link').textContent),
      '畫面上有講失敗', f.w.document.getElementById('dst-say-link').textContent);

    /* 不跳確認視窗 */
    CHECK(!/confirm\s*\(/.test(CODE), '整頁程式碼沒有 confirm(（強制開關也不例外）');
  }

  /* ═══ D. 依 DG_EN 決定記錄的 RGB ════════════════════════════════════════ */
  H('D. DG_EN=0 ⇒ R=G=B＝送出值；DG_EN=1 ⇒ 需要 LUT，讀不到就留空');
  {
    const { P } = await armed({ dg: 0x00 });
    await P.readDgEn();
    EQ(P.driveOf(128, 2048, 2048, 2048), { r: 2048, g: 2048, b: 2048, from: 'sent' },
      'DG 關 ⇒ 驅動碼就是送出去的 12-bit 值（三通道相同）');

    const b = await armed({ dg: 0x01 });
    await b.P.readDgEn();
    EQ(b.P.driveOf(128, 2048, 2048, 2048), { r: null, g: null, b: null, from: 'lutNA' },
      '🔴 DG 開 ＋ 讀不到 LUT ⇒ **留空**（不拿送出值冒充）');

    const c = await armed({ dg: 0xFF });
    await c.P.readDgEn();
    EQ(c.P.driveOf(128, 2048, 2048, 2048), { r: null, g: null, b: null, from: 'unknown' },
      'DG 狀態未知 ⇒ 一樣留空');

    /* 🔴 送進 IC 的值在三種狀態下都一樣 —— 這是整件事的前提 */
    CHECK(!/dstDgLut\s*=\s*[^n]/.test(CODE) || /var dstDgLut = null/.test(CODE),
      'dstDgLut 目前沒有任何寫入者（LUT 讀取未實作，程式碼如實反映）');
    CHECK(/dstSetRgb12\(p\.r, p\.g, p\.b\)/.test(CODE),
      '🔴 掃描送出去的仍然是 plan 的 r/g/b，沒有被 DG 狀態動過');
  }

  /* ═══ E. XLSX 欄位 ══════════════════════════════════════════════════════ */
  H('E. XLSX 尾端追加 Drive_R/G/B，前 24 欄一格不動');
  {
    const { P } = await armed({ dg: 0x00 });
    await P.readDgEn();
    const head = P.exportHeader();
    EQ(head.slice(0, 24), ['Gray', 'W_x', 'W_y', 'W_Y', 'W_T', 'W_duv',
      'R_x', 'R_y', 'R_Y', 'G_x', 'G_y', 'G_Y', 'B_x', 'B_y', 'B_Y',
      'C_x', 'C_y', 'C_Y', 'M_x', 'M_y', 'M_Y', 'Y_x', 'Y_y', 'Y_Y'], '前 24 欄逐字不動');
    EQ(head.slice(24), ['Drive_R', 'Drive_G', 'Drive_B'], '第 25–27 欄是 Drive_R/G/B');

    P.__setRowsForTest([
      { key: 'L0', idx: 0, r12: 0, g12: 0, b12: 0, drv: { r: 0, g: 0, b: 0, from: 'sent' }, x: .31, y: .33, lv: 1 },
      { key: 'L1', idx: 1, r12: 16, g12: 16, b12: 16, drv: { r: 16, g: 16, b: 16, from: 'sent' }, x: .31, y: .33, lv: 2 },
      { key: 'L255', idx: 255, r12: 4080, g12: 4080, b12: 4080, drv: { r: 4080, g: 4080, b: 4080, from: 'sent' }, x: .31, y: .33, lv: 300 }
    ]);
    const d = P.exportRows();
    EQ(d.rows[0].slice(0, 4), [0, 0.31, 0.33, 1], 'L0 那一列的 Gray/x/y/Y 沒變');
    EQ(d.rows[1].slice(24), [16, 16, 16], 'L1 的 Drive_R/G/B ＝ 16（DG 關 ⇒ 送出值）');
    EQ(d.rows[2].slice(24), [4080, 4080, 4080], 'L255 的 Drive_R/G/B ＝ 4080');
    EQ(d.rows[0][0], 0, 'Gray 欄仍然是 0…255（本來就是，沒被這一版動到）');

    /* DG 開、LUT 讀不到 ⇒ 三欄留空（不是 0） */
    const b = await armed({ dg: 0x01 });
    await b.P.readDgEn();
    b.P.__setRowsForTest([{ key: 'L8', idx: 8, r12: 128, g12: 128, b12: 128,
      drv: b.P.driveOf(8, 128, 128, 128), x: .31, y: .33, lv: 5 }]);
    EQ(b.P.exportRows().rows[0].slice(24), ['', '', ''],
      '🔴 讀不到 LUT ⇒ 三欄是空字串，**不是 0**（0 會被當成「量到黑」）');
  }

  /* ═══ F. 連線卡片砍六項 ═════════════════════════════════════════════════ */
  H('F. 連線卡片：型號 highlight、六項移除、撞號下拉合併');
  {
    const { w, P } = await armed({});
    await P.scanIdentify();
    const icEl = w.document.getElementById('dst-v-ic');
    CHECK(icEl.classList.contains('dst-icname'), '型號用 .dst-icname（大字高亮）');
    CHECK(/EM02A1/.test(icEl.textContent), '型號直接印出來', icEl.textContent);
    CHECK(!w.document.getElementById('dst-alt').classList.contains('dst-hidden'),
      '撞號 ⇒ 下拉出現（就在型號旁邊）');
    CHECK(w.document.querySelector('.dst-icline').contains(w.document.getElementById('dst-alt')),
      '🔴 下拉與型號在**同一行**（合併，不另開一區）');

    ['dst-auto-note', 'dst-alt-why', 'dst-alt-box', 'dst-fixed',
     'dst-v-id', 'dst-v-comm', 'dst-v-wr'].forEach(id => {
      CHECK(w.document.getElementById(id) === null, '已移除：#' + id);
    });
    CHECK(!/dst-warn-box/.test(BODY), '寫入警語那張卡整個不在 HTML 裡');
    ['dst.unverified', 'dst.kvId', 'dst.idNone', 'dst.kvWr', 'dst.wrNone',
     'dst.kvComm', 'dst.commNote', 'dst.autoNote', 'dst.altWhy', 'dst.altPick',
     'dst.fixedLine', 'dst.icAuto', 'dst.resDefault', 'dst.resFromReg'].forEach(k => {
      CHECK(I18N.indexOf("'" + k + "':") < 0, 'i18n 已刪除 ' + k);
      CHECK(CODE.indexOf("'" + k + "'") < 0, '頁面也不再引用 ' + k);
    });
    /* 功能沒有掉：匯流排讀回測試與 ID 比對照跑 */
    CHECK(typeof P.commTest === 'function' && /function dstCommTest/.test(CODE),
      '🔴 匯流排讀回測試**功能還在**（只是不佔畫面）');
    CHECK(/function dstMatchIc/.test(CODE), '🔴 ID 比對功能還在');
  }

  /* ═══ G. 解析度 ═════════════════════════════════════════════════════════ */
  H('G. 解析度：讀不到就說讀不到，不再冒充 1920×1080');
  {
    const e = await load();
    const txt = e.window.document.getElementById('dst-v-res').textContent;
    CHECK(/讀不到/.test(txt), '🔴 還沒讀之前就是「讀不到」（不是「1920 x 1080（預設值）」）', txt);
    CHECK(!/預設值/.test(txt), '畫面上沒有「預設值」這三個字', txt);

    /* 讀得到 tm bank ⇒ 用它，並標明來源 */
    const a = await armed({ res: [0x00, 0x0F, 0x38, 0x04] });   // 0xF00=3840, 0x438=1080
    await a.P.readRes();
    CHECK(a.P.resState().from === 'tm' && a.P.resState().w === 3840 && a.P.resState().h === 1080,
      'tm bank 0xFF26/0xFF28 讀到 3840x1080', a.P.resState());
    CHECK(/3840 x 1080/.test(a.P.resText()) && /0xFF26/.test(a.P.resText()),
      '畫面上寫出數字與來源', a.P.resText());

    /* tm 讀到不合理 ⇒ 退到 sys bank（EM02 是 byte 對齊的那一種） */
    const b = await armed({ ic: 'EM02A1' });
    b.ws.set(0xFF26, [0x00, 0x00]); b.ws.set(0xFF28, [0x00, 0x00]);   // 0x0 ⇒ insane
    b.ws.set(0x0013, [0x80, 0x07, 0x38, 0x04]);                       // 1920 / 1080
    await b.P.readRes();
    CHECK(b.P.resState().from === 'sys' && b.P.resState().w === 1920 && b.P.resState().h === 1080,
      'tm 不合理 ⇒ 退到 sys bank 0x0013（EM02 打包）', b.P.resState());

    /* 兩條都不合理 ⇒ 說讀不到 */
    const c = await armed({ ic: 'VM02AX' });
    c.ws.set(0xFF26, [0x00, 0x00]); c.ws.set(0xFF28, [0x00, 0x00]);
    const r = await c.P.readRes();
    CHECK(r === null && c.P.resState().from === 'none', '兩條都不行 ⇒ 回 null、狀態是 none');
    CHECK(/讀不到/.test(c.P.resText()), '🔴 畫面如實說讀不到', c.P.resText());
    CHECK(/1920x1080|1920 x 1080/.test(c.P.resText()),
      '並且講清楚十字仍以 1920x1080 置中（不藏 fallback）', c.P.resText());

    /* sys bank 兩種打包的解碼（純函式） */
    EQ(P_sys(), { em01: { w: 1920, h: 1080 }, em02: { w: 1920, h: 1080 } }, 'sys bank 兩種打包都解得對');
    function P_sys() {
      const P = c.P;
      // EM01/E512：hres = b0 | b1[3:0]<<8 ；vres = b1[7:4] | b2<<4
      const em01 = P.sysResDecode([0x80, 0x87, 0x43], 'em01');   // 0x780=1920, 0x438=1080
      const em02 = P.sysResDecode([0x80, 0x07, 0x38, 0x04], 'em02');
      return { em01, em02 };
    }
  }

  /* ═══ H. 對位鈕與掃描條件 ═══════════════════════════════════════════════ */
  H('H. 對位鈕關著時是灰的；而且不限制「開始掃描」');
  {
    const tag = /<button[^>]*id="dst-align"[^>]*>/.exec(BODY)[0];
    const cls = /class="([^"]*)"/.exec(tag)[1];
    console.log('    對位鈕 class：' + JSON.stringify(cls));
    CHECK(!/\bpri\b/.test(cls), '🔴 關著的時候不帶 .pri（不再是藍底，看起來不像被按下去）', cls);
    CHECK(/dst-btn/.test(cls), '仍然是一般的 .dst-btn');
    CHECK(/\.dst-btn\.on[^}]*#064e3b|\.dst-btn\.on,/.test(SRC), '開啟時才變綠（.dst-btn.on）');

    /* 🔴 功能面：對位畫面關著也照樣能掃 */
    const { w, P } = await armed({});
    await P.scanIdentify();
    CHECK(P.showing() === null, '起始：沒有任何畫面是開著的');
    CHECK(w.document.getElementById('dst-run').disabled === false,
      '🔴 對位畫面沒開 ⇒ 「開始掃描」**仍然可以按**');
    await P.alignToggle();
    CHECK(P.showing() === 'align', '按一下 ⇒ 對位畫面開著');
    CHECK(w.document.getElementById('dst-run').disabled === false, '開著也可以按');
    await P.alignToggle();
    CHECK(P.showing() === null, '再按一下 ⇒ 關掉');
    CHECK(w.document.getElementById('dst-run').disabled === false,
      '🔴 他自己關掉之後 ⇒ 還是可以按（Bruce 明確要求）');
    CHECK(!/dstShowing[^\n]*dst-run|dst-run[^\n]*dstShowing/.test(CODE),
      '程式碼裡「開始掃描」的啟用條件與 dstShowing 無關');
  }

  /* ═══ I. 進度計數 ═══════════════════════════════════════════════════════ */
  H('I. 進度：灰階 N/256（1-based）、RGB 純色 N/3，分母不得是 259');
  {
    const { P } = await armed({});
    const plan = P.plan(8, 'gray');
    EQ(P.planCounts(plan), { gray: 256, prim: 3 }, '一輪 ＝ 灰階 256 ＋ RGB 純色 3');
    CHECK(P.progCalc('gray', 1, 256, 'L0').text === 'L0   1/256',
      '🔴 跑 L0 時顯示 1/256（不是 0/259）', P.progCalc('gray', 1, 256, 'L0').text);
    CHECK(P.progCalc('gray', 256, 256, 'L255').text === 'L255   256/256',
      '最後一階是 256/256', P.progCalc('gray', 256, 256, 'L255').text);
    const pt = P.progCalc('prim', 1, 3, 'R').text;
    CHECK(/RGB 純色/.test(pt) && /1\/3/.test(pt), '純色那組獨立計數：RGB 純色 R 1/3', pt);
    CHECK(!/259/.test(P.progCalc('gray', 1, 256, 'L0').text + pt), '🔴 兩種字串裡都不會出現 259');
    /* 與回填訊息同一組字 */
    CHECK(/'dst\.primGroup'/.test(SRC), '進度用的是共用的 dst.primGroup');
  }
  {
    /* 真的跑一輪 prim 模式，收集進度字串 */
    const { w, P } = await armed({ qs: '?mode=prim' });
    const seen = [];
    const el = w.document.getElementById('dst-progtxt');
    const mo = new w.MutationObserver(() => { const t = el.textContent; if (t && seen[seen.length - 1] !== t) seen.push(t); });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    await P.run();
    mo.disconnect();
    /* 🔴 只收「分數在字串結尾」的那幾格 —— 前置步驟的字樣本身就帶分數
       （「設定量測儀 1/9：建立通訊」），那是另一回事，不是掃描進度。 */
    const frac = seen.filter(t => /\d+\/\d+$/.test(t.trim()));
    console.log('    進度字串（有分數的）：' + JSON.stringify(frac));
    CHECK(frac.length >= 3, '至少三格有分數', frac.length);
    CHECK(/1\/3/.test(frac[0]), '第一格是 1/3', frac[0]);
    CHECK(frac.every(t => /RGB 純色/.test(t)), '每一格都標明是 RGB 純色那一組', frac);
    CHECK(!frac.some(t => /259|\/259/.test(t)), '🔴 沒有任何一格出現 259');
  }

  /* ═══ J. 回填完成訊息 ═══════════════════════════════════════════════════ */
  H('J. 回填完成：兩組分開講');
  {
    /* dg.html 那一端的事實：prim 一律進第 3 部分 */
    const DG = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');
    CHECK(/function dgApplyGrayTailPrim[\s\S]{0,400}第 3 部分/.test(DG),
      '🔴 dg.html 的 dgApplyGrayTailPrim 自己就說純色進「第 3 部分」（Bruce 猜對了）');
    CHECK((DG.match(/dgApplyGrayTailPrim\(meta\.prim/g) || []).length
        + (DG.match(/dgApplyGrayTailPrim\(meta\.prim, at\)/g) || []).length >= 2,
      '三個目的地都會走到它');

    CHECK(/'dst\.dgSentTwo'/.test(SRC), '頁面用了兩組分開講的那個 key');
    ['zh-TW', 'zh-CN', 'en'].forEach(L => {
      const i = I18N.indexOf("'dst.dgSentTwo':");
      CHECK(i > 0 && I18N.slice(i, i + 900).indexOf("'" + L + "'") >= 0, 'dst.dgSentTwo 有 ' + L);
    });
    CHECK(/第 3 部分|part 3/.test(I18N.slice(I18N.indexOf("'dst.dgSentTwo':"), I18N.indexOf("'dst.dgSentTwo':") + 900)),
      '訊息裡明講純色進第 3 部分');
    CHECK(/RGB 純色/.test(I18N.slice(I18N.indexOf("'dst.primGroup':"), I18N.indexOf("'dst.primGroup':") + 200)),
      '措辭與進度條一致（共用 dst.primGroup）');
  }

  /* ═══ 三語齊備（新增的 key）═════════════════════════════════════════════ */
  H('三語齊備：v1.4.0 新增的每一個 key');
  {
    ['dst.kvDg', 'dst.dgForce', 'dst.dgOn', 'dst.dgOff', 'dst.dgUnknown',
     'dst.dgLutDepth', 'dst.dgLutTarget', 'dst.dgLutOffset',
     'dst.dgWhyNoIc', 'dst.dgWhyNoAddr', 'dst.dgWhyIdle', 'dst.dgWhyReadFail',
     'dst.dgWarnOn', 'dst.dgWriteMismatch', 'dst.dgWriteFail', 'dst.dgNoLut',
     'dst.resFromTm', 'dst.resFromSys', 'dst.resNone',
     'dst.primGroup', 'dst.grayGroup', 'dst.pgDg', 'dst.dgSentTwo'].forEach(k => {
      const i = I18N.indexOf("'" + k + "':");
      if (i < 0) { CHECK(false, k + ' 存在'); return; }
      const entry = I18N.slice(i, i + 1200).split('\n  \'')[0];
      ['zh-TW', 'zh-CN', 'en'].forEach(L =>
        CHECK(entry.indexOf("'" + L + "'") >= 0, k + ' 有 ' + L));
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log(fail === 0 ? ('✅ 全過：' + pass + ' 項') : ('🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）'));
  console.log('🔴 這支驗不到的：真的 TCON、真的量測儀、真的 I2C Bridge。');
  console.log('   DG_EN 的讀寫在**真機上**會怎樣，只有 Bruce 的硬體能回答。');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
