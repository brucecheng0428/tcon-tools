// 用法：node tools/check_datamap_combos.js <repo> <全民 EM01 code.bin（/tmp/qm.bin）>
// v1.18.17（Bruce 10/8）：16 種配置比較
//   ・排序固定、和目前選取無關：資料與顏色全對 → 錯的格數 → 最長 drain → 左右線長差 → 輸出對調無 → SHL 正向 → RGB → CH1 最左
//   ・「資料正確」：每格收到的是不是要送到這格的資料（輸出對調／SHL 讓別條線的 pixel 跑過來就算錯）
//   ・顯示一律「✓」或「✗ 錯 n 格」（v1.18.16 以前 ✓ 寫對的格數、✗ 寫錯的格數，12/24 被看成 12 格對）
//   ・點列套用到上方 Driver／面板；鎖定時不套用只提示；未鎖定預設展開、鎖定自動收合（可手動展開）、解鎖自動展開
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || '.'), CODE = process.argv[3] || '/tmp/qm.bin';
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (c) pass++; else fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('jsdomError', e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new w.Event('change')); };
  const scrolled = []; w.Element.prototype.scrollIntoView = function () { scrolled.push(this.id); };
  fire('dm-model', 'EM01'); await sleep(50);
  w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), 'qm.bin'); await sleep(100);
  fire('dm-pv-first', 'l'); fire('dm-pv-drv', 'r'); await sleep(50);
  const rows = () => Array.from($('dm-pv-combotbl').querySelectorAll('tbody tr')).map(r => ({ key: r.getAttribute('data-combo'), ok: r.getAttribute('data-ok'), cur: r.classList.contains('dm-ccur'), cells: Array.from(r.cells).map(c => c.textContent) }));
  console.log('固定 16 種、表頭與欄位');
  const r0 = rows();
  ok(r0.length === 16 && new Set(r0.map(r => r.key)).size === 16, '16 列、各不相同');
  const hdr = Array.from($('dm-pv-combotbl').querySelectorAll('th')).map(t => t.textContent.replace(' ⓘ', ''));
  ok(hdr.join('|') === '排名|Driver CH1 位置|Driver 輸出方向（SHL）|子像素排列|輸出對調|資料正確|顏色正確|最長 drain|左右線長差|CH1＝Mirror 方向', '欄位：' + hdr.join('|'));
  ok(/排序：資料與顏色全對 → 錯的格數少/.test(d.querySelector('[data-i18n="dm.pvCRule"]').textContent), '表格上方一行寫出排序規則');
  ok(r0.every(r => /^(✓|✗ 錯 \d+ 格)$/.test(r.cells[5]) && /^(✓|✗ 錯 \d+ 格)$/.test(r.cells[6])), '資料正確／顏色正確一律「✓」或「✗ 錯 n 格」');
  console.log('Bruce 的 case：全民 code、CH1 最左、SHL 反向');
  console.log('    前 4 名：' + r0.slice(0, 4).map(r => r.key + '[' + r.cells[5] + '/' + r.cells[6] + ']').join('  '));
  ok(r0[0].key === 'rfgn' && r0[0].ok === '1', '第 1 名＝CH1 最右＋正向＋RGB＋輸出對調「無」、資料與顏色全對（' + r0[0].cells.slice(1, 7).join(',') + '）');
  const sw = r0.find(r => r.key === 'rrgs');
  ok(sw && /✗ 錯/.test(sw.cells[5]) && sw.cells[6] === '✓' && r0.indexOf(sw) > r0.findIndex(r => r.ok === '0') - 1 && r0.filter(r => r.ok === '1').every(r => r0.indexOf(r) < r0.indexOf(sw)), '「最右＋反向＋RGB＋對調有」顏色全對但資料錯 ⇒ 排在所有全對之後（' + sw.cells[0] + '）');
  ok(r0.findIndex(r => r.ok === '0') === r0.filter(r => r.ok === '1').length, '全對的都在前面，有錯的不可能當第一名');
  const errs = r0.map(r => (r.cells[5].match(/\d+/) || [0])[0] * 1 + (r.cells[6].match(/\d+/) || [0])[0] * 1);
  ok(errs.every((e, i) => i === 0 || r0[i - 1].ok !== r0[i].ok || errs[i - 1] <= e), '同一段內錯的格數由少到多（不會 12 格錯排在 8 格錯前面）：' + errs.join(','));
  console.log('連續 20 次重繪／改選取，排序不變');
  const sig = rs => rs.map(r => r.key).join(',');
  const base = sig(r0); let same = 0;
  for (let i = 0; i < 20; i++) {
    fire('dm-pv-stripe', i % 2 ? 'bgr' : 'rgb'); fire('dm-pv-swap', i % 3 === 0); fire('dm-pv-drv', i % 4 < 2 ? 'r' : 'f'); fire('dm-pv-first', i % 5 < 2 ? 'l' : 'r'); await sleep(5);
    if (sig(rows()) === base) same++;
  }
  ok(same === 20, '20 次都相同（' + same + '/20）');
  console.log('點列套用、目前套用、鎖定');
  fire('dm-pv-first', 'l'); fire('dm-pv-drv', 'r'); fire('dm-pv-stripe', 'rgb'); fire('dm-pv-swap', false); await sleep(20);
  scrolled.length = 0;
  $('dm-pv-combotbl').querySelector('tr[data-combo="rfgn"] td:nth-child(3)').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30);
  ok($('dm-pv-first').value === 'r' && $('dm-pv-drv').value === 'f' && $('dm-pv-stripe').value === 'rgb' && !$('dm-pv-swap').checked, '點第 1 名 ⇒ 上方變成 CH1 最右＋正向＋RGB＋對調無');
  ok(scrolled[0] === 'dm-drv-sec', '並捲到 Source Driver 設定');
  ok(rows()[0].cur && /目前套用/.test(rows()[0].cells[0]) && rows().filter(r => r.cur).length === 1, '第 1 名標「目前套用」（只有一列）');
  ok($('dm-pv-sugbtn').classList.contains('hidden') && /目前就是第 1 名/.test($('dm-pv-sugok').textContent), '套用建議按鈕隱藏，顯示「目前就是第 1 名」');
  const tr2 = $('dm-pv-combotbl').querySelector('tr[data-combo="lfbn"]');
  tr2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(30);
  ok($('dm-pv-first').value === 'l' && $('dm-pv-stripe').value === 'bgr', '鍵盤 Enter 也能套用（CH1 最左＋BGR）');
  console.log('展開／收合');
  ok($('dm-pv-combos').open && $('dm-pv-combos').closest('section').querySelector('#dm-pv-physrow'), '未鎖定：預設展開，位置在「比對結果」（Driver／面板下方）');
  $('dm-pv-lock').click(); await sleep(50);
  ok($('card-pv').classList.contains('dm-locked') && !$('dm-pv-combos').open, '按鎖定 ⇒ 自動收合');
  $('dm-pv-combos').open = true; fire('dm-pv-stripe', 'bgr'); await sleep(30);
  ok($('dm-pv-combos').open, '鎖定中手動展開 ⇒ 重繪後仍保持展開');
  const before = [$('dm-pv-first').value, $('dm-pv-drv').value, $('dm-pv-stripe').value, $('dm-pv-swap').checked].join();
  $('dm-pv-combotbl').querySelector('tr[data-combo="rfgn"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30);
  ok([$('dm-pv-first').value, $('dm-pv-drv').value, $('dm-pv-stripe').value, $('dm-pv-swap').checked].join() === before && /已鎖定接線，解鎖後才能套用/.test(d.querySelector('.dm-toasts') ? d.querySelector('.dm-toasts').textContent : ''), '鎖定時點列：不套用，提示「已鎖定接線，解鎖後才能套用」');
  $('dm-pv-lock').click(); await sleep(50);
  ok(!$('card-pv').classList.contains('dm-locked') && $('dm-pv-combos').open, '解除鎖定 ⇒ 自動展開');
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_combos ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
