# Phase 2 店家知識：隔離 Preview 驗收

後續最新狀態見 [Mock 串接驗收](digital-butler-routing-acceptance.md)；下列知識管理版本、40 筆用量及建置次數保留為該階段歷史。

2026-11-26（台灣時間）完成本輪「店家知識管理」驗收。正式客服未開放；通路整合、客服工作台與業務工具不在本輪完成範圍。

## 版本與環境

- 同一 Draft PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)，feat/ai-digital-butler-core；沒有另開 PR、合併或正式部署。
- 已驗 runtime：`0a094209baf7858eff55c0feb47cb77c552cf302`；main 基準 `378cd9475317f6c4ab804f0e48642f1d4f0f567a`。之後僅文件／證據的 head 不另建相同程式 Preview。
- [受保護 Preview](https://steamfoot-booking-jn6wva5bq-rock7652-2111s-projects.vercel.app)，`dpl_HbC6fvk9u8ud8gJcCz4qh8iG9LNc`，READY、來源 SHA 一致、SSO 保留。
- 僅 Supabase steamfoot-preview / `ttworfzgwejdeolegkxl`；沿用原角色、aws-1 Shared Transaction 6543、嚴格 TLS 與固定 CA。沒有讀取／重設 DB 密碼或 OpenAI Key，也沒有變更環境變數。
- 私有 DDL：`preview-knowledge.sql`，SHA-256 `5c66c73a1246e4c5c29645e5476433dcb73a35d28e0aeaad6f1a8701ecb8b755`，僅手動安裝在隔離庫，不進自動 Production migration。

## 已完成操作

| 項目 | 實際證據 |
| --- | --- |
| 四店登入與發布 | 蒸足、美業、運動、音樂四個合成 OWNER 各自填寫介紹、FAQ、禁止詞及三項引用，儲存後發布成功；停止狀態下測試不新增 ledger |
| 四店知識 Mock | 各店介紹含自身標記；FAQ、今天營業時間、各自服務名稱、各自方案定價皆符合來源；禁止「醫療」關鍵詞轉真人，再明確恢復對話。共 24 筆 Mock |
| 權威價格 | 僅合成蒸足方案從 NT$600 改 NT$700，未重新發布即讀到 NT$700；完成後還原 NT$600。沒有複製價格到手動知識 |
| 草稿與衝突 | 雙分頁持有同版本；先儲存者成功，舊版被拒絕且保留本機文字。已發布介紹不受新草稿影響 |
| 撤下 | 蒸足撤下後保留草稿，publishedVersion 由 1 變 2；後續測試轉真人，不沿用舊介紹 |
| 真人／保護 | 禁止詞在 Provider 前攔截；持久接手與明確恢復仍有效。退款等受保護問題不可用精確 FAQ／Mock 繞過（回歸測試） |
| 操作連續性 | 收合重開保留未儲存草稿；返回設定時取消離開仍保留文字；跨店路徑不顯示可編輯知識 |
| 晚到結果 | 發布／撤下／價格／模組變更及來源失效後抑制舊回覆，已知 API 費用正常結算；此並行情境為服務與資料層測試，未額外花費真實 API 重演 |

## 真實 API 與收尾

本輪僅 **1 筆 Luna**：已發布的合成店家介紹成功選中來源，後端顯示核准原文。Input **668**、Output **35**、延遲 **3,760 ms**、保守估算 **703 micros = US$0.000703**；COMPLETE／ANSWER、沒有自動重試。這不是供應商帳單。

本輪新增 27 Mock（含禁止／撤下攔截）及 1 OpenAI；累計 **40 筆全 COMPLETE：37 Mock、3 OpenAI**。三筆 API 合計估算 **US$0.001310**。全域 stopped=true、四店 enabled=false、RESERVED／UNKNOWN 0；合成 Booking／Customer 仍為 0，測試價格已還原。五張 AI 表 RLS 啟用，角色仍無 superuser／bypass RLS／建角色／Booking INSERT，connection limit 8、LOGIN 到期時間不變。

手動建立的短期測試通行碼已撤銷，四合成帳號登入版本已更新，使先前應用程式 session 失效；暫存密碼、browser state 與失敗截圖已刪除。正式站、Development、其他 Preview、LINE／Messenger／Email 外發未變更。

## UI 與測試

15 組 Chromium 模擬尺寸：蒸足 1920／1366／1024／768／390／360；美業、運動、音樂各 1366／1024／768。皆無水平溢出，縮放時保留未儲存草稿。已檢視桌機、768 與 360 圖像；不是實體 iPad／手機驗收。完整頁面的早期 CRUD／Mock 截圖保留當時捲動位置的 fixed header；RWD／真實回覆截圖先回頂部再擷取。

每店每 stage 一筆：含登入的完整資料可用時間四筆中位 11,686.5 ms、範圍 10,429–16,824；已登入 fresh browser 的 Mock 入口四筆中位 4,299.5 ms、範圍 3,916–6,244。這是描述性紀錄，沒有受控前後效能比較，也不宣稱改善秒數；各階段任務完成時間見 JSON。

本機相關測試 **61 項**、型別與 changed lint 通過。runtime SHA 的 [CI 45731375762](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45731375762) 通過：**1,853 檔／17,499 項**，36 檔／337 項跳過；另外三項既有 PostgreSQL 整合通過。新增 TEXT 型別參數 PREPARE 回歸，重現 Prisma 與自動推斷參數的差異，驗證發布及撤下均能處理時間欄位。

## 修正歷程與限制

本輪共四次既有專案建置：18d86b37d 型別失敗；253f0ad5c 可部署但發布失敗；55a43897a 補安全步驟診斷；0a094209b 修正時間轉型後完成驗收。首次匯入遺漏與未等待本機型別檢查結束是執行疏漏，不能把失敗建置算成通過。發布失敗是 Prisma 將字串參數送成 TEXT，現已明確轉型 timestamptz。原日誌中的 prisma:error 實際列在 info 層，後續查核須一起查看，避免只查 error 而錯過原因。沒有為重看畫面或純文件另建置；Vercel／GitHub 實際帳單未取得，沒有新增付費服務、專案或 IPv4 add-on。

瀏覽器曾遇 ERR_CERT_VERIFIER_CHANGED，錯誤頁帶出短期 Preview share URL；已立即撤銷該通行碼、改為遮罩診斷並清理暫存。沒有輸出 OpenAI Key、DB 密碼或完整 DB 連線字串，沒有降低 TLS 驗證。

正式店與真實通路尚未開放；僅完成合成隔離資料的公開來源投影，不代表真實交易、優惠、個人權益或即時名額已可查。禁止事項是正規化關鍵詞，不是語意禁語服務；六項／800 字與總輸入上限超出時會阻擋／轉真人。其他兩模型、真模型對抗、實體裝置、供應商實際帳單及正式發布未驗。Cloudflare 歷史額外 build 失敗尚未取得原因，未宣稱已修復；它不在本次 Vercel 執行路徑。

後台指南沿用 AI-BUTLER-PREVIEW-01 並更新本輪操作，維持 source-reviewed；不抵扣全站 205 題／96 題待驗的歷史盤點。

[工程設計](digital-butler-knowledge.md) · [結構化結果](../../artifacts/ai-digital-butler/phase2/summary.json) · [API 回覆](../../artifacts/ai-digital-butler/phase2/steamfoot-openai.png) · [768](../../artifacts/ai-digital-butler/phase2/steamfoot-768.png) · [360](../../artifacts/ai-digital-butler/phase2/steamfoot-360.png)
