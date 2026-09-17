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

// SHA placeholders
html = html.replace(/DGM_HELPER_EXE_SHA_PLACEHOLDER/g, exeSha);
html = html.replace(/DGM_HELPER_ZIP_SHA_PLACEHOLDER/g, '(extracted copy; verify the zip on the online download page)');

fs.writeFileSync(outPath, html);
console.log('wrote ' + outPath + ' (' + html.length + ' bytes), no external script refs left: ' +
  !/<script src="common/.test(html));
