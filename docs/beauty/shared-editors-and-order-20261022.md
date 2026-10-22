# 美業排序與顧客／人員編輯接回共用元件

工作支線：`preview/beauty-ui-alignment-20261021`；開始版本 `78b1b288`。沿用既有隔離測試站與 `steamfoot-preview`，不建立 PR、不合併 main、不操作正式站。LINE 維持關閉，沒有改動環境變數、資料表結構或角色授權。

## 已完成的接回範圍

| 功能 | 運動／音樂與美業實際共同使用的來源 | 本次結果與邊界 |
| --- | --- | --- |
| 位置／服務／收費排序 | `components/admin/course-display-order.tsx` 的原排序 hook | 原拖曳、鍵盤上移下移、儲存提示、復原、失敗還原／重試均沿用；新增可注入 writer，原模組預設寫入維持不變。美業三入口接上自己的 writer，篩選時不可排序。服務清單也使用同一 hook，沒有另做排序操作。 |
| 排序儲存 | `server/actions/beauty-display-order.ts` | 沿用既有 `CourseDisplayOrder`；以已授權美業門市的 room／subject／plan 分別儲存。位置沿用原 ID；收費以 single:／trial:／plan: 對應美業來源，不送進課程寫入。Store lock、revision、重複／外店 ID 驗證與稽核同交易。保留未顯示／新建立項目；無新增 schema／角色。 |
| 顧客概況 | 原 `CourseMemberWorkspace` 抽出的 `courses/customer-overview.tsx` | 原電話、標籤、基本資料排列、備註及持有方案／會員連結等區塊插入順序共用；運動原入口同步使用。美業方案與交易／服務紀錄仍從美業來源提供，沒有套用課程帳本或上課紀錄查詢。 |
| 顧客基本資料編輯 | 同一 `courses/course-profile-forms.tsx` 的 `CourseCustomerDraftForm` | 同一份姓名、電話、Email、性別、生日、地址、緊急聯絡資料、草稿及錯誤保留。美業注入 writer 與店別草稿 scope；後端必須帶 updatedAt，檢查權限、功能開關、門市與合併狀態，更新與稽核同交易。保留原備註、服務備註、會員連結與方案資料。 |
| 顧客備註 | 原 `RetainedNoteEditor` | 既有 Beauty notes 欄位，改用原就地編輯、草稿保護及 CAS；儲存後重新查權威顧客資料，避免接續基本資料編輯使用舊版本。沒有將 notes 與 serviceNote 混在一起或搬移。 |
| 技師／人員基本編輯 | 原 `CourseStaffWorkspace` 抽出的 `courses/staff-editor-fields.tsx` | 原基本欄位、狀態 select、分頁及服務資格列由運動與美業共同使用；原元件同步改用此來源。美業技師不新增聯絡資料，仍連結會員；性別必填、原固定排序及技師業務欄位保留。 |
| 後台人員權限編輯 | 同檔 `CourseStaffPermissionFields` | 同一進階權限群組、搜尋、僅查看、全開／全清、整組操作及角色預設入口。美業原 `StaffAccountEditor` 注入 CourseStyle 使用這些原表單；其他模組的 generic staff 分支不切換。保留不可編輯及範圍外權限，不藉批次按鈕擴權。後台仍用既有 staff confirmed-save 的階層、店別、版本及權限檢查。 |

**沒有宣告整個技師／人員編輯工作台都已共用。** 本次接回上述實際欄位與操作；美業 `BeautyCatalogEditor` 的可服務時間、百分比基準、會員與工作權限分支仍保留原美業實作，因為必須保留店家時段繼承／個別例外，以及與後台帳號分離的權限。後台人員仍由原 confirmed-save 流程儲存，沒有假冒教練身份或更換資料模型。顧客的美業服務／交易紀錄與家人共用設定仍是美業資料接點，不宣稱已接到 Course 記錄元件。

## 驗證分級

1. **自動回歸：** 64 檔／469 項通過，涵蓋 Beauty、原運動／音樂方案、共用排序、原教練編輯及人員 confirmed-save、顧客紀錄。TypeScript、變更檔 ESLint、diff check 通過。
2. **實際 SQL、隔離引擎：** 新增 PGlite 測試透過本次真正的排序／顧客 profile action SQL 執行 commit、重讀、舊版本拒絕、外店拒絕、未開通／低權限拒絕，以及 audit 失敗整筆 rollback。授權與 Prisma transport 為測試接點，沒有將此視為真實 session／pooler／RLS 驗收。
3. **真正 Preview 資料庫：** 經 Supabase 管理連線對 `ttworfzgwejdeolegkxl` 核對既有排序表及 RLS。於本店真正 CourseRoom ID 上進行排序寫入／重讀，最後 ROLLBACK；切換 anon／authenticated 實際 SELECT、UPDATE 均被拒絕。事後 room preference 仍為 0 筆，沒有留下資料變更。這是管理連線下的 SQL／公開角色驗證，**不是應用程式登入後的儲存或店長低權限完整驗收**。
4. **瀏覽器：** 真正共用元件與專案 CSS，使用本機 Vite fixture；所有 server action／Next navigation 模擬。顧客、技師、人員編輯於 1366×900、1920×1080、1024×768、768×1024、390×844 檢查；技師拆帳另驗平板窄容器。6 情境通過，無 pageerror、整頁或 dialog 水平溢出。包含顧客完整 profile payload、技師時段繼承／拆帳基準／grants 保留，以及三管理頁的原排序控制接線。不是實體裝置或真實 hosted 驗收。
5. **Hosted 真實登入與儲存：待驗。** 本輪沒有建立／替代建立分享免驗證連結，沒有關閉 Deployment Protection。前輪自動核准審查拒絕新增可分享存取權限，仍保持原限制。

本輪未改預約、扣次、餘額、收退款、方案帳本及已驗收的顧客／技師前台流程；其相關既有回歸通過，不代表重新做完 hosted 真實帳本驗收。

## 下一步

先補受保護測試站的既有登入方式下，店長與低權限帳號的排序／顧客／技師／人員儲存重開、跨店拒絕，再接回設定及分析等剩餘內頁。不得因本機或 DB 管理連線通過，標示店家簽收或正式可上線。LINE、實體裝置與店家簽收仍獨立列待驗。

截圖與分級證據：[shared-editors-20261022](evidence/shared-editors-20261022/README.md)。部署完成後在該目錄補上確切 Preview 版本與狀態。

## 最終隔離測試版

- 程式版本 `fe44babba4c069d378d88b2cd6d88eb62c9a0530`，Vercel Preview `dpl_7FkjSAYB5T8DgMBpfDQs9kp78rac`，**READY**；編譯 17.2 秒，hosted 型別與封裝完成。
- [測試站後台](https://steamfoot-booking-adxw8rtlf-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/admin/dashboard/beauty)。仍受原 Vercel 存取保護；普通 HTTP 回應內容為 Vercel Authentication 提示，沒有到達應用程式登入，不能以 HTTP 200 認定可登入或驗收通過。
- 64 檔／469 項回歸在 `c485d1d6` 通過；最終補上備註儲存後重新讀取的關閉／門市切換保護與錯誤處理，受影響 3 檔／10 項再驗通過。最終版本 TypeScript、ESLint、diff check 通過；本機瀏覽器 6 情境於最後修正後再次通過。
- 真正 DB 檢查全在 `steamfoot-preview`，寫入測試 ROLLBACK；事後重查無 room preference 留存。沒有變更正式站、LINE、連線／環境變數、schema 或角色。
