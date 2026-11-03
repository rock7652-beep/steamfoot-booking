# 美業候選版本、測試環境與發布準備

2026-10-21。只準備與隔離驗證；沒有遠端合併、push、正式 SQL／角色／環境設定變更或部署。正式已啟用：**未核定、沒有本輪啟用證據**。本文件取代舊進度中「專用 URL 尚未實作」「main 尚停在 7980aa90」等敘述；歷史測試只對各自當輪版本有效。

## 第 3 包：可交付的候選環境

- 最新取得的 main：`5aebaa69e305caee08e8392de920b46d0599a161`，已在本地隔離美業支線整合，merge commit `de48a3a5`。衝突保留 Beauty QA 隔離、YoungSky preview 限制，以及設定儲存計時；未放寬任何 hosted 部署限制。
- production standalone 封裝、四套 Prisma runtime、靜態資源與 trace 檢查使用固定隔離資料庫；**這是本機 production runtime，並非 Vercel hosted 證據**。最後 build ID／來源檔 hash／結果以同目錄證據為準。
- 準備獨立本地 worktree `/workspace/steamfoot-beauty-release`，支線 `release/beauty-candidate-20261021`，從最新 main 重建並只帶入產品、單元測試、必要建置守衛及候選 SQL；不繼承美業支線中的正式 schema／角色／hosting metadata 提交歷史。未推送；沒有新的遠端部署入口。
- 原臨時 Sandbox 不是本次候選封裝，不把舊網址、開發 runtime 或已到期入口當作穩定測試站。下一個實際環境應使用獨立 HTTPS 網域與獨立測試資料庫；店長、技師、顧客帳密僅在該環境建立，測試密碼依使用者要求為 `staging1234`，正式帳號另管。

### 環境契約（僅名稱，不附任何 Secret 值）

| 設定／依賴 | 候選要求 | 尚須取得的實連證據 |
|---|---|---|
| `DATABASE_URL` | 保留共用登入／人員／設定／報表的主連線；不因美業切換整站角色 | 真正 app `current_user`、共用權限與主連線來源；不能用管理工具 postgres 代替 |
| `DIRECT_URL` | 管理／migration 的受控連線與 runtime 分開管理；不能把管理憑證填進 Beauty runtime | 目標與實際執行者，DBA 安裝權限及稽核 |
| `BEAUTY_DATABASE_MODE=dedicated`、`BEAUTY_DATABASE_URL` | 同一個 database、另一個受限 `steamfoot_beauty_*` 角色；遠端 TLS；缺設定直接拒絕，無主連線 fallback | 真 pooler 身分、session／transaction 模式、TLS、超時與交易回滾；URL 相同 database 名稱不能證明實際同一個庫 |
| `AUTH_URL`、`NEXTAUTH_URL`、`AUTH_SECRET`、`AUTH_TRUST_HOST` | 正式核定的獨立 HTTPS origin／callback；專屬測試 Secret | 三端 cookie、重導向、重新登入／撤權與店別正確 |
| `BEAUTY_MODULE_ENABLED` | 初始 `0`，驗證關閉頁／action 與原模組，再於獨立測試環境切 `1` | hosted 同一版本開／關三端、功能授權與 subscription |
| `BEAUTY_NOTIFICATIONS_ENABLED` | 保持 `0`，測試店通知設定也保持關閉 | dedicated 目前會拒絕通知 `1`；必須另做通知 worker 連線與最小權限，不能直接翻開關 |
| LINE／LIFF／`CRON_SECRET` | LINE 完成申請後使用明確的測試 Provider／channel／收件人；通知排程獨立驗證 | 真人 OAuth、店別返回、體驗一次、worker 拒絕越權、實際送達及防重送 |
| QA／Preview 變數 | 本機 `BEAUTY_RELEASE_QA`、loopback URL 與暫時 origin 不搬到 hosted | 現有 dedicated URL parser 拒絕任意 Preview；先核定獨立環境與來源再制定專屬守衛，不改成任意 Preview 放行 |

### hosted 驗收順序與停損

1. 設定目標環境與憑證來源，記錄版本 hash，先做無寫入的連線／TLS／角色核對；缺一項就停止，不自動用主角色補救。
2. DBA 依第 4 包核對 schema／RLS／trigger 與備份，安裝後以 runtime 角色核對 ACL。供應商 DDL event trigger 及 pooler 行為仍須在目標環境驗，不能引用本機重播充當完成。
3. 在封裝環境驗四 Prisma client、靜態資源、登入、關閉閘門與其他模組，再開獨立合成店，跑多人預約、方案扣次、現金、跨月與技師付款／收回。留下 deployment ID／build ID／角色摘要／對帳結果；只看到 hosted build 成功不算交易驗收。
4. 做連續登入與有限併發、健康監看／錯誤紀錄及重啟演練，再提供三端固定網址供店家實機簽收。正式網址與正式開關另行核定。

## 第 4 包：版本與 SQL 發布順序

`7980aa90..5aebaa69` 的 main 差異未新增／修改 main、course、beauty schema 或 migration；本輪不因此重跑／resolve 正式 migration。Beauty 仍採獨立候選 SQL，不在自動 migration 目錄，也不用 `db push`。最小權限 SQL 沒有因現金抽屜共用讀取依賴而擴權。

1. **固定版本**：本地乾淨候選、產品來源 hash、鎖檔、兩份候選 SQL hash；若 main 再前進，重新評估差異後才更新，不默默換版本。
2. **只讀前置**：主／course migration 歷史與實際結構逐項對應、`btree_gist` schema／版本、複合唯一鍵、13 Beauty 表是否存在、共用 RLS、`course_space_disable` INVOKER trigger、實際主角色與專用角色模型。既有 history 缺紀錄不代表可直接補跑 DDL。
3. **備份簽收**：記錄備份時間、目標、操作者、保留期間、可還原點與 RPO／RTO；在另一個隔離庫還原並核對四模組及帳本。既有本機 dump／restore 演練不能代替正式備份／PITR 實證。
4. **安裝承接角色先核定**：`beauty-module-candidate.sql` 目前要求一個已核定、可登入且無管理／owner 繼承的 backend role；不能填 postgres／service_role。`beauty-data-role-candidate.sql` 則在 schema 存在後建立全新的 NOLOGIN 最小角色。**這兩份不是可不帶角色計畫直接串接執行的通用安裝器。** 建議由 DBA 明定隔離的受限安裝承接角色，schema 完成後建立最小角色，再封存承接角色；若目標環境沒有合適角色，先改版候選安裝器並隔離重驗，不能改既有主角色來湊前置。
5. **候選安裝**：逐檔使用 `ON_ERROR_STOP` 與各自 transaction／timeout。先 schema，再最小資料角色；新角色先維持 NOLOGIN，核對 13 Beauty＋10 共用依賴／52 policies，確認無 DELETE、DDL、身份表與通知權限。schema 安裝承接角色的 `beauty_backend` policies／grants 不得遺留為額外 runtime 通道；封存方式及權限差異須在目標隔離環境再驗。
6. **啟用連線**：受控設定最小角色登入憑證與真正 pooler endpoint，驗證兩個 app pool 同庫、不同角色，維持主連線原值；開關先關閉，再做 hosted smoke。不得把候選自帶 NOLOGIN 誤寫成已能登入。
7. **有限啟用**：指定店別、模組安裝／訂閱／功能授權核對；LINE 仍關閉。所有環境、LINE 與店家結果齊備後，提供具體發布包再取得正式執行指示。

### 失敗處置

| 時點／失敗 | 處置 |
|---|---|
| 前置不符或首次安裝失敗 | 停止；保留錯誤與 SQL hash，確認 transaction 已回滾。不靠 IF NOT EXISTS 掩蓋部分結構，不刪舊表或資料 |
| 已安裝後重跑 | 候選刻意拒絕；先 inspect 比對，不直接 drop／重建 |
| Secret、TLS、pooler／角色不符 | 保持總開關與通知關閉；修正專用設定，不把 Beauty 指回主連線逃過拒絕 |
| 已有預約、方案或收款後出錯 | 停止美業新操作，保留所有收據／扣次／結算版本；用最後一版能辨識 BEAUTY 的封裝提供關閉頁。舊 main 不一定認得 BEAUTY enum，不能當成已驗證回退版本 |
| 需資料恢復 | 先還原至隔離庫，列出恢復點後四模組可能遺失的交易，再由操作者決定；不直接對共用正式庫做會回退其他店帳務的 PITR，不以刪帳、改原收據或更換店別模組回復 |

## 剩餘收斂方式

可整理為 **3 類驗收工作，外加最後正式發布確認**，不是宣稱已完成正式發布準備：

- **環境實連**：真 pooler／角色／TLS、安裝承接角色與最小權限收斂、正式備份／還原證據、hosted 封裝與開關回歸、穩定測試網址／監看。第 3、4 包已形成可審查方案；以上實際執行與證據仍待完成。
- **LINE**：申請與通道，真人登入／體驗／綁定及返回；獨立通知 worker 連線與授權，實際送達／重試／防重送。OAuth placeholder 是另一條身份流程，不能拿「人工合併拒絕」測試代驗。
- **店家簽收**：三端實體手機／iPad／Safari、實際店務習慣、資料量與性能；同時確認第一版不提供美業顧客合併，資料更正保留。代理通過不代店家簽字。

重要下一步：取得並核定獨立測試環境與真 pooler 的安全憑證綁定方式，先做唯讀角色／TLS 實連與安裝角色方案核對，再執行 hosted 開／關驗收；LINE 持續等申請，正式套用仍另行確認。
