# 方案格子入口與讀取修正

承接 PR #1536 / main f74815a7948e519f4964dceb7b31281ea15852ac。使用者反映方案仍等待、前台「我的方案」沒有格子，後台格子太大。沿用既有方案格子與預讀發布授權，修正未涵蓋的入口；不是另行增加帳務規則。

## 根因與改動

- 格子原先只出現在同電話群組首頁與後台；實際 CoursePortalClient 的 plans 入口未接。loadCoursePortal 現在用同一個已授權本店會員／課卡集合讀取不可變 GRANT 及出席／有效補登日期，傳入實際方案頁。真人前台及 HQ 唯讀前台預覽均使用這個 loader／元件。不從剩餘堂數或目前商品預設反推總格數；點數、資料不一致、未知來源維持完整紀錄，不偽造格子。
- 後台音樂方案原先走 Server Action，與其他操作排隊，只有運動使用獨立 card-read。現在兩者都使用原有授權服務的 GET；日期格亦透過唯讀 card-progress-read，維持 wallet/customer/booking 權限與門市／對象核對。課卡詳情及交易後端規則不變。
- 搜尋框持續聚焦原先會一直擋住閒置預讀。只在顧客列表允許結果穩定後仍保留搜尋焦點時預讀；編輯／pending／視窗開啟、離線及隱藏頁仍暫停。一般日曆與其他入口預設規則不變。
- CourseCardBrowser 首個 render 直接採用有效預讀結果，避免快取已備妥仍先等 effect 計時器。15 秒、scope 隔離及更新失效不變。
- 後台日期格依實際容器寬度排版：至少 640px 時每行最多 10 格，較窄時最多 5 格；高度 44px。前台維持 8 堂四格兩行、10 堂五格兩行及 48px 高度。

## 查核與驗證

- 正式 Supabase 唯讀核對截圖學員：本店單一卡片為 SESSION、非期初來源、GRANT=10、remaining=10、ATTENDED=0，應為 10 個空白格。未修改任何正式資料。
- 本機對應 CI targeted workflow 加受影響測試：216 檔、3,042 項通過。另含實際 CoursePortalClient 的 plans 頁（無同電話群組）、唯讀模式、8/10 格及未上課留白；獨立 HTTP transport／route 保留授權失敗；搜尋焦點預讀及既有日曆暫停規則；完整型別、ESLint、diff check 通過。
- 可重跑 scripts/qa/course-plan-entrypoint-grids-browser.mjs（PLAYWRIGHT_PATH 指向已安裝 Playwright）。使用實際 CoursePortalClient、CourseCardBrowser、CourseCardProgress、共用快取及完整 globals／portal CSS；合成資料，所有伺服器 action 禁止，HTTP 讀取 mock。預讀後開窗／重開只出現原先兩個讀取（cards/progress），不重送；沒有宣稱正式登入後首讀零延遲或改善秒數。
- 前台 390×844、360×800、768×1024，後台 1366×900、1024×768、768×1024、600×900。10 格在後台寬容器一行、484px 容器兩行；前台 10 格五欄／8 格四欄，未使用格留白，無整頁水平溢出，無瀏覽器執行錯誤。artifacts/course-plan-grid-entrypoints-20261110 保存代表截圖及完整結果。模擬尺寸不代表真機。
- 未取得使用者本機瀏覽器連線或正式登入測試憑證；正式端到端登入與延遲未實測。此次完整元件預覽比前次僅共用 grid fixture 多涵蓋實際方案入口，但仍不將合成預覽混稱正式業務驗收。

無 migration、無通知啟用、無正式出席／預約／金流寫入。候選分支僅停用自身自動 Vercel Preview（既有專用分支隔離不適用此新分支），不改 main 或隔離守門規則；正式發布狀態以 PR／部署證據更新為準。
