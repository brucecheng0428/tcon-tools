#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_fold.js — datamap.html v1.22.0 回歸（jsdom）
   Bruce 10/12：「Data Mapping 幫我做成每張卡片都可以收摺起來。然後如果 i2c 有連線的話，就算收摺起來也要顯示綠色的那個…
   收折起來，我還是要可以看到這個卡片的最主要的名稱…TFT 接線圖，我需要把它獨立成另外一張卡片。可以單獨不收折，或收折。」
   驗：① 每張卡可收摺／展開（點標題列、Enter、全部展開／收摺），收摺時標題仍在、內容藏起；localStorage 記憶與讀寫失敗不壞頁
       ② I2C 狀態（假 Bridge：沒有 Bridge／在但未連線／已連線／被關掉／使用者斷線）× 卡片收摺／展開：徽章顏色、下載提示與連結（檔案存在）
       ③ TFT 接線圖獨立卡：圖在新卡、鎖定外框、只送 R1、收摺中改設定後展開會重畫、跳轉自動展開、EN01／Tri 顯示不支援
   用法：node tools/check_datamap_fold.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const FAKE = require(path.join(ROOT, 'tools/fake_i2c_bridge.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(opt) {
  opt = opt || {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      FAKE.install(w, opt.bridge || 'none');
      /* file:// 在 jsdom 是 opaque origin（localStorage 會丟例外）⇒ 換成記憶體版；badStorage 模擬瀏覽器拒絕存取 */
      const mem = {}, store = opt.badStorage
        ? { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } }
        : { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
      Object.defineProperty(w, 'localStorage', { configurable: true, get: () => store });
      if (opt.fold) store.setItem('dm.fold.v1', JSON.stringify(opt.fold));
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  return dom;
}

(async () => {
  /* ── ① 收摺／展開 ───────────────────────────────────────────── */
  {
    const dom = await open(); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    const cards = Array.from(d.querySelectorAll('.container > .card.stp')).map(c => c.id);
    ok(cards.join(',') === 'card-src,card-dm,card-pv,card-tft,card-reg,card-out', '卡片順序：①②③＋TFT 接線圖＋TCON Register＋④：' + cards.join(','));
    const hd = id => Array.from($(id).children).find(e => e.classList.contains('stp-hd'));
    const plain = cards.filter(id => id !== 'card-reg');
    ok(plain.every(id => hd(id) && hd(id).classList.contains('dm-foldhd') && hd(id).getAttribute('role') === 'button' && hd(id).querySelector('.dm-foldcar')), '每張卡的標題列可點（role=button＋箭頭）');
    ok(plain.every(id => $(id).getAttribute('data-fold') === '0') && $('dm-codebox').open, '預設全部展開');
    // 點 ① 標題列
    hd('card-src').querySelector('.stp-t').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok($('card-src').getAttribute('data-fold') === '1' && hd('card-src').getAttribute('aria-expanded') === 'false', '點 ① 標題列 ⇒ 收摺');
    ok(/①/.test(hd('card-src').textContent) && /T-CON/.test(hd('card-src').textContent), '收摺時仍顯示卡片名稱「① 選 T-CON／匯入 code」');
    const cs = w.getComputedStyle($('dm-model').closest('section'));
    ok(cs.display === 'none' && w.getComputedStyle(hd('card-src')).display !== 'none', '收摺時內容藏起、標題列照常顯示（computed style）');
    ok(JSON.parse(w.localStorage.getItem('dm.fold.v1'))['card-src'] === 1, '收摺狀態寫進 localStorage');
    // Enter 鍵
    hd('card-src').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok($('card-src').getAttribute('data-fold') === '0', 'Enter ⇒ 展開');
    // 標題列裡的跳轉／按鈕不觸發收摺（② 標題列的 DM CKS 不是按鈕，點了要收摺；TFT 卡標題本身就是跳轉目標）
    $('dm-fold-close').click();
    ok(plain.every(id => $(id).getAttribute('data-fold') === '1') && !$('dm-codebox').open, '「全部收摺」⇒ 所有卡（含 TCON Register）收摺');
    const names = { 'card-src': /①/, 'card-dm': /②/, 'card-pv': /③/, 'card-tft': /TFT 接線圖/, 'card-out': /④/ };
    ok(Object.keys(names).every(id => names[id].test(hd(id).textContent)), '全部收摺時每張卡的名稱都看得到');
    const saved = JSON.parse(w.localStorage.getItem('dm.fold.v1'));
    ok(cards.every(id => saved[id] === 1), 'localStorage 記下全部收摺：' + JSON.stringify(saved));
    $('dm-fold-open').click();
    ok(plain.every(id => $(id).getAttribute('data-fold') === '0') && $('dm-codebox').open && JSON.stringify(JSON.parse(w.localStorage.getItem('dm.fold.v1'))) === '{}', '「全部展開」⇒ 全部展開、記憶清空');
    // 語言切換：標題 tooltip 跟著換
    w.applyLang('en'); ok(hd('card-src').title === 'Click the title bar to collapse / expand' && $('dm-fold-close').textContent === 'Collapse all', '切英文：收摺說明與按鈕文字三語同步');
    w.applyLang('zh-TW');
    dom.window.close();
  }
  {
    const dom = await open({ fold: { 'card-dm': 1, 'card-tft': 1, 'card-reg': 1 } }); const d = dom.window.document, $ = id => d.getElementById(id);
    ok($('card-dm').getAttribute('data-fold') === '1' && $('card-tft').getAttribute('data-fold') === '1' && !$('dm-codebox').open && $('card-src').getAttribute('data-fold') === '0', '重整後依 localStorage 還原收摺狀態');
    // 收摺中 TFT 卡：改設定 ⇒ 展開後是新的圖
    $('dm-pv-first').value = 'r'; $('dm-pv-first').dispatchEvent(new dom.window.Event('change'));
    dom.window.dmFold.set('card-tft', false);
    ok($('card-tft').getAttribute('data-fold') === '0' && d.querySelectorAll('#dm-pv-tft rect[data-pv]').length > 0 && d.querySelector('#dm-pv-tft text[data-dlab]'), '收摺時改 CH1 位置，展開 TFT 卡後圖正常重畫（有子像素格與 Data 標號）');
    dom.window.close();
  }
  {
    const dom = await open({ badStorage: true }); const d = dom.window.document, $ = id => d.getElementById(id);
    $('dm-fold-close').click();
    ok($('card-src').getAttribute('data-fold') === '1' && d.querySelectorAll('#dm-pv-tft rect[data-pv]').length > 0, 'localStorage 讀寫丟例外 ⇒ 頁面照常、收摺照常（只是不記憶）');
    dom.window.close();
  }

  /* ── ② I2C 狀態 × 收摺 ───────────────────────────────────────── */
  const zip = href => { const f = (href || '').split('?')[0]; return f && fs.existsSync(path.join(ROOT, f)) ? f : null; };
  {
    const dom = await open({ bridge: 'none' }); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    ok($('dm-i2c-top').getAttribute('data-i2c') === 'off' && $('dm-i2c-src').classList.contains('i2cb-off'), '未連線：頁首與 ① 標題列徽章＝灰（off）');
    ok(zip($('dm-i2c-dl').getAttribute('href')) && !$('dm-i2c-dl').hasAttribute('hidden'), '未連線：「沒有 I2C Bridge？下載」連結指向存在的壓縮包 ' + $('dm-i2c-dl').getAttribute('href'));
    ok($('dm-i2c-need').hasAttribute('hidden'), '還沒按連線：不跳大提示');
    $('dm-link').click(); await sleep(80);
    ok(w.dmI2cState() === 'none' && $('dm-i2c-top').classList.contains('i2cb-none') && $('dm-i2c-src').getAttribute('data-i2c') === 'none', '沒有 Bridge：按連線失敗 ⇒ 徽章紅（none）');
    const a = $('dm-i2c-need').querySelector('a[data-i2cb-dl]');
    ok(!$('dm-i2c-need').hasAttribute('hidden') && a && zip(a.getAttribute('href')) && /i2c-bridge\.exe/.test($('dm-i2c-need').textContent) && $('dm-i2c-need').querySelector('a[href="i2c.html"]'), '沒有 Bridge：① 內出現下載鈕（壓縮包存在）＋安裝步驟＋說明頁連結');
    ok(zip(a.getAttribute('href')) === zip(w.I2CBridge.dlHref()) && w.I2CBridge.dlHref().indexOf(w.HELPER_PKG.file) === 0, '下載連結與 common/i2c-bridge.js／HELPER_PKG 同一份');
    w.dmFold.all(true);
    ok($('dm-i2c-top').classList.contains('i2cb-none') && $('dm-i2c-src').classList.contains('i2cb-none') && w.getComputedStyle($('dm-i2c-src')).display !== 'none', '沒有 Bridge × 全部收摺：標題列與頁首仍顯示紅色狀態');
    $('dm-link').click(); await sleep(80);
    ok($('card-src').getAttribute('data-fold') === '0' && !$('dm-i2c-need').hasAttribute('hidden') && $('card-dm').getAttribute('data-fold') === '1', '① 收摺中按連線又失敗 ⇒ 自動展開 ①（下載提示看得到），其他卡維持收摺');
    dom.window.close();
  }
  {
    const dom = await open({ bridge: 'ok' }); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    ok(w.dmI2cState() === 'off', 'Bridge 在但未連線：off');
    $('dm-link').click(); await sleep(400);
    ok(w.dmState.linked && w.dmI2cState() === 'on', '假 Bridge 連線成功：S.linked＝true、狀態 on');
    ok($('dm-i2c-top').classList.contains('i2cb-on') && $('dm-i2c-src').classList.contains('i2cb-on') && /已連線/.test($('dm-i2c-top').textContent), '已連線：頁首＋① 標題列綠色「I2C 已連線」');
    ok($('dm-i2c-need').hasAttribute('hidden') && $('dm-i2c-dl').classList.contains('hidden'), '已連線：不顯示下載提示');
    for (const id of ['card-src', 'card-dm', 'card-pv', 'card-tft', 'card-out']) {
      w.dmFold.set(id, true);
      ok($('dm-i2c-top').classList.contains('i2cb-on') && w.getComputedStyle($('dm-i2c-top')).display !== 'none', '已連線 × ' + id + ' 收摺：頁首綠色徽章仍在');
    }
    ok($('card-src').getAttribute('data-fold') === '1' && $('dm-i2c-src').classList.contains('i2cb-on') && w.getComputedStyle($('dm-i2c-src')).display !== 'none', '已連線 × ① 收摺：① 標題列綠色徽章看得到');
    w.dmFold.all(false);
    ok($('dm-i2c-src').classList.contains('i2cb-on'), '已連線 × 全部展開：綠色');
    w.__fakeWs.drop(); await sleep(30);
    ok(!w.dmState.linked && w.dmI2cState() === 'drop' && $('dm-i2c-top').classList.contains('i2cb-drop') && !$('dm-i2c-need').hasAttribute('hidden') && $('dm-i2c-need').getAttribute('data-i2cb-need') === 'drop', 'Bridge 被關掉：立即變紅（drop）＋下載提示');
    $('dm-link').click(); await sleep(400);
    ok(w.dmI2cState() === 'on' && $('dm-i2c-need').hasAttribute('hidden'), '重新連線：回綠色、提示收起');
    $('dm-link').click(); await sleep(60);
    ok(!w.dmState.linked && w.dmI2cState() === 'off' && $('dm-i2c-need').hasAttribute('hidden') && $('dm-i2c-top').classList.contains('i2cb-off'), '使用者按斷線：灰色、不跳下載提示');
    dom.window.close();
  }

  /* ── ③ TFT 接線圖獨立卡 ─────────────────────────────────────── */
  {
    const dom = await open(); const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    ok($('card-tft').contains($('dm-pv-tft')) && !$('card-pv').contains($('dm-pv-tft')) && $('card-tft').contains($('dm-pv-colmode')) && $('card-tft').contains($('dm-pv-vl')), 'TFT 圖、畫面樣式、V 方向 Line 數在獨立卡內，③ 不再含接線圖');
    ok($('card-pv').contains($('dm-pv-lock')) && $('card-pv').contains($('dm-pv-combos')) && $('card-pv').contains($('dm-drv-sec')), '③ 保留 Driver／面板設定、比對結果、確定此架構、16 種配置');
    ok(d.querySelectorAll('#dm-pv-tft rect[data-pv]').length > 0 && !$('dm-tftbody').classList.contains('hidden') && $('dm-tftnote').classList.contains('hidden'), '預設型號：TFT 卡有圖');
    $('dm-pv-lock').click(); await sleep(20);
    ok($('card-tft').classList.contains('dm-locked') && $('card-pv').classList.contains('dm-locked') && !$('dm-pv-colmode').classList.contains('hidden'), '確定此架構 ⇒ TFT 卡鎖定外框、畫面樣式列出現');
    d.querySelector('#dm-pv-colmode button[data-col="R1"]').click(); await sleep(10);
    ok(d.querySelector('#dm-pv-colmode button[data-col="R1"]').getAttribute('aria-pressed') === 'true', '只送 R1 照常');
    w.dmFold.set('card-tft', true);
    d.querySelector('#dm-pv-colmode button[data-col="G"]').click();
    w.dmFold.set('card-tft', false);
    ok(d.querySelector('#dm-pv-colmode button[data-col="G"]').getAttribute('aria-pressed') === 'true' && d.querySelectorAll('#dm-pv-tft rect[data-pv]').length > 0, '收摺中切「只送綠」，展開後狀態與圖一致');
    $('dm-pv-lock').click();
    ok(!$('card-tft').classList.contains('dm-locked'), '解除鎖定 ⇒ TFT 卡外框消失');
    // 跳轉：TFT 卡收摺時點 ② 的「＝③ TCON Out」以外的 pv 跳轉 ⇒ 自動展開
    w.Element.prototype.scrollIntoView = function () {};
    w.dmFold.set('card-tft', true); w.dmJump('pv');
    ok($('card-tft').getAttribute('data-fold') === '0', '跳到 TFT 接線圖時卡片收摺中 ⇒ 自動展開');
    w.dmFold.set('card-dm', true); w.dmJump('tc', 1);
    ok($('card-dm').getAttribute('data-fold') === '0', '圖內點 TCON Out ⇒ ② 收摺中也會先展開');
    w.dmFold.set('card-pv', true); w.dmJump('sd');
    ok($('card-pv').getAttribute('data-fold') === '0', '圖內點 SD Out ⇒ ③ 收摺中也會先展開');
    // EN01：TFT 卡顯示不支援
    $('dm-model').value = 'EN01'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(20);
    ok($('dm-tftbody').classList.contains('hidden') && !$('dm-tftnote').classList.contains('hidden') && /沒有 TFT 接線圖/.test($('dm-tftnote').textContent) && $('dm-pvbody').classList.contains('hidden'), 'EN01：③ 與 TFT 卡一起顯示不支援');
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(20);
    ok(!$('dm-tftbody').classList.contains('hidden') && d.querySelectorAll('#dm-pv-tft rect[data-pv]').length > 0, '換回 EM02：TFT 卡恢復有圖');
    dom.window.close();
  }

  console.log((fail ? '✗' : '✓') + ' check_datamap_fold ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ' + (e && e.stack || e)); process.exit(1); });
