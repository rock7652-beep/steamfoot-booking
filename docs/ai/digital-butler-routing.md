# 原流程 → AI → 真人：隔離 Mock 協調層

沿用 PR #1596、四合成店、TEST 與 plans.edit。這輪只增加同頁的路由演練，不接 LINE／Messenger Webhook、真實外發、客服工作台或業務寫入。原確定性引擎使用合成 repository 與明確的 TEST identity codec；正式呼叫保留原預設 repository、授權及加密。

路由順序：驗證 scope／權限 → 持久事件認領 → 真人旗標 → 明確真人指令 → 原流程引擎 → 僅 NO_MATCH 進入已發布知識 Mock AI。重送、身分不足、停用、等待輸入、欄位驗證失敗或其他原流程錯誤都不能當成未命中。AI 總停止時原流程 Mock 仍可驗，但不生成 AI 回覆。

AiButlerDispatch 私有表僅存 HMAC scope／event／合成情境 fingerprint、版本、狀態與 outcome，不存訊息或回覆本文。原流程 fixture 的狀態只存請求記憶體；不讀取／更動真實流程或建立名單。真人接手旗標仍以 AiButlerConversation 為唯一來源，新增 revision 作為操作世代。手動接手／恢復都增版，舊請求不可因先接手再恢復而重新取得回覆權。AI settle 也核對 reserve 時版本；回覆交付前協調層再次驗版本。尚未確認的事件不重新執行；卡住的同世代事件阻擋後續事件，操作員接手／恢復會另起世代，不釋放未知 API 預留。

新表 RLS 限既有角色與四個 fixture stores，anon／authenticated 無權限；既有對話表只加版本欄，沒有增加商業表寫入。手動 DDL 只可安裝到 ttworfzgwejdeolegkxl，不進自動 Production migration。

介面沿用 SettingsListRow：收合時顯示真人狀態與總停止；展開後選固定合成情境、執行、重送上一事件、模擬接手／恢復。只使用 Mock，沒有 OpenAI 選擇器，也不讀取 OpenAI Key。送出結果未確認沿用原 eventId，不自動換事件重試。情境與結果隨尺寸變化保留，錯誤就地顯示。

驗證原流程命中零模型、進行中不被搶答、未命中答已發布來源、未知轉真人、接手後原流程／AI皆沉默、明確恢復、相同事件改情境不執行、競態／重送／跨店隔離／HQ與角色拒絕及 RWD。只驗合成 RuntimeRepository，不能當作真實通路授權／OA 身分或原流程資料庫整合已通過。這些正式通路適配仍需獨立驗證。
