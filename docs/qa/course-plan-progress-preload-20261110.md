# 顧客方案日期格預讀

範圍：顧客管理學員總覽；承接 main d7c8cf7856f095e911677918620e27b5a0259fc4。原有方案清單預讀保留，日期格接入共用 panel reader，15 秒有界顯示快取。每位最多預讀 5 張堂數卡，每次最多 2 張；點數卡與其他模組 adapter 不發出課程日期格讀取。列表沿用首 5 位閒置預讀與 pointer／focus／touch intent，不改顧客數、可見範圍及後端交易檢查。

購課／顧客更新事件清除所有修訂的日期格快取；換店、登入及角色沿用 OperationScope，讀取鍵另外包含 storeId、customerId、cardId、dataScope、修訂。重試清除原鍵；失敗不冒充全空白方案。後端額度、授權及交易規則未變。

已驗：6 檔 60 項 Vitest，包含實際 CourseCardProgress 與共用快取接合、預讀後開窗、權限／adapter 隔離、最多 5 張、購課失效及既有進度投影與錯誤重試。完整 TypeScript（NODE_OPTIONS=--max-old-space-size=8192）、修改檔 ESLint、git diff --check 通過。預設 Node heap 首次檢查不足，增加本機檢查 heap 後完成，未改產品設定。

本機瀏覽器合成資料預覽：1366×900、1024×768、768×1024；實際 hook／provider／grid、mock read endpoints 與最小 CSS，預讀後開窗及重開均不重送讀取，修改失效後重讀；8 格 1 個日期，無水平溢出。檢查腳本／截圖位於 /tmp/course-plan-preload-preview。此為資料流與窄容器回歸，並非完整正式頁樣式、真機或登入後業務驗收；無 hosted 前後延遲比較，不能宣稱改善秒數。

操作情境：01／05 冷暖與開關窗、06 scope、07 失效更新、08 窄容器、10 錯誤重試。02 搜尋、03 編輯、04 交易、09 功能開通不改行為，保留既有測試。未合併或部署本次修改，未執行正式業務寫入或啟用通知。
