# tcon-tools 專案入口

## 決策與交付
- 進版先讀 `docs/VERSIONING.md`，依 R1～R4 取最高級別；MAJOR／開新波次與版號回溯須 Bruce 明確核准，並依文件記錄核准日期。不自行宣告波次結束。
- 依該文件的例外判斷是否進版；需進版時同步 `common/version.js`、CHANGELOG（含判定依據）、受影響頁面的 `?v=`。
- 保留 pre-commit 機械檢查，正本 `tools/hooks/pre-commit`；新 clone 安裝到 `.git/hooks/pre-commit`。不得用 `--no-verify` 繞過；疑似誤判交由 Dispatch 分派處理。
- 實作任務只修改與 commit。push 與線上驗收由 Dispatch 指派具授權的主機端執行者；Dispatch 負責追蹤及轉告（依 Bruce 2026-09-29 分工）。當批需求完成後才推，一次推一個 commit 並等部署完成；當次另有批次指示時依其指示。
- 不 force push、不 rebase 已推出的 commit、不改寫歷史；修正用新 commit。逐檔 `git add`，保留他人改動；同一工作區避免多人同時寫。
- commit 前綴 `<工具>: `，訊息用 ASCII。CHANGELOG 寫給接手 agent：說明變更、原因與證據；保留 Bruce 署名，以中性語句記錄決策。

## 實作入口
- 頁面與功能看 `index.html`、共用程式看 `common/`；各工具說明在 `<工具>-guide.html`。說明頁不納入工具版號。
- UI 三語 `zh-TW / zh-CN / en` 同步，相關說明與匯出內容隨功能更新。
- UI 只留常用操作；細節按需展開，診斷放 log/debug。明確要求的操作不再加重複確認；容易誤觸、非當前目的的不可逆清空保留確認。
- 公開內容與程式碼使用中性代號，移除他家商標／型號；必要協定值可保留。依 Bruce 2026-09-29 決策，Raydium、自家 RM 型號、PQ Tools、AUX GUI、Raydium 檔名均保留；歸屬不明先確認。
- DG 復刻依原廠實際程式；資料入口 `~/TCON/Share/DG/gamma_analysis_v150/`。不把交接文件中的建議當原廠規格。TCON 原始資料唯讀。

## 驗證
- 依 Bruce 2026-09-22 決策，不新增、修改或執行 `tools/*_probe.js`；舊檔只供歷史追溯，pre-commit 檢查仍保留。
- 使用者原條件下確認實際操作及輸出；視覺改動看實際截圖，使用自有 headless/profile，不干擾 Bruce 的瀏覽器。
- 位元／暫存器推導在程式旁記來源；數值改動用代表案例手算比對。回報區分讀碼、實測、未驗部分，不拿版號或自述當上線證據。
- 繁體中文回報，簡短交代結果與限制。歷史原文在 `archive/CLAUDE-before-20260929.md`，不作現行規則。

## 線上站是去註解版（Bruce 2026-10-05 決策，P103）

- push 到 main 後由 `.github/workflows/pages.yml` 建置發佈：`tools/build/strip-comments.mjs` 去掉 HTML／JS／CSS 註解 → `tools/build/verify-site.mjs` 發佈前關卡（每頁去註解前後在 headless Chrome 表現一致、wfg 體積上限）→ 既有瀏覽器測試 → 發佈。任一步失敗就不發佈，線上維持上一版。Pages 來源是「GitHub Actions」，不是分支。
- 看程式、改程式、grep、寫測試一律以 repo 原始碼為準。線上檔案沒有註解，不要從線上抓檔回來當原始碼，也不要用線上檔案判斷「某段註解／說明還在不在」。
- 行號對照：線上行號＝原始碼行號（跨行註解換成等量換行）。少數整段刪掉的跨行 HTML 註解會讓後面行號前移，逐筆記在線上 `/_build/report.json` 的 `lineShifts`。換算：`node tools/build/map-line.mjs <檔名> <線上行號>`，先確認本機 HEAD 與 report.json 的 `commit` 相同。同一行裡若刪了行內註解，該行後段的欄位會左移，以印出的原始碼行內容對照。
- 本機重現線上版：`npm ci --prefix tools/build && node tools/build/strip-comments.mjs . _site && node tools/build/verify-site.mjs . _site`；`_site/` 不進版控。
- 線上驗收：Actions「Pages（去註解後發佈）」該次 run 成功，且線上 `/_build/report.json` 的 `commit` 等於剛推的 commit，才算已部署。
- 去註解只處理根目錄 `*.html`、`common/**/*.js|css`、`data/**/*.js`；其他檔原樣發佈。新增要給瀏覽器載入的 JS／CSS 放在別處時，更新 strip-comments.mjs 的範圍（沒更新只是沒去註解，不會壞）。
- wfg 發佈版 gzip 上限 480KB（verify-site.mjs 的 `WFG_GZ_BUDGET`，2026-10-05 實際約 360KB），超過就擋發佈；要調高須在 CHANGELOG 寫明原因。
