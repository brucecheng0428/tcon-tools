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
for (let v = 0; v < 64; v++) {
  const want = []; for (let b = 0; b < 6; b++) if (v & (1 << b)) want.push(b + 1);
  ok(JSON.stringify(DM.deSelTs(v, 6)) === JSON.stringify(want), v + ' → ' + want.join('|'));
}
ok(DM.deSelText(3, 6) === 'T1 | T2', '3 → T1 | T2（' + DM.deSelText(3, 6) + '）');
ok(DM.deSelText(5, 6) === 'T1 | T3', '5 → T1 | T3（' + DM.deSelText(5, 6) + '）');
ok(DM.deSelText(14, 6) === 'T2 | T3 | T4', '14 → T2 | T3 | T4（' + DM.deSelText(14, 6) + '）');
ok(DM.deSelText(0, 6) === '' && DM.deSelText(64, 6) === '', '0／超出 6 bit → 空');

console.log('── ① T 使用分析');
function st(codes, extra) { const s = Object.assign({ deEn: 1, deSel: 0, mirror: 0, panel: 1 }, extra || {}); for (let i = 0; i < 24; i++) s['c' + i] = codes[i]; return s; }
{
  /* Single、code 0~11 ⇒ T1 範圍 code<12 全涵蓋；設 T1|T3 ⇒ T1 用 24 格（X 不算）、T3 沒用到 */
  const codes = Array.from({ length: 24 }, (_, i) => i % 12);
  const u = DM.mntTUse(st(codes, { deSel: 5 }), 'single');
  ok(u.ts.join() === '1,3' && u.per[1].length === 24 && u.per[3].length === 0 && u.unused.join() === '3' && !u.out.length, '5（T1|T3）、code<12：T1 用 24 格、T3 設了沒用到');
}
{
  /* code 12~17 只有 T≥2 有定義；設 T1|T2 ⇒ <12 歸 T1、12~17 歸 T2 */
  const codes = Array.from({ length: 24 }, (_, i) => (i < 12 ? i : 12 + (i % 6)));
  const u = DM.mntTUse(st(codes, { deSel: 3 }), 'single');
  ok(u.per[1].length === 12 && u.per[2].length === 12 && !u.unused.length, '3（T1|T2）：12 格 T1、12 格 T2');
  ok(u.per[2].every(c => c.code >= 12 && c.minT === 2), 'T2 那 12 格的 code 都 ≥12、最低需要 T2');
}
{
  /* code 24~29 需要 T≥4；設 T1|T2 ⇒ 超出；X（31）不列 */
  const codes = Array.from({ length: 24 }, (_, i) => (i < 6 ? 24 + i : (i < 12 ? 31 : i - 12)));
  const u = DM.mntTUse(st(codes, { deSel: 3 }), 'single');
  ok(u.out.length === 6 && u.out.every(c => c.minT === 4), '3（T1|T2）、code 24~29：6 格超出、需要 T4');
  ok(u.cells.length === 18, 'X（31）不列入（24−6＝18）');
}
{
  /* Dual：下 gate（Line x-2）用基準＋1 ⇒ code 12~17 在下 gate 只要 T1 */
  const codes = Array.from({ length: 24 }, (_, i) => 12 + (i % 6));
  const u = DM.mntTUse(st(codes, { deSel: 3, panel: 2 }), 'dual');
  ok(u.per[1].every(c => c.row & 1) && u.per[1].length === 12 && u.per[2].every(c => !(c.row & 1)) && u.per[2].length === 12, 'Dual：code 12~17 下 gate 歸 T1、上 gate 歸 T2');
}
{
  const u = DM.mntTUse(st(Array(24).fill(0), { deSel: 14 }), 'single');
  ok(u.ts.join() === '2,3,4' && u.per[2].length === 24 && u.unused.join() === '3,4', '14（T2|T3|T4）、全 code 0：T2 用 24 格，T3、T4 沒用到');
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
    ok(/T1 \| T2/.test($('f-deSelTs').textContent), '輸入 3 ⇒ 輸入框旁「' + $('f-deSelTs').textContent + '」');
    ok($('f-tsel').value === 'm' && /T1 \| T2（0x03）/.test($('f-tsel-m').textContent) && !$('f-tsel-m').hidden, '下拉顯示「' + $('f-tsel-m').textContent + '」');
    ok(!$('dm-tuse').classList.contains('hidden') && /T 使用分析/.test($('dm-tuse').textContent), 'T 使用分析顯示');
    ok($('dm-tuse').getAttribute('data-per') === '1:12,2:12', 'T 使用分析：' + $('dm-tuse').getAttribute('data-per'));
    set({ deSel: 5 });
    ok(/T1 \| T3/.test($('f-deSelTs').textContent) && /T1 \| T3/.test($('f-tsel-m').textContent), '5 ⇒ T1 | T3（輸入框旁＋下拉）');
    ok($('dm-tuse').getAttribute('data-out') === '0', '5：沒有超出（' + $('dm-tuse').getAttribute('data-per') + '）');
    set({ deSel: 14 });
    ok(/T2 \| T3 \| T4/.test($('f-deSelTs').textContent) && /T2 \| T3 \| T4/.test($('f-tsel-m').textContent), '14 ⇒ T2 | T3 | T4');
    ok($('dm-tuse').getAttribute('data-unused') === '3,4', '14：T3、T4 設了但沒用到（' + $('dm-tuse').getAttribute('data-unused') + '）');
    // 打字即時換算（還沒 change）
    $('f-deSel').value = '6'; $('f-deSel').dispatchEvent(new w.Event('input'));
    ok(/T2 \| T3/.test($('f-deSelTs').textContent), '打字 6（未離開欄位）⇒ 即時「' + $('f-deSelTs').textContent + '」');
    // one-hot ⇒ 下拉選 T 本身、不顯示分析
    set({ deSel: 4 });
    ok($('f-tsel').value === '3' && $('f-tsel-m').hidden && $('dm-tuse').classList.contains('hidden'), 'one-hot 4 ⇒ 下拉＝T3、不顯示分析');
    // 下拉選 T2 ⇒ 寫成 one-hot
    $('f-tsel').value = '2'; $('f-tsel').dispatchEvent(new w.Event('change')); await sleep(20);
    ok((S.cur.deSel | 0) === 2 && (S.cur.deEn | 0) === 1, '下拉選 T2 ⇒ FORCE_DE_SEL＝0x02');
    // 格子標示
    set({ deSel: 3, panel: 2, rd: 1 }); await sleep(20);
    const tts = Array.from(d.querySelectorAll('.dm-tt')).map(e => (e.querySelector('.dm-tt-w') || e).textContent);
    ok(tts.length && tts.every(t => /^T\d(·(上|下) gate)?(·推定)?$/.test(t)) && tts.some(t => /推定/.test(t)), '格子標示改成「' + tts.slice(0, 2).join('／') + '」（不再有 ?）');
    ok(!tts.some(t => /\?/.test(t)), '格子標示沒有「?」');
    ok(tts.some(t => /上 gate/.test(t)) && tts.some(t => /下 gate/.test(t)), 'Dual：上 gate／下 gate 都有標');
    set({ hand: 0 }); await sleep(20);
    ok(Array.from(d.querySelectorAll('.dm-tt')).every(e => e.textContent === ''), 'Hand Mode 關（空白格）⇒ 不留舊的 T 標示');
    ok($('dm-lg-tt') && /右下角/.test($('dm-lg-tt').textContent), '圖例說明格子右下角標示');
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
  console.log((fail ? '✗' : '✓') + ' check_datamap_desel ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ' + (e && e.stack || e)); process.exit(1); });
