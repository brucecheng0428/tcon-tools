// 用法：node tools/check_datamap_tcon_gate.js <repo> [EM01 code.bin]
// v1.18.11（Bruce 10/8）：「沒有去確認 T-CON，讀的數值有可能是假的」「Write to TCON／Load from TCON 移除，只剩匯出 Script」
// 用假的 I2C Bridge（mock WebSocket）跑：
//   ① 連線 → 自動 Check T-CON 成功 → 回讀；確認後改值才即時寫入
//   ② Check 失敗 → 不回讀、即時寫入停用、改值不寫
//   ③ 手選換型號 → 確認清掉；再按 Check T-CON → 恢復並重新回讀
//   ④ 斷線 → 確認清掉
//   ⑤ 連線中匯入 code → 問「要把匯入的值寫入 TCON 嗎？」：確定＝整批寫入＋回讀核對；取消＝只帶進頁面並標「頁面值與 T-CON 不同」
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || '.'), CODE = process.argv[3];
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (c) pass++; else fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(mode) {
  const log = [], mem = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.WebSocket = function () {
        const ws = this; ws.readyState = 0;
        setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen(); }, 5);
        ws.send = s => { const m = JSON.parse(s); log.push(m); let r = { id: m.id, ok: true };
          if (m.type === 'ping') r = { id: m.id, ok: true, helper: 'mock', proto: 1 };
          else if (m.type === 'read') {
            if (mode === 'fail') r = { id: m.id, ok: false, err: 'nack' };
            else if (m.addr === 0xFF00 && m.len === 3) r = m.slave === 0x68 ? { id: m.id, ok: true, data: [0x01, 0xEF, 0xA0] } : { id: m.id, ok: false, err: 'nack' };
            else { const a = []; for (let i = 0; i < m.len; i++) a.push(mem[(m.slave << 16) | (m.addr + i)] | 0); r = { id: m.id, ok: true, data: a }; }
          } else if (m.type === 'rawwrite') (m.data || []).forEach((b, i) => { mem[(m.slave << 16) | (m.addr + i)] = b; });
          setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); };
        ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose(), 1); };
      };
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const isId = m => m.type === 'read' && ((m.addr === 0xFF00 && m.len === 3) || m.slave === 0x7C || m.slave === 0x7D);
  return { w, d, $, log, reads: () => log.filter(m => m.type === 'read' && !isId(m)).length, writes: () => log.filter(m => m.type === 'rawwrite').length };
}
const wait = async (f, ms) => { for (let i = 0; i < (ms || 3000) / 20; i++) { if (f()) return true; await sleep(20); } return false; };
const toggleHand = (a) => { const h = a.$('dm-hand'); h.checked = !h.checked; h.dispatchEvent(new a.w.Event('change')); };

(async () => {
  console.log('④ 按鈕：Write to TCON／Load from TCON 已移除，只剩匯出 script');
  { const a = await open('ok'); const { $ } = a;
    ok(!$('dm-write') && !$('dm-load') && !$('dm-bar-write') && !!$('dm-export') && /匯出 script/.test(a.d.querySelector('[data-i18n="dm.stp3"]').textContent), '頁面沒有 Write to TCON／Load from TCON（含上方 bar），④ 標題＝匯出 script');
    ok(/重新回讀請再按 Check T-CON/.test(a.d.querySelector('[data-i18n="dm.checkHint"]').textContent), 'Check T-CON 旁說明：連線後自動 Check＋回讀，要重讀再按 Check T-CON'); }

  console.log('① 連線 → 自動 Check T-CON 成功（EM01）→ 回讀；確認後即時寫入');
  { const a = await open('ok'); const { $, w } = a;
    ok($('dm-live').disabled, '未連線：即時寫入停用');
    $('dm-link').click(); await wait(() => w.dmState.checked === 'EM01' && !w.dmState.busy, 4000); await sleep(200);
    ok(w.dmState.linked && w.dmState.checked === 'EM01' && $('dm-model').value === 'EM01', '連線後自動 Check T-CON：認到 EM01（S.checked＝EM01）');
    ok(a.reads() > 0 && w.dmState.src.kind === 'tcon', '確認後才回讀：讀了 ' + a.reads() + ' 次、來源＝T-CON');
    ok(!$('dm-live').disabled, 'Check 成功 ⇒ 即時寫入可用');
    let wr0 = a.writes(); toggleHand(a); await wait(() => a.writes() > wr0, 1500);
    ok(a.writes() > wr0, '確認後改值（Hand Mode）⇒ 即時寫入 ' + (a.writes() - wr0) + ' 筆');
    /* ③ 手選換型號 ⇒ 確認清掉 */
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(150);
    wr0 = a.writes(); const rd0 = a.reads(); toggleHand(a); await sleep(250);
    ok(w.dmState.checked === null && $('dm-live').disabled && /Check T-CON/.test($('dm-live-lbl').title) && a.writes() === wr0 && a.reads() === rd0, '③ 手選換成 EM02 ⇒ 確認清掉、即時寫入停用並提示「請先 Check T-CON」，改值不寫也不讀');
    $('dm-check').click(); await wait(() => w.dmState.checked === 'EM01' && !w.dmState.busy, 4000); await sleep(150);
    ok(w.dmState.checked === 'EM01' && !$('dm-live').disabled && a.reads() > rd0, '③ 再按 Check T-CON ⇒ 重新辨認＋回讀，確認恢復');
    /* ⑤ 連線中匯入 code */
    if (CODE) {
      w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(100);
      ok(!$('dm-ask').classList.contains('hidden') && /要把匯入的值寫入 TCON 嗎/.test($('dm-ask-t').textContent), '⑤ 連線中匯入 code ⇒ 跳出「要把匯入的值寫入 TCON 嗎？」');
      const wa = a.writes(), ra = a.reads(); w.dmAskAnswer(true); await wait(() => /回讀核對/.test(Array.from($('dm-toasts').children).map(e => e.textContent).join('|')), 4000); await sleep(100);
      ok(a.writes() > wa && a.reads() > ra && /全部相同/.test(Array.from($('dm-toasts').children).map(e => e.textContent).join('|')) && $('dm-pend').getAttribute('data-tcondiff') === '0', '⑤ 按「寫入 TCON」⇒ 整批寫入 ' + (a.writes() - wa) + ' 筆、回讀核對全部相同');
      w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(100);
      const wb = a.writes(); w.dmAskAnswer(false); await sleep(150);
      ok(a.writes() === wb && $('dm-pend').getAttribute('data-tcondiff') === '1' && /頁面值與 T-CON 不同/.test($('dm-pend').textContent), '⑤ 按「只帶進頁面」⇒ 不寫，④ 標「頁面值與 T-CON 不同」');
    }
    $('dm-link').click(); await wait(() => !w.dmState.linked, 2000); await sleep(100);
    ok(w.dmState.checked === null && $('dm-live').disabled, '④ 斷線 ⇒ 確認清掉、即時寫入停用');
  }
  console.log('② 連線 → Check T-CON 失敗 → 不回讀、不寫');
  { const a = await open('fail'); const { $, w } = a;
    $('dm-model').value = 'EM01'; $('dm-model').dispatchEvent(new w.Event('change'));
    $('dm-link').click(); await wait(() => w.dmState.linked && !w.dmState.busy, 4000); await sleep(300);
    ok(w.dmState.linked && w.dmState.checked === null, '連線成功但 Check 失敗 ⇒ 沒有確認');
    ok(a.reads() === 0 && w.dmState.src.kind !== 'tcon', 'Check 失敗 ⇒ 完全沒有讀 T-CON 設定');
    ok($('dm-live').disabled, 'Check 失敗 ⇒ 即時寫入停用');
    const wr0 = a.writes(); toggleHand(a); await sleep(250);
    ok(a.writes() === wr0, 'Check 失敗時改值也不會寫進 T-CON');
    if (CODE) { w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(150);
      ok($('dm-ask').classList.contains('hidden') && a.writes() === wr0 && $('dm-pend').getAttribute('data-tcondiff') === '1', 'Check 失敗時匯入 ⇒ 不問、不寫，標「頁面值與 T-CON 不同」'); }
  }
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_tcon_gate ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
