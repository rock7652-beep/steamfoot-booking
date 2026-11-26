# 品牌人工接手與恢復：本機單一任務驗證

原 Draft PR #1596，基準 `59f9a2080`。**本機驗證通過、雲端待驗**。保留既有共用核心、管理工作台及三個已完成小任務，只修正品牌接手防重與操作稽核，沿用既有人工清單／恢復介面。

## 基準 CI 與獨立問題

[59f9a2080 CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45893026284) 的全量、針對性、TypeScript 與 ESLint 已通過，其他三項隔離資料庫檢查亦成功。[精確摘要](../../artifacts/ai-digital-butler/brand-handoff/ci-59f9a2080.json)。

先前 `b2c890423` 的課程測試 `EnvironmentTeardownError` 仍保留[原始獨立摘要](../../artifacts/ai-digital-butler/brand-mock/ci-b2c890423.json)；本輪沒有修改課程模組、通用 logger 或 CI，不能因這次成功就宣稱該問題已修復。Cloudflare Workers Builds 仍失敗，繼續獨立列管，未修改正式部署設定。

## 重現及最小修正

修正前本機真實 DB 測試確認兩項缺漏：重複接手使 revision 從 1 增至 2，且接手／恢復的通用 AuditLog 沒有對話前後狀態。

- 沿用 owner repository 的既有 handoff 交易，增加品牌明確選用的 onlyIfChanged；相同接手在同一控制列鎖內傳回原 revision，不再寫對話或新操作稽核。門市呼叫維持預設行為。
- 品牌稽核交易依接手／恢復的 scope 捕捉 handoff、revision 與 scopeKey 前後值，與狀態及不可變恢復帳本一起提交或回滾。不儲存顧客訊息；scopeKey 為既有 HMAC。
- 沿用既有恢復命令防重、live HQ／操作窗口核對、未完成事件防護及實際恢復清單。沒有 schema、ACL、正式路由或第二套介面變更。

## 實際本機結果

| 驗收要求 | 實際結果 |
| --- | --- |
| 未知問題進清單 | 真實 Mock 事件產生 handoff=true/revision1；同品牌待處理清單 1 筆、needsReview=false，重載仍存在 |
| 人工接手後靜默 | 自動未知轉人工及管理者手動接手後，後續問題 STOPPED，Request／用量／稽核不增加 |
| 同對話重複接手 | 再次與並行接手均保留同一對話／revision／一筆操作稽核；已自動轉人工再手動接手亦不增加紀錄 |
| 管理者恢復後再回答 | 清單確認恢復使 handoff=false、revision+1，新增一筆不可變 AiBrandHandoffAudit 及通用 AuditLog；後續新訊息才 ANSWER，不補送先前訊息 |
| 重複／過期／無權限 | 同一 commandId 重試回 duplicate=true，無再次執行；新命令帶舊 revision、錯誤 viewKey／scope、STAFF／OWNER／Store view、停用 ADMIN、過期窗口／授權、HIDDEN／LOCKED 全部拒絕，無部分寫入。授權後窗口於交易開始時過期亦回滾 |
| 舊恢復命令 | 已成功命令重播不能恢復後來新發生的 handoff，revision3 仍保持接手；需目前修訂的新命令 |
| 緊急停止／關閉 | 沿用「恢復對話不等於開啟 AI」：允許有權管理者結束接手，但總停止及品牌開關完全不變；後續問題仍停止／拒絕，不新增 Request，不繞過安全限制 |
| 操作稽核 | actor／ADMIN role／成功登入 link／NULL storeId／固定品牌正確；手動接手與恢復前後 conversation 狀態可核對。自動轉人工由接受事件 AuditLog → eventKey／Request → scopeKey／Conversation 串接 |
| 回滾及隔離 | 真實 PG AuditLog 故障使接手／恢復整組回滾；AiBrandHandoffAudit append 故障亦不留下恢復狀態或通用稽核。四店設定、知識、對話與另一品牌知識／對話 sentinel 逐列不變 |
| 未完成事件 | RESERVED／UNKNOWN Request 與 CLAIMED／UNKNOWN Dispatch 在同 scope 時 needsReview=true，不可恢復；無帳本或稽核部分異動 |

同命令「已處理」是明確拒絕再次執行的冪等結果，不是第二次成功恢復。新命令／舊修訂則直接衝突拒絕，沿用既有介面重試契約。

[真正交易／RLS／觸發器與操作稽核](../../artifacts/ai-digital-butler/brand-handoff/local-workflow.json)

## 六尺寸與實際操作

既有 BrandAiWorkspace → 狀態與用量／人工接手；沒有新增入口或改建工作台。尺寸 `1920×1080`、`1366×900`、`1024×768`、`768×1024`、`390×844`、`360×800` 均完成清單→準備恢復→取消→再次確認→恢復→重載→後續 Mock 新訊息回答。跨寬度確認狀態保留、無頁面橫向溢出，確認按鈕至少 44px。第一筆由未知問題轉入清單，其餘由既有「模擬真人接手」按鈕操作。

另刻意在恢復交易提交後遺失回覆：介面保留原命令，以「重試原恢復操作」查回 duplicate，恢復帳本沒有增加。總停止且品牌關閉時從清單恢復，只清除接手，兩個開關仍維持停止／關閉。

[六尺寸與操作報告](../../artifacts/ai-digital-butler/brand-handoff/local-ui.json) · [截圖](../../artifacts/ai-digital-butler/brand-handoff/)。這是 Chromium 尺寸模擬，非實體 iPad／手機；不含真實人工訊息收發。

## 一致依賴、重現與限制

沿用前兩階段唯讀快照與原安裝 SQL：本機 PGlite 的相同品牌表、知識欄／約束、RLS、原最小角色、原 AuditLog 雙觸發器及函式 body；以固定合成 ADMIN 及成功登入稽核建立可信 actor。登入／稽核短效政策、13 欄 INSERT 與純 JSON helper EXECUTE 只在本機模型，操作白名單限 handoff／resume／test。

應用橋接僅讀取、Brand Conversation／Request、不可變恢復帳本與限定 AuditLog 寫入；沒有取得 Store、HQ grant、知識或設定修改能力。合成初始化與故障／競態注入由本機 harness 控制。沒有本輪遠端 DB 連線或新 catalog 查詢；不假稱重新讀取了遠端最新結構。

```sh
npx vitest run src/__tests__/ai-digital-butler-brand-handoff-workflow.test.ts
node scripts/qa/ai-brand-handoff-ui.mjs
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
```

品牌管理／開關／知識／Mock、共用核心／雙服務／原人工流程回歸及 TypeScript／ESLint 結果見[檢查紀錄](../../artifacts/ai-digital-butler/brand-handoff/local-checks.json)。不以測試總數代替本表功能結果，原有證據不覆寫。

瀏覽器沿用受限的本機 Next router／server action 傳輸橋接，實際業務邏輯與 DB 交易皆為真實程式；不是雲端 NextAuth／HTTP／Prisma／pooler 驗收，也不是已串接真實人工客服。測試啟用只在記憶體本機 DB；結束核對總停止 true、品牌 HIDDEN／關閉／知識未發布，四店全程關閉，再銷毀引擎。

## 尚未解決與必要授權

本機本階段未發現其他接手／恢復阻礙。雲端待驗，已知 redactor EXECUTE 及撤銷的短效登入／稽核權限未變；Cloudflare 與先前課程測試 teardown 仍獨立保留。

本輪遠端寫入／權限修改、Preview、通行連結、真實 OpenAI、真實訊息外發均 0；Production／正式 Webhook 不變。未新增產品需求、真實人工通路、預約或其他五通路。

目前不需新增授權；若之後集中雲端驗收，另提一次必要部署、固定合成帳號／品牌、限定稽核及 helper 權限、短效操作窗口與回復 SQL。本輪不執行。原 PR 保持 Draft、不合併。
