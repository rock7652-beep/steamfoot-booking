# 永久固定班容量一致性修正

原問題：後端接受capacity=1、指定兩位學員，來源及後續展課均2/1。一般介面會用指定人數當capacity；本次修正後端輸入檢查，未宣稱一般介面必然會超收。

僅修改sports-permanent-series：新增固定學員前檢查本批人數與既有未取消名額合計；逐次展課依該日期有效學員（排除已停課）核對容量，超額在建立課次前拒絕。保留原transaction及Store lock、不截斷名單、不變更一般店長allowOverCapacity例外、訂閱守衛或扣堂規則。

隔離驗收沿用先前重現資料與正常OWNER credentials登入，來源排課與加人透過既有HTTP Next Server Actions；課表GET觸發後續展課：

- 容量1指定1人，後續月份每課1/1，正常建立。
- 來源及後續滿班再加第二人拒絕，原名單不變。
- 開放選課最後一個名額，兩名學員並行送出，一成功一拒絕，不超收。
- 同一個超額輸入capacity=1指定2人現拒絕，來源課次0筆，交易回滾。
- 以SQL將已存在系列的learnerSnapshot設為兩人來模擬舊式超額資料，讀下一個未展開月份時拒絕，來源/已產生課次保持不變、未新增超額課。這段fixture不是正常UI操作；之前合法排課與加入均由真實授權action執行。

已知呈現界線：舊式超額系列展課拒絕會由既有課表錯誤頁顯示；本次沒有新增資料修復入口或更改視覺。驗收不證明正式站存在這種資料，未查改正式顧客。

5檔43項回歸、變更檔ESLint及TypeScript noEmit通過；涵蓋超額建立、既有名額、防止展課、正常不預扣、開放選課、原取消、調課及訂閱保護。

證據 artifacts/sports-capacity-fix-20261019/after.json、tests.log、source-hash.txt。完整截圖與腳本 /workspace/sports-capacity-fixed-20261019。本機localhost PostgreSQL16，沿用既有嚴格QA adapter，業務服務檔案與分支hash相同；不是正式/hosted Preview/實體多裝置驗收。

本次不處理其他疑點，未合併或部署、不執行正式migration。

隔離資料已還原至顧客0、預約0、固定系列0、原課次1，本機服務與容器已停止。審查分支在vercel.json停用Git部署，next.config.ts及ci-migrate.mjs對Vercel/Workers/Pages分支metadata先拒絕；三項拒絕檢查通過。main自動部署停用設定保持。
