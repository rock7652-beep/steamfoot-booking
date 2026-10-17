# 雲端隔離開發啟動

此入口用於雲端內的合成資料驗收，不是 Vercel Preview，也不能用來部署。Node 24、可用的本機 Docker unix socket 及 PostgreSQL 16 Alpine 映像為必要條件。瀏覽器驗收使用 `playwright-core` 與已安裝的 Chromium。

## 啟動

在專案根目錄執行：

```sh
npm ci
npm run dev:isolated -- setup
node scripts/isolated-dev-fixture.mjs
npm run dev:isolated -- check
node scripts/isolated-dev-verify.mjs
npm run dev:isolated -- start
```

開啟 `http://localhost:3000/hq/login?store=synthetic-music`。合成帳號及隨機密碼在本機 `work/isolated-fixture.json`，不得複製到提交或報告。只用 localhost；Next.js 的 hostname 與 Auth.js origin 必須一致，否則店別 rewrite 可能形成循環。服務固定使用 localhost:3000，資料庫只發布到 127.0.0.1 的隨機埠，沒有公開監聽或遠端資料庫。

每次 setup 都新建隨機命名、帶專用 label 的容器、資料庫及非 superuser 應用角色；不掛載既有資料磁碟。連線設定與隨機 auth secret 存在權限 0600 的 `work/isolated-dev.json`，已被 Git 忽略。既有 manifest 不會被覆寫；若初始化失敗，僅刪除該次新建容器及其匿名 volume。

若終端繼承 `DATABASE_URL`、`DIRECT_URL`、provider metadata 或非 development 的 NODE_ENV，入口會拒絕。使用沒有正式／Preview 設定的開發終端；不要將正式憑證帶入此模式，也不要複製部署身分變數。不要修改發布守門以消除錯誤。

## 保護與 schema

- 僅 `STEAMFOOT_ISOLATED_DEV=1` 且 NODE_ENV=development、沒有任何 Vercel／Workers／Cloudflare／Vitest 身分時可啟用。
- Next config 使用本版官方支援的 async function 與 `PHASE_DEVELOPMENT_SERVER`；production build/start/export 皆拒絕。沒有開發模式時，原本的發布守門維持原樣。
- DATABASE_URL 與 DIRECT_URL 必須完全一致，主機字面值必須為 `127.0.0.1`，資料庫、角色與密碼須符合本輪 provision 格式。拒絕 query-level host/schema 等覆寫與 fragment。
- 啟動器另核對本機 Docker label、運行狀態、bridge IP、loopback port binding；實際連線再核對 `current_database()`、`current_user`、`host(inet_server_addr())`、實際 server port 及 postgres 所有、應用角色唯讀的 guard token。檢查失敗即拒絕，錯誤訊息不印憑證。
- Next config、instrumentation 與三組共用業務 client 均保有檢查。驗證在首次查詢／交易之前完成，client 的連線 URL 固定；保留原本 audit-context transaction wrapper。
- LINE／Messenger／Email 等既有整合繼續封鎖；開發身分不會恢復 production 對外傳送權限。
- `npm run build` 第一個 preflight 及 `ci-migrate.mjs` 明確拒絕此模式，無 migration fallback。即使直接呼叫 `next build`，Next phase 檢查也不放行。
- setup 先驗證實際目的地，再由三份 datamodel 產生空白 schema DDL；補入 `isolated-dev-schema.mjs` 明列的 SQL-only outbox、教師財務／鐘點費、唯讀來源批次表、compensation trigger、預約唯一索引與帳本／待繳費 CHECK。這是新空白庫的開發 bootstrap，不執行部署 migration runner，不掃描或套用全部歷史 migrations。
- 此 schema 支援本文件列明的驗收流程，不能視為全站歷史 trigger／RLS／排程、所有模組與 production migration 的完整重建。

## 重跑完整瀏覽器驗收

在上述服務運行時，另開終端：

```sh
node scripts/isolated-dev-browser-check.mjs
```

需全新 fixture，發現任何既有 booking 就拒絕。腳本依序驗證錯誤密碼拒絕、正確登入、每週／隔週／待繳費預覽與排課、連按新增、兩個同時的點名 HTTP 請求及資料庫帳本、桌機與 iPad 畫面。結果與截圖寫到被忽略的 `work/isolated-acceptance/`；不保存 cookie、storage state 或登入錄影。可用 `CHROMIUM_PATH` 指定環境內的 Chromium。

並發點名重送沿用相同 Server Action 業務 payload，每個 HTTP 請求使用獨立 `x-nextjs-request-id`，避免重複的 Next.js dev debug stream 被誤認為同一條串流。這不改變認證、業務 request key 或資料庫鎖。

fixture 是 2026-10-17 驗收快照：2026-11-02 起四堂；隔週課卡有效至 2026-11-10。未來重跑若這些日期已過，應同步調整合成 fixture 與驗收日期，保留共用 Asia/Taipei 日期規則。

## 清理

先在服務終端按 Ctrl-C，然後：

```sh
npm run dev:isolated -- clean
```

clean 仍須通過 label、目的地與實際資料庫身分核對，只刪除 manifest 所指的本輪容器及其匿名 volume，並刪除 manifest 與合成登入資料。驗收結果保留供審閱。不要手動以 reset、seed 或 migration 指向正式／既有遠端資料庫。

本輪不需要修改雲端環境發布／啟動配置；使用上述受支援的 npm 入口即可。本開發分支另在 `vercel.json` 的 deploymentEnabled 明確設為 false，保存分支不觸發自動部署；未變更其他分支的發布設定或正式站。

Next.js 16.2.2 依據：`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/index.md`、`01-app/02-guides/environment-variables.md`、`01-app/02-guides/instrumentation.md`。
