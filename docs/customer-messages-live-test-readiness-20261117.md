# 顧客訊息單人實測準備

## 已確認授權與對象

使用者先指定 staging 店「測試顧客 A」，後明確改為正式站「暖暖蒸足／黃彥陸」，僅一則測試訊息。正式目標不能沿用 staging 的電話或 LINE 身分。

2026-11-17 唯讀核對：

- 測試 Supabase 專案 steamfoot-preview 為 ACTIVE_HEALTHY；staging 店是示範店，測試顧客 A 未連結 LINE，唯一 identity link 為 phone，並非 LINE；新訊息資料表尚未安裝。
- 正式 Supabase 專案 steamfoot 為 ACTIVE_HEALTHY。暖暖蒸足 slug=zhubei、STEAMFOOT、ACTIVE、非示範店。
- 該店「黃彥陸」只有一筆未合併顧客，電話末四碼 6667；LINE 狀態 LINKED、店家 LINE subject 格式有效，另有一筆 LINE 身分連結。這些只是資料庫證據，不代表已驗證本人收訊或 API reachability。
- 正式 CustomerMessageBatch 表尚不存在；目前正式部署來源是 main 182f70bcf160c2f5d5cfcda8afe049370d8c143c，尚未包含本地新功能。
- 未寫入任何遠端資料、未發送 LINE、未修改綁定或環境設定，未自行解除停發。

## 不外發的整合驗證

新增 customer-message-delivery-integration.test.ts，執行真正的 server action、SQL outbox、worker、收件人 resolver、quota reader 與 LINE transport。資料庫使用記憶體 PGlite，少量 ORM 轉接替身；登入、權限與功能設定為測試替身。所有 HTTP 請求均被攔截，僅接受假 token 與合成收件人，絕不使用正式憑證。

9 項測試通過：

1. 預覽、確認、背景處理、LINE 請求與紀錄串接；wire payload 與確認前的資料庫快照一致，只傳給選定人。
2. 未到排程時間不發送，到期才處理。
3. 取消後不送出。
4. 模擬 LINE 接受後網路回應遺失，以同一 payload／retry key 重試；409 接受證據只計一次。
5. 確認後顧客 LINE 身分改變即停止，不改送新身分或中央帳號。
6. 示範店與不符本店的官方帳號不發送。
7. 確認後停發或 Preview 隔離仍阻擋。
8. 撤權或方案用量耗盡不發送。
9. 未綁定顧客在確認前排除。

這不是已登入的正式站／Preview 業務驗收，也不是實際 LINE 送達證據。

## 正式單人測試的發布邊界

使用者於本次明確回覆「同義授權」（同意授權），核准發布新功能到正式站、套用新增資料表 migration，以及部署新增的每分鐘處理排程，並對暖暖蒸足／黃彥陸測試一則。此授權不包含解除既有通知停發。

待審 migration：prisma/migrations/20261117090000_customer_messages/migration.sql

SHA-256：ac2b4e6930b20137a467bdd9f2c93837e3686d2bd420e9a13e25d1b28379f185

此 migration 新增 CustomerMessageBatch／CustomerMessageRecipient，啟用 RLS，撤回 PUBLIC／anon／authenticated 直接存取，不回填或改寫既有顧客、預約、交易與通知。正式站更新後，符合既有權限及 LINE 功能開通條件的門市可看到新入口，不是只替此一顧客啟用的私有測試。

既有 Preview 全面封鎖外發，沒有可直接套用到這個新功能的單人外發例外。正式環境的停發狀態也須在實際執行前確認；若仍停發，停止依賴發送的部分，不以測試為理由自動開啟全站通知。不得用直接呼叫 LINE、借其他店帳號、偽造綁定或改成非示範店繞過現有保護。

## 經發布授權後的單人操作範圍

1. 核對實際部署來源 SHA、migration checksum、一般登入的店家／角色及 LINE 發送狀態。
2. 從暖暖蒸足的顧客訊息入口，只勾選唯一的「黃彥陸」，再次核對末四碼 6667，不用 staging 電話查找，不用全部符合。
3. 文字使用「【蒸管家測試】這是一則顧客訊息功能測試，請忽略。」；立即發送，預覽只允許一位收件人。
4. 確認一次，記錄 batch 與 LINE 接受結果；結果不明只核對同一批，不建立第二批補送。
5. 請本人確認實際收到內容；本人確認前只記為 LINE 已接受，不宣稱送達。核對只有這一位測試顧客的紀錄，沒有變動預約、金額或其他顧客。

2026-11-17：隔離測試資料庫已透過原始 SQL checksum 核對及單一交易安裝，含 Prisma ledger；正式發布、正式 migration 與實際發送尚待執行。安裝使用 scripts/customer-messages-migration-bundle.mjs，只接受尚未安裝且無未解決 migration 的狀態，不提供重跑或通用 migrate deploy。
