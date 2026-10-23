# 美業全站最新共用頁面接點核對

核對時間：2026-10-23（Asia/Taipei）。本文件是程式來源盤點及接回追蹤，不是已部署或店家簽收證明。

- 最新遠端 main：`7cb8c26127f60337c159b05391bc90f3263246ad`（#1394，提醒分頁獨立載入）。已重新 fetch 核對。
- 本輪起始隔離支線：`preview/beauty-ui-alignment-20261021`，HEAD `9237bcdb`。
- 目前對外測試版仍為 `c3ed4b68`。本輪不 push、不部署、不執行 migration、不改正式資料、LINE 保持關閉。
- 支線尚缺 main 的 11 筆提交（包含設定保存結果、提醒分類與個別開關、通知對象、提醒載入效能）；不能把舊支線內的共用檔案稱為最新。
- 全站範圍：13 個左側功能入口、其新增／編輯／明細／批次／視窗／設定子頁、頂列共用操作、顧客與技師前台。不是只驗四個表單。
- 使用者已確認的美業規則保留；禁止用直接寫 Course 資料來假冒接回，美業帳本／拆帳／預約仍須經其授權與交易檢查。

## 實際接點與缺項

下列路徑均位於 `src/`。狀態「已共用」只描述程式使用關係，仍需本輪整合後實測；不表示正式啟用。

| 功能／操作 | 音樂／運動現行來源 | 美業目前來源／差異 | 接回處理／驗收 |
|---|---|---|---|
| 首頁摘要、待辦與快捷入口 | `components/admin/module-home-panel.tsx`；課程 dashboard | `components/beauty/home.tsx` 僅共用容器，資料與快捷內容另組 | 核對項目與來源，保留美業服務人次／收退款定義；不能宣稱整頁已共用 |
| 班表日／週切換與位置／技師視角 | `app/(dashboard)/dashboard/courses/workspace.tsx`、`course-schedule-board.tsx`、`components/admin/course-schedule-toolbar.tsx` | `components/beauty/schedule-workspace.tsx` 已使用板面與工具列，但控制器另組 | 核對新增、預約明細、查詢、關閉保留狀態及載入；租借占用尚未接入 |
| 月表日期、預約筆數／人次 | `components/admin/schedule-primitives.tsx`、課程月表 | 美業共用月表容器，另計 groupId 筆數／分項人次 | 保留多人分項統計，檢查各月／跨日；不可用課程堂數代替人次 |
| 預約清單視窗／名單／選取／狀態 | `courses/roster-list.tsx`、`courses/sports-roster-reminders.tsx` | `components/beauty/dashboard.tsx` 已接名單，但開啟／收款／改期仍有自有控制 | 逐操作核對，不能只確認視窗居中 |
| 新增預約與日期／完整時長 | 課程排課／名單新增操作 | `components/beauty/booking-form.tsx`；多人不同服務、技師與床位資源分配 | 保留已核定美業規則及兩頁顧客流程；共用視窗與表單操作，不能換成團體課排課 |
| 顧客清單、搜尋、篩選 | `courses/customer-list.tsx` | 美業使用同一清單元件，資料 adapter | 核對顧客詳情、新增／更正、無權限與跨店 |
| 顧客詳情基本資料、健康、紀錄、會員連結 | `courses/member-workspace.tsx`、`customer-profile.tsx`、`course-profile-forms.tsx` | `components/beauty/customer-panel.tsx` 有共用 overview／資料表單，但方案及紀錄另組 | 逐頁籤核對，方案餘額／共用名單仍用美業資料；停用、到期與結清不混為一類 |
| 顧客經營、分群、關懷紀錄 | `dashboard/growth/page.tsx`、共用 CareWorkspace／CareFilters | `components/beauty/care.tsx` 使用共用工作台，分群資料美業計算 | 核對提醒資格、寫入關懷紀錄、預約入口；不是直接套課程未回課條件 |
| 期間消耗統計 | `dashboard/growth/consumption/page.tsx`、`consumption-results.tsx` | 已有音樂／運動／美業共用入口 | 納入最新主線後核對日期、歸屬及方案扣次定義 |
| 營運導覽、收退款、購買／核帳 | `dashboard/revenue/_components/revenue-tabs.tsx`、`course-revenue.tsx` | 美業共用導覽，清單／收款面板仍在 `beauty/dashboard.tsx` | 明細、分項／合併收款、退款與跨月核對；禁止將課程付款寫入美業帳本 |
| 技師拆帳明細 | `dashboard/revenue/_components/course-fees.tsx` | `components/beauty/fee-summary.tsx` 使用共用明細呈現 | 保留實際服務技師與固定／百分比／鐘點；依使用者要求只看明細，不帶入登錄付款 |
| 分析、對象／期間、名單與統計 | `courses/analytics-page.tsx`、`components/admin/business-analytics-view.tsx` | `components/beauty/analytics.tsx` 已使用 BusinessAnalyticsView | 逐頁籤核對，不把容器共用當作指標已相同；維持美業資料歸屬 |
| 位置清單、新增／編輯、分類／設備／停用 | `courses/rooms-page.tsx`、`courses/workspace.tsx` 的 RoomMore | `beauty/catalog-adapter.tsx` 使用 CourseWorkspace，但 `catalogSource` 分支縮減欄位與高度 | 接回現行原表單；底層已同為 CourseRoom，不另建床位表 |
| 出租床位／租借開關、費率、整理時間 | `CourseRoom`、`SpaceRentalFields`、`courses/rental-panel.tsx` | 共用 CourseRoom 已有欄位，但 RoomMore `service` 分支隱藏租借；美業 saveBeautyLocation 未接租借欄位 | 缺項；需補讀取與儲存、租借入口及雙向撞期，不只打開 checkbox |
| 租借明細、收款／更正、取消與空間占用 | `server/actions/course-rental.ts`、`server/services/course-rental.ts` | 原服務只檢查 CourseSession／CourseRental，不查 BeautyAppointment | 必須補合法美業授權與雙向占用；不能直接把全店視為課程店繞過權限 |
| 服務項目清單、新增／編輯、分類／狀態 | `courses/page.tsx` view=catalog 實際走 `music-subject-catalog.tsx` | 美業原走 CourseWorkspace 舊 template 分支；前輪誤認為現行頁 | 改接 MusicSubjectCatalog 原清單與表單，保留服務時長／選填整理時間；金額仍在收費方式 |
| 可服務技師與服務計酬規則 | `music-subject-catalog.tsx` 的 sportsRule 與 `sports-coach-fee-fields.tsx` | 美業由技師 serviceIds／rates 定義，原服務頁沒有對應操作 | 欄位不能只複製後不存；需接服務／技師關係及費率，保留實際服務人員拆帳 |
| 收費方式新增、編輯、額度、價格、期限／共用 | `courses/member-page.tsx` → `member-workspace.tsx` → `course-profile-forms.tsx`（sportsNative／sportsData） | 美業雖用同一檔案，catalog 分支另選單次／體驗／方案；初始空值被當 single，僅出現售價 | 修正新增入口與完整方案表單；單次／體驗仍須存在，方案次數不預設；不可把空值當單次 |
| 收費方式適用服務／上架／顧客可購買 | 共用方案表單、CourseBatchBar、order driver | 已有美業 form／status／order ports | 保留原頁操作；檢查實際存回、重開、草稿與權限，不只掛元件 |
| 技師清單、搜尋／篩選／排序／停用 | `courses/staff-page.tsx` → `staff-workspace.tsx` → `staff-list.tsx` | 美業 `management-list.tsx` 仍另組技師表格 | 未完整接回；停用預設收合，搜尋及明確篩選可查回；不能刪資料 |
| 技師編輯：基本、服務設定、LINE／權限、服務明細、服務時間 | `courses/staff-workspace.tsx` 的完整編輯器 | `beauty/catalog-editor.tsx` 只共用 BasicFields／ServiceRow／Tabs；原視窗另組，缺服務明細 | 不能稱整頁共用；須接原編輯流程與完整分類。美業性別、拆帳與繼承店家時段保留 |
| 技師聯絡與更多資料 | 原教練有 phone/contactEmail/birthday/emergencyContact | BeautyTechnician 目前沒有獨立對應欄位 | 列資料缺口，不能放會被忽略的欄位；不得無聲改寫已連結會員的個資 |
| 人員帳號、角色／權限、新增／編輯／停用 | `dashboard/staff/page.tsx`、`staff-workspace.tsx`、`staff-account-editor.tsx`；運動課程人員另有 CourseStaffWorkspace | 美業走 StaffWorkspace，表格轉 CourseStaffList，漏接停用群組控制；帳號編輯仍為另一入口 | 整合最新帳號編輯保存結果；角色與技師業務分開。停用預設收合、恢復／搜尋保留 |
| 圖片公告 | `dashboard/image-announcements/page.tsx` | 美業直接導向同一路由 | 已共用入口；仍需開啟／新增／排序／修改權限及圖片呈現核對 |
| 設定中心分類與店家資料 | `courses/shared-hub.tsx`、`settings-workspace.tsx`、`settings-section-editor.tsx` | BeautySettingsWorkspace 使用中心，但 moduleContent 替換四類內頁；storeSavePath 只有 store | 不能稱整份沿用；需以原設定列／行內編輯及共用面板接美業資料，而非另寫完整內頁 |
| 營業／公休、預約開放、取消／未到與截止 | 原 self-booking、OperationSwitch、BookableUntil、Hours | 美業另用 BeautyCatalogEditor settings 的整份表單 | 接原列操作／展開／儲存，保留扣次可選與美業可預約間隔，不能帶課程請假規則 |
| 銀行、公開體驗表單與資格 | 共用 payment panel／trial panel | 銀行已共用；美業公開體驗每人每服務一次，LINE 未驗 | 接最新銀行面板；體驗條件保留、不把一般會員預約加回體驗類型 |
| 通知、顧客經營、提醒中心與發送紀錄 | 最新 `courses/reminders/*`、`reminders/*`、共用 SettingsPanel | 美業仍有替代設定列與自己的 reminders body；未納入最新 11 筆主線 | 核對最新分類、個別保存、收件人與面板關閉；LINE 仍保持關閉，不送訊息 |
| 系統方案／用量、推薦／數位管家 | 原 settings／growth 共用頁 | 部分連到同一路由，內頁需核對 | 逐入口檢查授權／唯讀與返回狀態，不新增替代 UI |
| 頂列現金抽屜、操作指南、預覽、異動通知 | dashboard-layout 與共用頁 | 現金抽屜／指南／預覽共用入口；異動通知實際模組授權需核 | 整合最新 layout；不直接呼叫 course-only action；真機／LINE 不冒稱通過 |
| 顧客前台：首頁、服務與時段／確認、預約／改期／取消 | 課程 portal 與 CoursePortalBrand／Navigation／Sheet／Calendar | BeautyPortal 已用共用前台容器，服務流程另接 BeautyBookingForm | 保留使用者已確認的人數／同行者／不指定技師／兩頁／健康開關／卡片簡化，逐動作檢查共用與資料接點 |
| 技師前台：今日、班表、服務紀錄、收入、角色切換 | 課程我的工作及共用 portal 元件 | BeautyPortal 的 work 分支；自己工作權限、只讀收入 | 核對角色撤權、待處理穩定、沒有多餘恢復按鈕，沿用共用操作但不帶老師課程出席規則 |

## 驗收規則

每列須分別記錄：共用來源／美業資料讀取／儲存動作／權限與跨店／草稿與關閉／桌機與平板／窄容器／業務結果。顧客與技師端另需手機尺寸。

- 程式使用、單元測試、瀏覽器本機測試、對外 Preview、真機、店家簽收分開記錄。
- 本輪未部署；既有測試站的前輪截圖／625 項測試不能作為這次接回完成證據。
- 前輪局部修改仍在工作區，包含停用群組及編輯框架；只算工作中，不能因建立共用外框就把技師整頁標為完成。
- 本輪先完成此來源核對，再整合最新 main，繼續接回。若 backend／資料結構不具備原功能，明列缺口並補合法接點，禁止隱藏功能冒稱完全沿用。

## 本輪已執行及仍未完成（2026-10-23）

### 已執行

1. 重新 fetch main，固定核對基準為 `7cb8c261`；13 個左側入口及其子操作的來源差異列於上表。此為來源盤點，非全站瀏覽器驗收。
2. 本機保存前輪 WIP `46ba18da`，將最新 main 合併到同一隔離支線 `9b8ea983`；7 處衝突逐項合併，保留最新保存結果／提醒載入／預覽保護及美業唯讀與通知範圍檢查。未推送。
3. 服務項目改用實際現行 `MusicSubjectCatalog` 元件，透過 status/order/save ports 接美業服務資料；保留服務時長與整理時間，價格仍經收費方式；原元件預設音樂／運動行為保留。
4. 修正新增收費方式把空類型當單次的錯誤；新表單直接呈現次數方案的完整欄位，名稱／次數／售價／天數仍空白待店家填寫，可切換單次／體驗。沿用原收費視窗寬度。這不表示所有運動方案模式都已接入。
5. 人員／技師清單的停用分組已補本機測試；音樂／運動與美業共享人員編輯框架的抽出仍只是局部工作，不算完整技師管理接回。
6. 整合最新通知收件人元件需新增的 storeId，保留美業可設定通知種類及母子店唯讀限制。

### 本機驗證

- `npm run generate:clients`：只重新產生本機 client，未連線查詢資料庫、未 migration。
- TypeScript：`npx tsc --noEmit` 通過。
- 指定修改檔案 ESLint 通過。
- 本機相關回歸：64 檔、534 項通過；含全部 beauty-* 測試及共用表單、草稿、設定、通知與提醒接點測試。選取清單保留於 `/tmp/beauty-latest-regression-files.txt`，輸出 `/tmp/beauty-latest-regression.log`。
- 另針對服務共用表單和新增收費方式加入實際元件操作測試，驗證使用美業 writer、不呼叫課程 endpoint，以及不需先切類型才看見次數欄位。
- 新 main 包含 LINE 額度相關 Prisma schema 變更，這些只是最新主線來源；本輪沒有把其 migration 套到任何資料庫，也沒有開啟 LINE。

### 不得寫成完成的範圍

- 最新來源核對已完成；**全站接回尚未完成**。表中其他「僅共用容器／部分欄位／資料缺口」仍是未完成，不得改成綠燈。
- 技師尚未直接使用完整 CourseStaffWorkspace 控制器；聯絡資料、更多資料、服務明細與工作／時段資料來源須接齊。
- 位置租借尚缺美業讀寫與雙向資源衝突接點；未先顯示能勾選卻無法完成租借的欄位。
- 設定仍有替代 sections；不能把已合併 main 當作設定內頁已全部接回。
- 首頁、營運、預約與顧客資料等來源盤點的差異仍需逐操作接回；不能只修使用者截圖指出的六頁。
- 無本輪 Preview／hosted／真機驗收結果；未 push、未部署、未開 PR、正式站與測試站資料未變動、LINE 關閉。
