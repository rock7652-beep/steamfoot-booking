# 推薦功能隔離測試

依使用者「好，請準備」授權建立可操作的推薦測試版，不合併／發布正式站、不啟用正式活動。

## 固定隔離範圍

- Vercel 專案：`steamfoot-referral-qa-20261105` / `prj_09HrzKOJ4Iu5LKouVry9VeXiC8LJ`，Preview；保留 Deployment Protection。
- 來源：既有 PR #1514 分支 `content/marketing-beauty-addons-20261104`，使用實際 Git 來源資訊，不偽造正式 main metadata。
- 資料庫：既有 preview project `ttworfzgwejdeolegkxl`。專用 LOGIN role `steamfoot_referral_qa_20261105`，NOINHERIT、非 superuser、無 BYPASSRLS，沒有 postgres 角色成員資格。
- 三間新合成店：`referral-qa-20261105-a`（體驗推薦人）、`-b`（首次付費滿35天）、`-c`（新朋友）。不修改其他既有測試店、正式資料或既有角色／policy。
- 五張推薦私有表在 preview 新建，沿用已審核 canonical SQL。額外權限僅給專用角色，RLS 限這三店；Store 與 StoreSubscription 只授權獎勵需要的期限／更新欄位，沒有其他訂閱編輯權。
- 憑證只存在專用 Preview 的 encrypted env 與暫存私密檔；不提交資料庫密碼、登入密碼、AUTH_SECRET 或分享 token。

## 操作與限制

入口 `/referral-test` 列出帳號、步驟、實際測試到期日。密碼另交付，不放公開頁面。切換角色先登出，再用原有密碼登入表單。

測試版沿用實際店家／HQ推薦頁面、原有 session／permission 與 server actions，只替換測試導覽外框。白名單外路徑、cron、webhook 及其他店路徑封鎖；現有 production 與其他 Preview gate 不放寬。

推薦人可查看碼、複製測試站內連結；不將合成推薦碼導往正式官網。申請表保留既有 Preview 限制：須用 HQ 測試帳號，店名前綴 `【HQ測試】推薦驗收`，資料標記 NOT_SENT_PREVIEW，不送 Sheet、LINE、Email 或金流。

新申請保存後仍需原有人工體驗申請關聯，不依相似店名自動綁定。已預備的滿30天案例有明確的合成體驗申請關聯，可從綁定、查核到雙方各30天發放完整操作。不更改正式30天規則、不更改系統時間。朋友B為月繳，需填本次免費期間的扣款安排核對編號；這是合成證據，不會真的停止或恢復扣款。

原始 seed：[subscription-referral-qa-fixture.sql](../../scripts/sql/subscription-referral-qa-fixture.sql)，執行前需用新生成的 bcrypt hash／payload hash 替換 placeholder。角色／店ID已存在即拒絕，不可盲目重跑或刪除重置。初始安裝先前兩次因缺少既有 constraint 所需的關聯欄位／hash格式而交易回復，補齊後成功；未放寬或停用約束。

## 驗證狀態

專用邊界與推薦／登入相關83項測試通過；ESLint通過。託管 build、完整TypeScript及實際登入／發獎／重送與手機、iPad驗收結果待部署後補充。不將已建資料表或靜態元件測試視為完整流程通過。

正式活動與正式旗標保持關閉，正式站未發布。測試版啟用旗標只屬於上述專案 Preview target。
