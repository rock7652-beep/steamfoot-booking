# HQ 美業切換 Preview 部署

使用者明確要求「請部署」後，將已驗證提交 5ce9496c 以 fast-forward 推送至既有隔離 preview/beauty-ui-alignment-20261021。沒有推送正式分支或音樂 release 分支，也沒有改動音樂測試別名。

- 新站：https://steamfoot-booking-k9ihww44q-rock7652-2111s-projects.vercel.app
- HQ 登入：https://steamfoot-booking-k9ihww44q-rock7652-2111s-projects.vercel.app/hq/login
- 部署：dpl_7eG6XBFLALZUdyf9KNJv89ZoUa8R，READY，Preview，hnd1。
- 版本：5ce9496c2104d774b301fe04c9a269b73c59b96b。
- 建置：完整 Next 編譯與 TypeScript 通過，建置紀錄確認 isolated_database=true migrations_skipped=true notifications_blocked=true。
- 建置前核對原分支 BEAUTY_HOSTED_PREVIEW=1、BEAUTY_MODULE_ENABLED=1、BEAUTY_DATABASE_MODE=legacy、BEAUTY_NOTIFICATIONS_ENABLED=0；沒有修改環境變數。原分支 LINE 憑證為空。
- HQ 登入 HTTP 檢查回傳 200 與應用程式載入殼層，沒有 server application error；不是登入完成、表單互動或切店驗收。
- 保留原 Vercel 部署保護；HTTP 檢查使用既有 Vercel 連接的存取能力，沒有降低保護設定，也沒有在文件保存存取憑證或分享連結。

同一既有 HQ admin 應在這個新站的右上角店鋪選單選美業店。遠端真實登入、切換成功與手機／平板版面仍待確認；不能把本機 208 項 mock 測試寫成線上交易驗收。此版本不包含音樂 release 的全部最新改動，音樂原站未被本版覆蓋。

沒有執行資料庫查詢工具、寫入、清資料、migration 或資料庫重試。沒有啟用 LINE，正式站未動。
