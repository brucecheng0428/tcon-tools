// 用法：node tools/check_datamap_combos.js <repo> <全民 EM01 code.bin（/tmp/qm.bin）>
// v1.18.20（Bruce 10/8）：比較表納入 TCON Mirror（32 種）；鎖定時只列 Mirror 0／1
// v1.18.17（Bruce 10/8）：16 種配置比較
//   ・排序固定、和目前選取無關：資料與顏色全對 → 錯的格數 → 最長 drain → 左右線長差 → 輸出對調無 → SHL 正向 → RGB → CH1 最左
//   ・「資料正確」：每格收到的是不是要送到這格的資料（輸出對調／SHL 讓別條線的 pixel 跑過來就算錯）
//   ・顯示一律「✓」或「✗ 錯 n 格」（v1.18.16 以前 ✓ 寫對的格數、✗ 寫錯的格數，12/24 被看成 12 格對）
//   ・點列套用到上方 Driver／面板；鎖定時不套用只提示；未鎖定預設展開、鎖定自動收合（可手動展開）、解鎖自動展開
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || '.'), CODE = process.argv[3] || '/tmp/qm.bin';
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (c) pass++; else fail++; };
/* v1.26.0（Bruce 10/13）：全民 DataMapping 參考圖少畫左側 dummy，不當驗證基準；以全民參考圖為準的排名斷言改為只列出（不計） */
const okRef = (c, m) => console.log('  · 參考（不計）' + (c ? '✓ ' : '✗ ') + m);
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
  ok(r0.length === 32 && new Set(r0.map(r => r.key)).size === 32, 'v1.18.20：32 列（16 種 Driver／面板 × TCON Mirror 0／1）、各不相同');
  const hdr = Array.from($('dm-pv-combotbl').querySelectorAll('th')).map(t => t.textContent.replace(' ⓘ', ''));
  ok(hdr.join('|') === '排名|Driver CH1 位置|Driver 輸出方向（SHL）|子像素排列|輸出對調|資料正確|顏色正確|最長 drain|左右線長差|TCON Mirror|Data 線整組平移', '欄位：' + hdr.join('|'));
  ok(Array.from($('dm-pv-drv').options).map(o => o.textContent).join('|') === '正向（CH1→CHn）|反向（CHn→CH1）', 'v1.18.19：SHL 選項保留方向（正向（CH1→CHn）／反向（CHn→CH1）），沒有「預設」');
  ok(new Set(r0.map(r => r.cells[2])).size === 2 && r0.every(r => /^(正向（CH1→CHn）|反向（CHn→CH1）)$/.test(r.cells[2])), 'v1.18.19：比較表 SHL 欄同樣寫方向');
  ok(/排序（含 TCON Mirror）：資料與顏色全對 → 錯的格數少/.test(d.querySelector('[data-i18n="dm.pvCRule"]').textContent), '表格上方一行寫出排序規則');
  ok(r0.every(r => /^(✓|✗ 錯 \d+ 格)$/.test(r.cells[5]) && /^(✓|✗ 錯 \d+ 格)$/.test(r.cells[6])), '資料正確／顏色正確一律「✓」或「✗ 錯 n 格」');
  ok(r0.every(r => /^(0|左移 \d+ 格|右移 \d+ 格)$/.test(r.cells[10])), 'v1.26.5：每列顯示 Data 線整組平移量（0／左移 n 格／右移 n 格）');
  console.log('Bruce 的 case：全民 code、CH1 最左、SHL 反向');
  console.log('    前 4 名：' + r0.slice(0, 4).map(r => r.key + '[' + r.cells[5] + '/' + r.cells[6] + ']').join('  '));
  okRef(r0[0].key === 'rfgn1' && r0[0].ok === '1', '第 1 名＝CH1 最右＋正向＋RGB＋輸出對調「無」、資料與顏色全對（' + r0[0].cells.slice(1, 7).join(',') + '）');
  const sw = r0.find(r => r.key === 'rrgs1');
  /* v1.23.2（Bruce 10/12）：子像素位置固定，SHL／輸出對調只改 drain ⇒ 資料一定正確，差別在最長 drain；全對的列依最長 drain 由短到長 */
  const okRows = r0.filter(r => r.ok === '1'), mxs = okRows.map(r => +r.cells[7]);
  okRef(sw && sw.cells[5] === '✓' && sw.cells[6] === '✓' && +sw.cells[7] > +r0[0].cells[7] && r0.indexOf(sw) > 0 && mxs.every((v, i) => !i || v >= mxs[i - 1] - 1e-9) && r0.slice(0, okRows.length).every(r => r.ok === '1'),
    'v1.23.2「最右＋反向＋RGB＋對調有」資料、顏色都對但最長 drain ' + (sw && sw.cells[7]) + ' > 第 1 名 ' + r0[0].cells[7] + ' ⇒ 排在後面（' + (sw && sw.cells[0]) + '）；全對的 ' + okRows.length + ' 列依最長 drain 由短到長、排在所有不全對之前');
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
  $('dm-pv-combotbl').querySelector('tr[data-combo="rfgn1"] td:nth-child(3)').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30);
  ok($('dm-pv-first').value === 'r' && $('dm-pv-drv').value === 'f' && $('dm-pv-stripe').value === 'rgb' && !$('dm-pv-swap').checked, '點第 1 名 ⇒ 上方變成 CH1 最右＋正向＋RGB＋對調無');
  ok(scrolled[0] === 'dm-drv-sec', '並捲到 Source Driver 設定');
  okRef(rows()[0].cur && /目前套用/.test(rows()[0].cells[0]) && rows().filter(r => r.cur).length === 1, '第 1 名標「目前套用」（只有一列）');
  okRef($('dm-pv-sugbtn').classList.contains('hidden') && /目前就是第 1 名/.test($('dm-pv-sugok').textContent), '套用建議按鈕隱藏，顯示「目前就是第 1 名」');
  /* v1.23.2：「資料正確」＝格子收到的資料＝固定子像素軸名稱 ⇒ 舊的第 2 名 lfbn1（CH1 最左＋BGR 的左右鏡像）資料不再算對；改用目前排第 2 的全對列 */
  const tr2 = $('dm-pv-combotbl').querySelectorAll('tr[data-combo]')[1], k2 = tr2.getAttribute('data-combo');
  ok($('dm-pv-combotbl').querySelector('tr[data-combo="lfbn1"]').getAttribute('data-ok') === '0', 'v1.23.2：lfbn1（CH1 最左＋BGR、Mirror 1）是左右鏡像 ⇒ 資料不對（data-ok＝0）');
  tr2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(30);
  ok(tr2.getAttribute('data-ok') === '1' && $('dm-pv-first').value === k2.charAt(0) && $('dm-pv-drv').value === (k2.charAt(1) === 'r' ? 'r' : 'f') && $('dm-pv-stripe').value === (k2.charAt(2) === 'b' ? 'bgr' : 'rgb'), '鍵盤 Enter 也能套用第 2 名（' + k2 + '）');
  okRef($('dm-pv-sugbtn').classList.contains('hidden') && /資料與顏色全對（第 2 名）/.test($('dm-pv-sugok').textContent), 'v1.18.18：套用第 2 名（也全對）⇒ 不再出現「套用建議」，顯示「✓ 資料與顏色全對（第 2 名）」：' + $('dm-pv-sugok').textContent);
  console.log('展開／收合');
  ok($('dm-pv-combos').open && $('dm-pv-combos').closest('section').querySelector('#dm-pv-physrow'), '未鎖定：預設展開，位置在「比對結果」（Driver／面板下方）');
  $('dm-pv-lock').click(); await sleep(50);
  ok($('card-pv').classList.contains('dm-locked') && !$('dm-pv-combos').open, '按鎖定 ⇒ 自動收合');
  $('dm-pv-combos').open = true; fire('dm-pv-stripe', 'bgr'); await sleep(30);
  ok($('dm-pv-combos').open, '鎖定中手動展開 ⇒ 重繪後仍保持展開');
  const before = [$('dm-pv-first').value, $('dm-pv-drv').value, $('dm-pv-stripe').value, $('dm-pv-swap').checked].join();
  // v1.18.20：鎖定時表格只列目前 Driver／面板的 Mirror 0／1 兩列；別的 Driver／面板組合（例如經由套用函式）仍不能套
  ok(rows().length === 2, '鎖定：表格只剩目前 Driver／面板的 2 列（Mirror 0／1）');
  w.dmApplyCombo('rfgn1'); await sleep(30);
  ok([$('dm-pv-first').value, $('dm-pv-drv').value, $('dm-pv-stripe').value, $('dm-pv-swap').checked].join() === before && /已鎖定接線，解鎖後才能套用/.test(d.querySelector('.dm-toasts') ? d.querySelector('.dm-toasts').textContent : ''), '鎖定時點列：不套用，提示「已鎖定接線，解鎖後才能套用」');
  $('dm-pv-lock').click(); await sleep(50);
  ok(!$('card-pv').classList.contains('dm-locked') && $('dm-pv-combos').open, '解除鎖定 ⇒ 自動展開');

  console.log('v1.18.20：TCON Mirror 納入比較（Bruce：全民 code 故意關 Mirror）');
  fire('dm-pv-first', 'l'); fire('dm-pv-drv', 'f'); fire('dm-pv-stripe', 'rgb'); fire('dm-pv-swap', false); await sleep(20);
  fire('f-mirror', false); await sleep(50);
  const m0 = rows();
  const cur0 = m0.find(r => r.cur);
  console.log('    Mirror＝0 時目前列：' + cur0.key + ' 最長 drain ' + cur0.cells[7] + '；前 3 名：' + m0.slice(0, 3).map(r => r.key + '[' + r.cells[7] + ',' + r.cells[9] + ']').join('  '));
  okRef(m0[0].key === 'rfgn1' && m0[0].cells[7] === '0.5' && /^1 需改 TCON$/.test(m0[0].cells[9]) && m0[0].ok === '1', '第 1 名＝CH1 最右＋正向＋RGB＋無＋Mirror 1（需改 TCON），最長 drain 0.5，資料與顏色全對');
  okRef(m0.filter(r => r.ok === '1' && /需改 TCON/.test(r.cells[9])).length >= 1 && cur0.cells[7] === '5.5', '目前（Mirror＝0）最長 drain 5.5，比 Mirror＝1 的選項差');
  okRef(!$('dm-pv-sugbtn').classList.contains('hidden') && /Mirror＝1/.test($('dm-pv-sugbtn').textContent) && /最長 drain 5\.5 → 0\.5/.test($('dm-pv-sugbtn').textContent), '目前雖然資料與顏色全對，但線長較差 ⇒ 仍顯示「套用建議」（含 Mirror＝1）：' + $('dm-pv-sugbtn').textContent);
  ok(m0.every(r => (r.cells[9].charAt(0) === '0') === !/需改 TCON/.test(r.cells[9])), 'Mirror 欄：和目前 ② 值（0）不同的格都標「需改 TCON」');
  $('dm-pv-combotbl').querySelector('tr[data-combo="rfgn1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(60);
  ok($('f-mirror').checked && (w.dmState.cur.mirror | 0) === 1 && $('dm-pv-first').value === 'r' && $('dm-pv-drv').value === 'f' && $('dm-pv-stripe').value === 'rgb' && !$('dm-pv-swap').checked, '點「需改 TCON」那列 ⇒ Driver／面板套用，② Mirror 改回 1');
  ok($('f-rvs').value.toUpperCase() === '0XFFFF', 'Mirror 改回 1 時 READ_RVS 跟著 0xFFFF（同 ② 勾 Mirror）');
  okRef(rows()[0].cur && /^1$/.test(rows()[0].cells[9]), '套用後第 1 名就是目前套用、不再標需改 TCON');
  console.log('v1.18.20：鎖定時只剩 Mirror 0／1');
  fire('f-mirror', false); await sleep(40);
  $('dm-pv-lock').click(); await sleep(60);
  const lk = rows();
  ok(lk.length === 2 && lk.every(r => r.key.slice(0, 4) === 'rfgn'), '鎖定：只列和目前 Driver／面板相同的 2 列（Mirror 0／1）：' + lk.map(r => r.key).join(','));
  $('dm-pv-combotbl').querySelector('tr[data-combo="rfgn1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(60);
  ok((w.dmState.cur.mirror | 0) === 1 && $('dm-pv-first').value === 'r' && $('card-pv').classList.contains('dm-locked'), '鎖定時點 Mirror 1 那列 ⇒ 只改 TCON Mirror，鎖定保留');
  $('dm-pv-lock').click(); await sleep(60);

  console.log('v1.18.23：鎖定後「只送 R1 (1st R Vline)」');
  fire('f-mirror', true); fire('f-chrb', false); await sleep(30);
  w.dmApplyCombo('rfgn1'); await sleep(60);
  if (!$('card-pv').classList.contains('dm-locked')) { $('dm-pv-lock').click(); await sleep(60); }
  const r1b = $('dm-pv-colmode').querySelector('button[data-col="R1"]');
  ok(!!r1b && /只送 R1 \(1st R Vline\)/.test(r1b.textContent) && $('dm-pv-colmode').querySelectorAll('button[data-col]').length === 5, '鎖定後畫面樣式有 5 個按鈕，第 5 個＝「只送 R1 (1st R Vline)」');
  r1b.click(); await sleep(40);
  const cells = () => Array.from(d.querySelectorAll('#dm-pv-tft rect[data-col]')).map(r => ({ on: r.getAttribute('data-col') === 'on', dn: r.getAttribute('data-dn'), ph: r.getAttribute('data-phys'), pv: r.getAttribute('data-pv'), x: +r.getAttribute('x'), tier: r.getAttribute('data-tier') }));
  let c1 = cells(), lit = c1.filter(c => c.on);
  const flip = !!d.querySelector('#dm-pv-tft [data-flip]'), rx = c1.filter(c => c.ph === 'R' && c.tier === 'main').map(c => c.x), minRx = flip ? Math.max.apply(null, rx) : Math.min.apply(null, rx);   // CH1 在最右時整張圖左右翻：畫面最左＝原始 x 最大
  console.log('    正確架構亮的格：' + lit.map(c => c.pv + '=' + c.dn + '/' + c.ph + '@' + c.x).join(' '));
  okRef(lit.length >= 2 && lit.every(c => c.dn === 'R1' && c.ph === 'R') && new Set(lit.map(c => c.x)).size === 1 && lit[0].x === minRx && c1.filter(c => c.dn === 'R1').every(c => c.on), '正確架構（全民＝CH1 最右＋正向＋RGB＋Mirror 1）：只有最左一條紅色豎線亮（每個 Line 的 R1 格），其他全透明');
  fire('f-mirror', false); await sleep(40);
  c1 = cells(); lit = c1.filter(c => c.on);
  console.log('    Mirror 改 0 後亮的格：' + (lit.map(c => c.pv + '=' + c.dn + '/' + c.ph).join(' ') || '（無）') + '；格內出現 R末1 的格：' + c1.filter(c => c.dn === 'R末1').length);
  ok(lit.every(c => c.dn === 'R1') && c1.filter(c => c.dn === 'R1').every(c => c.on) && c1.filter(c => /末/.test(c.dn || '')).every(c => !c.on), '鎖定後改 Mirror：仍只有收到 R1（資料來源編號）的格子亮；「R末1」（從行尾數）不亮');
  fire('f-mirror', true); fire('f-chrb', true); await sleep(40);
  c1 = cells(); lit = c1.filter(c => c.on);
  console.log('    CHRB＝1 亮的格：' + lit.map(c => c.pv + '=' + c.dn + '/' + c.ph).join(' '));
  ok(lit.length >= 2 && lit.every(c => c.dn === 'R1' && c.ph === 'B'), 'CHRB＝1：R1 資料落在實體 B 子像素 ⇒ 亮藍');
  fire('f-chrb', false); await sleep(20);
  $('dm-pv-lock').click(); await sleep(40); $('dm-pv-lock').click(); await sleep(40);
  ok($('dm-pv-colmode').querySelector('button[data-col=""]').getAttribute('aria-pressed') === 'true', '解除再鎖定 ⇒ 畫面樣式回到「全白」');
  $('dm-pv-lock').click(); await sleep(40);
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_combos ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
