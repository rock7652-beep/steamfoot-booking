# HQ 美業入口唯讀核對 — 2026-10-24

## 已定位的直接原因

GitHub 唯讀追查已取得音樂部署 f0312850 的實際來源。2026-10-23 23:53:56（Asia/Taipei）提交 c9d6ac1950cc3c2a0508020303884b3ca3262ce3（Filter unsupported module enum values before reading HQ store choices）修改 src/lib/store.ts 的 ADMIN 查詢，新增 industryModule in [STEAMFOOT, SPA, COURSE]，排除 BEAUTY。原先只有營運狀態限制，修改後美業即使 ACTIVE／TRIAL 也不會進入選店清單。

同版本 src/lib/industry-module-server.ts 僅接受 STEAMFOOT／COURSE，src/lib/industry-modules.ts 也未宣告 beauty。註解說明過濾是為避免此音樂 release 的 Prisma 解碼不支援的 enum。這是一個未整合美業的音樂版本，加上白名單排除美業所造成的入口回歸；不是需要另建 admin 或合併顧客的問題。不能只把查詢白名單加上 BEAUTY 就視為修好，必須同時接回美業 enum／client、模組識別、路由與啟用設定。

提交證據：https://github.com/rock7652-beep/steamfoot-booking/commit/c9d6ac1950cc3c2a0508020303884b3ca3262ce3

沒有執行資料庫操作，故無法證實現有門市資料狀態，但已找到足以導致清單缺項的確定程式條件；不將「入口被過濾」寫成「資料已刪除」。

## 已確認

- 使用者截圖網址 `steamfoot-booking-git-feat-music-467ded-rock7652-2111s-projects.vercel.app` 的別名目前指向 `steamfoot-booking-2q2pcixlm-rock7652-2111s-projects.vercel.app`。
- 部署為 Preview、READY，來源 `release/music-production-20261023`、提交 `f0312850ad047d363964349a8b38953cca143cdf`。
- 美業既有部署 `steamfoot-booking-m6r9l435m-rock7652-2111s-projects.vercel.app` 為 Preview、READY，來源 `preview/beauty-ui-alignment-20261021`、提交 `98a5c5f0be905cacd1d55a6c51b7f6d7b87fdacf`。
- 兩者是同一 Vercel project 下的不同部署；音樂網址名稱不能代表目前實際 Git 分支。
- 目前專案環境變數中，美業支線設定 BEAUTY_MODULE_ENABLED=1、BEAUTY_HOSTED_PREVIEW=1、BEAUTY_NOTIFICATIONS_ENABLED=0、BEAUTY_DATABASE_MODE=legacy；音樂 release 支線沒有這些專屬設定。
- 環境變數中存在共用 Preview DATABASE_URL，沒有發現上述兩分支各自的 DATABASE_URL 覆寫，也沒有 BEAUTY_DATABASE_URL。未解密資料庫憑證；不能宣稱兩站連到不同資料庫。
- 以上環境設定是目前專案設定，不是兩次部署當時完整環境快照。

## 本機入口規則

本機提交 05947a1c 的 getAccessibleStores：ADMIN 從 Store 讀取 ACTIVE／TRIAL 門市，沒有按 BEAUTY_MODULE_ENABLED 過濾。getStoreOptions 及 StoreSwitcher 排除封存門市；非 ADMIN 有門市組織範圍限制。

缺少美業模組開關不能單獨解釋清單缺項；本次取得的音樂部署來源另外有明確排除 BEAUTY 的查詢白名單，已在上方定位。未查庫，不判定門市已刪除、停用或封存。

音樂 f0312850 不在本工作區 Git 物件庫；Vercel 的來源檔讀取介面未取得檔案，但後續已透過 GitHub 以精確提交讀取 store.ts、industry-module-server.ts 與 industry-modules.ts，並取得引入過濾條件的提交 diff。

## 同一帳號的建議接點

目標為同一隔離整合測試站，admin@staging.local 登入 HQ 後，在既有店鋪清單切換音樂、運動、美業；保留每間店的資料與模組邊界。不合併顧客、方案、帳本或門市資料，也不建立第二間同名美業店。

整合前須核對來源版本、共用 Preview 接點、既有美業 Store 的可存取狀態，以及帳號既有 HQ 權限；不可直接複製美業旗標到音樂分支，因 hosted preview 閘門限定分支名稱。現有 user 的角色與門市狀態尚未查庫確認。

## 未執行

沒有連線查詢或修改資料庫、帳號權限、門市資料；沒有建立存取連結、重試資料庫操作、migration、推送、部署或調整 Vercel 設定。LINE 設定未變，正式站未動。

## 其他對話的版本進度

唯讀部署紀錄另顯示同一美業支線已有 6092de9111ec5f778d2f003c49657c4c073339d4 的 READY 部署（steamfoot-booking-758yoo96i-rock7652-2111s-projects.vercel.app），包含另一對話的 SPA retirement 整合後建置修正；未登入驗收，也未在本工作區擅自合併。m6r9l435m 是歷史固定版本，不再稱為整體最新。這輪沒有觸發任何部署。
