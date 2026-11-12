# 顧客管理與預約名單的方案詳情預讀補修

問題：#1559 改善總覽和同次載入，但方案詳情仍使用 TTL 0、只去重在途請求；完成的 intent 預讀沒有在開窗時沿用。名單的顧客方案清單預讀，也不是點擊所讀的 roster-customer 視窗入口。使用者於正式操作回報兩處仍等待，不能將上一版當成整條操作已驗收。

修改：
- 原生音樂／運動詳情共用 store／revision 隔離的 15 秒展示 reader，原生 GET 避開 Server Action 排隊。顧客 idle 預讀連同前 5 份完整詳情、每批 2 併發；已顯示方案與歷史／換頁同樣準備前 5 份，其他方案 pointer／focus／touch 優先預讀。開窗同步讀取新鮮快取，不先插入讀取占位；已過 15 秒的完整詳情沿用共用 reader 最多額外 60 秒的展示快照，同時重新查詢，修改／修訂則清除全部快照。
- 名單前 5 位學員以 scoped GET 預讀學員視窗、指定卡與進度，點擊共用同份 15 秒展示快照；無指定卡的合計方案入口也準備顧客視窗與同店方案清單；姓名／方案、課次、店家、dataScope 均納入鍵。名單狀態／餘額改變更換 scope，交易開始清除；顧客／財務修改共用失效也清除此 reader，重試強制作廢舊回應。
- 原始後端資格、顧客、錢包、課次與綁卡檢查不變；展示快取不授權收款、扣堂、期限或餘額修改。inline financial fresh=true 路徑仍無條件作廢並讀取當下狀態。未啟用完整詳情預讀的外部 adapter 保留原 TTL 0；依使用者後續指示，原生美業明確啟用同店、同修訂的完整詳情展示快照，沿用美業讀取及交易服務。
- 冷開、網路尚未完成、超過短期有效期限或修改後，仍可能需要讀取；不承諾任何網路條件都零等待。預讀有界，不抓整店或無限歷史。

本機驗證：
- 真實共用 reader／detail hook／RosterCustomerPanel 驗證已預讀後首次顯示完整方案、無占位且無額外請求；修訂會重新查詢。名單換人晚到隔離、失敗重試與原有跨店／綁卡拒絕保持。
- 合成 Chromium，1366×900、1024×768、768×1024，音樂／運動從顧客總覽點進詳情：準備 1 次清單含進度＋1 次完整詳情，開窗與點擊不再新增請求；10 格 1 個完成日期，無頁面水平溢出。腳本 customer-overview-preload-browser.mjs 已擴充至點擊詳情，截圖／結果 /tmp/customer-overview-preload-ui。這是共用真實元件／hook 的隔離合成驗證，非完整正式登入／實體 iPad。
- 正式發布、最終 CI 數量、版本與網域核對記錄於本補修 PR。沒有修改正式顧客、方案、教師費、點名、通知或資料庫 schema。

收尾證據：11 檔／164 項相關測試通過。另以真實 RosterCustomerPanel＋CourseMemberWorkspace，在 1366×900、1920×1080、1024×768、768×1024 的隔離名單預覽，先完成 1 次 bundle，再點擊指定方案；10 格／1 日期直接顯示，沒有學員、詳情或進度讀取占位，也沒有第二次名單請求。相同腳本的分頁、滑鼠／鍵盤排序與教師分頁回歸仍通過。腳本 course-management-cleanup-browser.mjs、截圖 /tmp/course-management-cleanup-browser/roster-detail-*.png。沒有使用正式資料或正式寫入。

合計／無指定卡入口補驗：名單學員預讀不再限於綁卡列；原生方案清單預讀帶入同一 storeId 與 booking.read 能力，使其 reader 鍵與學員視窗一致。姓名操作的 intent 同時準備該課次的顧客視窗。3 檔／75 項回歸與變更 ESLint 通過。

擴大驗收補齊：course-growth-panel-loading 的課程 harness 原本仍使用舊 TTL 0 reader，與真實詳情入口已不一致；改用同一完整詳情 reader，重開期望沿用有效快照，保留在途去重、錯誤／空卡重試、換卡晚到隔離，營運顧客抽屜原規則不變。該檔及詳情快照 2 檔／13 項與 ESLint 通過。

## 蒸足與美業一併盤點／補修

| 模組／入口 | 發現與處理 |
| --- | --- |
| 蒸足顧客管理 | 已有當頁／intent 短期預讀，getCustomerDrawerDetailAction 一次帶入 panelSummary 與 usageProgress；保留既有路徑。 |
| 蒸足預約詳情 → 顧客／方案 | 原本點擊後才讀 getCustomerPanelContext。補同權限 scoped GET 及前 5 位／intent 預讀，CustomerInlineDetail 同步採用完整快照；booking／slots 修訂隔離，修改／重試作廢；JSON 日期欄位還原成原元件的 Date，使用進度與摘要的字串日期保留。 |
| 美業顧客管理 → 方案詳情 | 原生 adapter 啟用完整詳情展示預讀，清單、詳情與進度同店共用；會員／LINE 支援摘要一併準備，已準備資料直接顯示。未啟用此能力的 adapter 維持舊來源／TTL 0。 |
| 美業預約名單 → 顧客 | 移除預讀舊顧客視窗的閒置入口，改預讀實際新版顧客工作區使用的來源、方案與使用紀錄；姓名 pointer／focus／touch 優先準備。服務／收款操作開始及成功後清除展示快取，交易仍由既有美業服務權威核對。 |

補驗：13 檔／79 項通過，含新增蒸足 context transport／日期與 header／拒絕、真實 inline 預讀後無第二次讀取、美業 adapter 與服務／加做收款回歸。隔離 Chromium 中，美業在 1366×900、1024×768、768×1024 準備 cards、support、完整 cards detail、progress 四項後，開窗與點擊詳情零額外請求；蒸足在上述尺寸及 1920×1080，實際 CustomerInlineDetail＋CustomerDetailDrawerContent 一次完整 context 後顯示方案／日期格，無第二次請求。截圖 steam-detail-*、detail-beauty-* 位於原兩組 /tmp 驗收輸出。不宣稱正式登入業務或實機 iPad。

擴大收尾：實際美業顧客／名單／蒸足預約視窗的 12 檔／101 項消費者回歸通過；會員／LINE 支援用真實 DeferredCustomerSupport 驗證預讀後直接顯示、客戶資料失效後重新讀取。完整 TypeScript 通過，變更 ESLint 無錯誤；booking-detail-drawer.tsx 保留 4 個原有未使用變數警告。蒸足只修預約內顧客的讀取，不更換已正常預讀的顧客清單，也未改方案計算或交易。
