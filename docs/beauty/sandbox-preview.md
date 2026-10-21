# 美業專用對外測試站（2026-10-20）

## 狀態與入口

已依使用者授權建立獨立 Vercel Sandbox，**正式站沒有合併、部署或啟用美業**。本測試站不是既有 Vercel Preview，也沒有連到正式／共用 Supabase。

入口：`https://sb-5xmothc5nvzv.vercel.run`。

| 身分 | 網址 | 測試帳號 |
|---|---|---|
| 店長 | [/hq/login?store=beauty-1374-qa](https://sb-5xmothc5nvzv.vercel.run/hq/login?store=beauty-1374-qa) | `owner@beauty-1374.invalid` |
| 技師 | [/s/beauty-1374-qa/beauty?work=1](https://sb-5xmothc5nvzv.vercel.run/s/beauty-1374-qa/beauty?work=1) | 手機 `0900001376`；登入後可點「我的工作」 |
| 顧客 | [/s/beauty-1374-qa/beauty](https://sb-5xmothc5nvzv.vercel.run/s/beauty-1374-qa/beauty) | 手機 `0900001375` |
| 公開體驗 | [/beauty-trial/beauty-1374-qa](https://sb-5xmothc5nvzv.vercel.run/beauty-trial/beauty-1374-qa) | 不需測試帳號，可測多人不同服務 |

對外測試帳號已另換密碼，**不使用 repository seed 的已知預設密碼**；密碼只在本次對話交付，不寫入 repository。DB password、AUTH secret 與加密 key 均在專用 VM 產生，沒有複製正式環境的值。

本 session 的期限為 **2026-10-21 15:34:30 UTC／台灣時間 2026-10-21 23:34:30**，不是永久測試站。Sandbox 名稱 `beauty-pr1374-review-20261020`，session `sbx_e2h4eUwFKeeOyUrx6DPcFOCYv4IF`，對外只開應用 3000 埠；PostgreSQL 18.6 僅監聽 VM 內 `127.0.0.1:32768`。超時停止後，檔案可保留一份 snapshot，但程序不會保留；恢復時須重新啟動 PostgreSQL 與 Next，再核對當次 HTTPS route，不能把舊網址仍存在當作服務已運作。

## 隔離與實作

- 專用 VM、全新 PostgreSQL `beauty_1374_qa`、合成店家與合成帳號；沒有匯入正式或其他任務的顧客／預約資料。店家共用的是程式能力，不是正式資料。
- 以本支線完整 main／course Prisma schema 產生空白 SQL，再執行美業候選。backend `beauty_1374_app` 為 LOGIN、非 superuser、沒有 BYPASSRLS；美業13表實際 RLS 已核對。這仍不等於正式 PostgreSQL17／Supabase pooler、自訂 triggers 與既有 migration 歷史全部相容。
- `BEAUTY_SANDBOX_QA=1` 只接受此任務的固定 HTTPS origin、專用 loopback DB／backend、development runtime、無 hosted deployment metadata、通知總開關0。任意其他 sandbox、遠端／正式 DB、production、通知開啟均拒絕。既有 hosted migration／部署守衛保留。
- Sandbox 在 Next dev 前終止 HTTPS；task-only rewrite helper 使用 Next 內部相同 origin，防止 Auth.js 改寫 public origin 後又經網路重入 proxy。沒有使用不受支援的 Next config，也沒有改正式路由行為、信任任意 client 權限 header 或跳過登入／店別檢查。
- 外部瀏覽器實測發現美業手機登入仍先導向舊 `/book`，App Router 導向循環使前台無法使用；`customerLoginAction` 現在依權威店家模組，讓美業直接進 `/beauty`，運動／蒸足保持 `/book`。實際 credentials provider 與會員驗證仍照原流程。
- 目前只提供帳密登入驗收；LINE Login／Google 按鈕所需的外部測試通道尚未綁定，不能將按鈕存在當作串接成功。

## 已通過的外部驗收

`scripts/qa/beauty-sandbox-browser.mjs` 在專用 VM 的原生 Chrome 155，以公開 HTTPS 網址操作（非 localhost、非元件 fixture、非 session／Server Action mock）。瀏覽器正常驗證 TLS，沒有使用 ignoreHTTPSErrors 或關閉憑證檢查。

1. 公開體驗同筆2人：分別做臉60分鐘（整理15分鐘）與按摩90分鐘，逐人選技師性別；整筆成功。
2. 店長在真實後台表單登入，看到上述兩個服務項目；390×844手機、1024×768 iPad尺寸、1440×900桌機沒有整頁橫向溢出。
3. 顧客從真正的手機／密碼表單登入，再查共同時間並完成預約。
4. 技師也從真正的手機／密碼表單登入，點「我的工作」、完成本人服務；顧客重新進前台能看到已完成。

最後一輪 page error 0。另以受限 backend 查遠端 DB，核對當輪3筆服務、2個群組、1筆完成、13張 RLS 表、待發通知0；資料庫查核獨立於瀏覽器結果。先前 [本機9項交易與12個情境](live-acceptance.md) 的證據仍分開保留，沒有將它們寫成這次全數重新執行。

- [外部瀏覽器結果](evidence/sandbox/results.json)、[獨立遠端資料庫查核](evidence/sandbox/database-verification.json)
- [店長手機](evidence/sandbox/manager-phone.png)、[iPad尺寸](evidence/sandbox/manager-ipad.png)、[桌機](evidence/sandbox/manager-desktop.png)
- [公開多人體驗](evidence/sandbox/public-party-phone.png)、[顧客預約成功](evidence/sandbox/member-booked-phone.png)
- [技師服務](evidence/sandbox/technician-phone.png)、[顧客完成狀態](evidence/sandbox/member-completed-phone.png)

指定回歸：9檔／93項通過，含美業與既有 scope／proxy、人員登入來源與3種模組的手機登入導向。TypeScript noEmit、git diff --check 通過；變更來源 ESLint 0 errors，`customer-auth.ts` 有2個既有 unused helper warnings，沒有將既有 warning 寫成新增問題已清除。未重新執行整套11,282項，因為本次修改集中於隔離環境及登入導向。

本機 executor 的瀏覽器 CA store 與代理憑證不同，不能把驗收工具的 TLS 問題當作店家網址錯誤。曾嘗試以 Node 的正常 TLS transport 轉送，卻不能完整代表 dev HMR；最後改為上述 VM 原生瀏覽器並重跑通過。截圖環境也補齊中文字型後重跑，不以缺字方框當作視覺驗收通過。

## 重現與恢復

在相同專用 VM 中安裝 lockfile 相依、執行 `npm run generate:clients`、建空白 schema 與 candidate，並以 `.env.local` 設定固定 origin、專用 DB／role、隨機 AUTH secret／加密 key，通知總開關維持0。執行 seed 後另換對外測試密碼；不要把 seed 的預設密碼公開使用。

Next 啟動：`node node_modules/next/dist/bin/next dev --hostname 0.0.0.0 --port 3000`。Next 自己載入 `.env.local`；不要把 Node `--env-file` 傳給 Next 的 fork 設定。資料 seed／獨立 DB 查核可使用 `node --env-file=.env.local --import tsx ...`。

瀏覽器驗收：提供 `QA_BEAUTY_REVIEW_PASSWORD`，執行 `node scripts/qa/beauty-sandbox-browser.mjs`；Playwright／Chrome 可用 `QA_PLAYWRIGHT_MODULE`、`QA_CHROMIUM_EXECUTABLE` 指定，輸出用 `QA_BEAUTY_SANDBOX_OUTPUT`。QA 工具安裝在 `/tmp`，沒有新增產品正式相依套件。原工作目錄與其他任務的容器／支線未動。

## 尚未完成與最重要下一步

LINE 申請期間另已補完 [帳務與家人共用方案瀏覽器驗收](commerce-acceptance.md)：8項實際操作與資料庫核對通過，並補上月結服務時間／顧客辨識；這不代表 LINE 已啟用或全部帳務情境已驗收。

後續 [撤權、低權限與跨店隔離補驗](security-acceptance.md) 16組已通過，含真正HTTP action、舊登入撤權、RSC收入停止回傳及拒絕後資料摘要核對；路由層與action拒絕分開記錄，未宣稱所有撤權競爭時序或正式資料庫已驗證。

[取消／未到、恢復與更正補驗](debit-acceptance.md) 10組／61個檢查點亦已通過，包含四種扣次組合、舊預約規則快照、重送、家人最後一次、撞約與結清後禁止恢復；原店家設定已還原，並非正式啟用證據。

[多人同行分項操作補驗](party-acceptance.md) 11組已通過：不同服務分項改期、部分取消、跨分項日期合併收款、單項退款，以及超收／已取消舊選取的整筆回滾；主要操作使用真正三端瀏覽器，重送與偽造舊選取另以真正HTTP核對。

**真實 LINE 登入及通知送達：尚未實測。** 任務環境沒有綁定本次核准的測試通道／收件人。既有 Vercel 的 LINE 變數同時涉及既有門市與正式用途，不能因為有變數就認定是美業測試帳號；本輪只讀取變數名稱與 target metadata，未將其值複製到 VM。

下一步需指定測試用官方帳號、相同 Provider 下的 Login／Messaging channel、允許的測試收件人，並透過環境設定綁定憑證。測試 LINE Login callback 為 `https://sb-5xmothc5nvzv.vercel.run/api/auth/callback/line`；正式既有 callback／webhook 不改。取得測試設定後，才能安排真人授權登入、核對已驗證 LINE 身分，並建立僅限本店及指定收件人的送達驗收。現在的全域／店家通知與共用外發 guard 仍封鎖，不能把 SKIPPED、事件建立或合成 entry 說成已送達。

正式啟用仍另行處理；實體手機／iOS Safari 驗收、真實 LINE 送達、正式 schema／pooler 驗證與所有帳務視窗逐項點選，並未因這個對外網址而自動完成。
