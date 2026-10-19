#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_en01tft.js — datamap v1.35.25 EN01（RM81008）③ TFT 接線圖
   Bruce 10/18 21:1x：「Data Mapping 的網頁，現在 EN01 都還沒有對應的 TFT 接線圖…要注意所有的細節，包含上面的 T-CON out、SD out，
   它可能已經變成是 12 循環了」（派工 237564393831280640）
   A 矩陣（模型）：EN01 × Gate（Single／Dual／Tri／MUX4／MUX6＋RD_MODE 1/2 的 Source MUX 面板）× FORCE_DE_SEL 12 種 × Mirror × CHRB
       × code 樣式（含 X＝255、132～254 未定義、負 pixel）× code header（全段／只有 P1）：
       每條 line、每個 SW、每個 Data 的接線位置＝② 表格名稱的位置（DM.poolIdx，Mirror＝−1−k），名稱＝表格名稱（CHRB 換 R↔B），X／未定義不畫；
       之後每個循環整組平移 12×SW 數個 subpixel。
   B 畫面（SVG）：主循環每條 drain 的名稱＝模型；接到的格子名稱＝表格名稱（非 Mirror）；SD Out／TCON Out 標號＝D12(組)+k（MUX：腳位＋SWk）；
       輸出對調／SHL 反向／CH1 在右 的 TCON 標號；Line 列名；Hand 關、RD_MODE 不支援的說明。
   C E507 xlsm 範例逐格比對：tools/datamap_en01_xlsm_examples.json（work/xlsm_examples.py 由 E507_rt7_sram_w_hand(1T4P).xlsm 抽出 70 組、10287 格，
       每格已推回是哪個 SW、哪一欄 S、第幾個循環），網頁模型同一格名稱必須相同（Mirror 範例只比第 0 個循環：xlsm 後面的欄是時間順序，Mirror 時在左邊）。
   v1.35.26（Bruce 10/19 09:08 選 A「改成原廠 TYPE 公式＋三層畫法」；派工 237743897837056000）：
     MUX 的 Data 線位置改照原廠 TYPE 公式（下方 MUXP／enc，獨立於網頁、照 assistant_kb SourceMUX §2.1 抄）；A／B／C 對 MUX 逐一跑 TYPE 1／2；
     B 加三層畫法（每條 Data 線一顆 demux TFT＝它的 SW 與腳位、腳位匯流排、SW 匯流排）；
     D（新）E507 xlsm NORMAL 範例（非 Mirror、可由 TYPE 1 或 2 公式 0 誤差解釋的那幾組）：xlsm 每格（腳位、SW、循環 ⇒ subpixel 名稱）
       ＝網頁模型「那條 Data 線收到的名稱」且 drain 直下（位置＝Data 線本身），畫出來的循環再比 SVG 的 drain、SD 標號、demux TFT。
     E（新）MUX TYPE 切換列：只在 EN01 MUX 模式存在；MUX4 的 TYPE 2 停用；切換後模型走線改變。
   v1.35.26：③ 的檢查改用 w.dmPvRender()（只重畫 ③）；jsdom 整頁 dmRender 主要耗在 ② EN01 288 個下拉（MUX4 一次約 2 分鐘），③ 本身約 1.6 秒。Hand 關／RD_MODE 4／鎖定／換型號仍用整頁 render。
   用法：node tools/check_datamap_en01tft.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
const FIX = path.join(__dirname, 'datamap_en01_xlsm_examples.json');
let pass = 0, fail = 0; const fails = [];
const QUICK = !!process.env.EN01TFT_QUICK;   // 快速模式：略過 A 矩陣、B 只跑 Mirror 0／CHRB 0 與 CH1 在右（版面小改後的冒煙測試；正式回歸不要設）
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 40) fails.push(m); } };
/* 原廠 TYPE 公式（E507 MUX2!A97／A128、MUX3!A97／A128、MUX4!AA107、MUX6!AJ144／AV183／AW202）：Data 線欄（1 起）＝12k·循環＋2k·⌊腳位/2⌋＋P[腳位 mod 2][SW] */
const MUXP = { 2: { 1: [[1, 2], [3, 4]], 2: [[1, 3], [2, 4]] }, 3: { 1: [[1, 2, 3], [4, 5, 6]], 2: [[1, 5, 3], [4, 2, 6]] }, 4: { 1: [[1, 3, 5, 7], [2, 4, 6, 8]] }, 6: { 1: [[1, 2, 3, 4, 5, 6], [10, 11, 12, 7, 8, 9]], 2: [[1, 11, 3, 7, 5, 9], [10, 2, 12, 4, 8, 6]] } };
const tabOf = (M, ty) => (MUXP[M][ty] || MUXP[M][1]);
const enc = (M, ty, c, j, b) => 12 * M * (b || 0) + 2 * M * Math.floor(c / 2) + tabOf(M, ty)[c % 2][j] - 1;   // 0 起
const dec = (M, ty, q) => { const g = Math.floor(q / (2 * M)), r = q % (2 * M) + 1, T = tabOf(M, ty); for (let par = 0; par < 2; par++) for (let j = 0; j < M; j++) if (T[par][j] === r) return { c: 2 * g + par, j }; return null; };
const TYS = M => M ? (MUXP[M][2] ? [1, 2] : [1]) : [1];
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; fails.push('jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = !!v; else e.value = v; e.dispatchEvent(new w.Event('change')); };
  fire('dm-model', 'EN01');
  const GATES = [[0, 'gate'], [1, 'gate'], [1, 'mux'], [2, 'gate'], [2, 'mux'], [3, 'gate'], [5, 'gate']];
  const DES = [0x01, 0x02, 0x04, 0x08, 0x0E, 0x10, 0x20, 0x40, 0x80, 0x06, 0x0C, 0x03];
  let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const PATS = [
    () => rnd(132),                                                                       // 合法 0～131（含負 pixel）
    () => { const x = rnd(10); return x === 0 ? 0xFF : (x === 1 ? 132 + rnd(123) : rnd(132)); }   // 夾 X（255）與 132～254
  ];
  /* v1.35.28：MUX2／MUX3 改由暫存器判定（PANEL_MODE＝3＋SUB_PANEL_MODE[0]；TYPE＝SUB[2]），不再用 ③ 手動面板選項 */
  const panApply = (s, rd, pan, ty) => { if (pan === 'mux' && (rd === 1 || rd === 2)) { s.panel = 3; s.subPanel = (rd === 1 ? 1 : 0) | (ty === 2 ? 4 : 0); } return s; };
  const setState = (rd, de, mi, cb, pat, pan, ty) => { const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.deSel = de; s.rd = rd; s.mirror = mi; s.chrb = cb; s.rvsL = mi ? 0xFF : 0; for (let i = 0; i < 288; i++) s['e' + i] = PATS[pat](); return panApply(s, rd, pan, ty); };
  const rb = n => DM.rbSwapName(n);
  /* ── A：模型矩陣 ── */
  let nA = 0;
  for (const [rd, pan] of (QUICK ? [] : GATES)) for (const ty of TYS((rd === 3 || rd === 5 || pan === 'mux') ? DM.en01Phases(rd) : 0)) {
    w.dmPvMuxType(ty);
    for (const seg of [null, { p2: true, p3: false }]) {
      w.dmState.en01Seg = seg;
      for (const de of DES) for (const mi of [0, 1]) for (const cb of [0, 1]) for (let pat = 0; pat < 2; pat++) {
        const s = setState(rd, de, mi, cb, pat, pan, ty); w.dmState.cur = s;
        const P = w.dmPvModel(), np = DM.en01Phases(rd), M = (rd === 3 || rd === 5 || pan === 'mux') && np > 1 ? np : 0, NG = M ? 1 : np, n = 12 * (M || 1), sh = n * NG;
        const id = 'rd' + rd + pan + (M ? '|TYPE' + ty : '') + '|de' + de.toString(16) + '|m' + mi + '|c' + cb + '|p' + pat + '|seg' + (seg ? 'P1' : 'all');
        ok(P.ok && P.en01 && P.NG === NG && P.period === n && P.shift === sh && (P.mux | 0) === M && (!M || P.muxType === ty), id + ' 模型參數 NG/period/shift/mux/TYPE');
        const lines = seg ? [0, 1] : [0, 1, 2, 3];
        ok(P.nl === lines.length, id + ' line 數 ' + P.nl);
        lines.forEach(L => {
          for (let j = 0; j < np; j++) for (let c = 0; c < 12; c++) {
            const r = L * 6 + j, T = DM.en01RowT(s, r), v = DM.en01CellView(s, r, c, T), raw = s['e' + (r * 12 + c)];
            const row = P.rows.filter(x => x.k === L && x.gi === (M ? 0 : j))[0];
            if (!row) { ok(false, id + ' 缺列 L' + L + ' SW' + j); continue; }
            for (let b = 0; b < 2; b++) {
              const p = M ? enc(M, ty, c, j, b) : c + n * b, cell = row.names[p]; nA++;
              if (!v.std || raw >= 132) { ok(cell && cell.off, id + ' L' + L + ' SW' + (j + 1) + ' Data' + (c + 1) + ' 值 ' + raw + ' 應不畫線'); continue; }
              const k = DM.poolIdx(12, T + 1, raw), want = (mi ? -1 - k : k) + sh * b;
              ok(cell && !cell.off && cell.t === want, id + ' L' + L + ' SW' + (j + 1) + ' Data' + (c + 1) + ' 循環' + b + ' 位置 ' + (cell && cell.t) + ' ≠ ' + want);
              if (b === 0) ok(cell && cell.name === (cb ? rb(v.txt) : v.txt), id + ' L' + L + ' SW' + (j + 1) + ' Data' + (c + 1) + ' 名稱 ' + (cell && cell.name) + ' ≠ 表格 ' + v.txt);
            }
          }
        });
      }
    }
  }
  w.dmState.en01Seg = null;
  console.log('A 模型矩陣：' + nA + ' 格檢查');
  /* ── B：畫面 ── */
  const svgCheck = (rd, pan, de, mi, cb, drv, ty = 1) => {
    w.dmPvMuxType(ty); fire('dm-pv-swap', !!drv.swap); fire('dm-pv-drv', drv.rev ? 'r' : 'f'); fire('dm-pv-first', drv.first ? 'r' : 'l');
    const s = setState(rd, de, mi, cb, 1, pan, ty); w.dmState.cur = s; w.dmPvRender();
    const P = w.dmPvModel(), svg = $('dm-pv-tft'), n = P.period, M = P.mux | 0, NG = P.NG, nD = +svg.getAttribute('data-nd'), id = 'SVG rd' + rd + pan + (P.mux ? ' TYPE' + ty : '') + ' de' + de.toString(16) + ' m' + mi + ' c' + cb + ' ' + JSON.stringify(drv);
    ok(+svg.getAttribute('data-plines') === n && +svg.getAttribute('data-ng') === NG, id + ' data-plines/ng');
    ok($('dm-tftbody').className.indexOf('hidden') < 0 && $('dm-tftnote').className.indexOf('hidden') >= 0, id + ' TFT 卡應顯示圖');
    // drain 名稱＝模型（主循環，非翻圖）
    const ud = gi => NG === 3 ? 'g' + (gi + 1) : (gi ? 'd' : 'u');
    if (!drv.first) {
      [...svg.querySelectorAll('path[data-w]')].forEach(e => {
        const m = /^(\d+):D(\d+):(\w+):(.*)$/.exec(e.getAttribute('data-w')); if (!m) return;
        const k = +m[1] - 1, p = +m[2] - 1, gi = NG === 3 ? +m[3].slice(1) - 1 : (m[3] === 'd' ? 1 : 0);
        if (k >= P.nl || p >= n) return;
        // 輸出對調／SHL：第 p 條線收到 TCON 第 src 筆（path[data-dl] 的 data-src），drain 接到那筆在 ② 指定的 subpixel（同 MNT pvLineSrc）
        const lp = svg.querySelector('path[data-dl="' + (p + 1) + '"]'), src = lp ? +lp.getAttribute('data-src') - 1 : p;
        const row = P.rows.filter(x => x.k === k && x.gi === gi)[0], cell = row && row.names[src];
        ok(cell && !cell.off && cell.name === m[4], id + ' drain ' + e.getAttribute('data-w') + '（收第 ' + (src + 1) + ' 筆）≠ 模型 ' + (cell && cell.name));
      });
      // 接到的格子（非 Mirror、未對調／SHL）：格子名稱（data-pv 軸名）＝表格名稱（CHRB 前的原名）
      if (!mi && !drv.swap && !drv.rev) {
        [...svg.querySelectorAll('rect[data-in]')].forEach(e => {
          const ins = (e.getAttribute('data-in') || '').split(',').filter(Boolean); if (ins.length !== 1) return;
          const m = /^D(\d+)(\w+)$/.exec(ins[0]), p = +m[1] - 1; if (p >= n) return;
          const kk = +e.getAttribute('data-pv').split(':')[0] - 1, gi = NG === 3 ? +m[2].slice(1) - 1 : (m[2] === 'd' ? 1 : 0);
          if (kk >= P.nl) return;
          const row = P.rows.filter(x => x.k === kk && x.gi === gi)[0], cell = row && row.names[p];
          ok(cell && (cell.raw || cell.name) === e.getAttribute('data-pv').split(':')[1], id + ' 格子 ' + e.getAttribute('data-pv') + ' ← ' + ins[0] + ' 表格 ' + (cell && (cell.raw || cell.name)));
        });
      }
    }
    // SD Out 標號：CH1 在左第一循環 D1～D12、之後 D12(組)+k；CH1 在右 D12(n)+k（MUX：腳位·SWk）
    const dl = [...svg.querySelectorAll('text[data-dlab]')].map(t => t.getAttribute('data-dlab'));
    ok(dl.length === nD, id + ' SD 標號數 ' + dl.length + ' ≠ ' + nD);
    const NGR = nD / n;
    // CH1 在右：主循環（最左組）標 D12(n)+k、往 CH1 依序 D12(n−1)…；DOM 順序是先畫主循環再畫暗組 ⇒ 比集合
    const wantL = dl.map((t, p) => {
      const b = Math.floor(p / n), q = p % n, dq = M ? dec(M, ty, q) : null, ch = M ? dq.c : q;
      const grp = drv.first ? (NGR - 1 - b ? 'n−' + (NGR - 1 - b) : 'n') : String(b);
      if (!drv.first && !b) return 'D' + (ch + 1) + (M ? '·SW' + (dq.j + 1) : '');   // v1.35.27：CH1 在左第一循環直接 D1～D12
      return 'D12(' + grp + ')+' + (ch + 1) + (M ? '·SW' + (dq.j + 1) : '');
    });
    const A1 = drv.first ? dl.slice().sort() : dl, B1 = drv.first ? wantL.slice().sort() : wantL;
    A1.forEach((t, p) => ok(t === B1[p], id + ' SD 標號 #' + p + ' ' + t + ' ≠ ' + B1[p]));
    // v1.35.26 三層：每條 Data 線一顆 demux TFT（SW、腳位＝TYPE 公式）、每個腳位一條匯流排、SW1～SWM 匯流排
    if (M) {
      const tf = [...svg.querySelectorAll('rect[data-mxtft]')].map(e => e.getAttribute('data-mxtft'));
      ok(tf.length === nD, id + ' demux TFT 數 ' + tf.length + ' ≠ ' + nD);
      tf.forEach(t => { const m = /^(\d+):SW(\d+):pin(\d+)$/.exec(t), p = +m[1] - 1, b = Math.floor(p / n), dq = dec(M, ty, p % n);
        ok(+m[2] === dq.j + 1 && +m[3] === dq.c + 1 + 12 * b, id + ' demux TFT ' + t + ' ≠ SW' + (dq.j + 1) + ' pin' + (dq.c + 1 + 12 * b)); });
      ok(svg.querySelectorAll('line[data-mxbus]').length === nD / M, id + ' 腳位匯流排數');
      ok(svg.querySelectorAll('line[data-swbus]').length === M, id + ' SW 匯流排數');
      const lg = svg.querySelector('text[data-mxlg]'); ok(lg && lg.textContent === 'MUX' + M + ' TYPE ' + (MUXP[M][2] ? ty : 1), id + ' MUX TYPE 標示 ' + (lg && lg.textContent));
      ok(!!$('dm-pv-keylg').querySelector('[data-key="dm.pvMuxLg"]'), id + ' MUX 圖例');
    }
    ok(!!$('dm-pv-keylg').querySelector('[data-key="dm.pvMirLg"]') === !!mi, id + ' Mirror 跨循環圖例（EN01 Mirror 時才有）');
    // TCON Out：每條線（MUX 每組）收到的 Data k
    const tc = [...svg.querySelectorAll('text[data-dof]')].map(t => +t.getAttribute('data-dof'));
    ok(tc.length === (M ? nD / M : nD), id + ' TCON 標號數 ' + tc.length);
    const SW = [2, 1, 0, 5, 4, 3];
    tc.forEach((v, i) => { let c = i % 12; if (drv.rev) c = 11 - c; if (drv.swap) c = 6 * Math.floor(c / 6) + SW[c % 6]; ok(v === c + 1, id + ' TCON 標號 #' + i + ' Data' + v + ' ≠ Data' + (c + 1)); });   // 每 12 個一循環（DOM 先主循環後暗組，兩組都是完整 12 個 ⇒ 順序一樣）
    // Line 列名
    const gl = [...svg.querySelectorAll('text[data-glabel]')].slice(0, NG).map(t => t.textContent);
    ok(gl[0] === (NG > 1 ? 'Line 1-1' : 'Line 1'), id + ' 列名 ' + gl.join(','));
    // 圖例一行（EN01 推論／待 同事D）
    ok(!!$('dm-pv-keylg').querySelector('[data-key="dm.en01PvLg"]'), id + ' EN01 圖例');
  };
  const TYSof = (rd, pan) => TYS((rd === 3 || rd === 5 || pan === 'mux') ? DM.en01Phases(rd) : 0);
  for (const [rd, pan] of GATES) for (const ty of TYSof(rd, pan)) for (const mi of (QUICK ? [0] : [0, 1])) for (const cb of (QUICK ? [0] : [0, 1])) svgCheck(rd, pan, 0x02, mi, cb, {}, ty);
  for (const [rd, pan] of GATES) for (const ty of TYSof(rd, pan)) for (const drv of (QUICK ? [{ first: 1 }] : [{ swap: 1 }, { rev: 1 }, { first: 1 }, { swap: 1, rev: 1 }])) svgCheck(rd, pan, 0x0E, 0, 0, drv, ty);
  w.dmPvMuxType(1);
  fire('dm-pv-swap', false); fire('dm-pv-drv', 'f'); fire('dm-pv-first', 'l');
  // Hand 關／RD_MODE 不支援：不畫、TFT 卡寫原因
  { const s = setState(1, 0x02, 0, 0, 0); s.hand = 0; w.dmState.cur = s; w.dmRender(); ok($('dm-tftbody').className.indexOf('hidden') >= 0 && /Hand Mode 關/.test($('dm-tftnote').textContent), 'Hand 關說明：' + $('dm-tftnote').textContent); }
  { const s = setState(4, 0x02, 0, 0, 0); w.dmState.cur = s; w.dmRender(); ok($('dm-tftbody').className.indexOf('hidden') >= 0 && /RD_MODE＝4/.test($('dm-tftnote').textContent), 'RD_MODE 4 說明：' + $('dm-tftnote').textContent); }
  // 鎖定＋只送 R1：EN01 也能鎖定、收到資料與鎖定一致（a/a）
  { const s = setState(1, 0x02, 0, 0, 0); w.dmState.cur = s; w.dmRender(); $('dm-pv-lock').click(); const st = $('dm-pv-lockst').getAttribute('data-ok'); const [a, b] = (st || '0/0').split('/').map(Number); ok(b > 0 && a === b, 'EN01 鎖定當下一致 ' + st); $('dm-pv-lock').click(); }
  /* ── C：E507 xlsm 範例 ── */
  const EX = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const RD = { 1: 0, 2: 1, 3: 2, 4: 3, 6: 5 }, rows = [];
  let nC = 0, dC = 0;
  for (const e of EX) {
    const mux = /^MUX[23]$/.test(e.sheet) ? 'mux' : 'gate'; w.dmPvMuxType(1);
    const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.rd = RD[e.m]; s.deSel = 1 << e.sFirst; s.mirror = e.mirror ? 1 : 0; s.rvsL = e.mirror ? 0xFF : 0; panApply(s, s.rd, mux, 1);
    for (let L = 0; L < 4; L++) for (let j = 0; j < e.m; j++) for (let c = 0; c < 12; c++) s['e' + ((L * 6 + j) * 12 + c)] = e.codes[c][j];
    w.dmState.cur = s; w.dmState.en01Seg = null;
    const P = w.dmPvModel(), M = P.mux | 0, n = P.period; let nn = 0, dd = 0; const diffs = [];
    e.cells.forEach(x => {
      if (typeof x.j !== 'number' || x.b === undefined) return;
      if (e.mirror && x.b > 0) return;
      const row = P.rows.filter(r => r.k === 0 && r.gi === (M ? 0 : x.j))[0], p = M ? enc(M, 1, x.ch, x.j, x.b) : x.ch + n * x.b;
      let cell = row && row.names[p]; nn++;
      if (row && p >= row.names.length) {   // 模型只畫 nD 條（2 個循環以上）；更右邊的循環照同一規則（每循環 +shift）由第 0 循環推
        const c0 = row.names[p % n]; cell = c0 && !c0.off ? { name: DM.linName(c0.t + P.shift * x.b), off: false } : c0;
      }
      if (!cell || cell.off || cell.name !== x.name) { dd++; if (diffs.length < 3) diffs.push(x.col + (e.row0 + x.ch) + ' xlsm ' + x.name + ' ≠ 網頁 ' + (cell ? cell.name : '—')); }
    });
    w.dmPvRender(); const svg = $('dm-pv-tft');
    rows.push({ ex: e.sheet + '!' + e.codeCols.split(':')[0] + e.row0, m: e.m, mirror: e.mirror, panel: mux, deSel: '0x' + (1 << e.sFirst).toString(16).toUpperCase(), cells: nn, diff: dd, maxlen: +svg.getAttribute('data-maxlen'), ex3: diffs });
    nC += nn; dC += dd; ok(dd === 0, 'xlsm ' + e.sheet + ' ' + e.row0 + ' 差 ' + dd + '：' + diffs.join('；'));
  }
  fs.writeFileSync(path.join(process.env.EN01TFT_OUT || '/tmp', 'en01tft_xlsm_compare.json'), JSON.stringify({ total: nC, diff: dC, rows }, null, 1));
  console.log('C xlsm 範例：' + EX.length + ' 組、' + nC + ' 格比對、差異 ' + dC);
  /* ── D：E507 xlsm NORMAL 範例 ⇒ 原廠 TYPE 接線＝網頁模型＋SVG ── */
  const lin = nm => { const m = /^([RGB])(-?\d+)$/.exec(nm || ''); if (!m) return null; const c = 'RGB'.indexOf(m[1]), p = +m[2]; return p > 0 ? (p - 1) * 3 + c : p * 3 + c; };
  const dRows = []; let nDm = 0, dDm = 0, nDs = 0, dDs = 0;
  for (const e of EX) {
    if (!/^MUX[2346]$/.test(e.sheet) || e.mirror) continue;
    const M = e.m, cells = e.cells.filter(x => typeof x.j === 'number' && x.b !== undefined);
    const tyFit = [1, 2].filter(ty => MUXP[M][ty] && cells.every(x => lin(x.name) === enc(M, ty, x.ch, x.j, x.b)));
    if (!tyFit.length) { dRows.push({ ex: e.sheet + '!' + e.row0, type: null, why: '非 NORMAL TYPE 1／2 範例（Zigzag 或 pixel 錯位），不列入' }); continue; }
    const ty = tyFit[0];
    w.dmPvMuxType(ty);
    const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.rd = RD[e.m]; s.deSel = 1 << e.sFirst; s.mirror = 0; s.rvsL = 0; panApply(s, s.rd, /^MUX[23]$/.test(e.sheet) ? 'mux' : 'gate', ty);
    for (let L = 0; L < 4; L++) for (let j = 0; j < e.m; j++) for (let c = 0; c < 12; c++) s['e' + ((L * 6 + j) * 12 + c)] = e.codes[c][j];
    w.dmState.cur = s; w.dmState.en01Seg = null; w.dmPvRender();
    const P = w.dmPvModel(), n = P.period, svg = $('dm-pv-tft'), nD = +svg.getAttribute('data-nd'), row = P.rows.filter(r => r.k === 0)[0];
    const drains = {}; [...svg.querySelectorAll('path[data-w]')].forEach(el => { const m = /^1:D(\d+):\w+:(.*)$/.exec(el.getAttribute('data-w')); if (m) drains[+m[1]] = m[2]; });
    const dl = [...svg.querySelectorAll('text[data-dlab]')].map(t => t.getAttribute('data-dlab'));
    const tft = {}; [...svg.querySelectorAll('rect[data-mxtft]')].forEach(el => { const m = /^(\d+):(.*)$/.exec(el.getAttribute('data-mxtft')); tft[+m[1]] = m[2]; });
    let nn = 0, dd = 0, ns = 0, ds = 0; const ex3 = [];
    cells.forEach(x => {
      const p = enc(M, ty, x.ch, x.j, x.b); nn++;
      let cell = row.names[p]; if (p >= row.names.length) { const c0 = row.names[p % n]; cell = c0 && !c0.off ? { name: DM.linName(c0.t + P.shift * Math.floor(p / n)), t: c0.t + P.shift * Math.floor(p / n), off: false } : c0; }
      const good = cell && !cell.off && cell.name === x.name && cell.t === p;   // 收到 xlsm 的名稱，且 drain 直下（subpixel 位置＝Data 線本身）
      if (!good) { dd++; if (ex3.length < 3) ex3.push('pin' + (x.ch + 1) + ' SW' + (x.j + 1) + ' 循環' + x.b + ' xlsm ' + x.name + ' ≠ 網頁 D' + (p + 1) + ' ' + (cell && cell.name) + '@' + (cell && cell.t)); }
      if (p < nD && p < n) {   // 主循環（亮）再比 SVG：drain、SD 標號、demux TFT
        ns++;
        const sdOk = dl[p] === 'D' + (x.ch + 1) + '·SW' + (x.j + 1), tfOk = tft[p + 1] === 'SW' + (x.j + 1) + ':pin' + (x.ch + 1), drOk = drains[p + 1] === x.name;
        if (!(sdOk && tfOk && drOk)) { ds++; if (ex3.length < 6) ex3.push('SVG D' + (p + 1) + ' drain ' + drains[p + 1] + ' SD ' + dl[p] + ' TFT ' + tft[p + 1] + ' ≠ ' + x.name + ' pin' + (x.ch + 1) + ' SW' + (x.j + 1)); }
      }
    });
    nDm += nn; dDm += dd; nDs += ns; dDs += ds;
    ok(dd === 0 && ds === 0, 'D xlsm ' + e.sheet + '!' + e.row0 + ' TYPE' + ty + ' 模型差 ' + dd + '、SVG 差 ' + ds + '：' + ex3.join('；'));
    dRows.push({ ex: e.sheet + '!' + e.codeCols.split(':')[0] + e.row0, type: ty, cells: nn, diff: dd, svgCells: ns, svgDiff: ds, ex3 });
  }
  w.dmPvMuxType(1);
  fs.writeFileSync(path.join(process.env.EN01TFT_OUT || '/tmp', 'en01tft_xlsm_type.json'), JSON.stringify({ model: nDm, modelDiff: dDm, svg: nDs, svgDiff: dDs, rows: dRows }, null, 1));
  console.log('D xlsm NORMAL TYPE 範例：' + dRows.filter(r => r.type).length + ' 組、模型 ' + nDm + ' 格差 ' + dDm + '、SVG 主循環 ' + nDs + ' 格差 ' + dDs + '；不列入 ' + dRows.filter(r => !r.type).map(r => r.ex).join('、'));
  /* ── E：MUX TYPE 列（v1.35.28：MUX2／3＝SUB_PANEL_MODE[2] 自動、MUX4 只有 TYPE 1、MUX6 手動待 同事D） ── */
  {
    const st = (rd, pan, ty) => { const s = setState(rd, 0x02, 0, 0, 0, pan, ty); w.dmState.cur = s; w.dmPvRender(); return s; };
    w.dmPvMuxType(1);
    for (const rd of [0, 1, 2]) { st(rd, 'gate'); ok(!$('dm-pv-muxtyrow'), 'E RD_MODE ' + rd + ' Gate 面板沒有 MUX TYPE 列'); }
    st(3); ok(!!$('dm-pv-muxtyrow') && $('dm-pv-muxty').classList.contains('hidden') && /TYPE 1/.test($('dm-pv-muxtysrc').textContent), 'E MUX4 只顯示 TYPE 1（無選單）');
    st(5); const P1 = JSON.stringify(w.dmPvModel().rows[0].names.slice(0, 72).map(c => c.t)); ok(!$('dm-pv-muxty').classList.contains('hidden'), 'E MUX6 有手動 TYPE 選單');
    fire('dm-pv-muxty', '2'); const P2 = w.dmPvModel(); ok(P2.muxType === 2 && JSON.stringify(P2.rows[0].names.slice(0, 72).map(c => c.t)) !== P1, 'E MUX6 切 TYPE 2 ⇒ 走線改變');
    ok($('dm-pv-tft').querySelector('text[data-mxlg]').textContent === 'MUX6 TYPE 2', 'E 圖上標 TYPE 2');
    fire('dm-pv-muxty', '1'); ok(w.dmPvModel().muxType === 1, 'E 切回 TYPE 1');
    for (const rd of [1, 2]) for (const ty of [1, 2]) {
      st(rd, 'mux', ty); const P = w.dmPvModel();
      ok(P.mux === rd + 1 && P.muxType === ty && P.muxTyReg, 'E MUX' + (rd + 1) + ' TYPE 依 SUB[2]：' + P.muxType);
      ok($('dm-pv-muxty').classList.contains('hidden') && $('dm-pv-muxtysrc').textContent.indexOf('SUB_PANEL_MODE[2]＝' + (ty - 1)) >= 0, 'E MUX' + (rd + 1) + ' ③ 只顯示 TYPE 來源（不可手動）');
      ok(!!$('dm-pv-keylg').querySelector('[data-key="dm.pvMuxLg"]') && /SUB_PANEL_MODE\[2\]/.test($('dm-pv-keylg').textContent), 'E MUX' + (rd + 1) + ' 圖例寫 TYPE 來源');
    }
    ok(!d.getElementById('dm-pv-mux') && !d.getElementById('dm-pv-muxrow'), 'E 舊「RD_MODE 1/2 面板」手動選項已移除');
    fire('dm-model', 'EM02'); w.dmRender(); ok(!$('dm-pv-muxtyrow') && !$('dm-en01judge') && !$('dm-en01tyrow'), 'E EM02 沒有 MUX TYPE 列／判定列'); fire('dm-model', 'EN01');
  }
  /* ── F：Gate／MUX 自動判定（Bruce 10/19 13:0x「配合tcon設定，自動切換」、13:2x「不能選single gate」） ── */
  {
    // F1 判定矩陣：PANEL 0～3 × SUB 0～7 × RD 0～7 ＝ 256 組，對照 RM81008.model 註解推的預期
    const exp = (pm, sb, rd) => {
      if (rd === 3) return 'mux4'; if (rd === 5) return 'mux6'; if (rd > 2) return 'rdx';
      if (pm !== 3) return ['single', 'dual', 'tri'][rd];
      if (rd === 0) return 'bad'; const m2 = (sb & 1) === 1; return rd === 1 ? (m2 ? 'mux2' : 'bad') : (m2 ? 'bad' : 'mux3');
    };
    let nF = 0;
    for (let pm = 0; pm < 4; pm++) for (let sb = 0; sb < 8; sb++) for (let rd = 0; rd < 8; rd++) {
      const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.deSel = 2; s.panel = pm; s.subPanel = sb; s.rd = rd; nF++;
      const J = DM.en01Panel(s), e = exp(pm, sb, rd);
      ok(J.kind === e, 'F1 PANEL' + pm + ' SUB' + sb + ' RD' + rd + ' 判定 ' + J.kind + ' ≠ ' + e);
      if (e === 'mux2' || e === 'mux3') ok(J.type === ((sb >> 2) & 1) + 1 && J.zz === ((sb >> 1) & 1), 'F1 TYPE/zz PANEL3 SUB' + sb);
      if (rd <= 2 || rd === 3 || rd === 5) { w.dmState.cur = s; w.dmPvRender(); const P = w.dmPvModel();
        if (e === 'bad') ok(!P.ok && /設定矛盾/.test(P.noPicWhy || ''), 'F1 矛盾不畫 PANEL' + pm + ' SUB' + sb + ' RD' + rd);
        else ok(P.ok && (P.mux | 0) === ({ mux2: 2, mux3: 3, mux4: 4, mux6: 6 }[e] || 0), 'F1 ③ 模型 PANEL' + pm + ' SUB' + sb + ' RD' + rd + ' mux=' + P.mux); }
    }
    // F2 Gate Type 選單：列出 MUX2／MUX3，沒有 Single＋MUX；選了寫對暫存器、判定一行正確、round-trip
    w.dmState.en01Seg = { p2: false, p3: false };   // 只畫 P1（6 列）：jsdom 整頁 render 288 格下拉太慢，這段只驗選單／判定
    const st0 = DM.emptyState('EN01'); st0.hand = 1; st0.deEn = 1; st0.deSel = 0x0E; w.dmState.cur = st0; w.dmRender();
    const opts = [...$('dm-gate').options].filter(o => !o.disabled).map(o => o.value);
    ok(JSON.stringify(opts) === JSON.stringify(['Single-Gate', 'Dual-Gate', 'Tri-Gate', 'MUX2 (RD_MODE=1)', 'MUX3 (RD_MODE=2)', 'MUX4 (RD_MODE=3)', 'MUX6 (RD_MODE=5)']), 'F2 Gate 選單 ' + opts.join('|'));
    const WANT = { 'Single-Gate': [0, 'single'], 'Dual-Gate': [1, 'dual'], 'Tri-Gate': [2, 'tri'], 'MUX2 (RD_MODE=1)': [1, 'mux2'], 'MUX3 (RD_MODE=2)': [2, 'mux3'], 'MUX4 (RD_MODE=3)': [3, 'mux4'], 'MUX6 (RD_MODE=5)': [5, 'mux6'] };
    const SEQ = [...opts, 'Tri-Gate', 'MUX2 (RD_MODE=1)', 'Single-Gate', 'MUX3 (RD_MODE=2)', 'Dual-Gate', 'MUX6 (RD_MODE=5)', 'MUX3 (RD_MODE=2)', 'MUX2 (RD_MODE=1)', 'Tri-Gate'];   // 每種都進出過 MUX2／MUX3（整頁 render 慢，不跑 7×7）
    let a = 'Single-Gate';
    for (const b of SEQ) {
      fire('dm-gate', b);
      const c = w.dmState.cur, J = DM.en01Panel(c);
      ok(c.rd === WANT[b][0] && J.kind === WANT[b][1] && $('dm-gate').value === b, 'F2 ' + a + ' → ' + b + '：RD ' + c.rd + ' 判定 ' + J.kind + ' 選單 ' + $('dm-gate').value);
      ok($('dm-en01judge') && $('dm-en01judge').getAttribute('data-kind') === WANT[b][1] && $('dm-en01judge').textContent.indexOf('目前判定') >= 0, 'F2 判定列 ' + ($('dm-en01judge') && $('dm-en01judge').textContent));
      ok(!!$('dm-en01tyrow') === (b.indexOf('MUX2') === 0 || b.indexOf('MUX3') === 0), 'F2 ' + b + ' MUX TYPE 列（②-1）');
      if (/^(Single|Dual|Tri)/.test(b)) ok((c.panel | 0) !== 3, 'F2 ' + b + ' PANEL_MODE 已離開 3');
      a = b;
    }
    // F3 ②-1 MUX TYPE 寫 SUB_PANEL_MODE[2]，③ 跟著換
    fire('dm-gate', 'MUX3 (RD_MODE=2)'); fire('dm-en01ty', '2');
    ok(((w.dmState.cur.subPanel >> 2) & 1) === 1 && (w.dmState.cur.subPanel & 1) === 0 && w.dmPvModel().muxType === 2, 'F3 TYPE 2 ⇒ SUB 0x' + w.dmState.cur.subPanel.toString(16));
    fire('dm-gate', 'MUX2 (RD_MODE=1)'); ok((w.dmState.cur.subPanel & 5) === 5 && w.dmPvModel().muxType === 2, 'F3 換 MUX2 保留 TYPE 2（SUB ' + w.dmState.cur.subPanel + '）');
    fire('dm-en01ty', '1'); ok((w.dmState.cur.subPanel & 4) === 0 && w.dmPvModel().muxType === 1, 'F3 TYPE 1');
    // F4 Hand 關：Gate 停用並提示「先勾 Hand Mode」
    { const s = DM.cloneState(w.dmState.cur); s.hand = 0; s.deEn = 0; w.dmState.cur = s; w.dmRender(); ok($('dm-gate').disabled && /^先勾 Hand Mode/.test($('dm-en01judge').textContent), 'F4 Hand 關提示：' + $('dm-en01judge').textContent); }
    // F5 匯入矛盾值（PANEL 3＋RD 0＝Single＋MUX）：選單顯示矛盾、③ 不畫寫原因
    { const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.deSel = 2; s.panel = 3; s.rd = 0; w.dmState.cur = s; w.dmRender();
      ok($('dm-en01judge').getAttribute('data-kind') === 'bad' && /設定矛盾/.test($('dm-en01judge').textContent) && /RD_MODE＝0/.test($('dm-en01judge').textContent), 'F5 判定列：' + $('dm-en01judge').textContent);
      ok($('dm-tftbody').className.indexOf('hidden') >= 0 && /設定矛盾/.test($('dm-tftnote').textContent), 'F5 ③ 不畫：' + $('dm-tftnote').textContent);
      ok($('dm-gate').value === 'RD_MODE=0 + PANEL_MODE=3', 'F5 選單顯示 ' + $('dm-gate').value); }
    w.dmState.en01Seg = null;
    console.log('F 判定矩陣：' + nF + ' 組；Gate 選單切換 ' + SEQ.length + ' 次');
  }
  console.log((fail ? '✗' : '✓') + ' check_datamap_en01tft：' + pass + ' pass / ' + fail + ' fail');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
