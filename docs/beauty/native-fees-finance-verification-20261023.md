# 原版收費、顧客合併、報表與交易接回

> 最新狀態：已完成隔離站登入驗收與重疊時段修正；暫時連結已撤銷。見[2026-10-24最終驗收](native-hosted-acceptance-20261024.md)。下方未部署／待登入敘述為歷史紀錄。

本輪在既有 `preview/beauty-ui-alignment-20261021` 實作；重新 fetch 後的原版基準仍為 `origin/main 7cb8c261`。**未推送、未部署；隔離庫升級請求失敗，讀回確認尚未套用。** LINE 關閉，正式站與遠端既有資料保留。以下登入及寫入僅發生於固定的本機合成店。

## 實際共用與驗收

| 入口 | 直接使用的原版 | 真實接點及驗收 |
| --- | --- | --- |
| 收費方式／方案 | `CourseMemberWorkspace`、`CoursePlanDraftForm`、原 sports fee 表單 | `saveBeautyNativePlan` → 原 `persistBeautyCatalog`；原 Store 鎖、修訂及穩定回條。新增6次／5400，修改8次／6800／90天，關閉重開；共卡與購買範圍保留。既有多服務範圍、提醒及已發卡快照不改寫。 |
| 原既有方案可授課人員 | 同一原表單的教練欄位 | 維持原版至少一位；接真實服務／技師關係，需 staff及計酬權限。服務／資格版本及未來預約檢查與方案儲存在同一交易，失敗整筆回滾。 |
| 顧客合併 | 原 merge 預覽、確認與 `mergeCustomerIntoCustomer` | 核對本店身分、OWNER／ADMIN、更新權限；搬移服務、方案持有人／共卡成員、購買、健康、提醒去重。舊合併指向收斂、限制性停收保留；不刪原發送紀錄。實測先購買再合併，保留顧客可重開卡片，餘額、付款及帳本逐欄不變。 |
| 店營收／所屬店長報表 | 原 `RevenueReportClient`、原 Excel workbook builders | 讀取實際美業收退款，退款按發生日、購買申請另列。成交歸屬依凍結audit或明確更正；缺快照列未歸屬，不推測為操作人或現在顧客歸屬。獨立控制交易明細／個資／匯出權限與SELF_ONLY範圍。 |
| 資料匯出 | 原 `DataExportClient`、原 `/api/data-export` Excel控制器 | 顧客、預約／完成、購買／收退款、方案卡皆為本店真實資料；共卡只列一次，占用與可用分開。作廢保留獨立分頁，不當退款或再加營收。錯誤不以空表假裝成功；試算表文字公式保護及10,000筆上限保留。 |
| 營運交易 | 原 `CourseRevenue`、`CourseTransactionActions` | 原核帳／退款外，補更正與作廢。更正僅備註及歸屬；以追加修訂保留不可改寫的原收款。作廢只允許來源唯一、未預約、未使用、無退款且帳本／收支一致的方案；原會計日另留支出沖銷。服務收款須先取消後退款，不偽裝成方案作廢。 |
| 對帳 | 原對帳中心、run list及執行按鈕 | 原Store鎖內核對方案餘額、占用、服務扣次、收退款／收支及技師床位衝突；保留原進銷存及現金抽屜檢查。不讀蒸足或Course交易假冒美業。 |
| 人員與限制 | 原 `CourseStaffWorkspace`／`saveStaffConfirmed` | 補生日與緊急聯絡欄位接點測試、角色／權限保護；實際低權限登入與跨店直接呼叫拒絕後，兩店方案、卡片、付款、修訂及帳本指紋不變。 |

桌機1366×900、平板1024×768／768×1024為 Chromium模擬；不代表實體裝置或店家簽收。檢查中亦修正共用營收表格的中文逐字換行，維持原版表格、字級及區塊內水平捲動；美業報表名詞以所屬店長呈現。

本機瀏覽器：原方案9項、顧客合併12項、分析／匯出30項、交易8項、權限16項、對帳8項；資料庫不可變保護4項。數字是各腳本斷言，不是不同業務情境的加總。

## 對帳確實發現的差異

本機原種子卡 `native-schedule-card-20261023` 有5次餘額，建fixture時未建立期初GRANT；其4筆帳本均為預約保留。對帳正確顯示一筆餘額差異，沒有自動修帳或改餘額。其他四項服務檢查通過；本輪真實結帳、退款及作廢建立的方案卡帳本一致。這個結果不能寫成「全庫零差異」。

## 資料升級與建置邊界

- `beauty-native-transaction-candidate.sql` 僅新增 `BeautyTransactionRevision`，RLS、同店Store外鍵、既有backend角色SELECT／INSERT及不可更新／刪除保護；不放寬原收款、帳本及月結不可變trigger。已在本機套用，遠端未套用。本機保留早期原型的未使用欄位；最終source及候選升級不依賴它們，未為清理測試而刪資料。
- 原服務 `defaultRate` additive候選仍僅套用本機。遠端若要更新，必須先核對固定隔離庫及既有migration接點；不得重跑建庫腳本或改正式站。
- 完整Next production build直接執行Next，不執行package build中的migration。使用另設的嚴格本機build scope，固定loopback合成庫、既有app角色及LINE關閉；拒絕production／hosted混用。原development-only scope仍拒絕production。
- 首次建置有程式型別修正及記憶體失敗；停止本機dev並依序驗證後，完整編譯、TypeScript及240個靜態頁建置通過。保留Prisma來源追蹤警告，未略過型別檢查。

## 已確認業務範圍及剩餘發布驗收

使用者本輪明確選擇「維持已確認美業流程」：保留次數方案及逐人預約。運動點數方案、開放選課／候補、固定每週／隔週課列為**不適用差異**，不新增、不假存成次數，也不再將它們列為發布阻擋。共用原版操作及表單，服務、資格、費率、帳本與資源配置仍走美業核心。

目前須完成本版本單人／兩人／四人預約與方案帳本驗證，再核對隔離庫必要 additive migration、部署完整版本及登入後重驗。尚未更新測試站，不能以本機結果冒稱遠端完成。實體裝置、店家簽收及 LINE 申請後真實登入／綁定／送達仍待完成。

證據：[本輪本機畫面及結果](evidence/20261023-native-fees-finance/)。最終回歸 **136檔／1,167項通過，1檔／17項略過**；完整production build（含TypeScript及240靜態頁）通過，ESLint零錯誤（4項既有警告）。另以原登入表單登入本機production版，報表／匯出30項、交易及顧客作廢紀錄5項重驗通過；不以先前部署或舊測試站結果冒稱這個版本。

## 本輪續驗：已確認範圍、多人預約及升級狀態

- 使用者確認維持已核定美業次數方案及逐人預約。運動點數、開放選課／候補、固定週期課不適用；不再以這些模式阻擋美業驗收。
- 以原手機密碼表單實際登入本機合成會員，使用本機 production build 完成單人／兩人／四人預約，共 **26 項斷言通過**。每人同時開始、技師及床位不重複，服務／整理時間快照正確。共用8次方案預約只占用，完成服務及相同請求重送只扣一次，取消釋放其餘占用，最後帳本及餘額均為7，付款筆數不增加。
- 會員確認頁390×844及完成後768×1024畫面均已保留；這是瀏覽器模擬，非真機簽收。預備的新增技師／床位只在本機合成店，資格與資源由已授權管理核心寫入；方案透過原顧客工作台實際結帳。技師／結帳腳本曾因 Next 重新導覽後讀舊 response body 失敗；依權威庫確認已儲存，沒有重複結帳，也未把腳本失敗當作應用程式已修復。
- 隔離 Supabase `ttworfzgwejdeolegkxl` 依 Beauty Prisma 模型逐欄核對：僅缺 `BeautyService.defaultRate` 及 `BeautyTransactionRevision`。既有連線為 legacy；候選SQL補上明確 `isolated-preview-legacy` 模式，只允許既有 postgres連線，不新建角色、不授權瀏覽器。原 app role 模式保留；新增3項真實SQL測試驗證未指定模式拒絕、legacy無公開權限且不可改刪、scoped backend僅可讀及追加，連同預約表單測試 **2檔／11項通過**。
- `supabase_apply_migration` 兩次回報 **Invalid or expired requestState**。第一次後與第二次後皆以唯讀查詢核對，欄位／表仍未建立。未改用一般SQL工具繞過 migration 接點，未部署缺 schema 的版本。
- 遠端前後筆數：預約21、卡片3、付款19、帳本23，一致。LINE branch設定確認為0，正式站未操作；遠端登入及新版部署驗收仍待 migration 接點恢復。

本輪證據：[多人預約及帳本結果](evidence/20261023-party-scope/results.json)、[四人確認畫面](evidence/20261023-party-scope/confirm-4-390.png)、[平板畫面](evidence/20261023-party-scope/after-4-768.png)。

## 後續更新：隔離升級成功、完整 Preview READY

本節取代上方「尚未升級、未推送、未部署」的歷史狀態。2026-10-23重新核對MCP可達性及唯讀查詢皆正常，原請求狀態錯誤未再出現；將兩項必要加法升級分別送出，均成功並已讀回確認。不推定先前錯誤是Postgres故障。

| 項目 | 結果 |
| --- | --- |
| 隔離庫 | `ttworfzgwejdeolegkxl`，既有legacy連線、角色保留 |
| 服務預設計酬 | `20261023165610 beauty_service_default_rate_20261023` |
| 不可改寫交易修訂 | `20261023165631 beauty_native_transaction_revisions_20261023` |
| 保護 | RLS及不可改刪trigger存在，anon不可讀、authenticated不可新增；未建立公開policy |
| 升級前後筆數 | 預約21、卡片3、付款19、帳本23，一致；不冒稱逐欄雜湊比對 |
| 完整來源 | `e2b713f9d51fb83633c0b3986c7c39b1355dbb52`，既有隔離支線 |
| 部署 | `dpl_HWdX2HEvkHvwDGb2xnTSctQkJcN7`，READY／Preview，未指派正式網域 |
| 建置 | 編譯、TypeScript及240個靜態頁通過；保留原Prisma追蹤warning |
| LINE／正式站 | LINE關閉，正式站未操作 |

[新版店長後台](https://steamfoot-booking-b7700d6m3-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/admin/dashboard/beauty)；[新版顧客／技師入口](https://steamfoot-booking-b7700d6m3-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/)。

**新版遠端登入驗收尚未完成。** 普通HTTPS請求重新導向Vercel登入頁（最終200並非應用程式成功）。既有驗收存取資料只對應舊部署；沒有移植cookie、重建分享權限或關閉保護。已向使用者詢問是否明確允許本次暫時存取連結，回覆前不進行依賴該存取的操作。前輪自動審查曾因「新增可分享的存取權限」拒絕此動作；本輪沒有重試建立。

新版單人／兩人／四人、方案帳本、收退款及低權限／跨店限制仍待登入後實測，不沿用本機或舊部署結果冒稱通過。READY後查詢此部署error／fatal runtime logs未見紀錄，但存取保護阻擋了完整應用流程，這不能替代業務驗收。實體裝置與店家簽收仍待完成。

[部署與升級證據](evidence/20261023-native-hosted/deployment-and-upgrade.json)。
