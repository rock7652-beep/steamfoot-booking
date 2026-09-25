# 操作指南內容維護與下一批驗收

## 2026-09-25 增量盤點結果（目前狀態）

核對 main `953785e9159641e3ecc1f39276a83b930e8cbcf1..64d30d3850fad31e11f87811750a42128e07919d` 共 12 筆提交。#1042、#1091、#1093、#1094 已合併，不再當作待發布草稿；保留未完成的實際操作驗收。以下較早段落為歷史紀錄。

| main 變動 | 指南處理與來源 |
|---|---|
| #1096 課程月結、開關、付款及更正 | 新增 C138～C140，修訂 C122；核對 `service-fee-calculator/course-monthly*.tsx`、`actions/course-monthly-settlement.ts`、`services/course-monthly-settlement.ts`、`services/course-profit-payment.ts`、`services/course-sale-allocation.ts`。確認月結只建立版本，不等於付款；既有授課費共用紀錄，不能重複記支出。 |
| #1092 月／週／日課表及體驗收款 | 新增 C141，修訂 C116；核對課表 workspace、board、roster 與 trial-payment-button。名單仍使用右側面板，不把其他置中視窗的說法套用至課表名單。 |
| 5d519f0d、338f10cd 單日時段名額及設定載入 | 修訂 B04、B06；核對 day-slot-manager 與 business-hours action。名額 0～99 且不得低於已預約人數；0 表示額滿，不等於停用時段。載入修正不另增重複題。 |
| #1089 HQ 顯示店名更名 | 新增 I10；核對 HQ store-name-form 與 admin store action。只改 Store.name／ShopConfig.shopName，不改 slug、ID、訂閱或歷史歸屬；操作限總部 ADMIN 且具 staff.manage。 |
| #1088 課程體驗授權及計時狀態 | 新增 S04；核對 HQ features 與 store detail。功能授權、體驗計時、LINE 設定三者分開；沒有日期不代表功能已到期，單店方案不含多店權限。 |
| #1085／#1086 課程既有 LINE 入會與店名文字 | 既有 C117 已在 #1091 更新，核對後不重複新增；保留其待驗狀態。 |
| #1042／#1091／#1093／#1094 指南發布 | 校正已發布紀錄；後台 main 139 題、前台 16 題。本次新增 6／更新 4，草稿後台 145 題，前台不變。 |

搜尋與風險說明同步補上「月結版本／部分付款／退款回沖／更正誤登／分潤開關」、「月課表／週課表／名單」、「名額 0／已額滿」、「店名更名／slug」、「試用未開始／LINE 尚未設定」。月結採確認收款月份與已結束授課月份各自歸屬；開關只影響新快照，不回寫歷史，舊待核帳使用原快照。缺少快照列為異常，不當成零元。分潤現金付款需已開現金抽屜，部分付款不得超過未付餘額；更正誤登不代表實際收回款項。

驗證與待辦：

- 指南相關 5 檔 33 項測試、`tsc --noEmit`、變更檔 ESLint 通過；CI 全套結果另記 PR，不因既有失敗調整無關規則或放寬測試。
- 本批 10 題均待實際操作；累計後台 82 題＋前台 16 題＝98 題，完整去重清單見 audit-state。已合併、測試通過或功能作者的驗收不會自動清除指南待驗。
- 必要畫面：月結確認版本／異常提示、開關前後對新舊資料的區別、部分付款／更正、月週日課表及右側名單、體驗收款狀態、單日名額 0、HQ 改名與體驗狀態。尚未取得本版登入後新截圖，不用舊圖或模擬圖替代。
- 後續只在確認隔離且通知封鎖的環境，以店主／受限人員／HQ 管理者角色驗證允許及拒絕案例；不新增正式顧客、不送實際通知、不修改營運規則。
- 維持現有綠金介面與頂欄唯一入口，本批僅新增教學草稿，不自動正式發布。

## 以下為歷史批次紀錄

課程前台會員／教練指南補強另見 [前台覆蓋表](course-portal-guide-coverage.md)：新增 12 題、擴寫 4 題，共 16 題。與後台目錄分開計數，實際角色操作驗收待完成。

## 課程基本操作補齊（2026-09-24，草稿）

基於 main `f7ac8433` 的補充內容核對，不推進每日 main 盤點基準。

- 新增 C126～C137 共 12 題：首次設定、學員資料、直屬店長／推薦人、購買與上課紀錄、備註、營業公休、預約取消截止、值班聯動、額度查詢、健康量測、教練工作入口、銀行與體驗設定。
- 修訂 C104（置中視窗）、C106（通知失敗與略過）、C117（課程 LINE 加入及身分衝突）。
- L01～L03 三篇既有通用排錯文章加入課程適用範圍；未複製文章。
- 後台總文章 129 篇；課程適用 47 篇，實際依權限／功能篩選。新增文章來源列於各文章 sources。
- 健康量測受 ai_health_summary 與顧客查看權限控制；新增／編輯需顧客編輯權限。歸屬設定需 customer.assign；值班需 duty.manage。
- 累計 64 題待登入後實際驗收（既有 49＋新 12＋新增課程適用的共用 3，去重）。程式測試不替代登入操作；本輪未建立正式資料或發送通知。
- 會員前台目前仍為 4 則簡答；本批只補後台，前台內容擴充另列下一批。新文章不表示新增產品功能。


## 2026-09-24 增量盤點結果

已核對 main `984e0a1bfe69796e86990e196b8d7677b9e37b75` 至 `953785e9159641e3ecc1f39276a83b930e8cbcf1`。本批新增 A11、C10、E12、H10、I08，更新 9 題，共 117 篇；沿用草稿 PR #1042，不合併正式站。

| 已合併變動 | 指南處理 |
|---|---|
| #1070～#1072、#1074、#1076 蒸足消費紀錄與即時顧客搜尋 | 新增 C10、E12；更新 C01、C04、C09、E08、C118。補姓名／電話／LINE 候選、中文選字 Enter 防誤選、手動收入關聯顧客、消費篩選與會員「我的方案／消費紀錄」分頁。 |
| #1075 本月預約搜尋 | 新增 A11。搜尋目前月份已載入預約，可合併教練／狀態／服務篩選，排除取消，點明確結果才開啟。 |
| #1073 體驗來源與營收結構 | 新增 H10；更新 H01、H03。補五類來源、來源占比／到店率／方案轉換率、明細回查、已收／待收／退款／支出的分離口徑。 |
| #1077、#1079 蒸足與課程置中視窗 | 更新 C123；桌機／平板改置中、手機滿版，保留關閉後搜尋或工作頁，不為相同彈窗行為增重複文章。 |
| #1080 課程共用裝置預覽 | 新增 I08。課程預設 768×1024，可切 1440×900 與 12 個工作頁；說明預覽仍使用目前門市資料。 |
| #1081～#1084 三模組共用記帳與近六個月財務趨勢 | 更新 E08、H01、C115。統一關聯顧客／消費項目／付款方式；近六個月預設營業額，摘要日期與趨勢期間分開。 |

新增文章與直接來源：

- A11：`bookings-manager.tsx`、`booking-month-search.ts`；目前月份、姓名／手機、組合篩選、排除取消及捲動結果。
- C10：`customer-instant-search.tsx`、健康搜尋與課程顧客選取；候選明確選取、中文組字、Enter 防誤選、門市與可見範圍。
- E12：共用 `cashbook-entry-fields.tsx`、現金帳 action、顧客消費紀錄；只在收入顯示選填關聯顧客，未選候選不歸戶，支出不列為消費。
- H10：`trial-booking-source-analytics.md`、分析來源表及唯讀來源明細；LINE、Messenger、Google 地圖、Instagram、其他／未記錄的連結與口徑。
- I08：裝置預覽頁、元件與 `device-preview.ts`；權限、課程頁面清單、預設平板、桌機切換與禁止巢狀預覽。

權限、搜尋與規則：

- A11、I08 需 `booking.read`；C10 需 `customer.read`；E12 需 `cashbook.create`、`customer.read` 與現金帳功能；H10 需 `report.read` 與 `basic_reports`。
- 搜尋詞新增「本月預約／向下捲動」「Enter／中文選字／LINE 名稱」「關聯顧客／已關聯」「Google 地圖／Instagram／來源占比」「裝置預覽／iPad／768×1024」。
- 顧客搜尋欄按 Enter 不會直接選第一位；候選必須明確點選。現金收入只有選定同店顧客才歸入消費紀錄，系統不依姓名或備註猜測。
- 體驗來源依入口連結，不依登入方式推定；指派方案不等於已收款。來源按預約建立日，後續完成與指派會更新結果。
- 營收摘要依上方日期；近六個月圖固定本月往前六個月。本月截至今日，營業額為退款後支出前，收支結餘再扣已記錄支出。
- 本批只更新指南、搜尋及維護文件；未修改 main 的顧客、預約、收支、分析、方案或通知規則。綠金視覺與唯一頂欄入口保持不變。

驗證及待辦：

- 本批新增 5 題、更新 9 題，草稿共 117 篇；去重後 49 題待登入操作。
- 必要新畫面優先：本月預約搜尋結果、中文輸入不誤開、消費紀錄篩選與合計、關聯顧客成功狀態、來源分析表／明細、營收結構六個月圖、課程平板裝置預覽及置中視窗。
- 實際操作只使用已確認隔離且通知封鎖的測試資料；不為截圖新增正式顧客、預約、記帳或通知。程式測試與 HTTP 200 不計為登入後驗收。

## 2026-09-23 增量盤點結果

已核對 main `c171a39e80584eab179da76ae2184b52f466bd9c` 至 `984e0a1bfe69796e86990e196b8d7677b9e37b75`。本批新增 C118～C125、更新 14 題，共 112 篇；沿用草稿 PR #1042，不合併正式站。

| 已合併變動 | 指南處理 |
|---|---|
| #1052 課程結帳、固定期課、每堂固定費、批次管理與大型清單 | 新增 C118、C119、C122；更新 C103、C107、C108、C111、C112、C114，修正指派同時結帳、期課未到扣堂、方案成本／共卡開關與課次費率快照。 |
| #1058 課程設定五區、右側視窗、每方案提醒與未指派方案 | 新增 C120、C121、C123；更新 C104、C106，補草稿保護、各方案提醒條件與只讀待辦範圍。 |
| #1061 課程營運分析 | 更新 C115：來客人次按完成出席堂次，另列不重複來客；補店家／直屬店長／教練、近六個月／一年與各權限口徑。 |
| #1054、#1064 三模組現金抽屜與收支視窗 | 更新 E08～E11 並加入 `course` 模組，對齊「記一筆收支／提領現金／補入現金」視窗及今日現金狀態的閉店入口。 |
| #1068 課表、方案與預約流程 | 新增 C124；更新 C111、C112，補課表直接選既有學員、建立新體驗客、最快到期方案、顧客可購買／僅後台指派及允許共卡。 |
| #1069 課程 LIFF 精簡與後四碼 | 新增 C125；更新 C103、C113，教練前台不再要求獨立報到，會員購買與店家核帳改以轉出帳號後四碼。 |
| #1062、#1063、#1067 欄位高度、寬度與 Safari 日期置中 | 純介面密度與對齊，不新增文章；既有步驟仍成立。 |

新增文章與直接來源：

- C118：`member-workspace.tsx`、`course-customer-picker.tsx`、`actions/course-members.ts`；共卡搜尋、原成員保留、有效預約阻擋與期課／方案開關限制。
- C119：`member-workspace.tsx`、`course-term.ts`、`course-assignment-checkout.ts`、`course-booking.ts`；堂數與課次数一致、原子整期預約、未到扣堂、更正返還及已有購買不得改期別。
- C120／C121：`low-balance-settings.tsx`、`course-plan-reminders.ts`、`course-unassigned-plans.ts`；逐方案低額度／到期提醒與不外發 LINE 的站內待辦。
- C122：`course-fees.tsx`、`course-fee-payment-button.tsx`、`course-fee-payment.ts`；已結束課次、固定費、現金支出、誤登沖回及 100 堂顯示上限。
- C123：課程設定工作區、設定視窗與草稿 context；五分類、右側／手機全寬視窗、未儲存及儲存中保護。
- C124：`courses/workspace.tsx`、`courses/roster.tsx`、`actions/course-members.ts`；既有學員搜尋、適用方案、最快到期卡與直接新增體驗客。
- C125：課程會員入口及 `purchaseCoursePlan`；只顯示顧客可購買方案、後四碼、待核帳與防重送。

權限、搜尋與規則：

- C112 要求方案指派、交易新增與顧客查看；折扣動作另受 `transaction.discount` 控制。C118 需卡片與顧客查看／指派；C119 建立方案需 `plans.edit`，實際整期指派另需預約建立權限。
- C120 需提醒功能與營業設定權限；C121 需 `customer.read`、`wallet.read`；C122 只對店主且同時具 `cashbook.read`、`cashbook.create` 者顯示；C125 需顧客查看。
- 搜尋詞補「固定期課／未到扣堂」「低額度／到期天數」「未指派方案」「授課費／更正誤登」「新體驗客／最快到期」「轉帳後四碼」。
- 指派方案舊文「不代表已登記收款」已移除；新版會在同一交易發卡、購買、收款並防重送。會員轉帳回報仍只建立待核帳，兩個流程不可混用。
- 本批只改指南、搜尋與維護文件，沒有改 main 的預約、共卡、扣堂、結帳或通知程式。頂欄唯一入口與綠金視覺保持不變。

驗證及待辦：

- 本批新增 8 題、更新 14 題，草稿共 112 篇。原 28 題待驗保留；新增 8 題及首次加入課程模組的 E08～E11 後，去重為 40 題待登入操作。
- 必要新畫面優先：指派結帳雙欄、固定期課、逐方案提醒、未指派待辦、授課費付款／更正、課表直接新增體驗客、會員後四碼購買，以及教練前台直接出席／未到。未用舊圖或生成圖冒充。
- 無已登入且確認隔離／通知封鎖的工作階段，本次實際操作驗收受阻；不以單元測試、HTTP 200 或 Vercel READY 取代。

## 2026-09-21 增量盤點結果

已核對 main `e469f9b133a4dac717dcedbd4e8609c78061e2cb` 至 `c171a39e80584eab179da76ae2184b52f466bd9c`。main 合併的課程模組自帶 C101～C106，本次盤點補 C107～C117；相較昨日草稿新增 17 題、更新 0 題，共 104 篇。沿用草稿 PR #1042，不合併正式站。

| 已合併變動 | 指南處理 |
|---|---|
| #1022 課程模組：課程／教室、排課、會員／教練、點數／堂數、共卡、購買退款、提醒與分析 | 保留已合併的 C101～C106；新增 C107～C117，補足日常建立、設定、核帳與排錯入口。課程文章只對 `course` 模組及符合權限者顯示。 |
| #1053 手機指南避開 Safari 螢幕鍵盤 | 核對 `visualViewport` 的 top／height／max-height 更新與關閉清理；文章與搜尋詞不需改寫，既有綠金面板與唯一頂欄入口不變。實體 iPhone Safari 仍待驗。 |

新增文章與直接來源：

- C101～C106：main 的 `course-operation-guides.ts`，分別核對共卡代約、逐人取消、點名／額度、公休衝突、協商退款及課程提醒。
- C107／C108：`courses/workspace.tsx`、`course-scheduling.ts`、`actions/course.ts`；課程範本、上下架、教室容量與歷史保留。
- C109／C110：`courses/workspace.tsx`、`actions/course.ts`；單堂／每週／指定日期、預覽、店家鎖、整批失敗、單堂／系列修改及已有預約限制。
- C111／C112：`courses/member-workspace.tsx`、`actions/course-members.ts`；點數／堂數、適用課程、指派方案、效期、共卡與「指派不等於收款」。
- C113：`courses/purchase-review.tsx`、`actions/course-portal.ts`；待核帳、轉帳後五碼、二次確認、只核帳一次及中斷後先查結果。
- C114：`courses/staff-workspace.tsx`、`actions/course-staff.ts`；教練身分、授課資格、會員連結與店長權限分離。
- C115：`courses/analytics-page.tsx`、`queries/course-analytics.ts`；課程日／入帳日、人數／人次、點數／堂數、收退款及匯出權限。
- C116：`courses/roster.tsx`、`services/course-trial-payment.ts`；體驗收款、出席、作廢分開，不自動退刷或扣其他方案。
- C117：`book/course-portal.tsx`、`services/course-access.ts`；固定店別會員連結、身分衝突、教練僅工作身分與共卡健康隔離。

權限、搜尋與介面：

- 新增課程專用搜尋詞，涵蓋「批次排課／整批」「待核帳／後五碼」「授課資格／我的工作」「收款／出席分開」「帳號尚未連結」等現場用語。
- C107～C110 需 `booking.read` 並依動作加 `booking.create`／`booking.update`；C111 需 `wallet.read`、`plans.edit`；C112 需 `wallet.create`、`wallet.read`、`customer.read`；C113 需 `wallet.create`、`wallet.read`；C114 需 `staff.view`、`staff.manage`；C115 依 `report.read` 與 `basic_reports`；C116 需 `booking.read`、`trial.confirm`；C117 依 `customer.read`。
- 沒有改課程、教室、排課、共卡、額度、退款、收款或通知程式；指南仍沿用唯一頂欄入口及既有綠金樣式。

驗證及待辦：

- 新增的 catalogue 測試檢查 104 篇總數、17 篇課程題目、搜尋詞、模組隔離、複合權限及分析功能開關；最終測試、CI 與 Preview 狀態寫入 PR #1042 本日交付留言。
- 待登入驗收為既有 11 題加 C101～C117，共 28 題。#1022 雖有隔離功能操作紀錄，仍不能取代本批照文章逐題操作、核對搜尋結果與必要截圖。
- 本次非互動執行沒有安全的已登入隔離工作階段；不以登入頁、HTTP 200、測試通過或 Preview READY 標成操作驗收通過。沒有新增正式顧客、排課、共卡、額度、收退款或 LINE 外發。

## 2026-09-20 增量盤點結果

已核對 main `0a280a351f79a77ad1789d0a8b20196afbe269b2` 至 `e469f9b133a4dac717dcedbd4e8609c78061e2cb`。本次新增 F12、更新 F04，共 87 篇；沿用草稿 PR #1042，不合併正式站。

| 已合併變動 | 指南處理 |
|---|---|
| #1047 數位管家選單拒收電話時仍回報綁定結果 | F04 補充電話同時可能是數位管家回答與綁定請求；若選單驗證失敗，先看綁定回覆，不反覆送電話。 |
| #1048 竹北體驗預約通知狀態 | 新增 F12，區分預約成功與通知設定；說明已連結、待設定、需門市協助、24 小時一次性連結、身分衝突不覆蓋。 |
| #1049 竹北由官方 LINE 圖文選單直接進 LIFF | F12 改以完成頁狀態為準，不再教顧客先回聊天室取得預約卡；普通公開表單仍保留。 |
| #1050 新竹、台中沿用驗證身分的直接流程 | F12 說明三店已設定 LINE 入口共用明確狀態；電話填在表單一次，不需再到官方 LINE 輸入。未配置的新門市不會自動取得相同流程。 |

直接來源：

- F12：`public-trial-liff-bridge.tsx`、`zhubei-trial-booking-form.tsx`、`public-trial-booking.ts`、`trial-notification-binding.ts`、LINE webhook。
- F04：提醒管理頁與關懷卡保留為主要發送紀錄來源，另核對 LINE webhook 及體驗完成頁；通知設定成功不等於實際訊息已發送。
- 這批變更沒有新增店家後台權限碼；F12 延用蒸足、`business_hours.manage` 與 `line_reminder` 篩選。操作指南仍只有既有頂欄入口，沒有新增第二入口或改綠金樣式。

驗證及待辦：

- 新增搜尋、模組、權限、功能限制及「預約成功不等於通知完成」測試；最終數量及 CI 結果寫入本日 PR 留言。
- 待驗收畫面：三店 LINE 入口、完成頁已連結／需協助狀態，以及安全隔離資料下的一次性設定狀態。不得為了截圖建立正式預約、轉傳專屬連結或觸發全店提醒。
- 既有 9 題待驗收保留；本次新增 F12、F04 後共 11 題。需要登入且已確認隔離與通知封鎖的測試工作階段；程式核對不等於實際操作通過。

## 2026-09-19 增量盤點結果

已核對 main `e69323f41762d2caad6a92f998b591ca5bf61fa1` 至 `0a280a351f79a77ad1789d0a8b20196afbe269b2`。本次新增 C09、更新 C07／M01，共 86 篇；沿用草稿 PR #1042，不合併正式站。

| 已合併變動 | 指南處理 |
|---|---|
| #1043 LINE 會員首頁精簡與底部導覽 | 新增 C09，說明首頁／預約／方案／健康／我的、功能開通限制、非所有內頁都有導覽、分享選單不等於傳送。更新 M01 說明首頁「較上次」及量測日期、不從單一差值推定健康好壞。 |
| #1044 重複返回入口移除、空預約直接預約 | C09 說明用底部首頁返回、只有即將到來的空清單顯示「立即預約」；蒸足與 SPA 仍使用各自預約路徑與原資格檢查。 |
| #1045 已過期／歷史方案預設收合 | C07 提醒先展開再排查身分；筆數不等於堂數，收合不表示刪除，展開不恢復效期。 |
| #1046 方案及健康頁移除重複回首頁 | C09／M01 說明 LINE 會員底部首頁入口；不把 SPA 網頁會員專區與 LINE 所有畫面當成相同。 |

直接來源：

- C09：`src/app/(liff)/liff/liff-bottom-nav.tsx`、`layout.tsx`、`liff-shell.tsx`、`liff-store-share-card.tsx`、`bookings/_components/ready-view.tsx`、`bookings/bookings-list.tsx`、`profile/profile-view.tsx`。
- C07：`src/app/(liff)/liff/wallets/wallets-list.tsx`、`src/lib/liff/messages.ts`，保留原身分與登入核對來源。
- M01：`src/app/(liff)/liff/liff-shell.tsx`、`layout.tsx`、`liff-bottom-nav.tsx`、`health/health-view.tsx`，保留原後台健康頁來源與 `ai_health_summary` 功能限制。
- 本次差異只有會員介面 9 檔；沒有新增後端授權或交易規則。guide 的權限與模組篩選不變，C09 需 `customer.read`，M01 仍需健康功能開通。底部會員導覽不是店家後台操作指南的新入口。

驗證及待辦：

- 新增指南搜尋／權限、歷史方案收合語意及健康功能限制測試；保留原指南測試。最終測試數與 Preview commit 寫入本日 PR 留言。
- 瀏覽器本次可連線，但既有 Preview 仍為未登入狀態；遵守安全登入流程，不從歷史對話填入密碼。新舊共 9 題實際操作仍受阻，未宣稱通過。
- 待補截圖：底部導覽（含健康未開通時）、即將到來空清單及歷史空清單差異、過期／歷史區塊展開前後、健康比較日期。只在隔離測試資料與通知封鎖已確認後補驗收；不實際分享 LINE 訊息、不新增預約。
- `operation-guide-audit-state.json` 中 `newGuideIds`／`updatedGuideIds` 是本次數量，`cumulativeDraft*` 是未發布草稿累計，`interactionPendingGuideIds` 是去重後待驗題目。下次從已記錄的新 main commit 接續，不重複處理本批。

## 2026-09-17 首次盤點結果

檢查 main：`e69323f41762d2caad6a92f998b591ca5bf61fa1`。首次沒有上次成功 commit，故以此建立基準；讀取既有指南、覆蓋文件與來源，優先核對原來源基準 `44c1f1f` 之後已合併項目，不把未合併課程分支當成正式功能。

| 已合併變動 | 指南影響與處理 |
|---|---|
| #1035 店長通知篩選及 LINE 品牌視覺 | F01／F03／F04 已有設定與接收人說明；本輪沒有核實出需新增文章的操作規則，不新增篇數。新篩選介面截圖仍待登入核對。 |
| #1037 關懷購買與付款摘要 | 新增 D12，更新 E01、F08、F11；蒸足待核帳不等於已購買，後續邀請略過、不補發；SPA 不沿用蒸足訂單規則。 |
| #1036 操作指南正式發布 | production 入口已開；修正 coverage 及 inventory 開頭的過期狀態，舊批次保留為歷史。 |
| #1038 實際串接分段計費 | 新增 I07；按實際已串接數，不按額度；首間免串接費，2～5 間 $500、6～15 間 $300，16 間起報價，不自動扣款。 |
| #1039 通知開通保留原登入身分 | 更新 C08，區分通知與登入綁定，不教顧客任意解綁。 |
| #1040 入口先核對既有會員 | 更新 C07／C08，區分身分需確認、暫時故障與登入逾時，不引導舊客重新註冊。 |
| #1041 公開體驗申請 LINE 引導 | 屬尚未開通店家的官網申請流程；沒有更改已登入店家後台操作，本批不把公開申請教學塞入後台指南。 |

新增 2 題（D12、I07），更新 5 題（C07、C08、E01、F08、F11），總數 85 題；本批 7 題登入後實際驗收全數待處理，與既有高風險待辦並存。不能用題數宣告全系統覆蓋。

### 本批直接來源

- C07／C08：`src/lib/liff/messages.ts`、`src/app/customer-login-form.tsx`、`src/app/(liff)/liff/onboarding/onboarding-form.tsx`、`src/server/services/verified-line-customer.ts`、`src/server/actions/customer-auth.ts`、`src/server/services/bind-line-to-customer.ts`。
- D12：`src/server/services/trial-care-plans.ts`、`src/app/(liff)/liff/wallets/shop/[planId]/page.tsx`、`src/app/(customer)/book/shop/[planId]/checkout/purchase-button.tsx`、`src/components/purchase-receipt.tsx`、`src/server/actions/wallet.ts`。
- E01：`src/server/queries/store-todos.ts`、`src/app/(dashboard)/dashboard/payments/page.tsx`、`src/app/(dashboard)/dashboard/payments/confirm-button.tsx`、`src/server/actions/transaction.ts`。
- F08／F11：`src/lib/trial-care.ts`、`src/server/services/trial-care.ts`、`src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx`。
- I07：`src/lib/alliance-subscription.ts`、`src/app/(dashboard)/dashboard/settings/plan/page.tsx`、`src/app/hq/dashboard/stores/organization/store-organization-manager.tsx`、`src/components/plan-package-notes.tsx`。

### 驗收邊界及下次接續

- 4 檔 21 項指南測試通過；核對來源路徑、搜尋、權限、模組、付款頁相關分類、串接費範例及既有面板行為。不等於登入後驗收。
- 瀏覽器連線正常，舊預覽 `/hq/login` 顯示 Email／密碼／登入表單，未登入。非互動執行不能取得安全登入輸入，故實際操作「受阻」，不是網站故障；未使用舊對話密碼繞過安全登入。
- 必要待補畫面：購買與待確認摘要、付款確認視窗、身分衝突及暫時故障差異、關懷待核帳略過紀錄、串接費說明。沒有製作或宣稱新實際截圖。
- 後續驗收只用已確認隔離、通知封鎖的測試環境；預覽網址本身不等於資料隔離證據。本次沒有新建顧客、送單、確認收款、發通知或修改資料。
- `operation-guide-audit-state.json` 記錄本次已盘點 main 及未驗收題目。下一次先搜尋開啟中的操作指南盤點 Draft PR，從其分支讀狀態，再比較 `lastInventoriedMainCommit..origin/main`；未合併草稿不應重複建立基準。
- 後續仍需盤查人員權限細節、通知個別失敗、SPA 儲值異動及既有高風險操作；這些未全部逐題核對，不宣稱沒有其他缺漏。

## 維護方式

每次功能或規則更新，同批檢查對應教學；客服出現新的反覆問題時補進待辦。每批以一組可完整驗收的情境推進，避免每天為了增加篇數而修改。

每篇需確認：實際入口、按鈕名稱、角色／權限／模組、前置條件、結果與不可做的事。文章以店家情境命名；複雜規則折疊於詳細說明，主要答案放在最前面。

教學分為：
- 怎麼操作：先說這個操作做什麼，再列可照做的步驟與可看到的結果。
- 為什麼：先直接解釋原因，再給下一步；不硬湊三個步驟或「已理解」式完成確認。
- 遇到問題：按檢查順序排除原因，重送前先查既有結果，保留錯誤資訊。

## 下一批實際驗收優先序

| 優先 | 情境 | 檢查重點 | 截圖 |
|---|---|---|---|
| 1 | 取消／未到／部分到店 | 狀態、保留堂數、補課期限、是否退款的界線 | 有分支選擇的確認視窗 |
| 2 | 紙本轉入／補登／調整／到期日 | 不重複營收、正確剩餘堂數、原因、日期限制 | 輸入與預覽結果 |
| 3 | 退款／撤銷閉店 | 保留中預約阻擋、試算、權限與下一日限制 | 試算與限制提示 |
| 4 | SPA 班表／多人結帳 | 原班表覆蓋、衝突不部分儲存、各人權益 | 班表與結帳方式 |
| 5 | 分析／匯出／通知 | 期間口徑、下載範圍、略過原因、不實際發訊息 | 必要篩選與紀錄 |

以測試資料操作；不使用正式顧客個資，不發實際通知。截圖需與同一預覽版本相符。

## 本輪來源對照

以下列出本輪補題與高風險改寫的直接依據，其餘篇目完整來源在 catalogue。

### A08 顧客沒來，如何標記未到？

- `src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx`
- `src/server/actions/booking.ts`

### A09 同行預約只來一部分的人，怎麼處理？

- `src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx`
- `src/server/actions/booking.ts`

### D04 方案到期日填錯，怎麼修改？

- `src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx`
- `src/server/actions/wallet.ts`

### D09 堂數記錄不符，如何核對與更正？

- `src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx`
- `src/server/actions/wallet.ts`

### E06 收款資料登記錯誤，從哪裡修正？

- `src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx`
- `src/server/actions/transaction.ts`

### E11 閉店金額填錯，可以重做嗎？

- `src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx`

### F08 顧客已購買或預約，還會收到體驗邀請嗎？

- `src/lib/trial-care.ts`
- `src/server/services/trial-care.ts`
- `src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx`

### I05 切換分店後，為什麼只能查看？

- `src/components/store-view-mode-switcher.tsx`
- `src/server/actions/store-view-mode.ts`
- `src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx`

### J09 服務人員請假，怎麼調整？

- `src/app/(dashboard)/dashboard/spa-staff/workspace.tsx`
- `src/server/actions/spa-resources.ts`

### D01 新方案要怎麼新增或修改？

- `src/app/(dashboard)/dashboard/plans/_components/plan-form-drawer.tsx`
- `src/server/actions/plan.ts`

### D05 不想讓顧客購買，應下架還是關閉公開購買？

- `src/app/(dashboard)/dashboard/plans/plan-publish-toggle.tsx`
- `src/app/(dashboard)/dashboard/plans/plan-active-toggle.tsx`

### D06 紙本舊客的剩餘堂數，怎麼轉進系統？

- `src/app/(dashboard)/dashboard/customers/[id]/migrate-paper-plan-dialog.tsx`
- `src/server/actions/wallet.ts`

### D08 已建好的方案，漏記紙本已使用堂數怎麼辦？

- `src/app/(dashboard)/dashboard/customers/[id]/backfill-used-sessions-form.tsx`
- `src/server/actions/wallet.ts`

### E03 方案還有剩餘堂數，怎麼登記退款？

- `src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx`
- `src/server/actions/transaction.ts`
- `src/lib/refund-plan.ts`

### H04 上個月體驗、這個月買方案，算在哪個月？

- `src/app/(dashboard)/dashboard/reports/page.tsx`
- `src/server/queries/conversion-metrics.ts`

### H05 營運資料如何匯出 Excel？

- `src/app/(dashboard)/dashboard/revenue/page.tsx`
- `src/app/(dashboard)/dashboard/data-export/page.tsx`
- `src/app/(dashboard)/dashboard/data-export/data-export-client.tsx`
- `src/lib/data-export-gate.ts`

### J10 多天班表一樣，能一次設定嗎？

- `src/app/(dashboard)/dashboard/spa-staff/workspace.tsx`
- `src/server/actions/spa-resources.ts`

### J11 SPA 服務完成後，怎麼收款或扣方案？

- `src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx`
- `src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx`
- `src/server/actions/spa-checkout.ts`


## 接續核對的六題

### D10 每一堂是預約中、已使用還是被註銷，在哪裡查？

- `src/app/(dashboard)/dashboard/customers/[id]/page.tsx`
- `src/components/wallet-session-detail.tsx`

### D11 只想作廢一堂未使用的堂數，怎麼處理？

- `src/app/(dashboard)/dashboard/customers/[id]/void-session-button.tsx`
- `src/components/wallet-session-detail.tsx`
- `src/server/actions/wallet.ts`

### F11 關懷紀錄顯示「已略過」，需要重新發送嗎？

- `src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx`
- `src/lib/trial-care.ts`

### J12 顧客有 SPA 方案，為什麼結帳時不能扣次？

- `src/server/spa-checkout-credit.ts`
- `src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx`
- `src/server/actions/spa-checkout.ts`

### J13 SPA 結帳顯示餘額不足或已經扣款，怎麼辦？

- `src/server/spa-checkout-credit.ts`
- `src/server/actions/spa-checkout.ts`
- `src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx`

### I06 分店選單為什麼沒有我想看的店？

- `src/lib/store.ts`
- `src/server/actions/store-view-mode.ts`
- `src/components/store-view-mode-switcher.tsx`



## 2026-09-16 正式發布授權

使用者授權將現有操作指南合併正式上線；開啟 production 入口，沿用原有模組及權限過濾。既有手機滑動與桌機視覺由使用者確認 pass；83 篇的程式來源已核對，但逐篇實際交易操作及補充截圖尚未全部完成，不宣稱全系統驗收通過。每日 Asia/Taipei 08:00 自動盤點已建立，後續內容變動先送草稿 PR 與預覽，不自動合併。


## 2026-09-24 SPA 專項補查

核對 main `4ef6c13678c2280e4f4402b4f276009b9d7e17c5`；新增 J14–J23 共 10 題、既有修訂 0 題，SPA 適用文章 52 → 62 題。來源與缺漏對照見 [SPA 專項盤點](spa-operation-guide-coverage.md)。沿用後台入口，包含店家引導會員／服務人員的操作說明；未新增 SPA 前台指南入口。10 題實際操作與新截圖待驗收；課程前台既有 16 題待辦保留。
