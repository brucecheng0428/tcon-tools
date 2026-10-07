// 用法：node tools/check_datamap_import_lock.js <repo> <EM01 code.bin> <EM02 code.bin>（Bruce 10/7 型號不符卡死的回歸；需要 tools/build 的 jsdom 或 repo node_modules）
// jsdom 重現／回歸：datamap.html 型號不符後的鎖死（v1.2.1 重現、v1.3.0 驗證）
const path = require('path'), fs = require('fs');
const ROOT = process.argv[2];
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const EM01 = process.argv[3], EM02 = process.argv[4];
let fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
async function open() {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const api = {
    w, $,
    setModel: k => { $('dm-model').value = k; $('dm-model').dispatchEvent(new w.Event('change')); return $('dm-model').value; },
    imp: (f, name) => w.dmImportBytes(new Uint8Array(f === 'EMPTY' ? [] : f === 'JUNK' ? Buffer.from('hello world, not a code\n') : fs.readFileSync(f)), name || path.basename(f)),
    toast: () => Array.from($('dm-toasts').children).map(e => e.textContent).slice(-1)[0] || '',
    src: () => $('dm-src-text').textContent,
    askOpen: () => !$('dm-ask').classList.contains('hidden'),
    st: tag => console.log('   ' + tag, '| model=' + $('dm-model').value, '| src=' + $('dm-src-text').textContent, '| toast=' + (Array.from($('dm-toasts').children).map(e => e.textContent).slice(-1)[0] || ''))
  };
  return api;
}
(async () => {
  let a = await open();
  const ver = a.w.TOOL_VERSIONS.datamap; console.log('version', ver, 'hasClear=' + !!a.$('dm-clear'));
  if (!a.$('dm-clear')) {   // v1.2.1：只重現
    a.st('C0 start'); a.imp(EM02); a.st('C1 import EM02'); a.setModel('EM01'); a.st('C2 change->EM01'); a.setModel('E512'); a.st('C3 change->E512'); a.imp(EM01); a.st('C4 import EM01');
    return;
  }
  console.log('[1] Bruce 順序：開頁 → 匯入 EM02 → 改選 EM01');
  a.imp(EM02); a.st('import EM02');
  ok(a.$('dm-model').value === 'EM02', '匯入 EM02 後型號=EM02');
  ok(a.setModel('EM01') === 'EM01', '改選 EM01 不再被改回 EM02'); a.st('change->EM01');
  ok(/尚未載入/.test(a.src()), '匯入的 EM02 code 已清除');
  ok(a.setModel('E512') === 'E512' && a.setModel('EM01') === 'EM01', '之後型號可任意改');

  console.log('[2] 選 EM01 → 匯入 EM02 → 提示 → 取消');
  a.imp(EM02); ok(a.askOpen(), '跳出詢問框'); console.log('   ask:', a.$('dm-ask-t').textContent, '/', a.$('dm-ask-yes').textContent, a.$('dm-ask-no').textContent);
  ok(/看起來是 EM02/.test(a.$('dm-ask-t').textContent), '提示文字含「看起來是 EM02」');
  a.$('dm-ask-no').click(); a.st('cancel');
  ok(!a.askOpen() && a.$('dm-model').value === 'EM01' && /尚未載入/.test(a.src()), '取消：型號仍 EM01、未匯入');
  ok(!a.$('dm-model').disabled && !a.$('dm-clear').disabled && !a.$('dm-import').disabled, '取消後型號／清除匯入／匯入都可按');
  ok(a.setModel('E512') === 'E512', '取消後型號可改'); a.setModel('EM01');
  a.$('dm-clear').click(); ok(/沒有匯入/.test(a.toast()), '沒匯入時按清除匯入：提示、不卡');

  console.log('[3] 選 EM01 → 匯入 EM02 → 切換');
  a.imp(EM02); a.$('dm-ask-yes').click(); a.st('switch');
  ok(a.$('dm-model').value === 'EM02' && /em02_code/.test(a.src()), '切換：型號=EM02 且已匯入');
  a.$('dm-clear').click(); a.st('clear');
  ok(/尚未載入/.test(a.src()) && a.$('dm-model').value === 'EM02', '清除匯入：回到 EM02 預設值');

  console.log('[4] 先匯入 EM01，再匯入 EM02 → 取消 → 原本 EM01 匯入保留');
  a.setModel('EM01'); a.imp(EM01); ok(/em01_code/.test(a.src()), 'EM01 匯入成功');
  a.imp(EM02); a.$('dm-ask-no').click(); ok(/em01_code/.test(a.src()) && a.$('dm-model').value === 'EM01', '取消：維持匯入前（EM01 檔仍在）');
  ok(a.setModel('E503') === 'E503', '帶著 EM01 匯入改選 E503 不被改回'); a.st('->E503');

  console.log('[5] 格式錯誤／空檔');
  a.setModel('EM01'); a.imp('JUNK', 'junk.bin'); ok(!a.askOpen() && /無法匯入/.test(a.toast()), '格式錯誤：只顯示錯誤');
  a.imp('EMPTY', 'empty.bin'); ok(!a.askOpen() && /無法匯入/.test(a.toast()), '空檔：只顯示錯誤');
  ok(a.setModel('EM02') === 'EM02' && !a.$('dm-import').disabled && !a.$('dm-clear').disabled, '之後型號可改、匯入／清除可按');

  console.log('[6] Gate Type／Hand Mode 切換後仍可改型號');
  a.setModel('EM02'); a.imp(EM02);
  const hand = a.$('dm-hand'); if (!hand.disabled) { hand.checked = true; hand.dispatchEvent(new a.w.Event('change')); }
  const g = a.$('dm-gate'); ['Single Gate', 'Dual Gate', 'Single Gate'].forEach(v => { if (!g.disabled && Array.from(g.options).some(o => o.value === v)) { g.value = v; g.dispatchEvent(new a.w.Event('change')); } });
  console.log('   gate=' + g.value + ' dirty=' + !a.$('dm-dirtybar').classList.contains('hidden'));
  a.setModel('EM01'); ok(a.askOpen() || a.$('dm-model').value === 'EM01', '有修改時改型號：先問（或直接切）');
  if (a.askOpen()) { a.$('dm-ask-no').click(); ok(a.$('dm-model').value === 'EM02', '問→取消：維持 EM02'); a.setModel('EM01'); a.$('dm-ask-yes').click(); ok(a.$('dm-model').value === 'EM01' && /尚未載入/.test(a.src()), '問→切換：EM01、清除匯入'); }

  console.log('[7] I2C 未連線：需要 I2C 的控制項停用＋提示；不需要的可用');
  for (const id of ['dm-write', 'dm-load', 'dm-check', 'dm-live', 'dm-bar-write']) ok(a.$(id).disabled, id + ' disabled');
  ok(a.$('dm-write').title === '需先開啟 I2C（在 ① 按「連線」）', 'Write title=需先開啟 I2C');
  ok(a.$('dm-live-lbl').classList.contains('off'), '改值立即寫入 灰色');
  for (const id of ['dm-model', 'dm-import', 'dm-clear', 'dm-link']) ok(!a.$(id).disabled, id + ' 可用');
  a.imp(EM01); ok(!a.$('dm-export').disabled, '匯出 script 可用');
  if (fail) { console.log('FAIL ' + fail); process.exit(1); } else console.log('ALL PASS');
})();
