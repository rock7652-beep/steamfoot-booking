# 四模組名單標籤／備註一致性：待 Preview 驗收

本輪只調整預約／上課名單的標籤與備註呈現。已建立隔離 Preview（最新結果見文末），未合併正式站、未修改任何店家設定或真實資料。

## 入口與資料對應

| 模組 | 入口／元件 | 標籤 | 平時／店內備註 | 本次備註 | 保留的模組資訊 |
| --- | --- | --- | --- | --- | --- |
| 蒸足 | 預約管理 → 當日預約；DayDetailPanel | customer.id 既有 CustomerLabels | customer.serviceNote，顯示「平時」 | booking.notes | 到店／完成人數、方案與堂數、實扣方案、收款、所屬店長 |
| SPA | spa-schedule → 當日預約紀錄；SpaBookingRoster | booking.customerId 既有 CustomerLabels | 既有同店 customer.serviceNote，只讀映射，須原有 customer.read | SpaBooking.notes | 時間、服務、人員、位置、狀態與原始收款／退款摘要 |
| 運動 | 課程 → 上課名單；SportsRosterReminders | booking.customerId | booking.serviceNote | booking.notes | 原 #1258 容器斷點、所屬店長折行、點數、課後剩餘、詳情與代理來源 |
| 音樂 | 課程 → 上課名單；RosterReminders | booking.customerId | booking.serviceNote | booking.notes | 期數、下期已繳、請假／曠課、各期日期、補課日期、付款歷史與原有權限 |

- 四模組共用 src/components/admin/roster-reminders.tsx 及 CSS module。
- 第一行為標籤摘要；第二行為本次及平時／店內備註，各來源分開截斷。
- 摘要維持 14px、兩行 20px＋4px 間隔；摘要、標籤與筆記入口有各自 44px 操作區。
- 完整備註可透過摘要開啟，保留換行與全部內容；空／唯讀／取消情況保留一致欄位空間。
- 蒸足與 SPA 使用實際容器寬度斷點；窄容器拆行，不縮小文字。音樂不強制將期數與付款內容壓成運動的一列。
- 運動與音樂沿用既有編輯本次備註流程；蒸足與 SPA 的筆記入口開啟既有預約編輯介面，不新增寫入端點。
- 標籤仍由 CustomerLabelsProvider 與原有後端授權控管，本輪不變更授權、加購、扣堂、缺課或資料模型。

## 本機初驗

- 原始參考截圖已查看；未納入 repository、fixtures 或此文件。
- 9 個 focused suites，110 tests passed：四模組共用 cell、既有運動、蒸足當日列與批次流程、SPA 歷史摘要、音樂日期／付款／缺課顯示，以及 exact Preview guard。
- 合成資料 Vite bundle build 通過。這只證明元件可編譯，不能視為視覺驗收。
- changed-file ESLint 通過；git diff --check 通過。

## 本機限制與待驗項目

- 全量 Vitest 啟動後遭 OS exit 137；沒有完整 suite 結果，不能算通過。
- 全量 TypeScript 檢查遭 OS exit 137；不能算通過，待遠端 CI。
- 雲端 Chromium 新分頁出現 Target crashed，文件建議的正常恢復也逾時；本輪沒有取得可用最終畫面或瀏覽器尺寸量測。
- 1366px、寬螢幕、1024×768、768×1024、560px 窄容器、390／360px，sticky header、水平溢出與真實資料編輯往返均待 Preview 驗收。
- 未驗真 iPad／Safari；單元測試只證明 DOM 及 callback／焦點回復行為。

## 最小 Preview 發布範圍（已獲授權，正式合併除外）

1. 僅 push 本支線 fix/unify-module-notes-density，開 draft PR。
2. Preview exact branch／repository／Vercel metadata 檢查，DATABASE_URL、DIRECT_URL 兩者都必須指向既有隔離測試資料庫。
3. build 明確跳過所有 migration 與 seed；既有 Preview 外發通知抑制持續啟用。
4. vercel.json 仍將此支線 deploymentEnabled 設為 false，Git 自動部署未啟用。
5. 僅建立已授權精確支線的 Preview，使用既有隔離測試門市與合成資料。無 schema 變更、無正式資料存取、無店家設定異動。
6. 遠端 CI 完成 TypeScript 與相關回歸後，逐模組補齊桌機／iPad／手機與取消／返回驗收，呈交結果；正式合併另需明確授權。

## 隔離 Preview 與遠端 CI 更新

已依明確批准公開原倉庫 Draft PR #1260（仍不合併正式站）。首個遠端 UI 版本 e0320f84046d50c704fc9aac3368606db2ab6c62：

- Preview deployment dpl_HA67q8eGvZRnKePhjgumPacJfZhq 已 READY；target 為 Preview，對應精確 branch／commit。
- build log 已確認 isolated_database=true、notifications_blocked=true、migrations_skipped=true。未新增或複製環境憑證，沿用既有 Preview 設定。
- 遠端 Typecheck、changed-file ESLint 通過。
- Full Vitest：899 suites／8,123 tests passed，16 suites／129 tests 為既有 skipped。
- Targeted job：1,382 passed／2 failed；失敗為既有指南外發隔離測試的 Next request-cache／console AsyncLocalStorage 初始化順序，與產品執行碼無關。採用已驗證的同檔 test-only 修正，保持實際 sender、fetch、DB 與隔離斷言；重跑 CI 後再確認通過。
- 雲端瀏覽器已恢復可用；新隔離網域需安全登入，四模組最終 UI 驗收仍在進行。

Git 自動部署仍 disabled；隔離 Preview 由明確 Git deployment 啟動，沒有啟用正式發佈。


## 待發新版：SPA 標籤權限回歸

後續 source review 發現 SPA 名單的新 cell 曾額外使用 booking.update 限制標籤入口。現已移除這個額外條件，維持舊版由 CustomerLabelsProvider 的 customer.update／門市範圍與既有後端檢查决定；本次備註仍只依 booking.update 與原本可編輯狀態開放。

新增相反權限組合測試：customer.update 允許、booking.update 不允許時，標籤可操作但本次備註不可編輯；反向時標籤不可操作但本次備註入口仍可用。沒有增加權限或真實資料操作。

這項修正改變 SPA 的 runtime。e032 的舊 READY Preview 僅供歷史／初版記錄，不能當作此新版本已完成 UI 驗收；後續新版 Preview 部署與登入驗收另待確認。


## 蒸足驗收錯誤：合成重現與修正（尚非 live 重驗結論）

8dfe 隔離 UI 曾在開啟當日名單後進入頁級錯誤。原先僅按時間懷疑 60 秒刷新；後續全合成測試找到更具體、舊版亦存在的錯誤路徑：

- ADMIN 可由 `/s/:slug/admin/dashboard/bookings` 的已驗證路徑載入名單，但原本時段 API 只沿用 active-store cookie。無該 cookie 時會 401；在未受限的合成 ADMIN session 下，有不同合法門市的舊 cookie 時會發生上下文錯配；真實 HQ store-view session 仍必須遵守伺服器註冊的門市限制，不能據此要求跨店成功。
- 日期點選先顯示快取名單，另外的時段讀取放在 React async transition。該讀取若稍後失敗，原本只有 finally 沒有 catch，會卸載整份名單並進頁級 error boundary。新、舊 UI 使用相同合成資料皆能重現，且月份刷新尚未發出。
- 修正：名單傳送明確 storeId 作為「待授權請求」，slots action 重新檢查指定門市的 booking.read／核心功能開通、validateStoreAccess(read)、HQ store-view 與有效門市；不接受空值、全部門市或任意跨店。未提供參數的既有顧客／其他入口保留原 scope。月份刷新也使用同一經授權門市。
- 時段讀取失敗保留名單、清除該日未確認的時段快取、顯示失敗與重試入口；不假裝零時段或公休。原本自動更新維持運作。每日期讀取序號與獨立錯誤狀態防止晚到的舊失敗刪除新成功結果或蓋掉另一日期的重試提示。
- 隔離安全碼另修為 server 驗環境／角色／門市，client 同時檢查即時精確 pathname，避免 Next persistent layout 沿用舊路徑判定。正式環境與其他門市維持 default deny。

新測試均只用合成 session、headers、資料與記憶體 API 轉接，沒有 DB 或網路寫入。涵蓋真 proxy／scope resolver／slots action／GET／client reader、普通員工 own/other store、HQ store-view、無權限／不存在／停用門市，以及真 Next error boundary。React 名單測試涵蓋延遲失敗與重試、長換行備註、狀態／方案／標籤變更及多輪刷新。

這些證據證明上述缺口與本機修正，不等同已取得先前 live 錯誤本體，也不等同四模組桌機／iPad／手機 UI 全數驗收。cb749 的隔離 Preview 與 CI 為前一版本；此修正需新 CI，runtime 畫面另待允許的驗收途徑。

此修正本機驗證：22 focused suites／257 tests passed；changed-source ESLint 與 diff --check 通過。含既有 customer-facing slots／duty／店別規則回歸。完整 TypeScript 與 full Vitest 待同 PR 遠端 CI，未重跑資源不足的本機全量檢查。

已在本支線整合正式 main 3248c08a（既有 robots 與官網數據修正），無衝突。本輪 4 個新增 suites 與 3 個官網 suites 在整合後共 97 項通過；marketing-usage-sql 的 worker 異常退出／終止逾時，該次 16 項未完成，整合後這次 8-suite run 不算全過。該 SQL suite 交遠端 CI，未用資源不足的結果宣稱通過。

## 四模組合成驗收矩陣（真元件，非像素驗收）

`four-module-reminders-matrix.test.ts` 掛載真 DayDetailPanel、SpaBookingRoster、CourseRoster（運動／音樂）與 CustomerLabelsProvider。只替換 server reads/writes 與未開啟的外部 editor 邊界；沒有真資料或網路寫入。

| 項目 | 蒸足 | SPA | 運動 | 音樂 |
| --- | --- | --- | --- | --- |
| 空名單、空備註骨架 | 通過 | 通過 | 通過 | 通過 |
| 0／1／8 標籤；兩行摘要；沒有巢狀 button | 通過 | 通過 | 通過 | 通過 |
| 長換行備註、全文結尾可讀、來源分開 | 通過 | 通過 | 通過 | 通過 |
| 唯讀、標籤停用、不多發寫入 | 通過 | 通過 | 通過 | 通過 |
| 重複開全文、Escape 關閉、回到原 trigger | 通過 | 通過 | 通過 | 通過 |
| 本次編輯：取消草稿／重新開啟原內容 | 既有 detail editor 邊界待端到端 | 既有 schedule editor 邊界待端到端 | 通過 | 通過 |
| 本次編輯：Escape、Tab 循環、關閉回焦點 | 待端到端 | 待端到端 | 通過 | 通過 |
| 本次編輯：一次 submit 維持原 action contract | 本輪不做實際寫入 | 本輪不做實際寫入 | 合成 action 通過 | 合成 action 通過 |
| 確認視窗「返回」零寫入 | 既有批次選取測試 | 待端到端 | 通過 | 通過 |
| 本期／下期付款、堂數、請假／曠課與未來日期 | 不適用 | 收據既有測試通過 | 既有欄位保留測試 | 多期完整內容通過 |
| 合成 history Back 返回原月份／日期 | 真 workspace 合成測試通過 | 頁面整合待驗 | 頁面整合待驗 | 頁面整合待驗 |

追加 keyboard 測試實證：原運動／音樂備註編輯器沒有 Escape handler。已只將共用備註 editor 接到既有 ModalPanel 的鍵盤／焦點堆疊，保留原 cancel/save action；備註視窗按鈕統一 44px。沒有改動缺課、扣堂、付款或其餘確認視窗的業務規則。

`roster-reminders-css-contract.test.ts` 的 6 項解析檢查確認：14px、20+4+20px、獨立 44px controls、三種 roster 的 container query、56px minimum row 及窄／低螢幕 modal 滾動規則。jsdom 的可見尺寸只用於鍵盤 focus test，不能當真實量測；CSS 解析不能證明實際折行、sticky 或無溢出。

現有本機合成 Vite harness 已以目前真元件重新 bundle，包含四模組及 30 筆合成資料。此為編譯檢查；沒有透過其他瀏覽器或低階介面擷取畫面，不把 build、DOM 或 CSS 契約當成截圖驗收。

### 明確仍待瀏覽器完成

每個模組都要在 1366×900、寬螢幕、1024×768、768×1024、560px 窄容器、390／360px 檢查：

1. 實際兩行密度、長姓名／標籤／備註折行、14px/44px量測、內部捲動、sticky header 與整頁水平溢出。
2. 全文與筆記入口、取消／返回、焦點可見及原名單位置；蒸足／SPA 須穿過各自原有 editor。
3. 真正 Back/Forward、重新進入／刷新、連續開關與行動裝置虛擬鍵盤遮擋。真 iPad Safari／touch 並未驗證。
4. 蒸足修後保持名單至少兩輪自動刷新；API失敗／scope反向案例已合成測試，live只讀驗收不能據此宣稱已完成。
5. 音樂個別與團體名單的期數、兩期付款、歷史展開在窄畫面仍可完整取回。

恢復條件是正常可用、經授權的 QA 瀏覽器會話；頁面讀取與互動可用後，沿同一隔離 Preview 執行以上矩陣。若登入已過期，依既有安全登入流程恢復。使用者截圖不是唯一驗收方式；正式合併仍須完整畫面證據與另外授權。

本輪追加矩陣與既有回歸合跑：25 suites／299 tests passed；changed-source ESLint、diff --check 通過；合成 Vite bundle build 通過。新的 keyboard editor runtime 與新增測試待此 head 的遠端 CI／隔離 Preview，先前 0fb236ca READY 不能當作本輪 editor 修正的畫面驗收。
