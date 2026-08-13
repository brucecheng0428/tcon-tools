# wfg 類比波形重疊（v3.9.0）— slot 幾何一對一假設清冊

建立日期：2026-08-13
基準：`4dad08a`（wfg v3.8.1）
目的：**動手前先列全**「一個 display slot ＝ 一條通道」這個假設散落在哪裡。
Bruce 2026-08-13 指示：「先列全再動手，不要邊改邊發現。」

---

## 核心設計決策（決定了每一處要怎麼改）

**一個重疊群組佔「一個 display slot」，slot 高度 = n × `WFG_ANALOG_ROW_H`。**

這樣選的理由：既有的 `_slotHeights[]` / `_slotY0[]` 機制本來就允許「每個 slot 高度不同」（類比 80／數位 40），
群組只是再多一種高度值。slot 數變少、總高不變（差群組內的 n−1 個 8px gap）。
`_chSlotMap` 從**一對一**變成**多對一**（同群組成員指向同一 slot）——這是本次唯一改變的不變式，
下游凡是「由 chIdx 反查 slot」的都自動正確，凡是「由 slot 反查唯一 chIdx」的都要改。

群組歸屬存在 **channel 物件的 `ovlId` 欄位**（不是 chIdx 清單）——
因為排序是對 `wfgChannels` 做 `splice`（21186–21196），記索引會在排序後失效，記在物件上則跟著物件走。

---

## 清冊

| # | 位置（行號） | 現行假設 | 要怎麼改 |
|---|---|---|---|
| **S1** | `wfgRender` slot 幾何 19902–19961 | `_totalSlots = visibleChs.length + _promotedCount`；每通道一個 `_slotHeights` | 改為依 displayList 建 slot；群組一個 slot、高 n×80 |
| S1a | 19908 `wfgBuildDisplayList` | 每通道一項 `{type:'channel'}` | 新增 `{type:'group', members:[...]}` |
| S1b | 19942–19957 `_chSlotMap` | 一對一 | **多對一**（群組成員共用 slot） |
| S1c | 19965–19981 `dragYOffsets` | 拖曳時位移單一 slot | 群組整組一起位移 |
| S1d | 20025–20037 drawOrder / `y0` / `_rowH` | 每通道取自己的 slot 高 | 群組成員全部取群組 slot 的 y0/高 |
| S1e | 20053–20060 分隔線 | 每個 slot 上緣一條 | 群組內不畫分隔線（改畫水平格線） |
| S1f | 20091 `wfgDrawAnalogChannel(y0,_rowH)` | 一條波形填滿一個 slot | 群組成員共用同一 y0/高＋**共用 vMin/vMax** |
| S1g | 20095 `_wfgAnalogChSlots.push` | 一 slot 一筆 | 群組一筆、帶 members 陣列 |
| **S2** | `wfgRenderLabels` 20436–20505 | 每通道一個 `.wfg-label-item`，高度 80/48 | 群組成員各自仍是一個 label（要能個別拖出），但**群組整體包一個外框 div**，總高 = n×88 |
| **S3** | `wfgLabelDragSetup` 20995–21244 | `_chItemSlots` / `_dragSlotHeights` / `_dragSlotY0` 一對一；`relYToSlotBoundary` 只回邊界；`moveDrag` **只看 clientY** | 加 X 判定（`WFG_LABEL_W=110` 為界）；群組佔一個不可分割落點；新增「落在哪一列上」的命中（不只邊界） |
| **S4** | `wfgResizeCanvas` 21312–21339 | `_analogExtraH` 每條類比 +40 | 總高不變，但群組少 n−1 個 gap → 扣掉 |
| **S5** | hover／量測反查 24486–24499、24561、24629 | `measSlotY/H(slot)` 後**第一個命中的 chIdx 就 return**（24499） | 群組 slot 內要**再依 y 細分**是哪一條（或依最近的波形樣本） |
| **S6** | 電壓游標 18991–19068、19072–19101、23801/23844、24011/24073 | 每 slot 兩條（V1/V2），色寫死；`_wfgVoltCursorPerSlot[gpioIdx]={v1Frac,v2Frac}` | 每成員兩條、最多 8 條；色依群組內序位；frac→電壓改用**群組共用範圍** |
| **S7** | 脈衝計數 `v1Threshold` 28086–28100 | 自己重算一次 frac→電壓 | 🔴 必須與 S6 用同一個範圍來源，否則靜默不一致 |
| **S8** | 概覽圖 `wfgRenderMinimap` 27546–27560 | `rowH = (boxH-2)/visibleChs.length` 平均分 | 群組成員仍各佔一列（概覽圖不表現疊合），或群組佔 n 列 |
| **S9** | IR drag 20537–20552、20638–20703 | 用固定 `rowH` 算 slot（**既有缺陷**：沒考慮類比 80px） | 本次不修（不在範圍內），但新增的落點判定不得沿用它的錯誤算法 |
| **S10** | kvdat 模式 27190 `wfgRenderKvdat` | 獨立路徑 | **不支援群組**（kvdat 全是數位 LA 資料，無電壓語意）——所有群組邏輯以 `!wfgKvdatMode` 為前提 |

---

## 不變式（實作時要一直守住）

1. **沒有任何群組時，所有路徑必須與 v3.8.1 逐位元組相同** —— 這是 v3.9.0 不標 `⚠ 輸出變更` 的立足點。
   實作方式：所有群組邏輯都掛在 `if (群組數 > 0)` 之後，不改既有分支。
2. **群組成員在 `wfgChannels` 中必須連續**，否則畫不出一個連續的框。由拖曳邏輯保證，render 端做防禦性檢查（不連續就當作沒有群組）。
3. **frac → 電壓只能有一個換算來源**（S6 與 S7 共用一個函式）。
