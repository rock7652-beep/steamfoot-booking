# 單次服務作廢恢復待服務：本機交付

分支：`fix/shared-single-service-void-restore-20261118`。基底：`c92fa0bcc3482bdca7b00418244d48c3c06bb881`（PR #1586 已發布的體驗還原修正）。本次已獲使用者允許：只設定此分支不自動部署，push 並建立草稿 PR 跑 CI；未授權合併、部署或正式資料修改。

## 最新決策與範圍

使用者確認只保留「作廢收款並恢復待服務」，並同意補齊單次服務。沿用原權限、店家範圍、金額核對與原交易審計，不新增兩種服務處理選項。

- 蒸足：wallet-free SINGLE_PURCHASE 與 TRIAL_PURCHASE 共用還原服務；同一資料庫交易內先作廢再還原。鎖定預約後才鎖顧客及收款，並重新驗證預約摘要。個人收款只解除其本人關聯，整組舊單只在無同行拆分、無其他有效收款、無方案／補課關聯時恢復待服務。
- 美業：無方案綁定的單次與體驗收款，沿用既有 transition 恢復 RESERVED 並沖銷原日期收款。已取消預約維持取消。方案服務加做收款、共同商品與已使用方案維持原核對流程，避免誤撤銷整體權益。
- 運動／音樂：沿用 #1586 的體驗收款還原；一般方案購買涉及卡片與堂數，維持既有未使用方案作廢檢查。本次未將方案購買視為單次現場收款。
- 指南：更新後台 E06 的服務誤收款操作與例外，不新增前台教學。

## 本機證據

2026-11-19 Asia/Taipei，Node 24，本工作樹自己的依賴。

11 個測試檔、168 項測試通過：booking-participant-payment-postgres、transaction-store-consistency-actions、beauty-transaction-correction、beauty-trial-void-entry、course-trial-void-restore、course-purchase-correction、course-purchase-correction-action、beauty-roster-attendance、beauty-production-revenue-integration、beauty-revenue-breakdown、beauty-revenue-report。最終加入 wallet-free SQL 防線與 E06 指南後，重跑上述 11 檔及 operation-guide-catalog，共 12 檔、186 項通過。

TypeScript `tsc --noEmit --incremental false` 通過；修改原始碼 ESLint 通過；合成 fixture 的未使用參數警告已移除並通過最終 ESLint。

以 `scripts/qa/build-shared-service-void-fixture.mjs` 建置 `/tmp/shared-service-void-ui`，僅本機 127.0.0.1:8766。真實 React 元件、合成 server actions，無資料庫或實際收款操作。透過 Chrome CUA 驗證：

- 蒸足及美業桌機 1366×900、iPad 模擬 1024×768／768×1024，確認視窗文字與單一主操作可見。
- 590×800 蒸足窄面板可操作，原因縮放後保留，Tab 可由原因移至返回。
- 合成美業送出後顯示收款已作廢；蒸足重新讀取後顯示已作廢，移除作廢按鈕。這不代表真實資料庫業務驗收。
- 僅視覺檢查未見水平溢出；未取得 DOM 尺寸量測，未驗真機、正式登入流程或 hosted Preview。截圖已在工具回傳檢視，因檔案寫入權限未保存獨立圖片，不宣稱有截圖附件。

適用操作情境 04／05／07／08（交易一致性、確認面板、更新與 RWD）；店家／權限隔離由 server tests 覆蓋。搜尋、設定、全站效能與通知發送不是本次變更。

## 待交付與授權

使用者於 2026-11-19 回覆「允許」，授權本次新分支不自動部署設定與 push／草稿 PR（跑 CI）。`vercel.json` 僅新增本分支的 `git.deploymentEnabled=false`；不更動其他分支與正式通知設定。Hosted Preview、合併、正式部署及歷史資料修復不在本次授權內。PR 與最終 CI 狀態以 GitHub 的 commit／checks 為準。

## 隔離預覽準備（2026-11-19）

使用者要求「下一步」後，核對 #1587 仍為草稿且 CI 通過，head `393d7bed404f2d0b7510e16b0e1ecc5755c445a3` 無可沿用部署。新分支尚未納入既有預覽防線，已在本機補齊精確分支範圍；沿用固定測試專案、兩個資料庫連線隔離檢查、通知停發與不執行 migration 規則，不更動正式 main 判斷。

`sports-shared-card-preview-isolation.test.ts` 與 `teaching-preview-packaging.test.ts`：2 檔、43 項通過。涵蓋新分支正向案例及正式資料庫／環境／專案／通知設定錯誤時的拒絕。修改檔案 ESLint 及 diff check 通過。新增防線與本節仍為本機差異，尚未 push；舊 head 的 CI 不代表這些新差異已通過 CI。

下一階段為一次隔離 Preview 建置與測試庫（steamfoot-preview）服務操作驗收；舊 Preview 的 SHA 不符而無法沿用。可能產生 Vercel 建置／執行費用，無法精確估算。使用者已回覆「允許」，授權本次隔離 Preview、分支專用設定與測試庫操作驗收；正式資料與通知不變。合併及正式發布未獲授權。

## 首次預覽建置與打包修正

`c185e17cce60a60afc19d601d5c847e7463177e0` 的預覽 `dpl_98VQj4Uo7LudzaM5CQDRy9znveZi`：隔離測試庫、通知阻擋與 migration 跳過檢查通過，編譯通過，部署輸出時因 `_middleware` 254.96 MB 超過 250 MB 而失敗，未成為可用預覽。原因是新分支未加入既有 `teaching-preview-packaging` 範圍。修正只將本分支加入既有清理流程，沿用 PostgreSQL runtime 資產保留與精確預覽環境檢查；加入本分支正向與正式環境拒絕測試。需重跑預覽建置，已向使用者說明增加一次建置用量，仍限本次隔離預覽驗收。
