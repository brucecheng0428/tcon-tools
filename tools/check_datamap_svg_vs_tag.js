// v1.18.3（Bruce 10/8）：未鎖定時 ③ 必須和 datamap-v1.17.5 逐字相同。
// 用法：git archive datamap-v1.17.5 | tar -x -C /tmp/dm1175wt；node tools/check_datamap_svg_vs_tag.js /tmp/dm1175wt . tools/check_datamap_kickoff.js <蘇坤 EM02 bin>（全民 code 讀 /tmp/qm.bin）
// 未鎖定時 ③ TFT 接線圖（#dm-pv-tft innerHTML：線端點 path d、格內文字 data-dn、標號）逐字比對
const path = require('path'), fs = require('fs');
const [BASE, NEW, KT, SK] = process.argv.slice(2).map((x, i) => i < 2 ? path.resolve(x) : x);
const FX = JSON.parse(/const FX = (\{.*?\});\n/s.exec(fs.readFileSync(KT, 'utf8'))[1]);
const { JSDOM } = require(path.join(__dirname, '..', 'node_modules/jsdom'));
async function run(ROOT) {
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(w) { w.WebSocket = function () { throw 1; }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, DM = w.DM || w.DMCore || null, out = {};
  const $ = id => d.getElementById(id);
  const fire = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change')); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const datasets = {
    qm: async () => { fire($('dm-model'), 'EM01'); await sleep(20); w.dmImportBytes(new Uint8Array(fs.readFileSync('/tmp/qm.bin')), 'qm.bin'); await sleep(60); },
    sk: async () => { fire($('dm-model'), 'EM02'); await sleep(20); w.dmImportBytes(new Uint8Array(fs.readFileSync(SK)), path.basename(SK)); await sleep(60); },
    kmir: async () => { fire($('dm-model'), 'EM02'); await sleep(20); const mr = FX.mir, rows = [mr.line0.c0, mr.line0.c1, mr.line1.c0, mr.line1.c1];
      const s = Object.assign(require(path.join(ROOT, 'common/datamap-core.js')).emptyState('EM02'), { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 1 }); rows.forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; })); w.dmState.cur = s; w.dmRender(); await sleep(20); },
  };
  for (const ds of Object.keys(datasets)) {
    await datasets[ds]();
    const mir0 = $('f-mirror').checked;
    for (const mi of [mir0, !mir0]) for (const first of ['l', 'r']) for (const drv of ['f', 'r']) for (const st of ['rgb', 'bgr']) for (const sw of [false, true]) {
      fire($('f-mirror'), mi); fire($('dm-pv-first'), first); fire($('dm-pv-drv'), drv); fire($('dm-pv-stripe'), st); fire($('dm-pv-swap'), sw);
      await sleep(5);
      const T = $('dm-pv-tft');
      out[ds + ' M' + (mi ? 1 : 0) + ' ' + first + drv + st + (sw ? 'S' : '')] = T ? T.innerHTML : 'NONE';
    }
    fire($('f-mirror'), mir0);
  }
  return out;
}
(async () => {
  const a = await run(BASE), b = await run(NEW); let same = 0, diff = 0;
  for (const k in a) { if (a[k] === b[k]) same++; else { diff++; if (diff <= 5) { let i = 0; while (a[k][i] === b[k][i]) i++; console.log('DIFF', k, '@' + i, '\n  old:', a[k].slice(Math.max(0, i - 80), i + 120), '\n  new:', b[k].slice(Math.max(0, i - 80), i + 120)); } } }
  const mirCases = Object.keys(a).filter(k => / M1 /.test(k)).length, rCases = Object.keys(a).filter(k => / M\d r/.test(k)).length;
  console.log((diff ? '✗ ' : '✓ ') + 'SVGCMP', same, 'SAME /', diff, 'DIFF of', Object.keys(a).length, '(Mirror=1 cases', mirCases, ', CH1 right cases', rCases, ')'); process.exit(diff ? 1 : 0);
})();
