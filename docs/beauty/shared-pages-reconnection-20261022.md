# 美業接回音樂／運動共用頁面

唯讀核對最新 main：`7184e76cfe95c4becbeaa2e4d998dd200f6b6e66`。本輪抽取的 `courses/roster.tsx` 與 `courses/staff-workspace.tsx` 在變更前和此 main 相同；沒有為此合併其他任務。

本輪基準：隔離支線 `preview/beauty-ui-alignment-20261021`、`834021c0`。這是測試支線盤點，不是最新 main 的正式功能盤點。使用者已否決以重新設計的美業內頁逐批仿製運動頁面的作法；先前第一批測試通過，不能當成店家接受版型。

## 執行準則

- 直接使用現有頁面元件；現有元件混合查詢／寫入時，從原元件抽出原本的內頁內容，讓原模組與美業共同使用同一份來源，不能複製一份再各自維護。
- 不以 DataTable、RightSheet、側欄、共用 CSS 或首頁面板相同，就宣告整個內頁已共用。
- 查詢與寫入由模組接點提供；不能把美業資料 ID 送進運動的資料表操作。這是接線工作，不是另畫版型的理由。
- 美業單次與多次方案都保留；多次方案共用保留／扣次／取消回復／帳本的操作能力。資料目前分開不代表功能不能共用，也不授權搬移或刪除帳本。
- 不新增美業設計稿、不增加新操作步驟；原本已核定的服務、技師、空間、完整時長、選填整理時間與方案規則持續有效。
- LINE 關閉；正式站、正式資料與其他任務支線不變。

## 逐頁來源與接回清單

下列「待接回」是實際未完成的工作，不是功能不能共用。

| 功能 | 現有音樂／運動來源 | 盤點結果與本輪狀態 | 必要接點／差異 |
| --- | --- | --- | --- |
| 首頁 | `src/app/(dashboard)/dashboard/courses/home.tsx` | **待接回**：`src/components/beauty/home.tsx` 只共用 ModuleHomePanel，內容另外組裝，不能算共用首頁。 | 今日課程／點名換成服務人次／完成服務；收退款與關懷改讀美業資料，沿用原首頁操作與排列。 |
| 班表 | `courses/course-schedule-board.tsx`、`courses/workspace.tsx` | **部分共用**：`beauty/schedule-workspace.tsx` 已使用 CourseScheduleBoard、CourseScheduleToolbar、ScheduleMonthGrid；工具列狀態與月表仍另組。 | 每位顧客服務時長可能不同，空間和技師須同時可用；整理時間只占資源，不延長顧客顯示的服務時間。不能套用團課共用名額。 |
| 預約名單 | `courses/roster.tsx`、`courses/sports-roster.module.css` | **本輪已接線、待 hosted 核對**：從原運動名單抽出 `courses/roster-list.tsx`，原 CourseRoster 與 BeautyDashboard 使用同一份內頁；移除原美業 DataTable 名單與自製預約卡片。從班表開啟時列出同筆預約的服務分項。 | 顧客、電話、狀態、次數／金額、備註、操作使用原名單內容；美業提供實際服務時間、技師／位置、方案可用次數與交易回呼。方案可用為扣除保留後的目前可用數，不能稱為完成服務後預估餘額。 |
| 顧客管理 | `courses/customer-list.tsx`、`courses/member-workspace.tsx`、`courses/course-profile-forms.tsx` | **清單共用、詳情待接回**：顧客清單已是 CourseCustomerList；`beauty/customer-panel.tsx` 仍獨立，不能算完整接回。 | 同一份顧客、方案、帳本與異動介面；顧客欄位共用，方案／服務歷史讀美業資料，保留跨店與個資權限。 |
| 顧客經營 | `dashboard/growth/_components/care-workspace-server.tsx`、`care-workspace.tsx` | **核心共用、入口待清理**：BeautyCare 已使用 CareWorkspaceServer，外層分類與生日月份另外組裝。 | 出席改為實際完成服務，低次數／到期取美業方案；分類、追蹤與聯絡操作仍用既有工作台。 |
| 營運／收退款 | 現有課程收款、購買方案與退款視窗；`courses/customer-purchases.tsx` | **待接回**：BeautyDashboard 內的收款／退款表單仍另寫。 | 操作與明細共用；單次消費與方案購買是不同交易來源，退款、修訂與授權由美業接點驗證，不能直接呼叫 CoursePointCard 寫入。 |
| 營運／技師拆帳 | `dashboard/revenue/_components/course-fees.tsx`、既有授課費報表 | **待接回**：`beauty/fee-summary.tsx` 為自製彙總／明細。 | 只提供拆帳明細，店家自行付款；不帶入付款／收回操作。實際服務技師、固定金額／百分比與店家所選基準為資料差異，無須另做頁面。 |
| 分析 | `courses/business-analytics-view.tsx`、`src/lib/course-business-analytics.ts` | **待接回**：BeautyAnalyticsWorkspace 為另外寫的分析，不能算共用。 | 同一份指標呈現、期間／比較與明細；服務完成、體驗、正淨額購買／退款資料接入共用計算。未付費開卡不能直接當成新購方案。 |
| 位置管理 | `courses/workspace.tsx` 的 rooms 內頁 | **待接回**：BeautyManagementList 仍另寫。 | 沿用既有空間，不新增床位表；美業不需要的租借欄位由同一元件控制顯示，不另造空間清單。 |
| 服務項目 | `courses/workspace.tsx` 的 catalog 內頁 | **待接回**：BeautyManagementList／BeautyCatalogEditor 仍另寫。 | 原服務／課程設定的清單與編輯操作共用；美業用服務時長、選填整理時間及可服務技師，移除團課班別／容量專屬欄位；金額放收費方式。 |
| 收費方式與方案 | `courses/member-workspace.tsx`、`courses/course-profile-forms.tsx` 的 CoursePlanDraftForm | **待接回**：BeautyChargesList／BeautyCatalogEditor 仍另寫。 | 使用既有方案清單／編輯、次數、期限、服務適用範圍、家人共用；單次／體驗價格一起管理。不得預設店家的方案次數與售價；運動固定課、補課券與音樂期課規則不自動套入。 |
| 技師管理 | `courses/staff-page.tsx`、`courses/staff-workspace.tsx` 的 CourseStaffWorkspace | **待接回**：BeautyManagementList／BeautyCatalogEditor 仍另寫，既有 CourseStaffWorkspace 是接回來源；其讀寫直接依賴 Staff／課程資格，需抽取資料與動作接點後接入美業技師，不能只改標題或繞過 requireCourseStore。 | 技師與後台人員分開；預設承接店家開放時段，可覆寫每人服務時間，資格／服務、性別必填、拆帳與我的工作權限保留；不能把後台帳號當技師記錄。 |
| 人員管理 | `courses/staff-workspace.tsx`、抽出的 `courses/staff-list.tsx` | **名單內容已共用、帳號編輯器待接回**：移除 BeautyStaffList；原音樂／運動 CourseStaffWorkspace 與美業帳號清單使用同一份 CourseStaffList。美業角色／狀態篩選與 StaffAccountEditor 仍在原 StaffWorkspace，不能宣告整頁已共用。 | 沿用 staff.view／staff.manage 與既有階層；Beauty 可指派權限仍由 staff/page.tsx 的 BEAUTY_PERMISSIONS 篩選，沒有擴大可授權範圍。 |
| 圖片公告 | 既有共用公告頁面 | **既有共用入口**，本輪未另寫。 | 仍須在最終全頁驗收核對美業進入路徑與店別；不能用「入口共用」替代全部上傳／發布實測。 |
| 設定 | `courses/settings-workspace.tsx`、`settings-section-editor.tsx`、共用銀行／營業時間設定頁 | **部分共用、整頁待接回**：BeautyStoreSettings 已用 CourseSettingsSectionEditor，銀行／營業時間已有共用入口；BeautyDashboard 的分類／預約設定仍另組。 | 沿用門市設定欄位、開放時段、銀行、公告與功能開關；美業預約間隔、取消／未到扣次與 LINE 關閉條件由業務接點處理，不帶入候補／固定課專屬規則。 |

除明列完整路徑外，`courses/` 均指 `src/app/(dashboard)/dashboard/courses/`，`beauty/` 指 `src/components/beauty/`。技師管理與授課費已有對應來源，但仍需抽取讀寫接點；不將只有 CSS 或帳號表單存在當成完整頁面可用。

## 三端範圍與禁止重做

- 店長端依上表接回；完成條件是同一份元件來源、正確資料、正確操作與權限，不只是視覺相似。
- 顧客與技師前台保留使用者已接受的簡化流程。本輪未改其介面或操作；後續若抽共用內容，也必須保留已核定的兩頁預約、不指定／指定技師、同行分項與技師操作授權，不重新設計。
- 拆帳付款由店家自行處理、LINE 關閉、健康開關、服務價格歸收費方式等既有決定不因共用而恢復被否決的功能。

## 本輪驗證

- 原運動／音樂名單、點名回饋、備註、人員已確認儲存與頁面權限與人員狀態更新相關共 12 檔、155 項測試通過；TypeScript、變更檔 ESLint 與 diff check 通過。
- 新增美業名單整合測試驗同組分項、不同結束時間、方案欄位、交易先確認、只讀不顯示交易操作；這是隔離元件驗證，不代表 hosted 實測或正式啟用。
- 正式資料結構／資料未操作。其餘頁面仍按表標待接回，沒有宣告美業後台整站完成。

## 部署與待驗邊界

- 應用程式版本：`a120536017610874cd9dd2665a61ce02af1e590f`。
- Vercel Preview：`dpl_657hEBFPdbZ2hES3ZXuma45VC5Rt`，READY，target 為 Preview。
- URL： https://steamfoot-booking-mnen88c0n-rock7652-2111s-projects.vercel.app
- 本輪 hosted 瀏覽器驗證停在 Vercel 存取層，尚未登入應用程式；未產生本輪桌機／iPad 畫面通過證據，也未實測帳本交易。不能以先前部署的截圖或測試結果充當本版本驗收。
- 既有存取連結不適用這個新部署；建立新暫時驗證連結遭自動核准審查拒絕，理由是增加可分享的存取權限。沒有改用同樣會建立繞過連結的 web-fetch 工具，也沒有關閉 Deployment Protection。
- 執行環境未找到可用的既有 Vercel CLI／短效 OIDC 憑證，亦沒有連線瀏覽器工具；需取得本部署的明確測試存取授權，才能補驗真實登入及尺寸。不得要求使用者提供長效 Token。
- 這次沒有操作正式站、資料結構、帳本或 LINE 設定；LINE 維持關閉。

## 下一步

先接回位置／服務／收費方式及方案編輯的既有元件，再處理顧客詳情、技師與人員編輯、設定／分析；完成共同來源核對後才交店家驗收，避免再要求店家逐頁糾正另寫介面。上述是未完成工作，不因名單已接回而宣告整站完成。

## 本輪四個管理入口更新

位置、服務項目、收費方式及方案編輯已接回原工作台／原表單，詳見 [四個入口的來源、必要差異及驗證限制](catalog-shared-reconnection-20261022.md)。上表先前「待接回」是前輪盤點歷史；以這份續篇記錄本輪狀態，不把其他頁面一起宣告完成。
