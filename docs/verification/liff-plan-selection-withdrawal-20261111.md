# LIFF 方案選擇與提領原因選填

基準：正式主線 `fc5e525e2953c7e05473eee2f60a01a97e20d0bf`，既有方案選擇來源 PR #1495。使用者要求檢查蒸足、運動、音樂、美業 LIFF，並將提領原因改為選填；於完成本機驗證後回覆「好」，授權合併與發布這一批。

## 問題與變更

- 蒸足 LIFF 下拉選項原本只顯示名稱，同名方案無法在選擇前分辨。現在同時顯示可用堂數與到期日／無期限。
- 美業 LIFF 首頁原本未在身分驗證後分流至美業會員頁。現在與課程一樣，在讀取蒸足摘要前分流；一般首頁前往美業會員頁，有預約意圖則前往預約分頁。
- 直接開啟 `/s/[slug]/liff/member-booking` 時，依後端查得的模組初始化同一套 LINE 驗證入口，讓運動／音樂與美業進入自己的會員預約頁。蒸足維持既有表單。
- 現金抽屜提領原因選填，前端移除 required/minLength，action 與 service 均接受省略、空字串、空白字元，未填儲存空字串。補入與調整原因維持必填，金額、權限、閉店鎖定與現金方向沿用既有規則。
- 同步現金抽屜規格及店家操作說明，不新增會員前台指南。

## 資料查核與限制

正式資料僅唯讀查核。回報個案目前有三張可預約方案，分別可用 1、8、4 堂，沒有可用補課券，按目前程式應顯示多方案選單；原回報的「整個選單不出現」尚未透過本人 LINE 工作階段重現，因此本批不宣稱已確認該現象的單一根因。測試使用匿名合成方案及相同餘額分布，不保存真實會員識別或憑證。

## 驗證

- LIFF 及相關課程／美業／WalletSession 回歸：52 檔 674 項通過。
- 現金抽屜回歸：12 檔 153 項通過。
- 全專案 TypeScript、修改檔案 ESLint、git diff --check 通過。
- 實際 React 元件、模擬 actions、網路全部攔截：蒸足 44 組，運動／音樂／美業 12 組，現金抽屜 4 種尺寸。方案切換後送出 ID 正確；提領未填、空白、填原因均能傳入模擬 action。
- 模擬尺寸：LIFF 360／390／768／1366；現金抽屜 360／768／1024／1366。包含桌機與 iPad 寬度，未驗真實裝置／LINE 真機、正式預約、正式提領交易或通知外發。
- UI 依操作情境 04、06、08、10 驗證選擇、權威驗證邊界、錯誤及窄版排列；本批不調整課表載入效能、搜尋、後台側欄狀態或 HQ 三態。
- 瀏覽器腳本：`scripts/qa/liff-makeup-confirmation-browser.mjs`、`scripts/qa/liff-module-plan-selection-browser.mjs`、`scripts/qa/cash-withdrawal-optional-reason-browser.mjs`。Playwright 與 Chromium 路徑可透過環境變數指定。
- 完整本機截圖：`artifacts/liff-plan-selection-20261111/`、`artifacts/withdrawal-optional-reason-20261111/`；結果 JSON 與代表截圖隨本次提交保留，bundle/CSS 不提交。

## 發布範圍

本分支明確停用 Vercel Git 自動預覽，沿用 main 原有手動發布方式，不修改全域部署或 Secrets。PR 觸發既有 CI 與現金財務隔離 PostgreSQL 流程。沒有 schema、migration、正式資料修補或通知設定變更；不觸發任何 one-time 正式資料流程。Cloudflare 不是此次修正的必要依賴；正式目標以 Vercel project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR` 及 main 既有正式 alias 為準。

合併與部署結果以 PR、CI 及 Vercel deployment 的實際 SHA／狀態核對，不能以本機通過取代上線證據。
