# 加購商品密度與適用服務入口

基準：`f64aabb7`（同步遠端 main 後的本地修改，未發布）。

範圍：美業後台 `/dashboard/add-ons`、`/dashboard/settings/add-ons`，以及 HQ 店家視角重用的 AddOnFields。商品列從 56px 調整為 44px，保留字級與觸控高度；單卡上限 768px，多群組在容器寬 1000px 起並排兩欄。卡片標題下方以單一「勾選服務項目 · 已選 X 項／尚未指定」按鈕整合適用服務狀態與操作，直接展開既有 subjectIds 勾選控制。儲存資料及後端授權規則沿用既有實作。

驗證：`node scripts/qa/addon-density-browser.mjs`。Chromium 隔離元件 fixture，攔截所有請求；無正式帳號、資料庫、通知或交易。結果見 results.json。模擬 1366×900、1920×1080、1024×768、768×1024、390×844，含 240px 側欄預留（窄版除外）。檢查無整頁橫向溢出、商品列 44px、勾選數量更新、停用服務不可新增勾選、清除指定、編輯草稿跨尺寸保留與多卡欄數；截圖分別為收合版、iPad 尺寸服務展開版及窄版。

回歸：shared-add-ons-ui、add-ons-activation-ui、add-on-removal-ui、beauty-goods-service-mapping、course-add-ons-mapping-ui，共 5 檔 14 項通過；修改檔 ESLint 與 diff whitespace 檢查通過。同步後台操作指南。全專案型別檢查 `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --pretty false` 通過；首次使用 Node 預設 4GB heap 時耗盡記憶體，調整檢查程序上限後完成。

操作情境採用 05（就地展開並保留草稿）、08（尺寸與可讀性）、10（未指定服務狀態）；其餘情境無資料載入／交易／角色切換邏輯變更，不新增正式操作。

限制：僅隔離元件預覽與模擬尺寸，未驗真機、登入後完整儲存與重新讀取，未推送、建 PR 或部署。未宣稱正式站已上線。
