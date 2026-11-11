# 課程單一學員首次登入免店長核准

## 決策與範圍

本對話使用者確認保留多人集中查看的原核對方式，但指出一般顧客首次登入原本不需店長確認，並明確要求執行修正。以正式 main `c4443133bf1998b4293868ca0284a078d8dc1d36` 為基底，另建 `fix/course-single-first-login-20261111`，不混入同科目扣堂的 PR1538。

## 結果

- 課程 LIFF 仍先輸入電話。只有一位、沒有其他帳號關聯的既有學員，回傳與新電話相同的 `needs_name`，不回傳學員姓名、不建立待店長核准申請。顧客補填正確學員姓名後沿用原學員完成首次登入。
- 首次啟用要求已驗證且符合本店 audience／Provider 的 LINE token、同店唯一有效電話名單、姓名與個人電話相符、沒有現有 User／Google／其他 LINE／綁定碼或 scoped identity，並再次檢查全域手機帳號與 Provider link。新 LINE 帳號不接管既有登入身分。
- 純 contactPhone 學員及同電話多人不套用單人認領；後端查詢同時納入 `phone` 和有效 `contactPhone`，避免只看唯一個人電話而漏掉孩子。多人集中查看、既有帳號衝突與店長授權不改。
- 在 Store row lock 與 Serializable 交易中條件式更新原學員，新增必要 User／Account／CustomerIdentityLink 與稽核。原學員 ID、姓名、電話、方案、預約及扣堂來源不重建。失敗整筆回滾；獨立 Provider 不改 legacy lineUserId。
- 前台補姓名提示改為「填寫學員姓名，確認本店資料。」不把既有學員顯示成重新登記；沒有新增頁面或欄位。後台操作指南同步單人／多人分流。

## 驗證

- 13 檔相關回歸 234 項通過，包含電話 lookup、首次 activation、既有登入／恢復、LIFF exchange／體驗入口、多人授權、方案格與共用電話 schema 權限測試。
- 額外 `course-single-first-login.pg.test.ts` 在明確 loopback `_test` PostgreSQL 的隨機 schema 執行，6 項通過：中央／獨立 Provider 沿用原學員、同電話多人與姓名不符不認領、兩個 LINE 併發只成功一個、稽核失敗時 User／Account／link／顧客更新全部回滾。只 mock 呼叫前已驗 token 的身分邊界，業務交易與資料讀寫使用真 PostgreSQL。結束後清除測試 schema。
- 完整 TypeScript 使用單次 6GiB heap 通過；首次以 Node 預設 heap 執行遇記憶體上限，沒有記成通過。變更 TS／TSX／瀏覽器腳本 ESLint 與 `git diff --check` 通過。
- `scripts/qa/course-single-first-login-browser.mjs` 使用實際 OnboardingForm 及 CSS、合成 SDK／actions，所有網路封鎖。在390／440／768寬度各驗單人及多人共6情境：初次只填手機；單人補姓名不帶入 LINE 暱稱、成功重新驗 session 後導回；多人仍呈現核對碼；無水平溢出或 pageerror。
- UI 輸出 `/tmp/course-single-first-login-ui/`。腳本初版的 router stub 每次 render 換參考及電話 label 包含輔助文字造成測試等待失敗，已修正測試器，最後6情境全通過；不把這些合成截圖稱為真人 LINE 或 hosted server action 驗收。

## CI 測試隔離

初次 mixed-enrollment CI 在兩個測試檔同時建立 public.OperationAuditOutbox 時遇 PostgreSQL 23505，29項未執行，沒有記成通過。沿用PR1538已準備的 `--no-file-parallelism` 修正，只串行初始化兩個測試檔，保留檔內併發情境及原40項無略過斷言；另加獨立步驟執行本次6項登入PG測試。本機依相同順序共46項通過。未停用失敗檢查、刪除斷言或合入PR1538的扣堂程式。

## 發布邊界

沒有資料結構 migration、沒有寫入正式顧客／授權／方案／帳本，沒有更動通知停發設定。只對本修正分支設定 Vercel Git 自動部署=false，保留 main 和其他分支原設定，避免建立草稿 PR 時自動產生未核對資料庫的部署。

目前成果為可審閱修正及本機驗證。正式合併／部署與真人 LINE 驗收尚未執行，不宣稱正式顧客現在已可使用本修正。
