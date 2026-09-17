# 課程承接成熟架構對照（2026-09-17，進行中）

基準：課程分支 4a378bd6，main e69323f4。保留課程專屬資料與交易服務；正式蒸足頁面僅唯讀盤點，所有寫入驗收只在隔離預覽。

狀態定義：已存在≠本輪驗收通過；「待接」不算完成。受權限／店家功能控制的項目必須在後端重驗。隱藏頁不作成熟可用功能的證據。

## 頁面 → 操作 → 服務 → 課程差異與承接

|蒸足頁面／區塊|按鈕、側窗、子頁及開關|服務／資料|課程現況與缺漏|共用方式／必要差異|本輪結果|
|---|---|---|---|---|---|
|首頁 dashboard|現金開店／結帳／收支、今日預約名單、待辦、快捷入口|cash-drawer、booking、提醒|已有課程當日與現金抽屜；逐項核對排列與待辦|共用現金抽屜，名單保留 CourseBooking|待驗|
|customers 清單／詳情|搜尋、狀態／到訪／推薦／人員篩選、分頁、drawer、資料修改、方案／購買／預約、健康、匯出、合併子頁|queries/customer、customer actions、CustomerIdentityLink|course member-workspace 自製清單，缺成熟篩選與多項詳情|抽出成熟清單／drawer 展示，課程方案與預約由 course queries 注入；不套蒸足 wallet/booking|待接|
|staff|角色、基本資料、啟停用、分組權限、帳號、排班|staff、course-staff、StaffMemberLink|已有共用 staff-workspace 與角色連結|沿用現有，排班對照課程可授課時段；不授總部權限|待驗|
|health、customers/id/health、前台 health/new|新增／編輯量測、摘要、完整量測、歷史／趨勢、已開通分析|HealthRecordForm、HealthAssessmentCard、native-health-service、健康功能 gate|課程後台簡易表單未做功能 gate；前台缺新增／編輯|共用成熟量測表單與摘要，courseMember 只解析本人，不用共卡查健康|待接|
|plans／購買|建立、編輯、上下架、適用課程、期限、指派、共卡、銀行資訊、訂單／核帳／發卡|course-members、course-portal、CoursePointCard／Purchase|核心已驗，待完整子頁／錯誤／排序對照|保留 Course 點數、占用及快到期優先；不能直接用 Steamfoot WalletSession|待驗|
|revenue 營運|營收明細、現金收支側窗、現金管理、KPI、交易工作台、日期／類型／人員篩選、明細側窗、修改／作廢／退款、匯出|queries/transaction、report、TransactionDrawer、cashbook|目前導向 cashbook，缺整頁工作台|抽出成熟營運布局；資料與操作注入課程交易 adapter；退款受使用／占用狀態約束|待接|
|營運相關子頁|store-revenue（月季年）、reconciliation、data-export、transactions|報表、對帳、匯出服務|路由 gate 阻擋，課程尚未適配|課程購買和 Cashbook 去重；不能把同筆核帳收入加兩次|待接|
|reports 分析|今日／本月／自訂、營運摘要、客流、成交、六個月趨勢、留存、營收／店長分析、同期比較、查看顧客、全店／店長 CSV、月結|customer-flow、conversion、retention、performance-trends、snapshot|目前只有課程月摘要和單圖|共用成熟 report 展示與日期；替換課程查詢、快照命名／統計口徑，無來源不可回填假 0|待接|
|settings 控制台|分類導覽、狀態卡、編輯／次入口、快捷操作、系統資訊|SettingsShell/NavSection/ActionCard/SidePanel|自製簡易表單，缺大部分入口|共用成熟控制台；逐個放行已適配子頁|待接|
|settings/hours、duty、payment、plans|營業／公休／特殊日、預約開放日、排班啟用、銀行、成長方案中心|ShopConfig、BusinessHours、SpecialBusinessDay、Duty|銀行已有、其他缺連動|公休標記及可約日期用同店既有設定；實際課次仍由 CourseSession|待接|
|settings/trial、referral-share、digital-butler|體驗价格範圍、分享模板、流程編輯、名單|trial settings、referral、digital-butler|課程尚未適配|逐项檢查現有模板／事件目的地；涉及新優惠／獎勵規則需明列，不自動套用|待接|
|reminders、growth、操作指南|規則／模板／開關、觸發事件、對象、發送紀錄、重試、深層連結|通知工作流、顧客經營查詢、指南 catalog|課程指南目前關閉，提醒／經營路由阻擋|通知僅測試授權對象；Course 事件與方案，不用蒸足餘堂觸發條件|待接|
|LIFF 會員／教練|既有底部導覽、日曆、共卡、同堂逐人、原位名單、點名／更正／批次、健康／店家|course portal/actions、course booking|已驗核心保留；健康／資料子功能未完整；檢查桌機手機寬度和操作文案|保留已定案版面，套共用功能而非重畫前台|待接／驗|

## 真實頁面唯讀盤點

2026-09-17 已開啟蒸足預約、營運、分析、設定實際頁面。營運確有營收明細／現金收支／完整現金管理、交易工作台、匯出、收入總覽、對帳中心；分析確有日期切換、客流／成交／留存、CSV／月結；設定確有分類與多個編輯子頁。未在正式頁按下寫入、退款、通知、匯出或核帳。

`dashboard/ops/page.tsx` 開頭無条件 redirect，後續程式是保留的隱藏頁，不得冒充目前成熟營運入口；實際入口是 revenue。其他隱藏區塊以條件、feature gate、權限逐項記錄。

## 必要商業差異

- 蒸足退款 pure helper 以 WalletSession 堂數與單堂價格計算；課程以點數卡、多課程不同額度運作。不能直接套用。已詢問部分使用點數卡的退款金額規則，等待回答；未使用且無占用可沿用全額退的既有語意。這不阻擋其他承接批次。
- Customer 目前沒有獨立緊急聯絡欄位（Staff 有）。若承接需要新增 schema，只更新隔離庫，並將遷移加入正式發布方案；不能假裝以 serviceNote 混存就已完成。
- 課程購買核帳目前記入 CashbookEntry，不寫蒸足 Transaction。營收、退款、對帳須以同一課程來源對齊，不能混讀其他模組帳。

## 驗收記錄

尚在盤點／實作，沒有將以上待接功能標為驗收通過。後續每批附程式、資料與真實瀏覽器證據，故障修復後再驗受影響流程。

### 批次一：健康共用（4b34d2b2）

- 共用成熟 HealthRecordForm／HealthAssessmentCard，包含九項量測、日期、備註、历史、趨勢；課程後台與會員使用同一工作區。
- 新增店家健康功能 gate；會員 action 固定使用登入者本店顧客，不接受共卡他人作為健康資料對象。
- 隔離預覽後台實際新增一筆本轮健康量測，再編輯同筆重量；SQL 驗證紀錄仍只有一筆且店別正確。沒有更動既有紀錄。
- 型別／修改檔 lint、健康及成熟表單相關 16 tests 通過。會員實際新增／編輯等待可操作視窗登入，未列為通過。

### 批次二：營運與未使用退款（實作／驗證中）

- 原側列營運僅導向現金帳，已改接 revenue 課程資料 adapter；共用 RevenueTabs、CashbookShortcut、DataTable、KpiStrip、SideCard、RightSheet。
- 已寫入購買日期／核帳人員／狀態篩選、分頁、購買明細、核帳與全額退款入口。摘要依核帳／退款日期，不把課程購買與現金帳連動重複相加。
- 全額退款採原購買實付；占用、部分使用、額度異動、額外贈送、原收款不符先擋。退款、收回額度、卡片結清、收支、稽核在同店鎖與同一交易完成；請求重送不重退。
- 退款後禁止出席更正重新增加額度。連動現金帳不可單獨改額／刪除。
- 完整交易更正／作廢、收入總覽、對帳、匯出與其他成熟功能仍待接，**本批不等於營運整頁已完成**。
- 部分使用退款依 `course-refund-rule-comparison-20260917.md` 待商業規則確認，沒有自行套用公式。

2026-09-17 本批隔離瀏覽器結果（ecea5f5f）：以本輪新建、明確標示的待核帳測試訂單（非真實銀行付款），實際在營運側窗核帳發卡，再填原因送出未使用全額退款。UI 顯示退款成功，SQL 核對：REFUNDED、remaining=0、closed=true、退款單/REFUND額度紀錄/稽核各一筆；原收入與退款支出淨額為0。既有購買與顧客資料未改。此結果不代表部分退款、並行退款或完整營運承接驗收通過。

同批追加：承接既有對帳中心完整介面／歷史與 Debug，替換為同店課程核帳、退款上限、額度、占用與容量五项檢查。隔離 SQL 五项無差異；網頁手動執行仍待驗。交易更正可改備註／同店人員歸屬且連動現金帳並稽核；作廢仿照成熟流程要求整卡未使用、無任何預約或額度異動，保留原交易與原日非現金沖銷。86項本批相關測試通過，未以此取代真實操作。收入總覽／匯出與其他待接項仍未完成。
