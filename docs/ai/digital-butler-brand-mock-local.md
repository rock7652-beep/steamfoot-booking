# 品牌 AI Mock：本機單一任務驗證

原 Draft PR #1596，基準 `b2c890423`。**Mock 本機驗證通過、雲端待驗**。沿用既有 Brand 管理核心、共用 AI Service、MockAiProvider、owner repository、發布知識投影、事件識別、預算與稽核；沒有改動產品程式、資料庫安裝 SQL、共用工作台或新增第二套回答流程。

## 先核對基準 CI

[45891598463](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45891598463) 已結束：TypeScript、ESLint、針對性測試及三項隔離資料庫檢查通過。全量 assertions 全部通過，但有一個未處理的環境關閉錯誤：

```text
EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending
This error originated in "src/__tests__/course-reminder-preference.test.ts"
```

因此此 CI 結論為 **failure**，不能寫成全綠。錯誤來源指向既有課程測試檔，並非本輪品牌案例失敗；依本輪限制不修改課程模組、通用錯誤記錄器或 CI 配置，不以忽略未處理錯誤放行。[精確 CI 摘要](../../artifacts/ai-digital-butler/brand-mock/ci-b2c890423.json)。Cloudflare Workers Builds 仍為另一個獨立失敗項目，未修改正式設定。

## 實際本機功能結果

| 驗收要求 | 實際結果 |
| --- | --- |
| 讀取品牌已發布知識 | 真實管理核心從本機 DB 讀 published；回答與來源 ID 對應同一品牌／發布版本，內容為合成 NT$999 |
| 未發布／撤回／舊版 | 未發布與撤回皆轉人工且來源空，不呼叫 Mock selector；新草稿不改現有發布內容，重新發布後回答新內容及新 source ID；選取期間撤回或再發布時，舊回覆不交付，轉人工 |
| 未知問題 | 回覆人工協助、Conversation handoff=true/revision+1；重載仍維持，下一筆問題不新增帳本、不呼叫 Mock selector；本輪沒有測操作員恢復或真實人工通路 |
| 同事件重送 | 相同事件、變更問題文字後重送、並行兩份事件均只保留一筆 Request／一筆接受事件 AuditLog，Mock selector 只一次；重送 outcome=DUPLICATE、無回覆文字或來源 |
| 品牌／門市隔離 | 四店設定／知識／Request／Dispatch 及另一品牌知識 sentinel 逐列不變；拒絕 Store／serviceId 覆寫與 provider=openai；不引用 Store／SYSTEM 資料 |
| 開關及緊急停止 | 品牌關閉、TEST 總停止、Framework 停用、HQ HIDDEN／LOCKED、過期窗口皆拒絕且無新帳本／稽核；回覆等待期間停止或關閉，帳本 SUPPRESSED，不交付回答、不新增對話 |
| 用量／預算／稽核 | 成功 Mock 1 次＝Request 1、合成 token 100/20、held/estimated 0；可信 ADMIN／成功登入 link／NULL storeId 正確；8 筆上限拒絕第 9 筆、仍允許既有事件重送，沒有調高／重置額度。全域聚合仍包含四店既有合成成本 4936 micros，品牌獨立用量為 0 成本 |
| 錯誤及回滾 | 預留時 AuditLog 故障：Request／AuditLog 整組回滾，selector 不執行。結算時稽核故障：COMPLETE／token／對話更新回滾，再保留原預留為 UNKNOWN 並轉人工。selector 拋錯亦只有一筆 UNKNOWN、不重試。不能把已提交的預留宣稱全事件刪除 |
| 不外呼／不外發 | 管理核心只建 MockAiProvider、嚴格拒絕 openai；fetch 拒絕式 stub 與瀏覽器外部請求封鎖，實際網路呼叫、真實 OpenAI 及真實訊息外發均 0 |

[PG/RLS/真實觸發器操作與帳本](../../artifacts/ai-digital-butler/brand-mock/local-workflow.json) · [本機 UI 報告](../../artifacts/ai-digital-butler/brand-mock/local-ui.json)

## 沿用最小權限環境

重用前兩小任務 fixture，以原已安裝 SQL 建立 8 張品牌表及全域成本聚合，原最小角色為非 super／非 bypass，套用原 RLS、表／欄 ACL、真實 AuditLog 雙觸發器及相同函式 body。知識 12 欄／10 約束／4 RLS 與基礎 83 欄的相同來源快照繼續比對；新增原 preview-routing.sql 的 Store Dispatch，只放合成 sentinel，不複製顧客資料。

fixture 新增單獨 `test` 模式；應用查詢橋接只允許讀取、限定稽核 INSERT、Brand Request／Conversation 的 INSERT／UPDATE。不允許開關、知識、HQ grant 或 Store 業務寫入。測試初始化與競態注入由本機 harness 控制，不代表應用取得那些能力；遠端權限完全未改。

原短效登入／稽核政策、13 欄 INSERT 與 redactor EXECUTE 僅在本機模型存在，稽核操作白名單僅 test。不是移除 RLS、略過觸發器或用固定成功 SQL 回覆。

## 共用介面操作

在既有 BrandAiWorkspace → 品牌知識 → 測試已發布知識操作，沒有新增入口或修改 UI。六尺寸 `1920×1080`、`1366×900`、`1024×768`、`768×1024`、`390×844`、`360×800` 均完成實際 Mock 回答、正確用量及重載；無水平溢出、測試按鈕至少 44px，沒有 OpenAI 選項。沿用 UI／Settings Framework 與 HQ 三態，為 Chromium 尺寸模擬，不是實體裝置。

另刻意在 DB 提交後遺失回覆：UI 保留原 event ID 與問題重試，後端回 DUPLICATE；畫面提示已處理、Request 不增加。未知問題在 UI 轉人工且重載不恢復 AI；總停止時測試按鈕停用。

本機 UI 累計 8 筆 Request，全部 Mock／零成本；這是獨立本機 fixture，與單元情境及遠端帳本不合併計數。[六尺寸截圖](../../artifacts/ai-digital-butler/brand-mock/)。

## 重現、限制與安全

```sh
npx vitest run src/__tests__/ai-digital-butler-brand-mock-workflow.test.ts
node scripts/qa/ai-brand-mock-ui.mjs
npx vitest run src/__tests__/ai-digital-butler-brand*.test.ts
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
```

TypeScript、變更檔 ESLint、品牌操作回歸及既有共用核心／雙服務／知識／Routing／handoff 回歸結果見[檢查紀錄](../../artifacts/ai-digital-butler/brand-mock/local-checks.json)。原測試與已完成成果保留；不以總測試數代替本表功能驗收。

PGlite 執行真正 PostgreSQL 交易／RLS／觸發器；瀏覽器沿用既有本機 Next router／server action 受限橋接。未執行 NextAuth／HTTP／Prisma／Supabase pooler 雲端驗收，也不能由 Mock 結果推論真實模型準確性或人工通路已接通。Mock token 為固定合成值，不是真實 API 用量或帳單。

本輪沒有連線遠端資料庫、DDL／DML、遠端權限變更、新 Preview、通行連結、真實 API 或通路外發；Production／正式 Webhook 不變。測試啟用與發布只發生於記憶體本機資料庫；結束總停止 true、品牌 HIDDEN／停用／知識未發布、四店一直關閉後銷毀引擎。

目前本機八項要求未發現阻礙。雲端仍待驗，既知 redactor EXECUTE／已撤銷登入與稽核短效權限未改；未解決的全量 CI teardown 及 Cloudflare 獨立保留，不宣稱可正式上線。此本機階段不需新增授權；未來集中雲端驗收須另提必要部署、限定權限、測試窗口與回復範圍。本輪不開發人工操作流程、成本管理、真實 OpenAI／LINE、其他五通路或定價。
