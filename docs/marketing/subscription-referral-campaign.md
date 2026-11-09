# 官網店家推薦活動

本次對話已確認活動規則。這是店家訂閱推薦，與現有 Customer.referralCode、顧客積分及人才推薦獨立；不修改既有顧客推薦資料或獎勵。

## 官網與目前狀態

首頁活動主訊息「好用，值得分享。你和朋友，各享 30 天免費使用期」。不區分體驗或正式身份。
目前已實作官網文案、店家推薦碼與專屬連結、申請歸屬、總部收款／退款核對與交易式獎勵套用；不是只有靜態展示。活動預設關閉，入口 disabled 並顯示「活動即將開放」，尚未開放參加。第一版由總部人工核對扣款安排，不自動停止或恢復綠界扣款。

2026-11-05 依本次明確授權，已由 main `236d637d` 成功安裝五張私有表。執行 [41953637299](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41953637299)，[安全結果證據](../../artifacts/subscription-referral-management/private-installation-apply-success.json)。歷史 migration 帳本未修改，五表皆空、RLS 與 API 權限拒絕檢查通過，未變更訂閱期限、扣款、通知或活動旗標。不得重跑安裝。

正式 Vercel runtime 的連線角色、真實登入端到端操作與人工扣款流程仍是活動啟用前門檻；官網合併時維持活動關閉。下方較早的「尚未實作／待安裝」段落屬階段紀錄，以本節與後續實作證據為準。

## 已確認規則

- 帳戶一組推薦碼與專屬連結，轉換方案沿用；朋友可從連結帶入或於首次付款前填碼。
- 新客只能歸屬一位推薦人，首次付款後鎖定歸屬。
- 朋友首次付費正式開通，滿 30 天未退款後，雙方各獲主方案 30 天使用期。
- 接續原期限；已到期帳戶於重新啟用時使用。每位不同有效新客各獎勵一次，可累積。
- 可與年繳送 2 個月併用；不含加購功能、分店費及第三方費用。
- 不接受自我推薦、同一經營者旗下分店、重複帳戶或退款訂單。

## 後續正式串接規格（尚未實作）

- 推薦者穩定帳戶／組織 ID 與公開隨機推薦碼分離。分享參數只用於查找候選推薦者，不作授權或身份證據；伺服器確認有效帳戶與非本人。
- 原始連結、候選碼與最後確認歸屬分開；付款前由申請者確認、付款後鎖定，禁止不同訪問或最後一次點擊默默覆蓋已確認推薦人。
- 伺服器保存推薦者、被推薦帳戶、關係確認時間、首次付費訂單及確實開通時間；使用付款／退款權威紀錄核對資格。
- 一筆關係加兩筆各 30 天獎勵，穩定關係識別＋受獎帳戶作唯一鍵。重送付款 webhook、排程重試與人工重試不得重複贈送。
- 獎勵狀態區分待確認、可使用、已套用及不成立，並保留實際適用期限與操作者／事件來源；套用訂閱與寫入獎勵必須一致完成，不只改前端到期日。
- 已到期者保留獎勵，不自動重開後台權限。月繳帳戶的免費期間必須與金流扣款同步核對，不能只延長系統期限卻照常扣款；此流程驗證前不可啟用獎勵。
- 店家端僅揭露必要的遮罩名稱、推薦狀態、累積與已使用天數，不揭露朋友電話、付款金額或 LINE 身份。總部依既有角色權限查核詳細紀錄。
- 上線前驗證自我推薦、分店重複、無效碼、竄改、退款、重送、多人並發、跨帳戶權限、試用轉正式、到期重新啟用、年繳疊加與月繳停扣；另審資料結構與必要 migration，不從本次文案發布自動執行。


## 已確認第一版：總部核對後發放

使用者已選擇：先記錄推薦與獎勵，由總部核對收款及免費期間的扣款安排後發放。不以綠界自動串接作為第一版前提，也不自動停止或恢復任何扣款。

### 現有程式查核

- Store.plan / planStatus / planEffectiveAt / planExpiresAt / currentSubscriptionId 是現行權益來源；StoreSubscription 記錄訂閱歷史。
- src/server/actions/store-subscription.ts 的編輯訂閱明示不接金流，付款狀態可由總部維護。不能以 updatedAt 或建立訂閱的時間當首次實收、開通或退款查核時間。
- 現有 Customer.referralCode 與推薦積分不可用於這項活動，也不與門店顧客的個人資料或獎勵混用。

### 規則核心（下方另列目前實作狀態）

src/lib/subscription-referral-policy.ts 為無資料庫／無金流副作用的純規則。總部後續在伺服器權限核對後，提供權威證據：推薦關係、雙方帳戶 ID、綁定時間、不同經營者審查、首次實收證據、實際開通時間、退款狀態與本次退款查核時間。

- 付款與開通兩者都成立後，從較晚時間起算完整 30×24 小時；不是付款當天便發獎。
- 身份未核實先待審；本人、同經營者、非首次付費、退款、付款後才綁定或收款帳戶不符，均不產生獎勵。
- 到期時必須核對本次退款狀態，不重用之前的無退款快照。
- 一筆有效推薦產生雙方各 30 天的獎勵意圖與穩定識別；這不是已寫入獎勵。目前已由下方儲存層落實唯一鍵及寫入交易。
- 贈送直接接在原到期日之後，新增 30 個日曆日，保留既有年繳贈送天數。不因推薦重算原主方案金額或 12 期最低承諾。
- 已到期、取消或待啟用帳戶先保留獎勵，不能藉此自動重開。有效試用亦可接續原期限，不要求推薦人先付費。
- 月繳須有符合這次訂閱、完整免費起訖日及總部核對時間的扣款安排確認紀錄；只有勾選「已確認」或只有展延後台日期都不夠。

### 資料表審查稿

候選 DDL：docs/marketing/subscription-referral-schema.sql。刻意放在 docs，沒有加入 Prisma migration 目錄、CI dispatcher 或任何執行入口。

| 新表 | 用途 |
| --- | --- |
| StoreSubscriptionReferralCode | 每店家帳戶一碼，轉方案沿用，不以方案狀態限制領碼 |
| StoreSubscriptionReferral | 一位新客限一位推薦人，保存綁定與不同經營者核對 |
| StoreSubscriptionReferralPayment | 獨立記錄首次實收與開通證據，收款憑證不得重複認列 |
| StoreSubscriptionReferralRefundReview | 每次退款查核分開記錄，保留核對者與依據 |
| StoreSubscriptionReferralReward | 雙方獎勵與套用紀錄，同推薦同受獎帳戶限一筆，固定 30 天 |

所有新表開啟 RLS 並撤回 PUBLIC／anon／authenticated 權限。尚未指定或授權正式 backend 角色。索引涵蓋外鍵與按帳戶／狀態查詢；不改既有表，不建立排程，不批次更新到期日。

此為審查稿，並非可直接正式執行的 migration。表結構只提供基礎完整性，不能取代服務層檢查：收款訂閱是否屬於被推薦帳戶、退款查核是否對應該筆收款、最新狀態、跨店權限與金融紀錄不可竄改，必須在完整交易與授權介面中驗證。目前已實作下述 runtime 寫入路徑；資料表未安裝，仍不可宣稱正式啟用。

### 後續入口及原子操作契約

1. 店家端「我的推薦」：伺服器從登入的店家工作身份決定所屬帳戶，不接受前端任意 storeId；取得或建立專屬碼，重複請求沿用同碼。查詢只傳送遮罩名稱、狀態及獎勵天數。
2. 官網申請：推薦碼只作候選歸屬；伺服器驗證後由申請者確認。保留到試用店家建立，轉正式不換推薦關係。不得讀取 Customer.referralCode 或從 referrer 網址猜介紹人。
3. 總部核對：沿用有效 ADMIN 與 staff.manage 權限；不得讓選店視角冒用 HQ 身份。分開記錄不同經營者、首次收款／開通及退款查核。
4. 建立獎勵：鎖定推薦關係後，重新核對付款、退款、資格；同一交易建立雙方獎勵。衝突時查回已建立的獎勵，不覆蓋或再次加天。
5. 套用獎勵：鎖定獎勵，並沿用既有 subscription:storeId advisory lock；在同一交易重新讀 Store 與 current StoreSubscription、驗證月繳扣款安排、更新兩處期限、StorePlanChange 及獎勵紀錄。成功後才 invalidate／顯示已發放。任何一步失敗全部回復。
6. 已套用獎勵重送須回覆原發放結果；不能再延長。到期／取消的獎勵不自動套用，月繳安排未確認不得標已發放。

### 驗證與目前限制

規則測試覆蓋完整 30 天邊界、付款晚於開通、自我／同經營者／重複付費／退款、付款歸屬、晚綁定、舊退款證據、獎勵穩定識別、跨年日期、台灣午夜、試用與到期狀態，以及月繳證據範圍。
資料表審查稿僅在記憶體 PGlite 中建立合成 Store／StoreSubscription 驗證：重複歸屬、錯碼所屬店、重複獎勵、第三方領獎、部分發放狀態、交易 rollback、RLS 與匿名角色拒絕。不是遠端正式 PostgreSQL、真實多人併發或應用端到端驗收。

尚未執行正式 DDL、開通權限、更新訂閱、外發通知或處理扣款。官網兩個活動入口繼續停用。runtime 儲存／權限、申請表及管理介面已實作並完成隔離測試；正式資料庫相容性、角色授權及真實登入流程仍待驗收。


## 2026-11-04：第一版儲存、申請及總部介面

- 店家入口：`/dashboard/settings/subscription-referrals`（既有店家路由依店家 slug 轉入）。登入工作身份須為 OWNER 且有 staff.view；伺服器決定 storeId。建立專屬碼可重送，沿用同碼；僅顯示自己的碼及獎勵天數，不顯示朋友個資。
- 官網入口：`/pricing/referral`；未登入先登入，已登入按已核實身份進入自己的推薦或總部。僅接受固定 intent，不接受任意跳轉網址。
- 申請入口：`/apply?ref=SB-XXXXXXXX`。帶入候選碼，由本人另外勾選確認。伺服器查驗後保存至 ConsultationLead.originalPayload；不從電話、名稱或 referrer 猜歸屬。活動暫時不可用時保留碼，不能無提示當一般申請送出。推薦資料與含碼網址不傳至舊版外部 Sheet。
- 總部入口：`/hq/dashboard/stores/referrals`。有效 ADMIN、staff.manage 且非店家切換視角方可操作。人工核對申請與實際開通店家後綁定，以原申請時間及不可變原碼判定歸屬。
- 首次收款：僅接受該被推薦帳戶已付款、有正金額的正式訂閱；總部輸入實收憑證、時間、退款查核依據並確認首次付款與不同經營者。證據一旦記錄不覆寫；誤填須另走經審查的更正程序，第一版未提供任意改寫。
- 到期核對：以付款及開通較晚者滿完整 30 天，重新核對退款；同一交易建立雙方各 30 天獎勵。穩定命令 ID、唯一鍵、關係鎖及 subscription advisory lock 保護重送。
- 發放：再次讀取現行訂閱、最新退款查核及預期原到期日；月繳需填本次免費起訖期間的扣款安排核對編號並確認。Store、StoreSubscription、獎勵及 StorePlanChange 稽核同交易更新，失敗全部回復。已發放重送不再次加天。到期、取消及待啟用帳戶保留獎勵。
- 系統不呼叫綠界、不自動停扣／復扣、不外發活動通知；第一版總部須在發放前處理並核對實際扣款安排。

### 預設關閉與正式啟用前提

`SUBSCRIPTION_REFERRALS_ENABLED` 預設關閉。啟用還需 `CONSULTATION_HQ_ENABLED=true`、五張表及所需欄位存在，以及 backend 角色具最小必要讀寫權限；健康檢查失敗仍不提供入口。未開旗標不查詢新表。此任務未變更正式旗標、執行候選 SQL、授權角色或修改正式訂閱。

正式安裝前須唯讀核實既有 Store／StoreSubscription／ConsultationLead 欄位型別、外鍵、權限、RLS 與現有資料；確認新 RESTRICT 外鍵對店家及申請資料刪除／留存流程的影響，再轉為審核過的 migration。不能直接執行 docs 草稿。後續需在隔離環境驗證真實登入、角色、金流人工核對及獎勵發放；記憶體資料庫測試不代表正式 PostgreSQL 多人並發驗收。

### 可重現驗證

`src/__tests__/subscription-referral-*.test.ts` 覆蓋規則、私有表約束、實際 repository 在 PGlite 的完整交易、重送、防竄改、退款／同經營者／晚綁定拒絕、月繳證據、期限衝突與稽核失敗回復；另測 server action 權限、申請保存與對外欄位最小化、旗標及表權限檢查、前端失敗保留欄位與命令 ID。登入 intent 回歸測試在 hq-login-navigation。

介面證據見 `artifacts/subscription-referral-management/README.md`。這些是合成資料的實際呈現元件及攔截本機提交，不是正式登入或真實發獎驗收。


## 正式資料庫安裝前唯讀核對（2026-11-04）

來源版本 `7f087f76`，PR #1514。Supabase 專案 `steamfoot`／`qijlnhtpbintanzpxkvf`，PostgreSQL 17；與既有正式訂閱 runbook 的 ref 一致。Vercel 已核實 `www.steamfoot.com` 綁定 `steamfoot-booking`（prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR）。僅讀 catalog 及計數，未讀取申請人的姓名、電話、付款憑證或店家個別資料；原始結構證據見 `artifacts/subscription-referral-management/production-preflight.json`。

### 已確認

- Store、StoreSubscription、ConsultationLead 主鍵為 text，與候選外鍵相容；originalPayload 為 jsonb，現有建立時間及訂閱日期為 timestamp without time zone，新增付款／核對時間採 timestamptz。既有日期不得擅自轉換型別，沿用共用台灣時間工具。
- StorePlanChange 所需稽核欄位及 PLAN_ACTIVATED enum 已存在，不需為此變更既有 enum。
- 五張 StoreSubscriptionReferral* 表均尚未存在，沒有同名表覆蓋問題。
- 未封存店家的 currentSubscription 跨店歸屬、缺失連結與兩處到期日不一致計數均為 0。此為查詢當時快照，不取代發放交易內重新核對。
- 四張既有表已啟用 RLS。ConsultationLead 原始內容與 legacy provenance 保護 trigger 已存在；不修改它們。
- 新的 ON DELETE RESTRICT 會阻擋刪除已建立推薦紀錄的 Store、StoreSubscription、ConsultationLead；採保留稽核及封存，不得自動 cascade 或刪獎勵來繞過限制。正式留存及必要刪除需另訂審核程序。

### 未核實，不能當成已通過

Vercel 的 production DATABASE_URL／DIRECT_URL 為 sensitive，這次未取回值；環境清單回應亦有截斷，不能用「清單未看到」推定活動旗標狀態。Supabase 管理連線的 postgres 權限不代表 Next.js runtime 的權限。正式 runtime 角色尚待從受保護的部署環境內，以僅回傳 current_user／project ref／權限布林值的方式核實，不能輸出連線字串或密碼。

既有 beauty／addons 專用角色不是通用推薦角色，不得沿用名稱直接授權或擴大它們的業務範圍。既有 RLS policy 亦不能推論新表可讀寫。

### 最小必要權限審查表（規劃，未執行 GRANT）

| 表 | 所需能力 | 限制 |
| --- | --- | --- |
| ReferralCode | SELECT、INSERT | 每帳戶一碼，不需 DELETE |
| Referral | SELECT、INSERT、UPDATE | 歸屬不可覆寫，僅核對欄位更新 |
| ReferralPayment | SELECT、INSERT | 首次付款證據不可任意覆寫 |
| ReferralRefundReview | SELECT、INSERT | 追加核對，不修改過往證據 |
| ReferralReward | SELECT、INSERT、UPDATE | 固定 30 天，完整核發狀態約束 |
| Store | SELECT、UPDATE planExpiresAt／updatedAt；鎖列能力 | 不授予其他業務欄位修改 |
| StoreSubscription | SELECT、UPDATE expiresAt／updatedBy／updatedAt；鎖列能力 | 不改價格、方案或扣款設定 |
| StorePlanChange | SELECT（RETURNING）、INSERT | 不修改或刪除稽核 |
| ConsultationLead | SELECT、SELECT FOR UPDATE 所需 UPDATE 權限 | 程式不更新內容；保留原始內容保護 trigger |

上述不是直接可貼上的 GRANT：PostgreSQL 列鎖、RETURNING、既有 RLS 的 SELECT／UPDATE policy 都必須以實際 runtime 角色驗證。非 owner／非 bypassrls 的角色即使有表權限，無適當 policy 仍不能存取資料；不得用開放 anon／authenticated 或授予 bypassrls 解決。新表維持私有，權限僅給核實的 server role，不新增公開 RPC。

### 安裝方案與停止條件

1. 核實實際 runtime 角色、目前 deployed 旗標與 schema/search_path；在既有隔離環境驗證該角色最小權限、RLS、鎖列及雙連線重送／併發，不寫正式獎勵。
2. 將候選 DDL 轉成符合既有 Prisma migration 發布流程的單一審查版本，固定 checksum，確認 pending migration 清單沒有夾帶其他變更。現階段候選 SQL 仍在 docs，沒有安裝入口。
3. migration、應用部署及活動旗標啟用分開核對。先保持活動關閉，安裝新私有表並驗證結構／約束／匿名拒絕後，才進行實際登入流程驗收。角色不明、缺欄位、RLS 未通過或既有發布 gate 未通過即停止。
4. 月繳人工停扣／復扣安排須有總部可追溯依據；上線不會自動贈送或批次延長既有訂閱。
5. 發生問題先關閉活動入口，保留推薦、付款與稽核紀錄；不 DROP 新表、不回收已承諾的免費天數，也不藉回滾批次改訂閱。

本輪完成唯讀安裝前核對與方案整理；尚未執行正式 DDL／GRANT、修改旗標、部署或發放獎勵。未核實項目不宣稱可正式啟用。


### Runtime 角色核實實際結果（同日後續）

已對 production DATABASE_URL 的精確 Vercel variable ID 執行唯讀查詢：回傳 type=sensitive、target=production、decrypted=false，未提供可解析的連線值。工作區僅有 .env.example，沒有 DATABASE_URL。未索取、輸出或重設任何密碼。

正式 pg_stat_activity 顯示 postgres 與 beauty 專用角色經 Supavisor 連線，但無法將特定連線歸因到官網請求，**不認定其中任何角色就是主程式角色**。因此這一步的角色與實際寫入權限仍未核實；不是資料庫故障，也不是已證實無權限。

已準備 `scripts/subscription-referral-runtime-preflight.mjs`，應由持有正式環境的管理者在該環境內執行：

```sh
node scripts/subscription-referral-runtime-preflight.mjs --read-only
```

程式只讀既有 DATABASE_URL，不載入 dotenv，不接受外部連線參數；目標強制正式 ref，拒絕停用 TLS，連線設定預設唯讀並以 BEGIN READ ONLY／ROLLBACK 查 catalog。只輸出 current_user、session_user、RLS／表權限布林與 policy 數，driver 原始錯誤一律遮蔽。新表缺失回報 present=false，不會嘗試建立。沒有新增 HTTP 診斷端點，沒有為取得秘密另建部署。

本機已驗證錯誤／缺失 URL、錯專案、假主機、停用 TLS 拒絕，以及成功與失敗路徑均 ROLLBACK；node --check、diff 格式通過。這些是無資料庫控制流程驗證，**尚未在正式 runtime 執行**。報告本身也不能取代實際 RLS 列可見性、欄位更新、鎖列與隔離並發驗證。

此步的必要外部條件：現有正式環境的執行入口。僅再次要求助理「下一步」不會讓 Sensitive 變數變得可讀；需由環境管理者執行上方命令，或提供已授權且能沿用既有 secrets 的執行方式。不要在聊天貼 DATABASE_URL 或密碼。取得不含秘密的診斷結果後，才能完成最小權限安裝審查。


### 唯讀診斷已成功（2026-11-04）

使用者明確同意合併 #1518 並執行一次含官方 CA 的唯讀診斷。已核實 merge commit `1f81bb11bdc0e41e30ab6fc706c0a626b1ca3a76`，成功執行 https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41936237193 。TLS 憑證鏈與主機驗證保留；沿用既有固定指紋的 Supabase 官方 Root CA，沒有關閉 rejectUnauthorized。

- 正式 project ref 正確，verified_tls=true，transaction_read_only=on。
- GitHub Production 環境的既有 DATABASE_URL 實際登入角色與 session_role 均為 postgres。
- Store、StoreSubscription、StorePlanChange、ConsultationLead 已存在且 RLS 開啟；本次角色為 owner／bypassrls，catalog 所列 SELECT／INSERT／UPDATE 權限均存在，未新增授權。
- 推薦五表仍未建立；這不是已安裝表缺權限，而是 present=false。
- 只查系統 catalog，未寫入資料、套用獎勵、安裝表、變更秘密、處理扣款或外發通知。
- 這次證明 GitHub 既有受保護連線可用；不能把它當成 Vercel DATABASE_URL 同值／同角色的證明，亦不代表 RLS 列可見性、實際更新或多人並發已驗收。

安全結果保存於 `artifacts/subscription-referral-management/runtime-preflight-success.json`。前面「需管理者自行執行命令」的外部執行限制已由核准的 Actions 流程解決；Vercel 主連線一致性、正式資料表安裝及活動啟用仍是不同步驟，本次沒有一併執行。


## 2026-11-05：正式安裝審查包完成，尚未安裝

唯一安裝審查入口：`scripts/sql/subscription-referral-release-review/README.md`；manifest 固定候選 SQL SHA256、migration 名稱、五表、API 拒絕角色與 preflight／postflight 稿。

唯讀核對發現本機 161 筆與正式已完成 138 筆帳本存在名稱差異：24 筆本機未記錄、1 筆正式名稱不在本機，未解決 failed 為 0。這不證明 DDL 未曾以其他方式套用。沒有因此執行 resolve 或補套歷史 migration。新 staging 工具只把本次一筆放入全新暫存 schema，沒有接入原 migration dispatcher、push hook 或正式 workflow。

候選 SQL 另明確撤回 service_role 權限；即使它有 BYPASSRLS 或平台有預設表授權，推薦私有表仍不讓 Data API 角色讀寫。沒有擴大既有 postgres、beauty、addons 或其他角色權限。

已於官方 PostgreSQL 17 拋棄式容器完成真實 Prisma deploy、安裝前／後檢查、保留既有合成資料與歷史、重複 deploy、三種 API 角色拒絕、兩連線實際 repository 重送、月繳證據／稽核失敗 rollback 與中途 DDL 衝突回復。容器無網路、無發布埠，只用臨時 Unix socket；結束後已清除容器及暫存資料。證據 `artifacts/subscription-referral-management/installation-rehearsal.json`。

此為候選包與隔離驗證，正式資料庫未安裝。Vercel 主連線角色、安裝用 DIRECT_URL 的安全目標／TLS 核對、完整正式 schema／trigger 相容性與後續實際登入驗收未被上述合成測試取代。正式安裝、合併與活動啟用仍需按精確範圍核准，不因完成審查包而自動執行。
