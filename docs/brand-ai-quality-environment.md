# STEAMFOOT 共用 AI 品質評估環境提案

狀態：共用 workflow、加密預留與續跑程式已本機實作；雲端未安裝／未驗。尚未建立 Secret、未啟動排程、未部署、未呼叫模型。
基準：PR #1602，`75b0b1e16c46798a793dda91d551499109fcbf29`。
本文件取代「每輪建立專用 Key／Environment」的建議，不改變本輪呼叫、預算或發布授權。

## 已確認與未確認

- 目前團隊的 Vercel `steamfoot` 名稱搜尋僅回傳 `steamfoot-booking`；不是已確認存在另一個獨立 AI 執行專案。
- Vercel 有 Production Sensitive `OPENAI_API_KEY`，及僅限封存支線 `feat/ai-digital-butler-core` 的 Preview Sensitive Key。只檢視名稱、類型與範圍，不讀取值、不複製、不變更。
- Production `BRAND_AI_ENABLED=0`。本輪沒有部署或模型呼叫。
- 本任務 Cloud 環境沒有已綁定 Secret 或 runtime variable。這不代表其他已保存環境沒有 Key。
- OpenAI「STEAMFOOT AI - Preview」專案成員、Key 權限、模型限制、使用量及預算尚無可用管理連線核實；不能由名稱推定已隔離。
- GitHub Secrets 清單曾回覆 integration 403，未換路重試。不能推論 Secrets 不存在；保護規則與既有測試 Secret 需管理員一次核對。
- repo 已有 GitHub Actions CI 與本機 PostgreSQL 17.6 測試流程。既有 Production Actions Environment 不是測試資源，禁止借用其憑證。
- 已有評估器、40 題 corpus（35 API／5 手機）、本機 checkpoint、原子寫入與程序鎖。尚無跨 runner 的耐久帳本、加密保存或自動續跑。

## 最小建議

重用既有 OpenAI 測試專案、GitHub Actions、評估器。建立或確認一個固定的 GitHub Environment：`steamfoot-ai-quality`；未來 PR 共用，不逐 PR 新增。

工作流程為：已審查 SHA → 無 Secret 的離線測試 → 有限額的真實 API 評估 → 分類品質報告 → 通過後才進入部署驗收。

純模型評估直接執行 provider、核准知識與合成前文 fixture，不依賴 Vercel 部署、分享連結、正式 LINE 或資料庫。
這不是完整 webhook／資料庫／記憶排程驗收，不能用來代替那些檢查。

測試 job 不注入 Production Key、任何正式資料庫 URL、LINE token、Vercel token 或 bypass。
未來資料庫整合測試優先沿用 Actions 的一次性 PG17.6 fixture；確實需要雲端整合時才另用既有隔離庫及既有最小角色，不能把正式憑證交給模型評估 job。

## 一次性設定與入口

1. OpenAI：https://platform.openai.com/settings/organization/projects
   確認現有 `STEAMFOOT AI - Preview` 與正式專案不同，核對成員、允許模型、資料與使用量。
2. OpenAI Key：https://platform.openai.com/api-keys
   切換至上述測試專案。若已有保存在核准 Secret 管理處、權限適當的測試 Key，可由管理員直接綁定而不向助理揭露。
   若唯一副本只在 Vercel Sensitive 中，不能抽取；屆時只需一次建立長期用途的 Restricted Key，而非每輪建立。
   名稱建議 `steamfoot-ai-quality`；僅開放實際需要的 Responses Write，不開放非必要的 Files、Assistants 或管理權限。模型權限依已批准模型核對。
3. GitHub：https://github.com/rock7652-beep/steamfoot-booking/settings/environments
   核對是否有可沿用且無正式憑證的測試 Environment；沒有才一次建立 `steamfoot-ai-quality`。
   `Environment secrets`：`AI_QUALITY_OPENAI_API_KEY`，及僅用於私有 checkpoint／結果加密的 `AI_QUALITY_STATE_KEY`。
   第二個 Secret 不是 API Key，也不產生模型費用。加密使用 Node 內建能力，不新增服務或加密 Framework。
4. 僅允許可信工作流程來源；核對公開 repo／帳戶方案支援的 Environment 保護功能。設定不成立則停止，不用移除審查來繞過。
   本輪不要求使用者立即設定；先審查本方案，後續再提供與實際 UI 一致的操作。

Key 定期輪替，例如每 90 天或疑似外洩立即輪替；期間可依組織政策調整。
在同一 Environment 更新 Secret，以後的新工作直接使用新值，不需 Vercel 重建。
先停排程並讓舊工作完成或停止，確認一次受控驗證後撤銷舊 Key；驗證呼叫也要占用核准額度。
加密金鑰另有版本，舊 checkpoint 不能因輪替而無法解密或被當成空白；更新需保留可驗證的遷移紀錄。

## 公開 repo 與可信程式碼

- 一般 PR／fork CI 不取得任何真實 Key，僅離線與 fake transport。
- 真實評估只執行明確核准的完整 SHA，不能接受任意分支名後直接執行持有 Secret 的程式。
- 可信 workflow 固定在經審查的來源；PR 的程式、依賴鎖檔及 install script 也在信任範圍內，不能只審查 workflow。
- 不用 `pull_request_target` 執行 PR 程式。Actions 固定版本；安裝與一般檢查不注入 Key，僅必要的模型執行 step 注入。
- 公開 log／artifact 不能當私有儲存。stdout 只輸出計數、代碼、延遲、用量與來源 ID；不輸出 Key、真實顧客文字或可識別資料。
- 原始合成模型回答供品質審閱，與帳本一起加密保存；只公開去識別摘要。不把自動驗證通過冒充已完成人工品質審閱。
- runner 結束清除明文。未審查的程式、機密輸出或錯誤堆疊不能透過公開附件發布。

## 可重複與跨日執行

固定一份測試環境累計呼叫帳本，另用評估批次識別 PR／SHA／模型／corpus／提示詞版本與當次額度；不是新增產品資料表或驗收窗口。
不同 PR 同日共用每日限額；不能各拿 20 次。workflow 全環境單一 concurrency group、模型並行 1，不以取消上一批的方式放行下一批。

Actions runner 的本機檔案不耐久，既有 `.lock` 和 `rename` 不能單獨保證跨 runner 安全。實作必須補上：

- 加密帳本沿用既有 Actions artifacts 保存；不可用 cache 當權威帳本。
- 每一執行批次先將可能使用的呼叫與最壞費用預留寫入耐久 checkpoint，再進入模型 step。
  即使 runner 被強制終止、`always()` 未執行，已持久化的預留仍占額；不是依賴結尾上傳才計費。
- 每次呼叫本機仍先記錄，最終保存實際結果。未知預留不自動退款；中斷或缺檔就停止對帳，不能退回較舊版本或從零開始。
- 下一次工作必須辨識最新 reservation／result 序列、驗證完整性及 SHA；artifact 被刪除、過期或解密失敗即拒絕續跑。
- 初始 run ID 由管理員一次固定；每次確認該 run 與其後連續執行編號。整筆 run 被誤刪、重跑，或最新 attempt 隱藏原消耗紀錄，也一律停止，不能掉回較舊帳本。不得清除這條流程的 run 歷史來「修復」額度。
- 明確保存期限（建議 90 天）與刪除前的核對程序；本方案不是無期限帳本系統。保存期限屆滿不能被解讀為額度重置。
- 分批只續跑未啟動題目。跨日依共用台灣日期函式計算；修正呼叫也占每日與整批上限。
- 預算不足、驗證高風險、Key 異常、狀態不明均停止。既有 `generated`、`repaired`、`knowledge_fallback`、`uncertain` 分開統計。

先實作並實測耐久性，才啟動自動跨日排程。不是只新增一個 workflow 就宣稱可安全續跑。

## 授權與成本

長期保存 Secret 不等於未來所有 PR 都獲准花費。
最小預設是一批核准 SHA、模型、案例集、總呼叫與費用後，該批正常跨日續跑無須每天重新建立 Key 或授權。
若未來要「在月度固定額度內自動評估已審查 PR」，需一次另訂該額度與可執行來源，不從本輪推定永久授權。

#1602 仍是 35 API 題最多 70 次；手機另外最多 10 次／5 回覆；總計 80 次、US$0.10、每日 20、並行 1。
正式手機測試與離線評估不能同時使用同一授權日額度；維持既有跨日與唯讀用量核對規則。
測試 Key 不用於其他未記帳程式，否則無法以此帳本宣稱涵蓋該 Key 全部用量。

費用上限需依可用模型、最新費率、輸入與輸出上限計算最壞呼叫費用並先預留；未知費率拒絕執行。
OpenAI Project budget alert 不是硬性停止。未來新增模型或額外 judge model 不自動取得授權。
模型評估本身不呼叫 Vercel build／deploy，不需要 Vercel Key；只使用既有 Actions 額度，不能承諾 GitHub 及 artifact 儲存永遠免費。

## 一次性工程與尚未執行

沿用評估器，只補一個共用工作流程、耐久額度／加密 checkpoint 與報告輸出，不新增後台、服務、產品資料表或通用 Agent Framework。
先完成不持有 Secret 的模擬測試：runner 中斷、跨 PR 額度、跨日、狀態遺失、超額、加密與輪替、錯誤輸出去敏。
工作流程首次安裝可能需要進入 default branch；應獨立審查該執行入口，不得為了 API 評估提前合併尚未過品質門檻的 P0 產品修改。
推送／安裝前另核對是否會觸發既有 Vercel／Cloudflare 自動建置，不以「只改 workflow」推定沒有部署副作用。

本機實作與雲端環境安裝是不同關卡；真實模型、GitHub 跨日 runner、雲端 artifact 及 Key 輪替尚未驗證。

## 本次最小工程成果

- `.github/workflows/ai-quality.yml`：只接受 main 的手動／每日排程，固定 Environment，無 PR Secret、自動部署、migration 或 LINE token。依賴安裝停用 lifecycle scripts；動作以完整 SHA 固定。
- `campaigns.json`：固定 #1602 已審查的產品 SHA、案例 hash、模型與期限。API 最多 70 次；總 US$0.10 中保留 US$0.01128 給手機，API 上限 US$0.08872。
- `shared-state.ts`：AES-256-GCM、repo／環境 context 驗證、全環境每日 20 次與單一 lease、每題最多兩次修正額度、最壞費用預留，已消耗／未知額度不得重設。
- `shared-runner.ts`：先完成 artifact 預留上傳再執行模型。僅確認正常完成後釋放「保證未呼叫」的預留；已啟動但不明的請求保留整批預留並停止。下一 run 必須讀取前次有效執行的 checkpoint，不得掉回舊檔或空白。
- 模型 child process 不繼承 GitHub token、artifact runtime token 或狀態加密 Key。公開 stdout 不轉發 candidate 的 stdout／stderr。
- `evaluate.ts` 沿用既有流程，增加核准版本載入、批次案例／呼叫上限、預期台灣日期及基礎設施錯誤停止。產生／修正／知識補救／不確定結果仍分開，人工審閱仍為 PENDING。
- `private-report.ts`：持有狀態 Key 的私有環境可離線解密，不呼叫模型，不把原始回答印到公開 log，拒絕寫回 repo。
- 發現 Environment 建立 API 回覆 403；沒有透過其他工具繞過。發現 main 的 `protected=false`；workflow 會拒絕在此狀態下評估。

每批最多 10 題、20 個呼叫名額；每題預留 US$0.002256（兩次共用 16,000 input／512 output，採每百萬 input US$0.125／output US$0.50 的保守費率）。修正呼叫仍逐次計數。
預留費用以題為單位，不因第一筆便宜回答而偽裝成本為零；實際供應商 usage 與帳單需另行核對。
35 題通常需要至少四次日批次，可能因實際已用額度、中斷或品質停止而更久；不得為趕進度重置額度。
本輪最早從確認停用後的下一個台灣日（2026-11-29）開始，正式 AI 期間保持停用，避免把前一輪手機測試當日用量忽略為零；手機驗收另安排後續台灣日。

## 管理員一次性設定清單

先完成入口審查／安裝與下列安全設定，最後才開 READY；不要把任何 Secret 貼回對話或 PR。

1. [GitHub Environments](https://github.com/rock7652-beep/steamfoot-booking/settings/environments)：建立 `steamfoot-ai-quality`。`Deployment branches and tags` 選 Selected，只允許 branch `main`，不允許 tag／其他分支。不要沿用六個含正式部署用途的現有 Environment。
2. [分支規則](https://github.com/rock7652-beep/steamfoot-booking/settings/rules)：保護 main，要求經 PR 審查後才修改 workflow／核准清單，禁止未授權直接推送、強推與刪除；管理員核對實際 bypass 權限與審查規則。程式的 protected 檢查只是最低擋板，不能替代此設定核對。
3. OpenAI：在前述測試專案核對 Key 確實不屬於正式專案。能從原安全管理處綁定就沿用；不能取回的 Vercel Sensitive 不抽取。必要時一次建立長期測試 Restricted Key，僅 Responses Write、核准模型，保存於同一固定 Environment 的 `AI_QUALITY_OPENAI_API_KEY`。
4. 同一 Environment 加 `AI_QUALITY_STATE_KEY`：在本人的私有終端執行 `openssl rand -hex 32` 產生 64 個十六進位字元，保存於安全管理處並填入 Secret Value；不是另一把 API Key。不要在 GitHub Actions 執行這條產生指令或把結果貼入對話。不要逕自覆蓋此 Key，既有 checkpoint 仍需它解密；API Key 輪替不需要改它。
5. Environment variables：`AI_QUALITY_READY=0`、`AI_QUALITY_STOP=1` 為預設。入口安裝後，在 [Shared AI quality](https://github.com/rock7652-beep/steamfoot-booking/actions/workflows/ai-quality.yml) 選 main、mode=initialize，執行一次零模型呼叫初始化。成功後把該 run 網址最後的數字存為 Environment variable `AI_QUALITY_GENESIS_RUN_ID`，才改成 READY=1、STOP=0。這是固定初始紀錄，不是每輪建立場次；之後不用每日批准或再次初始化。
6. 停止新批次：把 `AI_QUALITY_STOP=1`；已在執行的工作需在 Actions 按 Cancel；緊急憑證疑慮可撤銷測試 Key。不能只改 STOP 就宣稱已中止正在進行的請求，未知預留仍保留。

Secrets 與變數只存在於此測試 Environment，不能使用 repo-wide 正式 Key，也不能設定為可讓任意 PR 取得。
目前沒有安全權限可由助理完成第 1／3／4 項；第 2 項也尚未修改。這是明確管理權限限制，不是要求每次人工執行 SQL。

## 首次入口安裝邊界

原生 schedule／workflow_dispatch 的首次入口需要位於預設分支。只推送 #1602 不代表入口已可執行。
已將評估器與 P0 新增產品診斷型別解耦，可單獨安裝 workflow／QA scripts／測試，不需先合併 P0 產品、schema 或 migration。
獨立 bootstrap patch 必須另經審查；本輪沒有提前合併 #1602，也沒有為了安裝 workflow 修改 Vercel Production 設定。
此獨立安裝仍需核對 main 自動部署副作用；若無法證明略過，須一次取得該次影響的明確批准，不能假稱純 CI 檔案不會觸發部署。
之後每次模型評估均不推 Git、不部署，不會由評估 workflow 觸發 Vercel 建置。

## 私有品質審閱

下載受控 run 的 `ai-quality-result-*` artifact，只含 `state.enc`。在已安全注入 `AI_QUALITY_STATE_KEY` 的私有環境執行：

    node --import tsx scripts/qa/brand-ai-quality/private-report.ts /private/state.enc /private/quality-report.json

產生的新檔是 0600，包含合成回答供逐題審閱，不能公開上傳。工具不接收命令列 Key，不覆寫既有檔案。
加密報告自動產生不等於品質評分已完成；解密審閱與 release gate 仍需依原 34/35、核心全通過、高風險零容忍執行。

測試 Secret 特意命名為 `AI_QUALITY_OPENAI_API_KEY`，只在模型 step 映射為程式使用的 `OPENAI_API_KEY`，避免缺少 Environment Secret 時誤落到同名 repo-wide 正式 Key。
