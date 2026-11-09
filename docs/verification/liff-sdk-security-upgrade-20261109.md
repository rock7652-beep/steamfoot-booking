# LIFF SDK 安全升級驗證（2026-11-09，台灣時間）

## 範圍與版本

- 基底：`5d3b784e1a27f3cdcd70b37f3bc80272519fccd8`，本地候選分支 `fix/liff-sdk-security-20261109`。
- `@line/liff` 從 `^2.29.0` 改為精確 `2.31.1`，lockfile 的 50 個 `@liff/*` 套件全部同步為 `2.31.1`，非 LIFF 套件版本與 lock metadata 保持基底不變。
- 採用官方已修補的最小版本，避免同時納入 `2.31.2` 對 LINE 內 query 參數 `?` 的行為變更。不宣稱這是 npm 最新版本。
- 不改正式會員、LINE 通道／Provider／金鑰、LIFF endpoint、登入權限、綁定、預約、方案、通知規則、資料庫或操作指南。僅將本次核准的精確分支加入既有隔離 Preview 閘門，沿用指定測試資料庫、禁止 migration 與通知，不放寬正式發布。
- 已查目前 GitHub SDK／`2.31.1`／`2.29.0` PR 搜尋、SDK 分支及近期任務，沒有找到可接續的 SDK 升級候選。Mac 兩份既有 checkout 都有其他未提交工作，沒有修改；本次使用全新獨立 checkout。

官方來源：
- [安全性修補與受影響範圍](https://developers.line.biz/en/news/2026/10/20/liff-sdk-issue/)
- [LIFF 版本說明](https://developers.line.biz/en/docs/liff/release-notes/)，受影響版本為 2.20.0 至 2.31.0，修補版 2.31.1。
- npm `@line/liff@2.31.1` 的完整性值由官方 registry 讀取，安裝與 `npm ci` 依 lockfile 核對。

## 本地檢查

- 乾淨 `npm ci --ignore-scripts --no-audit --no-fund` 成功；另單獨執行 `npm run generate:clients` 成功，只生成型別，不接資料庫或執行 migration。
- 新增版本防退測試：要求精確安全版本、實際安裝與 lock 一致、所有內部套件不混用舊版；直接載入真實 SDK，核對 named/default export 與登入／token／分享等既有 API。
- 共用初始化補驗：多個同時呼叫只初始化一次；共享初始化失敗後全部拒絕、清除記憶體快取，下一次可正常重試。
- 驗證共用 LIFF client、session exchange、ID token 與 audience、首次登記、既有會員與門市隔離、會員讀取、公開預約、外部瀏覽器登入啟動、登出與安全轉址等現有回歸。
- 最終 LIFF 相關回歸：53 檔／577 項通過（含新增版本與初始化快取測試）。
- 完整 TypeScript `tsc --noEmit` 通過；兩個變更測試檔 ESLint 與 `git diff --check` 通過。首次型別檢查與全量測試並行時被記憶體限制終止，沒有診斷輸出；停止並行後以原檢查範圍單獨重跑成功，沒有排除檔案。
- 全量 Vitest 初次執行：1718 檔通過、7 檔失敗、32 檔跳過；16208 項通過、8 項失敗、267 項跳過。8 項中有 6 項 PGlite 測試超過原 5 秒上限，另 2 項為美業營業時間保護斷言失敗。
- 對這 7 檔保留全部斷言，使用 `--maxWorkers=1 --testTimeout=15000` 重跑：6 檔通過、1 檔仍失敗，53 項通過、2 項失敗。再於乾淨原基底 `5d3b784e`，使用原 lockfile、乾淨 npm ci 與實際 SDK `2.29.0` 同樣執行，得到完全相同的 53 通過／2 失敗。
- 兩項共同失敗均位於 `src/__tests__/service-hours-save-database.test.ts` 第 92、106 行：美業既有預約時間保護預期拒絕但測試得到成功。尚未診斷成實際正式站問題，亦未在 SDK 任務內改它。全量仍不是全綠，不能把局部重跑稱作全量通過。
- 初次全量執行期間另補上兩個 client 快取測試，最終已以完整 53 檔／577 項專項重跑覆蓋；沒有後續應用程式變更。
- 部分測試使用 mocked SDK、OAuth 或合成資料，不等於真人登入或訊息送達。

## 打包與快取證據

在專案外的無憑證最小 Next.js 16.2.2 / Turbopack harness，以實際 `import("@line/liff")` 生產模式編譯成功。這不是整個蒸管家應用的 production build。

- 新 SDK 靜態資源：`10e1-me16e3d7.js`，116599 bytes。
- SHA-256：`7d3d21de4584b0e9bda2205773b513ddc82fea43c9b531a569c570aa6ce341cf`。
- 資源含 `2.31.1`、不含 `2.29.0`；本地 HTTP 200，`Cache-Control: public, max-age=31536000, immutable`，下載 bytes 與建置輸出 hash 一致。harness 完成即停止。
- 正式公開入口 `/s/zhubei/liff` 本次回應為 HTTP 200、`private, no-cache, no-store, max-age=0, must-revalidate`、`x-vercel-cache: MISS`、age 0。
- 正式舊 SDK URL：`https://www.steamfoot.com/_next/static/chunks/0dsvw-cl1kcx7.js?dpl=dpl_xCXGok11L1XYsiB9x6aSWozX4P9y`，仍為 HTTP 200，實際 getVersion 為 `2.29.0`，一年 immutable，回讀為 HIT、age 417。
- 程式只經共用 client 動態 import npm SDK；沒有發現另掛舊版 CDN script 或 service worker 註冊。

因此安裝更新不會自行改變正式版本。發布必須重新建置，核對正式入口引用新 hashed chunk、實際 SDK 版本與部署 SHA；不能把清除一般頁面快取當作升級。既有開啟中的分頁可能繼續執行舊 JS，應完整關閉／重新開啟或重載後再驗；沒有全站清除使用者 cookie／localStorage，也不以清除資料掩蓋問題。

## 隔離 Preview 與待驗

- 使用者已同意將修正推送至本儲存庫並建立隔離 Preview，已知可能觸發 Vercel 建置；正式合併與發布尚未核准。
- `fix/liff-sdk-security-20261109` 加入既有 `module-roster-preview` 模式：只接受明確 Vercel Preview、正確 owner/repo，以及兩條連線均指向既有隔離資料庫；未提供、正式／其他專案、連線參數覆寫或其他平台 metadata 一律拒絕。build 在 Prisma 與 migration 子程序之前結束，runtime 也使用同一閘門。
- 隔離閘門新增後，以最終候選重跑全部 Preview 與 LIFF 相關回歸：132 檔／2314 項通過。
- 不新增或複製資料庫／OAuth 憑證；既有 Vercel Preview 連線為 sensitive，API 不回傳值，由 build/runtime 閘門實際核對目標。不把環境變數存在當作隔離已驗證。
- Preview 沿用對 LINE、Messenger、email 與美業通知的封鎖，即使繼承發送憑證仍禁止外發。新增精確分支、錯誤目標、migration tripwire 與通知封鎖回歸。
- 本次分支尚未具備經核准的獨立 LINE LIFF endpoint。既有 `docs/deployment.md` 的一般 Preview 驗收僅支持帳密登入，舊真人 LIFF 驗收入口只允許另一個精確分支。不能把帳密、mock 或正式 endpoint 登入稱作本次隔離 LINE 登入成功。
- 未使用正式或他人 LINE 身分登入，未產生正式 session／預約／會員異動；真實 LINE 內及外部 Safari／Chrome OAuth 完整往返、真機與長開分頁更新仍未驗。
- Cloudflare 設定未更動。本次確認的正式 LIFF 資源由 Vercel 回應；不據此宣稱 Cloudflare 部署整合已通過。

下一步由助理沿同一候選推送、核對 CI 與隔離預覽的新 chunk；若真人登入仍缺專用入口或已授權測試身分，另列出需要本人提供的最小項目。正式發布另待明確核准。
