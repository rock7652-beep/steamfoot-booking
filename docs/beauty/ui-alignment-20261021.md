# 美業三端內頁沿用運動模組：修正紀錄

使用者驗收指出舊 Preview 只有外殼一致，內頁及操作不符預期。舊功能測試結果保留，但不作為內頁一致性或店家簽收證據。本輪原則是直接使用既有元件，僅由美業資料與後端操作提供必要業務差異。

隔離支線：`preview/beauty-ui-alignment-20261021`；來源為乾淨美業候選 `7388abd6`。正式站、LINE、既有資料與交易寫入規則不變；不執行 SQL migration。

| 入口 | 直接沿用的來源 | 美業必要差異 |
|---|---|---|
| 首頁 | 運動首頁抽出的 `ModuleHomePanel`，運動首頁同時改用它 | 今日服務、收退款、待完成服務與方案提醒，不使用課程點名統計 |
| 班表 | `CourseScheduleBoard`、`CourseScheduleToolbar`，月表共用 `ScheduleMonthGrid` | 服務分項映射至技師／位置，完整佔用時長含整理；移除滿班／團課／點名篩選 |
| 預約名單與明細 | `DataTable`、`RosterToolbar`、`RosterMoreMenu`、`RightSheet` | 同組分項、部分改期、取消與合併收款仍呼叫既有美業 actions |
| 顧客管理 | **直接使用 `CourseCustomerList`**／`CustomersTable`；增加可選 basePath 與次數單位，原預設不變 | 傳入美業可用次數與美業顧客明細，不借用運動方案帳本 |
| 顧客經營 | `CareWorkspaceServer`、`CareWorkspace`、`CareSection`、原有追蹤紀錄與操作 | 生日共用顧客資料；最近服務、體驗、方案到期與次數以美業預約／卡片計算，新增美業下一次預約讀取分支 |
| 營運 | 直接使用 `RevenueTabs`、`DataTable`；現金入口共用 | 美業核帳、服務分項收退款與技師月結保留各自帳本及既有 actions |
| 分析 | 運動分析抽出的 `BusinessMetric`、共用 `DataTable` | 服務人次、完成狀態、實際收退款及有效方案；不填造課程開卡率或點名資料 |
| 位置／服務／收費／技師管理 | 共用 `DataTable`、`RosterToolbar`、排序／狀態／搜尋／分頁；同一 `fitness-management-editor` 與 footer 控制 | 位置沿用 CourseRoom，服務時長與整理、次數方案、技師性別及服務／時間／拆帳／工作權限 |
| 人員管理、圖片公告 | 原有完整共用頁面，保留既有 sidebar；tab 深連結直接轉至對應頁 | 不新增美業版本或另做帳號權限模型 |
| 設定 | `SettingsWorkspaceFrame`／`SettingsWorkspaceNav`／`SettingsListRow` | 沿用營業時間、銀行與 LINE 設定；預約、取消扣次仍為美業規則 |
| 顧客端 | 運動前台原 CSS、抽出的同一 `CoursePortalBrand`／`CoursePortalNavigation`／`CoursePortalCalendar` | 首頁、服務預約、本人預約、次數方案與帳戶；多人人數、不同服務、性別及自動分配保留 |
| 技師端 | 同一手機前台、身分切換、班表月曆與帳戶操作 | 僅本人安排、原授權範圍與已確認美業拆帳；不接運動點名 action |
| 公開體驗 | 同一前台外框與樣式 | 多人分項、服務與性別必選；LINE 真實登入仍待申請完成 |

美業表單繼續使用原本驗證、版本、request key、店家範圍與交易鎖；本輪不修改預約、扣次、取消、拆帳及退款寫入服務。新增查詢只為提供正確的畫面、營業時段、顧客欄位與關懷資料。

驗收必須包含真實登入、首頁與內頁對照、日／週／月班表、顧客清單及明細、方案與技師編輯、設定分類、手機會員／我的工作，以及預約→服務完成→帳本回讀。後台至少 1366×900、1024×768、768×1024；前台 360／390 寬。另檢查共用元件在原運動／音樂入口、資料較多時的搜尋與分頁。瀏覽器尺寸不等於實體裝置或店家簽收。

目前為修正與驗證進行中；最終結果、部署版本、證據及未驗範圍將在完成後補入。
