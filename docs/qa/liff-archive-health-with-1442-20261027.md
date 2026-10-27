# PR #1442 整合驗收

範圍：美業未選店時返回 HQ；LIFF 門市清單排除封存門市，並於切換 action 重查；移除新增健康量測下方「填寫順序與網頁版相同」。封存保留既有會員身分及歷史資料；目前門市封存而只剩一間有效門市時，仍顯示切換控制。

## 整合與回歸

基準 main 7251c0f4，原 #1442 f84b9cbb。兩組修改無重疊檔案，本次 patch 可直接套用，無衝突。

整合 12 檔 96 項測試通過：LIFF 清單與後端拒絕封存選項／fallback、唯一有效門市切換、健康紀錄與更新、HQ 美業頁 guard、權限與 store-view。TypeScript noEmit、變更檔案 ESLint、git diff --check 通過。未修改資料庫結構或既有紀錄。

## 本機 Preview

使用目前 NewLiffHealthRecordPage、HealthRecordForm、LiffStoreSwitcher 實際元件，以 esbuild 建立本機 Preview。伺服器資料與 actions 為明確標示的模擬資料，無資料庫連線，不儲存業務資料。

Chrome 模擬 viewport：360×800、390×844、768×1024、1024×768、1366×900。各尺寸 scrollWidth 等於 viewport 寬度，門市選單未超出視窗，標題下方提示已移除。390px 截圖目視確認欄位可讀。輸入體重 63.5 後切換 iPad 尺寸保留輸入。模擬目前店已封存、剩一間有效店時，切換控制可展開並提交唯一有效選項。瀏覽器無 warning/error。

限制：上述為本機實際元件＋模擬資料及 Chrome viewport 驗收，不是 Safari、真實 LINE LIFF 或真機驗收；未登入 Preview 重現 HQ cookie 切換的完整業務流程。美業返回 HQ 以原 guard 與 action 權限回歸測試驗證，正式部署後另檢查可用登入工作階段。未在本機執行會連線資料庫的完整 build。
