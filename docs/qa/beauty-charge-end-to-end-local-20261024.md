# 美業收費與開店引導：本機整合交付

本報告取代同日先前「僅核對模式／後端未接通」的階段性報告。
Repository: https://github.com/rock7652-beep/steamfoot-booking.git
Worktree: /tmp/steamfoot-beauty-integration
基底提交: 6092de9111ec5f778d2f003c49657c4c073339d4
變更為本機未提交程式，沒有推送、部署或操作資料庫。

## 已完成的程式

|順序|成果|
|---|---|
|1 收費畫面|正式 React 元件與清單已接 saveBeautyCharge；服務下拉、價格、單次體驗價／選填分鐘、多次次數／期限、技師三欄／手機兩欄。價格不乘次數，多次無體驗。單次收費名稱獨立，不改服務名稱。|
|2 權威儲存|新 action 檢查身分、門市、plans.edit、staff.view、功能權限及啟用名單；在既有 Store 鎖與 command 交易中保存價格、名稱與允許技師，檢查 revision／條件更新。失敗不自動重試；前端同一份草稿重送沿用 requestKey。|
|3 售卡快照|issueCard 在同一交易保存購入規則；轉帳申請先保存收費快照，確認付款使用原訂單快照，不追套目前方案。原價格、次數與適用服務快照沿用。|
|4 時段與建立預約|findAllocation 逐人取收費允許、目前資格、性別／指定、排班、計酬、空位與完整時間的交集；reserveParty 保存相同規則到預約。公開／會員／後台沿用同一分配入口。原契約移除瀏覽器提供的允許名單。|
|5 改期／恢復|原預約快照與原服務／整理時間繼續使用；讀時段與送出改期／恢復均經同一核心，不追套最新單次或方案規則。舊 null 快照明確保持 legacy，不從目前方案借新限制。|
|6 相容與版本|只將 SQL NULL 視為舊資料；JSON null、未知版本與損壞資料拒絕。一般 catalog 編輯保留技師限制並同步修訂，不改技師資格。既有多服務及單次數方案保留相容編輯入口，新模式不再讓該入口改全域資格或走舊價格 writer。|
|7 新店與開店流程|只有啟用名單內、且沒有設定、服務、方案、卡或預約的空店預設關閉自行預約；唯讀預設判斷不新增資料，首次明確服務建立才初始化。已有設定／營運資料的店家維持原行為。|
|8 八步導覽與檢查|跨頁上／下一步由門市 URL beautySetup 保存位置，包含共用人員頁，不影響其他模組。開店檢查以權威讀取預覽未來 7 天一般／體驗／各方案是否可安排；取消及人員權限仍由店家核對。舊收費可確認保留，不強迫重建。檢查不建立預約、收款或開放預約。|

服務資格仍只在技師／服務管理維護；收費技師限制不修改 BeautyTechnician.serviceIds。
每次時段掃描的收費資料只在該次載入物件快取，最終建立／改期重新取得資料；卡的資格、效期與額度檢查仍保留。

## 啟用與安全回退

三個伺服器設定均未修改：
- BEAUTY_CHARGE_RULES_ENABLED=1：啟用規則。
- BEAUTY_CHARGE_RULES_STORE_IDS：明確的 Store ID 名單，不能填 slug；未列入的門市不走新規則。
- BEAUTY_CHARGE_EDITING_ENABLED=1：另行開放新收費編輯。可關閉編輯而維持既有 SELECTED 資料的預約限制。

NEXT_PUBLIC_BEAUTY_SETUP_REVIEW 仍只是本機核對入口控制，不能授予後端寫入權。正式入口由後端權威能力與權限決定。

**六個新增欄位必須先存在，才可部署這次產生新 Prisma Client 的程式。即使規則開關關閉，ORM 的完整欄位讀取也可能需要這些欄位。不能用 feature flag 代替 schema 部署順序。**

有 SELECTED 資料後，不能關閉規則或回到不執行限制的舊版。暫停編輯可關閉 EDITING 開關；需回退程式時仍須保留相容執行限制的後端，或另行授權暫停受影響預約寫入。

## 資料庫審查：已準備但未執行

- 本機 beauty-prisma/schema.prisma 加入 6 個 nullable 欄位；Prisma Client 僅在本工作區的隔離 generated 目錄重新產生，不再共用另一 worktree 的 generated symlink。
- 審查 SQL：docs/qa/sql/beauty-charge-additive.review.sql，只新增 6 個欄位，不在任何自動 migration 目錄。
- 未執行該 SQL；未新增欄位到任何資料庫，未建立 migration 紀錄，未回填資料。
- 預計刪除業務資料 0 筆，批次 UPDATE 舊業務資料 0 筆；這是 SQL 範圍，不是實際資料庫盤點結果。
- 預定先進新版美業測試環境；過往測試 project 為 ttworfzgwejdeolegkxl，正式為 qijlnhtpbintanzpxkvf，**本次未重新確認連線與部署對應，不能據此直接執行**。
- 各表實際筆數、Store ID 與新版／其他門市清單尚未重新查核；沒有宣稱已確認全站零影響。
- 備份及還原演練尚未完成。執行前需完整備份相關資料與 schema（建議平台備份與 PostgreSQL custom-format 備份），保存校驗與時間、確認包含共用身分及空間依賴，並在獨立還原環境驗證筆數、規則及可用性。不得拿正式庫演練還原。
- SQL 設 lock_timeout 與 statement_timeout，欄位已存在即失敗，避免 IF NOT EXISTS 掩蓋型別差異。交易內失敗會回滾；提交後保留欄位與資料，不能 DROP 作為一般程式回退。

真正執行仍須另列確切目標環境、實際筆數、備份／還原實證並取得授權；目前限制沒有解除。

## 離線驗證與界限

- 23 個指定 mocked／pure／DOM 測試檔、229 項測試通過，涵蓋真實 action／reserveParty／issueCard／findAllocation 的模擬交易呼叫、現有價格與卡片流程、導航與權限、舊資料相容。
- TypeScript 使用已重新產生的 Beauty Client 檢查通過；異動 TS／TSX 的 ESLint 與 git diff --check 均通過。完整結果附 handoff。
- 實際 React 元件 SSR + 專案 CSS，單次／多次各 1366×900、1024×768、768×1024、390×844，8 位假技師展開時，表單與清單無須捲動、無整頁橫向溢出，字級與觸控高度不縮小。
- 上述不是登入後的測試站、真機、鍵盤開啟、資料庫交易／鎖／並發或真實收款驗收。更多人數、長名稱、放大字體或較矮螢幕保留必要捲動，避免截斷操作。
- 測試／型別／lint 均載入 socket 封鎖器。Prisma generate 使用假的 localhost:1 URL，只產生本機檔案；未連線資料庫。未執行 npm run build（該指令含 ci-migrate）。

## 現在剩下的階段

本輪本機實作與離線串接已完成，剩下的是資料庫變更審查／授權、測試庫套用、測試站實際驗收與其後的部署決策。這些未執行，不能把離線通過寫成已上線可用。
