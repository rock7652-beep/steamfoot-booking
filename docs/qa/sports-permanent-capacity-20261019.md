# 永久固定班容量一致性修正

原問題：後端接受capacity=1、指定兩位學員，來源及後續展課均2/1。一般介面會用指定人數當capacity；本次修正後端輸入檢查，未宣稱一般介面必然會超收。

僅修改sports-permanent-series：新增固定學員前檢查本批人數與既有未取消名額合計；逐次展課依該日期有效學員（排除已停課）核對容量，超額在建立課次前拒絕。保留原transaction及Store lock、不截斷名單、不變更一般店長allowOverCapacity例外、訂閱守衛或扣堂規則。

隔離驗收沿用先前重現資料與正常OWNER credentials登入，來源排課與加人透過既有HTTP Next Server Actions；課表GET觸發後續展課：

- 容量1指定1人，後續月份每課1/1，正常建立。
- 來源及後續滿班再加第二人拒絕，原名單不變。
- 開放選課最後一個名額，兩名學員並行送出，一成功一拒絕，不超收。
- 同一個超額輸入capacity=1指定2人現拒絕，來源課次0筆，交易回滾。
- 以SQL將已存在系列的learnerSnapshot設為兩人來模擬舊式超額資料，讀下一個未展開月份時拒絕，來源/已產生課次保持不變、未新增超額課。這段fixture不是正常UI操作；之前合法排課與加入均由真實授權action執行。

審查後修正：舊式超額系列的容量拒絕仍先讓整筆展課交易回滾；ensureSportsMonth 僅捕捉專屬容量錯誤，回傳非阻斷提示。首次頁面繼續讀取原課表，切換月份的同步 action 亦攜帶提示並繼續權威讀取。提示置於課表上方，不用通用錯誤頁；權限、其他驗證、撞課與 DB 錯誤照原流程拋出，不隱藏。沒有新增資料修復入口，不宣稱正式存在超額資料。

補驗（artifacts/sports-capacity-readable-20261019）：正常 OWNER 登入及既有 actions，超額新建拒絕、正常指定班展課、滿班加人拒絕、最後名額並行一成功一失敗均通過。SQL 僅模擬隔離舊系列名單超額；首次讀三月顯示容量提示且既有 11 筆課次完全不變，回到一月可讀既有課表，再由日期欄切四月仍顯示課表與提示、不產生超額課。隔離 fixture 修正後切五月展課恢復且提示清除。桌機1366×1024、iPad1024×768及768×1024確認提示首屏可見、無頁面橫向溢出；Chromium pageerror 0。實體 Safari 未驗。

新回歸6檔57項、變更檔ESLint、TypeScript noEmit通過，另補容量警告的頁面傳遞與非容量錯誤不得吞掉的測試。原 after.json 保留修正前錯誤頁歷史結果；最新結果請讀 readable 目錄。React 檢查沿用既有狀態與讀取器、保留過期請求防護，提示 role=status，不新增套件。

5檔43項回歸、變更檔ESLint及TypeScript noEmit通過；涵蓋超額建立、既有名額、防止展課、正常不預扣、開放選課、原取消、調課及訂閱保護。

證據 artifacts/sports-capacity-fix-20261019/after.json、tests.log、source-hash.txt。完整截圖與腳本 /workspace/sports-capacity-fixed-20261019。本機localhost PostgreSQL16，沿用既有嚴格QA adapter，業務服務檔案與分支hash相同；不是正式/hosted Preview/實體多裝置驗收。

本次不處理其他疑點，未合併或部署、不執行正式migration。

隔離資料已還原至顧客0、預約0、固定系列0、原課次1，本機服務與容器已停止。審查分支在vercel.json停用Git部署，next.config.ts及ci-migrate.mjs對Vercel/Workers/Pages分支metadata先拒絕；三項拒絕檢查通過。main自動部署停用設定保持。
