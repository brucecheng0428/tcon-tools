#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_page.js — datamap.html v1.35.17 頁面狀態保存／清除回歸（jsdom）
   Bruce 10/16 20:4x「只要重新整理網頁，預設的都是 TFT 並排要開啟，然後 Benchmark 預設是關閉的。然後 32 組排列，預設也是收折的然後 T-CON Register 跟匯出 script，預設也是收折」
         「然後 TCON 預設選擇的是 EM01」
   Bruce 10/16 20:5x「請在 TFT 並排那邊多一個『清除』的按鈕…如果沒有按清除的話，重新整理網頁時…網頁有匯入資料或什麼的都把它保留，包含卡片的收折設定等也都要保留。只有按清除，它才會回到…上述那幾種狀態」
   驗：① 第一次開＝預設（EM01、並排、Benchmark 關、32 組排列／TCON Register／匯出 script 收折）
       ② 匯入 code＋改欄位＋鎖定＋③ 設定＋收折＋Benchmark 開 → 重新載入（同一個 localStorage）→ 型號、S 的值、表格、TFT 圖、TCON Register、匯出 script、收折、開合全部相同
       ③ 「清除」（確認框）→ 和第一次開完全相同；dm.page.v1 重寫成預設
       ④ 每個型號：預設 EM01 切過去的欄位 disabled／readOnly／值 ＝ 舊版（預設 E503）切過去；還原進該型號＝切過去
   用法：node tools/check_datamap_page.js [repo] [--old <舊版 repo>] [--qm <EM01 code.bin>]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '..'));
const OLD = opt('--old'), QM = opt('--qm');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

async function open(root, LS) {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(root, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.WebSocket = function () { throw new Error('no ws'); };
      const store = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
      Object.defineProperty(w, 'localStorage', { configurable: true, get: () => store });
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  return dom;
}
const fire = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
function formSig(w) {
  const d = w.document;
  return Array.from(d.querySelectorAll('.container input, .container select, .container textarea')).map((e, i) =>
    e.closest('.hidden') ? '' : (e.id || e.tagName + i) + '|' + (e.type === 'checkbox' ? e.checked : e.value) + '|d' + (e.disabled ? 1 : 0) + '|r' + (e.readOnly ? 1 : 0) + '|h' + (e.closest('.hidden') ? 1 : 0)).join('\n');
}
/* 畫面比對：屬性排序後序列化（換型號、重畫順序不同只會改屬性先後）；藏起來的區塊不比（舊型號留下、看不到的 DOM） */
function norm(el) {
  if (!el) return '';
  if (el.closest && el.closest('.hidden')) return '(hidden)';
  const ser = n => {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return '';
    const at = Array.from(n.attributes).map(a => a.name + '=' + a.value).sort().join(' ');
    let v = n.tagName === 'SELECT' || n.tagName === 'INPUT' ? '{v=' + (n.type === 'checkbox' ? n.checked : n.value) + ' d=' + n.disabled + '}' : '';
    return '<' + n.tagName + ' ' + at + v + '>' + Array.from(n.childNodes).map(ser).join('') + '</' + n.tagName + '>';
  };
  return ser(el);
}
function sig(w) {
  const d = w.document, $ = id => d.getElementById(id), S = w.dmState;
  const pick = {}; ['model', 'cur', 'img', 'baseImg', 'savedImg', 'src', 'ro', 'xTouched', 'en01T', 'en01Seg', 'deDef', 'rawName', 'glass', 'offline'].forEach(k => { pick[k] = S[k]; });
  const init = S.init ? Object.assign({}, S.init, { at: 0 }) : null;
  return {
    S: JSON.stringify(pick), init: JSON.stringify(init), raw: S.raw ? Buffer.from(S.raw).toString('base64') : '',
    form: formSig(w),
    grid: norm($('dm-grid')), tft: norm($('dm-pv-tft')), code: norm($('dm-code')), combos: norm($('dm-pv-combotbl')),
    script: JSON.stringify(w.dmBuildScript()),
    fold: Array.from(d.querySelectorAll('.container .card.stp[id]')).map(c => c.id + '=' + (w.dmFold.isFolded(c.id) ? 1 : 0)).join(','),
    det: Array.from(d.querySelectorAll('.container details[id]')).map(x => x.id + '=' + (x.open ? 1 : 0)).join(','),
    bench: $('dm-bench').classList.contains('hidden') ? 'closed' : 'open',
    side: w.localStorage.getItem('dm.tftside.v1'),
    steps: Array.from(d.querySelectorAll('.stp-st')).map(x => x.textContent).join('|'),
    mode: $('dm-modebar').textContent, lock: $('dm-pv-lockst').textContent
  };
}
function same(a, b, tag) {
  const bad = Object.keys(a).filter(k => a[k] !== b[k]);
  const at = (x, y) => { x = String(x); y = String(y); let i = 0; while (i < x.length && x[i] === y[i]) i++; const f = Math.max(0, i - 60); return x.slice(f, i + 60).replace(/\n/g, '⏎') + ' ≠ ' + y.slice(f, i + 60).replace(/\n/g, '⏎'); };
  ok(!bad.length, tag + (bad.length ? '：不同 ' + bad.join(',') + ' → ' + bad.map(k => k + '：' + at(a[k], b[k])).join(' ／ ') : ''));
}

(async () => {
  /* ① 第一次開 */
  const LS0 = {}; const d0 = await open(ROOT, LS0); const w0 = d0.window, $0 = id => w0.document.getElementById(id);
  const fresh = sig(w0);
  ok(w0.dmState.model === 'EM01' && $0('dm-model').value === 'EM01', '① 第一次開：T-CON＝EM01');
  ok(LS0['dm.tftside.v1'] === '1' && $0('dm-side-tog').getAttribute('aria-pressed') === 'true', '① TFT 並排＝開');
  ok($0('dm-bench').classList.contains('hidden'), '① Benchmark＝關');
  ok(!$0('dm-pv-combos').open, '① 32 組排列（排列組合統計）＝收折');
  ok(!$0('dm-codebox').open && w0.dmFold.isFolded('card-reg'), '① TCON Register＝收折');
  ok(w0.dmFold.isFolded('card-out'), '① ④ 匯出 script＝收折');
  ok(['card-src', 'card-pm', 'card-dm', 'card-pv', 'card-tft'].every(id => !w0.dmFold.isFolded(id)), '① 其他卡展開');
  ok(!!LS0['dm.page.v1'] && JSON.parse(LS0['dm.page.v1']).s.model === 'EM01', '① 開完即存一份預設（dm.page.v1）');
  ok(!!$0('dm-reset') && $0('dm-reset').textContent === '清除' && $0('dm-reset').previousElementSibling.id === 'dm-mini-tog', '① 「清除」鈕在 TFT 並排／TFT 預覽旁');
  d0.window.close();

  /* ② 改一堆 → 重新載入 → 全部相同 */
  async function scenario(tag, steps) {
    const LS = {}; const d1 = await open(ROOT, LS); const w = d1.window;
    await steps(w, id => w.document.getElementById(id));
    w.dmPage.save(); const a = sig(w); d1.window.close();
    const d2 = await open(ROOT, LS); const w2 = d2.window; const b = sig(w2);
    same(a, b, '② ' + tag + '：重新載入後全部保留');
    ok(/已還原重新整理前的頁面狀態/.test(w2.document.getElementById('dm-log').textContent), '② ' + tag + '：記錄寫「已還原」');
    /* 再存再載一次（還原後的狀態再保存不漂移） */
    w2.dmPage.save(); d2.window.close(); const d3 = await open(ROOT, LS); same(b, sig(d3.window), '② ' + tag + '：第二次重新載入仍相同');
    /* ③ 清除 → 和第一次開相同 */
    const w3 = d3.window; let reloaded = 0; w3.dmPage.setReload(() => { reloaded++; });
    w3.document.getElementById('dm-reset').click();
    ok(!w3.document.getElementById('dm-ask').classList.contains('hidden'), '③ ' + tag + '：按清除先跳確認框');
    w3.dmAskAnswer(false); ok(!reloaded && !!LS['dm.page.v1'] && JSON.parse(LS['dm.page.v1']).s.model === w3.dmState.model, '③ ' + tag + '：確認框按取消 ⇒ 什麼都不動');
    w3.document.getElementById('dm-reset').click(); w3.dmAskAnswer(true);
    ok(reloaded === 1 && !LS['dm.page.v1'] && !LS['dm.page.raw.v1'], '③ ' + tag + '：確認清除 ⇒ 刪掉保存（含原始 code）並重新載入');
    w3.dispatchEvent(new w3.Event('pagehide')); ok(!LS['dm.page.v1'], '③ ' + tag + '：清除後離開頁面不會又存回去');
    d3.window.close();
    const d4 = await open(ROOT, LS); same(fresh, sig(d4.window), '③ ' + tag + '：清除後重新載入＝第一次開');
    ok(JSON.parse(LS['dm.page.v1']).s.model === 'EM01', '③ ' + tag + '：重新載入後存回預設'); d4.window.close();
  }
  if (QM) await scenario('EM01 匯入全民 code', async (w, $) => {
    w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM));
    const sel = Array.from(w.document.querySelectorAll('#dm-grid select')).find(s => !s.disabled && s.options.length > 3);
    if (sel) fire(w, sel, sel.options[2].value);
    w.dmPvVl(8); fire(w, $('dm-pv-stripe'), 'bgr');
    w.dmFold.set('card-pv', true); w.dmFold.set('card-reg', false); w.dmFold.set('card-out', false);
    $('dm-logbox').open = false; $('dm-pv-combos').open = true;
    ok(w.dmState.src.kind === 'file' && !!w.dmState.raw, '② 匯入成功（' + w.dmState.model + '）');
  });
  await scenario('E503 Hand＋改表格＋鎖定＋Benchmark', async (w, $) => {
    fire(w, $('dm-model'), 'E503');
    if (!$('dm-hand').checked) $('dm-hand').click();
    const sels = Array.from(w.document.querySelectorAll('#dm-grid select')).filter(s => !s.disabled && s.options.length > 3);
    if (sels[0]) fire(w, sels[0], sels[0].options[3].value);
    if (sels[5]) fire(w, sels[5], sels[5].options[1].value);
    fire(w, $('dm-pv-first'), 'r'); fire(w, $('dm-pv-drv'), 'r');
    $('dm-pv-lock').click();
    ok(w.dmState.glass && /鎖定|Locked/.test($('dm-pv-lockst').textContent), '② 已鎖定接線');
    w.dmBench.open(true); w.dmFold.set('card-dm', true); w.dmFold.set('card-src', true);
    fire(w, $('dm-slave'), '105'); $('dm-live').checked = false; $('dm-live').dispatchEvent(new w.Event('change', { bubbles: true }));
  });
  await scenario('EN01 改 FORCE_DE_SEL', async (w, $) => {   // v1.35.19：T 唯讀，改 FORCE_DE_SEL 換欄
    fire(w, $('dm-model'), 'EN01');
    fire(w, $('f-deSel'), '4');
  });

  /* ④ 每個型號：欄位狀態＝舊版切過去；還原＝切過去 */
  const keys = (() => { const d = require(path.join(ROOT, 'common/datamap-core.js')); return d.SELECT_KEYS; })();
  for (const k of keys) {
    const LS = {}; const dn = await open(ROOT, LS); fire(dn.window, dn.window.document.getElementById('dm-model'), k);
    const sn = formSig(dn.window); dn.window.dmPage.save(); dn.window.close();
    const dr = await open(ROOT, LS); ok(formSig(dr.window) === sn, '④ ' + k + '：還原進來的欄位狀態＝切過去'); dr.window.close();
    if (OLD) {
      const dol = await open(OLD, {}); fire(dol.window, dol.window.document.getElementById('dm-model'), k);
      const so = formSig(dol.window); dol.window.close();
      const diff = sn.split('\n').filter((l, i) => l !== so.split('\n')[i]);
      ok(!diff.length, '④ ' + k + '：預設 EM01 切過去＝舊版預設 E503 切過去（disabled／readOnly／值）' + (diff.length ? '：' + diff.slice(0, 4).join(' ; ') : ''));
    }
  }
  console.log((fail ? '✗' : '✓') + ' check_datamap_page ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(2); });
