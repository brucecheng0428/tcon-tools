// 用法：node tools/check_datamap_nbfields.js <repo>
// v1.18.21（Bruce 10/8「E503 應該也要有 Mirror……CHRB、CHWB 都有」）：NB 型號補 MIRROR／CHRB／CHWB／READ_RVS（出處 .model，見 datamap-core.js NB_EXTRA）
//   ・② 依型號顯示；Mirror 連帶 READ_RVS（E50x 0xFF、DAZ6138 6 bit 0x3F）；匯入 decode、匯出 script 會寫；CHRB 在 ③ 生效
//   ・NB Dual 的 Mirror 換算：用 RM81010 Kick Off「Data hand mode」mirror＝1 範例（kickoff 測試的 FX.mir），E501A 與 EM02 的 ③ 接線必須完全相同
//   ・NB Single 也套 Mirror（同一套 Kick Off 換算；Bruce 10/8 指示），和 EM02 Single 對照
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || '.');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const FX = JSON.parse(/const FX = (\{.*?\});\n/s.exec(fs.readFileSync(path.join(ROOT, 'tools/check_datamap_kickoff.js'), 'utf8'))[1]);
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
let fail = 0, pass = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (c) pass++; else fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('欄位定義（.model）');
  const pos = (k, id) => { const f = DM.fieldById(k, id); return f ? f.parts.map(p => '0x' + p[0].toString(16).toUpperCase() + '[' + p[1] + ':' + p[2] + ']').join(',') : '—'; };
  ok(pos('E503', 'mirror') === '0x321[0:0]' && pos('E503', 'chrb') === '0x321[3:3]' && pos('E503', 'chwb') === '0x321[4:4]' && pos('E503', 'rvsL') === '0x343[7:0]', 'E503：MIRROR 0x321[0]、CHRB 0x321[3]、CHWB 0x321[4]、READ_RVS 0x343[7:0]（RM8100x model:8850-8898）');
  ok(['E501A', 'E501B'].every(k => pos(k, 'mirror') === '0x3F1[0:0]' && pos(k, 'chrb') === '0x3F1[3:3]' && pos(k, 'chwb') === '0x3F1[4:4]' && pos(k, 'rvsL') === '0x413[7:0]'), 'E501A／B：MIRROR 0x3F1[0]、CHRB [3]、CHWB [4]、READ_RVS 0x413[7:0]（RM81010 model:10076-10124）');
  ok(['DAZ6138', 'DAZ6139'].every(k => pos(k, 'mirror') === '0x181[0:0]' && pos(k, 'chrb') === '0x181[3:3]' && pos(k, 'chwb') === '0x181[4:4]' && pos(k, 'rvsL') === '0x1A2[5:0]'), 'DAZ6138／6139：MIRROR 0x181[0]、CHRB [3]、CHWB [4]、READ_RVS 0x1A2[5:0]（DAZ6138 model:7708-7770）');
  ok(pos('DAZ6111', 'chwb') === '0x17E[7:7]' && pos('DAZ6111', 'mirror') === '—' && pos('DAZ7353', 'chwb') === '0xAC[7:7]' && pos('DAZ7353', 'mirror') === '—' && pos('DAZ7353', 'chrb') === '—', 'DAZ6111／7353：只有 CHWB（0x17E[7]／0xAC[7]）；沒有 MIRROR，hand CHRB 未確認不加');
  const img = { 0x321: 0x19, 0x343: 0xFF }; const st = DM.decode('E503', a => img[a] | 0);
  ok(st.mirror === 1 && st.chrb === 1 && st.chwb === 1 && st.rvsL === 0xFF, '匯入 decode：0x321＝0x19、0x343＝FF ⇒ mirror 1、chrb 1、chwb 1、READ_RVS FF');
  const old = DM.buildScript('E503', DM.emptyState('E503'), { comments: false }).text;
  ok(/write -m 0321 00 19/.test(old) && /write -m 0343 00 FF/.test(old), '匯出 script 含 0x321（mask 19＝MIRROR|CHRB|CHWB）與 0x343（READ_RVS）的遮罩寫入');

  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('jsdomError', e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new w.Event('change')); };
  const shown = need => !d.querySelector('.dm-fieldrow[data-need="' + need + '"]').classList.contains('hidden');
  console.log('② 依型號顯示');
  fire('dm-model', 'E503'); await sleep(40);
  ok(['mirror', 'chrb', 'chwb', 'rvsL'].every(shown), 'E503：Mirror／CHRB／CHWB／READ_RVS 四列都顯示');
  fire('dm-model', 'DAZ6111'); await sleep(40);
  ok(shown('chwb') && !shown('mirror') && !shown('chrb') && !shown('rvsL'), 'DAZ6111：只顯示 CHWB');
  console.log('E503：Mirror 連帶 READ_RVS、匯出');
  fire('dm-model', 'E503'); await sleep(40);
  const hand = $('dm-hand'); if (!hand.checked) { hand.checked = true; hand.dispatchEvent(new w.Event('change')); } await sleep(30);
  fire('f-mirror', true); await sleep(40);
  ok(w.dmState.cur.mirror === 1 && w.dmState.cur.rvsL === 0xFF && $('f-rvs').value === '0xFF', '勾 Mirror ⇒ READ_RVS＝0xFF（原廠：MIRROR=1, READ_RVS=FF）');
  const sc = w.dmBuildScript().text;
  ok(/write -m 0321 01 19/.test(sc) && /write -m 0343 FF FF/.test(sc), '匯出 script：0321 01 19（MIRROR＝1）、0343 FF FF');
  ok(d.querySelectorAll('#dm-pv-combotbl tbody tr').length === 32 && d.querySelector('#dm-pv-tft').getAttribute('data-sugmirror') !== null, 'E503 Single：比較表含 TCON Mirror（32 種）');
  fire('f-mirror', false); await sleep(30);
  ok(w.dmState.cur.rvsL === 0, '取消 Mirror ⇒ READ_RVS＝0');
  const dn = () => Array.from(d.querySelectorAll('#dm-pv-tft rect[data-dn]')).map(r => r.getAttribute('data-dn')).join(',');
  const before = dn(); fire('f-chrb', true); await sleep(40); const after = dn();
  const bA = before.split(','), aA = after.split(','), chg = bA.map((x, i) => [x, aA[i]]).filter(p => p[0] !== p[1]);
  ok(chg.length > 0 && chg.every(p => p[0].slice(1) === p[1].slice(1) && ((p[0][0] === 'R' && p[1][0] === 'B') || (p[0][0] === 'B' && p[1][0] === 'R'))), 'E503 CHRB＝1 ⇒ ③ 收到資料的格 R↔B（' + chg.map(p => p[0] + '→' + p[1]).slice(0, 4).join('、') + '），位置不變');
  fire('f-chrb', false); await sleep(20);
  console.log('DAZ6138：READ_RVS 6 bit');
  fire('dm-model', 'DAZ6138'); await sleep(40);
  if (!$('dm-hand').checked) { $('dm-hand').checked = true; $('dm-hand').dispatchEvent(new w.Event('change')); } await sleep(20);
  fire('f-mirror', true); await sleep(30);
  ok(w.dmState.cur.rvsL === 0x3F && /write -m 01A2 3F 3F/.test(w.dmBuildScript().text) && /write -m 0181 01 19/.test(w.dmBuildScript().text), '勾 Mirror ⇒ READ_RVS＝0x3F（6 bit 全 1），匯出 01A2 3F 3F、0181 01 19');
  console.log('NB Dual Mirror：Kick Off（RM81010）mirror＝1 範例，E501A 與 EM02 的 ③ 必須相同');
  const mr = FX.mir, rows = [mr.line0.c0, mr.line0.c1, mr.line1.c0, mr.line1.c1];
  const wiring = () => Array.from(d.querySelectorAll('#dm-pv-tft rect[data-in]')).map(r => r.getAttribute('data-pv') + '=' + r.getAttribute('data-in') + '/' + r.getAttribute('data-dn')).join(' ');
  const load = async (k) => { fire('dm-model', k); await sleep(40); const s = Object.assign(DM.emptyState(k), { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 1 }); rows.forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; })); w.dmState.cur = s; w.dmRender(); await sleep(40); };
  await load('EM02'); const em = wiring();
  await load('E501A'); const nb = wiring();
  ok(em.length > 50 && em === nb, 'Kick Off mirror＝1（Dual）：E501A 的接線與格內資料和 EM02 完全相同（' + nb.split(' ').length + ' 格）');
  ok(d.querySelectorAll('#dm-pv-combotbl tbody tr').length === 32, 'E501A Dual：比較表含 TCON Mirror（32 種）');
  console.log('NB Single Mirror：同一套換算（_1＝_0、_3＝_2 時 NB 兩條 Line 與 EM02 Single 的 Line 1／Line 3 相同）');
  const codes0 = [17, 16, 15, 14, 13, 12], codes2 = [11, 10, 9, 8, 7, 6];
  const loadS = async (k) => { fire('dm-model', k); await sleep(40); const s = Object.assign(DM.emptyState(k), { hand: 1, panel: 0, subPanel: 0, rd: 0, mirror: 1, deEn: 1, deSel: 2 });
    [codes0, codes0, codes2, codes2].forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; })); w.dmState.cur = s; w.dmRender(); await sleep(40); };
  const lineDn = (k) => Array.from(d.querySelectorAll('#dm-pv-tft rect[data-pv^="' + k + ':"][data-in]')).filter(r => r.getAttribute('data-in')).map(r => r.getAttribute('data-pv').split(':')[1] + '=' + r.getAttribute('data-dn')).join(' ');
  await loadS('EM02'); const emL1 = lineDn(1), emL3 = lineDn(3);
  await loadS('E503'); const nbL1 = lineDn(1), nbL2 = lineDn(2);
  ok(emL1 && emL1 === nbL1 && emL3 === nbL2, 'Mirror＝1（T2）：E503 Line 1／2 每格收到的資料＝EM02 Line 1／3（' + nbL1.split(' ').slice(0, 3).join(' ') + '…）');
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_nbfields ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
