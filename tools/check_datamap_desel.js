#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_desel.js — datamap v1.24.0：FORCE_DE_SEL 換算 T 組合、T 使用分析、格子 T 標示、連線區步驟說明
   Bruce 2026-10-13：「設定 3 應該是 T2 跟 T1 兩個是 or；設定 5 就是 T3 跟 T1…要可以把它顯示在基準未確定的下拉選單裡」
                     「右下角多一個 T2上?、T3下? 是什麼意思」「有辦法去解析 T 幾到底是怎麼使用嗎」
                     「連線…應該要像 I2C 網頁那樣…有步驟的說明，做得跟 I2C 網頁一模一樣」
   ① 核心（node）：0~63 全部換算＝bit n→T(n+1)；3／5／14 例子；T 使用分析（合成 code）
   ② 頁面（jsdom）：EM02 輸入框旁即時換算、下拉顯示 T 組合、分析區、格子標示與圖例、one-hot 不顯示分析
   ③ 連線提示（jsdom＋假 Bridge 不在）：mountNeed 的三步驟、下載鈕、說明視窗，文字＝i2c.html 用的 i18n 鍵
   用法：node tools/check_datamap_desel.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common', 'datamap-core.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── ① 核心 ── */
console.log('── ① FORCE_DE_SEL 換算');
/* v1.27.6（同事A 10/14 BOE 分頁）：T1＝最小設 1 的 bit 那欄，連續往右到最大 bit 那欄＋4（取代 v1.24.0「bit n→T(n+1)、可用 T＝設 1 的 bit」） */
for (let v = 0; v < 64; v++) {
  const want = []; if (v) { let lo = 0, hi = 0; while (!(v >> lo & 1)) lo++; for (let b = 0; b < 6; b++) if (v >> b & 1) hi = b; for (let c = lo + 1; c <= hi + 5; c++) want.push(c); }
  ok(JSON.stringify(DM.deSelTs(v, 6)) === JSON.stringify(want), v + ' → ' + want.join(','));
}
ok(DM.deSelText(3, 6) === 'T1～T6＝第1～6欄', '3 → T1～T6＝第1～6欄（' + DM.deSelText(3, 6) + '）');
ok(DM.deSelText(5, 6) === 'T1～T7＝第1～7欄', '5 → T1～T7＝第1～7欄（' + DM.deSelText(5, 6) + '）');
ok(DM.deSelText(14, 6) === 'T1～T7＝第2～8欄', '14 → T1～T7＝第2～8欄（' + DM.deSelText(14, 6) + '）');
ok(DM.deSelText(63, 6) === 'T1～T10＝第1～10欄' && DM.deSelText(32, 6) === 'T1～T5＝第6～10欄', '0x3F → 第1～10欄、0x20 → 第6～10欄');
ok(DM.deSelTs(15, 4).join() === '1,2,3,4,5,6,7,8' && DM.deSelTs(8, 4).join() === '4,5,6,7,8', '4 bit 欄位（NB／E512）同一規則：0xF → 第1～8欄、0x8 → 第4～8欄');
ok(DM.deSelText(0, 6) === '' && DM.deSelText(64, 6) === '', '0／超出 6 bit → 空');

console.log('── ① T 使用分析（RD 定義：從最小的 T 開始用，T＝line buffer）');
function st(codes, extra) { const s = Object.assign({ hand: 1, deEn: 1, deSel: 0, mirror: 0, panel: 1, rd: 0 }, extra || {}); for (let i = 0; i < 24; i++) s['c' + i] = codes[i]; return s; }
ok(DM.deSelBase(14, 6) === 2 && DM.deSelBase(3, 6) === 1 && DM.deSelBase(5, 6) === 1 && DM.deSelBase(0, 6) === null, '基準＝最小的 T：14→T2、3→T1、5→T1、0→無');
{
  /* RD 例：14、Dual、code 都在範圍內 ⇒ 上 gate 用 T2、下 gate 用 T3；T4 沒用到 */
  const u = DM.tUse('EM02', st(Array(24).fill(0), { deSel: 14, panel: 2, rd: 1 }));
  ok(u.base === 2 && u.used.join() === '2,3' && u.unused.join() === '4,5,6,7,8' && !u.warn.length, '14 Dual：用到第 2、3 欄（可用第 2～8 欄，第 4～8 欄沒用到）：' + u.used.join() + '／' + u.unused.join());
}
{
  const u = DM.tUse('EM02', st(Array(24).fill(0), { deSel: 14 }));
  ok(u.used.join() === '2' && u.per[2].length === 24, '14 Single、code 小：只用 T2');
}
{
  /* code 18~23 在 T2 沒定義（T2 範圍 code<18）⇒ 要用 T3 */
  const codes = Array.from({ length: 24 }, (_, i) => (i < 12 ? i : 18 + (i % 6)));
  const u = DM.tUse('EM02', st(codes, { deSel: 14 }));
  ok(u.used.join() === '2' && u.per[2].length === 24, 'v1.26.0 code 表往左延伸（dummy），14 Single、code 18~23 也在第 2 欄解（不再往右換欄）');
}
{
  /* v1.27.6：5（bit0、bit2）＝第 1～7 欄連續可用 ⇒ Dual 下 gate 的第 2 欄可用，不再警告（舊規則誤判 12 格警告） */
  const u = DM.tUse('EM02', st(Array(24).fill(0), { deSel: 5, panel: 2, rd: 1 }));
  ok(u.base === 1 && u.warn.length === 0 && u.used.join() === '1,2' && u.ts.join() === '1,2,3,4,5,6,7', '5 Dual：可用第 1～7 欄、用到第 1、2 欄、不警告：' + u.ts.join() + '／' + u.used.join());
}
{
  /* v1.27.6：FORCE_DE_EN＝0 ⇒ tUse 用 RD 的 auto 視窗（1D1G 第 1～5 欄、其他第 2～6 欄），不看 FORCE_DE_SEL */
  const a = DM.tUse('EM01', st(Array(24).fill(0), { deEn: 0, deSel: 0x3F, panel: 0 })), b = DM.tUse('EM01', st(Array(24).fill(0), { deEn: 0, deSel: 0x3F, panel: 1 }));
  ok(a.base === 1 && a.ts.join() === '1,2,3,4,5' && b.base === 2 && b.ts.join() === '2,3,4,5,6,7' && !a.warn.length && !b.warn.length, 'v1.28.1 de_en=0：1D1G 第 1～5 欄、Zigzag（等同 0x06）第 2～7 欄（不看 0x3F）');
}
{
  /* 3＝T1|T2、code 24~29 要 T4 ⇒ 超過最大 T 警告；X 不列 */
  const codes = Array.from({ length: 24 }, (_, i) => (i < 6 ? 24 + i : (i < 12 ? 31 : i - 12)));
  const u = DM.tUse('EM02', st(codes, { deSel: 3 }));
  ok(u.warn.length === 0 && u.used.join() === '1', 'v1.26.0 3、code 24~29：在第 1 欄解（左側 dummy），不警告');
  ok(u.cells.length === 18, 'X（31）不列入');
}
{
  /* NB E503（4 bit）：只看 gate；Dual 14 ⇒ T2、T3 */
  const u = DM.tUse('E503', st(Array(24).fill(0), { deSel: 14, panel: 2, rd: 1 }));
  ok(u.bits === 4 && u.base === 2 && u.used.join() === '2,3', 'E503 Dual 14：T2、T3（NB 名稱固定，只看 gate）');
}

console.log('── ① FORCE_DE_SEL 強制 0x0E：照瑞鼎 Python UI（PY:29267／29377 集合），MNT 不動');
for (const k of ['E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139', 'EM01', 'EM02', 'E512']) {
  const s0 = Object.assign(DM.emptyState(k), { hand: 1, panel: 2, rd: 1, deEn: 1, deSel: 3 });
  const opts = DM.cellOptions(k, s0, 0, 0), nm = opts.length ? opts.find(o => o.name !== 'X' && o.name !== DM.cellView(k, s0, 0, 0).txt) || opts[0] : null;
  const r = nm ? DM.editCell(k, s0, 0, 0, nm.name) : null;
  const want = ['E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139'].includes(k) ? 0xE : 3;
  ok(r && (r.state.deSel | 0) === want, k + ' 改一格（' + (nm && nm.name) + '）⇒ FORCE_DE_SEL＝0x' + ((r && r.state.deSel) | 0).toString(16) + '（應為 0x' + want.toString(16) + '）');
}

/* ── ② ③ 頁面 ── */
(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const FAKE = require(path.join(ROOT, 'tools/fake_i2c_bridge.js'));
  async function open(bridge) {
    const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/Could not load|Not implemented/.test(e.message)) { console.log('  jsdomError', e.message); fail++; } });
    const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        FAKE.install(w, bridge || 'none');
        const mem = {}; Object.defineProperty(w, 'localStorage', { configurable: true, get: () => ({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }) });
        w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
      } });
    await new Promise(r => dom.window.addEventListener('load', r));
    return dom;
  }
  console.log('── ② 頁面：FORCE_DE_SEL');
  {
    const dom = await open(); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(80);
    const S = w.dmState;
    const set = (o) => { Object.assign(S.cur, o); w.dmRender(); };
    for (let i = 0; i < 24; i++) S.cur['c' + i] = i < 12 ? i : 12 + (i % 6);
    set({ hand: 1, deEn: 1, deSel: 3 });
    ok($('f-deSelTs').textContent === '0x03 → T1～T6（第 1～6 欄）' && !/基準|可用 T\d \||不可用|推定/.test($('f-deSelTs').textContent), '輸入 3 ⇒ 輸入框旁「' + $('f-deSelTs').textContent + '」');
    ok(!$('f-tsel') && !d.querySelector('[data-i18n="dm.tselUnk"]') && $('f-deSelTs').getAttribute('data-ts') === '1,2,3,4,5,6', 'v1.27.3 沒有 T 下拉（只留數值＋說明），data-ts＝1～6');
    ok(!$('dm-tuse') && !$('dm-texp') && !$('dm-tdet-tog') && !d.querySelector('[data-i18n="dm.tDet"]'), 'v1.31.1（Bruce 10/14）：T 使用分析、依 T 展開整行、「詳細」按鈕已從畫面刪除');
    ok((() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().base === 1 && (() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().used.join(',') === '1', 'T 使用分析計算（DM.tUse 保留）：T1 從第 1 欄、只用第 1 欄');
    set({ deSel: 5 });
    ok($('f-deSelTs').textContent === '0x05 → T1～T7（第 1～7 欄）', '5（bit0、bit2）⇒ 第 1～7 欄 T1～T7（BOE）「' + $('f-deSelTs').textContent + '」');
    ok((() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().warn.length === 0, 'v1.26.0 5：code 12~17 在第 1 欄解（dummy），不警告');
    set({ deSel: 14 });
    ok($('f-deSelTs').textContent === '0x0E → T1～T7（第 2～8 欄）', '14 ⇒「' + $('f-deSelTs').textContent + '」');
    ok((() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().used.join(',') === '2' && (() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().unused.join(',') === '3,4,5,6,7,8', '14 Single、code<18：只用第 2 欄，第 3～8 欄沒用到');
    ok((() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().base === 2 && (() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().ts.join(',') === '2,3,4,5,6,7,8', 'T 使用分析：連續視窗第 2～8 欄');
    set({ deSel: 0x3F });
    ok($('f-deSelTs').textContent === '0x3F → T1～T10（第 1～10 欄）', '0x3F ⇒「' + $('f-deSelTs').textContent + '」');
    set({ deSel: 0x20 });
    ok($('f-deSelTs').textContent === '0x20 → T1～T5（第 6～10 欄）', '0x20 ⇒「' + $('f-deSelTs').textContent + '」');
    set({ deEn: 0, panel: 1, rd: 0 });
    ok($('f-deSelTs').textContent === 'FORCE_DE_EN＝0：等同 0x06 → T1～T6（第 2～7 欄）', 'de_en=0 Zigzag ⇒「' + $('f-deSelTs').textContent + '」');
    set({ deEn: 1, deSel: 14 });
    // 打字即時換算（還沒 change）
    $('f-deSel').value = '6'; $('f-deSel').dispatchEvent(new w.Event('input'));
    ok($('f-deSelTs').textContent === '0x06 → T1～T6（第 2～7 欄）', '打字 6（未離開欄位）⇒ 即時「' + $('f-deSelTs').textContent + '」');
    // one-hot ⇒ 分析基準 T3
    set({ deSel: 4 });
    ok(/0x04 → T1～T\d+（第 3～/.test($('f-deSelTs').textContent) && (() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().base === 3, 'one-hot 4 ⇒「' + $('f-deSelTs').textContent + '」、分析基準第 3 欄');
    // v1.27.3：數值輸入框 change ⇒ 寫入 FORCE_DE_SEL（取代下拉）
    $('f-deSel').value = '2'; $('f-deSel').dispatchEvent(new w.Event('change')); await sleep(20);
    ok((S.cur.deSel | 0) === 2 && /0x02 → T1～T\d+（第 2～/.test($('f-deSelTs').textContent), '輸入 2 ⇒ FORCE_DE_SEL＝0x02、說明「' + $('f-deSelTs').textContent + '」');
    // 格子標示
    set({ deSel: 3, panel: 2, rd: 1 }); await sleep(20);
    const tts = Array.from(d.querySelectorAll('.dm-tt')).map(e => (e.querySelector('.dm-tt-w') || e).textContent);
    ok(tts.length && tts.every(t => /^T[12]·第\d欄(·(上|下) gate)?$/.test(t)) && tts.some(t => /^T2·第\d欄·下 gate/.test(t)), '格子標示＝T1／T2＋第幾欄、多 bit 不標推定「' + tts.slice(0, 2).join('／') + '」（不再有 ?）');
    ok(!tts.some(t => /\?/.test(t)), '格子標示沒有「?」');
    ok(tts.some(t => /上 gate/.test(t)) && tts.some(t => /下 gate/.test(t)), 'Dual：上 gate／下 gate 都有標');
    set({ hand: 0 }); await sleep(20);
    ok(Array.from(d.querySelectorAll('.dm-tt')).every(e => e.textContent === ''), 'Hand Mode 關（空白格）⇒ 不留舊的 T 標示');
    ok(!$('dm-lg-tt'), 'v1.31.1：圖例「格子右下角：T 段·第 N 欄 ⓘ」已刪除');
    ok(!/可用 T\d \||基準 T/.test($('f-deSelTs').textContent + $('dm-tsum').textContent), '畫面上不再出現「可用 T…」「基準 T…」');
    // NB（E503）：同一套 FORCE_DE_EN／FORCE_DE_SEL 列
    $('dm-model').value = 'E503'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(80);
    const row = id => $(id).closest('.dm-frow');
    ok(!row('f-deSel').classList.contains('hidden') && !row('f-deEn').classList.contains('hidden'), 'E503：FORCE_DE_EN／FORCE_DE_SEL 列顯示（與 MNT 同一套）');
    ok(+$('f-deSel').max === 15 && !$('f-tsel'), 'E503：4 bit（max 15），沒有 T 下拉');
    Object.assign(w.dmState.cur, { hand: 1, deEn: 1, deSel: 14, panel: 2, rd: 1 }); w.dmRender();
    ok(/T1～T7（第 2～8 欄）/.test($('f-deSelTs').textContent) && (() => { const D = w.TCONDataMap, St = w.dmState; return D.tUse(St.model, St.cur, D.gateOf(St.model, St.cur)); })().used.join(',') === '2,3', 'E503 Dual 14：T1 從第 2 欄開始、用到第 2、3 欄');
    $('dm-model').value = 'E501A'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(80);
    Object.assign(w.dmState.cur, { hand: 1, deEn: 1, deSel: 3, panel: 2, rd: 1 }); w.dmRender();
    ok(!$('dm-tuse') && /0x03 → T1～T6/.test($('f-deSelTs').textContent), 'E501A：輸入框旁一行（不再有 T 使用分析說明）');
    $('dm-model').value = 'DAZ7353'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(80);
    ok(row('f-deSel').classList.contains('hidden'), 'DAZ7353（沒有 FORCE_DE_SEL，用 HAND_LINE_SEL）：不顯示');
    dom.window.close();
  }
  console.log('── ②b 接線圖亮的 subpixel＝表格用到的名稱（v1.26.2，Bruce 10/13 全民全部暗）');
  {
    const dom = await open(); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    const cases = [
      ['EM01 全民型（Zigzag、0x1F、Mirror 1，名稱在 R1 左邊）', 'EM01', { hand: 1, deEn: 1, deSel: 0x1F, panel: 1, rd: 0, mirror: 1 }, [17, 16, 15, 14, 13, 12, 16, 15, 14, 13, 12, 23]],
      ['EM01 Mirror 0、0x1F', 'EM01', { hand: 1, deEn: 1, deSel: 0x1F, panel: 1, rd: 0, mirror: 0 }, [17, 16, 15, 14, 13, 12, 16, 15, 14, 13, 12, 23]],
      ['EM02 HSD 0x0E（同事C型）', 'EM02', { hand: 1, deEn: 1, deSel: 0x0E, panel: 2, rd: 1, mirror: 0 }, [6, 8, 10, 0, 2, 4, 13, 15, 17, 7, 9, 11]],
      ['EM02 Single 0x02', 'EM02', { hand: 1, deEn: 1, deSel: 0x02, panel: 1, rd: 0, mirror: 0 }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
      ['E503 Dual', 'E503', { hand: 1, deEn: 1, deSel: 0x0E, panel: 2, rd: 1 }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    ];
    for (const [name, model, f, codes] of cases) {
      $('dm-model').value = model; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(60);
      const S = w.dmState; Object.assign(S.cur, f);
      for (let i = 0; i < 24; i++) S.cur['c' + i] = codes[i % 12];
      w.dmRender(); await sleep(40);
      const tbl = new Set(); for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { const v = ($('dm-c' + r + '-' + c) || {}).value; if (v && v !== 'X' && v !== '' && !/^__/.test(v)) tbl.add(v); }
      const main = Array.from(d.querySelectorAll('#dm-pv-tft rect[data-tier="main"]'));
      const lit = new Set(main.map(r => r.getAttribute('data-dn')).filter(x => x && x !== 'X'));
      const same = tbl.size > 0 && tbl.size === lit.size && [...tbl].every(x => lit.has(x));
      ok(same, name + '：亮的 subpixel 收到的資料集合＝表格名稱集合（表格 ' + [...tbl].sort().join(' ') + '｜亮 ' + [...lit].sort().join(' ') + '）');
      const allR = Array.from(d.querySelectorAll('#dm-pv-tft rect[data-pv]'));
      const dumOk = allR.every(r => { const nm = (r.getAttribute('data-pv') || '').split(':')[1] || ''; const neg = /^[RGB]-\d/.test(nm); return !nm || (r.getAttribute('data-dum') === '1') === neg && (!neg || r.getAttribute('stroke-dasharray') !== 'none'); });
      const litDum = main.filter(r => r.getAttribute('data-dum') === '1').length;
      ok(dumOk, name + '：負索引（dummy）格子一律虛線外框、非 dummy 沒有（亮的 dummy ' + litDum + ' 格）');
    }
    dom.window.close();
  }
  console.log('── ③ 連線提示（沒有 Bridge）');
  {
    const dom = await open('none'); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    $('dm-link').click(); await sleep(400);
    const need = $('dm-i2c-need');
    ok(!need.hasAttribute('hidden'), '連不上 ⇒ 提示出現');
    const steps = Array.from(need.querySelectorAll('ol.i2cb-need-steps li')).map(li => li.innerHTML);
    const I = w.I18N;
    ok(steps.length === 3 && steps[0] === I['i2c.howto1']['zh-TW'] && steps[1] === I['i2c.howto2']['zh-TW'] && steps[2] === I['i2c.howto3']['zh-TW'], '三步驟＝i2c.html 的 i2c.howto1~3（同一份字）');
    ok(need.textContent.indexOf(I['i2c.nxGetBridge']['zh-TW']) >= 0, '下一步一句＝i2c.nxGetBridge');
    const a = need.querySelector('a.i2cb-need-dl');
    ok(a && a.getAttribute('href') === w.I2CBridge.dlHref(), '大下載鈕 href＝dlHref()');
    ok(need.querySelector('details.i2cb-need-ts') && need.innerHTML.indexOf(I['i2c.tsTitle']['zh-TW']) >= 0, '疑難排解（i2c.tsTitle）');
    a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    const m = $('i2cb-howto');
    ok(m && !m.hasAttribute('hidden') && m.innerHTML.indexOf(I['i2c.howtoTitle']['zh-TW']) >= 0 && m.querySelectorAll('li').length === 3, '按下載 ⇒ 跳「' + I['i2c.howtoTitle']['zh-TW'] + '」說明視窗');
    $('i2cb-howto-ok').click();
    ok(m.hasAttribute('hidden'), '按「知道了」關閉');
    const small = $('dm-i2c-dl');
    small.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    ok(!m.hasAttribute('hidden'), '① 的小下載連結按下也跳說明視窗');
    dom.window.close();
  }
  /* v1.27.0（同事A 10/13）：reg_force_de_en＝0 ⇒ 1D1G 從第 1 欄（T1）、Zigzag／HSD 從第 2 欄（T2）；Mirror 不平移名稱 */
  { const b = p => DM.mntBaseT(Object.assign(DM.emptyState('EM01'), { deEn: 0, panel: p }), 'single').t;
    ok(b(0) === 1 && b(1) === 2 && b(2) === 2 && b(3) === 3, 'v1.28.1 auto（同事A 10/14 14:44）：1D1G＝第 1 欄、Zigzag＝第 2 欄、HSD＝第 2 欄、LTPS＝第 3 欄：' + [b(0), b(1), b(2), b(3)].join(','));
    ok(DM.mntName('single', 0, 17, 1, 1) === DM.mntName('single', 0, 17, 0, 1) && DM.mntName('single', 0, 17, 1, 1) === 'B-3', 'v1.27.0 Mirror 不平移名稱：code 17 第 1 欄＝B-3（Mirror 0／1 相同）'); }
  console.log((fail ? '✗' : '✓') + ' check_datamap_desel ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ' + (e && e.stack || e)); process.exit(1); });
