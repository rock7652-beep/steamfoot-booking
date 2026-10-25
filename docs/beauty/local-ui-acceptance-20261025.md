# 整合版：本機假資料介面驗收（2026-10-25）


> 後續補驗：清單完整返回、剪下貼上與顧客經營關懷流程的最新結果見 [本機整合流程補驗](local-flow-acceptance-20261025.md)。下表保留本輪歷史範圍。

基準：`e8e8a6ed10470e2821bd0050555a70a33ea16784`；分支 `review/beauty-production-integration-20261025`。

本輪直接載入既有共用 React 元件與美業接點，使用合成資料及本機 Chromium。沒有啟動應用程式伺服器、登入真實帳號或連線資料庫；沒有執行 migration、build、部署、推送、LINE 操作。這是介面及假資料操作驗收，不能作為真實交易或正式上線通過的證明。

## 通過與尚缺

| 範圍 | 本輪結果 | 尚缺／限制 |
|---|---|---|
| 收費設定 | 欄位、一般／體驗價格及時長、失敗後保留草稿、窄螢幕操作通過；沿用原共用表單 | 真實儲存重開仍未執行；假資料 writer 刻意回傳失敗，不冒充成功寫入 |
| 收款 | 實際 `BeautyCollectionPanel`：甲 $1,000 折抵 $100 後 $900；切乙時清除甲的報價並鎖住送出，載入後 $1,500，攔截的送出資料僅乙 | 未寫入帳本、拆帳、收退款紀錄；此處是收款元件測試，尚未驗預約清單外層的捲動位置與收款返回整段流程 |
| 購買方案／顧客 | 實際共用顧客工作台：購買方案後返回顧客、關閉返回清單，保留搜尋；再搜尋乙並開啟，姓名／電話正確 | 顧客 source 為假資料 port；尚未涵蓋真實延遲、跨店授權及所有進階資料；未把「搜尋保留」擴大宣稱為所有篩選／捲動位置保留 |
| 多人預約 | 四人各自顯示技師／位置；自動分配不同床位；已選顧客不可重選；優先有效快到期方案；縮放後保留四人 | 資源可用性由假資料提供，未驗真實並發與鎖定 |
| 班表／改期 | 美業實際 `BeautyScheduleWorkspace` 的日／週／月切換通過；改期元件另有 3 項離線 UI 測試，涵蓋換日期忽略舊回應及保存請求識別 | 剪下／貼上完整瀏覽器操作、多人貼上衝突仍待補，不列為通過 |
| 租借 | 共用租借表單：送出失敗保留姓名／電話，版面檢查通過 | 未驗真實租借建立、收款及衝突 |
| 技師／人員 | 美業使用實際 native source；停用人員預設收合；長服務清單分頁／搜尋與編輯視窗縮放；後台角色切換改變預設勾選權限 | 假權限群組只驗畫面；不代表服務端授權／跨店限制已驗收 |
| 分析／期間消耗統計 | 共用報表元件，三模組不同名稱／欄位接點與尺寸畫面檢查完成 | 報表輸入是假資料，不代表 SQL、實際金額或所有報表內操作正確 |
| 顧客經營 | 共用 `CareFilters` 的三模組版面已核對 | 只涵蓋篩選元件，完整關懷內頁與操作尚缺 |
| 提醒／設定 | 共用提醒列表、方案提醒、體驗關懷及店長通知元件，三模組與手機／平板版面已核對；店家資料可顯示 Google Maps 未設定 | 提醒實際送達、設定真實保存／重開未驗；LINE 持續關閉 |

## 本輪修正

共用收費表單依美業既有 `sessionLabel: '次數'` 顯示「總次數」及「／次」；音樂／運動預設仍顯示「堂」。未另做美業表單、未更動金額或交易計算。

另修正兩份驗收測試：同行者資料未補齊時不能直接安排體驗，須選定顧客身分後才驗體驗帶價；改期測試固定測試時鐘，避免跨日造成預設日期變動。沒有為使測試通過而放寬正式流程。

最初預覽曾因路由替身每次產生新的 URLSearchParams 導致重複渲染；已修正驗收工具，使查詢快照穩定，正式顧客工具列沒有因此修改。預覽所遇 `node:crypto` 是未使用的服務端路徑，未更動正式雜湊演算法。

## 畫面對照

修正前表單由基準提交的原檔在同一套合成預覽工具重現，沒有切換工作樹或改回正式檔案。

| 對照 | 畫面 |
|---|---|
| 美業單位用語：修正前／後 | [前：每堂](evidence/20261025-local-ui/before-beauty-charge-390.png)／[後：每次](evidence/20261025-local-ui/beauty-charge-390.png) |
| 美業多次方案 | [總次數與單位價格](evidence/20261025-local-ui/beauty-charge-plan-390.png) |
| 收款小視窗 | [桌機](evidence/20261025-local-ui/beauty-collection-1366.png)／[手機](evidence/20261025-local-ui/beauty-collection-390.png) |
| 四人預約 | [桌機](evidence/20261025-local-ui/beauty-reservation-four-1366.png)／[手機](evidence/20261025-local-ui/beauty-reservation-four-390.png) |
| 技師服務設定 | [平板](evidence/20261025-local-ui/beauty-staff-editor-services-768.png)／[手機](evidence/20261025-local-ui/beauty-staff-editor-services-390.png) |
| 人員權限 | [切換前](evidence/20261025-local-ui/beauty-personnel-permissions-before-1024.png)／[切換後](evidence/20261025-local-ui/beauty-personnel-permissions-after-1024.png) |
| 購買方案 | [手機](evidence/20261025-local-ui/beauty-customer-purchase-390.png) |
| 設定共用接點 | [美業](evidence/20261025-local-ui/beauty-shared-settings-390.png)／[音樂](evidence/20261025-local-ui/music-shared-settings-390.png)／[運動](evidence/20261025-local-ui/sports-shared-settings-390.png) |
| 班表與分析 | [日表](evidence/20261025-local-ui/beauty-calendar-day-1366.png)／[月表](evidence/20261025-local-ui/beauty-calendar-month-1366.png)／[平板分析](evidence/20261025-local-ui/beauty-shared-analytics-768.png) |

## 驗證證據

- 9 組 Chromium 操作檢查全部通過：[結果](evidence/20261025-local-ui/interaction-results.json)。
- 292 組具名畫面檢查；寬度 1920、1366、1024、768、390、360，未發現整頁橫向溢出或未攔截的外部請求／頁面錯誤：[幾何結果](evidence/20261025-local-ui/layout-results.json)。不是所有操作都在所有尺寸執行，日曆內部可橫向捲動，不能將文件未溢出視為所有元素可用性保證。
- 11 個測試檔、96 項離線測試通過：[紀錄](evidence/20261025-local-ui/all-tests.txt)。
- TypeScript、限定本輪檔案 ESLint 與 `git diff --check` 通過。沒有執行含 migration 的 build。
- 手機／平板為 Chromium viewport 模擬，並非實體裝置驗收。

## 重跑

從工作樹根目錄執行，下列腳本不會啟動真實後端。Playwright 可用路徑須依執行環境提供；本機 Chromium 路徑為 `/usr/bin/chromium`。

```bash
NODE_OPTIONS="--require=$PWD/scripts/qa/beauty-ui-block-network.cjs" \
PLAYWRIGHT_PATH=/path/to/playwright/package \
node scripts/qa/beauty-integrated-ui-browser.mjs
```

`QA_INTERACTIONS_ONLY=1` 只跑操作；`QA_CHECK=檢查名稱` 可限定單項。輸出寫入 `/tmp/beauty-integrated-ui-20261025`。Node sockets／DNS／fetch 封鎖，所有 `@/server` action 匯入在打包時替換為假資料 writer；瀏覽器僅允許記憶體提供的 synthetic.invalid HTML，其餘請求中止。驗收 fixture 沒有被任何應用 route 匯入。

後續仍可在相同限制下補齊清單整段流程、剪下貼上及顧客經營完整內頁；資料庫、migration、部署的停止限制不因本報告而解除。
