# STEAMFOOT AI Agent P0 品質修復與發布審查

狀態：本機實作／驗證，未推送、未部署、未安裝遠端migration、未進行真實模型評估。
基準：main `99adf9097d76aeb42d1a9bafd4b29f857698dea7`；支線 `fix/brand-ai-p0-quality`。
原則：**事實由工具提供，表達交給模型。** P0先修現有核准來源與生成管線；P1工具呼叫只做設計。

## 前一輪收尾與問題證據

#1601手機實測結束：5次模型、2筆ANSWER、3筆ERROR，歷史17筆／17次，active0。
已將Production AI flag恢復0，5個公開alias核對回同版停用部署3px4，沒有新增還原建置。
舊版本未記錄驗證失敗代碼／階段，不能從3筆ERROR推定其原始錯誤原因，也不重建或保存顧客原文。
已知可在本機重現：一般數字被當成事實錯誤、否定不支援功能被當成承諾、合法申請後聯繫說明與禁止真人轉接規則衝突，以及來源只含試用條件卻沒有申請步驟。

## P0實作

- 共用溝通規範保留直接回答、約50～150字、前文理解與不過度推銷，縮短提示並解除一般措辭／數字黑名單。字數、分段與追問數是品質指標，不是拒答理由。
- 確定性驗證聚焦：核准來源、價格／可識別方案價格對應、網址、期限／優惠日期／最低承諾、個資及未授權操作；否定不支援不再當作承諾。
- 金額無法可靠解析時仍保守修正／使用核准來源；不能聲稱數字驗證已能理解所有中文語意。來源引用與字面檢查也不是逐句事實證明。
- 加入同源Q3申請流程與案例的公開深連結；只索引published指南。中文檢索使用重疊bigram，依當次問題／結構化前文選取相關產業模組，避免無關資料擠掉修正預算。
- 知識仍從既有公開價格、FAQ、政策、案例常數讀取，不查其他門市資料；不新增知識庫後台、模型工具loop或營運工具。
- Responses完成但schema／高風險驗證失敗時，V2最多修正一次。修正使用相同核准來源、當次問題與錯誤碼，前次回答只暫存於請求記憶（個資驗證失敗不重傳草稿）；不保存或輸出到日誌。V1維持單次，並統一使用不虛構真人轉接的錯誤提示。
- 所有嘗試共用12秒deadline、16000輸入token預算、512輸出token總預算。修正至少剩2500ms、64輸出token且輸入預算足夠才發出；不把每次重試當作新的12秒或512token。
- HTTP錯誤／未知用量不自動重試。仍無法產生可用回答時，對申請、案例、已確認方案等明確問題優先提供伺服器核准內容；未知／敏感操作不亂選FAQ。fallback不更新未驗證profile、不增加模型呼叫，且與模型生成結果分開標記。
- 每次模型嘗試均先經費控callback。已預留但送達／費用不明的請求不退款額度；用量不明保留null，不能當零費用。

## 診斷及隱私

`diagnostics`只存模型識別、可用來源IDs、嘗試次數、route及固定錯誤代碼／階段／安全來源IDs。來源版本與最後引用IDs沿用既有欄位。
階段包括provider、configuration、budget、transport、envelope、validation、storage、delivery、memory；HTTP狀態以固定HTTP_429等代碼記錄，不存HTTP body／例外堆疊。
route為generated、repaired、knowledge_fallback、uncertain。fallback或本機fake不能被統計成真實模型品質通過。
不存顧客訊息、模型草稿、完整LINE userId、電話、Email、Key或原始例外。已驗證profile及原有固定TTL／世代／CAS不變。

## 呼叫與回覆費控

一筆webhook事件仍只claim一次、最多reply一次；修正不建立假webhook或第二筆回覆帳本。
`modelStartedAt`記第一次，新增`repairStartedAt`記最多一次修正；每日用兩個實際時間分別計入台灣日曆日，並行上限仍1，修正僅能沿用自己未到期的lease。
在既有advisory lock內同時核對每日20、絕對模型上限、並行與該事件修正狀態；多連線不能多搶一筆。
`BRAND_AI_REPLY_LOG_LIMIT`仍限制總reply claims；新增選填`BRAND_AI_MODEL_CALL_LIMIT`限制第一次＋修正總數。未設新值時沿用既有reply ceiling作保守模型上限，不能默默增加授權呼叫。
失敗claim及已預留呼叫皆不重置，release只清lease。呼叫預留可能因取消而多算，絕不因不確定而少算。

## 唯一新migration／回復

`20261128073000_brand_ai_p0_diagnostics`：在既有BrandAiReplyLog新增`repairStartedAt timestamptz(3)`及`diagnostics jsonb`，一個repair日期索引、先有首次才能修正／診斷大小兩個約束。沒有新表、角色、函式、RLS或營運權限。
本機使用實際SQL、PG17.6、既有NOSUPERUSER/NOBYPASSRLS最小角色及兩個Prisma連線；最終16檔295項相關回歸、TypeScript（6144MiB heap）與ESLint通過，另有40題離線檢索契約通過。這些都不是實際模型品質結果。
正式尚未安裝。**新Prisma client會讀新欄位，必須先安裝此唯一migration並精確登記這一筆履歷，再部署；不跑其他歷史migration。**
履歷登記提案為`p0-register-history.proposed.sql`，只插入本次checksum ab64f860fd99f3e7391118031a6e3400a9d2fcd4fcea0628d659fc585b9a4b0d，保護既有161筆履歷。此提案尚未遠端執行；真正安裝前須重新驗證完整schema／約束／ACL／checksum及履歷基線。
前檢新增p0Ready，核對兩欄同時存在、型別、索引、既有RLS／DML及成本查詢；單欄殘留視為不完整schema。
回復提案：`scripts/sql/brand-line-ai/p0-rollback.proposed.sql`。僅在未登記履歷、無修正／診斷活動且已切回相容停用版時移除本次物件；有履歷或活動即拒絕DDL回復，保留帳本並使用P0停用版。
產生修正活動後不得重新啟用舊V2版，因舊版不知道修正費用；緊急可用舊停用版，但不能以它重新測試。

## 40題品質評估與費用

資料集：`scripts/qa/brand-ai-quality/cases.json`。包含原五輪（手機）、35題自然改寫／前文／四產業／安全問題（API）。前文fixture是已核准的合成結構，不是真實聊天逐字稿。
離線檢索命令（不需Key、不外發）：

    node --conditions=react-server --import tsx scripts/qa/brand-ai-quality/evaluate.ts

預設只報檢索契約、realCalls=0、modelQuality=NOT_EVALUATED。
真實模式需另行授權、Restricted Key由安全環境注入、AI維持停用、固定gpt-6-luna、私有ledger及明確額度。不得從Vercel取出Sensitive Key，也不能假稱目前工作區已具備這個安全執行條件；執行前仍須核實，無法安全注入即停，不另開未授權通路。
API模式只跑35題，最多70次模型；保留原5題給手機，最多10次模型／5筆LINE回覆。**整批最多80次模型、5筆LINE AI回覆。**
本機已完成的真實模式程式只供後續授權使用，這輪沒有執行。

評估器使用私有checkpoint／單程序lock，發送前寫入預留，無reset選項；異常檔案或舊lock不能自動清空重跑，需人工核對已預留次數。每日日誌保留、每天20含當日已由正式服務使用的次數（以唯讀前檢提供daily-used）。
headless評估期間正式AI始終停用。完成35題後，手機5題安排在下一個台灣日曆日，避免兩套執行來源在同日重疊超過20次。實際須跨日分批，不為一次跑完調高每日限制。
真實結果僅寫repo外、0600私有檔；stdout只列計數／代碼，不公開合成模型回答；真實顧客對話不輸入評估器。

官方價格（2026/11/28唯讀核對）：https://developers.openai.com/api/docs/models/gpt-6-luna ，每100萬input US$0.10／output US$0.50，未計快取折扣。
40題合計最多640000輸入tokens＋20480輸出tokens（每題兩次共用原預算），估算US$0.07424；建議模型費用批准上限US$0.10作餘裕（不含既有Vercel必要建置費，該項未估帳單），非實際帳單、不把budget alert稱為硬阻擋。模型名稱／費率改變須重新核對。
若供應商套用官方列出的cache write費率（每百萬US$0.125），以全部輸入計入的極保守估算為US$0.09024，仍以US$0.10作費用批准餘裕，帳單另核對。
單次API模式的最大授權是70，不是80；手機另外最多10、5回覆。未知用量／中斷仍占呼叫預留。

人工評分必須逐題檢視：當下問題、事實／交易條件、前文、必要追問、案例類型、無不實服務承諾、安全與隱私。
字數>150或多問句先標review，不直接判不安全；價格／網址／個資／未授權操作錯誤零容忍。generated/repaired/fallback分別統計，不能用fallback掩蓋模型失敗。
不能把離線檢索、fake Responses、PG回歸、CI或部署成功當成真實模型品質通過。

## 本輪已授權順序：品質先於正式發布

使用者已批准460bfa4e9整批執行，並要求先完成API品質門檻。本節取代前版「先部署停用版再API評估」順序。

1. 推送／建立PR／CI；依本輪要求補修評估checkpoint判定，尚未發生任何真實API評估。
2. 先核實既有安全Key注入與可保存私有checkpoint的執行環境。正式AI全程停用，不能為評估先發Production、不取出Sensitive Key、不新增付費服務。安全注入無法成立即停止。
3. 35題API最多70calls、每日20／並行1，checkpoint不重置；35題全部完成並審閱、至少34題自然模型品質通過，三個原始核心失敗問題全部通過，所有高風險錯誤零容忍。generated/repaired分別統計，knowledge_fallback/uncertain不能算自然品質通過。安全拒絕也是有效模型回答，但錯誤實際操作／承諾絕不通過。
4. API品質通過後，才安裝唯一migration與履歷、合併及集中正式部署；不得以本機／fake／檢索結果放行。保留同SHA P0停用版，完成後還原不用重建。
5. 原本人白名單最多10模型／5回覆，整批API＋手機不超過80calls、模型費用預算US$0.10；每日20不調高。headless與手機不並行，手機安排在下一台灣日，避免跨執行來源同日超額。
6. 任何成功／失敗／中斷均維持或恢復AI0、核對帳本與清除；出現高風險錯誤立即停止，不自動繼續發布或隔天重試。

### 續跑判定補修

開題前保留至少兩個可用呼叫名額及距離台灣日界15秒的排程餘裕；未使用的第二個名額不實際扣除。額度不足只延後未開題，不製造完成結果。
每筆發送前仍先記入checkpoint；修正被拒絕則標INCOMPLETE，不能把知識補救當完成評估。程序中斷後有已扣呼叫卻沒有結果的題目必須停止核對，不重複第一次、不退款或重置；這是故障處理，不是正常跨日延後。
checkpoint使用私有檔原子rename與單程序lock。正常跨日續跑只處理從未呼叫的題目；發生不明／部分呼叫的題目不自動重跑。
品質gate可用`--gate --ledger <private-path>`唯讀檢查，不呼叫模型；待審閱、未完成、核心未過或高風險錯誤均拒絕發布。
自動跨日排程只有在安全Key注入、checkpoint持續性及本輪停止狀態確認後才建立，未確認前不啟動會每天重試的任務。

新review支線已在本地Vercel設定排除，既有build/migration入口對此支線fail-closed。Cloudflare既有失敗獨立列管，不更改其正式設定。
