#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_trimirror.js — datamap v1.35.26 Tri Mirror 跨循環統一的隔離比對
   Bruce 10/19（臨時互動區 Mirror 題選 A）：「先統一網頁內部＋加圖例，等 RD 回覆再定方向」，備註「不要影響到已經驗證的 single gate 與 dual gate」。
   做法：同一批狀態在「舊版 repo（參數 1，例 git archive af03783）」與「新版 repo（參數 2）」各跑一次 ③ 模型（dmPvModel）＋ TFT SVG（drain 清單 path[data-w]）＋圖例 key：
     MNT（EM01／EM02／E512）Hand Tri（RT7 (18)～(21)）× Mirror 0／1 × CHRB 0／1 × FORCE_DE_SEL 0x0C／0x0E × 原值＋1 組隨機 code；
     Single／Dual 每型號抽 2 個樣式 × Mirror 0／1（全量 0 差異由 check_datamap_sd_snapshot 負責）；NB（E503／E501A／DAZ6138）同。
   判定：Single／Dual（含 NB）必須 100% 相同；Tri＋Mirror 0 必須相同；Tri＋Mirror 1 的差異逐類統計
     （名稱方向、位置反轉、圖例多一行），並驗證新版 Tri Mirror＝pvMirror 同一式：位置＝−1−k＋shift×循環、名稱＝Pool(k)−shift×循環。
   用法：node tools/check_datamap_trimirror.js <舊版 repo> [新版 repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const OLD = path.resolve(process.argv[2]), NEW = path.resolve(process.argv[3] || path.join(__dirname, '..'));
let pass = 0, fail = 0; const fails = []; const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 30) fails.push(m); } };
async function load(root) {
  const { JSDOM, VirtualConsole } = require(path.join(NEW, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; fails.push(root + ' jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(root, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  return dom.window;
}
(async () => {
  const wo = await load(OLD), wn = await load(NEW), DM = wn.TCONDataMap || require(path.join(NEW, 'common/datamap-core.js'));
  const run = (w, model, s) => {
    const d = w.document, e = d.getElementById('dm-model'); if (e.value !== model) { e.value = model; e.dispatchEvent(new w.Event('change')); }
    w.dmState.cur = JSON.parse(JSON.stringify(s)); w.dmRender();
    const P = w.dmPvModel(), svg = d.getElementById('dm-pv-tft');
    return { ok: P.ok, tri: !!P.tri, mirror: P.mirror || 0, shift: P.shift, period: P.period,
      rows: (P.rows || []).map(r => r.k + ':' + r.gi + '=' + r.names.map(c => c.off ? 'X' : c.name + '@' + c.t).join(' ')),
      rowsObj: P.rows || [],
      wires: svg ? [...svg.querySelectorAll('path[data-w]')].map(x => x.getAttribute('data-w')).join('|') : '',
      keys: [...d.querySelectorAll('#dm-pv-keylg [data-key]')].map(x => x.getAttribute('data-key')).join(',') };
  };
  const lin = nm => { const m = /^([RGB])(-?\d+)$/.exec(nm || ''); if (!m) return null; const c = 'RGB'.indexOf(m[1]), p = +m[2]; return p > 0 ? (p - 1) * 3 + c : p * 3 + c; };
  const tOf = c => c.t !== undefined ? c.t : lin(c.raw || c.name);   // 舊版 Tri 名稱物件沒有 t ⇒ 由 CHRB 前的原名換回位置
  let seed = 4242; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const cats = { same: 0, sdSame: 0, sdDiff: 0, triM0Same: 0, triM0Diff: 0, triM1: 0, triM1Name: 0, triM1Pos: 0, triM1Key: 0, triM1Formula: 0 };
  const MNT = DM.MNT_KEYS, NB = ['E503', 'E501A', 'DAZ6138'].filter(k => DM.MODELS[k]);
  const isTri = p => /^\((1[89]|2[01])\)/.test(p.name);
  for (const k of MNT.concat(NB)) {
    /* 每次 dmRender 約 1～16 秒（排列組合等），全量不可行 ⇒ Tri 樣式全跑；Single／Dual 每型號抽 2 個樣式（全量 0 差異由 check_datamap_sd_snapshot 負責） */
    const all = DM.PRESETS.map((p, i) => ({ p, i })), tris = DM.MODELS[k].kind === 'mnt' ? all.filter(x => isTri(x.p)) : [], sds = all.filter(x => !isTri(x.p) && DM.applyPreset(k, DM.emptyState(k), x.i)).slice(0, 2);
    const presets = tris.concat(sds);
    for (const { p, i } of presets) for (const mi of [0, 1]) for (const cb of (isTri(p) ? [0, 1] : [0])) for (const de of (isTri(p) ? [[1, 0x0C], [1, 0x0E]] : [[1, 0x02]])) for (let pat = 0; pat < (isTri(p) ? 2 : 1); pat++) {
      let s = DM.emptyState(k); s.hand = 1; s = DM.applyPreset(k, s, i); s.mirror = mi; s.chrb = cb; s.deEn = de[0]; s.deSel = de[1];
      if (pat) for (const f of ['c', 'x']) for (let q = 0; q < 24; q++) if (s[f + q] !== undefined) s[f + q] = rnd(30);
      const tri = DM.triOn(k, s), A = run(wo, k, s), B = run(wn, k, s), id = k + ' ' + p.name + ' m' + mi + ' c' + cb + ' de' + de.join('/') + ' p' + pat;
      const same = JSON.stringify([A.ok, A.rows, A.wires, A.keys]) === JSON.stringify([B.ok, B.rows, B.wires, B.keys]);
      if (!tri) { ok(same, 'Single/Dual 應 0 差異：' + id); same ? cats.sdSame++ : cats.sdDiff++; continue; }
      if (!mi) { ok(same, 'Tri Mirror 0 應 0 差異：' + id); same ? cats.triM0Same++ : cats.triM0Diff++; continue; }
      cats.triM1++;
      if (!A.ok || !B.ok) { ok(A.ok === B.ok, 'Tri Mirror ok 不一致 ' + id); continue; }
      if (A.rows.join() !== B.rows.join()) {
        const nmA = A.rowsObj.map(r => r.names.map(c => c.name).join(' ')).join('/'), nmB = B.rowsObj.map(r => r.names.map(c => c.name).join(' ')).join('/');
        if (nmA !== nmB) cats.triM1Name++;
        const tA = A.rowsObj.map(r => r.names.map(c => c.t).join(' ')).join('/'), tB = B.rowsObj.map(r => r.names.map(c => c.t).join(' ')).join('/');
        if (tA !== tB) cats.triM1Pos++;
      }
      if (A.keys !== B.keys) { cats.triM1Key++; ok(B.keys === A.keys + ',dm.pvMirLg', '圖例只多 dm.pvMirLg：' + id + ' ' + A.keys + ' → ' + B.keys); }
      // 公式：新版 = 舊版（Tri 無 Mirror 換算的 Pool 位置 k）⇒ 位置 −1−k＋shift×循環、名稱＝Pool(k)−shift×循環（Single／Dual pvMirror 同式）
      let fOk = true;
      A.rowsObj.forEach((ra, ri) => { const rb = B.rowsObj[ri], per = A.period, sh = A.shift;
        ra.names.forEach((ca, j) => { const cb0 = ra.names[j % per], cbn = rb && rb.names[j];
          if (cb0.off) { if (!(cbn && cbn.off)) fOk = false; return; }
          const k0 = tOf(cb0), b = Math.floor(j / per), wantT = -1 - k0 + sh * b, n0 = DM.linName(k0 - sh * b), wantN = cb ? DM.rbSwapName(n0) : n0;   // CHRB：位置不變、名稱 R↔B
          if (!cbn || cbn.off || cbn.t !== wantT || cbn.name !== wantN) fOk = false; }); });
      ok(fOk, 'Tri Mirror 新版＝pvMirror 同式：' + id); if (fOk) cats.triM1Formula++;
    }
  }
  console.log(JSON.stringify(cats));
  console.log((fail ? '✗' : '✓') + ' check_datamap_trimirror：' + pass + ' pass / ' + fail + ' fail');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
