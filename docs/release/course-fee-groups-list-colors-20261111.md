# 收費分組與全模組清單底色：待發布版本

使用者同意兩項介面結果，並於 2026-11-11 要求整理發布版本與檢查結果。本次建立審查 PR，尚未取得／執行此次正式合併發布。顧客舊方案科目核對不包含在發布作業內。

## 版本與範圍

- 分支 feat/course-fee-groups-20261111；正式基底 origin/main `5ff62e699540c682ac85a087665542a87323ad96`，接續已發布 PR1538／1541；fetch 後基底沒有新增變動。
- 音樂／原生運動：收費清單依實際教學項目分組，直接進入時保留項目標題與篩選，新增帶入項目；舊 OPEN／未對應科目另列待核對，不以名稱或老師推定。美業既有服務分組保留。
- 全模組共用清單：白底 #ffffff、交錯 #fbfaf8、hover #f7f5f1；選取、停用、警示保持優先。69 個直接引用來源（含 stylesheet）與共用元件覆蓋明細見全模組驗收資料夾。
- 顧客卡片／堂數／方案歸屬、權限、資料庫結構、登入及通知沒有變更；無 migration、無正式資料寫入。
- Framework 第12節與後台 C172 指南已同步。

## 已驗證

- 分組／篩選／已知與未對應科目隔離、關閉編輯與 resize 保留狀態、新增項目帶入、返回教學項目再進收費、音樂分組、無結果。
- 共用清單白／灰／hover 的計算色值、整列及固定欄一致、語意底色優先、鍵盤選取、篩選／排序／分頁、隱藏列與展開，以及課表排除。
- 模擬 Chromium：桌機1366、1920；iPad1024×768、768×1024；窄版600及共用清單手機390、360，無整頁水平溢出。這是合成元件測試，不是實體iPad、Safari或正式帳號驗收。
- 最終相關 Vitest 9 檔案／45 測試；ESLint 全變更 JS/TS 無錯誤，保留7個既有未使用變數警告；最終本機TypeScript與git diff --check通過；遠端CI另以PR最新檢查為準。
- Vercel、Workers、Cloudflare三種審查分支環境各以空環境執行ci-migrate，皆在資料庫工作前拒絕。

## 預覽與CI副作用

- 重用 artifacts/course-fee-groups-20261111 與 artifacts/global-list-colors-20261111 的本機隔離預覽，不建立帶正式資料庫的新 hosted preview。server actions在fixture中封鎖，不發送通知。
- 本審查分支加入既有 Vercel deploymentEnabled:false 清單，ci-migrate加入審查分支拒絕；main正式手動發布路徑不受影響。保留所有既有停發與部署設定。
- PR會執行既有GitHub Actions，可能使用CI額度；不額外手動觸發雲端建置。CI最終狀態以PR head的checks為準。
- 未執行正式Next/Vercel建置；審查分支預期拒絕hosted build。未宣稱真實登入、正式資料筆數或所有頁面逐一驗收。
- Cloudflare路由不是這次UI差異的發布依賴，未操作外部路由或供應商權限。

## 原始證據

- [收費分組](../../artifacts/course-fee-groups-20261111/README.md)
- [全模組清單](../../artifacts/global-list-colors-20261111/README.md)

下一步：PR檢查完成後由使用者確認正式上線；獲授權再由助理合併並核對正式部署。舊方案適用項目須另核對，不隨介面發布自動回填。
