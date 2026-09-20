#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# dg_fork_shots.sh — 二選一對話框與下載區的三語截圖（真的 Chrome，headless）
# ───────────────────────────────────────────────────────────────────────────
# 🔴 為什麼不能用 jsdom：jsdom 不做排版，看不出「字會不會擠出按鈕」「對話框會不會
#    比視窗還高」。版面只能在真的瀏覽器裡看。
#
# 用法：tools/dg_fork_shots.sh <輸出目錄>
# 產出：<輸出目錄>/pick-<lang>.png       二選一對話框（含下載入口）
#       <輸出目錄>/selftest-<lang>.png   dg-selftest 的下載區與搶用權說明
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: dg_fork_shots.sh <outdir>}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }
mkdir -p "$OUT"

shot () {  # shot <來源 html> <注入的 JS> <輸出檔> <寬> <高>
  local SRC="$1" JS="$2" PNG="$3" W="$4" H="$5"
  local TMP="$ROOT/_tmp_shot.html"
  cat "$ROOT/$SRC" > "$TMP"
  { echo '<script>'; echo "$JS"; echo '</script>'; } >> "$TMP"
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --hide-scrollbars --virtual-time-budget=3000 --window-size="${W},${H}" \
      --screenshot="$PNG" "file://$TMP" >/dev/null 2>&1
  rm -f "$TMP"
}

for L in zh-TW en zh-CN; do
  # 二選一：走使用者真正走的那條路（按第 2 部分的「即時量測」），不直接加 class
  shot dg.html "
    setTimeout(function(){
      applyLang('$L');
      document.getElementById('dg-btn-live-gray').click();
    }, 400);" "$OUT/pick-$L.png" 900 760

  # dg-selftest：下載區與搶用權說明（連線卡）
  shot dg-selftest.html "
    setTimeout(function(){
      applyLang('$L');
      var e = document.getElementById('dst-dl-box');
      if (e) e.scrollIntoView({block:'center'});
    }, 400);" "$OUT/selftest-$L.png" 640 1100
done

echo '產出：'
ls -l "$OUT" | sed 's/^/  /'
