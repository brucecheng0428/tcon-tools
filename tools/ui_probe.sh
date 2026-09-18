#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ui_probe.sh — 在真實瀏覽器裡走過主要互動路徑，非 0 結束表示有路徑壞掉
#
#   tools/ui_probe.sh [頁面.html]
#
# 🔴 為什麼是這個做法：jsdom 驗不了「使用者點下去會發生什麼」（2026-09-19
#    「單擊重繪把 dblclick 吃掉」就是 700 多項全綠卻不能用的那次）。
#    用主機上的 Chrome --headless --dump-dom 取回 probe 寫在 title 的結果，
#    **不需要 CDP、不需要任何會跳授權卡片的工具**。
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="${1:-i2c.html}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }

TMP="$ROOT/_tmp_ui_probe.html"
{ cat "$ROOT/$PAGE"; echo '<script>'; cat "$ROOT/tools/ui_probe.js"; echo '</script>'; } > "$TMP"
trap 'rm -f "$TMP"' EXIT

"$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
    --virtual-time-budget=15000 --window-size=1600,1000 \
    --dump-dom "file://$TMP" 2>/dev/null \
  | sed -n 's/.*<title>UIPROBE\(.*\)<\/title>.*/\1/p' \
  | python3 -c '
import sys, html, json
raw = sys.stdin.read().strip()
if not raw:
    print("🔴 probe 沒有回報任何結果（頁面可能在載入時就爆了）"); sys.exit(2)
rows = json.loads(html.unescape(raw))
bad = [r for r in rows if not r["pass"]]
for r in rows:
    mark = "  ok  " if r["pass"] else "FAIL >"
    extra = ("   got=" + r["extra"]) if r["extra"] else ""
    print(mark + "  " + r["name"] + extra)
print()
if bad:
    print(f"🔴 真實瀏覽器互動測試：{len(bad)} / {len(rows)} 條路徑壞掉"); sys.exit(1)
print(f"✅ 真實瀏覽器互動測試全過：{len(rows)} 條路徑")
'
