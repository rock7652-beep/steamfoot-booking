# STEAMFOOT 共用 AI 品質評估：開發每日100次方案

狀態：本機實作與驗證；真實模型評估未執行，等待測試 Secret／來源保護前檢。
本文件取代先前「測試每日20次、US$0.10、正常跨日」方案；不變更正式客服限制。

## 本輪已批准的界線

- 開發測試：每日最多100次、並行1、同一整批預算US$1。
- 35題初次回答及一次修正合計最多70次；必要重測合計最多30次。
- 不同版本、SHA、重測子集均以相同 batchId 累計；換版本不增加額度或預算。
- 正式客服的每日20次／並行1與原白名單、停用及停發規則不改。模型評估不持有正式資料庫、LINE或Vercel憑證。
- 35題集中同日執行，跨日只供額度不足或故障處理後續跑；不每天自動開新批次。未知請求不自動重跑、不退款。
- 品質門檻：至少34/35自然模型品質通過、核心題全部通過、高風險錯誤零容忍。generated／repaired／knowledge_fallback／uncertain 分開統計，補救不冒充自然生成通過。
- 正式AI保持停用，不提前合併#1602，不開發P1，不為測試發布正式版本或執行migration。

## 最小執行方式：不用先合併main

沿用已存在於main的 `ci.yml` 手動入口，指定 `fix/brand-ai-p0-quality` 的核准版本，呼叫共用 `ai-quality.yml`。
新增的共用檔使用 GitHub 原生 reusable workflow，不建立第二套後台、服務或資料庫。

1. CI的ai_quality=true只跑AI入口，一般PR仍照原四項CI執行。
2. admission job不掛Environment、不讀Secret：先確認固定Environment存在，再檢查來源支線保護、精確支線限制與核准清單。
3. Environment缺少或權限不足直接停止；不利用workflow自動建立Environment繞過先前403。
4. 只有admission通過，才進入持有測試Secret的job。initialization零模型呼叫；evaluate才執行模型。
5. 依目前支線的vercel.json，Vercel自動部署為false。手動CI沒有build／deploy／migration指令，不需要Vercel建置。
6. 此受保護支線持續作為固定QA入口；未來PR只更新核准candidate SHA，不搬移Environment、不要求保護或修改main。#1602合併時也需保留這條受保護支線，不把刪除QA來源當作清理。

工程端使用（使用者不需逐次執行）：

    gh workflow run ci.yml --ref fix/brand-ai-p0-quality -f ai_quality=true -f quality_mode=preflight
    gh workflow run ci.yml --ref fix/brand-ai-p0-quality -f ai_quality=true -f quality_mode=initialize
    gh workflow run ci.yml --ref fix/brand-ai-p0-quality -f ai_quality=true -f quality_mode=evaluate -f campaign=p0-1602

真正呼叫前仍需通過權限、Secret、TLS、精確SHA／corpus及預留檢查；有CLI不代表目前已具備執行條件。
不增加schedule到既有CI，避免每天額外跑完整測試或消耗模型額度。正常一批同日完成，備援續跑沿用原授權。

## 必須由管理員一次完成

### 1. 固定Environment與支線規則

頁面：https://github.com/rock7652-beep/steamfoot-booking/settings/environments

- New environment → 名稱 `steamfoot-ai-quality` → Configure environment。
- Deployment branches and tags → Selected branches and tags → 新增Branch `fix/brand-ai-p0-quality`。
- 目前只允許該Branch，不允許main、其他支線或同名Tag；程式會核對，不接受寬鬆的all branches設定。
- 不要借用現有Production Environment，也不將正式Secret複製至測試。

### 2. 兩個長期Secret

在上述Environment按Add environment secret，填Name與Value後儲存：

| Name | Value |
| --- | --- |
| AI_QUALITY_OPENAI_API_KEY | OpenAI測試專案的長期Restricted Key |
| AI_QUALITY_STATE_KEY | 獨立隨機的64字元十六進位加密值 |

OpenAI入口：https://platform.openai.com/api-keys 。先切換至 **STEAMFOOT AI - Preview**。
能從原安全管理處綁定既有測試Key就沿用；若唯一副本只在Vercel Sensitive，不能取出。
必要時一次建立長期Restricted Key，僅Responses Write及核准模型gpt-6-luna，未來各PR共用，不逐輪建立。
確認該專案與Production分開。OpenAI budget alert不是硬性停用，呼叫與費用硬上限由測試帳本執行。

在本人的私有終端執行 `openssl rand -hex 32`，將結果保存於安全管理處並填入AI_QUALITY_STATE_KEY。
不要在公開Actions執行此產生指令，不要將結果貼回對話、PR或log。API Key及狀態加密值是兩個不同Secret。
測試Secret採獨立名稱，避免缺少Environment Secret時誤用同名repo-wide正式OPENAI_API_KEY。

### 3. 停用變數與來源保護

Environment variables新增 `AI_QUALITY_READY=0`、`AI_QUALITY_STOP=1`，先維持停用。
來源保護入口：https://github.com/rock7652-beep/steamfoot-booking/settings/rules

單人管理最小Ruleset：

- Enforcement status=Active；Target branches Include by pattern=`fix/brand-ai-p0-quality`。
- Bypass list只放本人Repository admin，Always allow，讓單人仍可更新已審查的測試來源。
- 勾選Restrict updates、Restrict deletions、Block force pushes。
- 不要求第二位PR reviewer；不要勾Require a pull request before merging、Require approvals、Require signed commits、Require workflows to pass。
- 只影響指定測試支線，不修改main。

Ruleset不是Secret的SHA核准機制，Environment另外設定：

- Required reviewers只選本人rock7652-beep。
- Prevent self-review不勾，才能核准本人發起的批次。
- Allow administrators to bypass configured protection rules取消勾選。
- workflow唯讀admission會先列出workflow SHA、candidate SHA、案例／預算；核對兩個SHA後，由本人在run頁Review deployments核准。
- Ruleset bypass允許本人更新測試來源；Environment禁止bypass則保留本人對Secret job的核准，兩者不是同一設定。這是同一管理者核准一次含Secret的job，不需要第二帳號。35題共用該job核准；初始化及另開修正版重測仍須各核准其job。GitHub原生Environment不提供「某SHA永久免審」功能，不能暗中自動approve來假裝沒有此限制。
- 助理不得代本人approve或bypass pending deployment。未核准的job不會取得Environment Secret。
- 規則是否允許實際可信自動化寫入，仍需管理員核對。若推送被拒絕，不能以強推或其他帳號繞過。

### 4. 一次零呼叫初始化

前述設定完成後，由助理執行preflight與initialize；成功後提供初始run網址及編號。
管理員將編號保存為Environment variable `AI_QUALITY_GENESIS_RUN_ID`，再設定READY=1、STOP=0。
此編號僅設定一次，不是每輪驗收窗口，也不用每日重新授權或建立Key。
本輪同一批次及必要修正已獲授權；未來其他PR仍須有已審查SHA與明確預算，不推定永久花費授權。

## 跨runner安全及費用

沿用AES-256-GCM checkpoint。先上傳整批預留，再進入模型step，避免runner中斷卻遺失已花額度。
正常完成只釋放保證未呼叫的預留；未知／中斷保持預留並停止對帳，不能重設數字或重跑原題。
同一Environment的所有批次共用每日100次；同一batchId的所有SHA共用100次／US$1及initial70／retest30。
一題最多兩次共用16000 input／512 output，保守預留US$0.002256；35題第一輪最多預留US$0.07896。
100次的保守模型費用仍低於US$1，這不是實際帳單；實際usage、延遲與帳單另核對，未知費率或期限過期即拒絕呼叫。

初始run與其後的執行編號必須連續；誤刪run、artifact過期／缺失、解密失敗、rerun隱藏原attempt一律停止，不掉回舊帳本。
公開artifact只保存密文，保留90天；不得將刪除歷史當成重置額度。source、corpus及授權變更需審查，不自動擴權。
既有二十次限制只改在QA腳本；正式 `src/server/services/brand-ai-quota.ts` 不修改。

## 實際回答的私有審閱

助理可隨run傳入臨時的公開收件資訊；模型實際回答另以Node內建加密封裝為review.enc。
私有解密資料只留在本任務私有檔，GitHub artifact維持密文；不用取出OPENAI Secret或checkpoint Secret，也不新增管理員Secret。
這不是新的API Key、付費服務或產品Framework。初始化／加密測試不計作真實模型品質。

取得回答後逐題對照核准來源、需求、前文、多問題覆蓋、必要條件及安全性，保留真實審閱證據。
修正版本以新campaign ID／SHA及同一batchId登記，必要重測由caseIds選取；不重設舊ledger或費用。
不能因換版本就假設未重測題目仍通過；需審查變更影響。若影響全部35題且30次重測不足，必須停止並回報，不能冒稱整體通過。

## 停止與輪替

STOP=1阻擋新批次；正在執行的工作需在Actions Cancel。未知預留仍保留，不將取消視為未計費。
依組織政策定期（例如90天）輪替測試API Key，在同一Environment更新即可，不需Vercel重建。
不要連帶覆寫狀態加密Secret；舊帳本仍需它解密。狀態金鑰遷移需核對完整性，不能以新密鑰建立空帳本。
目前缺少的設定或權限會據實回報；真實35題未執行前，本階段不能標記模型品質已完成。

取檔相容性：repo既有未註冊的`.claude/worktrees` gitlink會令checkout的內建persist=false認證清理失敗。評估入口保留gitlink，取檔後立即以checkout-auth.mjs移除並驗證暫時read token，未成功清除就停止，且在npm／candidate程式及API Secret使用前完成。實際repo副本與合成gitlink測試均確認內容不變、認證已清除，不藉修復放寬權限。
