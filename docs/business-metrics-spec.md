# 蒸管家經營指標規格 v1

> 每一項經營指標，都應該幫助經營者做出更好的決策。

不是所有資料都是經營指標。只有會影響經營判斷、會在經營檢討中被討論的數字，才列為經營指標。指標名稱與定義必須能跨產業使用，不侷限於蒸足、美容、健身或任何單一服務業。

本文件定義商業語意與驗證方向，不代表 SQL、查詢或 UI 已經完成。

## 共同規則

每一項指標至少記錄：中文名稱、內部英文識別、商業定義、計算定義、資料來源、顯示位置、店舖／人員／來源切分能力、優先級及資料可用狀態。

固定比較期間為：

- 本月
- 較上月（MoM）
- 去年同月（YoY）

日期邊界一律以店舖時區為準；現行系統規則為 Asia/Taipei（UTC+8）。跨月比較必須使用相同口徑及完整期間。v1 暫不納入健康值、紅黃綠燈、趨勢圖、AI 解讀、預測或 Benchmark。

### 資料狀態

- `AVAILABLE`：現有結構化資料足以依已確認口徑計算；仍須在實作 PR 驗證資料品質。
- `PARTIAL`：已有部分欄位或既有實作，但定義、資料品質或關聯規則不足。
- `MISSING`：目前缺少可靠的結構化資料來源。
- `TBD`：商業定義尚未定案。

## 現況盤點

### 可沿用的結構化資料

- `Booking`：`customerId`、`storeId`、`bookingDate`、`bookingStatus`、`bookingType`、`people`、`attendedPeople`、`serviceStaffId`、`revenueStaffId`。`COMPLETED` 可識別完成服務，`FIRST_TRIAL` 可識別體驗預約。
- `Customer`：`storeId`、`assignedStaffId`、`customerStage`、`firstVisitAt`、`convertedAt`、`lastVisitAt`、`authSource`、`sponsorId`。但既有程式已註明部分 `lastVisitAt` 可能 stale/null，正式統計應以完成預約事件為主要依據。
- `Transaction`：交易類型、狀態、付款狀態、交易日期、顧客、店舖、營收人員及方案關聯。`TRIAL_PURCHASE`、`PACKAGE_PURCHASE`、`REFUND` 等類型可供成交與營收 audit。
- `CustomerPlanWallet`：顧客、店舖、方案、購買價格、堂數、效期、狀態及建立時間，可供後續續約定義 audit。
- `Referral`、`ReferralEvent`、`sponsorId`：可識別部分會員介紹關係，但不等同完整的行銷來源分類。

### 既有指標實作僅供參考

`src/server/services/advanced-reports.ts` 已有 trial conversion、renewal、revisit、客單價及顧客活躍度計算，但現行口徑與本規格並不完全相同：

- trial conversion 使用完成體驗顧客與 `convertedAt`，未限定「同一天」。
- renewal 以當期建立 wallet 的購買者為分母，再判斷是否有歷史 wallet；商業分母尚未確認。
- revisit 以「歷史曾完成服務者」為分母，與其他候選回流率定義不同。
- 客單價已有實作，但不列入首批 P0 月度核心指標。

因此上述程式不能直接當成最終商業定義，也不能在 KPI-1 改寫。

### 來源與標籤盤點

- `Customer.authSource` 只有 `GOOGLE`、`LINE`、`EMAIL`、`MANUAL`，代表登入或建檔通道，不是 Google 搜尋、Instagram、路過、活動等獲客來源。
- 會員介紹已有 `Referral`、`ReferralEvent`、`sponsorId` 等結構化關係，可作為來源維度候選，但需先決定歸屬規則。
- 未找到可作正式行銷來源統計的 Customer source enum 或 CustomerTag 關聯表。
- 既有 growth `tags` 是查詢時衍生的營運狀態標籤，不是持久化的獲客來源。
- 未找到「陌生客／緣故客」的結構化欄位或一致定義。自由文字 notes、note 或 runtime tag 不應直接作正式統計。

## 指標分類

### 客流

回答：「有多少人來？」

| 經營指標 | 內部識別 | 商業定義 | 計算定義 | 資料來源 | 顯示位置 | MoM / YoY | 切店舖 / 人員 / 來源 | 狀態 | 優先級 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 本月來客數 | `monthly_unique_visitors` | 本月完成服務的唯一顧客數；不等於預約筆數，同一顧客當月多次只算一位 | 店舖時區本月內 `Booking.status=COMPLETED` 的 distinct `customerId` | Booking | 營運分析 | 是 / 是 | 是 / 待確認 / 待來源欄位 | AVAILABLE | P0 |
| 新客數 | `monthly_new_visitors` | 本月首次完成服務的唯一顧客數；不是首次預約，也不是首次建檔 | 本月有完成服務，且該顧客本月以前沒有任何完成服務紀錄的 distinct 顧客 | Booking；Customer.firstVisitAt 僅供交叉驗證 | 營運分析 | 是 / 是 | 是 / 待確認 / 待來源欄位 | AVAILABLE | P0 |
| 舊客數 | `monthly_returning_visitors` | 本月完成服務，且本月以前已有完成服務紀錄的唯一顧客數 | 本月與本月以前皆存在 `COMPLETED` Booking 的 distinct 顧客 | Booking | 營運分析 | 是 / 是 | 是 / 待確認 / 待來源欄位 | AVAILABLE | P0 |
| 回流率 | `revisit_rate` | 衡量既有顧客持續回店的比例 | 待業務確認；不可先定案為舊客數 ÷ 全部來客數 | Booking、Customer | 營運分析；未來由經營診斷解讀 | 待定義 | 是 / 待確認 / 待來源欄位 | TBD | P0 |
| 體驗人數 | `trial_visitors` | 本月完成體驗服務的人數 | 待確認採 distinct 顧客或完成體驗人次；多人預約需另定義 | Booking (`FIRST_TRIAL`, `COMPLETED`, people, attendedPeople) | 營運分析 | 是 / 是 | 是 / 是 / 待來源欄位 | TBD | P0 |

回流率候選口徑包括：舊客來客占比、期初既有顧客在本月回店比例、或指定觀察 cohort 在期限內再次到店比例。三者回答的問題不同，必須先確認決策場景、分母、觀察窗與跨店去重方式。

### 開發來源

回答：「客人從哪裡來？」

Google、LINE、Instagram、Facebook、路過、活動、陌生客、緣故客、會員介紹、員工介紹原則上是「維度」或「來源分類」，不是獨立 KPI。來源應用來切分新客數、體驗人數、開卡人數與開卡率。

| 維度 | 內部識別 | 定義與資料來源 | 可切分指標 | 狀態 | 優先級 |
| --- | --- | --- | --- | --- | --- |
| 顧客開發來源 | `acquisition_source` | 需新增或確認結構化來源欄位；現有 `authSource` 不是行銷來源 | 新客、體驗、開卡人數、開卡率 | MISSING | P0 |
| 會員介紹 | `member_referral` | Referral、ReferralEvent 或 sponsor 關係；歸屬時點與跨店規則待確認 | 新客、體驗、開卡 | PARTIAL | P0 |
| 員工介紹 | `staff_referral` | 未找到可靠且一致的結構化來源欄位 | 新客、體驗、開卡 | MISSING | P1 |
| 陌生客／緣故客 | `relationship_origin` | 必須由業務端定義分類規則；不得用一般行銷慣例代替 | 新客、體驗、開卡 | TBD | P0 |

顧客來源需確認單選或多選，以及「首次接觸來源」「本次活動來源」「成交歸因來源」是否為不同欄位。未來可能需要 enum、關聯表或受控標籤；不建議只靠自由文字標籤、notes 或任意字串做正式統計。

### 成交

回答：「有沒有成交？」

| 經營指標 | 內部識別 | 商業定義 | 計算定義 | 資料來源 | 顯示位置 | MoM / YoY | 切店舖 / 人員 / 來源 | 狀態 | 優先級 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 開卡人數 | `same_day_package_buyers` | 本月完成體驗後，在同一天購買正式方案的人數 | 以店舖時區，將完成體驗顧客與同日有效正式方案購買交易 join 後 distinct 顧客；工程細節待 audit | Booking、Transaction、ServicePlan／CustomerPlanWallet | 營運分析 | 是 / 是 | 是 / 是 / 待來源欄位 | PARTIAL | P0 |
| 開卡率 | `same_day_package_conversion_rate` | 完成體驗當天購買正式方案的人數 ÷ 完成體驗人數 | 核心規則只算當天；不採 7 天或 30 天，之後購買不算體驗當天開卡 | 同上 | 營運分析；未來由經營診斷解讀 | 是 / 是 | 是 / 是 / 待來源欄位 | PARTIAL | P0 |
| 客單價 | `average_order_value` | 每筆有效營收交易的平均金額 | 既有實作可供 audit；交易口徑仍需一致化 | Transaction | 營運分析候選 | 可 | 是 / 是 / 可依來源後補 | AVAILABLE | P2 |

開卡指標工程確認事項：

- 同一天以店舖時區判斷。
- 退款、取消、作廢與未確認付款如何排除。
- 同一顧客同日重複購買如何去重。
- 正式方案用 `PACKAGE_PURCHASE`、Plan category、wallet 或何種組合辨識。
- 多人預約的體驗分母與成交歸屬如何計算。
- 完成體驗與購買資料跨店時，歸屬完成店、成交店或兩者如何呈現。

### 留存

回答：「顧客有沒有持續回來？」

| 經營指標 | 內部識別 | 商業定義 | 計算定義 | 資料來源 | 顯示位置 | MoM / YoY | 切店舖 / 人員 / 來源 | 狀態 | 優先級 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 回流率 | `revisit_rate` | 衡量既有顧客持續回店 | 分母、觀察窗與 cohort 待定義 | Booking、Customer | 營運分析；經營診斷解讀 | 待定義 | 是 / 待確認 / 待來源欄位 | TBD | P0 |
| 續約率 | `renewal_rate` | 衡量符合續約條件的顧客再次購買正式方案 | 正式分母、續約視窗與方案升降級規則待定義 | CustomerPlanWallet、Transaction、ServicePlan | 營運分析；經營診斷解讀 | 待定義 | 是 / 是 / 待來源欄位 | TBD | P1 |
| 未續約率 | `non_renewal_rate` | 衡量符合續約條件但未續約的顧客比例 | 是否為 `1 - 續約率`、逾期多久才算未續約，均待確認 | 同上 | 營運分析；經營診斷解讀 | 待定義 | 是 / 是 / 待來源欄位 | TBD | P1 |
| 平均回店天數 | `average_days_between_visits` | 顧客完成服務之間的平均間隔 | 觀察窗、單次到店、跨店與極端值處理待定義 | Booking | 營運分析候選 | 待定義 | 是 / 是 / 待來源欄位 | TBD | P2 |

### 營收

回答：「本期營收表現如何？」

| 經營指標 | 內部識別 | 商業定義 | 計算定義 | 資料來源 | 顯示位置 | MoM / YoY | 切店舖 / 人員 / 來源 | 狀態 | 優先級 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 本月營收 | `monthly_gross_revenue` | 本月有效收入交易總額 | 店舖時區本月、有效交易與有效付款狀態、收入型交易加總；最終沿用統一 revenue constants | Transaction | 營運分析 | 是 / 是 | 是 / 是 / 待來源欄位 | AVAILABLE | P0 |
| 退款 | `monthly_refunds` | 本月有效退款交易總額 | 店舖時區本月有效 `REFUND` 交易加總；正負號顯示規則需統一 | Transaction | 營運分析 | 是 / 是 | 是 / 是 / 待來源欄位 | AVAILABLE | P0 |
| 淨收 | `monthly_net_revenue` | 本月營收扣除退款後的淨額 | 使用同一交易／付款口徑計算收入與退款後相加 | Transaction | 營運分析 | 是 / 是 | 是 / 是 / 待來源欄位 | AVAILABLE | P0 |
| 客單價 | `average_order_value` | 有效營收交易平均金額 | 非首批月度核心指標；交易分母口徑需 audit | Transaction | 營運分析候選 | 可 | 是 / 是 / 待來源欄位 | AVAILABLE | P2 |

### 人員

回答：「各人員的經營成果如何？」名稱一律使用「人員」或「服務人員」，不把跨產業規格限定為店長。

| 經營指標 | 內部識別 | 商業定義 | 計算定義 | 資料來源 | 顯示位置 | MoM / YoY | 切店舖 / 人員 / 來源 | 狀態 | 優先級 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 人員營收 | `staff_revenue` | 歸屬各人員的有效營收與淨收 | 依 `revenueStaffId` 與統一營收口徑彙總；未指派資料需獨立呈現 | Transaction | 營運分析 | 是 / 是 | 是 / 本身 / 待來源欄位 | AVAILABLE | P0 |
| 人員體驗人數 | `staff_trial_visitors` | 歸屬各服務人員的完成體驗人數 | 人數／人次、service staff／revenue staff 歸屬待確認 | Booking | 營運分析 | 是 / 是 | 是 / 本身 / 待來源欄位 | TBD | P1 |
| 人員開卡人數 | `staff_same_day_package_buyers` | 各人員完成體驗後同日成交的顧客數 | 需先確定體驗人員、成交人員與歸屬衝突規則 | Booking、Transaction | 營運分析 | 是 / 是 | 是 / 本身 / 待來源欄位 | TBD | P1 |
| 人員開卡率 | `staff_same_day_package_conversion_rate` | 各人員同日開卡人數 ÷ 該人員完成體驗人數 | 沿用全店當天規則，另定義人員歸屬 | 同上 | 營運分析；經營診斷解讀 | 是 / 是 | 是 / 本身 / 待來源欄位 | TBD | P1 |
| 人員回流率 | `staff_revisit_rate` | 衡量各人員服務顧客持續回店 | 先定義全店回流率，再定義服務人員／歸屬人員口徑 | Booking、Customer | 營運分析；經營診斷解讀 | 待定義 | 是 / 本身 / 待來源欄位 | TBD | P1 |

## 顯示位置

### 營運分析

- 顯示原始經營指標。
- 固定提供本月、較上月（MoM）、去年同月（YoY）。
- 只呈現已定義且資料品質通過 audit 的指標。

### 經營診斷

- 未來用來解讀已定義指標。
- 本 PR 不定義健康值、建議、AI 解讀、預測或趨勢圖。

## 待業務確認

- 回流率的正式定義、分母與觀察窗。
- 體驗人數採唯一顧客或完成體驗人次。
- 陌生客與緣故客的正式分類規則。
- 顧客來源是單選或多選，以及首次來源與成交歸因是否分開。
- 自由標籤是否要轉為結構化來源欄位或受控標籤。
- 開卡率中退款、取消、作廢與未確認付款如何處理。
- 多人預約的體驗與開卡人數如何計算。
- 續約率的正式分母、續約視窗與方案變更規則。
- 未續約何時成立，是否可直接視為 `1 - 續約率`。
- 跨店顧客、跨店完成服務與跨店交易的歸屬及去重規則。
- 人員指標以服務人員、營收歸屬人員或顧客直屬人員計算。

## 實作護欄

- 每個指標先確認商業定義，再做資料 audit，再做 query，最後才做 UI。
- 不以 Customer 建檔時間代替首次完成服務時間。
- 不以預約筆數代替唯一來客數。
- 不以登入通道 `authSource` 代替行銷來源。
- 不以自由文字標籤直接產出正式來源統計。
- 不把現有 advanced reports 的 rate 公式自動升格為本規格定案。
