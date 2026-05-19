# CHANGELOG

## v2.97.333 — 2026-05-19

### UI 改善

- 主頁標題列高度縮減（85px → 48px），減少視覺佔比（commit 05e5cf9）
- 子頁標題列單行化：返回按鈕、標題、語言選擇器排列在同一行（commits 76747de → db011d3）
- 語言下拉選單增加 `min-width: 90px`，防止文字截斷（commit 60a3847）
- 所有 HTML 的 CSS/JS 引用加上 cache-busting 參數 `?v=20260519`，確保瀏覽器載入最新版本（commit 93079f8）
