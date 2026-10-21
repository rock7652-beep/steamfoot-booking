# 美業候選SQL與正式發布步驟（待正式執行確認）

整理日2026-10-21；基準 `14848383`。這是可審查的發布方案，**不是正式套用授權或已發布紀錄**。本輪只在新建無外部網路的PostgreSQL17.11容器演練，正式庫與既有美業試用庫均未套用本輪SQL；沒有合併或部署。

## 本輪交付與結果

- 候選：`scripts/sql/beauty-module-candidate.sql`，仍在自動migration目錄之外。SHA256：`d274d8bb0e964129c72a7e6f27f1a58454276c519a691d24419f95b91067aaec`；每次內容變更都須重算並重驗。
- 只讀盤點：`scripts/sql/beauty-module-inspect.sql`，列版本、extension、共用欄位／唯一鍵、角色／繼承、既有美業物件、policy、trigger與約束，不讀顧客或財務資料列，不安裝任何物件。已在隔離庫執行並核對整庫摘要未變。
- 可重跑演練：`BEAUTY_RELEASE_REHEARSAL=1 python scripts/qa/beauty-release-rehearsal.py`，從儲存庫根目錄執行；只接受明確opt-in，不接受DSN、不讀.env。固定本機Docker socket與PG17映像digest，新建有任務標籤的容器，network=none、無公開port或主機bind mount；Docker自建獨立volume保留合成資料，最後停止容器。
- [完整13組通過摘要](evidence/release-rehearsal-20261021/results.json)，run `8145bb9c`。初次工具前置／斷言中斷另存passed:false，不混計整輪成功。相關schema、交易及權限回歸3檔32項與Python語法檢查通過。
- 已修正原SQL會隨search_path把13張美業表建到其他schema的問題；釘選public、在DDL前攔下缺前置、已存在／部分安裝與不合適角色，並設定每次鎖等待5秒、每個statement60秒上限。這些是候選安裝防護，不會自行改店家模組或功能開關。
- `btree_gist`位於public或extensions均驗證成功；原候選在extensions也可安裝，**並非此處缺陷**。新版不搬動extension，保留其schema並固定新應用物件位於public。

初期四輪中斷原因分別是：合成FK故障前置受原有依賴保護、extension原本可用而工具錯誤預期失敗、空白template0遭工具過度限制、以及還原後等價CHECK括號造成過嚴byte比較。均已修正測試方式，原passed:false摘要保留；最後完整13組才記通過。

## 已演練的結果

| 情境 | 實際結果 |
|---|---|
| 缺extension、未指定app_role、superuser、繼承管理者的LOGIN | 在DDL前拒絕；整庫schema／ACL／資料dump摘要不變 |
| 已有未知Beauty物件／部分安裝 | 安全停止，保留原物件與資料，不猜測補完或刪除 |
| 刻意移除共用複合唯一鍵，造成中段FK失敗 | 新增enum值、表與所有DDL均回滾；故障前後整庫摘要一致；破壞前置只發生於新建合成故障庫 |
| 完成policy／GRANT後、COMMIT前注入錯誤 | enum、13表、函式、trigger與ACL全數回滾 |
| COMMIT前真正中止安裝連線 | 完整回滾；重新確認空白狀態後，用原SQL可成功安裝 |
| 成功安裝 | 13表、13RLS與backend policy、3財務不可變trigger、3排他約束符合預期；既有資料／RLS／trigger哨兵不變 |
| 受限後端及瀏覽器角色 | 真正restricted LOGIN可合法寫入；anon、authenticated、service_role與無關LOGIN拒讀；三種財務表UPDATE／DELETE拒絕 |
| 成功且已有帳務後重跑 | 回傳明確已存在錯誤；不新增版本、不刪帳，整庫摘要不變。這是安全拒絕，不是重跑成功 |
| 安裝前／有財務資料後備份 | 分別還原到新空白庫，再安裝或逐項核對；schema／ACL／policy／trigger／資料一致；服務非法值及財務修改仍拒絕 |
| Store遭排他鎖 | 約5秒後因lock timeout停止並回滾，解除鎖後無部分表或enum變更 |

備份比較只正規化pg_dump隨機的psql restrict token，以及Postgres還原時對duration BETWEEN條件產生的一處等價AND括號重寫；不移除實際條件或OR群組。另實測分鐘小於5／大於720、負整理時間、負價格／體驗價均拒絕，未把括號差異當作資料遺失或忽略實際約束。

## 正式發布前須備齊的證據

以下須形成一份具體發布單，再取得正式執行指示；本輪不要求現在開通。

1. **版本與範圍**：固定release commit、候選SQL雜湊、應用artifact、要開通的store ID／slug、操作者、維護時段與預期中斷範圍。不得自動轉換既有SPA／運動／音樂店家；店家欄位及開關的前後值要逐項列明。
2. **正式只讀比對**：以已核准的直接連線執行inspect，對照真正main／course結構與migration歷史、Customer／CourseRoom複合唯一鍵、IndustryModule、extension的版本與schema、既有自訂RLS／trigger。這輪的完整Prisma空白建庫不是正式migration歷史，也未重播完整SPA schema。
3. **角色及連線**：migration操作者與runtime backend必須分開；backend為非owner、非superuser、無BYPASSRLS／CREATEROLE／CREATEDB且不繼承管理角色的LOGIN。實際兩個Prisma client、直接連線／pooler均須查current_user核對，不能只因設定了app_role就推定runtime使用該角色。
4. **備份與回復點**：記錄供應商備份／PITR能力、時間點、保留期限、RPO／RTO、負責人；保護直接連線的pg_dump產物，先還原到真正獨立環境核對。不要把備份或連線秘密放進repository／PR。原生PG17還原不代表Supabase託管PITR、自訂operators或extension權限已驗。
5. **應用準備**：production build、受影響主流程、角色及跨店、實際pooler交易與prepared statement設定、兩個Prisma client及多模組回歸有結果。現有Draft支線的hosted部署／migration守衛必須保留；另行審查發布路徑，不能直接移除守衛當作驗收通過。
6. **店家與LINE**：三端實機、店務習慣與營運簽收；LINE登入、通知送達待核准測試通道及收件人後補驗。申請未完成不能標為已上線或送達。

backend policy目前是限定後端LOGIN的USING(true)／WITH CHECK(true)，用來阻擋Data API／瀏覽器角色；**不是同一backend role內的逐店RLS隔離**。逐店授權仍依既有server guard、店別查詢及複合FK。正式檢查必須保留這個差別；不把RLS開啟當作已證明所有租戶隔離，也不把backend憑證放進前台。

## 建議的正式執行順序（尚未執行）

採一次受控、記錄commit與雜湊的DBA安裝；目前不放入Prisma／Supabase自動migration，亦不自動寫migration history。將來若改用正式migration工具，另經工具產生、審查及完整重演，不將本次候選任意標為已套用。

1. **授權最後關卡**：以上證據、指定店家／時間、程式及SQL版本、備份和停止條件齊全後，由使用者確認「正式套用／部署／啟用」範圍。未確認停在此步；目前仍未獲此授權。
2. **先關閉開通與通知**：維持BEAUTY_MODULE_ENABLED=0、BEAUTY_NOTIFICATIONS_ENABLED=0，避免SQL尚未完成就有預約／帳務或外發；採平台實際可生效的設定／部署方式。記錄既有非美業服務狀態與備份時間點。
3. **DBA同一直接session安裝**：先inspect並比較發布單；確認沒有已存在／部分Beauty物件、extension及複合鍵正確、角色與權限可用。原候選自己帶BEGIN／COMMIT，psql必須ON_ERROR_STOP=1，勿再包--single-transaction或拆散至不同SQL Editor session。設定beauty_migration.app_role只適用此session，不把管理者帳號當runtime角色。
4. **只安裝審定SQL**：不使用db push、reset或自動補授權。5秒鎖逾時或任何錯誤即停止，不在繁忙時無限重試。候選不安裝extension、不建立正式角色、不改舊店家／顧客／CashbookEntry資料；有缺前置另列獨立審查項目。
5. **提交後核對**：保存inspect結果、SQL雜湊與執行狀態。驗13表／13policy／3財務trigger／3排他約束及全部FK、值約束和權限；以實際runtime LOGIN核對合法存取與前台角色拒絕，對照原有模組資料及自訂物件。表數正確不能代替完整結構與權限比對。
6. **先部署關閉狀態的版本**：固定可回退的既有應用artifact，部署經production build與原有migration審核的版本。SQL只執行一次；避免build再執行候選。驗其他模組、公開入口、權限與應用啟動，保留美業／通知關閉。
7. **指定店家小範圍啟用**：只套用已確認store及功能／訂閱授權，不預設方案、不重綁現有身分；建立店家規則與技師授權後，驗三端預約／多人／扣次／收退／拆帳、共用帳本及銀行設定。開BEAUTY_MODULE_ENABLED=1不代表所有店家自動成為美業。
8. **通知最後處理**：LINE未完成繼續停發；完成測試登入、核准收件人及真實送達後，才依另一項明確啟用安排處理全域／店家／排程開關。既有其他店家LINE設定不可挪用。
9. **觀察與交接**：記錄錯誤率、排他／交易重試、拒絕存取、收款及共用帳一對一、扣次餘額／預留與付款／收回淨額；核對非美業功能。由店家簽收，交付可停止開通與回復舊版的負責人及指令。

受控psql命令形式如下，僅為將來DBA已確認直接service設定後使用的範本，本輪沒有執行；REVIEWED_BACKEND_LOGIN必須替換成發布單已核對的角色：

```sh
PGSERVICE=beauty-reviewed-direct psql -X -v ON_ERROR_STOP=1 -c "SET beauty_migration.app_role='REVIEWED_BACKEND_LOGIN'" -f scripts/sql/beauty-module-inspect.sql
PGSERVICE=beauty-reviewed-direct psql -X -v ON_ERROR_STOP=1 -c "SET beauty_migration.app_role='REVIEWED_BACKEND_LOGIN'" -f scripts/sql/beauty-module-candidate.sql
PGSERVICE=beauty-reviewed-direct psql -X -v ON_ERROR_STOP=1 -c "SET beauty_migration.app_role='REVIEWED_BACKEND_LOGIN'" -f scripts/sql/beauty-module-inspect.sql
```

service檔、TLS憑證及密碼存於DBA核准位置；不在命令、文件或PR填正式DSN。migration／pg_dump使用直接連線；不以transaction pooler維持跨statement session設定。

## 失敗回復與重跑決策

| 當下狀態 | 處理 |
|---|---|
| 開始前缺前置或已有不明Beauty物件 | 停止，保留物件；比對原發布紀錄與schema，不DROP／補建猜測 |
| COMMIT前SQL錯誤、逾時或確認斷線且回滾 | 等交易結束，以另一連線對照基準，確認沒有部分物件／ACL變更。原因修好、時段仍獲准後，才能重新執行相同審定檔；若改檔須新hash及重驗 |
| COMMIT附近斷線，結果不確定 | 不依CLI exit code認定未安裝，不立即重跑；查實際13表、完整物件／ACL及原始執行紀錄。全部匹配才視為已提交；有混合狀態停止並調查 |
| 完整成功後又被執行 | 新候選明確拒絕；確認先前commit及schema，不把拒絕改成IF NOT EXISTS繼續 |
| 已提交、未開通店家，應用有問題 | 保持開通與通知關閉，回復既有應用artifact；保留新增enum／表與發布紀錄，修正後向前發布，沒有自動down SQL |
| 已有新預約／收退／扣次／薪酬 | 先停止新操作／通知並保留全部帳本、未完成預約與當下備份；按原收據關聯核對BeautyPayment與CashbookEntry、卡及ledger、月結及FEE／FEE_VOID。不得刪美業表、移除enum值或還原舊備份覆蓋新交易 |
| 需要資料庫災難回復 | 先還原到獨立庫，核對schema／ACL／trigger及指定回復點之後的全部美業與共用交易，再提出具體切換、停機、補帳與資料損失界線；正式PITR／切換另外確認。本輪沒有演練覆寫正式庫 |

不提供可直接刪表的down腳本。停用新模組不等於刪除運動、舊SPA或既有資料；候選交易rollback與已有業務後的營運回復是兩件不同的事。

## 當前限制及參考

PG17.11容器通過可補足原PG16／Sandbox18.6的引擎版本證據，仍未讀取正式schema、實際backend／pooler、自訂extensions／operators、備份PITR與hosted部署封裝（本機production補驗見下）。R04／R05／R06及正式授權不得因此自動結案。

2026-10-21查閱[Supabase changelog](https://supabase.com/changelog.md)、[連線指引](https://supabase.com/docs/guides/database/connecting-to-postgres)、[PG15.19／17.11變更](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)。該版btree_gist重建索引注意事項針對可能含NaN的浮點欄位；美業新排他鍵為text與tstzrange，不能因此替其他既有索引自動REINDEX。正式自訂operators及extension版本仍須依實際盤點確認。

重要下一步：本機production build與美業關閉三端／既有模組回歸已完成，見[補驗證據](production-closed-acceptance.md)。接續只讀比對正式結構／角色／pooler並釐清144項tracing警告與hosted封裝；店家實機與LINE尚待各自前置，不進行正式寫入。
