# 真實登入與月結流程驗收

受測產品版本：`b549c7f0`（日期／歸屬月份已置頂）。本次僅增加可重現的隔離驗收腳本及證據，未更改產品操作或發布正式站。

## 環境

- 真實 Next.js 16.2.2 開發伺服器：`http://localhost:3123`。
- 本次專用 PostgreSQL 17.6 容器：`monthly-adjustments-qa-20261104`；只綁定 `127.0.0.1:32771`。原有 Docker 資料庫未更動。
- 沿用專案既有 `BEAUTY_SHARED_PAGES_LOCAL_QA` loopback guard；無 Vercel／Cloudflare 部署標記，外送封鎖、`BEAUTY_NOTIFICATIONS_ENABLED=0`。
- 四間新建的 `monthly-live-*` 合成門市、四個合成店長及各模組合成人員；以正常 Email／密碼表單登入，未偽造 cookie 或 session。
- 自目前三份 Prisma schemas 建立空白庫，再以候選 SQL **精確替換**兩張調整表。補齊既有 raw-SQL 的提醒讀取及教師財務範圍先決資料表；不是正式資料庫備份，也不宣稱完整重演所有歷史 migration。
- 應用程式角色為非 superuser、無 `BYPASSRLS`，但擁有本機 fixture 資料表。本次驗證應用層門市／月結授權，不替代正式受限角色與 RLS 權限驗收。

## 驗收案例

每個模組都透過真實畫面及 Server Action 操作，另以 PostgreSQL 查回驗證：

1. 正常登入，核對 session 的 OWNER 角色及正確 storeId。
2. 新增加項 2,000；DOM 核對日期與月份在最前面。
3. 重送原始儲存請求，維持一筆紀錄及一次建立稽核。
4. 編輯加項為 2,500，新增減項 800，新增後刪除另一筆 500，最後把加項改回 2,000。
5. 重新載入後核對原金額＋2,000－800。蒸足原收入 0，其餘授課／拆帳原金額 30,000。
6. 完成月結，UI 不再提供明細編輯。重送帶新識別的寫入，後端拒絕已結算月份；不新增資料。
7. 以同一個合法登入請求傳入另一個門市，後端拒絕門市不符；不新增資料。
8. 重新開啟、將減項改為 700、再次確認。再測「無金額異動 → 重新開啟 → 再次確認」仍能鎖定。
9. 重新載入後總額為蒸足 1,300、其他模組 31,300；每個模組保留兩筆有效明細，一筆軟刪除紀錄及完整稽核。
10. 各模組在 1366×900、1180×820、820×1180 保存截圖並檢查整頁無橫向溢出；為瀏覽器模擬尺寸，非 iPad 真機。

最終結果以 [results.json](results.json) 為準。未透過 fixture 替換 Server Action 或 router。實際收付款、出席、通知及 LINE 送出不在測試動作中；結果同時核對相關付款／通知表無新增紀錄。

## 環境與腳本修正

- 監聽 `127.0.0.1` 與既有 guard 指定的 `AUTH_URL=localhost` 不一致，內部 rewrite 會形成重新導向循環；改為監聽 `localhost` 後正常登入，不修改產品路由或略過授權。
- 空白模型庫不含 raw-SQL 的 DigitalManagerNotice 與 CourseTeacherFinanceScope，已由原生 SQL 補齊本機依賴。
- 課程既有「重新確認」需填調整原因；腳本補齊原因，並在確認前重新載入，確保使用編輯後的權威 fingerprint。舊畫面請求遇到衝突時未錯誤結算。
- 已通過且版本、資料及鎖定一致的模組可用 `--resume` 接續，不把先前失敗算成通過。

## 遠端查核及發布界線

Vercel 已唯讀確認既有隔離 QA 專案，Supabase 已唯讀確認 steamfoot-preview 健康。現有 QA 部署來源不含本分支，不能當作本次驗收。

GitHub webhook 設定讀取回應 `403 Resource not accessible by integration`，因此未推送分支，也未觸發無法核實的遠端建置。沒有建立 Vercel Preview、修改遠端環境變數、執行遠端 migration、改用其他方式讀取被拒絕的 webhook，或動到正式站。

本機實測不代表正式建置、遠端登入／RLS、部署保護或真機已驗收。正式發布仍須依 repo 發布流程及使用者授權進行。

## 重現

在此 repo 根目錄執行。環境秘密只寫入 `/tmp`，不得放進版本庫或 artifacts。

```sh
node scripts/qa/monthly-adjustments/live-prepare.mjs
docker run -d --name monthly-adjustments-qa-20261104 --publish 127.0.0.1:32771:5432 -e POSTGRES_DB=beauty_shared_pages_qa -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=disposable-monthly-only postgres:17.6
docker exec -i monthly-adjustments-qa-20261104 psql -v ON_ERROR_STOP=1 -U postgres -d beauty_shared_pages_qa < /tmp/monthly-live-init.sql
node scripts/qa/monthly-adjustments/live-seed.mjs
node scripts/qa/monthly-adjustments/live-start.mjs
# 在另一個終端執行；使用環境提供的 Playwright 與 Chromium。
node scripts/qa/monthly-adjustments/live-verify.mjs
```

Seed 明確拒絕含既有 Store 的資料庫。驗收完成後可停止並移除**本次專用**容器與 `/tmp/monthly-live-*` 登入設定，不動其他容器。

## 清理完成

本次專用 Next.js 程序已停止、`monthly-adjustments-qa-20261104` 容器已移除，合成門市及帳號隨隔離庫清除。`/tmp` 的 DB／登入密碼與 AUTH_SECRET 設定檔已刪除，未提交任何工作階段或秘密。原有 `steamfoot-booking-db-1` 容器維持運作。

歷史環境準備失敗畫面另存為 `setup-prerequisite-failure.*`，已由後續完整通過結果取代；不是尚未解決的產品錯誤。受測應用程式碼在本次驗收期間未變更。
