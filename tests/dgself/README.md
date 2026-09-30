# DG 自檢頁（dg-selftest.html）headless 回歸測試

v2.4.0 起也包含 `dg-measure.html`（電腦畫面量測頁）與 `dg.html`（DG 主頁）的情境（`run.py` SCENARIOS 第 7 欄指定頁面，預設自檢頁）。

一鍵全跑：

```
bash tests/dgself/run-all.sh            # 全部情境，約 1 分鐘，退出碼 0＝全過
bash tests/dgself/run-all.sh H I-on     # 只跑指定情境
python3 tests/dgself/run.py --list      # 列出情境與網址參數
```

需要 macOS 的 Google Chrome（或設 `CHROME=<執行檔>`）與 python3（只用標準函式庫）。
使用自有 headless profile（暫存資料夾），不影響平常用的瀏覽器；repo 裡的頁面不會被改動。

## 做法

`run.py` 把 `dg-selftest.html` 複製到暫存資料夾，在副本裡注入：

- `<head>` 最前面：`<base href>` 指回 repo（common/*.js 照常載入）＋ `lib/pre.js`
  （收集 JS 錯誤；`__asFromDg` 時假裝由 DG 開啟：假 `window.opener`、可控的分頁可見度）。
- 頁面最後那個 IIFE 的結尾：`lib/fake_hw.js`（假 I2C Bridge、假量測儀、`__arm()`、斷言工具）＋ 情境腳本。
  放在 IIFE 裡面才碰得到頁面自己的函式與變數。

再用 Chrome DevTools Protocol 打開，等 `<pre id="__out">` 出現後讀結果。任何 FAIL、JS 錯誤、逾時都算失敗。
版號檢查一律跟 `common/version.js` 的 `dgself` 比，不寫死版號。

## 情境

| 名稱 | 檔案 | 驗什麼 |
|---|---|---|
| A | A_dgen_switch_lut.js | DG_EN 開關在摘要列／T-CON 列移動、寫 bit0、OFF 時用等距表、狀態過期時重讀、讀不到時停用（A／B／D） |
| C | C_round1_recommend.js | 第 1 輪 main：步驟卡「關掉 DG_EN／維持現狀」與硬體列開關同步 |
| E | E_identnote_i18n.js | 等距表說明三語、確認量測送回後指路句提到「查看目前結果／進行第 N+1 輪」三語（v2.6.1）、版號 |
| F | F_dgen_switch_style.js | 開關樣式：ON 綠／OFF 灰、切換中…、讀回不符退回、量測中停用、三語 |
| G | G_hw_switches.js | I2C 治具／DG_EN／量測儀三組 ON／OFF 開關、連線失敗、取消選埠、唯一實心藍規則、三語、版號 |
| H | H_round2_auto_on.js | 第 2 輪以後自動開 DG_EN 一次並讀回、提示文字、手動關後不再開、下一輪再開、寫入失敗只試一次 |
| I-on／I-idle／I-r1off／I-r1on | I_no_auto_write.js | 不該自動寫 DG_EN 的情況 |
| J-conf／K | J_conf_auto_on.js | 「確認結果」(conf) 也自動開、不出現「關掉 DG_EN／維持現狀」；同輪 main→conf |
| L-A／L-B／L-C／L-RM／L-EN | L_back_to_dg_cta.js | v2.3.0「已送回 DG」醒目提示：實心藍、↗、捲到可視、呼吸燈、標題輪替、離開／回來／點擊、reduced-motion、三語 |
| M-A／B／C／FULL／SAME／EN／CN／NODG | M_cmp_popup.js | v2.4.0 量完跳「加入光學資料比較」：先送結果再問、筆數／清單／預設名、確定／Esc／重開／改名、v2.4.1 確定後筆數與清單更新（含舊版 DG 備援）、確定為唯一實心主按鈕、DG 不回、已滿、逐值相同、三語、非 DG 開啟不跳（假 opener 回筆數） |
| DM-A／C／EN／CN／ADD／PRIM | DM_measure_cmp.js | dg-measure.html 同一個視窗（假序列埠跑完整一輪 `run()`）；dg v2.4.1：底部沒有「加入光學資料比較…」鈕 —— 加入後「已加入比較 ✓ · 查看比較」、選「不加入」才留「加入比較」連結（ADD＝直接加入、CN＝簡中） |
| DG／DG-NR | DG_cmp_handler.js | dg.html：帶 cmpAsk 的結果不自動加、查詢／加入／更新／滿載／備援建組、舊版量測頁照舊自動加；確認結果取消後進下一輪不補記 |
| V-OPEN／BLK／NOSTORE／EN | V_cmp_view.js | v2.5.0 視窗「查看光學資料比較 ↗」：確定前不出現、加入後出現且為線框（「關閉」仍是唯一實心）、開 `dg.html?view=cmp`（固定視窗名、斷 opener）、被擋或 DG 存檔沒寫成 ⇒「請切回 DG 分頁…」提示（比照「已送回 DG」、成為唯一實心）、三語 |
| DV-OPEN／BLK | DV_measure_view.js | dg-measure.html 同一顆鈕與提示 |
| DGV | DGV_cmp_view.js | dg.html：（v2.3.1 起加：storage 事件漏掉時切回分頁會重讀、存檔沒變不重畫）加入後立刻寫自動保存（回覆 stored）；`?view=cmp` 唯讀檢視只剩比較分頁、改資料的鈕藏起來、不寫存檔、不收訊息、storage 事件即時更新（含 iframe 裡另一份 DG 真的寫入）、讀不到存檔時提示切回 DG |
| X-ON／OFF／NR／ALT／EN | X_lut_export.js | v2.6.0「DG LUT（RGB）檢視」的「匯出 Excel」：有表才可按、線框次要鈕；DG_EN ON 直接下載，OFF（等距表）先問「目前是等間距 LUT（DG_EN OFF），確定要匯出？」、取消不下載；檔名 `DG_LUT_<IC>_<YYYYMMDD>_<HHMM>_R<輪>.xlsx`（不知道輪次就不寫 _R）；解開 xlsx 逐列比對卡上的表（工作表 DG_12bit、B1:D1 合併、259 列含末筆）；撞號選到沒有確認格式的 IC ⇒ 不匯出並講明；三語 |
| S-AUTO／BAD／EXPORT／NEXT／DECL／R1／EN／CN | S_round2_flow.js | v2.7.0 第 2 輪以後流程精簡：DG 寫 LUT 時留下送來的表；換一份工作後卡片**不按鈕自動讀回**、逐筆比對相符（「讀取 DG LUT」收起、只剩匯出）；T-CON 的表差一個值 ⇒ 紅字警告（第幾筆／送出／讀回／共幾處）、卡上與決策框的匯出都灰、硬按也不下載；量完關掉視窗 ⇒ 決策框在結果正下方、捲進畫面、「滿意 → 匯出」是全頁唯一實心、按了下載 `_R2.xlsx`；「不滿意 → 回 DG」叫 opener.focus()、沒切過去就講明；視窗選「不加入」⇒ ④ 只剩狀態＋「加入比較」小連結（重開視窗）、加入後「已加入比較 ✓ · 查看比較」開 `dg.html?view=cmp`；第 1 輪完全不變；三語。🔴 假 I2C 是平的 byte 表，寫入（打包排法）讀回（記憶體排法）不會相符，所以比對參考表用「假 T-CON 裡的那張」當 fixture（見檔頭） |
| S-C1／C1AUTO／NOSYNC | S_round2_flow.js | v2.7.2：條件改成「確認量測」（`dstIsConf`：job＝conf 或第 2 輪以後）。C1＝Bruce 實測的 DG 第 1 輪 → 寫入 → 自檢量測（round=1、job=conf）⇒ 決策框、匯出 `_R1`、通知 DG；C1AUTO＝第 1 輪基準 → 寫入 → 第 1 輪確認量測 ⇒ 卡片自動讀回並比對；NOSYNC＝DG 不回 ⇒ 照常匯出＋「DG 分頁未同步」。其餘 S 情境也驗「匯出後通知 DG、DG 回覆後顯示已通知」 |
| Y-OK／NOP4 | Y_conf_satisfied.js | dg v2.4.2：dg.html 收到 `dg-conf-satisfied` ⇒ 停在「查看目前結果」、「自檢頁已確認滿意（第一輪）」、「進行第二輪」照樣在、回 ack；沒有確認量測 ⇒ ok:false |
| Z-R1／MAN／R2／CONF／EN／NODG | Z_focus_steps.js | v2.7.3「只看當下這一步」：當下完整、還沒到的整個不顯示、做完縮成淡灰「✓」一行（點開／收回）、進度條只在量測中、資料卡流程跑完才自動展開（標題可手動開關，含鍵盤）、第 2 輪直接從 ② 開始、確認量測 ④＋決策框一起在畫面上、唯一實心、英文、不是 DG 開的不收合 |
| T-CCT／GAMMA／MISS／EN／CN | T_tone_calc.js | dg v2.4.3：「調色溫／不調色溫並產生新的 RGB LUT」按下去直接算出結果（模式正確）；缺資料照既有錯誤提示；鈕面三語 |
| P-SEQ／DROPLN／DROPCA／RELOAD／R2／EN／NODG | P_page_stages.js | v2.7.4 整頁照步驟依序出現：開頁只有 I2C → ＋T-CON／量測儀群組 → 畫面測試卡（唯一實心＝對位畫面）→ 對位後步驟卡出現、硬體卡與畫面測試卡縮成 ✓（點開收回）、捲到步驟卡；I2C／量測儀斷線 ⇒ 不藏回去、最上方提示是目前這一步、重連回原步；重新整理自動重連並前進（同步段先寫 sessionStorage、換掉 dstConnect／dstCaOpen）；第 2 輪直接到 ②。🔴 `__arm()` 代表「硬體都好、也對位過」 |
| Q-MAIN／TYPE／WMODE／FLOW／UNLOCK／AUTO／PC／PQ／CONV／EN（＋Q-SHOT-OUT 截圖用） | Q_done_steps.js | dg v2.4.4～v2.4.7 只看目前這一步（v2.4.7：電腦畫面／PQ 匯入算完先停在輸出，輸出卡自動展開、下載唯一實心，下載後才問確認）（v2.4.6：第 1→2→3 固定順序，解除限制也不顯示未到部分；自動填好的部分直接 ✓、停在第一個沒完成的；第 4 部分到了才出現並加醒目框）（common/done-step.*，與自檢頁同一套）：還沒走到的部分／計算／② 整個不顯示、做完縮成 ✓ 一行並能點開收回；工作模式選了就縮成 ✓；設定卡與輸出卡流程跑完前收起、點標題能開、「查看目前結果」後自動打開且唯一實心是下載；第二輪停在第 4 部分；打字打齊不收不捲；解除依序限制後照樣顯示；深度轉換 ① 匯入真檔後 ② 出現、下載 ⇒ ✓ ②；英文步驟名 |
| R-PC／R-TCON／R-NOMODE（＋R-SHOT-DECIDE／VIEW／NEXT 截圖用） | R_round_decide.js | dg v2.4.0：dg.html 第 4 部分一輪結束並列「查看目前結果」（框裡唯一實心、④ 讓位成線框）與「進行第 N+1 輪」；查看只導覽（輪數、第 1～4 部分、比較清單不動）、捲到結果卡並出現「停在第 N 輪」、按兩次無害、換一份確認量測就收掉、之後仍能進下一輪；第 1 輪算完照舊問「要不要確認」，第 2 輪起直接到下一層（電腦＝path、自檢＝push、未選模式＝wpick），不再出現「先不確認」 |

## 新增情境

1. 在 `scenarios/` 寫一支 `(async function () { try { ... } catch (e) { window.__errs.push(...) } __done(); })();`，
   用 `__ok(名稱, 條件, 附註)` 斷言。
   截圖：`DGSELF_SHOTS=<資料夾> bash tests/dgself/run-all.sh …` ⇒ 每個情境跑完截一張 `<名稱>.png`（情境最後的畫面）。
2. 在 `run.py` 的 `SCENARIOS` 加一列（網址參數、是否由 DG 開啟、pre 變數、是否 reduced-motion、頁面（可省略＝自檢頁））。
3. 頁面改版後情境要跟著改：斷言寫的是「應有行為」，改規格時同一個 commit 一起更新測試。

## 跨分頁實測（tabs.py，v2.5.1／dg v2.3.1）

`python3 tests/dgself/tabs.py`（約 1 分鐘；`--headful` 開實體視窗；可只跑 `T1 T3b`）。本機 http 伺服器直接服務 repo，
真的開 DG、自檢頁、量測頁、比較分頁好幾個分頁，驗「查看光學資料比較 ↗」在比較分頁**不是這一頁開的**時的行為：

| 名稱 | 情境 | 期望 |
|---|---|---|
| T1 | DG 開的比較分頁已存在，自檢頁按 | 沿用同一個、帶到前面 |
| T2 | 自檢頁開的已存在；DG 再加一組；量測頁按 | 已開的自動變 2 組；沿用、帶到前面 |
| T2b | 量測頁開的已存在，自檢頁按 | 沿用、帶到前面 |
| T3 | 都沒有，自檢頁按（再按一次） | 新開一個在前面、資料正確；再按沿用 |
| T3b | 自檢頁不在同一個 browsing context group（noopener） | 新開第二個在前面；兩個資料相同；DG 再加一組兩個都更新；比較分頁不寫存檔 |

「帶到前面」＝只有那個分頁 `visibilityState === 'visible'`（headless=new 與實體視窗實測一致）。只驗 Chrome；Safari 見 CHANGELOG dgself v2.5.1。
