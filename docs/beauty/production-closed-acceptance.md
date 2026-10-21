# Production build與美業關閉回歸

日期2026-10-21；起始版本 `64b2745b`，本輪變更見同一Draft PR #1374。**真正本機production編譯及runtime已驗；正式未部署、未套SQL、未改店家開關。** 專用對外Sandbox繼續使用原development／PG18.6，本輪另建loopback PG17.11與3115埠，沒有重建其資料庫。

## 結果與證據

| 範圍 | 實測結果 | 證據／限制 |
|---|---|---|
| 完整production build | `npm run build` exit 0，136.166秒，Next16.2.2／Turbopack、TypeScript通過；232靜態頁、321 app routes | [build結果](evidence/production-closed-20261021/build-results.json)；嚴格本機QA模式明確略過migration，沒有測正式migration自動執行 |
| 真正production三端 | `next start`、美業開關0；店長、顧客、技師真正帳密登入，公開體驗與舊book轉址均顯示關閉 | [完整瀏覽器結果](evidence/production-closed-20261021/browser-results.json)，20筆結果＝18組流程＋2筆課程取消資料回讀；不是20個獨立業務流程 |
| HTTP寫入防護 | 從本次build manifest找真正註冊action，實際登入送16筆HTTP，均回「美業模組尚未開放」；13張美業表前後摘要相同 | 店長12筆：目錄／設定／位置／預約／發卡／收款／退款／月結／付款／收回／顧客／核帳；顧客預約、購卡申請，技師改狀態，公開體驗各1筆。不是僅測路由拒絕，也不是16個不同action |
| 通知與共用銀行 | 未授權cron401；授權cron200且sent／skipped／failed均0；銀行設定仍可讀 | 沒有發送LINE或其他真實通知 |
| 蒸足 | 店長顧客清單、會員首頁與原預約正常，真正會員取消成功且DB一致 | 新建合成預約；不是所有蒸足業務完整回歸 |
| 運動 | 店長原生顧客清單、會員首頁、我的預約、授課人員我的工作正常；真正會員取消成功 | DB為CANCELLED、absenceKind null、卡剩餘5次；預約前卡為5次，取消回復預留 |
| 音樂 | 店長原生顧客清單、會員首頁、我的預約、授課人員我的工作正常；真正會員請假成功 | DB為CANCELLED、absenceKind STUDENT_LEAVE、卡剩餘5次；未因此新增扣點 |
| 舊SPA | 顧客／後台／舊工作入口實際HTTP410，合成歷史資料摘要不變 | **基準版本已停用／封存**，不是本輪刪除，不恢復舊功能，也不聲稱SPA完整業務可用 |
| RWD／瀏覽器 | 後台1024×768、768×1024、1366×900、1920×1080；公開／會員／工作390×844，無整頁溢出、page error 0 | 本機Chromium；非實體iPhone／Safari／Android或LINE LIFF驗收。截圖留在私有QA目錄，不公開上傳 |

## 發現及修正

關閉模組是正常狀態，原公開體驗頁卻拋出AppError，production串流HTTP200顯示通用「系統暫時無法使用」，顧客看不到原因；[修正前證據](evidence/production-closed-20261021/before-fix-result.json)保留，不當成通過。

新增共用 `src/components/beauty/closed-notice.tsx`，沿用EmptyState。公開體驗、顧客／技師共用頁及店長美業頁在讀美業domain前顯示「美業模組尚未開放」。店長頁仍先檢查登入及booking.read；所有action、store／role／模組防護保留。開關1時仍走原查詢，沒有為測試放寬auth origin或proxy規則。

前幾次瀏覽器演練有QA設定／選擇器問題，[未完成紀錄](evidence/production-closed-20261021/interrupted-runs.json)另列：canonical localhost與listener不一致造成轉址循環、登入等待條件過早、會員action送錯管理路由、舊SPA提示文字，以及課程清單需切我的預約並展開明細。已修正QA runner／操作後完整重跑通過；失敗輪不與最終20筆相加。

## 隔離與重現

新增 `scripts/beauty-production-qa-scope.mjs` 嚴格限制：NODE_ENV production、美業／通知均0、固定localhost3115、固定loopback32769／獨立DB／受限角色、兩個DB URL一致，不接受hosted metadata或LINE憑證。`consultation-preview-scope.mjs` 接入本機模式；`ci-migrate.mjs` 明確跳過migration，原hosted支線守衛保留。未移除審核或把這個模式用於對外部署。

`next.config.ts` 僅本模式使用 `.next-beauty-production-qa`、獨立忽略的tsconfig副本及2個worker，原 `.next` 與根tsconfig未改。QA DB為全新PG17.11，main／course／spa空白schema及候選美業SQL，應用角色非superuser／無BYPASSRLS；全為合成資料，未複製正式資料。帳密在私有 `/tmp/beauty-production-qa/env.json`，不提交或列印。

在具備Docker、Node依賴及Chrome／Playwright的隔離機器重現（固定埠需空閒；setup遇既有env即停止，不清資料）：

```sh
BEAUTY_PRODUCTION_SETUP=1 python3 scripts/qa/beauty-production-setup.py
# 從私有環境提供QA_BEAUTY_REVIEW_PASSWORD，勿寫入版本庫或命令紀錄
node scripts/qa/beauty-production-run.mjs seed
node scripts/qa/beauty-production-run.mjs build
node scripts/qa/beauty-production-run.mjs start
# 另一終端，同樣提供私有測試密碼
node scripts/qa/beauty-production-run.mjs browser
```

seed僅初始化新QA庫；不為重跑刪除帳本。browser每輪新增獨立合成預約／卡，保留歷史。runner listener由驗證後的AUTH_URL取得host／port，避免localhost與127.0.0.1混用。此腳本不能指向正式DB，也不能開啟美業。

## 測試與尚待事項

本輪相關8檔98項通過：production／local／sandbox scope、closed pages、industry-module-firewall、retired-module-routes、course-portal-role、customer-auth-notification-prebind；ESLint、Python語法、diff檢查通過。closed-pages測試另驗關閉前不讀domain、店長權限仍執行、開啟仍委派原查詢。這些不是全專案測試或所有hosted CI通過。

build有**144項Turbopack tracing警告**，主要為生成Prisma的動態追蹤；亦有Prisma package.json設定棄用提示。325個NFT manifest的6,922個unique檔案未引用私有QA目錄或.env檔名；這只是本機trace檢視，**不等於已驗hosted部署產物與封裝安全／完整性**，不能略過警告直接正式發布。

本輪未驗正式schema、實際backend角色／pooler、供應商PITR、hosted部署、真實LINE、實體裝置或正式店家簽收。候選SQL未變更；正式發布仍另行確認。

重要下一步：先只讀比對目標schema、實際runtime角色與pooler，釐清production tracing警告及部署封裝範圍，形成可審查的發布前差異清單；正式寫入、部署與啟用另外處理。
