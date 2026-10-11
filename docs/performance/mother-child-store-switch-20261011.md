# 母子店切換：即時回饋與重複授權查詢

## 範圍與已確認路徑

基底：`7ed83e66bfc04114c0f52814850182d5f2a19bd4`。

此入口是 `StoreViewModeSwitcher`／`ViewModeBanner` 呼叫 `switchViewedStore`，不是 HQ 的 `StoreSwitcher`。

1. 選擇目標店，呼叫 server action。
2. `requireStaffSession` 檢查登入與工作身分，`resolveAuthorizedConcreteStore` 驗證目標店營運狀態、母子店關係及多店資格。
3. 跨店檢視先持久化 audit outbox；再設定 `viewed-store-id`，並在同一 action `redirect(..., replace)`。返回本店則清除 cookie。
4. 目標 `/s/:slug/admin/dashboard/...` 由 proxy 注入路由資訊。伺服器重新驗證 route slug 與 store scope，載入 dashboard layout 與頁面資料。

原本選單只 disabled，仍留著舊頁面，沒有目標店的切換狀態。`dashboard/loading.tsx` 位於非同步 dashboard layout 下方，不能替 layout 自身尚未完成的查詢提供即時回饋。

`resolveAuthorizedConcreteStore` 原先先透過 `validateStoreAccess` 枚舉可存取店，再重查同一清單取回 slug/name。目標頁 layout 另外仍有 audit scope、店舖選單、功能、方案、訂閱提醒與頁面查詢。程式碼可確認重複工作與順序相依；沒有正式站 trace，因此不能將使用者回報的 3–5 秒量化歸因至某一查詢。

## 本次修正

- 點選後立即顯示「正在切換至…」及中性載入畫面，不把舊資料改標為新店。
- 共用鎖位於既有帳號／店別／模組／權限 keyed `OperationScope` 內；選單、收合入口與返回本店共用同步鎖，擋同一 tick 連點。
- 舊子樹保留掛載，但 hidden/inert；原生 modal dialog 同時阻止 portal 內舊店控制項的滑鼠與鍵盤操作。pending keyboard event 在 window capture 隔離，避免舊 drawer 的 document Escape／快捷鍵 listener 關閉畫面或觸發操作。新伺服器 scope 掛載後才開放。
- 沿用既有課程草稿離開檢查。選擇目前店不送出請求。
- action 明確回傳失敗時保留原店並恢復畫面；網路異常的 cookie 結果無法確認時維持鎖定，提供「重新載入確認」。Next.js redirect 控制流程用 `unstable_rethrow` 交還框架。
- 授權與 slug/name 使用同一次查詢結果。未新增跨請求快取、未放寬母子店唯讀、未改 cookie／redirect／audit 提交順序。原有 feature-entitlement 的 60 秒快取與失效規則維持不變；mocked 資格撤回測試證明 resolver 重新查核，不代表真實 entitlement 可繞過既有快取即時失效。
- 不修改 sidebar、dashboard layout 或 HQ 切店流程。

## 測試結果

- 17 個 focused regression suites、146 tests 通過。
- 涵蓋母子店／HQ 授權、停用／無權限、授權撤回、跨店寫入拒絕、cookie 與 redirect 順序、audit contract、read cache、操作狀態與返回位置。
- 新 UI 測試涵蓋立即 target feedback、舊資料 hidden/inert、同 tick 多入口連點、明確拒絕後重試、網路結果不明、舊回應晚到、A→B→A、唯讀子店、目前店 no-op、取消未儲存草稿離開、舊 panel 的 capture／bubble Escape listener 隔離及失敗恢復。
- 一層母子店的 mocked concrete authorization：修正後 4 次 Store 讀取（本店、子層、空的下一層、授權 DTO 清單），資格檢查一次。舊呼叫路徑會完整重複這四步。返回本店修正後一次新鮮狀態／DTO 查詢，且不枚舉下層店。這是 query-count 驗證，不是正式站耗時量測。
- 變更檔案 ESLint、`git diff --check` 通過。
- 全專案 TypeScript 執行遭 OS kill，exit 137，未通過亦未取得型別診斷，需 CI 完整確認。

## 尚待 Preview 驗收

jsdom 中原生 dialog top-layer 行為為 mock，並非 browser 驗收。本次環境的 Chromium 啟動已由同批 UI 驗收確認受作業環境限制；沒有宣稱 browser、真機或完整業務驗收通過。

在本 PR exact-head 的隔離 Preview 應驗證：

1. 1366px、寬螢幕、1024×768、768×1024；長店名、鍵盤／Escape、無整頁水平溢出。
2. 真實 Next server-action redirect 到目標路由後，店名、資料、模組、唯讀權限同時一致；返回母店後才恢復本店操作。
3. pending 時舊頁及 portaled drawer 不能操作；A→B→A、連点、切換失敗、斷線與重新載入皆不混店。
4. 記錄點選→首次 loading 呈現、action 授權／audit、目標 layout、首次目標資料的分段時間，分冷／暖查詢比較。首次網路讀取不承諾零等待。

本修正尚未對真實帳號、正式資料或 production latency 做量測。
