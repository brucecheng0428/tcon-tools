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
   用法：node tools/check_datamap_en01tft.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
const FIX = path.join(__dirname, 'datamap_en01_xlsm_examples.json');
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 40) fails.push(m); } };
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
  const setState = (rd, de, mi, cb, pat) => { const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.deSel = de; s.rd = rd; s.mirror = mi; s.chrb = cb; s.rvsL = mi ? 0xFF : 0; for (let i = 0; i < 288; i++) s['e' + i] = PATS[pat](); return s; };
  const rb = n => DM.rbSwapName(n);
  /* ── A：模型矩陣 ── */
  let nA = 0;
  for (const [rd, pan] of GATES) {
    w.dmPvMux(pan);
    for (const seg of [null, { p2: true, p3: false }]) {
      w.dmState.en01Seg = seg;
      for (const de of DES) for (const mi of [0, 1]) for (const cb of [0, 1]) for (let pat = 0; pat < 2; pat++) {
        const s = setState(rd, de, mi, cb, pat); w.dmState.cur = s;
        const P = w.dmPvModel(), np = DM.en01Phases(rd), M = (rd === 3 || rd === 5 || pan === 'mux') && np > 1 ? np : 0, NG = M ? 1 : np, n = 12 * (M || 1), sh = n * NG;
        const id = 'rd' + rd + pan + '|de' + de.toString(16) + '|m' + mi + '|c' + cb + '|p' + pat + '|seg' + (seg ? 'P1' : 'all');
        ok(P.ok && P.en01 && P.NG === NG && P.period === n && P.shift === sh && (P.mux | 0) === M, id + ' 模型參數 NG/period/shift/mux');
        const lines = seg ? [0, 1] : [0, 1, 2, 3];
        ok(P.nl === lines.length, id + ' line 數 ' + P.nl);
        lines.forEach(L => {
          for (let j = 0; j < np; j++) for (let c = 0; c < 12; c++) {
            const r = L * 6 + j, T = DM.en01RowT(s, r), v = DM.en01CellView(s, r, c, T), raw = s['e' + (r * 12 + c)];
            const row = P.rows.filter(x => x.k === L && x.gi === (M ? 0 : j))[0];
            if (!row) { ok(false, id + ' 缺列 L' + L + ' SW' + j); continue; }
            for (let b = 0; b < 2; b++) {
              const p = (M ? c * M + j : c) + n * b, cell = row.names[p]; nA++;
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
  const svgCheck = (rd, pan, de, mi, cb, drv) => {
    w.dmPvMux(pan); fire('dm-pv-swap', !!drv.swap); fire('dm-pv-drv', drv.rev ? 'r' : 'f'); fire('dm-pv-first', drv.first ? 'r' : 'l');
    const s = setState(rd, de, mi, cb, 1); w.dmState.cur = s; w.dmRender();
    const P = w.dmPvModel(), svg = $('dm-pv-tft'), n = P.period, M = P.mux | 0, NG = P.NG, nD = +svg.getAttribute('data-nd'), id = 'SVG rd' + rd + pan + ' de' + de.toString(16) + ' m' + mi + ' c' + cb + ' ' + JSON.stringify(drv);
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
    // SD Out 標號：D12(組)+k（MUX：腳位·SWk）
    const dl = [...svg.querySelectorAll('text[data-dlab]')].map(t => t.getAttribute('data-dlab'));
    ok(dl.length === nD, id + ' SD 標號數 ' + dl.length + ' ≠ ' + nD);
    const NGR = nD / n;
    // CH1 在右：主循環（最左組）標 D12(n)+k、往 CH1 依序 D12(n−1)…；DOM 順序是先畫主循環再畫暗組 ⇒ 比集合
    const wantL = dl.map((t, p) => {
      const b = Math.floor(p / n), q = p % n, ch = M ? Math.floor(q / M) : q;
      const grp = drv.first ? (NGR - 1 - b ? 'n−' + (NGR - 1 - b) : 'n') : String(b);
      return 'D12(' + grp + ')+' + (ch + 1) + (M ? '·SW' + (q % M + 1) : '');
    });
    const A1 = drv.first ? dl.slice().sort() : dl, B1 = drv.first ? wantL.slice().sort() : wantL;
    A1.forEach((t, p) => ok(t === B1[p], id + ' SD 標號 #' + p + ' ' + t + ' ≠ ' + B1[p]));
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
  for (const [rd, pan] of GATES) for (const mi of [0, 1]) for (const cb of [0, 1]) svgCheck(rd, pan, 0x02, mi, cb, {});
  for (const [rd, pan] of GATES) for (const drv of [{ swap: 1 }, { rev: 1 }, { first: 1 }, { swap: 1, rev: 1 }]) svgCheck(rd, pan, 0x0E, 0, 0, drv);
  fire('dm-pv-swap', false); fire('dm-pv-drv', 'f'); fire('dm-pv-first', 'l'); w.dmPvMux('gate');
  // Hand 關／RD_MODE 不支援：不畫、TFT 卡寫原因
  { const s = setState(1, 0x02, 0, 0, 0); s.hand = 0; w.dmState.cur = s; w.dmRender(); ok($('dm-tftbody').className.indexOf('hidden') >= 0 && /Hand Mode 關/.test($('dm-tftnote').textContent), 'Hand 關說明：' + $('dm-tftnote').textContent); }
  { const s = setState(4, 0x02, 0, 0, 0); w.dmState.cur = s; w.dmRender(); ok($('dm-tftbody').className.indexOf('hidden') >= 0 && /RD_MODE＝4/.test($('dm-tftnote').textContent), 'RD_MODE 4 說明：' + $('dm-tftnote').textContent); }
  // RD_MODE 1/2 面板列只在 EN01 Dual／Tri 建立（其他時候不在 DOM ⇒ MNT／NB 頁面與 v1.35.24 相同）；選 Source MUX 後模型變 MUX
  for (const rd of [0, 1, 2, 3, 5]) { const s = setState(rd, 0x02, 0, 0, 0); w.dmState.cur = s; w.dmRender(); ok(!!$('dm-pv-muxrow') === (rd === 1 || rd === 2), 'RD_MODE ' + rd + ' 面板列存在'); }
  { const s = setState(2, 0x02, 0, 0, 0); w.dmState.cur = s; w.dmRender(); fire('dm-pv-mux', 'mux'); ok(w.dmPvModel().mux === 3 && $('dm-pv-mux').value === 'mux', '面板選 Source MUX ⇒ MUX3'); fire('dm-pv-mux', 'gate'); ok(!w.dmPvModel().mux, '面板選 Gate ⇒ Tri 3 條 gate'); }
  { fire('dm-model', 'EM02'); w.dmRender(); ok(!$('dm-pv-muxrow'), 'EM02 沒有 RD_MODE 1/2 面板列'); fire('dm-model', 'EN01'); }
  // 鎖定＋只送 R1：EN01 也能鎖定、收到資料與鎖定一致（a/a）
  { w.dmPvMux('gate'); const s = setState(1, 0x02, 0, 0, 0); w.dmState.cur = s; w.dmRender(); $('dm-pv-lock').click(); const st = $('dm-pv-lockst').getAttribute('data-ok'); const [a, b] = (st || '0/0').split('/').map(Number); ok(b > 0 && a === b, 'EN01 鎖定當下一致 ' + st); $('dm-pv-lock').click(); }
  /* ── C：E507 xlsm 範例 ── */
  const EX = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const RD = { 1: 0, 2: 1, 3: 2, 4: 3, 6: 5 }, rows = [];
  let nC = 0, dC = 0;
  for (const e of EX) {
    const mux = /^MUX[23]$/.test(e.sheet) ? 'mux' : 'gate'; w.dmPvMux(mux);
    const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.rd = RD[e.m]; s.deSel = 1 << e.sFirst; s.mirror = e.mirror ? 1 : 0; s.rvsL = e.mirror ? 0xFF : 0;
    for (let L = 0; L < 4; L++) for (let j = 0; j < e.m; j++) for (let c = 0; c < 12; c++) s['e' + ((L * 6 + j) * 12 + c)] = e.codes[c][j];
    w.dmState.cur = s; w.dmState.en01Seg = null;
    const P = w.dmPvModel(), M = P.mux | 0, n = P.period; let nn = 0, dd = 0; const diffs = [];
    e.cells.forEach(x => {
      if (typeof x.j !== 'number' || x.b === undefined) return;
      if (e.mirror && x.b > 0) return;
      const row = P.rows.filter(r => r.k === 0 && r.gi === (M ? 0 : x.j))[0], p = (M ? x.ch * M + x.j : x.ch) + n * x.b;
      let cell = row && row.names[p]; nn++;
      if (row && p >= row.names.length) {   // 模型只畫 nD 條（2 個循環以上）；更右邊的循環照同一規則（每循環 +shift）由第 0 循環推
        const c0 = row.names[p % n]; cell = c0 && !c0.off ? { name: DM.linName(c0.t + P.shift * x.b), off: false } : c0;
      }
      if (!cell || cell.off || cell.name !== x.name) { dd++; if (diffs.length < 3) diffs.push(x.col + (e.row0 + x.ch) + ' xlsm ' + x.name + ' ≠ 網頁 ' + (cell ? cell.name : '—')); }
    });
    w.dmRender(); const svg = $('dm-pv-tft');
    rows.push({ ex: e.sheet + '!' + e.codeCols.split(':')[0] + e.row0, m: e.m, mirror: e.mirror, panel: mux, deSel: '0x' + (1 << e.sFirst).toString(16).toUpperCase(), cells: nn, diff: dd, maxlen: +svg.getAttribute('data-maxlen'), ex3: diffs });
    nC += nn; dC += dd; ok(dd === 0, 'xlsm ' + e.sheet + ' ' + e.row0 + ' 差 ' + dd + '：' + diffs.join('；'));
  }
  fs.writeFileSync(path.join(process.env.EN01TFT_OUT || '/tmp', 'en01tft_xlsm_compare.json'), JSON.stringify({ total: nC, diff: dC, rows }, null, 1));
  console.log('C xlsm 範例：' + EX.length + ' 組、' + nC + ' 格比對、差異 ' + dC);
  console.log((fail ? '✗' : '✓') + ' check_datamap_en01tft：' + pass + ' pass / ' + fail + ' fail');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
