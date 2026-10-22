# 顧客經營、分析與設定：接回既有共用頁面

## 邊界及版本

- 隔離 Preview：[新版後台](https://steamfoot-booking-qo37fds6p-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/admin/dashboard/beauty)，部署 `dpl_8cEn8XYerynGwtYETJ3ota5Vi63S` 已 READY。尚未替本版本建立驗證分享連結，也沒有挪用舊版本連結。
- 應用程式版本：`8f00554d`（共用頁面主變更 `b5d556fc`）；僅更新隔離 Preview。
- 基準：隔離支線 `preview/beauty-ui-alignment-20261021`，本批起點 `9cb7312d`；延續原有美業資料，不做 schema／角色／環境變數變更。
- 共用的是現有工作台及操作；資料讀取仍有本店、權限及美業開關檢查，不呼叫課程出席、扣堂或成交寫入。
- LINE 維持關閉；正式站、既有預約、方案餘額、收退款及稽核不修改。實體裝置與店家簽收仍待完成。

## 逐項對照

### 顧客經營

| 運動／音樂操作 | 美業新版 | 驗證／差異 |
| --- | --- | --- |
| 關懷與數位管家名單導覽 | 同一 `CustomerGrowthNavigation`，關懷返回美業入口 | 導覽依店家功能授權；不開啟 LINE |
| 全部、生日、好久不見、額度快用完、方案快到期、體驗未購方案 | 從原課程提取 `CareFilters`，兩者共同使用 | 原分類名稱、數量、月份收合及套用；保留美業 tab |
| 待關懷／已處理、追蹤、已安排及歷史 | 繼續同一 `CareWorkspaceServer`／`CareWorkspace` | 本批沒有再寫一個清單或追蹤流程；美業資料依完成服務、方案卡及家人共用計算 |
| 月份篩選 | 同一生日月份表單 | 月份篩選只改生日，不誤稱其他分類全是月份統計 |
| 期間消耗統計 | **尚未接入** | 既有 `getCustomerConsumptionAccess` 明確只支援蒸足／課程；其 SQL 未讀 BeautyLedger。沒有把美業接到課程扣堂統計或放一個必然被拒的入口；後續要以真實扣次／恢復帳本做資料 adapter，UI 可沿用原清單 |

### 分析

| 運動／音樂操作 | 美業新版 | 驗證／差異 |
| --- | --- | --- |
| 日期區間與分析對象 | 同一 `BusinessAnalyticsView`，同一日期控制 | 美業為全店／技師，技師 ID 需屬本店；不虛構所屬店長成交快照 |
| 來客、體驗、新購／續購、轉換 | 同一 KPI、同期比較與名單開關 | 美業由 `beautyBusinessReport` 提供服務與開卡資料；方案名單按人去重，不將家人加入當成新購 |
| 查看名單、搜尋、分頁、開顧客 | 同一名單操作 | 美業顧客連結仍回美業詳情，沒有導入課程顧客頁；無 customer.read 不傳名單 |
| 本期／近六個月／近一年、趨勢指標 | 同一趨勢區與圖表 | 美業服務依預約日、收退款依入帳日；方案銷售歸全店，不推定為某技師成交 |
| 新舊客與回流 | 同一呈現，提供美業完成服務資料 | 保留美業原本「期前曾完成服務者」回流口徑；未建檔同行者只算服務人次，不依姓名推定顧客 |
| 原美業預約人次及有效方案 | 保留為同一 `BusinessMetric` 摘要 | 不因接回原分析工作台而移除既有摘要 |
| 所屬店長方案利潤 | **不直接套用** | 美業沒有課程成交利潤快照，不用 0 元或假快照表示已算出 |
| 固定授課費／出席堂數 | **改為完成服務、服務時數** | 技師拆帳仍在原營運明細；不把課程固定授課費公式套到固定金額、百分比或鐘點服務 |
| 匯出 | 本批未新增 | 原美業沒有這個匯出；不能將課程 export endpoint 當成美業匯出 |

### 設定

| 運動／音樂操作 | 美業新版 | 驗證／差異 |
| --- | --- | --- |
| 五分類、設定列、行內編輯、儲存後收合 | 真正使用同一 `CourseSettingsWorkspace` | 美業只注入業務內容與 `/api/beauty/settings/store` 儲存接點；原課程預設路徑保留 |
| 切分類、旋轉、未儲存提示、離開保護 | 同一工作台實作 | 不再用另寫的美業分類工作台；切分類及尺寸變化保留店家資料草稿 |
| 店家名稱、電話、地址、地圖、官方 LINE 資訊 | 同一 `CourseSettingsSectionEditor` | 美業儲存仍有門市／權限／版本核對；輸入 LINE 資訊不代表啟用登入或通知 |
| 營業時間／特殊公休 | 原 `settings/hours` 共用頁面 | 技師預設沿用店家時間、可個別例外；沒有改回課程排課／值班模型 |
| 自行預約、取消／改期、截止、開放天數 | 保留美業規則編輯接點 | 規則具有美業扣次選項；不混入課程請假、固定班、補課或候補 |
| 銀行資訊 | 原 `PaymentSettingsPage`／表單 | 沿用原 Beauty 分支與唯讀檢查，沒有另寫銀行表單 |
| 體驗價格 | 指向既有美業公開體驗／收費流程 | 美業各服務不同價格及每人每項一次，不套用課程全店單一體驗價格 |
| 標籤、推薦分享、數位管家、LINE 官方帳號 | 使用既有共用入口 | 推薦／管家仍依原功能授權與 plans.edit，唯讀不顯示編輯入口；內頁屬既有共用功能，本批未驗真實外部發送或發布 |
| 顧客提醒／發送紀錄 | **尚未整合到課程 Reminder Center** | 保留美業原服務通知設定；課程提醒對象與模板不同。LINE 關閉，本批不宣稱已驗通知送達 |
| 系統方案與用量 | 共用方案頁與 `getStoreUsage` | 修正 Beauty 用量來源為 BeautyAppointment，原先非課程都讀蒸足 Booking；不拿蒸足零筆當美業用量 |

## 程式共用來源

- `src/app/(dashboard)/dashboard/growth/_components/care-filters.tsx`：從原課程提取；課程與美業共同使用。
- `src/app/(dashboard)/dashboard/growth/_components/care-workspace-server.tsx`：既有關懷資料／處理狀態。
- `src/app/(dashboard)/dashboard/courses/business-analytics-view.tsx`：原分析工作台，美業注入資料與稱呼；原運動／音樂預設保留。
- `src/lib/beauty/business-report.ts`：純資料呈現 adapter，沒有扣次、收款或課程 DB 寫入。
- `src/app/(dashboard)/dashboard/courses/settings-workspace.tsx`：原設定工作台，美業內容插槽；原課程內容／守門不改為美業邏輯。
- `src/components/beauty/settings-workspace.tsx`：薄內容 adapter，沒有另建分類、草稿與儲存骨架。
- 移除不再引用的 `BeautyAnalyticsWorkspace`、`BeautyStoreSettings` 重複呈現檔案；不移除任何模組、資料或業務 action。

## 驗證層級

- 本機：11 檔／108 項相關回歸通過，涵蓋運動分析、設定工作台、設定權限、用量與美業服務／名單 adapter。
- Chromium 合成驗收：48 個案例，運動／音樂／美業，1366、1920、1024、768、560px；包含實際 CSS modules，檢查無整頁水平溢出、分類與旋轉草稿保留、美業顧客連結；沒有真實登入或 DB 寫入。
- 原生 Next/Turbopack production build 通過（本機隔離、Beauty 關閉、LINE 關閉、無 migration）；TypeScript、ESLint 及 diff check 通過。額外試跑 Webpack 因既有 generated Prisma runtime loader 的 createRequire 解析失敗；未為此更動封裝或連線設定，隔離站沿用專案原生建置。
- 原有運動／音樂設定瀏覽器回歸：另 36 個功能 ENABLED／LOCKED／HIDDEN 案例通過，含草稿尺寸保留與撤權後編輯器卸載；此為合成狀態驗證。
- 新版 hosted 登入與儲存重開：**待執行**，不能搬用 `8308ef16` 的通過紀錄。
- 實體手機／平板、店家簽收、LINE：待完成。

## 後續優先順序

1. 本批隔離 Preview 的實際登入、分類與名單核對、店家資料儲存重開及唯讀權限；真實資料只用專用測試欄位，測後還原。
2. 期間消耗統計的美業資料 adapter、共用提醒中心的 Beauty 對象／模板逐項接入，避免把課程業務資料直接套入。
3. 店家以實體裝置簽收；LINE 完成申請後另驗登入與通知送達，正式啟用另外確認。
