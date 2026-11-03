# PR #1500 Preview 設定方案與執行紀錄

日期：2026-11-03。修正分支：`fix/schedule-conflicts-20261103`。目前 PR head：`1ec32dc298b7f4a7293ba972173b88bd77c9a301`。

## 目標與目前證據

建立包含本次修正、可登入且資料隔離的 Vercel Preview，驗證音樂／運動／美業實際表單至後端資料的流程。正式 main、正式網域、正式資料庫、全站通知及 Cloudflare 設定均不在此調整範圍。

最新 head 的遠端 Typecheck、Changed-file ESLint、Targeted tests、Full Vitest baseline 及 sports-shared-card-postgres 全部通過。全量測試為 15,745 通過、261 跳過；跳過項目不算驗收完成。

Vercel `dpl_5AWrFfVCbJLBxYDq8pUbXbj9CWSX` 已證實在 `ci-migrate.mjs:144` 呼叫既有 scope gate 時拒絕分支，尚未建立資料庫 client 或進入 Next.js 建置。Cloudflare Workers 另回報失敗，目前只有摘要，無細部日誌；不能假定與 Vercel 同一原因，也不能將它列為通過或豁免。

## 最小程式調整（待實作）

1. `scripts/sports-shared-card-preview-scope.mjs`：在既有精確分支清單新增本修正分支。保留 repo owner/name、Vercel Preview、DB host/user/schema/query 限制與其他 provider 排除。此檢查也保護資料庫 client，不能只略過 build gate。
2. `scripts/sports-redesign-preview-scope.mjs`：在運動原生 Preview 分支清單新增本分支，保留既有環境及隔離 DB 限制。讓實際運動原生表單能測到永久系列判定。
3. `scripts/music-native-workflow-scope.mjs`：在既有隔離整合 Preview 的精確分支清單新增本分支，仍只允許 `store-lubymusic`；不新增正式店家資格，不修改 production 判斷。
4. `scripts/consultation-preview-scope.mjs` 與 `scripts/ci-migrate.mjs` 原則上不需放寬：確認分支專用 sports flags 會進入現有 `sports-redesign-preview` 路徑並於 migration 前退出。只有既有路徑實測不足時才提出額外差異，不使用通用放行。
5. 不改 `vercel.json` 的正式設定，不加入 `*` 白名單、不偽造部署來源、不讓未知分支通過。所有調整完成後一次推送，避免每條白名單各觸發一輪建置。

## Vercel 環境設定（只限本分支的 Preview target）

| 設定 | 預期值／限制 |
| --- | --- |
| `VERCEL_ENV`、repo、branch metadata | 由平台提供；必須為 Preview、正確 repo、本分支；不可人工偽裝 |
| `DATABASE_URL` / `DIRECT_URL` | 沿用既有隔離 Supabase 專案 `ttworfzgwejdeolegkxl`；兩者都須通過現有連線檢查。不得使用正式 `qijlnhtpbintanzpxkvf`，不得把值寫入 PR 或日誌 |
| `SPORTS_REDESIGN_STAGING` | `1` |
| `SPORTS_REDESIGN_PREVIEW` | `1` |
| `SPORTS_REDESIGN_PRODUCTION` / `SPORTS_LIVE_FLOW_QA` | 不設定；不借用正式或 localhost 模式 |
| `BEAUTY_MODULE_ENABLED` | `1`，只作用於本分支 |
| `BEAUTY_DATABASE_MODE` | `legacy`，使用隔離共用測試 DB；不接正式 dedicated DB |
| `BEAUTY_DATABASE_URL` / `BEAUTY_DATABASE_PASSWORD` / `BEAUTY_DATABASE_ROLE` | 本分支不得帶入；若存在衝突設定先停止，不能靜默降級 |
| `BEAUTY_NOTIFICATIONS_ENABLED` | `0`；同時保留 `runtime-env` 的 Preview 外送阻擋 |
| Beauty charge rules | 唯讀核對測試店既有資料與規則需求；需要時只設定本分支、精確驗收店 ID，不為了顯示畫面開放全模組 |

以上是目標設定，尚未證實目前部署已具備。禁止修改全域 Preview 預設或 production target；缺少安全儲存的測試連線時不以解密正式憑證補位。

## 建置前確認

- 確認隔離庫具有運動永久系列、音樂與美業本次需讀取的欄位／資料表。僅唯讀檢查；缺少 schema 時另提明確 migration 範圍，不讓建置自動補表。
- 運動沿用 `sports-live-flow-store`、音樂沿用 `store-lubymusic`；美業驗收店須從隔離資料及授權中確認，不能只因歷史腳本出現 ID 就假定仍可用。
- 取得有效測試登入。帳密只透過安全設定提供，不能從 PR、日誌、正式帳號或 auth secret 推導／偽造工作階段。
- 專用合成課程、教室、顧客、方案與 requestKey，與其他驗收者分開。保留原停發狀態，沒有真實扣款或外部通知。

## 必須補的守門測試

三組 scope 均驗證：本分支＋正確 repo＋Preview＋兩條隔離連線可通過；其他分支、production、錯 repo、正式 DB、只一條連線合格、WORKERS_CI_BRANCH／CF_PAGES_BRANCH、連線參數覆寫均拒絕。音樂另驗其他店家不能取得 native workflow；運動確認 runtime eligibility 與 builder 一致。

保留正式 main 的既有測試。驗證 migration dispatcher 進入既有 Preview 提前退出路徑，不能只測分支清單內容。外送測試須確認 Preview 的 LINE、email、美業通知與工作摘要仍被阻擋。

## 真實 Preview 驗收與完成條件

1. 固定同一份最終 head，僅建立一次必要 Preview；確認 deployment SHA、READY 與隔離／停發檢查。不能沿用舊 head 或用單元測試替代新部署。
2. 運動：取消某次固定課後安排單次／體驗成功；下一固定週仍阻擋。後續某週已有租借時，新增固定課指出該日期與占用時間。
3. 音樂：固定課後續撞課能顯示日期／老師／教室原因；確認使用 native 音樂入口，不能只驗共用純函式。
4. 美業：技師／位置與整理時間衝突可讀；取消、跨午夜與精確結束邊界正確；租借不搶占美業位置。美業固定週期仍未支援，不新增此功能。
5. 對照提交前後 DB：衝突後沒有部分建單、沒有扣堂或收款殘留；修改後重試只建立一筆。驗收後只清理本輪合成資料。
6. 桌機 1366×900、iPad 1024×768／768×1024：實際登入、長提示、保留輸入與重試。紀錄裝置模擬及未涵蓋範圍。

建置用量無法精確估算；使用一次整合推送與自動 Preview，不另手動重建。正式合併不在本方案執行範圍。

## 回復與仍待解事項

若 Preview gate、資料隔離或通知檢查不符，立即停止該依賴，不放寬 gate、不借用正式環境。取消失敗／不再需要的本分支 Preview；若需回復，只移除本次分支限定的白名單與環境設定，不影響其他分支或正式站。

Cloudflare 失敗需取得該 build 的日誌或由具權限者確認本次分支的建置用途；未取得前保持未解，不新增 Cloudflare 部署、不取消檢查、不當成歷史豁免。

## 使用者核准後的實作進度

使用者已明確確認依本方案實作。已完成本分支的 shared-card、sports redesign 與音樂 native scope 授權；新增常數共用精確分支名稱。

守門測試發現缺少運動 Preview opt-in 時，單靠白名單仍會進入舊共用模式。因此依方案第 4 點補強 consultation dispatcher：本分支必須進入 sports-redesign 檢查；缺任一必要開關即拒絕，不允許回退舊模式。`ci-migrate.mjs` 不需修改。

122 項 Preview／runtime／migration tripwire 測試通過，包含新分支的 LINE、email 與美業外送阻擋。音樂 scope 另以 Node test 驗證。本分支五項 Vercel 設定已建立並回讀確認，target 均只有 `preview`：運動兩個 opt-in 為 `1`，美業模組為 `1`、DB mode 為 `legacy`、通知為 `0`。未讀取或修改 DB Secrets、production／全域設定、Cloudflare 設定。

已透過 Supabase 連線唯讀確認既有 `steamfoot-preview` 專案健康、三個指定驗收店存在，以及永久系列／美業預約等必要資料表存在。未執行 migration、未改 schema。此查核不等同登入流程或所有 schema 欄位均通過驗收。

最新 Preview 的建置、登入及業務驗收結果須在推送後按實際 deployment SHA 補記；舊 head 的 CI 不當作新版結果。

## 首輪 hosted 登入驗收

`130fd77b` 的 Vercel Preview `dpl_D429fkc8jen1pG4h56b9i9ws1GQw` 已 READY，遠端 CI 與 PostgreSQL 驗收均通過；Cloudflare Workers 另失敗，仍未豁免。臨時分享存取經使用者明確授權後取得，連結與 cookie 不放入版本庫。

使用者同意沿用舊隔離驗收帳號、暫設密碼並必要時恢復啟用。沿用三個 `qa1469-20261030-*-owner`／對應 Staff，原本均為 SUSPENDED／INACTIVE／無密碼；不新增帳號，不修改既有角色或現用店長。驗收後須恢復原狀並清除暫存登入資料。

三模組正常登入皆已核對 storeId 與 OWNER 角色。運動與美業實際表單證據在 `hosted-130fd77b/`：運動 11/23 起固定課指出 11/30 14:00–15:15 的後續租借衝突；查回本輪專用教室 session／series 均為零。美業 11/23 14:30 預約正確顯示床位 14:00–15:15 占用及整理／租借緩衝，送出維持停用。此輪未提交付款或出席。

音樂已登入，但頁面讀取既有歷史匯入 pilot 方案時觸發舊分支 guard，出現 digest `2136953447`。修正採最小拒絕：本修正分支的 `isMusicPilotCard` 直接回傳 false，不讀取 pilot 驗收資料、不開放歷史匯入方案操作，讓唯讀卡片／課表摘要不因該 capability 拋例外；其他分支既有 guard 保留。新增測試確認讀取不觸碰 pilot SQL、請假補課寫入仍被拒絕。相關 10 項測試、ESLint 及完整 TypeScript 通過；新版仍需重新登入確認。
