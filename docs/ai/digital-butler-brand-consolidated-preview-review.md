# 品牌 AI 集中 Preview：待批准的最小範圍

**僅是授權草案，尚未取得本次執行授權。沒有開窗、建置、安裝權限或執行雲端寫入。**

承接開關、知識、Mock、人工接手／恢復與用量預算五個本機小任務。原 Draft PR #1596／feat/ai-digital-butler-core；程式以本輪最終提交為準。現有 Preview 的舊 runtime 無法驗證本輪修正，故若批准，需在原 steamfoot-booking 專案建立一次必要新版 Preview，不碰 Production。建置費無法精確估算；不為相同版本或延長窗口重建。

沿用[原操作審查](digital-butler-brand-operations-review.md)及既有 SQL，不增加產品功能、資料表、角色、專案或 PR。原審查中的歷史狀態不可視為目前遠端前檢，所有條件必須於開窗前重新唯讀確認。

## 僅限目標

- Supabase steamfoot-preview：`ttworfzgwejdeolegkxl`。
- 既有隔離角色 `steamfoot_ai_preview_20261125`；不得延長有效期、增加 membership／bypass／營運表權限。
- 固定合成品牌 `ai-preview-brand-steamfoot`、原合成 ADMIN `ai-preview-brand-hq`；不建立新帳號，不接觸顧客或正式營運資料。
- 原 Vercel 專案的指定支線及本次唯一新部署；其他 Preview、Development、Production、Webhook、Cloudflare 設定不變。

## 需一次批准的操作與上限

| 操作 | 最小範圍 |
| --- | --- |
| 時間／建置 | 開始 T0 至 T0+30 分鐘，**包含建置**；只建置一次，不自行延長或重建 |
| 臨時存取 | 僅新部署一條連結，ttl 不超過剩餘窗口；持有者在期限內可存取，需使用者接受此風險 |
| 登入 | 原合成 ADMIN 臨時密碼、原四條短效登入 RLS、最多一次成功登入及必要稽核更新；結束停用／密碼清空／session stamp 失效 |
| 稽核政策 | 原兩條限定 AuditLog SELECT／INSERT RLS 及原精確 13 欄 INSERT；固定 actor／品牌／NULL storeId／七操作白名單，期限內有效。與登入合計六條政策 |
| 稽核純函式 | 僅 `public.redact_audit_json(jsonb,integer)` 的 EXECUTE，依原 helper SQL；結束撤銷至前檢基線，不授予其他函式或改觸發器 |
| 支線窗口 | 僅兩個原變數 AI_BRAND_PREVIEW_WRITE_OPERATIONS=save,publish,withdraw,setting,handoff,resume,test、AI_BRAND_PREVIEW_WRITE_UNTIL=T0+30 分鐘；結束移除，其他環境不變 |
| HQ／開關 | 僅合成品牌核對 HIDDEN／LOCKED／ENABLED，最後 HIDDEN；僅必要期間 TEST 總停止 false、合成品牌 enabled=true，最後 true／false。四間門市全程關閉 |
| 知識 | 最多 12 次成功 save／publish／withdraw；審核唯讀，發布僅合成品牌，最後 published=NULL，保留草稿、修訂及歷史 |
| Mock | 最多 8 筆新增 Mock Request，包含任何重試的新筆；預計 6 筆主要情境，兩筆僅作必要餘裕，不強制用完。不重置／提高預算或日月次數，剩餘額度不足即停止 |
| 人工恢復 | 最多 4 次成功恢復；同命令重試只查重、不重複執行；接手限定相同合成對話並驗防重 |
| 成本與外發 | 真實 OpenAI=0、所有真實通路外發=0；雲端 Mock 成本應為 0，不製造假付費金額。正額／總預算邊界只引用本機證據，不冒充雲端花費驗收 |

六尺寸主要核對同一組實際狀態、清單、錯誤與主要操作可到達，不在每個尺寸重複完整資料異動，避免超過操作上限。

## 開窗前必須確認

目標 project ID、原角色與有效期、嚴格 TLS／連線、總停止 true、四店 off、品牌 HIDDEN／off／知識未發布、帳號已停用／密碼空、外發仍封鎖、既有預算及剩餘次數、短效政策／欄 ACL 基線、清理所需工具與連線可用。固定最終 SHA 與 CI 結果，確認不觸發 Production。

任何資料／權限與原提案不一致、無法證明清理管道、憑證過期或餘額不足，均不啟動窗口，不擴權、不換正式庫、不降低 TLS。需要本人操作時才提出具體阻擋；本草案不代表已完成新的遠端前檢。

## 四條登入 RLS 的精確邊界

沿用本機 fixture 的四個名稱：`ai_brand_qa_user_read`、`ai_brand_qa_login_read`、`ai_brand_qa_login_insert`、`ai_brand_qa_login_touch`；目標 role 均只為 `steamfoot_ai_preview_20261125`，不增加任何 table grant。

- User：僅 SELECT，條件為 `id='ai-preview-brand-hq' AND role='ADMIN' AND email='ai-preview-brand-hq@example.invalid' AND CURRENT_TIMESTAMP < T_END`。
- StaffLoginRecord：SELECT、INSERT、UPDATE 各一條；條件為 `actorUserId='ai-preview-brand-hq' AND actorRoleSnapshot='ADMIN' AND storeId IS NULL AND outcome='SUCCESS' AND createdAt>=T_START AND createdAt<=T_END AND CURRENT_TIMESTAMP<T_END`。INSERT 使用 WITH CHECK，UPDATE 的 USING／WITH CHECK 均為相同條件。
- T_START／T_END 為批准後固定的 T0／T0+30 分鐘絕對時間，不接受 SQL 未替換 placeholder。最多一次成功登入與該筆必要 lastUsedAt 更新，不能藉此改其他紀錄。
- User 寫入只由隔離管理通道執行固定 ID 的啟用／隨機臨時 hash；結束固定該 ID 設 `status='SUSPENDED',passwordHash=NULL,updatedAt=CURRENT_TIMESTAMP`。不授 runtime User INSERT／UPDATE。
- 清理逐一 DROP 上述四政策，核對同名剩餘 0；原有政策保持原樣，登入紀錄保留。若名稱已存在或基線不同，不覆寫、不移除他人政策，停止待查。

## 精確 SQL 與回復

沿用原審查及其已列明的四條登入政策／帳號回復方式，不建立新版本的寬鬆政策。新增稽核能力僅使用：

- [兩條稽核 RLS／13 欄 INSERT](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-acl.proposed.sql)
- [純 JSON helper EXECUTE](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-helper-acl.proposed.sql)
- [撤銷稽核權限及兩條政策](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-acl-revoke.proposed.sql)
- [helper 撤銷](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-helper-revoke.proposed.sql)

`__QA_WINDOW_UNTIL__` 僅在本次批准後替換為絕對截止時間；所有 SQL 交易失敗須整筆回滾，不補裝無關依賴。

成功、失敗、中斷或到期均先恢復總停止 true、品牌 off／HIDDEN／未發布、四店維持 off。停用 ADMIN、清空密碼、更新 stamp、移除四條登入政策；用舊 cookies 實測品牌 API 拒絕及 session 無使用者。撤銷通行連結並核對剩餘 0／新 cookies 受保護；移除另外兩條稽核政策與新增 13 欄 INSERT、helper EXECUTE、兩個支線窗口環境變數及私有 cookies／暫存。保留帳本、對話與稽核，不重置修訂；若發生不明內容衝突只停用撤回，不覆寫資料。

本草案需要使用者另行明確批准後才可執行；不授權正式部署、真實 API、通路外發、營運寫入、預約或六大通路擴充。Cloudflare 及舊課程測試問題仍獨立列管。
