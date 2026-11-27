# 品牌 AI 知識庫：本機單一任務驗證

原 Draft PR #1596；基準為已推送的 `385281324`。狀態：**本機驗證通過、雲端待驗**。保留既有 AI 核心、雙服務模式與工作台；本輪只處理品牌知識新增／編輯、草稿、審核發布、撤回、重載、稽核及隔離。未處理 Mock 回答、人工接手、成本操作或通路串接。

## 修正與沿用

沿用既有 Brand 知識 repository、管理核心、嚴格輸入驗證、版本鎖、審核憑證與同交易稽核。沒有新增 schema、入口或工作台。

實際重現已掛載編輯器收到較新權威版本後仍顯示舊內容、舊審核憑證使發布按鈕維持可用的問題。共用 AiKnowledgePanel 現在僅在品牌模式且沒有未存草稿時採用新版本；有未存草稿則保留並提示重新核對。審核憑證綁定已核對的 revision，過期或晚到的舊版回覆不能讓新版知識可發布。門市模式維持既有行為。

既有「審核」是對已儲存版本的來源核對與短效簽章，發布時再次驗證 actor／revision／內容／期限；不是新增多人簽核系統。審核本身唯讀，成功儲存／發布／撤回各有同交易 AuditLog。

## 實際本機結果

| 操作 | 結果 |
| --- | --- |
| 新增／編輯及草稿 | 共用實際 UI 新增 FAQ、編輯產品介紹、儲存；重載後與 DB 一致 |
| 審核／發布 | 未儲存不得審核；沒有目前版本憑證不得發布；發布內容與已儲存版本完全相同 |
| 再編輯 | 儲存新草稿不改舊已發布內容；舊版審核憑證拒絕，重新審核後才發布新版 |
| 撤回 | 已發布內容清空、草稿與修訂保留；重載後仍一致 |
| 權威資料更新 | 乾淨編輯器採用新版本；髒草稿保留、舊 revision 儲存拒絕；確認後重新載入對齊 DB |
| 競態／取消 | 舊版審核回覆晚到仍不能發布新版；取消發布及取消捨棄草稿均不造成寫入 |
| 稽核 | save／publish／withdraw 的 actor、ADMIN 角色、成功登入紀錄、storeId=NULL、前後 revision 正確；每次成功異動 revision 增一 |
| 失敗回滾 | 分別以真實 PostgreSQL AuditLog 故障觸發器使儲存／發布／撤回失敗；整筆知識、revision、發布版本及全部稽核均保持原樣 |
| 提交回覆遺失 | DB 已提交但傳輸回覆遺失時提示結果未確認；重新載入顯示已提交內容，沒有誤稱回滾 |
| 品牌／門市隔離 | 品牌禁止引用營運設定、SYSTEM／Store owner 覆寫；其他品牌 RLS UPDATE 為零列，四店知識及設定、另一合成品牌知識逐列未變 |

六尺寸 `1920×1080`、`1366×900`、`1024×768`、`768×1024`、`390×844`、`360×800` 均實際完成新增→儲存→重載→審核發布→編輯再發布→撤回→重載。沿用 Settings 導覽、44px 操作與窄容器排列，沒有頁面橫向溢出；這是 Chromium 視窗模擬，非實體裝置。

[完整報告及逐筆稽核](../../artifacts/ai-digital-butler/brand-knowledge/local-knowledge.json) · [六尺寸及三種失敗畫面](../../artifacts/ai-digital-butler/brand-knowledge/)

## 與實際隔離庫一致的依賴

只對 `steamfoot-preview / ttworfzgwejdeolegkxl` 做唯讀 catalog 核對。品牌／門市知識合計 12 欄、10 項約束、4 條 RLS 政策（各 6 欄／5 項約束，品牌 3 條及門市 1 條政策）及 ACL／RLS flags 已取新快照，兩張知識表沒有觸發器。重新比對基礎 83 欄、原角色、函式 body、AuditLog 兩個真實觸發器、原政策及表權限，均與前一小任務來源一致。

本機 PGlite PostgreSQL 引擎沿用原 SQL、原最小角色、RLS、約束及真實 `stamp_verified_audit_actor`／`music_retirement_write_guard`，不停用觸發器。使用合成登入 actor、原短效登入／稽核政策模型、13 欄 INSERT 與單一純 JSON helper EXECUTE；稽核操作白名單僅 save／publish／withdraw。所有此類補權限只在記憶體本機 fixture，沒有套到遠端。

原隔離角色本來對四間合成門市知識有 CRUD；本輪未虛構獨立 DB 憑證隔離。品牌隔離由固定 principal、封閉表 adapter、嚴格輸入、品牌 RLS 及 audit storeId=NULL 共同維持，並以門市／另一品牌 sentinel 比對驗證無污染。

[知識結構快照](../../artifacts/ai-digital-butler/brand-knowledge/readonly-knowledge-metadata.json) · [基礎結構／角色／觸發器比對](../../artifacts/ai-digital-butler/brand-knowledge/base-metadata-recheck.json) · [ACL／RLS 比對](../../artifacts/ai-digital-butler/brand-knowledge/base-permissions-recheck.json)

## 驗證方式與限制

```sh
npx vitest run src/__tests__/ai-digital-butler-brand-knowledge-workflow.test.ts
node scripts/qa/ai-brand-knowledge-ui.mjs
AI_LOCAL_REPORT_DIR=/tmp/brand-kb-toggle-regression node scripts/qa/ai-brand-toggle-ui.mjs
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
```

TypeScript、變更檔 ESLint、既有 AI／權限／導覽回歸通過；開關原有九種情境與六尺寸亦重驗通過，舊證據未覆寫。測試總數不代替以上功能結果。

瀏覽器執行真實共用工作台與既有 Brand 管理核心，所有業務查詢在實際本機 PostgreSQL 交易／RLS／觸發器執行。僅 Next router／server action 傳輸以限定動作橋接；不是固定成功回覆，也不是雲端 NextAuth／HTTP／Prisma／pooler 驗收。現有後端測試另核對審核憑證期限與授權拒絕。

## 安全與剩餘事項

本機全程總停止 true、品牌及四店關閉、Request 帳本零新增；結束品牌知識未發布，Store 與另一品牌資料不變。雲端唯讀前檢亦確認總停止 true、品牌 HIDDEN／停用／知識未發布、四店關閉。沒有遠端 DDL／DML、權限變更、Preview 建置、通行連結、測試登入、OpenAI、Mock 回答或真實外發；Production 與正式 Webhook 未變。

本機可驗範圍未發現其他知識操作阻礙。雲端仍待驗，既知 `redact_audit_json(jsonb,integer)` EXECUTE 缺失及已撤銷的登入／稽核短效權限仍未修改；不能把本機成功當作現有 Preview 可直接操作。

之後集中雲端驗證須另批准新版 Preview、必要的限定 helper／登入／稽核權限與短效窗口、合成品牌知識資料寫入及復原；屆時精確列出上限與回復 SQL，本輪不執行。六大通路盤查與 Cloudflare Workers Builds 失敗繼續獨立保留，不擴大修復範圍。PR 維持 Draft，不合併。
