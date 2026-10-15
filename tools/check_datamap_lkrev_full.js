// v1.35.5 Benchmark 自動反推 通用矩陣（Bruce 10/15「只要有錯的都要改…為什麼演算法不是應該全部通用？」）
// 用法：node tools/check_datamap_lkrev_full.js [repo] [型號,…] [--ch1only]
// 每個有 Auto 清單的型號 × 每個面板樣式（Auto 清單：1D1G／Zigzag 各 type／HSD 各 sub／LTPS／Tri…）× 鎖定時 Mirror 0/1 × CHRB 0/1 × 鎖定時 CH1 左／右
//   → 鎖定 → 開 Benchmark → CH1 換到另一邊 → 按一次自動反推。
// 判定：鎖定時 0 呼吸燈的組合，反推後必須 0（逐格完全相符）；結果行（R.bad）與接線圖一致。
//   沒到 0 的：再用不限時間（budget 10 分鐘）重跑一次＝第二層所有可調暫存器全部等價類都試過；仍不是 0 的列為「窮舉後仍無解」並列出搜尋了哪些暫存器。
// 鎖定時就有呼吸燈（接線圖本身衝突）或沒有圖的組合列為「略過」並寫原因。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3].split(',') : null;
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('jsdomError', e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const reset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); fire($('dm-pv-first'), 'l'); fire($('dm-pv-stripe'), 'rgb'); fire($('dm-pv-drv'), 'f'); fire($('dm-pv-swap'), false); };
  const err = () => d.querySelectorAll('#dm-pv-tft .pv-err').length;
  const rvsAll = m => { const L = DM.fieldById(m, 'rvsL'), H = DM.fieldById(m, 'rvsH'); return { L: L ? (1 << L.bits) - 1 : 0, H: H ? (1 << H.bits) - 1 : 0 }; };
  const models = DM.SELECT_KEYS.filter(k => A.fam && A.fam(k) && (!ONLY || ONLY.includes(k)));
  let n = 0, zero = 0, bad = 0, slow = 0, tMax = 0, ext = 0, roOnly = 0, na = 0; const skip = [], nz = [], hard = [];
  for (const m of models) {
    const L = A.list(m) || [], hasM = !!DM.fieldById(m, 'mirror'), hasC = !!DM.fieldById(m, 'chrb');
    const BASIC = process.argv.includes('--basic');   // 只跑鎖定時 Mirror 0／CHRB 0（Auto 樣式本身）× CH1 左右
    for (let i = 0; i < L.length; i++) for (const mir of hasM && !BASIC ? [0, 1] : [0]) for (const cb of hasC && !BASIC ? [0, 1] : [0]) for (const ch of ['l', 'r']) {
      const tag = m + ' ' + L[i].name + ' Mirror' + mir + ' CHRB' + cb + ' 鎖定 CH1' + (ch === 'l' ? '左→右' : '右→左');
      reset(); setModel(m); fire($('dm-pv-first'), ch);
      const s = DM.setHand(m, A.apply(m, DM.emptyState(m), i), false);
      if (hasM) { s.mirror = mir; const R = rvsAll(m); if (DM.fieldById(m, 'rvsL')) { s.rvsL = mir ? R.L : 0; if (DM.fieldById(m, 'rvsH')) s.rvsH = mir ? R.H : 0; } }
      if (hasC) s.chrb = cb;
      S.cur = s; w.dmRender();
      if (!$('dm-pv-tft').querySelector('rect')) { skip.push(tag + '：沒有接線圖'); continue; }
      $('dm-pv-lock').click(); const e0 = err(); B.open(true);
      if (e0) { skip.push(tag + '：鎖定時已有 ' + e0 + ' 格呼吸燈（接線圖本身）'); continue; }
      fire($('dm-pv-first'), ch === 'l' ? 'r' : 'l');
      const t0 = Date.now(); let R = B.reverse(); let e2 = err(); const dt = Date.now() - t0; n++; tMax = Math.max(tMax, dt); if (dt > 10000) slow++;
      if (R && R.kn && R.kn.length) ext++;
      if (R && R.bad === -1) { na++; hard.push(tag + '：架構不同（' + R.txt + '）——鎖定的是 Auto 架構，強制 Hand 後 Gate／週期與鎖定時不同，Hand 表格表示不出這個架構'); continue; }
      if (R && (R.bad === 0) !== (e2 === 0)) { bad++; nz.push(tag + '：結果行與接線圖不一致（' + (R && R.txt) + '，接線圖 ' + e2 + '）'); }
      if (e2 === 0 && R && R.bad === 0) { zero++; continue; }
      // 只有撞到時間上限的才不限時重跑
      if (B.budget && R && R.ms >= B.budget() * 0.9) { const o = B.budget(600000); R = B.reverse(); e2 = err(); B.budget(o); }
      if (e2 === 0 && R && R.bad === 0) { zero++; nz.push(tag + '：限時內 ' + (R && R.txt) + '，不限時才 0（時間上限不足）'); bad++; continue; }
      /* 證據：解除唯讀（只在測試）再反推一次——變 0 ＝唯讀暫存器（NB 固定 14 的 FORCE_DE_SEL）擋住，硬體上這台不可達；仍不是 0 ＝搜尋空間內窮舉後仍無解 */
      let why = '';
      if (B.noRo) { B.noRo(true); const R3 = B.reverse(); const e3 = err(); B.noRo(false); why = e3 === 0 && R3 && R3.bad === 0 ? '；解除唯讀後 0 錯（' + R3.txt + '）＝唯讀暫存器限制' : '；解除唯讀仍 ' + (R3 && R3.bad) + ' 格'; if (e3 === 0 && R3 && R3.bad === 0) roOnly++; }
      { const U = {}; for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { try { (DM.triOn(m, S.cur) ? DM.triCellOptions(m, S.cur, r) : (r < 4 ? DM.cellOptions(m, S.cur, r, c) : [])).forEach(o => { const k = /^([RGB])(-?\d+)$/.exec(o.name); if (k) U[+k[2]] = 1; }); } catch (e) {} }
        const ks = Object.keys(U).map(Number).sort((a, b) => a - b); if (ks.length) why += '；格子可選 pixel 只有 ' + ks[0] + '～' + ks[ks.length - 1]; }
      hard.push(tag + '：窮舉後最少 ' + (R && R.bad) + ' 格（' + (R && R.txt) + '）' + why);
    }
  }
  reset();
  console.log('略過 ' + skip.length + (process.argv.includes('-v') ? '：\n  ' + skip.join('\n  ') : ''));
  console.log('窮舉後仍無解 ' + hard.length + '：\n  ' + hard.join('\n  '));
  console.log('錯誤 ' + nz.length + '：\n  ' + nz.join('\n  '));
  console.log('check_datamap_lkrev_full：型號 ' + models.join('、') + '｜' + n + ' 組，反推 0 錯 ' + zero + '（其中用到第二層暫存器 ' + ext + '）、窮舉後仍無解 ' + hard.length + '（其中架構不同 ' + na + '、唯讀暫存器限制 ' + roOnly + '）、錯誤 ' + bad + '、最慢 ' + tMax + ' ms（>10 s ' + slow + ' 組）');
  process.exit(bad ? 1 : 0);
})();
