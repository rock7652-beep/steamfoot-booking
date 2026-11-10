# 未完成課程提醒候選資格 — 2026-10-26

發布後唯讀巡查於 2026-10-26 04:45 UTC 發現 incomplete-service-reminders 的 course candidates failed，訊息為尚未開通運動或音樂模組。當次美業 BEAUTY_READ_PERF 查詢無新樣本；此錯誤與美業預約耗時沒有已證實因果關係。

候選原先只篩 COURSE、非 Demo、ACTIVE/TRIAL，然後對全部候選檢查 LINE_REMINDER。該檢查經 sportsNativePreview 進入正式開通資格檢查；任一尚未開通 business.music/business.fitness 的 COURSE 店可能讓 Promise.all 失敗，整批候選無法處理。

在 Store 候選階段加入與現行正式開通 guard 相同的 ENABLED 音樂／運動 entitlement 條件。既有提醒資格、店家範圍、時段、到課重查、事件 claim、重複發送保護均保留。不更改 guard、店家開通、通知設定、資料或 schema。不主動呼叫 cron 或發送 LINE。

驗證：10 檔 80 項相關離線測試通過，包含未開通店排除、已開通店保留，以及原有模組、提醒與重複 claim 測試。TypeScript、ESLint、差異檢查通過。實際排程恢復及 LINE 送達未以本機假資料測試取代，需分別依自然排程與原通知紀錄驗證。
