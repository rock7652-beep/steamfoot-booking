# 日常工作：最新版運動原頁面接回核對

> 此表為開始實作前的來源差異。後續已開始程式接回，最新進度與未完成項目見 [本機執行紀錄](native-daily-reuse-execution-20261023.md)；全站尚未完成，未部署。

本次核對來源為 `origin/main` 的 `7cb8c261`；隔離支線目前為 `350db47e`。這是來源核對，**不是接回完成或瀏覽器驗收報告**。沒有因本文件推送、部署、升級資料庫或修改既有資料。

使用者要求：日常工作整組沿用最新版運動教室的實際頁面、內頁與操作控制器，美業只提供核心資料與動作接點。不得再以共用外框、相似畫面或少數欄位代替整頁接回。

| 入口 | 最新運動實際來源 | 目前美業實際接法 | 尚須接回 |
| --- | --- | --- | --- |
| 首頁 | `courses/home.tsx` 的 `CourseHome`、獨立區塊載入／重試、摘要、待辦、歸屬顧客與關懷入口 | `beauty/home.tsx` 自有排列，只使用 `ModuleHomePanel` | 從原首頁抽出完整共用呈現與讀取介面；接美業權威摘要、權限與正確範圍，不能將已載入的某個月份清單當全店總數 |
| 班表 | `courses/workspace.tsx` 的 `CourseWorkspace`，包含原日／週／月狀態、篩選、載入與視窗控制 | `beauty/schedule-workspace.tsx` 自有工具列、月格、讀取控制；`CourseScheduleBoard` 走 `serviceMode`，未使用 `sportsNative` 原工作台 | 原工作台增加明確美業讀寫 ports，直接使用同一控制器；保留床位、技師與整理占用的核心檢查 |
| 排課／預約清單（班表內頁） | `SportsScheduleFields` 與 `CourseRoster` 的完整表單／名單控制器 | `BeautyBookingForm` 與 `BeautyDashboard` 自有控制器；名單只使用 `CourseRosterList` 列呈現 | 接原新增、查詢、名單篩選、選取、狀態操作與關閉保留；美業動作必須呼叫其交易核心，不得落回 Course actions |
| 顧客管理 | `CourseMemberWorkspace`、`CourseCustomerList`、原詳情／歸屬設定／紀錄／方案操作 | 清單共用；`BeautyCustomerPanel` 另外組詳情與紀錄；未傳入店長指派權限與候選人 | 接完整顧客工作台；所屬店長、推薦人、批次指派、有效／歷史方案、紀錄與帳本操作逐項驗證；共用清單目前批次 action 固定為課程，須先提供合法核心 port |
| 顧客經營 | `growth/page.tsx` → `CourseCare` → `CareFilters`／`CareWorkspaceServer` | 已直接使用共用篩選與工作台，分群透過 `BeautyCare` 讀取美業資料 | 保留真正共用部分；核對完整分群、店長範圍、月份、關懷紀錄、預約及期間消耗入口，不重寫另一份工作台 |
| 營運 | `CourseSharedHub` 導向 `/dashboard/revenue`；實際 `CourseRevenue`、交易操作與原明細視窗 | 共用 `RevenueTabs`；交易表格及收退款面板仍在 `BeautyDashboard`，拆帳另有 `BeautyFeeSummary` | 接實際營運清單、篩選、分頁、明細及操作介面；收退款、核帳及方案帳本使用美業核心；依已確認要求，技師拆帳僅提供明細，不新增登錄付款 |
| 分析 | `CourseAnalyticsPage`／`BusinessAnalyticsView`／`getCourseBusinessAnalytics` 與 `summarizeCourseBusiness` | 共用 View，但美業自行算報表；View 明確隱藏美業 manager，伺服器也只接受 store／coach | 接完整店家／所屬店長／技師視角與原共用統計核心；服務依目前顧客歸屬，成交須有購買時快照，不能用收款人或現在歸屬回填歷史成交 |

## 必須分開處理的核心接點

- 原 `SportsScheduleFields` 直接呼叫 `sportsStagingCommand`；原 `CourseRoster` 直接讀取／異動課程名單。單純換 import 會進入錯誤模組的授權與帳本，因此須在**原控制器**加入 typed ports，預設保留運動行為，美業提供必要實作。不得用另一套美業畫面替代。
- 固定／隔週排課、開放選課、候補、補課等原運動操作，須逐項核對美業核心是否具備對應資料與交易。未具備的項目明列功能差異；不能顯示無法儲存的控制，也不能把缺功能寫成已完全沿用。
- 美業多人不同服務、實際服務時長、整理時間、床位／技師衝突、方案保留／完成扣次及退款，都保留核心檢查。共享操作與資料交易分開，不直接對 Course 方案扣堂。
- 已驗收的顧客／技師前台不在這次後台替換範圍；後台使用的舊 `BeautyBookingForm` 和顧客端共用，替換後台入口時不得破壞前台兩頁預約流程。

## 完成門檻

每一入口均需記錄：實際原頁面與控制器、資料讀取 port、各寫入 port、權限／跨店、儲存重開、失敗保留草稿、桌機／平板畫面與真實業務結果。只有欄位、表格列或外框共用的入口，一律仍標未完整接回。

六個入口與內頁全部接齊並通過後，才更新完整隔離測試站。LINE 保持關閉，正式站與既有資料不動，不部署局部版本。
