#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_sd_snapshot.js — datamap v1.32.0 Tri-Gate 隔離測試（Bruce 2026-10-15 硬性限制）
   Bruce 原話：「任何 tri-gate 的新增設定，千萬不要影響到原本 single gate 跟 dual gate 的結果。」
   做法：對「不是 Hand＋Tri」的全部組合拍快照，之後每一版逐格比對，差 1 處就 fail。
     組合：所有型號（SELECT_KEYS，含 EN01）×
           Hand 開：Single／Dual（panel 0/1/2 × 對應 RD）× sub_panel 0~7 × FORCE_DE_EN／FORCE_DE_SEL（0/0、1/0x02、1/0x0E、1/0x0C）× Mirror × CHRB
           Hand 關（Auto）：panel 0~3 × sub 0~7 × FORCE_DE_EN 0/1 × Mirror × CHRB
           兩組格值樣式（c／x／e 欄位依公式填）。
     每個組合記：整頁 body、② 表格、第二組、③ TFT 接線圖、exportRegs（寫入 byte＋mask）、匯出 script、CKS…

   快照格式 2（Bruce 10/15「應該要用 Pixel 位置跟 Gate 位置來當作它的位置座標…怎麼變，都不會改變結果啊！」）：
     TFT 接線圖（#dm-pv-tft）不再記畫面 XY，改由 tools/datamap_tft_logic.js 轉成「固定的邏輯位置 → 內容」：
       位置：第 N 列（實體 pixel 列，Single／Dual／Tri 不變）＋第 M 欄（玻璃上的實體 subpixel 欄，從玻璃最左 0 起；
             Mirror／CH1 左右／Driver 正反／RGB↔BGR 不變）；Data 線在第 b 縫（第 b−1 與第 b 欄之間）。
       內容：接哪條 gate（Line x-1/x-2/x-3）、接哪條 Data／SD OUT／TCON OUT、名稱、顏色、亮／暗／dummy／衝突、提示文字＝全部非幾何屬性與文字。
       螢幕幾何（x、y、d、寬高、viewBox、字級、data-x、data-gy…）不進快照 ⇒ 改字級、欄距、版面結果不變，只有接錯、算錯才不同。
     整頁 body 不再含 TFT 圖本體（由上面逐格比）；另去掉 v1.35.10 刪除的「實驗：Single／Dual／Tri」標籤（#dm-pv-exp，內容＝gate 類型，已由 |gate= 與 TFT meta 的 data-ng 比對）。
     報錯時寫「第 N 列、第 M 欄」與兩邊的內容摘要。
   基準：由 v1.35.9（241ca45，字級放大前）用本規則拍；v1.35.10 對它 24,608 項全同才存檔。
   用法：node tools/check_datamap_sd_snapshot.js [repo]            比對（基準檔 tools/datamap_sd_snapshot.json）
         node tools/check_datamap_sd_snapshot.js [repo] --write    重拍基準（只能在已證明正確的版本做）
         環境變數：SNAP_FILE 基準檔、SNAP_ONLY 只跑某些型號（逗號）、SNAP_V 顯示每型號耗時、SNAP_DUMP／SNAP_DUMP_TO 傾印某組
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
const TL = require('./datamap_tft_logic.js');   // 和本檔同目錄（拍舊版基準時 repo 參數指向舊版，規則仍用這份）
const h = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const T0 = Date.now();
const ONLY = process.env.SNAP_ONLY ? process.env.SNAP_ONLY.split(',') : null;
/* 自我檢查用（tools/check_datamap_sd_snapshot_selftest.js）：SNAP_IDS＝只跑 id 符合此 regex 的組合；SNAP_MUT＝「欄位+差值」故意改一個暫存器欄位（例 c3+1）。
   兩者都不能寫進正式基準檔 */
const IDS = process.env.SNAP_IDS ? new RegExp(process.env.SNAP_IDS) : null;
const MUT = process.env.SNAP_MUT ? /^(\w+)([+-]\d+)$/.exec(process.env.SNAP_MUT) : null;
if ((IDS || MUT) && WRITE && !process.env.SNAP_FILE) { console.log('✗ SNAP_IDS／SNAP_MUT 只能寫到 SNAP_FILE 指定的暫存基準'); process.exit(2); }
if (MUT && WRITE) { console.log('✗ SNAP_MUT 不能拍基準'); process.exit(2); }

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

/* 位置鍵 ⇒ 中文 */
const posTxt = k => { let m;
  if ((m = /^N(\d+)M(-?\d+)$/.exec(k))) return '第 ' + m[1] + ' 列、第 ' + m[2] + ' 欄';
  if ((m = /^N(\d+)B(-?\d+)$/.exec(k))) return '第 ' + m[1] + ' 列、第 ' + m[2] + ' 縫（第 ' + (m[2] - 1) + '／' + m[2] + ' 欄之間，未接到畫面內格子的 TFT）';
  if ((m = /^B(-?\d+)$/.exec(k))) return '第 ' + m[1] + ' 縫的 Data 線（第 ' + (m[1] - 1) + '／' + m[1] + ' 欄之間）';
  if ((m = /^N(\d+)$/.exec(k))) return '第 ' + m[1] + ' 列的列名與 gate 線';
  return k === 'hdr' ? 'TFT 圖標頭' : (k === 'meta' ? 'TFT 圖整體屬性' : (k === 'rest' ? 'TFT 卡片其他部分（非接線圖）' : k)); };
/* 儲存：位置清單（layouts）與內容簽章（ct：可讀摘要＋內容雜湊）去重，每組只存索引 */
function pack(res) {
  const L = [], Li = {}, C = [], Ci = {}, out = {};
  Object.keys(res).forEach(id => {
    const r = Object.assign({}, res[id]); const m = r.pvm; delete r.pvm;
    if (m) { const ks = Object.keys(m).sort(), lk = ks.join(','); if (!(lk in Li)) { Li[lk] = L.length; L.push(lk); } r.pvL = Li[lk]; r.pvI = ks.map(k => { const v = m[k]; if (!(v in Ci)) { Ci[v] = C.length; C.push(v); } return Ci[v]; }); }
    out[id] = r;
  });
  return { res: out, layouts: L, ct: C };
}
function unpack(f) {
  const res = f.res; if (!f.layouts) return res;
  Object.keys(res).forEach(id => { const r = res[id]; if (r.pvL === undefined) return; const ks = f.layouts[r.pvL].split(','), m = {}; ks.forEach((k, i) => { m[k] = f.ct[r.pvI[i]]; }); r.pvm = m; delete r.pvL; delete r.pvI; });
  return res;
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
  const strip = html => html.replace(/(data-tool-version="datamap">)v[\d.]+/g, '$1v*').replace(/<script\b[\s\S]*?<\/script>/g, '<script/>').replace(/<div[^>]*id="dm-tribox"[\s\S]*?<!--\/dm-tribox-->/g, '').replace(/\n\s*<div[^>]*id="dm-mini-ctl"[\s\S]*?<!--\/dm-mini-ctl-->/g, '').replace(/(<select[^>]*id="dm-gate"[^>]*>)[\s\S]*?<\/select>/, '$1</select>');
  /* v1.35.11：預覽小窗的控制列（#dm-mini-ctl）是 TFT 卡 #dm-pv-vlbar／#dm-pv-colmode 的同步複本（同一份 PV_NL_MIN／PV_COLMODE），TFT 卡那份已在 pv 欄比對，body 不重複計 */
  /* 格式 2：TFT 圖本體（主圖與預覽小窗複本）從 HTML 拿掉，改逐格邏輯比對；v1.35.10 刪除的 #dm-pv-exp 標籤（內容＝gate 類型）拿掉 */
  const noTft = s => s.replace(/<svg[^>]*id="dm-pv-tft"[^>]*>[\s\S]*?<\/svg>/g, '<svg id="dm-pv-tft"/>').replace(/(<div[^>]*id="dm-mini-svg"[^>]*>)<svg[\s\S]*?<\/svg>/g, '$1').replace(/<span class="dm-pvexp" id="dm-pv-exp"[^>]*>[^<]*<\/span>/g, '');
  const oh = id => { const e = $(id); return e ? e.outerHTML : ''; };
  const page = () => {
    const svg = $('dm-pv-tft'), T = TL.tftLogic(svg && svg.children.length ? svg : null), rest = noTft(oh('dm-pvbody') + oh('dm-tftbody') + oh('dm-tftnote'));
    const pvm = { rest: '§' + h(rest) }; Object.keys(T.map).forEach(k => { pvm[k] = (T.sum[k] || '') + '§' + h(T.map[k]); });
    return { body: noTft(strip(d.body.innerHTML)) + '|gate=' + $('dm-gate').value, grid: oh('dm-gridbox'), x: oh('dm-xline') + oh('dm-xbox'), pvm, tft: T.map };
  };
  const res = {};
  let n = 0, nd = 0;
  for (const k of DM.SELECT_KEYS) {
    if (ONLY && ONLY.indexOf(k) < 0) continue;
    await openPage(); fire('dm-model', k); const tk = Date.now(), n0 = n;
    for (const st of states(k)) {
      if (IDS && !IDS.test(st.id)) continue;
      if (MUT && st.s[MUT[1]] !== undefined) { const f = DM.fieldById(k, MUT[1]); st.s[MUT[1]] = (st.s[MUT[1]] + (+MUT[2])) & (f ? (1 << f.bits) - 1 : 0xff); }
      w.dmState.cur = DM.cloneState(st.s); w.dmState.xTouched = true;
      const regs = JSON.stringify(DM.exportRegs(k, st.s, true)) + '|' + w.dmBuildScript() + '|' + DM.cks(k, st.s) + '|' + JSON.stringify(Array.from({ length: 24 }, (_, i) => DM.cellView(k, st.s, i / 6 | 0, i % 6))) +
        '|' + JSON.stringify(DM.MODELS[k].kind === 'mnt' ? A.wiringFromState(k, st.s) : null) + '|' + JSON.stringify(Array.from({ length: 24 }, (_, i) => DM.cellOptions(k, st.s, i / 6 | 0, i % 6))) + '|' + JSON.stringify(DM.allSameOptions(k, st.s));
      const r = { regs: h(regs) };
      if (st.dom) {
        w.dmRender(); const p = page();
        if (process.env.SNAP_DUMP && process.env.SNAP_DUMP === st.id) fs.writeFileSync(process.env.SNAP_DUMP_TO || '/tmp/snapdump.json', JSON.stringify(p));
        r.body = h(p.body); r.grid = h(p.grid); r.x = h(p.x); r.pv = h(JSON.stringify(p.pvm)); r.pvm = p.pvm; nd++;
      }
      res[st.id] = r;
      n++;
    }
    if (process.env.SNAP_V) console.log('  ' + k + ' ' + (n - n0) + ' 組 ' + ((Date.now() - tk) / 1000).toFixed(1) + ' s, heap ' + (process.memoryUsage().heapUsed / 1e6 | 0) + ' MB');
  }
  console.log('組合數 ' + n + '（整頁重畫 ' + nd + ' 組；' + ((Date.now() - T0) / 1000).toFixed(1) + ' s）');
  if (WRITE) {
    /* SNAP_ONLY＝分批拍（單次執行有時間上限時）：併入既有基準檔 */
    let all = res, meta = { base: process.env.SNAP_BASE || 'datamap (未標)' };
    if (ONLY && fs.existsSync(SNAP)) { const f = JSON.parse(fs.readFileSync(SNAP, 'utf8')); meta.base = f.base; all = unpack(f); Object.keys(all).forEach(id => { if (ONLY.indexOf(id.split('|')[0]) >= 0) delete all[id]; }); Object.assign(all, res); }
    const pk = pack(all);
    fs.writeFileSync(SNAP, JSON.stringify({ fmt: 2, base: meta.base, made: new Date().toISOString(), n: Object.keys(all).length, layouts: pk.layouts, ct: pk.ct, res: pk.res }, null, 0)); console.log('已寫基準 ' + SNAP + '（' + Object.keys(all).length + ' 組）'); return;
  }
  const bf = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  if (bf.fmt !== 2) { console.log('✗ 基準檔不是格式 2（邏輯位置），請用 --write 由已證明正確的版本重拍'); process.exit(1); }
  const base = unpack(bf);
  let pass = 0, fail = 0; const bad = {}, det = [];
  const keys = Object.keys(base).filter(id => (!ONLY || ONLY.indexOf(id.split('|')[0]) >= 0) && (!IDS || IDS.test(id)));
  keys.forEach(id => {
    const a = base[id], b = res[id];
    if (!b) { fail++; (bad.missing = bad.missing || []).push(id); return; }
    ['grid', 'x', 'pv', 'regs', 'body'].forEach(f => {
      if (!(f in a) && !(f in b)) return;
      if (a[f] === b[f]) { pass++; return; }
      fail++; (bad[f] = bad[f] || []).push(id);
      if (f === 'pv' && a.pvm && b.pvm) {
        const ps = Array.from(new Set(Object.keys(a.pvm).concat(Object.keys(b.pvm)))).filter(k => a.pvm[k] !== b.pvm[k]);
        det.push({ id, ps: ps.map(k => ({ k, a: a.pvm[k], b: b.pvm[k] })) });
      }
    });
  });
  Object.keys(res).forEach(id => { if (!base[id]) { fail++; (bad.extra = bad.extra || []).push(id); } });
  const fname = { regs: '暫存器／script／CKS／表格名稱', grid: '② 表格', x: '第二組', pv: '③ TFT 接線圖（逐格）', body: '整頁', missing: '基準有、現在沒有', extra: '現在多出' };
  Object.keys(bad).forEach(f => console.log('  ✗ ' + (fname[f] || f) + '：' + bad[f].length + ' 組，例 ' + bad[f].slice(0, 3).join('；')));
  const sig = v => v === undefined ? '（無）' : (v.split('§')[0] || '（摘要同，其他屬性）') + ' #' + v.split('§')[1].slice(0, 8);
  det.slice(0, +(process.env.SNAP_DET || 5)).forEach(x => {
    console.log('  ✗ ' + x.id + '：TFT ' + x.ps.length + ' 個位置不同');
    x.ps.slice(0, 12).forEach(p => {
      let dif = '';
      if (p.a !== undefined && p.b !== undefined) { const pa = p.a.split('§')[0].split('｜'), pb = p.b.split('§')[0].split('｜'); const df = pb.filter(s => pa.indexOf(s) < 0); dif = df.length ? '（不同的內容：' + df.join('、') + '）' : '（摘要相同，其他屬性不同：顏色、外框、提示文字、TFT／drain 線等）'; }
      console.log('      ' + posTxt(p.k) + dif + '\n        基準：' + sig(p.a) + '\n        現在：' + sig(p.b));
    });
  });
  console.log('Single／Dual 快照比對（基準 ' + keys.length + ' 組，基準來源 ' + bf.base + '）：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
