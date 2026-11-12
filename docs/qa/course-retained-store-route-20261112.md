# 保留課程網址與目前門市不符

正式證據：2026-11-12 18:40（台北）畫面選取「暖沐蒸足」，網址為 `/hq/dashboard/courses?view=plans`，顯示 digest `4263089716`。同時正式 deployment `dpl_9PczeGqZWyednnzZNVywLrjZnnnQ` 的 10:40:22 UTC GET 紀錄為 `AppError FORBIDDEN: 此功能僅適用於課程門市`，digest 一致。紀錄證明門市與路由不符，不能據此認定使用者曾按下哪個切店按鈕。

原因：CoursesPage 原先在分派 plans／customers／analytics／settings／operations 子頁之後才檢查實際門市模組。收費子頁的 requireCourseStore 正確拒絕跨模組讀取，卻呈現成意外錯誤。

修正：以已授權讀取的目前門市，先查既有權威模組，再進行功能檢查與所有子頁分派；非課程門市或未選門市依既有課表路由規則返回 `/dashboard`。模組查詢失敗仍拋出，不猜店家、不吞掉服務異常、不放寬資料或功能權限。下游 guard 保留。切店目的地原本已正確處理跨模組，此次不改切店行為。

驗收情境 09／10：保留或直接開啟課程網址，分別測蒸足、美業、未選門市、權威模組查詢失敗；課程店的音樂 catalog 與運動／課表頁維持正常。測試實際 CoursesPage，以 mocked session／store／DB 驗證 redirect 與資料讀取邊界，不是正式帳號端到端測試。不涉及畫面排版、尺寸、金額、購課、預約、扣堂或計酬資料修改；RWD 與效能量測不適用此次 server route guard。

Preview 精確分支沿用既有隔離及打包流程；正式資料庫／來源儲存庫／通知 guard 不變。無 migration，不更動正式資料及現有通知設定。最終測試、Preview 與發布結果記於對應 PR。

本機 7 檔／101 項通過，涵蓋真實 CoursesPage 分派、原音樂 catalog、運動／課表、跨模組切店目的地及隔離打包拒絕條件；測試命名修正後相關 9 項重跑通過（包含前述測試）。變更檔 ESLint 與 diff check 通過。

## 收費編輯依最新指示簡化

使用者看到已發布版仍有核對操作及更多文字，明確要求移除全部說明與「保留修改／重新確認」流程。收費表單改為只顯示欄位、金額摘要與操作，移除三段授課／舊約定／計酬說明及購課規則段落，不移除必要欄位錯誤。

收費草稿以與後端相同的驗證值比較修訂，忽略 JSONB／receipt 的鍵順序及等價預設值；真實價格、範圍、時間變更仍不相等。未重疊更新整合到目前欄位，直接按儲存；真正同欄衝突保留輸入、擋住送出，僅顯示目前值的短錯誤，使用者重新輸入該欄後才接受新的基準。結果未明的重試仍沿用原 requestKey／payload，不能自動提交。其他表單未啟用此自動整合。

本機 8 檔／48 項通過；完整 TypeScript、變更檔 ESLint、diff check 與合成 Chromium UI 驗收通過。實際 CoursePlanDraftForm／CourseMemberWorkspace，記憶體回應且後端 import／外部網路封鎖；新增／移類立即分類、重開保留 100 分鐘、無核對選項／說明段落、直接儲存保留輸入並採未編輯欄位的新價格。1366×900、1024×768、768×1024 無整頁溢出與 pageerror。畫面於 artifacts/course-fee-simple-20261112；這不是登入正式帳號或實體 iPad 驗收。
