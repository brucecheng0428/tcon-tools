# DPCD 00704h (EDP_GENERAL_CAPABILITY_3) 衝突解決報告

## 背景

第二次審查報告 (`dpcd_audit_report.md`) 第 15 項指出 00704h 英文描述有 X/Y 互換錯誤；第三次審查報告 (`dpcd_audit_report_v3.md`) 抽查後認為 00704h 正確。兩份報告結論衝突，需以規格書為準逐 bit 裁定。

---

## 規格書定義（權威來源）

### eDP v1.4b (p232, Table 10-4)

| Bit | 欄位名稱 | 規格書原文 |
|-----|----------|-----------|
| 3:0 | X_REGION_CAP | "...in the **horizontal** direction... Regions are numbered from **left to right**" |
| 7:4 | Y_REGION_CAP | "...in the **vertical** direction... Regions are numbered from **top to bottom**" |

### eDP v1.5 (Section 10, Table 10-4 同位址)

定義與 v1.4b **完全一致**，無任何變化：X_REGION_CAP = horizontal，Y_REGION_CAP = vertical。

---

## DPCD_DB 現況（data/dpcd-db.js）

### 中文主定義（b 陣列）

| Bit | mask | 欄位名稱 | DB 中文描述 | 與規格書比對 |
|-----|------|----------|------------|-------------|
| 3:0 | 0x0F | X_REGION_CAP | "**水平方向**可獨立控制的背光區域數 - 1。區域由**左至右**編號。" | **正確** |
| 7:4 | 0xF0 | Y_REGION_CAP | "**垂直方向**可獨立控制的背光區域數 - 1。區域由**上至下**編號。兩方向都非零時，總區域數 = (X+1)×(Y+1)。" | **正確** |

### 英文補充描述（de 欄位）

| Bit | DB 英文 de 內容 | 與規格書比對 |
|-----|----------------|-------------|
| 3:0 (X_REGION_CAP) | "Number of controllable 1D backlight regions in the **vertical** direction." | **錯誤 — 應為 horizontal** |
| 7:4 (Y_REGION_CAP) | "Number of controllable 1D backlight regions in the **horizontal** direction." | **錯誤 — 應為 vertical** |

---

## 結論

**第二次審查報告是對的，第三次審查報告在此項判定有誤。**

具體情況：

1. **中文主定義（`d` 欄位）完全正確** — X=水平、Y=垂直，與 eDP v1.4b/v1.5 規格書完全一致。
2. **英文補充描述（`de` 欄位）確實互換了** — X 的 `de` 寫成 vertical，Y 的 `de` 寫成 horizontal，與規格書相反。
3. 第三次審查報告可能只看了中文 `d` 欄位就判定正確，沒有檢查英文 `de` 欄位，所以漏掉了這個 bug。

### 需要修正的內容

`data/dpcd-db.js` 中 `EDP_DESC` 的 `"00704"` 英文描述：

```
現在（錯誤）：
  b[0].de = "Number of controllable 1D backlight regions in the vertical direction."
  b[1].de = "Number of controllable 1D backlight regions in the horizontal direction."

應改為：
  b[0].de = "Number of controllable 1D backlight regions in the horizontal direction."
  b[1].de = "Number of controllable 1D backlight regions in the vertical direction."
```

---

報告日期：2026-05-22
