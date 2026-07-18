# LINE 受控重新綁定 PR-1：capture 設計

## 範圍與不變量

PR-1 只讓具有 `customer.identity.rebind` 權限的店長建立或取消十五分鐘的 capture request。它絕不更新 `Customer.lineUserId`、`CustomerIdentityLink`、`Account`、預約或提醒；實際 dry-run 與 guarded rebind 分別留給 PR-2、PR-3。

candidate 僅在既有綁定服務回傳 `already_bound_to_other_line` 後捕捉。一般輸入電話、跨店顧客、無有效 request、簽章失敗與手機不符都不會保存 candidate。

## 併發與期限

`LineRebindRequest_one_active_per_customer` 是 PostgreSQL partial unique index，限制每個 `storeId/customerId` 最多一筆 `PENDING_CAPTURE` 或 `CANDIDATE_CAPTURED`。建立 request 的 Serializable transaction 會先將到期 active request 標為 `EXPIRED`，再插入；unique violation 一律回覆既有有效申請，不能依賴不存在資料列的 row lock。

到期表示不可用，不表示立即物理刪除。建立/讀取受限資料時會處理到期狀態；取消（與未來 consume）會在同一 transaction 刪除 candidate 的密文整列。

## 加密與資料最小化

`LINE_REBIND_ENCRYPTION_KEY` 必須是 Base64/Base64URL 解碼後恰為 32 bytes 的獨立金鑰。每筆 candidate 使用 AES-256-GCM、隨機 12-byte IV、16-byte authentication tag。金鑰缺失或格式錯誤時 fail closed，絕不明文 fallback。

完整 LINE userId 不會進入 log、AuditLog、API response 或 UI。PR-1 僅可顯示 request 狀態、capture 時間、到期時間及 userId hash 前八碼；masked userId 留給 PR-2 的受限 dry-run 解密流程。

## 去重

`webhookEventId` 是正常的唯一鍵。僅在舊/不完整 payload 缺少它時，才使用 `SHA-256(destination + source.userId + timestamp + message.id)` fallback；其中任一欄位缺失就不建立 candidate。`deliveryContext.isRedelivery` 僅供日後觀測，不取代資料庫 unique constraint。

## 威脅模型

| 風險 | PR-1 控制 |
|---|---|
| 已知電話遭冒用 | 必須有同店、同顧客、同電話 hash 的短效店長 request。 |
| webhook 偽造 | 既有 destination 解析與 signature verification 在 capture 前完成。 |
| redelivery 重複捕捉 | webhook event key unique constraint；collision 視為冪等。 |
| 明文 userId 洩漏 | 僅保存 AES-GCM 密文；logger/API 不接受或輸出完整值。 |
| 金鑰錯誤 | 嚴格 32-byte 驗證，失敗不寫 candidate。 |
| 跨店誤操作 | Customer/request/candidate 的每次查詢均含 storeId。 |
| 同時建立多筆申請 | partial unique index 是最終防線；Serializable transaction 只是補強。 |
| 資料保留過久 | 到期立即失效；取消時整列刪除，逾期列於後續受限清理移除。 |

## 測試對照表

| 情境 | 驗證 | 期望 |
|---|---|---|
| 有效 32-byte key | AES-GCM encrypt/decrypt fixture | ciphertext 非明文、IV 12 bytes、tag 16 bytes。 |
| 缺少/錯誤 key | capture service | `encryption_unavailable`，零 DB write。 |
| 無 request／已取消／過期／電話 hash 不符 | capture service | 不建立 candidate。 |
| `already_bound_to_other_line` + 有效 request | webhook integration | 建立一筆 candidate、request 轉 `CANDIDATE_CAPTURED`。 |
| webhook redelivery | 同 webhookEventId 重送 | 僅一筆 candidate，結果冪等。 |
| 無 event id 的相容 payload | 完整 fallback 欄位 | 使用 hash key；任一缺失則不捕捉。 |
| 併發建立 | 兩個同店/顧客 create | 一筆成功、一筆 active-request conflict。 |
| 取消 | cancel transaction | candidate 密文整列與 iv/tag 一起刪除。 |
| 回歸 | webhook/Customer snapshot | 不寫 Customer、IdentityLink、Account、Booking、ReminderLog。 |
| 權限 | server action | 未具 `customer.identity.rebind` 權限拒絕。 |

## Migration 策略

目前 Prisma 6.19.2 實測不支援 schema `where` partial index syntax（P1012），因此 migration 內有一個手寫 partial unique index；schema 不重複宣告它。此 PR 不執行 production migration，也不建立任何 production request。
