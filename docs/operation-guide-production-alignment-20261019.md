# #1307 指南對齊正式版：12 題限定修訂

## 基準與範圍

- 正式版：`8d717d5dc45da6fbd4e2984afea48165140281b3`（#1364），Vercel `dpl_FpuXeEUGcMnisJFgDk3oJBsouuyD` READY，正式網域別名已由連接器核對。
- 指南原稿：`0cdfad49eb244c7daafdb570acb43f018d3f9e2b`，原 tree `a4eb7d77b67b76c82d22ce8e44b7f9983fc9ff37`。Git HTTP 代理不可用，使用 GitHub 連接器取得全部 50 個差異檔；本機重建 tree 與原稿完全相同後才修改。
- 同步正式 main 的既有程式，讓文章來源路徑及驗證使用目前正式核心；未修改業務程式、UI 元件、旗標、白名單、migration 或部署設定。
- 只修 A16、C103、C109、C123、C126、C171、C172、C173；只補 C102、C107、C110、C111 分流。未修改其他文章，未新增題目或改變 190 題／15 類。
- 這是限定題目對齊，不宣稱完成 #1355～#1364 全面指南盤點；`lastInventoriedMainCommit` 保留 `4f52264f`，另用 `scopedProductionAlignment` 記錄本次基準。

## 逐題差異與既有證據

證據只支持其原版本與原驗收範圍，不能等同本次指南已登入驗收。以下連結的版本固定於目前正式提交。

| 題號 | 本次修訂 | 沿用證據／來源 | 最小增量核對 |
|---|---|---|---|
| A16 | 未到／取消改由該位「⋯」選單，保留逐人收款及扣堂規則 | [#1358](https://github.com/rock7652-beep/steamfoot-booking/pull/1358)；正式 `booking-participant-checkout.tsx` | 搜尋未到／取消，核對入口文字；不送出操作 |
| C103 | 新版約 3 秒排程、舊版 60 秒；永久指定位置不預留課卡，出席核對有效方案 | [快速同步](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-fast-sync-20261019.md)、[main 整合](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-main-integration-20261019.md)；#1336 音樂規則保留 | 讀修訂段落，辨識永久系列與舊固定期課；不點名 |
| C109 | 有限批次與永久系列分開；更新同步及暫停條件 | 同上 #1355 整合與同步證據 | 搜尋永久系列，核對 C173 引用；不排課 |
| C123 | 新版運動先教練基本資料，再收費及授課資格 | [#1361 開店引導](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-onboarding-flow-20261019.md) | 與 C126 對照順序，保留音樂／舊課程分流 |
| C126 | 同步新版六步，第四步不等於已有完整授課資格 | 同上 #1361 的隔離空店 0/6→6/6 與資格不足回歸 | 只讀指南，不建立新店、教練或收費 |
| C171 | 原課表月週日入口、子店唯讀、永久系列回退限制及容量提示 | [#1360 入口](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-native-entry-20261019.md)、[#1359 正式化](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-formalization-20261019.md)、#1364 下列證據 | 不再用三分頁辨識啟用；不改旗標或權限 |
| C172 | 補教練前置、收費連結資格及缺資格修復 | 同上 #1361 | 搜尋教練／收費，核對先後及不回算舊卡 |
| C173 | 永久系列不填堂數、不預留課卡；單次課分流、候補零值、訂閱停用、超額系列隔離及停課範圍 | [#1362 訂閱](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-subscription-expansion-20261019.md)、[#1363 容量](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-permanent-capacity-20261019.md)、[#1364 正常／異常系列](https://github.com/rock7652-beep/steamfoot-booking/blob/8d717d5dc45da6fbd4e2984afea48165140281b3/docs/qa/sports-series-capacity-isolation-20261019.md) | 核對段落及搜尋詞，不建立系列、不取消或修改名單 |
| C102 | 單筆取消、當次釋出及後續停課分開 | #1355；正式 `sports-series-panel.tsx`、`sports-cancel-course.tsx` | 核對範圍說明與 C173 引用 |
| C107 | 舊課程範本與新版教學項目／收費分開 | #1355、#1361；正式 `member-workspace.tsx` | 核對 C172 引用，不覆寫舊範本規則 |
| C110 | 移本堂、當次停課與後續系列分開 | #1355、#1363～#1364；正式 `sports-series-panel.tsx` | 核對日期／範圍用語，不執行調課 |
| C111 | 原固定期課連結堂數不等於永久系列長度 | #1355、#1361；正式 `sports-permanent-series.ts` | 核對 C172／C173 引用，不發卡或收款 |

## 驗收沿用與限制

- [#1275](https://github.com/rock7652-beep/steamfoot-booking/pull/1275) 已有 26 題登入後搜尋、開啟、展開、返回與模擬尺寸證據。未變動指南外框、頂欄入口與返回機制，不重跑整套；既有通過不冒稱本次改文已驗收。
- [#1336](https://github.com/rock7652-beep/steamfoot-booking/pull/1336) 的音樂／運動交易驗收只支持既有業務規則；本次不重做購買、扣點、退款、付款或通知。
- #1361 是隔離本機真實 UI→action→PostgreSQL；#1360 入口 UI 是合成資料；#1362～#1364 是隔離本機驗收；快速同步是整合前受限 Preview 證據。均不升格為本次指南或正式真機驗收。
- 本次維持 67 題待驗與 I20 原有合格 OWNER 限制，不清除題目、不宣稱 67 個功能未完成。C169 與 #1329/#1320 均不變更。
- 最小登入後補驗只需這 12 題：在已確認隔離、通知封鎖的工作階段搜尋、展開、返回及核對角色可見性；桌機 1366px／寬螢幕、iPad 模擬 1024×768／768×1024。不得為此改白名單、建立授權或操作真實顧客。
- 本版自動化檢查結果見下節。沒有本版已登入隔離瀏覽器結果前，不新增已驗截圖、不把本機內容檢查當完整業務驗收。

歷史每日盤點保留原樣；涉及早期三分頁、15 秒與整批預留的舊敘述，請以本節限定 12 題修訂為準。


## 本次最小增量檢查結果

- 指南相關 35 檔／195 項通過，未跑完整 Vitest 或交易驗收套件。
- 12 題逐一檢查 ID／標題搜尋及無權限隱藏；C111 共卡 LOCKED 投影仍保留永久系列分流及原下架說明。
- TypeScript AST 對照確認恰為指定 12 題變更，其他文章內容不變。
- 變更的 4 個指南來源檔與 2 個既有測試檔 ESLint 通過；git diff whitespace 通過。全專案 TypeScript noEmit（6 GiB heap）通過。
- 初次檢查發現兩個舊字串斷言（「整批拒絕」、把「第四步」誤當「四步」）不適用新分流，已更新為本次建立拒絕與六步引導的核對；不刪除或跳過測試。
- 初次隔離守衛檢查受 Node 子程序 EPERM 及 Prisma client 尚未產生影響；允許測試子程序並只產生本機 client 後，同一組 35 檔完整通過。沒有連資料庫、執行 migration 或放寬守衛。
- 本環境沒有可呼叫的瀏覽器工具／已確認隔離登入工作階段；未完成本版桌機／iPad 的登入後搜尋、展開與返回補驗，未製作新截圖。既有 UI／業務證據按上表保留原範圍。
- 初次修訂完成時依不部署範圍保留本機提交；使用者後續已明確授權更新遠端 #1307 及建立隔離 Preview，接續 12 題登入後最小補驗。不合併或發布正式站，不改隔離資料庫、通知封鎖或 migration 守衛。
