#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# scan_keys.sh — 在真的 Chrome 裡逐語言掃「畫面上有沒有露出未翻譯的 i18n key」
#
#   tools/scan_keys.sh [頁面.html]
#
# 🔴 它擋的是**靜默失敗**：common.js 的 `t(key)` 查不到翻譯時**回傳 key 本身**，
#    畫面照樣渲染、console 一個字都不會叫。只要新增 key 忘了補翻譯，使用者就會
#    看到 `i2c.btnRead` 這種字串，而任何「讀 DOM textContent」式的驗證都會照單全收。
#
# 🔴 必須是真瀏覽器：判定依據是「元素看不看得見」，jsdom 量不到尺寸。
#    做法與 tools/ui_probe.sh 相同（--dump-dom 取回寫在 title 的結果），
#    **不需要 CDP、不需要任何會跳授權卡片的工具**。
#
# 非 0 結束 ＝ 有未翻譯的 key 露在畫面上。
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="${1:-i2c.html}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }
[ -f "$ROOT/$PAGE" ] || { echo "找不到頁面：$PAGE"; exit 2; }

TMP="$ROOT/_tmp_scan_keys.html"
{ cat "$ROOT/$PAGE"
  echo '<script>'; cat "$ROOT/tools/scan_untranslated_keys.js"; echo '</script>'
  echo '<script>'; cat "$ROOT/tools/scan_keys_probe.js";        echo '</script>'
} > "$TMP"
trap 'rm -f "$TMP"' EXIT

OUT="$("$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
        --virtual-time-budget=15000 --window-size=1600,1200 \
        --dump-dom "file://$TMP" 2>/dev/null \
      | sed -n 's/.*<title>SCANKEYS\(.*\)<\/title>.*/\1/p')"

[ -n "$OUT" ] || { echo "🔴 探針沒有回報結果（title 裡沒有 SCANKEYS…）"; exit 1; }

python3 - "$PAGE" <<PY
import sys, json, html
page = sys.argv[1]
r = json.loads(html.unescape("""$OUT"""))
if r.get('err'):
    print('🔴 %s：%s' % (page, r['err'])); sys.exit(1)
bad = 0
for x in r.get('perLang', []):
    mark = '✅' if x['pass'] else '🔴'
    print('  %s %-6s 未翻譯的 key：%d' % (mark, x['lang'], x['n']))
    for h in x.get('hits', []):
        print('       %s  <%s id=%s class=%s> [%s]' % (h.get('key'), h.get('tag'), h.get('id'), h.get('cls'), h.get('where')))
    if not x['pass']: bad += 1
if bad:
    print('🔴 %s：有 %d 種語言在畫面上露出未翻譯的 key' % (page, bad)); sys.exit(1)
print('✅ %s：三種語言的畫面上都沒有未翻譯的 key' % page)
PY
