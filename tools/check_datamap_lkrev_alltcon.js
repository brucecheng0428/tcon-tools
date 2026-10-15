// v1.35.5（Bruce 10/15「所有 TCON 都檢查一遍」）：11 型 × {HSD Type 4+Z-Zag(BOE), Normal} × 鎖定時 CH1 左／右 → CH1 換到另一邊 → 自動反推，列表各型幾錯。
// 用法：node tools/check_datamap_lkrev_alltcon.js [repo]
// 樣式來源：有 Auto 清單的型號用 Auto 清單（HSD Type 4+Z-Zag(BOE)＝panel 2／sub 3／rd 1 的 HSD 樣式；Normal＝清單第 1 個 1D1G Normal），
//           沒有 Auto 清單的型號用 Hand 預設樣式（DM.PRESETS 名稱比對）；都沒有就寫「無此樣式」。
// 斷言：有錯一定不套用（② 全部暫存器不變）；0 錯一定套用且接線圖 0 呼吸燈。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } return c; };
(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const reset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); fire($('dm-pv-first'), 'l'); fire($('dm-pv-stripe'), 'rgb'); fire($('dm-pv-drv'), 'f'); fire($('dm-pv-swap'), false); };
  const err = () => d.querySelectorAll('#dm-pv-tft .pv-err').length;
  const regs = m => JSON.stringify(DM.fieldsOf(m).map(f => f.id + '=' + (S.cur[f.id] >>> 0)));
  const rows = [];
  for (const m of DM.SELECT_KEYS) {
    setModel(m);
    const fam = A.fam && A.fam(m), L = fam ? (A.list(m) || []) : [];
    const styles = [];
    if (L.length) {
      let h = L.findIndex(x => /HSD Type 4\+Z-Zag\(BOE\)/.test(x.name));
      if (h < 0) h = L.findIndex((x, i) => { const s = A.apply(m, DM.emptyState(m), i); return (s.panel | 0) === 2 && (s.subPanel | 0) === 3 && (s.rd | 0) === 1 && /HSD/.test(x.name) && !/RB_chg/.test(x.name); });
      const n = L.findIndex(x => /Normal/.test(x.name));
      styles.push(['HSD Type4+ZZ(BOE)', h >= 0 ? () => DM.setHand(m, A.apply(m, DM.emptyState(m), h), false) : null, h >= 0 ? L[h].name : '']);
      styles.push(['Normal', n >= 0 ? () => DM.setHand(m, A.apply(m, DM.emptyState(m), n), false) : null, n >= 0 ? L[n].name : '']);
    } else {
      const P = DM.PRESETS || [], fp = re => P.findIndex(p => p && re.test(p.name || ''));
      const h = fp(/HSD.*(Type ?4|BOE)/i), n = fp(/Normal|1D1G/i);
      styles.push(['HSD Type4+ZZ(BOE)', h >= 0 ? () => DM.applyPreset(m, S.cur, h) : null, h >= 0 ? 'Hand ' + P[h].name : '']);
      styles.push(['Normal', n >= 0 ? () => DM.applyPreset(m, S.cur, n) : null, n >= 0 ? 'Hand ' + P[n].name : '']);
    }
    for (const [sn, mk, src] of styles) for (const ch of ['l', 'r']) {
      const row = { m, sn, src, ch: ch === 'l' ? '左→右' : '右→左', res: '' };
      rows.push(row);
      if (!mk) { row.res = '無此樣式'; continue; }
      reset(); setModel(m); fire($('dm-pv-first'), ch);
      try { S.cur = mk(); } catch (e) { row.res = '樣式套用失敗：' + e.message; continue; }
      w.dmRender();
      if (!$('dm-pv-tft').querySelector('rect')) { row.res = '沒有接線圖'; continue; }
      $('dm-pv-lock').click(); const e0 = err(); B.open(true);
      if (e0) { row.res = '鎖定時已有 ' + e0 + ' 格呼吸燈（接線圖本身），不反推'; continue; }
      fire($('dm-pv-first'), ch === 'l' ? 'r' : 'l');
      const before = regs(m), R = B.reverse(), e2 = err();
      if (!R) { row.res = '不支援自動反推（按鈕不顯示）'; continue; }
      if (R.bad === -1) { row.res = '架構不同，無法反推（未套用）'; ok(regs(m) === before, m + ' ' + sn + '：架構不同不應改設定'); continue; }
      if (R.bad === 0) { ok(R.applied === true && e2 === 0, m + ' ' + sn + ' ' + row.ch + '：0 錯應套用且 0 呼吸燈'); row.res = '0 錯，已套用（' + R.txt.replace(/^.*（/, '').replace(/）$/, '') + '）'; }
      else { ok(R.applied === false && regs(m) === before, m + ' ' + sn + ' ' + row.ch + '：有錯不應套用'); row.res = R.bad + ' 錯，未套用（最佳候選 ' + R.txt.replace(/^.*（/, '').replace(/）.*$/, '') + '）'; }
    }
  }
  reset();
  console.log('| 型號 | 樣式 | 來源 | 鎖定 CH1 | 結果 |\n|---|---|---|---|---|');
  rows.forEach(r => console.log('| ' + [r.m, r.sn, r.src || '—', r.ch, r.res].join(' | ') + ' |'));
  console.log('check_datamap_lkrev_alltcon：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
