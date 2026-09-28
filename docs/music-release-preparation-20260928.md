# 音樂教室發布準備 — 2026-09-28

## 本輪結果
程式提交 c6ff1b4c4c41cae79e4ecd4acde4266fe1290071。PR #1133 維持 Draft，未合併正式站。
預覽：https://steamfoot-booking-bhkybbfpu-rock7652-2111s-projects.vercel.app
本文件更新 music-independent-acceptance-20260928.md 的後續結果；舊報告各輪結果保留供追溯。

- 音樂首頁、未指派方案、分析角色移除直屬店長呈現；原權限範圍保留，運動模式不變。分析與匯出拒絕音樂 manager perspective。
- 瀏覽器確認新版 19:31 staging：首頁顯示全店顧客，沒有名下顧客；分析角色只有店家與老師。未指派方案的音樂／運動差異由互動測試驗證。
- 修正過時 fixture、授課可用時段 mock 及已變更 UI 的斷言，未跳過或刪除測試，未放寬 CI。
- GitHub CI：Full Vitest baseline、Typecheck、Changed-file ESLint、Targeted tests、music-makeup-postgres 全部成功。一般 postgres-integration 此次 skipped，不計為通過。
- Vercel READY。Cloudflare Workers Builds 仍 failure，僅取得 build ID 539b163d-bde9-4d81-a887-40cec6afedda，未取得平台詳細錯誤，尚未解決；不能稱所有 checks 綠燈。

## 補課實際驗收
僅使用 preview 店 store-lubymusic 與驗收0928補課學員。
經使用者授權暫將 maxMonthlyBookingsOverride 由 NULL 調為 1000，未更改 EXPERIENCE 方案。
1. 9/29 10:00 選學員，預選原 9/28 請假、本期剩餘1堂；成功建立補課預約 cmul63jha0001la04viv9wwo1。
2. 名單顯示本期4/4、下期已繳8堂、請假1次。
3. 透過單堂調課 UI 選擇已核對合格老師與教室的 9/28 11:00 驗收0928專用空位，以實際已開始的時段驗收出席；未關閉未開課限制。
4. 點出席，UI已簽到，資料庫 ATTENDED，原卡 remaining=0；makeupForBookingId=qa0928-private-book-3。
5. 點恢復待點名，UI可再操作，資料庫 RESERVED，原卡 remaining=1，原請假關聯仍保留。下期8堂顯示不變。
6. 驗收後已將 override 由1000恢復 NULL，SQL回查確認。正式站未變更。

保留測試補課在9/28 11:00待點名，原9/28 10:00保持請假。原15人驗收班本輪未修改。
本輪瀏覽器未重跑取消補課重排及並行防重複；這些由 music-makeup-postgres 隔離資料庫測試驗證，不混稱全數瀏覽器驗收。

## 正式發布順序（待授權，未執行）
1. 確認核准的 PR head、正式站目前部署與 main SHA，記錄回退部署；確認最新備份／還原能力及待套用 migration 清單。
2. 使用者於 2026-09-28 明確指示往後跳過 Cloudflare；保留原始檢查結果，不列為本次上線阻擋。
3. 正式資料庫先依序套用：
   - 20260928094955_course_checkout_transfer_compat.sql
   - 20260928101128_course_student_makeup_link.sql
   先查 migration history 與實際 schema，已套用者不得重複執行。使用既有核准 migration 流程，不修改 ci-migrate 的正式環境保護。
4. 驗證結帳 constraint 保留轉帳末碼要求；補課 composite foreign key、禁止自連結、active partial unique index 與查詢 index 存在。
5. 合併核准提交並部署；核對正式域名指向正確 commit。
6. 使用可辨識且可回復的驗收學員做下列煙霧測試，不批次操作真實名單。

## 發布煙霧測試
- 登入正確門市；非授權門市請求遭拒絕。
- 音樂課表、一對一及10–15人團班可開啟；出席／恢復待點名後可立即操作其他學員。
- 重新整理後狀態及堂數一致，沒有重複扣堂。
- 請假不扣堂、選單預選待補課、補課出席及恢復堂數正確。
- 續報帶入正確學員課程，付款僅一筆，前後期及日期界線保留。
- 音樂顧客／首頁／分析不呈現直屬店長；運動方案與直屬店長功能維持。
- 查看實際錯誤紀錄及結帳／點名請求，任何資料一致性或門市隔離問題立即停止發布。

## 回退
- 記錄異常、停止相關寫入，將應用程式回退至發布前已記錄的可用部署，重新驗證登入與查詢。
- 保留兩份相容性 migration，尤其 nullable 補課欄位、關聯與索引；不刪補課、付款或出席資料。
- 回退舊程式可能不理解補課關聯，補課寫入須暫停直到修復，避免舊程式繞過來源保護。
- 若涉及誤扣堂或誤收款，依原紀錄逐筆對帳更正，不用資料庫整體回復覆蓋其他正常營運資料。

## 20:15 補驗及合併核對
- 使用者已指示往後跳過 Cloudflare；未修改任何 GitHub 必要檢查設定。
- dc84db9e 的 Full Vitest baseline、Typecheck、Changed-file ESLint、Targeted tests、music-makeup-postgres 再次全部成功；一般 postgres-integration skipped 不列為通過。
- 最新 main 為 abf071eb877ab4117a12e016ddc90049dcc634ea，GitHub 回報 PR mergeable=true；42 個變更檔案均屬音樂補課／顧客呈現、結帳相容、驗收或修復既有測試。共用顧客元件使用預設 false 的音樂開關，未夾帶零售、蒸足轉單次等支線。
- 瀏覽器取消 cmul63jha0001la04viv9wwo1 成功，名額釋放，選學員重新顯示待補課1堂、原9/28請假及原方案可用1堂。
- 過去時段重新預約遭截止時間規則拒絕，未放寬規則；改用新增單次課 UI 建立9/29 11:00、吳興儒、驗收0928專用教室並成功重排。
- 新補課 cmul7ggog0006i8048znle8pc 為 RESERVED，來源 qa0928-private-book-3；舊补課 CANCELLED，來源保留；原請假仍 STUDENT_LEAVE，本期 remaining=1。
- 整頁重載再展開，確認9/7、9/14、9/21已出席，第4堂9/29待上課；9/28請假不扣堂，9/28請假→9/29已安排補課；本期3200、下期6400／8堂均保留。
- 為補驗暫時再調1000；完成後SQL確認 override 已恢復 NULL。正式站未變更。

### 額外發現（已於下輪修復提示）
測試空課9/28 11:00已開始後，按「恢復原時段」遭既有資料庫鐘點費快照保護拒絕，畫面呈現泛用「系統錯誤」。Vercel runtime log：Cannot change compensation snapshot of a started course。取消與重新安排補課流程已通過，但這個恢復時段邊界不能宣稱通過；發布前應明確處理提示或修正允許的恢復行為，不能關閉鐘點費保護。

## 恢復原時段修正及驗收
程式提交 1a4bafd93dcc765446a4c9a384bfb1ab07e68e22；預覽部署 dpl_4VgZRxCVyHPqqwursSS6ApdUneun READY，瀏覽器版本20:19 staging。
- 已開始課程的鐘點費 snapshot／identity 保護錯誤轉為明確提示：「課程已開始，為保留鐘點費紀錄，無法變更上課時間或老師（包含恢復原時段）。」保留資料庫保護，不允許改寫歷史鐘點費。
- 瀏覽器：測試補課9/29 11:00先調至12:00，新版按恢復原時段成功回11:00，顯示「已恢復原時段」。
- 瀏覽器：9/28 11:00已開始空課按恢復原時段，顯示上述明確提示，原時間保持11:00。
- 自動測試：已有ATTENDED紀錄於寫入前拒絕；未開始恢復成功且不寫鐘點費快照；兩種資料庫保護錯誤均正確轉譯。course-actions共20項通過。已出席情境本輪由自動測試覆蓋，未另改動真實出席資料。
- 此提交Full Vitest baseline、Typecheck、Changed-file ESLint、Targeted tests、music-makeup-postgres全部成功；一般postgres-integration skipped。Cloudflare failure依授權不列阻擋。
- 此修正不需額外migration；未合併正式站、未變更正式資料庫。原五項發布準備已完成，正式執行依上述順序。
