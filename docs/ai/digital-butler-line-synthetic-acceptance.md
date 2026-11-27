# LINE 合成事件：離線驗收

2026-11-26（台灣時間），接續 [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596) 與 [隔離 Mock 串接驗收](digital-butler-routing-acceptance.md)，補原開發需求 Phase 2 的 LINE 格式合成事件演練。這輪只新增測試與測試用 driver，沒有對外 API、UI、正式 Webhook 或傳輸層變更。

## 路徑與信任邊界

`raw JSON + fixture HMAC → 四組合成 destination → 既有 verifyLineSignature → 合成 TEST scope → 既有 Routing／原引擎／Mock AI → PGlite 私有帳本`

- [driver](../../src/__tests__/helpers/ai-line-synthetic-harness.ts) 僅由測試載入，不能由客戶端、server action 或 Webhook 呼叫；不讀環境憑證、不接受 hosted DB URL，也沒有 sender。
- 沿用實際 `src/lib/line.ts` 的簽章演算法，只有 channel-secret lookup 在測試中替換成公開的 fixture 值。驗證原始 body 的 bytes，修改空白也會使簽章失效。不代表正式 OA secret、destination resolver 或真實 LINE 服務已驗證。
- 四個固定合成 destination 綁定四店及模組，沒有預設門市；錯誤 OA secret、未知 destination、額外 storeId／module、非 fixture actor、匿名／群組及 standby text 都拒絕。這不是通用 LINE parser，不接受任意真實顧客資料。
- 一批最多 20 個事件、原始 body 最多 64 KiB、文字最多 500 字；整批結構驗證完成才處理文字。空 verification batch、follow 與非文字事件不進入 AI。這只是離線 driver 的保守限制，未改正式事件支援範圍。
- 簽章通過也只建立 TEST scope，不取得會員權益、業務工具或正式通路權限。destination 及 actor 參與既有 HMAC scope，事件以 webhookEventId 去重；replyToken 與 isRedelivery 不作為新事件 ID。

## 已執行

`npx vitest run src/__tests__/ai-digital-butler-line-synthetic.test.ts src/__tests__/ai-digital-butler-routing.test.ts src/lib/__tests__/line-store-token.test.ts`

3 檔、61 個測試通過，其中新增 31 個合成事件案例。涵蓋四模組已核准營業時間回答、簽章竄改、錯誤通道、無效／過量／覆寫 scope 的輸入、整批驗證、重送、同事件改文字、真人接手、人工恢復、未知問題、受保護 prompt、跨店與跨 actor、總停止及授權拒絕。Mock Provider 僅回傳已提供來源 ID，回覆由原服務呈現核准文字。

真實 CoreDigitalButlerRuntime、Routing、Service、Request／Dispatch repository 與 PostgreSQL 語意的 PGlite 都有執行；原流程仍是請求內合成 repository。真人狀態與去重在測試 DB 持久保存。沒有新增 Docker PG schema 測試或雲端 DB 操作，上一輪 4 項真實 PostgreSQL 測試的證據保留原版本，不改稱本輪已重跑。

每個案例封鎖並檢查 `fetch` 零呼叫；沒有用真實 LINE／Messenger／Email、OpenAI 或 Supabase。三張私有帳本不保存 raw LINE actor、replyToken 或訊息本文。最終檔案 ESLint（零警告）通過；本機 TypeScript 首次因 Node 預設 heap 不足中止，僅提高本機程序記憶體後重跑，沒有更動專案或部署設定。最終結果見 [結構化紀錄](../../artifacts/ai-digital-butler/line-synthetic/summary.json)。

## 版本、費用及限制

本輪只增加 `src/__tests__`、文件及證據；與已驗 runtime `b25fdaabf882bd6c069c736b59cf428eacf64e56` 相比，正式執行程式相同。既有受保護 Preview 保留，未為測試工具或文件建立新 Vercel 部署，沒有新增雲端 DB／OpenAI 用量、服務或 IPv4 add-on。push 會沿用既有 GitHub CI，實際平台費用未取得。

不重開四店或總開關，不重設測試角色，不建立新的通行憑證。上一輪收尾的總停止、四店關閉、真實外發封鎖維持；本輪沒有對外寫入來變更它們。Production 及 main 不變，PR 保持 Draft。沒有變更後台操作，不新增指南文章或抵扣 205／96 題歷史待驗。

這次完成的是**離線 LINE 格式合成事件測試**。尚未驗正式 Webhook HTTP 入口、真實 OA、會員綁定、原流程資料庫跨事件狀態、真人客服工作台、真實模型對抗、實體裝置或正式外發；不宣稱完整 Phase 2、正式通路整合或試營運完成。既有 Preview 的 RWD 證據仍屬前輪版本，本輪沒有 UI 差異。Cloudflare 不在此離線測試的呼叫路徑，歷史額外 build 問題仍未處理。
