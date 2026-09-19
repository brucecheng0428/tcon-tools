#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ui_probe.sh — 在真實瀏覽器裡走過主要互動路徑，非 0 結束表示有路徑壞掉
#
#   tools/ui_probe.sh [頁面.html] [probe.js]
#
# 第二個參數可換掉要注入的 probe（預設 tools/ui_probe.js，i2c.html 專用）。
# 加這個參數的理由：原本 probe 路徑寫死，wfg/LA 那一側要用同一套「真瀏覽器
# --dump-dom」手法就只能另外複製一份 shell —— 複製出來的兩份遲早分岔。
#
# 🔴 為什麼是這個做法：jsdom 驗不了「使用者點下去會發生什麼」（2026-09-19
#    「單擊重繪把 dblclick 吃掉」就是 700 多項全綠卻不能用的那次）。
#    用主機上的 Chrome --headless --dump-dom 取回 probe 寫在 title 的結果，
#    **不需要 CDP、不需要任何會跳授權卡片的工具**。
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="${1:-i2c.html}"
PROBE="${2:-tools/ui_probe.js}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }
[ -f "$ROOT/$PROBE" ] || { echo "找不到 probe：$PROBE"; exit 2; }

TMP="$ROOT/_tmp_ui_probe.html"
# 可選：WFG_CFG=<設定檔路徑> ⇒ 注入 window.WFG_TEST_CFG 給 probe 用。
#   相容性要用**使用者的真實檔案**驗，而真實檔案不進版控（放在 repo 外），
#   所以路徑只能從外面餵進來。沒設就什麼都不注入，既有用法一字不變。
CFGJS=""
if [ -n "${WFG_CFG:-}" ]; then
  [ -f "$WFG_CFG" ] || { echo "找不到設定檔：$WFG_CFG"; exit 2; }
  CFGJS="$(python3 -c 'import json,sys; print("window.WFG_TEST_CFG=" + json.dumps(open(sys.argv[1],encoding="utf-8").read()) + ";")' "$WFG_CFG")"
fi
# 🔴 用 if 而不是 `[ … ] && printf`：後者在 CFGJS 為空時整句回 1，
#    配上檔頭的 `set -e` 會讓整支腳本在這裡靜靜結束（沒設 WFG_CFG 就跑不動）。
{ cat "$ROOT/$PAGE"; echo '<script>'; if [ -n "$CFGJS" ]; then printf '%s\n' "$CFGJS"; fi; cat "$ROOT/$PROBE"; echo '</script>'; } > "$TMP"
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
