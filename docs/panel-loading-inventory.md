# 全站視窗資料載入盤點 — 2026-10-04

範圍：`src` 內 RightSheet、SettingsPanel 與自訂側滑入口。全站共用核心不保證所有首次請求零等待。帳號、角色、職員、門市、查看門市、模組與權限由 dashboard layout 的 keyed OperationScope 隔離；不持久化個資。

## 需要獨立讀取的入口

| 入口 | 資料來源／共用資源 | 策略 |
| --- | --- | --- |
| 預約詳情 | booking-detail-cache → client-read-cache | 先摘要／有限舊值，每次 authoritative revalidate；修改後失效 |
| 蒸足新增／補課 | steam-booking-form | intent 在途預讀、TTL 0 完整表單（包含名額），提交後失效；切換日期亦讀取最新名額 |
| 體驗新增 | trial-booking-form、steam-day-slots | 表單 intent 預讀；時段 TTL 0，日期／關閉世代保護 |
| 一般顧客 | customer-detail | 清單姓名／電話／同門市標籤直接顯示，intent 預讀、15 秒快取；頁面 rows／pathname 修訂隔離、修改後失效，現有 request gate；摘要無寫入操作 |
| SPA 顧客列表 | spa-customer-profile | 15 秒 bounded 快取，server rows 修訂及修改 callback 失效 |
| SPA 查看顧客 | spa-customer-drawer | intent 預讀僅去重在途讀取，完成後再開取得最新；修改 callback 重讀與列表 refresh |
| SPA 顧客帳務／概況重試 | spa-customer-account、spa-customer-profile-retry | TTL 0，active cleanup |
| 成長顧客 | growth-customer | TTL 0，先顯示傳入姓名摘要；每次開啟及切顧客重新建立讀取狀態，舊錯誤／晚到回應隔離；視窗內重試 |
| 交易詳情／更正／退款 | transaction-detail | TTL 0，pointer／focus／touch intent 只去重在途讀取，完成後再開仍讀最新；讀取錯誤可視窗內重試；刷新世代保護及修改後失效 |
| 預約管理現金收支 | quick-cashbook | TTL 0，門市及頁碼納入讀取鍵；pointer／focus／touch intent 在途去重；換頁隱藏舊金額，失敗原頁重試；關閉與寫入成功清除資源，晚到回應隔離 |
| 課程學員方案 | course-card | 已帶入摘要先顯示，完整卡片 TTL 0；pointer／focus／touch intent 在途去重；視窗內重試、開啟世代與 active cleanup，完整讀取成功後才可修改 |
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
- 已完成登入後桌機／iPad Preview 操作，詳細範圍如下；程式測試與模擬尺寸不能代替完整業務與真機驗收。

## 登入後驗收紀錄（2026-10-04，Asia/Taipei）

| 門市／入口 | 已驗收行為 | 尺寸／結果 |
| --- | --- | --- |
| Steamfoot Staging 一般顧客 | 切換顧客、短時間關閉重開，姓名與資料相符 | 768×1024，面板在可視範圍內 |
| Steamfoot Staging 設定／新增預約 | 取消設定草稿恢復 14 天；切日期取得可用時段；旋轉尺寸保留備註，最後丟棄草稿 | 1440×900→1024×768，通過 |
| 陸比音樂學員 | 切換學員與查看方案，資料隨學員切換 | 768×1024，視窗邊界 (24,152,720,720)；未另驗音樂草稿旋轉 |
| 運動隔離新課程 A | 共用卡與個人卡分別顯示可用 8／16 次；姓名草稿跨尺寸保留，關閉重開仍保留；最後還原且未送出 | 1024×768→1440×900→768×1024，視窗邊界 (24,152,720,720) |
| SPA 示範店顧客 | 概況、近期服務、方案／儲值分頁；不同顧客的方案 1 次／儲值 2500 元正確切換 | 1024×768、768×1024，側滑寬 620，資料與分頁保留，無水平溢出 |
| HQ SPA 查看顧客 | #1202 限制總部查看操作，僅保留閱讀分頁；店舖管理入口仍有原權限操作 | 1440×900、1024×768、768×1024，通過；購買表單可開啟但示範店無可選方案，未提交 |
| Steamfoot Staging 交易詳情／退款 | 歷史清單 32 筆；單次交易 1598 元與課程交易 3000 元切換正確；退款表單顯示總堂數 10、已用／預約 0、可退 10、預計退款 3000 元；返回並關閉，未提交 | 1363×936，面板在可視範圍內；本次新增交易案例未另驗 iPad |

- 運動驗收使用既有已封存的隔離 A（`store-course-start-0918-a`／`course-start-0918-a`）直接路由；未解除封存、另建門市或改正式資料。
- SPA 驗收使用隔離 Preview 的既有 HQ 佈建流程啟用示範店；未繞過 ACTIVE guard。正式資料庫目前無 SPA 門市，未為驗收佈建正式門市。
- #1198／#1199 修正共用面板 RWD，#1201 修正 SPA 顧客讀取，#1202 修正 HQ SPA 查看權限；後兩項已合併。#1202 Preview 產品程式與正式 main `17ecc93e` 相同；正式站讀取顧客面板正常，部署 READY。
- #1200 提醒中心驗收斷言同步 `storeId + customerSection`；在 main `17ecc93e` 重跑 12 組相關測試、52 項全通過。本 PR 僅修改測試與本紀錄。
- 本次 SPA 營運查詢 2026-08-01～2026-10-04 顯示 0 筆交易；已完成的 2026-08-28 服務摘要可讀，但未提供待結帳操作。退款／結帳尚缺符合條件的案例，不列為實際流程通過。
- Cloudflare 與實體 Safari／iPad／LINE 依使用者指示跳過；手機 touch intent 尚未完成實際業務驗收。不宣稱全站驗收完成或首次讀取零等待。

## 接續驗收與同步缺口（2026-10-05，Asia/Taipei）

- 已在隔離 Preview 建立林小姐 2026-10-05 11:00 頭部舒壓測試預約（800 元），由「已預約」完成現金結帳；預約顯示已完成／已結帳，顧客服務與收款紀錄同步，營運本月由 1800 元／2 筆增為 2600 元／3 筆，今日僅 800 元／1 筆。送出期間控制停用，重新開啟已結帳預約沒有再次收款入口；未驗伺服器同時請求的冪等性。
- 390×844 裝置預覽：服務收款 800 元、儲值 1000 元的更正及全額退回視窗切換正確；返回、關閉重開、內部捲動與操作可到達。退款僅開啟並取消，未提交；模擬尺寸不等於實機觸控。
- 核對主線 01794144 的一般顧客、SPA 顧客、交易、課程卡片及 SPA 結帳路徑。共用讀取／權限範圍隔離已存在，不重新建置。
- 發現一般顧客詳情成功修改後只更新 drawer，主清單備註、歸屬及有效方案堂數可能保留舊值。修正為先失效並讀取該顧客，再於背景 router.refresh 合併清單；資料修訂到達時以當前 history URL 避免重新開啟已關閉視窗或切回先前顧客。開啟視窗仍不以路由請求為前置條件。
- 本修正行為測試、共用 cache／摘要、交易載入及 SPA 顧客測試共 27 項通過；修改檔 ESLint、TypeScript noEmit 與 diff --check 通過。Vercel projectEnvVars list 回覆 403，但部署沿用既有 Preview 連線；建置日誌確認 isolated_database=true，Preview dpl_3riQFDSLPsAdGQeHHXgsakPTLHCU 已成功建置。新增支線隔離 guard，缺少隔離設定時 build 必須停止。
- 登入後桌機 1363×936：隔離 staging-store 的 QA1124 顧客，備註由空值改為 QA1203 清單同步驗收，視窗與清單同步更新；搜尋 QA1124 保留。1024×768 視窗 (152,24,720,720)、768×1024 視窗 (24,62,720,900)，頁寬分别1024／768，沒有整頁水平溢出。裝置預覽切換尺寸會重建入口，重新開啟顧客後未儲存備註草稿仍保留；不將此列為不重建的原生旋轉驗收。直向儲存空備註還原後，視窗與清單均恢復無備註，沒有變動方案堂數、收款或正式資料。
- 本修正未合併正式站；已完成本次備註同步的登入後 Preview，方案指派與歸屬的寫入端到端未另提交，實機仍待驗收。既有 SPA 驗收不代替這次清單同步修正的 Preview 驗收。

## RWD 完成後接續（2026-10-05，Asia/Taipei）

- 起點 main `a1564a7a` 已包含 #1203 顧客清單同步與先前共用 panel reader；不重新建置，不修改 RWD 外框或業務 server action。
- 交易紀錄及蒸足營運工作台的共用交易詳情入口補上 pointer enter、focus、touch intent，與已開啟視窗共用在途讀取；TTL 維持 0，已完成的預讀不作為退款／額度的快取來源。
- 初次讀取失敗可直接「重新載入」，讀取中顯示 status，錯誤使用 alert；切交易或關閉後，舊讀取與重試不得更新目前視窗。
- 自動化驗證：6 組 32 項通過，包含三種 intent、去重、重新開啟讀最新、預讀失敗再開、視窗內重試、切換交易晚到保護、共用視窗與顧客同步。變更檔 ESLint、TypeScript noEmit 通過；本機型別檢查提高 Node heap 後成功。CI 37246354097 的三個 required jobs 成功；完整 Vitest 6514 通過／71 失敗／81 略過，73 條正規化 FAIL 與 #1203 CI 37217736801 完全相同，沒有新增失敗，不宣稱全綠。
- 本輪產品提交 `8a7dae6f` 的 Vercel Preview `dpl_FcJArXtzFHhTWU9r1vjvSMEepQUc` READY；build 日誌確認 isolated_database=true、未執行正式 migration。Staging Admin 選取 Steamfoot Staging / 測試店，2026-06-01～2026-10-05 共 25 筆歷史交易。
- 登入後桌機 1363×936：QA來源驗收LINE 的 1598 元單次與全額折抵課程交易（實付 0、10 堂）顯示正確；鍵盤 Enter 開啟、關閉重開正常。桌機視窗 (321.5,24,720,888)，頁寬 1363。
- 相同共用元件在營運工作台：1024×768 視窗 (152,24,720,720)、768×1024 視窗 (24,62,720,900)、1440×900 視窗 (360,24,720,852)、390×844 視窗 (0,0,390,844)，頁寬皆等於視窗寬。平板橫轉直保留 QA1204 未儲存備註，之後取消恢復未填寫；手機 Escape 關閉後保留原查詢。全部只讀取與取消，未提交收款、退款、作廢或備註。
- 錯誤重試與 touch intent 的請求去重為自動化行為測試，沒有在瀏覽器故意阻斷網路；模擬尺寸不等於真機觸控，超寬螢幕／Safari／LINE 依既有指示保留未驗。尚未合併正式站。

## 課程方案與顧客經營接續（2026-10-05）

- 以 #1204 main bf896dd9 為起點，運動／音樂沿用 CourseMemberWorkspace 與 course-card reader；意圖預讀只去重在途請求，TTL 0，完整權威資料取得後才開啟修改。錯誤可在原視窗重試；晚到回應與舊錯誤不得覆蓋目前方案／顧客。
- 快速換顧客曾觀察 URL 與視窗不同步；唯一觸發來源未證實。改由目前 client panel identity 同步 customerId，保留篩選／hash，並先通過離開 guard；自動化涵蓋晚到 route、關閉後舊 route。
- 音樂劉語彤・08 吉他4堂卡（剩4／預約0／可用4）、運動林宥辰共卡（16／8／8、9筆）及李承恩個人卡（18／2／16、4筆）開啟與重開正確。桌機1363×936、iPad1024×768／768×1024及手機390×844，切換尺寸維持目前顧客與 URL，無整頁水平溢出。
- Growth 實際候選入口 /hq/dashboard/growth/candidates：隔離 steamfoot-preview/staging-store 暫設 QA1005、QA1124 為 PARTNER。先姓名摘要再完整0／115點，關閉換人不帶入舊資料。跨店權限試驗會由 RSC 移除候選列，不計為原地重試通過；storeId 已即刻還原。
- 補齊 HTTP 503 原地重試：獨立 qa/panel-1206-network-rwd-20261005，d66424ac，Vercel dpl_2UtqZvBDubJiEvSHM7JC57kypWg6 READY；僅指定 preview 支線、ADMIN、候選頁 action 可注入故障，不更改產品 reader／component，此 QA 支線不合併。正常115點顧客關閉後，故障開啟0點顧客只顯示目前姓名及錯誤；持續故障重試仍留原顧客，恢復後同視窗 loading→0點成功，候選 URL 不變、僅1個 dialog。
- Growth 390×844、360×800、768×1024、1024×768、1440×900，document.clientWidth=scrollWidth；手機全寬、平板／桌機520寬。360手機內容938／捲動區634，鍵盤可到下方轉介紹控制，固定頁尾可見。尺寸切換不清除顧客。驗收截圖 qa1206-mobile-retry-rwd-20261005.jpg。
- 清理 SQL 再查：QA1005、QA1124 talentStage=CUSTOMER、storeId=staging-store、stageNote=null；沒有修改正式資料、點數、交易或預約。
- 本輪觸控改善：沿用共用 TalentPipelineSection、ManualPointsForm、ReferralSection，調整階段／手動加分／新增轉介紹／轉介紹狀態控制至少44×44；Growth 關閉44×44及完整顧客入口至少44高。這些共用區塊目前實際掛在成長抽屜；完整顧客頁只提供前往顧客經營入口，不列為相同區塊驗收。沒有複製另一套元件，不改清單字級、讀取或交易規則。
- 觸控 preview 55a9a8ee／產品07333863：手機390與360、iPad橫直及1440桌機無整頁水平溢出，關閉44×44、調整階段60×44、加分81.36×44、新增轉介紹83.58×44、完整顧客入口98.70×44。原地503→重新載入→0點成功，未带入另一位115點。QA1124顯示115點與10筆近期紀錄，尺寸切換保留目前顧客。截圖 qa1206-touch-controls-20261005.jpg，故障已解除、測試顧客已還原。
- 產品07333863 CI 37257462429：Targeted、Typecheck、Changed ESLint全部通過，本機4組21項通過。完整測試6526通過／71失敗／81略過，73條正規化FAIL與 #1204 baseline完全相同、added=[]、removed=[]。最終紀錄提交只更新本文件，不更動已驗產品程式。
- head 595103e7 的 CI 37255536284：Targeted 66組593項、Typecheck及Changed ESLint通過；完整6526通過／71失敗／81略過，73條正規化 FAIL 與 #1204 baseline job111570390770完全相同，added=[]、removed=[]，不宣稱全绿。booking-form-live-slots 僅固定測試 Date，沒有改營業規則。
- 模擬尺寸不等於實機觸控；Safari／LINE、手機鍵盤及超寬尺寸仍未完整驗收。PR #1206 已於2026-10-05合併，production 2ae3fdab部署成功；正式站運動唯一顧客無持有方案，且全店潛力名單0人、無音樂門市，對應完整業務驗收仍缺資料。

## 現金收支讀取接續（2026-10-05）

- 以正式main 2ae3fdab建立乾淨支線；預約管理QuickCashbook是直接client讀取的剩餘缺口，接入既有usePanelReader，不新增快取核心。金額維持TTL 0；一般現金編輯與課程交易沿用props直接呈現，不額外加讀取。
- 門市變更卸載舊panel；關閉／卸載隔離晚到回應。intent與開啟只共用在途請求；重開重新查權威金額。換頁清除舊值，錯誤在原頁重試；成功儲存／刪除清除各頁後重讀。後端權限、金額計算與寫入規則未修改。
- 活躍支線#1205進銷存與#1207批次簽到均不帶入；本輪不更動其功能。
- 本機3組30項通過，涵蓋pointer／focus／touch去重、重開取新值、原頁重試、舊值不可操作、關閉重開及跨門市晚到隔離、成功寫入後更新。Preview與桌機／iPad瀏覽器驗收尚待部署，不宣稱上線或完整驗收。
