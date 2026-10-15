#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_sd_snapshot.js — datamap v1.32.0 Tri-Gate 隔離測試（Bruce 2026-10-15 硬性限制）
   Bruce 原話：「任何 tri-gate 的新增設定，千萬不要影響到原本 single gate 跟 dual gate 的結果。」
   做法：在 v1.31.4（b259f82，Tri 實作前）對「不是 Hand＋Tri」的全部組合拍快照，之後每一版逐格逐 byte 比對，差 1 處就 fail。
     組合：所有型號（SELECT_KEYS，含 EN01）×
           Hand 開：Single／Dual（panel 0/1/2 × 對應 RD）× sub_panel 0~7 × FORCE_DE_EN／FORCE_DE_SEL（0/0、1/0x02、1/0x0E、1/0x0C）× Mirror × CHRB
           Hand 關（Auto）：panel 0~3 × sub 0~7 × FORCE_DE_EN 0/1 × Mirror × CHRB
           兩組格值樣式（c／x／e 欄位依公式填）。
     每個組合記：整頁 body（去掉 Tri 專用區塊 #dm-tribox、Gate Type 下拉只留選取值、log 區）＝② 表格名稱／T 標示／第二組／③ TFT 接線 SVG／CKS…，
           以及 exportRegs（寫入 byte＋mask）、匯出 script。
   用法：node tools/check_datamap_sd_snapshot.js [repo]            比對（基準檔 tools/datamap_sd_snapshot.json）
         node tools/check_datamap_sd_snapshot.js [repo] --write    重拍基準（只能在 Tri 實作前的版本做）
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const args = process.argv.slice(2);
const ROOT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '..'));
const WRITE = args.indexOf('--write') >= 0;
const SNAP = process.env.SNAP_FILE || path.join(ROOT, 'tools/datamap_sd_snapshot.json');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
const h = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const T0 = Date.now();
const ONLY = process.env.SNAP_ONLY ? process.env.SNAP_ONLY.split(',') : null;

function states(k) {
  const M = DM.MODELS[k], out = [], has = id => !!DM.fieldById(k, id);
  const nb = M.kind !== 'mnt';
  const pats = [kk => (kk * 7 + 3) % 30, kk => (kk % 5 === 4) ? 31 : (kk * 11 + 5) % 18];
  const base = (pi) => { const s = DM.emptyState(k); DM.fieldsOf(k).forEach(f => { const m = /^([cxe])(\d+)$/.exec(f.id); if (m) s[f.id] = pats[pi](+m[2]) & ((1 << f.bits) - 1); }); return s; };
  const subs = has('subPanel') ? [0, 1, 2, 3, 4, 5, 6, 7] : [0];
  const des = has('deSel') ? [[0, 0], [1, 0x02], [1, 0x0E], [1, 0x0C]] : [[0, 0]];
  /* DOM 重畫每組約 0.1 s ⇒ 整頁比對只跑樣式 0（NB 的 FORCE_DE_SEL 只取 0／0x0E，Auto 只取 FORCE_DE_EN 0）；核心層（名稱、byte、CKS、script、接線）全組合都比 */
  const domOk = (pi, de, ds, auto) => pi === 0 && (auto ? de === 0 : (!nb || ds === 0 || ds === 0x0E));
  const mirs = has('mirror') ? [0, 1] : [0], chrbs = has('chrb') ? [0, 1] : [0];
  const e50 = M.sem === 'e50x';
  let gates;
  if (M.kind === 'en01') gates = [['S', { rd: 0 }], ['D', { rd: 1 }]];
  else gates = [['p0', { panel: 0, rd: 0 }], ['p1', { panel: 1, rd: 0 }], ['p2', { panel: 2, rd: e50 ? 1 : 0 }]];
  for (let pi = 0; pi < 2; pi++) {
    gates.forEach(([gn, gv]) => subs.forEach(sp => des.forEach(([de, ds]) => mirs.forEach(mi => chrbs.forEach(cb => {
      const s = Object.assign(base(pi), gv, { hand: 1 });
      if (M.kind === 'en01') { s.deEn = 1; }
      if (has('subPanel')) s.subPanel = sp; if (has('deEn') && M.kind !== 'en01') s.deEn = de; if (has('deSel')) s.deSel = ds; if (has('mirror')) s.mirror = mi; if (has('chrb')) s.chrb = cb;
      if (M.kind !== 'en01' && !M.sem.startsWith('daz') && has('lineEn')) s.lineEn = 1;
      const g = DM.gateOf(k, s); if (g !== 'single' && g !== 'dual') return;
      out.push({ id: k + '|P' + pi + '|H1|' + gn + '|sp' + sp + '|de' + de + '/' + ds + '|m' + mi + '|c' + cb, s, dom: domOk(pi, de, ds, false) });
    })))));
    if (M.kind === 'en01') continue;
    [0, 1, 2, 3].forEach(p => subs.forEach(sp => [0, 1].forEach(de => mirs.forEach(mi => chrbs.forEach(cb => {
      const s = Object.assign(base(pi), { hand: 0, panel: p });
      if (has('rd')) s.rd = [0, 0, 1, 2][p];
      if (has('subPanel')) s.subPanel = sp; if (has('deEn')) s.deEn = de; if (has('deSel')) s.deSel = 0x0E; if (has('mirror')) s.mirror = mi; if (has('chrb')) s.chrb = cb;
      if (!has('subPanel') && sp) return;
      out.push({ id: k + '|P' + pi + '|H0|p' + p + '|sp' + sp + '|de' + de + '|m' + mi + '|c' + cb, s, dom: domOk(pi, de, 0, true) });
    })))));
  }
  return out;
}

(async () => {
  /* 每個型號開一個新頁（前一個型號留下的畫面狀態不影響下一個；分批或一次跑結果相同） */
  let dom, w, d;
  const $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const openPage = async () => {
    if (dom) dom.window.close();
    const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('jsdomError', e.message));
    dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
    await new Promise(r => dom.window.addEventListener('load', r));
    w = dom.window; d = w.document;
  };
  /* 不 clone 整頁（jsdom 記憶體）：直接取 innerHTML，去掉 <script> 內容（程式碼不是畫面）、版號標籤、Tri 專用區塊與 Gate Type 下拉的選項清單 */
  const strip = html => html.replace(/(data-tool-version="datamap">)v[\d.]+/g, '$1v*').replace(/<script\b[\s\S]*?<\/script>/g, '<script/>').replace(/<div[^>]*id="dm-tribox"[\s\S]*?<!--\/dm-tribox-->/g, '').replace(/(<select[^>]*id="dm-gate"[^>]*>)[\s\S]*?<\/select>/, '$1</select>');
  const oh = id => { const e = $(id); return e ? e.outerHTML : ''; };
  const page = () => ({ body: strip(d.body.innerHTML) + '|gate=' + $('dm-gate').value, grid: oh('dm-gridbox'), x: oh('dm-xline') + oh('dm-xbox'), pv: oh('dm-pvbody') + oh('dm-tftbody') + oh('dm-tftnote') });
  const res = {};
  let n = 0, nd = 0;
  for (const k of DM.SELECT_KEYS) {
    if (ONLY && ONLY.indexOf(k) < 0) continue;
    await openPage(); fire('dm-model', k); const tk = Date.now(), n0 = n;
    for (const st of states(k)) {
      w.dmState.cur = DM.cloneState(st.s); w.dmState.xTouched = true;
      const regs = JSON.stringify(DM.exportRegs(k, st.s, true)) + '|' + w.dmBuildScript() + '|' + DM.cks(k, st.s) + '|' + JSON.stringify(Array.from({ length: 24 }, (_, i) => DM.cellView(k, st.s, i / 6 | 0, i % 6))) +
        '|' + JSON.stringify(DM.MODELS[k].kind === 'mnt' ? A.wiringFromState(k, st.s) : null) + '|' + JSON.stringify(Array.from({ length: 24 }, (_, i) => DM.cellOptions(k, st.s, i / 6 | 0, i % 6))) + '|' + JSON.stringify(DM.allSameOptions(k, st.s));
      const r = { regs: h(regs) };
      if (st.dom) { w.dmRender(); const p = page(); if (process.env.SNAP_DUMP && process.env.SNAP_DUMP === st.id) fs.writeFileSync(process.env.SNAP_DUMP_TO || '/tmp/snapdump.json', JSON.stringify(p)); r.body = h(p.body); r.grid = h(p.grid); r.x = h(p.x); r.pv = h(p.pv); nd++; }
      res[st.id] = r;
      n++;
    }
    if (process.env.SNAP_V) console.log('  ' + k + ' ' + (n - n0) + ' 組 ' + ((Date.now() - tk) / 1000).toFixed(1) + ' s, heap ' + (process.memoryUsage().heapUsed / 1e6 | 0) + ' MB');
  }
  console.log('組合數 ' + n + '（整頁重畫 ' + nd + ' 組；' + ((Date.now() - T0) / 1000).toFixed(1) + ' s）');
  if (WRITE) {
    /* SNAP_ONLY＝分批拍（單次執行有時間上限時）：併入既有基準檔 */
    let all = res; if (ONLY && fs.existsSync(SNAP)) { all = JSON.parse(fs.readFileSync(SNAP, 'utf8')).res; Object.keys(all).forEach(id => { if (ONLY.indexOf(id.split('|')[0]) >= 0) delete all[id]; }); Object.assign(all, res); }
    fs.writeFileSync(SNAP, JSON.stringify({ base: 'datamap v1.31.4 (b259f82)', made: new Date().toISOString(), n: Object.keys(all).length, res: all }, null, 0)); console.log('已寫基準 ' + SNAP + '（' + Object.keys(all).length + ' 組）'); return;
  }
  const base = JSON.parse(fs.readFileSync(SNAP, 'utf8')).res;
  let pass = 0, fail = 0; const bad = {};
  const keys = Object.keys(base).filter(id => !ONLY || ONLY.indexOf(id.split('|')[0]) >= 0);
  keys.forEach(id => {
    const a = base[id], b = res[id];
    if (!b) { fail++; (bad.missing = bad.missing || []).push(id); return; }
    ['grid', 'x', 'pv', 'regs', 'body'].forEach(f => { if (!(f in a) && !(f in b)) return; if (a[f] === b[f]) pass++; else { fail++; (bad[f] = bad[f] || []).push(id); } });
  });
  Object.keys(res).forEach(id => { if (!base[id]) { fail++; (bad.extra = bad.extra || []).push(id); } });
  Object.keys(bad).forEach(f => console.log('  ✗ ' + f + '：' + bad[f].length + ' 筆，例 ' + bad[f].slice(0, 3).join('；')));
  console.log('Single／Dual 快照比對（基準 ' + keys.length + ' 組）：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
