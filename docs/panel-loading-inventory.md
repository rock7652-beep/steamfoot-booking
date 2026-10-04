# 全站視窗資料載入盤點 — 2026-10-04

範圍：`src` 內 RightSheet、SettingsPanel 與自訂側滑入口。全站共用核心不保證所有首次請求零等待。帳號、角色、職員、門市、查看門市、模組與權限由 dashboard layout 的 keyed OperationScope 隔離；不持久化個資。

## 需要獨立讀取的入口

| 入口 | 資料來源／共用資源 | 策略 |
| --- | --- | --- |
| 預約詳情 | booking-detail-cache → client-read-cache | 先摘要／有限舊值，每次 authoritative revalidate；修改後失效 |
| 蒸足新增／補課 | steam-booking-form | intent 在途預讀、TTL 0 完整表單（包含名額），提交後失效；切換日期亦讀取最新名額 |
| 體驗新增 | trial-booking-form、steam-day-slots | 表單 intent 預讀；時段 TTL 0，日期／關閉世代保護 |
| 一般顧客 | customer-detail | intent 預讀、15 秒快取；頁面 rows／pathname 修訂隔離、修改後失效，現有 request gate |
| SPA 顧客列表 | spa-customer-profile | 15 秒 bounded 快取，server rows 修訂及修改 callback 失效 |
| SPA 查看顧客 | spa-customer-drawer | intent 預讀僅去重在途讀取，完成後再開取得最新；修改 callback 重讀與列表 refresh |
| SPA 顧客帳務／概況重試 | spa-customer-account、spa-customer-profile-retry | TTL 0，active cleanup |
| 成長顧客 | growth-customer | TTL 0，先顯示傳入姓名摘要，active cleanup |
| 交易詳情／更正／退款 | transaction-detail | TTL 0，讀取錯誤可重新開啟；刷新世代保護及修改後失效 |
| 課程學員方案 | course-card | 已帶入摘要先顯示，完整卡片 TTL 0，active cleanup |
| 課程職員授課設定 | course-staff-teaching | 分頁需要時 TTL 0；feesReady 保留編輯草稿，重試重新讀取 |
| 課程同行使用方式 | course-companion | TTL 0，版本保護與 expectedUpdatedAt 寫入檢查 |
| SPA 預約服務／人員 | spa-providers | TTL 0，選項 key 與 active cleanup 防止舊回應 |
| SPA 快速預約、一般新增服務欄位 | spa-availability | TTL 0，同鍵在途去重，requestId 防止舊回應 |
| SPA 結帳 | spa-checkout | TTL 0，active cleanup；重試重新讀取，不預載過期可用額度 |
| SPA 新人員搜尋會員 | spa-staff-member-search | 使用者主動搜尋才讀取，TTL 0 |

以上除 booking adapter 外由 usePanelReader／usePanelReadCache 接入 keyed provider；cache 上限 50 個 namespace/revision，每資源最多 50 筆，stale display 上限額外 60 秒。即時讀取不使用 peek。

## 已帶入資料或其他共同策略

| 入口 | 處理 |
| --- | --- |
| 現金收支編輯、方案表單、獎金規則、SPA 方案／人員編輯、值班日編輯 | props 直接顯示，不額外等待 |
| 課程工作台課次、今日名單、音樂科目、方案購買／交易操作、SPA 營收操作 | props 直接顯示；mutation 沿用後端版本與額度檢查、router.refresh |
| 共用設定中心、課程設定、工時／提醒／數位管家等設定面板 | RSC／DashboardLink 路由預讀，面板內容由伺服器提供，保留 dirty/pending guard |
| CourseStatusButton 停用／下架確認 | 不快取權威 impact，使用者操作時新查；避免預讀造成錯誤影響數量 |
| 操作說明、課程設定引導、手機導覽 | 靜態內容直接顯示 |
| 共用顧客標籤 | 已有 RSC seed、batch 讀取、版本／本地修改保護與訂閱更新；維持專用一致性流程，不另加互相干擾的 cache |

## 驗證與限制

- 自動驗證：in-flight 去重、TTL／stale 上限、失敗重試、失效後舊請求不可寫回、資源修訂與 account/store provider 隔離、live balance 不重用完成結果、體驗快速切日期不覆蓋、新增預約開關與草稿保留。
- 不新增 schema、migration、WebSocket 或第三方套件，不操作正式收款／預約資料。
- Preview 必須通過 isolated database guard。桌機 1366／寬螢幕、iPad 1024×768／768×1024、窄容器與手機 touch intent 均納入驗收範圍。
- 先前瀏覽器曾有 native credentials observation 保護；本次新預覽可開啟但停在 HQ 登入頁，未取得登入後桌機／iPad／手機畫面驗收；程式測試不能代替完整業務與真機驗收。
