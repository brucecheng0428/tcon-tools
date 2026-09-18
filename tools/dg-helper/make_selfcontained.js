/* Generate a self-contained dg-measure.html for the helper to serve from
 * http://127.0.0.1 (same-origin, no external files). It inlines the only two
 * external scripts (common/zoomprobe.js, common/version.js) and fills the
 * helper-SHA placeholders.
 *
 *   node make_selfcontained.js <repo dg-measure.html> <out.html> <exeSha>
 *
 * The EXE sha is real (a separate file can be hashed). The ZIP sha placeholder
 * becomes a note, because a file inside the zip cannot state the zip's own hash.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [, , inPath, outPath, exeSha] = process.argv;
if (!inPath || !outPath || !exeSha) { console.error('usage: make_selfcontained.js <in.html> <out.html> <exeSha>'); process.exit(2); }

const repo = path.resolve(path.dirname(inPath), '.');
let html = fs.readFileSync(inPath, 'utf8');

// inline <script src="common/xxx.js?v=..."></script>
html = html.replace(/<script src="(common\/[^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) => {
  const f = path.join(repo, src);
  if (!fs.existsSync(f)) { console.error('WARN: missing ' + f + ' -> left as-is'); return m; }
  return '<script>\n/* inlined from ' + src + ' */\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
});

// SHA placeholders (first-generation form)
html = html.replace(/DGM_HELPER_EXE_SHA_PLACEHOLDER/g, exeSha);
html = html.replace(/DGM_HELPER_ZIP_SHA_PLACEHOLDER/g, '(extracted copy; verify the zip on the online download page)');

// ── 2026-09-18: the repo page now carries the REAL sha strings (so the online
//    download box can show them), so the placeholders above no longer appear.
//    Rewrite the literals instead. The EXE sha is knowable before zipping; the
//    ZIP sha is NOT — a file inside the zip cannot state the zip's own hash
//    (writing it in would change the hash). So it becomes a note, which is also
//    what breaks the otherwise circular build.
html = html.replace(/(var\s+DGM_HELPER_EXE_SHA\s*=\s*)'[^']*'/,  "$1'" + exeSha + "'");
html = html.replace(/(var\s+DGM_HELPER_ZIP_SHA\s*=\s*)'[^']*'/,
  "$1'(extracted copy; verify the zip on the online download page)'");

// ── 2026-09-18 (round 2): the sha strings moved into common/version.js
//    (HELPER_PKG), which this script inlines above, so rewrite them there.
//    Only zipSha needs neutralising — the exe sha is knowable before zipping,
//    but a file inside the zip cannot state the zip's own hash (writing it in
//    would change that hash). This is what keeps the build non-circular.
html = html.replace(/(zipSha:\s*)'[^']*'/,
  "$1'(extracted copy; verify the zip on the online download page)'");
html = html.replace(/(exeSha:\s*)'[^']*'/, "$1'" + exeSha + "'");
// bytes 是 zip 自己的大小 -> 同樣不能寫進 zip 裡的檔案（會改變那個大小）。歸零；
// 頁面對 bytes===0 的處理就是不顯示大小（離線版本來就該去線上版拿新包）。
html = html.replace(/(bytes:\s*)\d+/, "$10");

fs.writeFileSync(outPath, html);
console.log('wrote ' + outPath + ' (' + html.length + ' bytes), no external script refs left: ' +
  !/<script src="common/.test(html));
