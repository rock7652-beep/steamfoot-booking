# AI 數位店長 Phase 0/1 隔離驗收

**2026-11-26（台灣時間）：本次隔離 Preview 驗收完成；正式 AI 未啟用。**

本文件保留 Phase 0/1 歷史；最新店家知識管理與目前收尾狀態見 [Phase 2 驗收](digital-butler-knowledge-acceptance.md)。

## 版本與證據

- 原 PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)，支線 feat/ai-digital-butler-core。
- 驗收程式 SHA：3568ee7757cf20a32dfbea579eed17092674f297；main 基準 378cd9475317f6c4ab804f0e48642f1d4f0f567a。
- [受保護 Preview](https://steamfoot-booking-1qt2ihx64-rock7652-2111s-projects.vercel.app)，dpl_9avchKdGUK3y4ZahU5gXMzABdTzk，READY、來源一致、SSO 保留。
- [結構化結果](../../artifacts/ai-digital-butler/hosted-results.json)、[即時回覆截圖](../../artifacts/ai-digital-butler/hosted-live-luna.png)、[證據索引](../../artifacts/ai-digital-butler/README.md)。純文件／截圖的後續提交不重建相同程式，PR head 可能較程式 SHA 新。

## 通過項目

| 檢查 | 結果與實際範圍 |
| --- | --- |
| 連線／身分 | 原 Sensitive 憑證、專用角色、aws-1 Shared Transaction 6543、嚴格 TLS 及固定 CA；四合成店各自正常登入，AI 設定頁 HTTP 200 |
| 入口／權益 | 原設定頁只有一個數位管家入口，可返回再進 AI 區塊；獨立 AI 授權生效，未開原確定性流程時不掛載 |
| 寫入／停止 | 認證後 AI 設定儲存成功；global stop=true 時回停止訊息，未新增請求或呼叫 Provider |
| Mock | 四產業營業時間、四合成店各自回覆；同一事件重送回 DUPLICATE、無額外 ledger；人工接手擋下請求、明確恢復後可繼續 |
| 安全情境 | Mock 未授權會員問題與注入要求轉人工；跨店路由顯示無法存取，未露出 AI 區塊；不是已完成真模型對抗測試 |
| API／結算 | 兩筆已知結果、無自動重試；首筆保守轉人工，修正來源契約後已知營業時間成功選中核准來源，僅呈現原核准文字 |
| RWD | 蒸足 1920／1366／1024／768／390／360；其他三合成店 1366／1024／768，15 組全頁截圖均無水平溢出，含原側欄／頁首 |
| CI | 程式版 1,851 檔、17,479 項通過，36 檔／337 項跳過；Typecheck、changed ESLint、targeted、mixed-enrollment、music-makeup-postgres、sports-shared-card-postgres 通過 |

RWD 使用 Chromium 視窗模擬，不是實體 iPad／手機驗收。其他店截圖與 Mock 保留 c33eba33c 來源；後續修改僅 Provider／來源契約及合成診斷，UI／auth 未變。最終蒸足六尺寸、單一入口及真實回覆使用 3568ee775。

## 真實 API 明細

| 程式版／結果 | 模型 | Input / Output Tokens | 估算 micros | 時間 |
| --- | --- | --- | --- | --- |
| c33eba33c / HANDOFF | gpt-6-luna | 227 / 20 | 247 | 4,136 ms |
| 3568ee775 / ANSWER | gpt-6-luna | 335 / 25 | 360 | 4,716 ms |

兩筆均 COMPLETE，合計 input 562、output 45、估算 US$0.000607；這是配置的保守費率估算，不是供應商實際帳單。首筆是可確認成本的結算，不是 UNKNOWN，沒有盲目重試。修正版明示 PUBLISHED 參考資料、拒絕草稿、schema 限單筆及已提供 ID；診斷確認 supplied=1、selected=1、來源有效、handoff=false，不記錄訊息／ID／金鑰。

實際畫面回覆為「這是蒸足合成測試店，測試營業時間為週一至週五 10:00–18:00。」此為合成資料，不是任何正式店營業資訊。

## 收尾與隔離證據

- global stopped=true、四店 enabled=false；12 筆全為 COMPLETE（10 Mock、2 OpenAI），RESERVED／UNKNOWN 0，已計入及預留共 607 micros。
- 角色 connection limit 8、無 superuser／bypass RLS／Booking 寫入，LOGIN 有效至 2026-12-02 22:15:52（台灣時間）；未提高 DB 最大連線或付費資源規格。
- 四張 AI 表 RLS 開啟；四店新增 Booking 0、Customer 0。只新增合成店／帳號／設定與必要私有表，沒有複製真實顧客或改營運價格。
- 最後的測試 share grant 已撤銷，四合成帳號登入版本更新，暫存密碼與 session 檔刪除。OpenAI Key 由使用者親設，未讀取／輸出。
- Production／Development／其他 Preview 支線、正式資料庫與正式 migration 未改；原 Webhook／LIFF／Rich Menu 未改，沒有真實 LINE／Messenger／Email 外發。

## 失敗紀錄、限制與費用

舊版先後遇到 function 255.77 MB 限制、CA 信任、錯誤 Shared Host、Session 持有 8 條閒置連線及首輪來源選擇轉人工，皆保留在 runtime 歷史，不把失敗版本當最終驗收。Dedicated IPv6 不適合此 Vercel 路徑，未購買 IPv4 add-on；Shared Host 由使用者從官方介面確認。沿用原角色與密碼，以支線限定的端點選擇切換模式，未擴權。

測試重送工具錯誤曾帶出短期 Cookie，已撤銷其通行憑證、使舊合成登入失效並清理本機日誌；改用瀏覽器同源 fetch、錯誤摘要後，重送測試通過。沒有將 Cookie、密碼或金鑰放入 Git／PR／截圖。

Cloudflare Workers 額外檢查仍 failure，GitHub output 僅 Build ID、annotations 0，未取得原因；未更改 CF，也不宣稱整個 PR 全綠或可正式發布。它不是本次已驗證 Vercel 路徑的執行依賴。

Phase 0/1 共六次既有專案建置，各有失敗／修正證據；沒有為重看畫面另建置。沿用既有 Turbo，未切換全專案 machine；Vercel／GitHub 實際費用未取得。新增付費服務、專案及 IPv4 add-on 均為 0。

Phase 0/1 當時未驗／未開放（知識管理後續已驗，見頁首連結）：另外兩模型的真實 API、真實通路及實體裝置、真模型對抗測試、OpenAI 專案權限／資料控制與實際帳單核對、Phase 2 知識編輯／權威 adapter／真人工作台／實體清理、Phase 3 業務工具／正式 migration／試營運。指南 205 題／96 題待驗歷史未擅改；本次不是全站業務或全部指南驗收。

下一階段與緊急處理遵循 [Runbook](digital-butler-runbook.md)，不得直接將本隔離 Preview promote 正式。
