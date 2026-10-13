// v1.23.2 子像素軸固定＋排列組合統計排名回歸（Bruce 10/12）。
// 用法：node tools/check_datamap_axis.js [repo] [--sukun <蘇坤 EM02 code.bin>]（jsdom 用 repo node_modules；客戶 code 不進版控，沒給就跳過 S5）
//   Bruce 10/12 原話：「在還沒有鎖定 TFT 接線圖的架構之前，subpixel 順序應該要嚴格遵守：最左邊的一定要是最小的…依序往右是 R1、G1、B1、R2、G2、B2，
//   這個是要固定的。然後如果我改變像是 source output 的輸出對調，對調以後，subpixel 這邊的位置是不可以變的，這樣才能顯示出最長 drain 的部分」
//   「玻璃做出來就是固定的，唯一可以變動的就是設定 RGB 改為 BGR」「只要用到第一名的建議，就應該要跟蘇坤的 Data Mapping 圖一致」
// 矩陣：全部型號 × （MNT：全部 Preset；NB：Single／Dual／Tri）× Mirror 0/1 × CHRB 0/1（有該欄位才跑）× 排列組合統計裡不改 TCON Mirror 的 16 種（點列套用）。每一組檢查：
//   A1 子像素軸：畫面由左到右的名稱連續遞增（線性編號每格 +1；BGR 時每個 pixel 內 B G R），最左 pixel＝這個狀態下 16 種都相同（＝表格用到的最小編號，補到整 pixel）
//   A2 「資料正確」✓ 的列：套用後每個主循環有接線的格子收到的資料＝格子的軸名稱（data-dn＝data-pv）
//   A3 線長一致：套用後接線圖 data-maxlen＝比較表該列的「最長 drain」
//   A4 排名：資料與顏色全對的列排在最前，且依最長 drain 由短到長
//   A5 資料正確的列：每列資料左小右大，最左有接線的資料在最左 pixel（v1.23.3）
//   S5 蘇坤 code（給 --sukun 才跑）：第 1 名＝CH1 最左＋正向＋RGB＋輸出對調＋Mirror 不改、最長 drain 1.5；套用後每條線接的子像素＝蘇坤 DataMapping 參考圖
'use strict';
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2), si = args.indexOf('--sukun'), SK = si >= 0 ? args[si + 1] : null;
const pos = args.filter((a, i) => a !== '--sukun' && (si < 0 || i !== si + 1));
const ROOT = path.resolve(pos[0] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
let pass = 0, fail = 0; const cnt = {};
const ok = (c, g, m) => { cnt[g] = (cnt[g] || 0) + 1; if (c) pass++; else { fail++; if (fail < 60) console.log('  ✗ [' + g + '] ' + m); } return c; };
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), S = w.dmState;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const show = s => { S.cur = DM.cloneState(s); w.dmRender(); };
  const T = () => $('dm-pv-tft');
  const CW = 38;
  /* 第 1 列子像素格，照畫面由左到右排（翻圖時 x 反過來） */
  const axis = (row = 1) => {
    const svg = T(), W = +svg.getAttribute('width'), flip = !!svg.querySelector('[data-flip]');
    return Array.from(svg.querySelectorAll('rect[data-pv^="' + row + ':"]')).map(r => ({ nm: r.getAttribute('data-pv').split(':')[1], x: flip ? W - (+r.getAttribute('x')) - CW : +r.getAttribute('x'), dn: r.getAttribute('data-dn'), tier: r.getAttribute('data-tier'), inn: r.getAttribute('data-in') }))
      .filter(c => c.nm !== "").sort((a, b) => a.x - b.x);   // 翻圖時比最小用到編號更左的空位不寫名稱
  };
  const rowsOf = () => Array.from(d.querySelectorAll('#dm-pv-combotbl tr[data-combo]')).map(r => ({ key: r.getAttribute('data-combo'), ok: r.getAttribute('data-ok'), mirChg: !!r.querySelector('.dm-cmirchg'), cells: Array.from(r.cells).map(c => c.textContent.trim()) }));
  const hand = (k, s) => ((s.hand | 0) ? s : (DM.setHand(k, s, true) || s));
  const V = [];
  DM.SELECT_KEYS.forEach(k => {
    if (DM.MODELS[k].kind === 'en01') return;   // EN01 ③ 不支援（另有 check_datamap_en01）
    const bases = [];
    if (DM.MODELS[k].kind === 'mnt') DM.PRESETS.forEach((p, i) => { bases.push({ n: k + ' ' + p.name, s: hand(k, DM.applyPreset(k, hand(k, DM.emptyState(k)), i)) }); });
    else ['Single-Gate', 'Dual-Gate', 'Tri-Gate'].forEach(gt => { const s = DM.setGate(k, hand(k, DM.emptyState(k)), gt); if (s) bases.push({ n: k + ' ' + gt, s: hand(k, s) }); });
    const fm = DM.fieldById(k, 'mirror'), fc = DM.fieldById(k, 'chrb');
    bases.forEach(b => [0, 1].forEach(mi => [0, 1].forEach(ch => {
      if ((mi && !fm) || (ch && !fc)) return;
      const s = DM.cloneState(b.s); if (fm) { s.mirror = mi; if ('rvsL' in s) { s.rvsL = mi ? 0xFF : 0; s.rvsH = mi ? 0xFF : 0; } } if (fc) s.chrb = ch;
      V.push({ k, n: b.n + (fm ? ' mir' + mi : '') + (fc ? ' chrb' + ch : ''), s });
    })));
  });
  console.log('狀態數：' + V.length);
  let nApply = 0, nSkip = 0;
  for (const v of V) {
    $('dm-log').innerHTML = ''; $('dm-toasts').innerHTML = '';
    setModel(v.k); show(v.s);
    if ($('dm-pvbody').classList.contains('hidden') || !T().querySelector('rect[data-pv]')) { nSkip++; continue; }
    const R0 = rowsOf().filter(r => !r.mirChg);
    /* A4 排名 */
    const all = rowsOf(), nOk = all.filter(r => r.ok === '1').length, mxOk = all.filter(r => r.ok === '1').map(r => +r.cells[7]);
    ok(all.slice(0, nOk).every(r => r.ok === '1') && mxOk.every((x, i) => !i || x >= mxOk[i - 1] - 1e-9), 'A4', v.n + '：全對的列在最前且依最長 drain 由短到長（' + mxOk.join(',') + '）');

    for (const r of R0) {
      w.dmApplyCombo(r.key, false); nApply++;
      /* BGR 時每個 pixel 內名稱是 B G R（Bruce：只有 RGB／BGR 可以改順序）⇒ 先換回 RGB 序再檢查連續 */
      const bg = r.key.charAt(2) === 'b', inv = x => { if (x === null) return null; const m = ((x % 3) + 3) % 3; return x - m + (bg ? 2 - m : m); };
      const ax = axis(), lin = ax.map(c => inv(DM.linIdx(c.nm)));
      ok(lin.every((x, i) => x !== null && (!i || x === lin[i - 1] + 1)), 'A1', v.n + ' ' + r.key + '：子像素軸由左到右連續遞增（' + ax.slice(0, 8).map(c => c.nm).join(' ') + '…）');
      /* 最左有名稱的格子：不小於「表格用到的最小編號的 pixel」與 R1 兩者較小者，也不大於兩者較大者（不翻圖時從 R1 或前循環起；CH1 在右翻圖時從用到的最小 pixel 起）；下限只對「資料正確」的組合檢查（鏡像組合的接線位置會落到資料編號之外） */
      const all = [1, 2, 3, 4, 5, 6, 7, 8].flatMap(rw => axis(rw)), pix = a => a.length ? 3 * Math.floor(Math.min.apply(null, a) / 3) : 0;
      const lo = pix(all.filter(c => c.inn && c.dn).map(c => DM.linIdx(c.dn)).filter(x => x !== null)), hi = pix(all.filter(c => c.tier === 'main' && c.dn).map(c => DM.linIdx(c.dn)).filter(x => x !== null));
      ok((r.cells[5] !== "✓" || (lin[0] >= Math.min(0, lo) && lin[0] <= Math.max(0, hi))) && ((lin[0] % 3) + 3) % 3 === 0, 'A1', v.n + ' ' + r.key + '：最左＝' + ax[0].nm + '（有接線資料最小 pixel ' + DM.linName(lo) + '、主循環資料最小 pixel ' + DM.linName(hi) + '，整 pixel 起點）');
      /* A5 v1.23.3（Bruce 10/12「這個的排列一定是左小右大」）：資料正確的列，每一列有接線的格子收到的資料由左到右嚴格遞增（左小右大），
         且整張圖最左有接線的資料落在最左那個有名稱的 pixel（＝表格最小 pixel） */
      if (r.cells[5] === '✓') [1, 2].forEach(rw => { const wc = axis(rw).filter(c => c.inn && c.dn && c.tier === 'main').map(c => inv(DM.linIdx(c.dn)));
        ok(wc.every((x, i) => x !== null && (!i || x > wc[i - 1])), 'A5', v.n + ' ' + r.key + ' 第 ' + rw + ' 列：資料左小右大（' + wc.slice(0, 8).join(',') + '）'); });
      if (r.cells[5] === '✓') { const fw = [1, 2, 3, 4].flatMap(rw => axis(rw)).filter(c => c.inn && c.dn).sort((a, b) => a.x - b.x)[0];
        ok(!fw || Math.floor(inv(DM.linIdx(fw.dn)) / 3) === Math.floor(lin[0] / 3), 'A5', v.n + ' ' + r.key + '：最左有接線的資料 ' + (fw && fw.dn) + ' 在最左 pixel（' + ax[0].nm + '）'); }
      if (r.cells[5] === '✓') { const bad = ax.filter(c => c.tier === 'main' && c.dn !== c.nm); ok(!bad.length, 'A2', v.n + ' ' + r.key + '：資料正確 ⇒ 主循環格子收到的資料＝軸名稱（' + bad.slice(0, 4).map(c => c.nm + '←' + c.dn).join(',') + '）'); }
      ok(Math.abs(+T().getAttribute('data-maxlen') - +r.cells[7]) < 1e-9, 'A3', v.n + ' ' + r.key + '：接線圖最長 drain ' + T().getAttribute('data-maxlen') + '＝比較表 ' + r.cells[7]);
    }
  }
  console.log('套用次數：' + nApply + '，略過（③ 不畫）：' + nSkip);

  if (SK && fs.existsSync(SK)) {
    console.log('── S5 蘇坤 code：' + path.basename(SK));
    setModel('EM02');
    w.dmImportBytes(new Uint8Array(fs.readFileSync(SK)), path.basename(SK));
    if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click();
    const all = rowsOf(), first = all[0], corr = all.findIndex(r => r.key === 'lfgs0');
    ok(first.key === 'lfgs0' && first.cells[5] === '✓' && first.cells[6] === '✓' && +first.cells[7] === 1.5, 'S5', '第 1 名＝CH1 最左＋正向＋RGB＋輸出對調、Mirror 0、資料／顏色 ✓、最長 drain 1.5（' + first.key + ' ' + first.cells.slice(1, 10).join(',') + '）');
    ok(all.filter(r => r.ok === '1' && +r.cells[7] < 1.5).length === 0, 'S5', '沒有比 1.5 更短的全對組合');
    /* v1.27.0（Woody 10/13：Mirror 不平移名稱）：取代 v1.23.3 兩條（rrgs1 判錯、全對都是 Mirror 0）。Mirror 1＋Driver 反接在物理上等同 Mirror 0，可以全對；
       要求改成：Mirror 1 的全對組合不會比第 1 名好（最長 drain ≥ 1.5），第 1 名不需改 TCON。 */
    ok(all.filter(r => r.ok === '1' && r.cells[9].charAt(0) === '1').every(r => +r.cells[7] >= 1.5) && !/需改/.test(first.cells[9]), 'S5', 'v1.27.0：Mirror 1 的全對組合最長 drain 都不小於第 1 名 1.5，第 1 名不需改 TCON（' + all.filter(r => r.ok === '1').map(r => r.key + ':' + r.cells[7]).join(' ') + '）');
    w.dmApplyCombo(first.key, false);
    /* 參考圖（BOE B4 27" QHD DataMapping_DualGate_BOE_HSD）：Data 線在 R1 左、G1|B1、R2|G2…；第 1 列上 TFT→右邊第二顆、下 TFT→右邊第一顆；
       第 2 列往左錯一條：上 TFT→左邊第二顆、下 TFT→左邊第一顆 ⇒ 依序 (D1：G1/R1｜G-1/B-1)、(D2：B1/R2｜G1/R1)、(D3：G2/B2｜B1/R2)… */
    const want = { 1: [['D1u', 'G1'], ['D1d', 'R1'], ['D2u', 'B1'], ['D2d', 'R2'], ['D3u', 'G2'], ['D3d', 'B2'], ['D4u', 'G3'], ['D4d', 'R3'], ['D5u', 'B3'], ['D5d', 'R4'], ['D6u', 'G4'], ['D6d', 'B4']],
      2: [['D1u', 'G-1'], ['D1d', 'B-1'], ['D2u', 'G1'], ['D2d', 'R1'], ['D3u', 'B1'], ['D3d', 'R2'], ['D4u', 'G2'], ['D4d', 'B2'], ['D5u', 'G3'], ['D5d', 'R3'], ['D6u', 'B3'], ['D6d', 'R4']] };
    [1, 2].forEach(row => {
      const ax = axis(row), by = {}; ax.forEach(c => (c.inn || '').split(',').filter(Boolean).forEach(t => { by[t] = c.nm; }));
      const bad = want[row].filter(([t, nm]) => by[t] !== nm);
      ok(!bad.length, 'S5', '第 ' + row + ' 列 12 條 drain 與參考圖一致（' + (bad.length ? bad.map(([t, nm]) => t + '→' + by[t] + '≠' + nm).join(',') : want[row].map(([t, nm]) => t + '→' + nm).join(' ')) + '）');
    });
    const gaps = T().getAttribute('data-gaps').split(',').slice(0, 6).map(Number);
    ok(gaps.join(',') === '0,2,4,6,8,10' && axis()[0].nm === 'R-1', 'S5', 'Data 線在 R1 左、B1 左…（gaps ' + gaps.join(',') + '）；子像素軸最左＝R-1（表格最小用到 G-1／B-1）');
  } else console.log('── S5 蘇坤 code：沒給 --sukun，略過');
  console.log(Object.keys(cnt).map(k => k + ' ' + cnt[k]).join('、'));
  console.log((fail ? '✗' : '✓') + ' check_datamap_axis ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
