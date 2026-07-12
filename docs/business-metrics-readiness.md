# 蒸管家經營指標 Data Readiness

本文件回答：「目前 Repository 與資料結構能不能可靠算出 KPI？」它不是功能規格、SQL 設計或開發承諾。商業定義以 [蒸管家經營指標規格 v1](./business-metrics-spec.md) 為準，欄位證據與限制詳見 [經營指標資料 Audit](./business-metrics-data-audit.md)。

## 判定方式

### Ready

- `READY`：商業口徑已足夠明確，現有結構化事件可支援下一階段 query 設計；仍需資料品質測試。
- `PARTIAL`：已有部分結構化資料，但缺少定義、品質驗證、歸屬或去重規則。
- `MISSING`：缺少可靠的結構化資料來源。
- `UNKNOWN`：目前 audit 無法證實資料完整性或商業定義尚未確認。

### Data Confidence

- `HIGH`：主要事件與狀態有結構化欄位，且已有一致的既有寫入／統計使用點。
- `MEDIUM`：核心欄位存在，但歷史完整性、多人、跨店、去重或快照品質仍需驗證。
- `LOW`：只能由間接欄位推測，或既有公式與目標商業定義不一致。
- `UNKNOWN`：缺資料或缺商業定義，無法評估。

Data Confidence 不是資料正確率保證；KPI 實作前仍需 read-only dataset audit 與固定測試資料。

## Readiness Matrix

### 客流

| 經營指標 | Ready | Data Confidence | 現有依據 | 缺少什麼 | Priority |
| --- | --- | --- | --- | --- | --- |
| 本月來客數 | READY | HIGH | Booking 有 customer、store、bookingDate、COMPLETED | 驗證歷史完成狀態與合併顧客去重 | P0 |
| 新客數 | PARTIAL | MEDIUM | 可由本月完成顧客與歷史 COMPLETED Booking 比對 | 歷史完整性、合併顧客、跨店「首次」範圍 | P0 |
| 舊客數 | PARTIAL | MEDIUM | 可由本月及過去 COMPLETED Booking 交集計算 | 歷史完整性、跨店與人員歸屬規則 | P0 |
| 回流率 | UNKNOWN | UNKNOWN | 有完成服務歷史；既有 revisit 實作可供參考 | 正式分母、cohort、觀察窗、跨店規則 | P0 |
| 體驗人數 | PARTIAL | MEDIUM | Booking 有 FIRST_TRIAL、COMPLETED、people、attendedPeople | 唯一顧客或人次、多人體驗與歷史 null 規則 | P0 |

### 成交

| 經營指標 | Ready | Data Confidence | 現有依據 | 缺少什麼 | Priority |
| --- | --- | --- | --- | --- | --- |
| 開卡人數 | PARTIAL | MEDIUM | FIRST_TRIAL Booking、PACKAGE_PURCHASE Transaction、booking/customer/store/date 關聯存在 | 同日 join、正式方案辨識、退款／作廢、重複購買、跨店規則 | P0 |
| 開卡率 | PARTIAL | LOW | 分子與分母的候選事件皆存在 | 先定案體驗分母及所有開卡 edge cases；現有 conversion 未限定同日 | P0 |

### 留存

| 經營指標 | Ready | Data Confidence | 現有依據 | 缺少什麼 | Priority |
| --- | --- | --- | --- | --- | --- |
| 續約率 | UNKNOWN | LOW | Wallet、ServicePlan、PACKAGE_PURCHASE 與歷史 wallet 可供 audit | 正式分母、續約視窗、到期／用罄、升降級、退款規則 | P1 |
| 未續約率 | UNKNOWN | UNKNOWN | 可觀察 wallet 狀態與購買事件 | 未續約成立時間與是否等於 `1 - 續約率` 尚未定義 | P1 |
| 平均回店天數 | UNKNOWN | MEDIUM | Booking COMPLETED 提供事件序列 | 觀察窗、單次顧客、跨店、異常值與加權方式 | P2 |

### 營收

| 經營指標 | Ready | Data Confidence | 現有依據 | 缺少什麼 | Priority |
| --- | --- | --- | --- | --- | --- |
| 本月營收 | READY | HIGH | Transaction 有 type、status、paymentStatus、transactionDate、amount 與共用 revenue constants | 實作時固定沿用有效交易／付款口徑 | P0 |
| 退款 | READY | HIGH | REFUND transaction 有原交易關聯、狀態、金額與退款時間 | 統一顯示正負號及跨月退款歸屬 | P0 |
| 淨收 | READY | HIGH | 既有 net constants 與報表／對帳均以收入加 REFUND 計算 | 確認所有頁面使用相同交易日期與付款口徑 | P0 |

### 人員

| 經營指標 | Ready | Data Confidence | 現有依據 | 缺少什麼 | Priority |
| --- | --- | --- | --- | --- | --- |
| 人員營收 | READY | HIGH | Transaction 有 revenueStaffId、serviceStaffId、soldByStaffId 與快照 | 指標採哪一種人員角色；未指派資料呈現 | P0 |
| 人員體驗 | PARTIAL | MEDIUM | Booking 有 serviceStaffId、revenueStaffId、FIRST_TRIAL、完成狀態 | 人數／人次與服務／營收／直屬人員歸屬 | P1 |
| 人員開卡 | PARTIAL | LOW | 體驗與購買事件皆有人員欄位 | 體驗人員與成交人員衝突、同日及退款去重規則 | P1 |
| 人員回流 | UNKNOWN | UNKNOWN | Booking 與 Customer 有多種人員關聯 | 先定案全店回流率，再定義唯一人員歸屬 | P1 |

## 開發判斷

### 可進入下一階段定義／Query PR

- 本月來客數：事件口徑已清楚，可進 KPI-3，但需先加入合併顧客及歷史資料測試。
- 本月營收、退款、淨收：資料與既有共用常數成熟，可進獨立營收比較 PR。
- 人員營收：資料可用，但 PR 開始前必須選定 revenue staff、service staff 或 sold-by 的商業語意。

`READY` 不代表可直接跳到 UI；仍須遵守「定義 → query → UI」。

### 必須先補資料或驗證資料品質

- 新客數、舊客數：先驗證歷史 Booking 完整性、顧客合併及跨店身份去重。
- 體驗人數：先處理 `people`／`attendedPeople` 與歷史 null。
- 開卡人數、開卡率：先驗證 Booking、Transaction、Wallet 的同日關聯與退款／作廢資料。
- 開發來源切分：目前是 `MISSING`，需結構化 acquisition source；不可用 authSource 或自由文字代替。

### 必須先補商業定義

- 回流率。
- 續約率與未續約率。
- 平均回店天數。
- 人員體驗、人員開卡、人員回流的歸屬規則。
- 陌生客／緣故客及多來源歸因規則。

## Next Action

- **KPI-3｜客流分析：PARTIAL READY。** 可先開發本月來客數；新客、舊客與體驗人數須先完成資料品質及多人／跨店規則確認。
- **KPI-4｜成交分析：PARTIAL。** 事件欄位存在，但同日、有效交易、正式方案、多人與去重規則尚未驗證。
- **KPI-5｜留存分析：先補定義。** 不應在回流率與續約率分母未定案前寫 query。
- **KPI-6｜人員指標：PARTIAL。** 人員營收可做；其他人員 KPI 必須跟隨全店指標定義並先確認歸屬角色。
- **來源維度：MISSING。** 需獨立資料模型／欄位決策，不併入 KPI-3 或 KPI-4 偷渡實作。
