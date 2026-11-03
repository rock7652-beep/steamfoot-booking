# 數位店長小鈴鐺：2026-10-30 正式發布紀錄

使用者在本對話明確回覆「同意正式資料庫更新及部署」。本次已依序完成限定 migration、正式受限角色唯讀檢查、完整建置及正式網域切換；沒有另開 PR。原 PR #1465 已於先前合併，本次沿用數位店長功能分支，以非強制 fast-forward 接入 main。

## 正式版本與結果

- 應用程式來源：`06b3d2f7f5a5529d445f61d21323c8641ca54f8b`，部署 `dpl_GvDDSrcJ5dDmqWtmTSqkmMrALRQ2`，原 Vercel 專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`，production／READY。
- 2026-10-30 台灣時間約 20:23，已完成 promote，API 確認 `www.steamfoot.com` 與 `steamfoot.com` 均屬本部署；後者導向 www。沒有關閉部署保護、另建專案或手動部署 Cloudflare。
- 可回退的上一版為 `eb73ebcf4089b795841597b1ff8c088e5382cf17`／`dpl_8urBcNnQLyf1w9EfQYwWbj6vLVNy`；舊版與新增結構相容性及保留資料的回退演練見原[資料庫審查紀錄](digital-manager-database-release-review-20261030.md)。本次沒有執行正式資料庫或流量回退，也沒有還原舊備份覆蓋正式資料。
- 本紀錄及原審查文件的後續提交只更新文件，不重建已驗證的正式應用；上列 SHA 仍為實際部署來源。

## 資料庫更新

正式專案 `qijlnhtpbintanzpxkvf` 為 ACTIVE_HEALTHY。更新前兩張新表不存在、目標 migration 不存在、未完成 migration 為 0；正式指紋仍為 `787252b4c60e4819ffa2f79f9969fa3d`。備份依據為本對話同日提供的 PHYSICAL 備份畫面，最新備份台灣時間 2026-10-30 01:23:32；不是本次正式還原成功的證據。

本次部署的專用 Build Command 先執行原 `music-release-preflight.mjs`，再只對 `ci-migrate.mjs` 子程序指定 `PRODUCTION_MIGRATION_TARGET=20261030150000_digital_manager_notice`，最後執行原完整 `npm run build`。沒有將 migration target 設為專案全域變數，也沒有修改或略過一般美業、LINE、音樂、預約與發布防護。專案後續 Build Command 已明確恢復為 `npm run build`。

- 20:18:35 台灣時間完成單一目標，checksum `7effc6fba18452850c179b6cca993e84405bf9e76729dc19ef9a088f7a57246d`，applied_steps_count=1、finished_at 有值、rolled_back_at 為空、未完成 migration 為 0。
- 發布器輸出 `preflight_verified` 及 `postflight_verified`。其他 migration 帳本完整摘要前後均為 `7eccfdac823874a3031384c08cfc3f99`；沒有執行或補登其他 24 個歷史項目。
- 新 `DigitalManagerNotice`、`DigitalManagerActivation` 均啟用 RLS，anon／authenticated 沒有直接 SELECT／INSERT／UPDATE／DELETE，六個政策及六個新觸發器通過檢查。Supabase 安全 advisors 回應沒有這兩張新表的 finding；不代表全專案既有風險已清除。
- 更新及建置不提交正式測試預約、付款、方案、通知或顧客變更。檢查時兩張新表各 0 筆，沒有用真實顧客資料充當測試。候選 SQL 不刪除既有預約、方案或消費紀錄。

## 正式美業受限帳號與建置

新增唯讀建置檢查 `scripts/beauty-digital-manager-readiness.mjs`，沿用原正式 dedicated 連線選擇與 CA 驗證，不擷取或輸出憑證。實際以 `steamfoot_beauty_prod_20261025` 連線確認身分、資料庫、唯讀交易、受限角色屬性、新表讀取、必要欄位授權及禁止操作；在唯讀交易中以四個不帶 ANALYZE 的 EXPLAIN 編譯新增／處理通知與啟用紀錄操作，沒有執行寫入。

正式建置已輸出：

```text
ci-migrate: postflight_verified
ci-migrate: migration_skipped_no_target
[beauty-digital-manager-preflight] runtime_login=true schema_read=true required_privileges=true sql_planning=true readonly=true
digital-manager-build: ready
```

原有正式美業 runtime login／TLS／Prisma／shared_todos 唯讀 preflight、音樂 schema、LINE additions 及完整 Next 建置均通過。本次新增及相關發布測試共 67 項通過，TypeScript、變更測試 ESLint、語法及 diff 檢查通過。migration 子程序測試起初受 sandbox 的 spawnSync EPERM 影響，取得執行環境所需權限後原測試 24 項全數通過，沒有放寬斷言。

這證明正式新表的實際受限連線、讀取、授權及 SQL 規劃可用；不是對正式門市提交新增／處理通知後的完整業務回寫驗收。通知服務寫入與跨店行為另有既有隔離環境證據。

## 網址與畫面檢查

在網域切換後以匿名瀏覽器唯讀檢查，只允許同源 GET／HEAD，沒有送出表單、建立業務資料或外發 LINE。

- 官網、`/hq/login`、匿名 `/api/auth/session` 均 HTTP 200；匿名 session 沒有使用者身分。
- 蒸足、銀百合及美業的後台路徑，未登入時均正常導向登入頁，沒有洩漏後台資料。
- 正式登入頁 1366×900、768×1024、390×844 無整頁水平溢出，沒有 pageerror 或同源靜態資源失敗；這是 Chromium 尺寸模擬，不是真機。
- 此部署於 20:13:41–20:23:41，以及收尾時 20:20:41–20:25:41 台灣時間的 error／fatal 日誌查詢均沒有回傳紀錄。只代表該觀察窗；非未來不會發生錯誤的保證。
- 正式登入後的小鈴鐺操作未另建正式帳號或偽造登入驗收；隔離 Preview 已完成四業態 24 項畫面及操作補驗。

## 保留設定與限制

既有 LINE 發送、歡迎訊息、門市通知設定及憑證未變更，沒有為本次驗收恢復或停用任何 LINE 項目。正式排程沿用原 Vercel cron 設定，未手動觸發正式排程或外發訊息；09:00 自動摘要及真實 LINE 送達仍需各自的實際觸發證據，不以隔離 Preview 的 09:05 模擬替代。實體 Safari／LINE 內建瀏覽器及所有營運事件組合也不宣稱全數驗證。

工作區證據在 `/workspace/digital-manager-production-release-20261030/`：授權／發布計畫、67 項測試 JSON、資料庫 postflight、建置 gates、部署與網域、smoke JSON 及三張登入頁截圖。證據不包含登入狀態、連線字串或密碼。
