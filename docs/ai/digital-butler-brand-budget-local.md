# 品牌獨立用量與預算：最小本機驗收

原 Draft PR #1596，基準 `41407376a`（CI 已成功）。本輪只驗證現有用量與預算核心，**本機通過、雲端待驗**；沒有修改產品程式、schema、介面或預算規格，不開發商業定價／訂閱。

## 實際功能結果

| 驗收 | 本機結果 |
| --- | --- |
| 空帳本及狀態計數 | 空帳本為 0、無提醒；COMPLETE／UNKNOWN／SUPPRESSED 都保守計入次數與保留金額，token、錯誤與轉人工分開統計 |
| 成本提醒 | 499999／500000、799999／800000、999999／1000000 micros 的 50／80／100% 門檻逐一正確；未調整原 1000000 micros 上限 |
| 品牌及門市隔離 | 四店合成成本及 RLS 看不到的另一品牌成本不混入本品牌用量；私有全域聚合仍涵蓋兩種 owner，不能因 RLS 低估總成本 |
| 月預算與總預算 | 品牌剩餘 100 micros 時只允許剛好 100，額外 1 拒絕；其他 owner 耗盡全域 20000000 micros 時，本品牌也拒絕，其他帳本不變 |
| 原次數上限 | 原日 20／月 100 筆用完後拒絕下一筆；不提高、不重置限額 |
| 台北日／月邊界 | UTC 16:00 對應台北午夜，切換日／月桶正確；新月品牌用量只計新月，但歷史資料保留，全域保守總帳不清零 |
| 並行／重送 | 兩筆爭用最後預算僅一筆成功；既有事件重播不增加帳本或金額，額度滿後仍可查重 |
| 結算及未知 | 合成預留 100、結算 60，只釋放未用 40；重複結算不再異動。UNKNOWN 保留原 100 並計錯誤，不重試或重複計費 |
| 失敗／停止 | 缺私有聚合 EXECUTE 時拒絕且不寫入；真實 PG append 故障完整回滾。總停止或品牌關閉皆不消耗額度 |
| 實際 Mock | 真實管理核心 Mock 產生 1 筆接受事件、成本 0，可信 ADMIN／成功登入 link／NULL storeId 稽核正確；同事件重送不新增紀錄 |

正額資料全部是**合成帳本／repository 預留機制測試**，沒有 Provider 網路請求，也沒有偽稱 Mock 產生費用。真正管理流程 Mock 仍是零成本，其固定 token 為合成值；不代表真實 API 帳單或已完成實際付費驗收。

[逐情境用量與聚合結果](../../artifacts/ai-digital-butler/brand-budget/local-workflow.json) · [本機檢查紀錄](../../artifacts/ai-digital-butler/brand-budget/local-checks.json)

## 依賴與驗證方式

沿用前四個小任務的 PGlite fixture、原 SQL、最小角色／RLS、私有成本聚合與 AuditLog 雙真實觸發器。對照既有唯讀快照，基礎 83 欄、知識欄／約束／政策及函式 body 仍匹配；沒有本輪遠端 catalog 查詢或權限修改。

使用現有 AiOwnerRepository(BRAND) 的 reserve／settle／unknown／usage，以及 brandManagement 的 Mock 及 snapshot。每個情境只在新建記憶體資料庫重置合成案例；不是清除遠端帳本或回復正式額度。原品牌預算／日月限額及四店設定全程不變。

```sh
npx vitest run src/__tests__/ai-digital-butler-brand-budget-workflow.test.ts
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
```

TypeScript、變更檔 ESLint 及既有品牌管理／共用核心／雙服務回歸通過。沒有修改 UI，沿用[既有 Mock 六尺寸操作](../../artifacts/ai-digital-butler/brand-mock/local-ui.json)作歷史呈現證據，未重複宣稱本輪重驗六尺寸。這次新增的證據是本機真實交易與權威統計，不是雲端 NextAuth／HTTP／Prisma／pooler 或多獨立 PG 連線競態驗收。

## 安全及下一階段

本輪無遠端 DB 連線／寫入／權限異動、Preview、通行連結、OpenAI 或真實外發；Production 不變。測試結束核對本機總停止 true、品牌 HIDDEN／關閉／知識未發布、四店仍關閉後銷毀引擎。未覆寫前四輪證據。

本機此最小範圍無阻礙；雲端仍待驗。原角色 helper EXECUTE 及已撤銷的短效權限未恢復，舊課程 EnvironmentTeardownError 與 Cloudflare 失敗仍獨立列管。

下一階段[集中 Preview 驗收授權草案](digital-butler-brand-consolidated-preview-review.md)僅作待批准提案；本輪不執行。PR 維持 Draft、不合併。
