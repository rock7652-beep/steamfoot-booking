# 運動購買意圖本機驗收

使用獨立 Docker `qa-course-intent-local`、PostgreSQL 16，僅綁定 127.0.0.1:55438，資料庫 `sports_live_flow_test`；本次僅使用合成門市、帳號與學員。Next 後台 3107 為本機開發程序，三個 intent 開關只設在其子程序；未使用遠端資料或部署環境。收入、交易及卡片均為測試資料。

- 真實 Auth 登入運動後台並開啟購買表單；1366×900、1024×768、768×1024 未見整頁水平溢出。
- 一筆 PREPARED 重開顯示待確認，安全取消後為 CANCELLED；該學員無交易、卡、收入。
- 購買請求在瀏覽器待送時暫停；另一分頁安全取消後放行晚到請求，後端拒絕，該學員無確認交易、卡、收入。見 delayed.json。
- 正常購買與購買伺服器回覆 200 後丟棄回應各一次；皆先顯示完成、重整仍保留待確認，測試按下 UI 確認，但未等待非同步完成；後續 DB 顯示兩筆 acknowledgedAt 均為空，不能說 ACK 已完成。各有一筆已確認交易、10 點／NT$1,000、一張卡餘 10 點；兩筆收入合計 NT$2,000。見 normal.json、lost.json。
- 選擇付款方式後一輪未送出：頁面一直顯示「正在確認購買狀態」直到 30 秒；資料庫沒有此筆 intent 或交易。另一測試送出遇到缺少所屬店長的明確失敗，保留 PREPARED，無交易或卡；唯讀重測 8 秒後未見 checking，捕捉的頁面讀取／action 有 200，但尚無法重現或斷言原超時原因。見 normal-first-failure.json、delayed-first-failure.json、delayed-second-failure.json。

限制：僅運動購買頁；音樂本機原生功能開關受既有部署及資料庫範圍檢查限制，不能以本輪宣稱音樂真實登入驗收；美業尚未執行。本機延遲樣本不代表正式環境效能；沒有驗收部署或遠端帳務。

本機 dev server 期間共用工作目錄有其他代理人持續修改，Turbopack 可能熱重載；啟動期間未重啟 server，但不同樣本不能視為完全同一程式快照。結束時 HEAD 為 `bdfbddbaa520e1784d07633cea56b016c5bf018e`，工作目錄仍有未提交修改；以下是結束時檔案 SHA-256，不能倒推每次請求的版本：

- purchase-recovery.tsx: `8b471932b94420bfd05dd8c9f96fd3b53079fe95ecfeb09d7c7aa7a68ca6fc6f`
- member-workspace.tsx: `351be17310352d2556adc3f8726070b02d7c5cb06872000e57bcd0dfafc9c7ae`
- course-purchase-intent.ts: `ab28e10f52935a53a2f3765be9bbd95ea7c88562a93213588e1bc3114119eb66`

後續針對回應遺失的合成交易重新由 UI 確認，等待提示消失，action 回應 200／success:true，DB acknowledgedAt 已寫入；正常購買那筆 DB acknowledgedAt 仍為空。見 ack-probe.json。首次 checking 逾時保存於 normal-first-failure.json；唯讀 checking-probe.json 未重現，不足以判定根因。

本次啟動的 dev server 已停止，臨時程式與含合成登入資訊的檔案已刪除；專用 Docker 容器已停止但保留，內部合成帳務仍可供後續稽核。未停止其他容器。
