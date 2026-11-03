# 美業：建置修正與隔離測試站重驗

本輪已更新美業隔離 Preview，並透過真實瀏覽器、Next 伺服器與 `steamfoot-preview` 核對三端操作及帳務。沒有合併 main、建立 PR、修改正式站、執行遷移或變更資料庫角色。LINE 維持關閉，實體裝置及店家簽收尚未完成。

## 交付版本

- 分支：`preview/beauty-ui-alignment-20261021`。
- 最後部署程式：`39ea1d1d054d665f8966a428dc9ef860245c2ba9`；deployment `dpl_BnZbXVs5SXnDS41URwaUJzafcCUb`，**READY / Preview**。
- [店長後台](https://steamfoot-booking-6gmzyfzuq-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/admin/dashboard/beauty)。
- [顧客／技師登入](https://steamfoot-booking-6gmzyfzuq-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/)。技師登入後切「我的工作」。
- [公開體驗](https://steamfoot-booking-6gmzyfzuq-rock7652-2111s-projects.vercel.app/beauty-trial/beauty-hosted-20261021)：本輪只核對呈現，LINE 尚未申請完成，不宣稱真實 LINE 體驗通過。
- 保留原有 Vercel Deployment Protection，沒有改成公開網站；自動測試使用部署專屬分享存取，存取憑證不寫入本文件或儲存庫。
- 測試店固定為 `beauty-hosted-20261021`，資料庫固定為 `ttworfzgwejdeolegkxl`。建置保護驗證隔離資料庫、通知關閉，並跳過自動遷移；沒有拉取正式憑證。

## 排除的問題

| 問題 | 修正及驗證 |
|---|---|
| 行銷彈窗全域 CSS selector 不符合 CSS Modules 規則 | 改為含本地 `.dialog` 的 `:global(html):has(.dialog[open])`，只鎖定該彈窗；不調整行銷流程。 |
| Messenger route 匯出四個測試 reset 函式 | 將各自獨立的限流 Map 與 reset 移到內部模組，HTTP route 只保留支援的匯出；21項權限、跨店及限流測試通過。 |
| 庫存匯出路由 Request 選填、現金抽屜頁暴露自訂 prop | 匯出路由改為接收 Request，測試傳入真實 Request；現金抽屜入口僅接收 searchParams，自訂 prop 留在內部呈現函式；原權限與查詢不變。 |
| 改期成功後可立刻使用舊 revision 取消 | 真實連續操作曾被後端安全拒絕，沒有誤改資料；補上等待權威資料更新的操作鎖及重新載入入口。元件測試驗證等待期間不能取消，更新後送新 revision；同筆預約在 hosted 再次改期、立即取消成功。 |

主要來源：[portal](../../src/components/beauty/portal.tsx)、[測試](../../src/__tests__/beauty-booking-draft-ui.test.ts)、[行銷 CSS](../../src/components/marketing-sticky-offer.module.css)、[限流內部模組](../../src/server/services/messenger-audit-rate-limit.ts)、[庫存匯出](../../src/app/api/inventory/export/route.ts)、[現金抽屜頁](../../src/app/(dashboard)/dashboard/cash-drawer/page.tsx)。

## 實際驗到的流程

- **店長**：11個美業頁面可載入；所選班表日期帶入新增、取消關閉草稿提示、技師四分類、共用銀行設定面板、收退款明細、篩選、月結及分析。
- **顧客**：真實登入；兩人不同服務、必選性別、查共同時段；切頁保留姓名／備註／日期／時間；實際建立同筆兩分項預約；同行項目改期與部分取消；核帳後四碼驗證及真實申請。
- **技師**：真實登入及身分切換、週月班表、完成本人服務、切收入月份、讀取已確認月結及服務明細。
- **帳務**：測試抽屜以零元初始化；兩分項合併現金收款；取消分項退款；店長確認銀行核帳並發方案；確認月結、記錄技師付款，再從本人收入與唯讀帳本交叉核對。
- **畫面**：後台1366×900、iPad1024×768／768×1024；顧客及技師390與360寬度，公開體驗360。檢查無全頁水平溢出，已檢視主要實際截圖。這是桌面 Chromium 視窗尺寸驗證，不是實體手機／iPad。

廣泛逐頁核對在 `c95c9e0e` 完成；發現更新競態後於 `102518db` 重驗改期、取消、技師完成及核帳。最後 `39ea1d1d` 與 `102518db` 只有庫存測試呼叫不同，應用程式相同；最後版本又重驗三端登入、設定、草稿、月份、360畫面、退款、月結付款及本人收入。沒有把舊版本的通過結果當成新修正已驗證。

## 資料核對結果

以下均為假資料、測試帳務登錄，沒有對銀行或支付商執行轉帳／退款。

| 項目 | 瀏覽器操作與資料庫結果 |
|---|---|
| 同筆兩人預約 | 做臉分配女技師／空間A；按摩分配男技師／空間B。 |
| 改期與部分取消 | 原顧客保留10/29並完成；同行者改至10/31後取消，revision=3；原項未被取消。 |
| 合併收款／退款 | 正確記為1,000與1,500兩筆 SALE；取消項另記-1,500 REFUND；這組服務淨收款1,000。 |
| 拆帳 | 女技師做臉採實收50%，該服務確認應領500，已登錄500付款，歸在實際技師名下。 |
| 核帳方案 | 後四碼4652的測試申請為CONFIRMED；發放方案剩餘5次，綁定原顧客。 |
| 測試銀行 | 透過共用設定儲存「測試銀行（非真實帳號）」、代號000、全零假帳號；未填LINE欄位。 |

測試抽屜、假銀行資料、預約／退款／方案及月結紀錄保留在該隔離測試店供店家驗收，沒有刪除舊資料。取消不自動退款，本輪另外經店長退款操作核對。

## 驗證結果與限制

- 48個測試檔、410項通過：407項美業／共用／建置回歸，加3項庫存匯出 HTTP 測試；完整 `tsc --noEmit`、異動來源 ESLint 與 `git diff --check` 通過。
- 本機使用合成 localhost 連線，以預設 **Turbopack** 完整建置成功，包含TypeScript、233個靜態頁面及最佳化；最後候選版本的Vercel建置亦為READY。沒有跳過型別檢查來修正本機問題。
- 額外的 **webpack** 驗證仍在既有 `generated-prisma-runtime.ts` 的 createRequire loader 出現相容性失敗；未為此改動三模組共用 loader。實際部署採Turbopack，不能把webpack寫成已通過。
- 三端使用真實 actions 與資料庫，沒有替代伺服器回應；重點帳務另以限制該店／該預約組的唯讀 SQL 核對。
- 腳本曾因下拉標籤及日期顯示定位錯誤停住，修正測試定位後只接續未完成部分；現金抽屜及銀行未設定的保護均確認有效，沒有繞過它們。唯一實際操作競態已修正並在 hosted 重驗。
- 共用技師收入面板目前呈現已確認應領及服務明細，付款／收回資料雖由後端本人範圍查詢，**不宣稱畫面已提供完整付款歷程展收**。未重新驗所有前輪跨月／低權限套餐；本輪範圍不能取代那些既有專項證據。
- 正式部署前後均為 `dpl_6Kcn8tzbMHG96oCwXZLHjKTy4xEH`、`abfe50b1092e9f78a1db76b575b255df5cf3524f`；本輪沒有正式操作。
- [分階段機器可讀證據](evidence/hosted-operation-recheck-20261021.json)保留已通過項目、曾停住的階段及後續重驗，不把部分成功偽裝成整段通過。

## 重要下一步

由店家在真實手機／iPad核對日常操作與服務規則，完成簽收；LINE申請完成後補真實登入、體驗資格及通知送達。正式啟用仍另外處理。本輪驗證不等於正式已啟用。
