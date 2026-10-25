# 美業正式發布（2026-10-25）

## 授權與範圍

使用者明確允許把新美業專用密碼存入 Vercel steamfoot-booking Production Sensitive，配置相關旗標，通過實際連線驗證後發布。只發布模組、HQ 可建立美業店；本輪不建店、不複製測試資料、不修改既有顧客、不啟用 LINE。

## 已完成

- 正式 qijlnhtpbintanzpxkvf：核准的 base/runtime/credential 三階段成功，14 張 RLS 表及六欄位吻合。專用角色非管理員、無 membership、不可讀 User.passwordHash、不可修改既有 BeautyPayment。
- 新 Production server-only Sensitive BEAUTY_DATABASE_PASSWORD 與角色／dedicated mode／模組／收費旗標已成功建立。應用正確的編輯旗標為 BEAUTY_CHARGE_EDITING_ENABLED；尚無正式美業店，收費 store allowlist 保持空白。LINE 通知旗標為 0。未改主 DATABASE_URL 或 DIRECT_URL。
- 整合 origin/main 5f1b419e：保留新的授課人員稱呼與營業時間確認，以及美業接點、停用收合、班表、顧客返回與 SPA runtime 移除。正式庫已存在 coursePersonnelLabel，不需另套此 migration。
- 在既有 musicBuildPreflight 最前方加入條件式 Beauty 唯讀 runtime 預檢，保留原 package build 順序及音樂／通知檢查。存在 PRODUCTION_MIGRATION_TARGET 或不安全 scope 即停止，不能偷偷套 migration。
- 最終相關回歸：171 檔 1,536 項通過；三組 Prisma Client 生成、TypeScript noEmit 通過；ESLint 0 errors／15 warnings（保留既有 unused/dependency 警告）。
- 本機 Chromium 假資料：307 張畫面，errors=[]，頁面無水平溢出；涵蓋美業、音樂、運動與桌機／平板／手機寬度。不是正式登入交易或真機驗收。
- 曾在整合修正前探索性執行完整舊測試集：79 檔失敗，包含 SPA 已移除檔案、舊 snapshot、缺 mock 與子程序 EPERM；當時亦包含本輪已修正的欄位 hook 與 build 字串問題。不得把完整舊測試集寫成通過；本次最終結果以隨附 manifest 的相關回歸為準。

## 待完成

推送整合版本到 main，以正式 Vercel 建置先實測新角色的 TLS／READ ONLY／RLS／必要欄位，通過後完成部署。再唯讀核對正式網域、部署 SHA、登入入口與資料筆數。本報告尚非部署成功證明。

證據：[測試及畫面](evidence/20261025-formal-publication/)。


## TLS 診斷與修正

第一個正式建置 dpl_2XzdPw4f5SCZJgJCeZndP3DfyyJf 在 preflight 停止，未切換 steamfoot.com／www.steamfoot.com；兩域名仍為 dpl_GgMCzNKH4Xvzr3cNDdQRetwVoXKX（main 5f1b419e）。後續唯讀診斷專用建置 dpl_5kxi9i4ose4rs5x1WYVZFuSLUZLW 明確回報 connect／SELF_SIGNED_CERT_IN_CHAIN；診斷指令設定為即使連線通過也不產出可發布版本。正式新角色的 verifier 僅比對是否符合，結果 true，沒有重設密碼或讀出既有憑證。

修正僅針對新 Beauty 連線：納入 Supabase 公開官方 Root 2021 CA，固定 SHA256 指紋 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA。pg 使用 verify-full；Prisma 使用 require + sslaccept=strict + sslcert（Prisma 官方的 server certificate 參數）；pg 專用 URL 使用 sslrootcert。憑證納入 server output tracing，不關閉 certificate／hostname 驗證，也不改全域信任或主連線。

新增實際 Prisma engine 的唯讀 transaction 身分／必要表查詢，與 pg 的 TLS／RLS 檢查皆須通過。最終 171 檔 1,536 項及 TypeScript 通過；TLS 相關異動 ESLint 0 errors／0 warnings。準備以修正版再次執行唯讀診斷，通過後才完整建置。


修正版 CA 診斷 dpl_7pVpak6nMXGnWWC3HF1P4Zpr5Z8N 已通過 pg 端全部 readonly 檢查，再於 prisma-connect 停止。核對 Prisma 官方 PostgreSQL 文件確認 server certificate 參數是 sslcert，與 node-postgres 的 sslrootcert 不同；現已分別配置，沒有把 CA 當成 pg 的 client identity。相關 56 項測試與 ESLint 通過，沒有重送 schema／role migration。


後續唯讀診斷顯示 Prisma TLS 已可連線；先將 current_user/current_database 的 PostgreSQL name 結果轉為 text，通過身分核對。最後一個測試查詢誤用 BeautySetting.id（實際鍵為 storeId），已改為 tx.beautySetting.findMany(select storeId, take 1)，在 READ ONLY transaction 內測試真實模型。這是預檢引用修正，沒有新增欄位或重送升級。56 項連線／隔離測試及 ESLint 通過，準備完整建置，唯讀 gate 仍先執行。
