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

實際部署版本 `5db2b76116eb3ad148398414a709dec5621661b2`，部署 `dpl_AKqcBGPciqK6Zift2LDRFT29bxu4` 已 READY。CI 41971134972 的 Targeted tests、ESLint、Typecheck、Full Vitest baseline 全部成功。真實登入、申請、綁定、收款／退款核對、雙方30天、月繳阻擋及相同 Server Action 重送已通過；兩個 Store 與 current StoreSubscription 期限一致，僅兩筆發獎稽核。390／768／1024／1366 px 真實店家／HQ頁面與登出切換均通過，無水平溢出。完整證據與限制見 [驗收紀錄](../../artifacts/subscription-referral-acceptance/README.md)。

正式活動與正式旗標保持關閉，正式站未發布。測試版啟用旗標只屬於上述專案 Preview target。

## QA 打包限制

Vercel 首次部署即使請求 Preview 也可能被平台指派為 production；已取消該次部署，改用官方 API 的 staging target，仍要求 VERCEL_ENV=preview。沒有向正式官網專案部署或配置正式環境憑證。

完整 Next build 成功後，首個 staging 部署因 Proxy 函式 256.62 MB 超過250 MB失敗。Next16 Turbopack 的 Proxy trace 仍包含既有排除規則指定的 docs／artifacts／scripts/qa。專用 QA build command 加上 scripts/prune-referral-qa-trace.mjs --prune，只從此 QA 的 middleware NFT 排除這三種非執行目錄，保留其他執行依賴、引擎、憑證與未知路徑；剩餘超過230 MiB即停止，不提高Vercel方案或修改既有發布／權限gate。正式build command不變。

只調整 NFT 清單後，Vercel 最終封裝仍回報相同大小。補強為在專用 Vercel `/vercel/pathN` 建置副本中，完成 build 且精確 QA gate 通過後，把三個非執行目錄封存到建置根目錄以外的臨時備份；不更改 Git 來源或本機開發目錄。單元測試確認原始內容可在備份讀取、執行程式與憑證仍保留。最終部署結果另記，不以本機大小推估取代。

再次檢查平台封裝來源後，QA 打包也會校驗三份 Prisma datasource 均為 PostgreSQL，只封存 Prisma runtime 中 CockroachDB／MySQL／SQLite／SQL Server 的 WASM base64 引擎。保留 PostgreSQL WASM、原生 Linux 引擎、執行程式與憑證；一併清理所有 NFT 中這些已知非執行依賴的參照，防止 instrumentation／其他 trace 合併時再次加入。不變更資料庫 provider 或執行期引擎設定。

透過 withGitRepoInfo 取得完整部署錯誤後，確認第三次失敗已不是大小上限，而是 Vercel 仍會 lstat 原非PostgreSQL引擎路徑造成 ENOENT。修正為封存原始檔後，在原位留下明確拒絕非PostgreSQL引擎的輕量程式，滿足平台路徑檢查；不替換PostgreSQL或原生引擎，不宣稱其他資料庫在此QA可用。

第四次平台完整錯誤為 lstat artifacts/README.md 缺失。最終策略不再移動文件／驗收／QA腳本原件：全部保留原路徑，只從 trace 清單排除它們，並備份／縮減已驗證未使用的非PostgreSQL引擎。測試確認 docs、artifacts、scripts/qa、程式及PostgreSQL引擎都留在原位。前述移出review目錄策略已被此修正取代，不應使用。


## 實際登入驗證發現與修正

- 既有店家登入會導向 `/s/:slug/admin/...`。QA 白名單 rewrite 原先清除了 store slug，導致權限層以「店舖路由資訊無效」拒絕；已由已驗證的三個測試店路徑重新注入 `x-store-slug`，保留原 `x-next-pathname` 與後端店家授權。不能接受客戶端任意 slug。
- 綁定申請使用 `SELECT FOR UPDATE`，PostgreSQL 需至少一欄 UPDATE privilege。僅為專用 QA role 增加 ConsultationLead.updatedAt 的欄位權限，原 payload／歸屬欄位仍不可更新，既有僅合成申請的 RLS 不變。已在 preview 套用 `referral_qa_lead_row_lock_privilege`；正式庫未修改。
- 真實 Prisma `$queryRawUnsafe` 不能反序列化 PostgreSQL advisory lock 的 void 回傳（P2010）；原 PGlite adapter 不會呈現此限制。保留鎖定，只將回傳轉 text。已用無網路 PostgreSQL 17 容器與實際 Prisma client 重現舊查詢失敗、修正查詢成功，並在既有 repository 測試 adapter 加入 void 型別邊界，舊查詢負向控制確實失敗，修正後相關42項通過。詳見驗收目錄的 prisma-lock-regression.json。
- 已於初次 READY 版本實際登入合成 HQ 並填送推薦申請表，推薦碼自動帶入、確認預設未勾選、回應200／NOT_SENT_PREVIEW，僅保存測試庫，未送外部通知。最終部署的完整交易與 RWD 結果另列於驗收證據。


## 交付案例狀態

真實發獎驗證後，已只重置 A→B 合成案例：清除該測試關係與其獎勵／付款／查核列，恢復兩店及 current subscription 的精確初始期限。保留原始申請、體驗申請、推薦碼與原發獎稽核，另追加兩筆明確 QA 恢復稽核。唯讀確認滿30天申請再次待綁定、當前獎勵0筆、原發獎稽核2筆、恢復稽核2筆。未修改其他店或正式資料。工具第一次重置確認逾時，唯讀確認完全未執行後依工具指示重試成功，沒有跳過確認或改用其他身份。

最後瀏覽器驗證正常店家 slug 登入、實際剪貼簿的絕對測試連結及 HQ 預備案例可從綁定開始。頁面先完成 hydration 再點擊複製；早期自動化在 SSR 已顯示、hydration 未完成時點擊沒有產生狀態，不能當作有效互動測試。


## 2026-11-05 操作簡化（使用者最新決策）

總部改為「確認店家 → 確認收款 → 一次發放雙方各30天」。每筆紀錄先顯示狀態、雙方將增加的期限；收款紀錄確認後預設收合，不再顯示內部店家／訂閱ID。月繳扣款安排只問需要核對的店家，試用與年繳不顯示此欄位。測試入口同步縮成三步，其他帳號與申請表測試收在次要區塊。

一次發放是單一資料庫交易，後端重新核對固定雙方、退款、到期日及月繳證據；任一方失敗均不加天數。雙方已發放的重送直接回覆完成，不重複展延；舊版已發一方的紀錄只補另一方。原有個別發放服務仍供相容性與回歸測試，不再作為新版介面的操作入口。正式活動保持關閉，不操作真實扣款或通知。
