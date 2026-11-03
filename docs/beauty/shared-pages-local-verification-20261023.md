# 美業共用頁面接回：本機驗證（2026-10-23）

> 後續補驗：本頁保留前批結果；當時列出的後台通知缺口已由 [通知與交易完整對照](backend-notices-and-transactions-verification-20261023.md) 補齊。遠端部署狀態仍未改變。

本輪在 `preview/beauty-ui-alignment-20261021` 接續已合併的主線 `7cb8c261`。未推送、未部署；對外測試站仍為原版。LINE 全域維持關閉。既有測試庫、正式庫、真實帳號與資料均未更動。

驗證另建 `steamfoot-beauty-shared-pages-20261023` PostgreSQL 容器及 `beauty_shared_pages_qa` 合成庫，限定 loopback。僅此新庫安裝 schema／候選 SQL 並建立合成帳號、預約、租借、方案及設定。這是本機真實登入及交易驗證，並非 hosted、獨立雙角色、實體手機／平板或店家簽收。

## 本輪接回與結果

| 操作 | 共用來源／美業接點 | 本輪結果 |
|---|---|---|
| 技師清單、聯絡方式、操作及停用分組 | 實際 `CourseStaffList`、`RosterMoreMenu`；BeautyTechnician 資料 | 實際開啟、停用預設收合、可展開；搜尋包含電話／Email |
| 技師完整分類 | `CourseStaffEditorFrame`、`CourseStaffEditorTabs` | 基本資料／服務設定／LINE 與權限／服務明細／服務時間均開啟檢查；固定視窗與原分類排列 |
| 技師基本／更多資料 | 實際 `CourseStaffBasicFields`、`CourseStaffPersonalFields`；獨立技師聯絡欄位 | 電話、Email、緊急聯絡人實際保存重開；不改寫連結會員個資。回傳保存 revision，可連續保存 |
| 技師服務安排 | 實際 `CourseStaffAssignments` 表格、日期／分頁／服務明細連結 | 接全部尚未結束的服務，而非只讀當天；僅在技師頁查詢，其他頁不多載入全部未來安排 |
| 技師服務資格、計酬、工作權限、可服務時間 | 保留美業資料 adapter；使用原 ServiceRow／共用編輯框架 | 保留店家時段繼承、每位技師自訂及日期例外；欄位送出、既有預約保護、權限以回歸測試驗證。未把美業技師寫成課程 Staff |
| 位置完整編輯與出租欄位 | 原 `CourseWorkspace`、`RoomMore`、`SpaceRentalFields`；同一 CourseRoom | 出租開關、費率、整理時間、容量讀寫接回；費率實際保存重開。修正共用表單布林值被誤當未勾選的 adapter 錯誤 |
| 位置出租狀態清單／歷史 | 原位置表格、原 `RentalHistory` | 清單顯示容量、是否開放及費率；歷史入口可用，取消紀錄保留。依顧客／預約編輯權限顯示操作 |
| 新增／檢視／取消租借 | 原 `RentalPanel` 與原 course-rental 業務服務，注入 Beauty 授權 | 真實表單建立、讀回明細、取消、歷史紀錄與時段釋出通過。原課程呼叫預設不變；未知模組拒絕執行 |
| 租借與美業服務雙向撞期 | 同店 Store 鎖；原租借服務加 BeautyAppointment 查核；Beauty 分配器加租借占用 | 真實 UI 正反向均拒絕重疊；服務完整時長及整理時間均納入。SQL 測試另驗跨台北午夜與精確結束邊界 |
| 月表統計 | 原月表容器＋Beauty group／分項計算 | 分開顯示預約筆數、人次、租借筆數；租借不混入服務人次。實際月表 1 筆預約／1 人次／1 筆租借核對通過 |
| 服務項目 | 原現行 `MusicSubjectCatalog` 表單／清單＋Beauty save/status/order ports | 實際修改服務時長、重開、再次修改保存通過；保留整理時間，金額仍從收費方式設定。保存回條帶快照，避免立即重開沿用舊 revision |
| 收費方式 | 原 `CourseMemberWorkspace`、`CoursePlanForm`＋Beauty 方案接點 | 原新增完整次數方案表單；實際新增 7 次／6300 元／120 天／指定服務，再重開核對通過。單次／體驗仍保留 |
| 設定中心及行內編輯 | 原 `CourseSettingsWorkspace`、`CourseSettingsRow`、`CourseSettingsSectionEditor` | 五分類開啟核對；店家、截止與銀行接美業保存端點及 section revision 保護 |
| 自行預約與預約開放期限 | 原 `CourseSelfBookingSettings`、`BookableUntilForm`、`OperationSettingSwitch` | 開放天數實際保存重開；保留美業 1–365 天，原課程最多 90 天不變；保存重試不重複修改 |
| 銀行資訊 | 原行內銀行表單＋Beauty payment section endpoint | 真實保存重開核對帳號完整值、摘要末四碼通過；跨店及低權限拒絕 |
| 營業／公休、提醒、LINE 設定視窗 | 既有共同頁面及 `SettingsPanel` | 三個設定視窗實際開啟核對。提醒仍明示 LINE 關閉；未進行綁定或發送 |
| 人員管理與編輯 | 原 `/dashboard/staff` 及共用帳號編輯器 | 真實登入開啟清單與人員編輯，基本／帳號權限分類存在；本輪未調整合成以外的帳號 |
| 其他左列頁面 | 首頁、班表、顧客管理、顧客經營、營運、分析、圖片公告 | 13 個左列入口逐頁開啟與截圖；不能將「能開啟」寫成所有子操作及全部帳本流程通過 |

## 權限、保存與共用頁面核對

- 本機 Owner 對別店設定寫入拒絕；低權限帳號設定寫入拒絕、無技師新增入口；別店頁面拒絕存取（RSC 錯誤頁可能仍是 HTTP 200，已檢查實際內容）。
- 原 Course 租借預設授權、交易、收款、沖銷測試仍通過；Beauty 走自身模組與權限檢查，不把店家偽裝成 Course。
- 技師保存與租借沿用同店 Store 鎖，拒絕模組／狀態已變更。位置停用或關閉出租前，須處理未結束預約與租借。
- 設定只更新選定欄位或區段，避免以舊整份設定覆蓋別人的變更。表單 revision 與跨店 guard 已補測。
- 保存後清單更新期間鎖住重開入口，避免點擊無反應。保存回條用於重開／再次保存。
- 共用個資欄位在音樂／運動原編輯器也使用同一元件；原預設課程行為、設定工作台、草稿、狀態更新及租借回歸一併核對。

## 版面檢查

1366×900 逐頁檢查；1920×1080、1024×768、768×1024 檢查位置、服務、收費、技師、設定及技師視窗。上述頁面沒有整頁橫向溢出；技師視窗均在 viewport 內。這些是 Chromium 模擬尺寸，非實體裝置簽收。

| 畫面 | 本輪截圖 |
|---|---|
| 技師完整基本資料 | [桌機](evidence/20261023-shared-pages/technician-basic.png) |
| 技師五分類 | [服務](evidence/20261023-shared-pages/technician-services.png)／[LINE 與權限](evidence/20261023-shared-pages/technician-work.png)／[明細](evidence/20261023-shared-pages/technician-assignments.png)／[時間](evidence/20261023-shared-pages/technician-time.png) |
| 平板視窗 | [橫向](evidence/20261023-shared-pages/technician-tablet-landscape.png)／[直向](evidence/20261023-shared-pages/technician-tablet-portrait.png) |
| 位置出租 | [原編輯表單](evidence/20261023-shared-pages/location-rental-editor.png)／[租借回條](evidence/20261023-shared-pages/shared-rental-receipt.png) |
| 撞期與月表 | [衝突拒絕](evidence/20261023-shared-pages/rental-service-conflict.png)／[分開計數](evidence/20261023-shared-pages/month-counts.png) |
| 方案 | [原新增表單](evidence/20261023-shared-pages/shared-plan-form.png)／[保存重開](evidence/20261023-shared-pages/plan-saved-reopen.png) |
| 設定 | [營業與預約](evidence/20261023-shared-pages/shared-booking-settings.png)／[通知](evidence/20261023-shared-pages/shared-notification-settings.png) |

## 候選資料升級（未套用既有環境）

- `beauty-shared-technician-profile-candidate.sql`：技師獨立電話、Email、生日與緊急聯絡人；不改 User／Customer。
- `beauty-shared-booking-window-candidate.sql`：固定預約截止日期，既有 rolling 設定保留。
- `beauty-shared-rental-access-candidate.sql`：專用 Beauty 角色只新增讀取 CourseRental 權限供日曆與撞期使用；不新增角色，租借寫入仍使用既有共用租借 client。必須顯式指定角色，缺少設定拒絕執行。
- 三者在全新合成庫及 PGlite 驗證；不是既有 `steamfoot-preview` 已完成升級的證明。

## 明確保留的差異／尚未完成

1. **不是「全站完全沿用」完成宣告。** 技師已共用實際清單、編輯框架、基本／更多資料、服務列與安排表；BeautyCatalogEditor 仍負責美業資格、拆帳、時段、工作權限與保存協調，並非直接使用整份 CourseStaffWorkspace 控制器。
2. **後台異動通知仍缺美業事件接點。** 目前通知分類使用共用設定列，Beauty 服務通知仍接 BeautyEvent。它不等於 CourseStoreNotice 的鈴鐺、待處理／已處理及對應明細；不可用「服務通知」冒稱已接回這項功能。
3. 首頁摘要、預約／收款／方案帳本及顧客詳情仍有美業資料與業務 adapter。已有共用容器、清單及表單，但本輪未重做全部收退款、跨月帳本、多人改期／部分取消端到端驗收；不可因頁面可開就標記全部完成。
4. 本輪不部署，因此對外測試站尚看不到這批修改。既有環境的候選升級、hosted 登入、真機及店家簽收未完成；LINE 真實登入／綁定／送達仍待申請完成後另驗。

## 驗證記錄

本輪相關回歸涵蓋全部既有 Beauty 測試、共用方案／草稿／設定／通知、原租借服務與新增接點測試。最終測試數與 TypeScript／ESLint 結果另於本文件末記錄。可重現腳本與原始輸出位於本機 `/tmp/beauty-shared-pages-*`；登入狀態及本機 DB 憑證未放入版本庫。

最終檢查：71 個測試檔、584 項通過；TypeScript `tsc --noEmit` 通過；本輪修改檔案 ESLint 通過；`git diff --check` 通過。另保留 [合成本機操作結果](evidence/20261023-shared-pages/local-results.json)。
