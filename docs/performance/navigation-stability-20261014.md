# 全站跳轉與成功回饋優化（2026-10-14）

## 操作原則

- 主功能或新資料範圍才導航；已有資料的分類、開啟表單、成功提示與 URL 清理不重載頁面。
- 已顯示內容不因還原捲動位置或設定進度更新再次整頁讀取。
- 後端確認成功才顯示綠色成功通知，右上角呈現；失敗保留輸入與就地錯誤。
- 後端權限、跨店隔離、交易與餘額查詢仍維持權威讀取。

## 已完成的共用修正與入口

| 入口 | 修正 |
| --- | --- |
| 全站 FormSuccessToast / FormErrorToast | 只透過原生 history 清理通知參數；保留篩選、店家路徑與 hash；避免再次 server navigation 與 StrictMode 重複通知 |
| 全站 Toaster | richColors 成功提示統一右上角 |
| AppLink / DashboardLink 共用入口 | 重複點選完全相同網址不再次導航；保留修飾鍵、新分頁及既有 onClick |
| 共用 InstantFilterForm | 送出相同篩選條件不重新載入 |
| 後台 ReturnPosition | 返回只還原位置，不追加刷新 |
| 音樂／運動課程後台設定進度 | 移除每次 pathname/query 改動後的整頁刷新；視窗 focus 改為局部讀取進度 |
| 課程設定分類 | 重複點選目前分類不改 URL 或收合編輯；其他分類沿用局部切換並保留草稿 |
| 課程設定即時開關 | 使用已確認回應更新狀態，顯示成功通知，不追加刷新 |
| 教學項目、課程與空間新增 | 保留既有權威 receipt 更新列表，新增成功通知 |
| 蒸足／SPA 新增與修改顧客 | 既有獨立表單完成後只返回一次；移除導航後的額外 refresh，新增顧客成功通知 |

## 全站盤點中保留的必要流程

程式碼盤點範圍包含 src/components 與 src/app 的 router.push / replace / refresh、location.assign / href / reload 及 redirect。

- 切換店家、登入／登入完成、權限與模組邊界：需確認新作用範圍，保留導航。
- 課表跨月、報表查詢、尚未載入的提醒頁／設定面板：需要新資料，保留導航及局部提示。
- 收款、取消、排課、刪除及人員存取異動：仍需權威同步；未一律刪除 refresh。
- 手動重試與更新：保留使用者明確要求的重新讀取。

全站第二輪完成以下修正：

- 116 個 router 使用端接入共用 use-stable-router；與 DashboardLink 共用門市／HQ 路徑規則。相同網址不導航，同頁 query 切換保留位置，更新放入 React Transition。
- 全站 6 個原生 GET 查詢表單改用 QueryForm，保留重複參數、submitter 行為與無 JS 原生送出。
- 提醒管理不再在頁面已顯示後跳向 localStorage 記住的舊分頁；網址決定當前分類。
- 現金管理開店、提領、補入、調整、閉店、撤銷與新增收支共用原地提交流程；後端確認成功才清空欄位及顯示通知，另發 RSC GET 更新權威資料。失敗與連線不明保留輸入，避免 React 原生 action form 自動 reset。
- 試用／方案設定移除成功後延遲 document reload。HQ 獨立表單移除導航後的二次 refresh。
- 營業設定套用總部後讀取同門市權威 snapshot，保留工作台；已確認寫入但讀取失敗時，只重試讀取，不重複套用。
- 預約月份歷史深層連結改為 RSC 同步，不 document reload。丟棄設定草稿後走正常 client navigation。
- 自動更新在 modal 或編輯欄位有焦點時暫停；明確送出／重試仍可更新權威資料。
- Root、課程、設定與品牌總覽載入改為共用内容骨架。已有詳細骨架的其餘頁面保留。

全站來源清單：`navigation-inventory-20261014.json`，涵蓋 192 個 page、61 個 loading boundary 與全部 navigation / history / redirect 呼叫。此清單是靜態盤點，不能代替每個帳號的實際業務驗收。

左側主功能刻意維持專案既有原生導航（舊版 Next client navigation 卡住的既有處理）。登入、切店、外部 LINE／下載與使用者明確要求的結果不明重試也保留必要邊界。沒有把獨立表單全部重構成彈窗，也沒有宣稱全站零等待。

## 驗證

- 第一輪 9 個相關測試檔、73 項通過：通知清理／StrictMode、相同網址點選、相同篩選、返回位置、分類切換／草稿／上一頁、設定進度更新、教學項目即時新增及設定開關後端規則。
- 全站回歸：10,224 項通過、129 項原本設定為跳過；後續營業同步、歷史返回與隔離 Preview guard 另有針對性回歸。
- 變更檔 ESLint 與 TypeScript 全站檢查通過。
- 合成 Chromium Preview：運動與音樂 36 組既有設定狀態案例，1366、1440、1024、768、767、560px；新增右上角成功提示檢查 1366×900、1024×768、768×1024，無水平溢出。
- Preview 使用實際元件、mock 路由及合成通知；沒有登入或資料庫，不代表真實店家新增／收款業務驗收，也沒有 Safari 驗收。
- 截圖與结果：/tmp/course-settings-three-state-qa；未部署或合併正式站。

## 本次專用 Preview

- 分支：`fix/full-site-navigation-stability-20261014`。
- 限定 Vercel Preview 與 rock7652-beep/steamfoot-booking，資料库只允許既有隔離測試專案；build／runtime 驗證失敗就停止，不使用正式連線。
- 沿用 module-roster-preview 模式：跳過 migration，阻擋外部通知；自動 Git deployment 關閉，由明確的本次 Preview 建立操作觸發。
- 已核對的最新既有部署均不是這次修改；正式 main 部署不是驗收目標。
- 受保護測試站的暫時分享連結曾被自動審核拒絕：未明確授權存取邊界變更。未取得額外授權前，不建立 bypass 連結或宣稱登入後驗收完成。
- 新增／失敗／連續送出合成 Chromium：1366×900、1440×900、1024×768、768×1024、560×768、390×844，維持工作台與拒絕輸入，無 document reload 或水平溢出；結果 `/tmp/navigation-stability-qa/results.json`。
