# 四模組方案操作盤點與修正

## 最新範圍

2026-11-14 使用者要求移除「調整剩餘額度」及「使用紀錄」操作入口，保留續購、補登、部分額度註銷、期限調整及整份方案註銷；四模組共用選單順序、語意色及可切換的同頁表單。移除入口不刪歷史資料，不改帳務及權限規則。

## 程式與後端逐項對照

| 操作 | 蒸足 | 音樂／運動 | 美業 | 本次差異判定與處理 |
| --- | --- | --- | --- | --- |
| 續購同方案 | `AssignPlanForm`、`assignPlanToCustomer` | 原 `assign`／購課付款流程 | 原 `source.assign`、`assignBeautyNativeCard`／購買意圖流程 | 後端已有；音樂、運動、美業缺卡片直接入口。依原商品 ID 預選仍上架的同方案，仍經原付款確認，不直接重發或複製歷史售價。 |
| 補登 | `BackfillUsedSessionsForm`、`backfillUsedSessions` | `saveCourseSessionAdjustment` 的 BACKFILL | `saveBeautySessionAdjustment` 的 BACKFILL | 後端及入口均已有；統一選單，修正美業服務／次數用詞，總覽沿用權威資料讀取後展開表單。 |
| 註銷部分額度 | `voidWalletSession` → `voidAvailableSession` | `saveCourseSessionAdjustment` 的 VOID | `saveBeautySessionAdjustment` 的 VOID | 蒸足能力藏在單堂明細，移除紀錄入口後須補直接入口。新增選擇 AVAILABLE 堂次的確認表單，沿用原單堂交易；保留逐堂與數量型後端的業務差異，沒有用設定剩餘數冒充註銷。 |
| 調整期限 | `ExtendWalletExpiryForm`、`extendWalletExpiry` | `saveCourseCardManagement` 的 expiry | `saveBeautyCardManagement` 的 expiry | 都已實作；解除只因展開表單而停用其他操作的 UI 條件。 |
| 註銷整份方案 | `closeSteamPlan` | `saveCourseCardManagement` 的 close | `saveBeautyCardManagement` 的 close | 都已實作；保留原門市／角色／模組／占用檢查、原因與確認及未知結果重試。 |
| 調整剩餘額度／使用紀錄 | 移除方案卡片選單的兩個入口 | 不增加對應入口 | 不增加對應入口 | 顧客抽屜及蒸足獨立顧客網址一併移除本次指定的管理入口；日期格、顧客紀錄分頁、歷史稽核及原後端資料保留。 |

`CourseMemberWorkspace` 的 `dirty || !!inlineEntry` 與 `PlanManagementControls` 的 `!!mode` 是純編輯即整組反灰的來源。本次改成送出中／結果未知才阻擋切換；單純編輯可切換，舊未送出表單隨切換卸載，不發出交易。選單沿用 `ExclusiveMenu` 的選取即收起。

美業總覽原本選操作會轉入獨立方案詳情，現在注入美業 reader／cardManagement 到同頁操作，仍先讀權威方案、檢查持有人與狀態。詳情中的共卡儲存按鈕只在共卡編輯可用且未展開另一管理表單時呈現，避免以「儲存共卡成員」冒充補登儲存。

共用色：補登 amber、期限 primary 綠、部分及整份註銷 red，並保留文字及可見焦點；不以顏色代替操作名稱。

音樂續購只依原方案及持有方案的穩定教學項目 ID 預選，若仍有多個可選項目則保留選擇，不以名稱推測。運動點數型方案保留期限／整份註銷，沒有補登上課／註銷堂數入口，因原 session adjustment 後端只接受堂數型方案。

## 驗證與限制

實測結果、精確版本與 Preview 在 PR 驗收後補記。單元驗證包括直接切換、未送出不寫入、未知結果鎖定與原請求重試、美業用詞、蒸足僅 AVAILABLE 可選與明確確認後才呼叫原註銷動作。正式站不執行交易或外發驗收。
