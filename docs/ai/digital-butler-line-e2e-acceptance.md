# 已發布知識 → 真實 OpenAI → 合成 LINE → 人工接手驗收

2026-11-26（台灣時間），沿用 Draft PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。**必要主流程 13 個情境、六尺寸通過；額外的收尾登出 probe 有一項 QA 空值判讀錯誤，安全還原已另外核對。** 原始失敗保留，不改寫為全綠。[契約](digital-butler-line-e2e.md)、[結構化結果](../../artifacts/ai-digital-butler/line-e2e/summary.json)。

## 版本、授權與範圍

- Runtime `20d51680f4d63bbfa6e4729a0da6d3f72e590357`，deployment `dpl_2c4S9qYspkuzNSTgrCtJMSYZR7xX`，READY、來源相符，[受保護 Preview](https://steamfoot-booking-oz4gthq8u-rock7652-2111s-projects.vercel.app)。後續文件／證據提交以 PR head 為準，產品程式相同。
- 指定隔離庫 steamfoot-preview `ttworfzgwejdeolegkxl`，固定合成美業店及既有合成 OWNER。合成蒸足已達當日 20 次上限，不提高或重置額度，未重測蒸足真實 API。
- 使用者明確批准本部署單一 30 分鐘通行連結、短暫解除隔離 TEST 總停止、僅啟用合成美業，以及含重試最多兩筆真實 OpenAI。其他三店、Production 與真實 LINE／Messenger／Email 外發維持關閉；無論結果皆還原。
- 前輪因連結授權與總停止限制而暫停，未繞過；本輪取得明確批准後執行。未讀取 OpenAI Key 或 DB 密碼，沒有新增表、migration、環境變數、購買服務或 IPv4 add-on。
- 沿用既有部署，此輪實際驗收新建置 0；前輪程式實作的一次必要 Preview 建置保留其紀錄。未為重看畫面、QA helper 修正或文件重建。

## 同次主流程與回答正確性

正常登入原店長頁，僅從「合成 LINE 對話演練」選固定情境。後端建立 LINE 格式事件、用公開 fixture key 及共用簽章演算法驗證，再由同一 Routing／原流程引擎／已發布知識／Service／Provider 及持久帳本處理。這不是正式 LINE OA、HTTP Webhook 或訊息傳輸驗收。

1. 總停止時詢問已知問題，模型呼叫 0、請求仍 47；確認沒有跳過 kill switch。
2. 短暫開啟合成美業 TEST。原流程命中及等待輸入皆由原流程處理、模型呼叫 0。
3. Mock 問營業時間，讀到已發布版本並呈現核准文字；重送原事件不再呼叫模型。
4. 明確要求真人時不呼叫模型。後續新事件與重新進頁皆靜默，直到原待人工清單「準備恢復 → 確認恢復」；同一交易記錄 audit，LINE 狀態同步更新。
5. 第一次真實 API：gpt-6-luna 從 5 筆已發布來源中選中唯一合法的營業時間來源 `kb-1-hours-df8a0f1408c8d914`，publishedVersion=1。伺服器重新核對來源後顯示：

> 2026-11-26（台灣時間）營業時間：10:00–18:00。此資訊不代表可預約名額。

此內容與原合成 BusinessHours 全週 10:00–18:00 一致；Mock 與真實模型路徑呈現相同核准文字。沒有讓模型自由撰寫預約承諾。重送這筆真實事件，providerCalls=0，沒有第二筆扣帳。

6. 第二次真實 API：詢問知識庫未涵蓋的天氣，模型選 handoff、來源 0；Request 為 COMPLETE／HANDOFF 且有實際 tokens，確認是真實分類結果，不把 provider failure／UNKNOWN 當正常轉接。
7. 接手後以 OpenAI 再問已知問題仍靜默、模型呼叫 0；重新進頁、改 Mock 仍靜默。再次經原待人工清單確認恢復後，只對新事件恢復回覆，使用 Mock 驗證、不再付費呼叫。
8. 還原總停止與四店關閉，再問已知問題，模型呼叫 0。原有其他合成接手旗標保留。

[Vercel source_selection 診斷](../../artifacts/ai-digital-butler/line-e2e/source-selection.json)：已知問題 selectedSources=1／selectedSourceAllowed=true／handoff=false；未知問題 selectedSources=0／handoff=true。未知問題的 selectedSourceAllowed=false 表示未選任何來源，並非選了越權來源。

## API 用量與費用

| 真實請求 | 結果 | Input tokens | Output tokens | 帳本保守估算 |
| --- | --- | ---: | ---: | ---: |
| 已發布營業時間 | COMPLETE／ANSWER | 651 | 36 | US$0.000687 |
| 未知問題 | COMPLETE／HANDOFF | 673 | 20 | US$0.000693 |
| 合計 | 2 筆，provider 重試 0 | 1,324 | 56 | **US$0.001380** |

實際供應商請求 2 筆，包含重試的授權額度已用完；應用事件重送皆為去重、不增加供應商請求。另新增 2 筆 Mock 計帳紀錄，供應商呼叫與估算費用皆為 0。

金額依原已核實的保守 Luna 費率與實際 tokens 計算，**不是 OpenAI 實際帳單**，未取得供應商實際扣款或帳單權限，不能宣稱已完成帳單對帳；也不包含平台建置或 GitHub 費用。

全庫 Request 47→51（Mock 44→46、OpenAI 3→5），全 COMPLETE；累計保守估算 1,310→2,690 micros（US$0.002690），RESERVED／UNKNOWN 0。Dispatch 65→78、全部 COMPLETE；恢復 audit 8→10。合成美業當日 9→13／20，剩 7；四店的模型、channels、日／月次數及月預算與驗收前完全一致，只有美業設定 revision 因開／關增加 2，其他三店 revision 不變。見 [逐階段帳本](../../artifacts/ai-digital-butler/line-e2e/ledger-checkpoints.json)。

## UI、測試與收尾診斷

[雲端原始結果](../../artifacts/ai-digital-butler/line-e2e/hosted.json) 有 13 個已完成情境、15 次互動事件、1920／1366／1024／768／390／360 六尺寸，沒有整頁橫向溢出或 pageerror。這是 Chromium 視窗模擬，不是真機。entryMs 包含 HQ 登入、工具換頁與 networkidle；本輪不是效能基準，不把它當單頁載入時間或與會員頁 1.72 秒比較。

程式 CI [45770794088](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45770794088) 四個 job 成功：1,864 檔／17,659 項 passed，36 檔／340 項 skipped，566.92 秒；音樂／運動／混合課程隔離 workflow 成功。先前本機 AI／LINE 228 passed、6 skipped，最後異動回歸 67 passed（重疊不相加）；本機 UI 6 情境／六尺寸無 hydration error。未執行的本機外部 PostgreSQL 案例不冒稱成功。

所有必要主流程完成並還原開關／清除密碼後，額外登出 probe 從 `/api/auth/session` 收到 `null`，但 helper 直接讀 `.user`，因此原始腳本 exit 1。這是 QA 判讀錯誤；它沒有新增第三筆 API，也沒有阻止 finally 的安全收尾。原 report 的 failures 保留。

已將 repo 外 helper 改成 null-safe 判讀，對**實際修正後的 probe 函式**以 null／空物件／user=null／有效合成 user 做 4 個離線檢查，均通過、網路呼叫 0。修正後 probe **未再次雲端重跑**；不重新建立連結或呼叫模型來掩蓋原失敗。安全判定另有 DB 密碼清除、原 session 回傳 null、Vercel 撤銷回應與未認證 HTTP 驗證支持。見 [診斷](../../artifacts/ai-digital-butler/line-e2e/cleanup-probe-diagnostic.json)。

## 最終安全狀態與剩餘邊界

- global stopped=true、四店 enabled=false；真實 LINE／Messenger／Email 外發全程封鎖。
- 單一臨時連結已撤銷，Vercel 撤銷回應的 shareable-link 數量 0；未認證請求仍 302 導向 vercel.com 驗證。沒有重建另一條連結，沒有擴大 Production／SSO 存取。
- 合成美業 OWNER 臨時 passwordHash=NULL、登入版本更新，原 session 已回傳 null。瀏覽器關閉，私密設定與協調旗標刪除；三個合成會員仍 SUSPENDED 且密碼為空。未操作真實帳號。
- Booking 129、Customer 1,367 不變；合成通知與 Lead 皆 0。舊 handoff 1 保留；新 LINE 測試對話已經明確恢復，沒有刪掉帳本或清零費用。
- 角色無 superuser／bypass RLS、connection limit 8，原 DB 密碼、嚴格 TLS、環境變數與正式資料不變。main `378cd9475317f6c4ab804f0e48642f1d4f0f567a` 未動，PR 維持 Draft、不合併／promote。[收尾證據](../../artifacts/ai-digital-butler/line-e2e/postflight.json)。

本輪完成的是合成美業店的真實模型 TEST 鏈。正式 OA／HTTP Webhook／實際傳送、真實 LINE 會員綁定、原流程跨事件持久 repository、其他模型、實體裝置及預約寫入均未驗。蒸足真實 API 因既有額度滿而未重測；暖暖試營運尚未決定。後台指南只補本功能範圍，仍 source-reviewed，205 題／96 待驗不變；沒有前台指南。額外 QA probe 的修正後雲端重跑與實際帳單對帳仍屬未驗項，不把本結果當完整 Phase 2/3 或正式客服已開放。
