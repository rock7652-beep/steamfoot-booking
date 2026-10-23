# 美業完整隔離測試站：更新與登入驗收（2026-10-23）

完整版本已部署並完成本輪登入後驗收。部署來源 `eca98f9c350b3b5543f0e398ac9f96922f0f079d`，`dpl_2UafSoWZhV4Jr1xSWGjyZsRC5APH`，READY／Preview（target=null），建置約 2 分 50 秒。沿用既有支線 `preview/beauty-ui-alignment-20261021`，沒有另建美業介面、合併 main、部署正式站或指派正式網域。

- [店長後台](https://steamfoot-booking-f9neyz1l8-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/admin/dashboard/beauty)
- [顧客／技師登入](https://steamfoot-booking-f9neyz1l8-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/)，技師登入後切「我的工作」。沿用原測試帳號。
- Vercel 原有存取保護保留。驗收存取連結／cookie、帳號密碼、session state 均未放入文件或版本庫。

## 資料庫與部署範圍

唯一目標是既有 Supabase `steamfoot-preview`（`ttworfzgwejdeolegkxl`），店別 `beauty-hosted-20261021`。先確認 legacy 連線與既有角色，沒有新建資料庫角色、改連線、放寬瀏覽器權限或修改 RLS。建置紀錄確認 `isolated_database=true migrations_skipped=true notifications_blocked=true`；必要升級經獨立 migration 接點執行，沒有讓建置批次套用主線其他 migration。

| Migration | 實際必要變更 | 結果 |
|---|---|---|
| `20261023051107 beauty_shared_pages_additive_20261023` | 技師獨立聯絡／緊急資料 6 欄、固定預約截止日、後台通知開關 | 加法升級；沒有覆寫顧客或連結會員資料 |
| `20261023052416 beauty_shared_notice_outcomes_20261023` | 共用通知表允許 `beauty:` 分項的 COMPLETE／NO_SHOW | 保留原六種課程事件；額外事件只接受美業 namespace，沒有改寫舊通知 |

升級前後原技師 5、設定 1、預約 19、方案卡 2、帳本 18、付款 14 筆一致。驗收新增資料以 `QA全站1023` 標示；排除這批新資料後原筆數仍一致。沒有刪除既有資料；此核對不是逐欄內容雜湊證明。整表雜湊查詢曾被自動核准審查拒絕，已依其建議改用 schema／筆數核對及只讀回本輪新 QA 交易。

## 共用操作與實測對照

| 操作 | 音樂／運動共用來源 | 美業必要接點／差異 | Hosted 實測 |
|---|---|---|---|
| 後台全部入口 | 既有 Dashboard 與各共用 workspace | 保留美業服務資料 adapter | 最終版登入後逐頁開啟班表、顧客管理、顧客經營、營運、分析、位置、服務、收費、技師、設定、人員，共 11 個入口通過；不把分析頁「可開啟」稱為所有報表公式完整對帳 |
| 技師內頁 | 原 `CourseStaffList`、編輯框架、基本／更多資料、安排表及五分類 | 服務資格、拆帳、工作權限、每位技師時段使用美業保存端點 | 新 QA 技師電話／Email 保存重開；五分類可用；桌面及平板檢查通過。此流程在首版 5079ac2c 執行，最終版沒有修改技師程式 |
| 服務項目 | 原 `MusicSubjectCatalog` 表單、表格、操作 | 服務時長／整理時間接美業；服務表單不設售價 | 最終版新增 QA 服務 45 分鐘／整理 10 分鐘，保存重開一致 |
| 收費方式／方案 | 原 `CourseMemberWorkspace`、`CoursePlanForm` | 單次／體驗價仍由收費方式管理；次數方案接 BeautyPlan | 新 QA 七次方案 6300 元／120 天／指定服務，保存重開通過；沒有改原五次方案 |
| 位置租借 | 原 `CourseWorkspace`、租借欄位 | 同一 CourseRoom；美業床位容量留空預設 1，編輯留空沿用原值 | 最終版在容量留空下建立 QA 出租床位；租金 360、前後各留 15 分鐘，保存重開一致。本輪未再次建立租借交易；既有租借建立／取消及雙向撞期證據見前批本機報告 |
| 顧客詳情 | 原概況、資料表單、紀錄分頁 | 美業卡片與服務帳本經 adapter 提供 | 新 QA 顧客 Email／地址保存重開；完成後顯示可用 4 次，退款後最終版讀回已結清 |
| 人員管理 | 原人員編輯頁及原儲存端點 | 不另建美業人員表單 | 新建 QA 人員、保存權限，收斂為五項讀取；重新登入；原編輯頁 1366／1024／768 尺寸通過 |
| 設定／通知開關 | 原設定中心、行內表單與開關 | 後台異動通知獨立於 LINE | 最終版關閉、保存重開、再恢復後台通知；LINE 全程 false。預約開放期限另實際變更、保存重開後還原原天數 |
| 通知待處理／已處理 | 實際 `StoreNoticeBell` 與 `CourseStoreNotice` | `beauty:` subject；處理通知不修改預約狀態 | 改期→待處理→標記已處理→復原→開啟目前預約明細；最終版再驗導向成功 |
| 預約／改期 | 原 `CourseRosterList`、更多選單、置中明細 | 美業依技師、位置、服務時長及整理時間分配 | 新 QA 方案預約成功，改期後跟隨新日期；沒有修改原 19 筆預約 |
| 方案扣次帳本 | 共用保留、完成扣次、更正補次操作概念 | 保留 BeautyCard／BeautyLedger 既有資料；不改寫成課程帳本 | 5 次→預約保留 1→完成剩 4→更正剩 5／保留 1→取消剩 5／保留 0→退款關卡剩 0；帳本 +5、0、-1、+1、-5，合計 0 |
| 收款／退款 | 原交易明細與退款操作習慣 | BeautyPayment 同交易對接 CashbookEntry；不是銀行自動退刷，也沒有技師逐筆付款要求 | 新方案收／退 4500；新單次收 1000、退 400、超退 700 被拒、再退 600。5 筆帳務逐筆對應現金帳本，淨額 0 |
| 低權限與跨店 | 原伺服器授權與門市範圍 | 不只隱藏按鈕 | 最終版低權限直接送出顧客變更、跨店顧客讀／寫、跨店人員編輯均遭拒；通知處理按鈕禁用。沒有改外店資料 |
| 顧客／技師前台 | 保留已確認的前台流程 | 不重做既有兩端畫面 | 最終版兩端真實登入、390×844 與 768×1024 無整頁水平溢出，沒有 pageerror；不是實體裝置簽收 |

交易完整流程先在 5079ac2c 的 hosted 版本執行，補通知 constraint 後通過。最終應用修正僅涉及位置容量 adapter；其餘交易程式未變。最終 eca98f9c 已重驗 11 入口、通知明細、結清方案、位置／服務保存、設定、人員版面、兩端登入、低權限及跨店。

## 本輪抓到並修正

1. 舊通知 CHECK constraint 拒絕「完成服務」，整筆交易正確回滾；補美業限定事件後，用同一筆 QA 預約重驗扣次、更正及取消成功。
2. 共用位置表單的選填容量空字串被美業 adapter 當成 0；修成新增預設 1／編輯沿用原容量，沒有另畫表單。最終 hosted 留空建立並重開通過。
3. 驗收腳本修正通知 DOM 選擇器、收據備註定位及 Next.js 路由公告的計數；這些不是應用程式修正。原低權限 QA 帳號已停用，沒有重新啟用，另建本輪帳號完成驗收。

## 證據與限制

- [最終部署、migration、筆數、LINE 與帳本結果](evidence/20261023-complete-hosted/deployment-and-db.json)
- [最終 11 入口及明細讀回](evidence/20261023-complete-hosted/final-read-results.json)、[新 QA 真實交易流程](evidence/20261023-complete-hosted/transactions.json)、[最終權限與跨店](evidence/20261023-complete-hosted/final-rbac-results.json)
- [技師與方案保存](evidence/20261023-complete-hosted/editors-results.json)、[位置／服務／通知／人員](evidence/20261023-complete-hosted/remaining-results.json)、[兩端登入](evidence/20261023-complete-hosted/portal-results.json)、[預約期限保存與還原](evidence/20261023-complete-hosted/settings-results.json)
- [出租欄位重開](evidence/20261023-complete-hosted/rental-room-reopen.png)、[服務項目重開](evidence/20261023-complete-hosted/service-reopen.png)、[方案原表單](evidence/20261023-complete-hosted/plan-save-reopen.png)、[最終通知明細](evidence/20261023-complete-hosted/final-notice-booking.png)
- [技師直式平板](evidence/20261023-complete-hosted/technician-768.png)、[人員橫式平板](evidence/20261023-complete-hosted/staff-editor-1024.png)、[顧客手機](evidence/20261023-complete-hosted/customer-390.png)、[技師手機](evidence/20261023-complete-hosted/technician-390.png)
- 最終回歸 75 檔／609 項通過；TypeScript、變更檔 ESLint 及 diff 檢查通過。最終部署已查詢的 error／fatal runtime logs 無紀錄；這不是長期穩定性保證。
- Supabase advisor 保留既有美業 RLS 已啟用但無公開 policy 的 INFO，沒有藉此開放公開讀取。

**LINE 維持關閉，正式站未動，既有資料保留。** 本輪系統驗收完成；實體手機／平板與店家簽收仍待使用者完成。LINE 申請後的真實登入、綁定與送達驗證仍另列待辦。
