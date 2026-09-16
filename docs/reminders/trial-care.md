# 體驗客後續關懷

## 行為

- 提醒管理 → 顧客提醒；每店確認文案並啟用，預設總開關關閉。
- 三階段：第 1、4、10 天 10:00；階段開關 true、true、false。每店獨立編輯。
- 台灣日曆日計算；時間可設 09:00–20:55、每 5 分鐘；階段間隔至少 3 天。
- 只處理啟用後新完成、服務日期也在啟用日以後的體驗。不補歷史、不循環。
- 邀請前核對購買/儲值歷史（已用完仍算購買）與未來有效預約；第一封仍可關心。
- LINE 卡片固定提供停止 postback；簽章驗證後核對店家、token、LINE 接收人。
- 顧客停止持續有效；店家不能恢復；顧客可點停止回覆中的恢復接收。
- 店長可在最近紀錄中停止個別顧客關懷。
- 修改設定不補發已錯過的時段；關閉後重新啟用只納入新體驗。
- LINE 使用該店已驗證的 recipient；不回退中央 LINE。預覽、Demo 不發送。
- 到期 15 分鐘後不補發。DB 唯一鍵先領取，模糊結果不自動重送。

## 模組

- STEAMFOOT：FIRST_TRIAL 且 COMPLETED；新增 trialCareCompletedAt 僅新完成服務寫入。
- SPA：在單人結帳勾選「本次為體驗服務」，寫入 isTrial + completedAt；只處理 guestIndex=1 主要聯絡人。
- 課程模組不在本次起始主分支（85aa716a）的 IndustryModule enum 中。本 PR 不改動未合併課程分支；課程發佈前須加入其完成體驗、購買與下次預約 adapter，再驗收。未知模組不發送，不能宣稱課程已可使用。

## 部署

1. 先套用 additive migration 20260916090000_trial_care，包含三張表及兩個 nullable/default 欄位。
2. 三表 RLS enabled，沒有公開讀寫 policy，僅後端 DB 角色存取；customer/store composite FK 強制隔離。
3. 正式資料庫 migration 尚未套用；不要直接合併而略過此步。
4. 部署 cron /api/cron/trial-care（每 5 分鐘），CRON_SECRET 授權。
5. 所有店預設不啟用，須店家各自確認。不可批次代啟用。
6. 退訂仍依賴原有 LINE webhook 啟用且正常；上線前以專用測試接收人驗證實際卡片與 postback。

## 本輪验证

- 78 tests: policy、delivery、store actions、SPA checkout、existing LINE webhook store binding。
- TypeScript noEmit、Prisma schema validate、ESLint、git diff check。
- Supabase steamfoot-preview：migration 已套用；transaction 內驗證跨店 FK 拒絕、同階段 unique 拒絕，測試資料 rollback。
- 真實 LINE 外送尚未執行；不以 mock 測試冒充實際訊息收送驗收。

## 2026-09-16 本店方案卡片

三階段皆使用「查看本店方案」postback，核對店別、顧客 LINE 身分與通知 token 後，即時查詢公開資料。查看不修改退訂、不主動通知店長。每頁最多九個方案，另有查看更多；無公開方案顯示說明及聯繫入口。聯繫店長沿用「轉真人」訊息流程，實際接手依店家現有數位管家設定。

蒸足只展示 ServicePlan 的 PACKAGE、isActive、publicVisible；SPA 只展示上架且 publicVisible 的 SpaPackage，且適用服務仍啟用。SPA 新增公開展示開關，既有方案預設 false，複製方案也預設 false。未上線課程模組不查其他模組資料。SPA 儲值金為自由金額帳務，沒有可公開的固定儲值商品，因此不臆造儲值優惠。

部署前須先執行 20260916053215_trial_care_public_spa_packages migration。本次僅套用隔離預覽庫；正式庫未修改。LINE 真實收送尚待實測。
