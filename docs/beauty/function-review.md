# 運動教室盤點與美業功能取捨

盤點基準：`rock7652-beep/steamfoot-booking` main `c90f82df778da7c52e8716f8a6f3b6d0bb238593`，2026-10-20 再次 fetch 核對未變。美業實作位於獨立支線 `feat/beauty-module-20261020`，不是 main 的既有功能。既有運動、音樂及封存 SPA 資料不刪除、不轉換。

## 證據分層

- **程式已有**：以下 A 與來源表指基準 main 的程式能力；涉及新版運動、功能授權、角色、訂閱及店家開關者仍受條件限制。
- **測試涵蓋**：測試檔存在與本次實際執行結果分開；本支線測試結果見 `acceptance.md`，不以測試名稱保證完整流程。
- **正式已啟用**：本輪未讀正式 DB 的旗標、安裝／授權或正式部署環境；所有店家實際啟用狀態均為**待核**。main 合併紀錄、Preview 與測試通過均不能代替這項證據。
- **建議新增／支線實作**：B 的新增及調整項目，不宣稱已上線。資料庫 SQL 只在本機 PGlite 隔離測試執行。

`src/lib/sports-native-preview.ts` 同時含正式指定店家 opt-in 與隔離 Preview 分支；`src/lib/sports-entitlement.ts`、`src/lib/feature-gate.ts` 與各 action 另行決定實際可用能力。因此同一 main 也不能把新版永久系列、候補或共卡一律寫成每間運動店現況。

## A．運動教室現況文字樹

以下列可辨識的使用任務，並包含頁內操作；「條件式」代表需再核對入口／旗標／授權，不是正式啟用聲明。

```text
運動教室（main 程式能力）
├─ 店長端
│  ├─ 首頁：待辦、當日課務、開店設定進度、提醒已處理／稍後／關閉
│  ├─ 課表／班表
│  │  ├─ 日／週／月、教練／教室檢視、查課次與學員名單
│  │  ├─ 教學項目、單次排課、每週／隔週固定排課、批次預覽衝突
│  │  ├─ 新版運動永久系列、固定學員位置、訂閱停用／延續（條件式）
│  │  ├─ 修改當次／後續、調課、剪下貼上與移動結果核對（條件式）
│  │  ├─ 預約／加學員、同行、具名共卡、額度與容量檢查
│  │  ├─ 到店報到、出席／未到／請假／取消、撤銷與誤標更正
│  │  ├─ 本堂停課、取消後續、請假備註、教練出缺席／曠課補課
│  │  ├─ 候補申請／取消／遞補、候補規則（條件式）
│  │  └─ 教室租借、費用、付款與取消（條件式）
│  ├─ 學員／顧客
│  │  ├─ 新增／修改、聯絡與服務備註、歸屬／推薦人、歷史預約
│  │  ├─ 方案適用、購課與剩餘／預留／可用額度、共卡成員
│  │  ├─ 固定期課／系列報名、未來停課／待補課（部分入口待核）
│  │  └─ 健康資料與可見性控制（條件式；不能由共卡取得）
│  ├─ 顧客經營：低餘額、到期、未回訪／生日、追蹤／已處理與提醒設定
│  ├─ 營運
│  │  ├─ 現場指派方案、顧客轉帳後四碼申請、確認購課
│  │  ├─ 銷售交易、備註／歸屬更正、誤建作廢、協商退款與方案停用
│  │  ├─ 體驗安排、體驗收款／收款作廢、體驗資格與設定
│  │  ├─ 教練個別費率／預設繼承、固定鐘點／拆帳與服務快照
│  │  ├─ 月結確認、技師／教練付款、更正、店家利潤及月結通知（條件式）
│  │  └─ 現金帳、現金抽屜開關／收支／交接、對帳
│  ├─ 分析：營收／退款、課務／學員／教練、續購／未回訪、匯出（依權限）
│  └─ 店務設定
│     ├─ 教室容量／設備、教學項目與收費適用、方案上／下架與批次狀態
│     ├─ 教練資格／可授課時間／例外、工作與收入權限
│     ├─ 人員登入、角色、啟停與分層授權；教練身分另外連結
│     ├─ 營業時間／公休／特殊日、預約開放與顧客自行預約開關
│     └─ 圖片公告、銀行／LINE、提醒文案與開關、排序、後台操作指南
├─ 教練「我的工作」
│  ├─ 看本人課表與學員名單、報到／點名、出席更正、教練筆記
│  ├─ 代學員請假／改期、本人請假／調課（逐項授權）
│  └─ 本人收入月份查詢、已確認月結／付款與通知（逐項授權）
├─ 顧客前台
│  ├─ 會員登入／個人資料／切店／身分連結、圖片公告
│  ├─ 瀏覽課程、選日期／課次與方案、同行／授權共卡代約
│  ├─ 我的預約、取消／改期、體驗確認、候補（條件式）
│  ├─ 方案與餘額、購買／轉帳後四碼、購買狀態
│  └─ 健康資料、提醒偏好、推薦分享（各自開關與權限）
└─ 共用與總部
   ├─ HQ 建店與運動／音樂分類、模組安裝／訂閱／功能授權
   ├─ 門市／子店唯讀、停用／到期／帳號撤銷、資料隔離
   ├─ 中央會員與 LINE 可信收件人、共用額度／配額與通知紀錄
   ├─ 稽核、操作歷史、後台指南、公開入口與安全路由
   └─ 運動正式 opt-in／指定店家、隔離 Preview 與 migration readiness
```

## B．美業建議／本支線版文字樹

［保留］是共用能力；［調整］是重做美業規則；［不納入］只是不放入美業，不刪既有模組；［新增］指 main 無此美業專屬能力；［待確認］指正式或實機證據不足。

```text
美業（獨立 BEAUTY 模組）
├─ 店長端
│  ├─ 日常工作
│  │  ├─ 首頁［調整］：當日預約／完成／取消未到、快速新增
│  │  ├─ 班表［調整］
│  │  │  ├─ 日期／一週／當月、技師／位置篩選［調整］
│  │  │  ├─ 人數、逐人服務／性別／選填指定技師、共同時間［新增］
│  │  │  ├─ 工作量優先與固定同分順序、整組成立［新增］
│  │  │  ├─ 完整時長＋選填整理時間同鎖技師／位置［新增］
│  │  │  ├─ 完成／取消／未到／更正、改期／換技師位置［調整］
│  │  │  ├─ 逐人／多人收款、同行明細、當次備註［調整］
│  │  │  └─ 既有未驗證顧客由店長核對後連結［新增］
│  │  ├─ 顧客管理［調整］：新增／修改、聯絡、備註、服務紀錄、方案與具名共用
│  │  ├─ 顧客經營［調整］：可用次數偏低、即將到期名單
│  │  ├─ 營運［調整］
│  │  │  ├─ 單次／方案收款、轉帳核帳、退款登錄與結清［調整］
│  │  │  ├─ 實際技師拆帳月結、付款與收回更正［調整］
│  │  │  ├─ 現金帳／現金抽屜［保留］
│  │  │  └─ LINE 發送紀錄／配額［保留］，美業事件與明日提醒［新增］
│  │  └─ 分析［調整］：按月服務狀態／服務項目、實收減退款、有效方案
│  └─ 店務管理
│     ├─ 位置管理［保留］：空間新增／修改／啟停，一位服務者占一個位置
│     ├─ 服務項目［調整］：分類、時長、單次／體驗價、選填整理時間、啟停
│     ├─ 收費方式［調整］：單次依服務定價；自訂次數／價格／期限／適用服務／共用
│     ├─ 技師管理［新增］
│     │  ├─ 姓名、必填性別、服務資格、每週時間／指定日休假調班
│     │  ├─ 每次固定／固定鐘點／百分比與原價或實收基準
│     │  └─ 會員工作身分連結、完成／取消／改期／本人收入權限
│     ├─ 人員管理［保留］：後台登入帳號、角色、權限及停用
│     ├─ 圖片公告［保留］：上傳／排序／排程／發布
│     └─ 設定［調整］：營業時間、公休、自行預約／取消／改期、扣次、通知與 LINE
├─ 技師端「我的工作」［調整］
│  ├─ 本人服務、時間、同行服務者與本次備註［調整］
│  ├─ 本人服務完成／取消／改期（店長逐項授權）［調整］
│  └─ 已確認本人月結與實際已付淨額［調整］
├─ 顧客端
│  ├─ 會員登入／個人資料／切店、圖片公告［保留］
│  ├─ 先選人數、逐人選服務、必選性別、不強迫指定技師［新增］
│  ├─ 選共同可用時間、整組確認、各人不同結束時間［新增］
│  ├─ 我的預約、取消／改期、規則提示［調整］
│  ├─ 我的方案、共用可用餘額、轉帳申請／核帳狀態［調整］
│  └─ 公開體驗：逐人身分、每服務一次、蒸足式公開填單及可信 LINE entry［調整］
└─ 共用與總部
   ├─ HQ 新增獨立 BEAUTY 店家［新增］，功能／訂閱／角色閘門［保留］
   ├─ Store／Customer／User／CourseRoom、銀行、時間工具、共用 UI［保留］
   ├─ 美業預約群組／逐人服務、次數卡／帳本／拆帳／事件［新增］
   ├─ 三端真實帳號、LINE 實機、正式開通與部署［待確認］
   └─ 團課容量、固定系列、候補、補課券、教練曠課補課、教室租借［不納入］
```

## 逐項功能去向與來源

以下理由對應「美業應如何取捨」，不是聲稱整段運動程式可原樣搬用。運動 action 來源的逐一 export 索引另見 `sports-action-sources.csv`；同檔的音樂分支不當成運動功能已開放。縮寫 `actions/` 為 `src/server/actions/`，`services/` 為 `src/server/services/`。

| 運動／共用功能 | 去向 | 一句理由 | main 對應來源；美業來源 |
|---|---|---|---|
| 首頁／設定進度／待辦 | ［調整］ | 第一版先呈現當日服務，課務待辦不能照搬。 | `src/app/(dashboard)/dashboard/page.tsx`、`actions/course-setup.ts`、`actions/course-store-notices.ts`；`src/components/beauty/dashboard.tsx` |
| 日週月／資源課表 | ［調整］ | 美業依逐人服務查詢與篩選技師位置，使用獨立資料。 | `src/app/(dashboard)/dashboard/courses/page.tsx`；`src/server/beauty/queries.ts` |
| 教學項目／科目 | ［調整］ | 改成服務時長與價格，不保留班型與教學名額。 | `actions/course.ts`；`saveBeautyCatalog` |
| 單次排課／預約 | ［調整］ | 從先開一堂課改成顧客依服務與可用資源預約。 | `actions/course.ts`、`actions/course-members.ts`；`src/server/beauty/booking.ts` |
| 每週／隔週／永久系列 | ［不納入］ | 美業第一版以實際服務預約為主，固定學員位置與展課不適用。 | `actions/course.ts`、`actions/course-roster-enrollment.ts`、`services/sports-permanent-series.ts` |
| 固定期課與批次招收 | ［不納入］ | 次數方案授予使用權，不代表先排固定班。 | `actions/course-roster-enrollment.ts`、`actions/course-members.ts` |
| 剪下貼上／批次排課／後續停課 | ［不納入］ | 群組只要求共同開始，不引入系列調整的複雜範圍。 | `actions/course.ts`、`actions/course-batch.ts` |
| 單筆改期／取消／更正 | ［調整］ | 改期重新檢查技師、空間與完整時長，取消按快照政策。 | `actions/course-booking-notification.ts`、`actions/course-members.ts`；`moveBeautyAppointment`、`changeBeautyStatus` |
| 多人同行 | ［調整］ | 改為每位可不同服務、性別與結束時間，整組不可部分成立。 | `actions/course-companions.ts`；`reserveParty` |
| 共卡／代約 | ［調整］ | 具名授權和共用餘額保留，美業次數卡不使用運動點數模型。 | `actions/course-members.ts`、`actions/course-card-reservations.ts`；`assertCard`、`updateBeautyCardMembers` |
| 到店報到／出席點名 | ［調整］ | 簡化為服務完成，不把報到當成服務已完成或扣次。 | `actions/course-portal.ts`、`actions/course-members.ts`；`transition` |
| 未到／請假／取消扣抵 | ［調整］ | 取消和未到各選扣次或不扣次，不自動發補課券。 | `services/course-booking.ts`、`actions/course-members.ts`；`transition` |
| 補課券／待補課 | ［不納入］ | 美業用取消回復或扣次規則，不另建補課權益。 | `actions/course-members.ts`、`course-prisma/schema.prisma` |
| 教練出缺席／曠課免費補課 | ［不納入］ | 技師異動以店長改派與服務更正處理，不沿用團課教學責任模型。 | `actions/course.ts`、`actions/course-members.ts` |
| 候補／自動遞補 | ［不納入］ | 第一版先提供確定有資源的時間，避免技師偏好與多資源候補難度。 | `actions/course-waitlist.ts`、`services/course-waitlist.ts` |
| 教室租借／租金付款 | ［不納入］ | 空間沿用不代表要提供對外租借。 | `actions/course-rental.ts` |
| 顧客新增／修改／聯絡 | ［保留］ | 共用 Customer 身分與聯絡資料，公開手機不授予帳號權限。 | `prisma/schema.prisma`、`actions/course-members.ts`、`actions/course-member-contact.ts`；美業 customer actions |
| 顧客備註／教練筆記／歷史 | ［調整］ | 區分顧客備註與逐次服務備註，只供有權者查看。 | `actions/course-customer-note.ts`、`actions/course-customer-history.ts`、`actions/course-portal.ts`；`readBeautyCustomer` |
| 顧客歸屬／推薦獎勵／分享追蹤 | ［不納入］ | 第一版未確認美業獎勵制度，不能把課程推薦規則帶入。 | `actions/course-customer-attribution.ts`、`actions/course-referral-share.ts` |
| 健康評估／健康授權 | ［不納入］ | 醫療健康紀錄不作美業第一版的必要表單或共用權限。 | `actions/course-health.ts` |
| 低餘額／到期名單 | ［調整］ | 用剩餘扣除預約占用的可用次數，期限仍以台灣日期顯示。 | `actions/course-low-balance.ts`、`actions/course-plan-reminders.ts`；beauty queries/dashboard |
| 生日／未回訪／處理追蹤紀錄 | ［不納入］ | 第一版先做低次數與到期名單，完整 CRM 提醒流程留後續。 | `src/app/(dashboard)/dashboard/growth/page.tsx`、`actions/course-store-notices.ts` |
| 次數／點數方案、啟停與適用項目 | ［調整］ | 只以店家自訂次數方案為主，不種5／10次範本。 | `actions/course-members.ts`；`planInput`、`BeautyPlan` |
| 轉帳申請／核帳／現場發方案 | ［調整］ | 購入條款快照與美業權益獨立，核帳不等於線上金流。 | `actions/course-portal.ts`；`requestBeautyPlan`、`confirmBeautyPurchase`、`purchaseBeautyPlan` |
| 交易備註／歸屬更正／作廢 | ［調整］ | 美業保留原帳本，錯誤以退款／收回及新正確紀錄處理。 | `actions/course-purchase-correction.ts`、`actions/course-checkout-status.ts`；beauty commerce |
| 協商退款／方案停用 | ［調整］ | 先清預約占用再結清退款，保留已服務與歷史費率。 | `actions/course-refund.ts`；`refund` |
| 體驗設定／體驗收款 | ［調整］ | 每人每服務一次，同行分別核對，價格由服務項目設定。 | `actions/course-trial.ts`；`submitBeautyTrial`、`collect` |
| 教練個別拆帳／預設繼承 | ［調整］ | 技師逐服務設定並快照，第一版不引入運動教學項目繼承層。 | `actions/course-compensation.ts`；`BeautyTechnician.rates`、`BeautyAppointment.rate` |
| 固定鐘點／固定額／百分比 | ［調整］ | 固定免填基準，百分比才選原價或實收，按實際技師歸帳。 | `src/server/actions/course-compensation.ts`；`serviceFee` |
| 月結確認／付款／付款更正 | ［調整］ | 用美業完成服務的費用與不可覆寫的付款／收回帳本。 | `actions/course-monthly-settlement.ts`、`actions/course-fee-payment.ts`；beauty settlement/payFee/voidFee |
| 店家利潤拆分／獨立利潤付款 | ［不納入］ | 使用者只確認技師拆帳，沒有確認美業合夥利潤分配制度。 | `actions/course-monthly-settlement.ts` |
| 月結推播給教練／店長 | ［不納入］ | 第一版提供本人已確認收入，月結推播不列必要功能。 | `actions/course-monthly-notification.ts` |
| 現金帳／抽屜／交接 | ［保留］ | 沿用共同收支與今日抽屜，所有美業現金異動一併入帳。 | `src/app/(dashboard)/dashboard/cashbook/page.tsx`、`src/app/(dashboard)/dashboard/cash-drawer/page.tsx`；beauty commerce.cash |
| 運動銷售與對帳讀取器 | ［不納入］ | 運動對帳沒有美業交易關係，不能改標題當成美業報表。 | `src/app/(dashboard)/dashboard/reconciliation/page.tsx`；美業月帳務獨立讀取 |
| 營收／服務／學員／教練分析 | ［調整］ | 第一版做月服務狀態、收退款與方案，不沿用課堂出席與續班定義。 | `src/server/queries/course*.ts`；beauty queries analytics |
| 既有報表匯出 | ［不納入］ | 第一版沒有核准美業匯出欄位，不宣稱運動匯出已支援美業。 | `src/server/queries/course*.ts`、`src/app/api/export/` |
| 空間管理 | ［保留］ | 床位就是既有空間，一位同時服務者占一個空間。 | `course-prisma/schema.prisma` CourseRoom；`saveBeautyLocation` |
| 教練／老師工作帳號、資格、時間 | ［調整］ | 美業技師模型獨立，增加必填性別與服務資格，不綁後台角色。 | `actions/course-staff.ts`、`actions/course-availability.ts`；`BeautyTechnician` |
| 技師性別偏好與不指定分配 | ［新增］ | 團課是先選課，不具備逐人服務性別與多資源分配規則。 | `src/lib/beauty/allocation.ts` |
| 人員帳號／角色／啟停 | ［保留］ | 沿用共用帳號與角色階層，技師設定不能授予後台權限。 | `actions/staff.ts`、`src/lib/staff-role-policy.ts`；staff page beauty permission labels |
| 營業時間／公休／特殊日 | ［保留］ | 共用店家營業資料，美業預約另外檢查技師時間與完整時長。 | `actions/course-business-hours.ts`、`services/service-hours-save.ts`、BusinessHours/SpecialBusinessDay |
| 自行預約／取消／改期與開放範圍 | ［調整］ | 美業獨立政策與截止分鐘，不能使用團課容量或訂閱系列設定。 | `actions/course-settings.ts`、`actions/course-booking-window.ts`；`BeautySetting` |
| LINE 預約／到期／低餘額提醒 | ［調整］ | 第一版提供預約事件與前一天提醒；到期／低餘額先列名單，不承諾自動推播。 | `actions/course-reminders.ts`、`actions/course-reminder-preference.ts`；beauty notifications |
| 通知配額／可信通道／預覽外發阻擋 | ［保留］ | 通用傳送政策可共用，不使用課程預約或課卡資料。 | `services/course-card-notification-delivery.ts`、`services/verified-reminder-line-route.ts` |
| 教練通知與通知收件人權限 | ［調整］ | 技師端以授權的本人工作與收入資料為主，第一版不自動寄教練團課通知。 | `actions/course-coach-notifications.ts`、`actions/course-own-income-access.ts`；beautyWorker/portal |
| 前台個資／會員／切店 | ［保留］ | 使用中央會員可信連結，不允許 URL 店家或手機冒充他人。 | `src/app/(customer)/layout.tsx`、`services/central-member-resolver.ts` |
| 圖片公告與銀行／LINE設定 | ［保留］ | 都是店家共用設定，與課程扣點規則無關。 | `src/components/image-announcements/`、`src/app/(dashboard)/dashboard/settings/payment/page.tsx`、`settings/line-official-accounts/page.tsx` |
| 後台操作指南 | ［調整］ | 新增美業後台任務說明，前台不建立操作指南。 | `src/lib/operation-guide.ts`；`src/lib/beauty-operation-guides.ts` |
| HQ 建店／模組與試用 | ［調整］ | 新增 BEAUTY 類型與閘門，不把既有 SPA 店改名轉入。 | `actions/store-onboarding.ts`、`src/lib/store-business-profile.ts` |
| 訂閱／功能授權／子店唯讀／稽核 | ［保留］ | 使用共用授權邊界，美業異動另留事件稽核。 | `src/lib/permissions.ts`、`feature-gate.ts`、`subscription-guard.ts`；beauty access/audit |
| 正式啟用與實機三端驗收 | ［待確認］ | 程式與本機測試無法證明正式資料庫、環境開關或 LINE 已啟用。 | `docs/beauty/acceptance.md` |

## 未合併工作（2026-10-20 查詢）

下列只列關聯，不讀作 main 既有能力，也沒有 cherry-pick 到本支線：

- #1354：運動測試站跨登入同步延遲與獨立驗收證據。
- #1307：193 題後台指南盤點與待登入驗收清單。
- #1329：共用設定原地操作、導航穩定與音樂排課。
- #1317：音樂教學項目、排課、即時課表與共用名單。
- #1320：課程頁載入骨架與共用導航狀態。
- #1245：音教雲匯入與音樂店流程，不作運動／美業既有功能。

來源：GitHub open PR 查詢；各 PR 的 Preview／測試聲明只屬各自版本。本輪不驗收、不修改、不關閉這些 PR。

## 決策摘要與仍待驗收

第一版就是 B 的三端服務預約、次數權益、收退款登錄、實際技師計酬與基本營運，不加入團課／補課／候補／租借／合夥利潤制度。共用 Store、Customer、User、CourseRoom、認證／角色、現金、LINE 通道、公告及 UI；美業預約、配額、政策、價格／費率快照、帳本、月結與事件保持獨立。

已確認的家人共用、方案不預設、整理時間選填、必選性別、多人不同服務、取消／未到各選扣次與每服務一次體驗不再重問。為使實作可檢查，另明列預約先占用／完成扣次、取消釋放體驗／未到占資格、方案單次百分比基準、固定鐘點以服務分鐘計算、取消未到不自動計服務報酬等實作預設，詳見 confirmed-spec.md；正式驗收可逐條確認，不能當作原始逐字稿已有此精確定義。

未能確認：正式環境與實體裝置、既有匿名體驗歷史是否要匯入、現有店家的 LINE 設定與真正身分驗證流程、資料量／真實 PostgreSQL 並發／全三端登入業務驗收。外部對話逐字稿未提供可讀檔案或該聊天內容，本輪只依本聊天明確指示，不猜測其內容。
