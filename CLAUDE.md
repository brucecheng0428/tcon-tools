# tcon-tools-deploy 專案規則

> 這份檔案會被自動載入。它存在的理由：規則只寫在 `docs/VERSIONING.md` 裡，**要有人記得去讀才有用** —— 2026-08-12 的 wfg v4.0.0 誤判就是沒讀就編號。把「先去讀哪一份」寫在這裡，讓它不依賴運氣。

---

## 🔴 版號（動任何 code 之前先讀）

- 進版號前**必須完整讀 `docs/VERSIONING.md`**，依 §1 判定表與 **R1～R4 逐項判、取最高者**（不是挑一條最像的）。
- 🔴 **判到 MAJOR 就停手，回報 Dispatch，不准自行進版。**
  MAJOR ＝ 開新的一波 ＝ **只有 Bruce 能裁示**。一波不會自己結束，agent 不得自行判定某一波「已結束」（§1 R2 補充）。
  取得裁示後，CHANGELOG 該條目要有一行：`MAJOR 核准：Bruce <YYYY-MM-DD>`。
- 🔴 **改動大小不是 MAJOR 的判準。** `wfg` 的 2.x 一路走到 **v2.97.475** 才進 v3.0.0，3.x 同樣可以走到 v3.9x。
  判準只有「使用者原本會的操作還在不在、要不要重新確認過去的結果」。工程規模、難度、風險一律無關。
  **不確定一律往低編**，在 `判定依據：` 寫明取捨供覆核 —— **編低了下次可補，編高了會永久留在 git commit 訊息裡改不掉。**
- **版號回溯（倒退）預設違規**，唯一出口是 `版號回溯核准：Bruce <YYYY-MM-DD>`（§5 明示例外）。
- 每次改動都要：**進版號**（`common/version.js`，單一來源）＋**寫 CHANGELOG**（C3 格式，含 `判定依據：` 欄位）＋**bump 該頁 `?v=` 快取字串**。
- 不進版的情況見 `docs/VERSIONING.md` §3（純部署重試、只改 docs/CHANGELOG/註解、純新增錨點 id…）。

### commit 前的機械檢查

`.git/hooks/pre-commit` 會跑 `tools/version_bump_check.py`。正本在 `tools/hooks/pre-commit`，**`.git/` 不進版控，重新 clone 後要重裝**：

```
ln -sf ../../tools/hooks/pre-commit .git/hooks/pre-commit
```

🔴 **禁止用 `git commit --no-verify` 繞過。** 被擋下代表判定有問題，不是工具有問題。若真的認為是工具誤判，回報 Dispatch，不要自己開路。

---

## 🔴 git

- task **只 commit，不 push**。**push 與線上驗證一律由 Dispatch 主機端執行。**
- **連推多個 commit 會讓 GitHub Pages 部署互相取消，一次推一個。**（依 Bruce 2026-08-12 指示）
- **禁止 force push、禁止 rebase 已推出去的 commit、禁止改寫 git 歷史。** 編錯的東西用新的更正 commit 處理，並在 CHANGELOG 寫更正紀錄。
- commit message 前綴統一 `<工具>: `（`docs/VERSIONING.md` §4 C1）。中文 `-m` 曾造成工具呼叫序列化損壞，**訊息用純 ASCII**（`-F <檔案>` 或英文 `-m`）。
- repo 裡常有他人／前次未 commit 的改動與 `_tmp_*`、`__guidebuild_*`、`.bak` 雜物，**`git add` 要逐檔指名，不要 `git add -A`**。

---

## 專案結構

- **多頁式**，每個工具一頁：`index.html`（首頁）／`rxtx` `calc` `isp` `aux` `wfg` `pattern`（`la.html` 為 wfg 的 LA 分頁入口）。`legacy-index.html` 是拆頁前的舊 SPA，僅供追溯。
- 共用檔在 `common/`：`version.js`（版號單一來源，必須最先載入）、`i18n.js`、`common.js`。
- 每個工具另有一份 `<工具>-guide.html` 說明頁。**說明頁不納入版號機制**（CHANGELOG 明載）。
- 三語：**繁中 `zh-TW` ／ 簡中 `zh-CN` ／ 英文 `en`**，新增 i18n key 三語都要補。

## 其他常設機械檢查（`tools/`）

| 工具 | 擋什麼 |
|---|---|
| `version_bump_check.py` | 版號級別與 CHANGELOG 宣告不符、缺 `判定依據：`、MAJOR 無核准、版號倒退無核准 |
| `check_cache_buster.py` | 改了 `common/*.js` 卻沒 bump 引用頁的 `?v=`（實測案例：`pattern.html` 連續三版沒 bump，線上顯示未翻譯的 key） |
| `scan_untranslated_keys.js` | 畫面上出現未翻譯的 i18n key —— `t(key)` 查不到翻譯會**回傳 key 本身**，靜默失敗，console 不會叫 |
| `check_line_buffer_half_step.py` | wfg 的 Line Buffer 在 **Single Gate** 下冒出小數（Bruce 2026-08-25：「LineBuffer 出現 .5，只存在 Dual gate 的情況下」）。擋「`.step` 給 0.5 但條件不是 `wfgFlrMult() === 2`」與「寫死的 step 0.5」 |
| `check_nb_code_import.js` | **NB code 匯入誤殺真檔**。`wfgNbSane()` 的值域判準（R_DLY／F_DLY／ST_LINE／SP_LINE 的大小）從 v4.14.0 起拒收 **18%（32/177）的真實 E503 檔**，而歷次驗收**只驗過「壞檔會被拒絕」、從來沒驗過「真檔會被接受」**。這支把正面那一半釘住：合成語料帶著真檔實際出現過的值（F_DLY=0xFFFF、SP_LINE=16000、R_DLY=50923、ST_LINE=14820）必須通過，同時壞檔仍須被拒。**已進 pre-commit**。拿本機真檔跑：`WFG_NB_CODE_DIR=<dir> node tools/check_nb_code_import.js`（真檔不進版控） |
| `check_em01_code_import.js` | **EM01 code 匯入誤殺真檔（同一類錯的第二次）**。`wfgEm01Sane()` 的「ST/SP LINE ≤ VTOTAL×3」沒有規格依據 —— register bank 上這兩個欄位都是 **14 bit**、`reg_sp_line_*` 的 **Init 就是 0x3FFF**，而原本的寫法**對 16383 開特例**＝已經承認超界合法，卻只放行那一個數字。Bruce 2026-09-04 的 CSOT FHD280Hz 真檔（`xstb.sp_line = 9139`、vt = 1100）因此被拒。這支釘住正面那一半，並多釘一條 **CURRENT 與 slot 兩支驗證器不得再有兩套標準**。**已進 pre-commit**。拿本機真檔跑：`WFG_EM01_CODE_DIR=<dir> node tools/check_em01_code_import.js`（真檔不進版控） |

> 這幾支的共同前提：**這些錯在本機測試時都不會出現**，只能靠機械檢查擋，不能靠記得。
> 🔴 其中 `check_nb_code_import.js` 與 `check_em01_code_import.js` 是**同一個破口的兩次**：判準只驗過「壞檔會被拒絕」。新增任何 sanity check 之前，先問「這一條的反面是什麼、有沒有一起驗」。

## 公開面：去商標化

git-tracked 的內容＝GitHub Pages 公開可抓（含 view-source）。**凡使用者可見處與原始碼層，一律不留廠商商標與產品型號字樣**，改用中性代號（CHANGELOG v2.97.472／473／474 三輪已清理）。新增 LA 相關文字、log 行、檔名時沿用此慣例；不能清的必須有站得住腳的技術理由（例如 USB PID 這類協定必需值）。

## 語言

- **全程繁體中文思考與回報。** 程式碼變數／註解可用英文；UI 文字走 i18n。

## 驗證

- 回報「已完成」前必須從使用者視角**操作式驗證**（元素存在 ≠ 功能正常），並附上具體操作與結果。
- 視覺／版面改動一律要看**實際畫面截圖**，DOM 屬性對不等於畫面對。
