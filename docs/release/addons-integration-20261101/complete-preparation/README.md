# 附加項目集中驗收與正式合併準備總表

本文件是本次工作的單一入口；細部規則沿用既有文件，不另創產品規則。狀態：本機準備完成，隔離雲端驗收／正式遷移／合併／發布尚未執行。使用者已接受 QA 介面，不重新設計或要求重複逐項確認。

## 固定版本與現況

- 主線基準 ec4638a0fc85ea4aa9d4263b2333a42c53901d8b；2026-11-01 這輪 git ls-remote 仍相符。上傳前仍需再檢查一次。
- 接受的舊 QA：0284825d12cb2dbbfc94e6f469221e4aeb1a0198；現有 QA 網址不能代驗新的整合版。
- 本機整合分支 integration/addons-20261101；最終提交與 SQL checksum 見本批外部交付包 receipt.json／sql-manifest.json。
- 上輪唯讀查核：正式別名指向 dbc8844a32f04b3e8913f652c126f328ffaf80cd 的 READY Production；正式主庫缺七表／七欄，無相應 add_on／shared_goods migration。正式與主線 SHA 不同是已知事實，不直接 promote 舊 QA。
- 本輪沒有讀正式顧客／款項明細、拉取密碼、改正式設定、啟用通知、公開上傳、建置或部署。Docker daemon 存取受限，聯合演練使用一次性 PGlite 合成 schema，不稱為完整正式 Postgres 複本。

## 有限的完成門檻

| 門檻 | 目前證據 | 通過條件／責任人 |
|---|---|---|
| A 本機整合 | 主線衝突已處理，介面已接受，本機單元／SQL／授權檢查 | 助理固定最終 SHA，型別／lint／相關回歸通過 |
| B 隔離環境資料庫演練 | 本機聯合 SQL 可重跑；雲端尚未執行 | 助理先證實隔離目標／角色／通知封鎖，再套用審查 SQL、核對 schema／權限／帳本及失敗回復 |
| C 同一整合版本完整操作驗收 | 本機合成畫面與案例；新版 QA 尚未發布 | 助理在一次必要 QA 建置上完成 acceptance.csv 的所有雲端案例，留存版本、操作與結果 |
| D 具備正式合併條件 | 尚未通過 B／C | A/B/C 通過、無 P0/P1、主線無未解衝突、migration history 與 schema 發布順序審查完成，正式操作有明確核准 |
| E 正式可用 | 尚未發布 | 先 schema／必要角色設定，再固定 SHA 發布；功能關閉下驗證實際 runtime、舊功能 smoke 與跨店拒絕，之後只對核准試點開啟 |

**合併與正式可用分開。** 不把「目前正式 Function 還沒執行新版診斷」當成開始隔離 QA 的前置條件，也不為單純診斷先多做一次正式部署。runtime helper 要在同一個受保護後端呼叫路徑取得證據，維持無公共任意 SQL 入口；現有 CLI／管理角色查詢不是 Function runtime 證據。若整合版本尚無受保護的執行入口，必須連同該輪最小發布內容一起完成並驗其授權，不能假稱部署後一定可執行。

## 隔離環境操作包

1. 唯讀固定目標 project／host／database、應用 current_user、部署 SHA 與 client 版本。明確排除正式 qijlnhtpbintanzpxkvf；既有 QA ttworfzgwejdeolegkxl 仍需核對實際連線與對應門市，不能僅憑 preview 網址判定安全。不得複用正式 secret 或匯入真實個資。
2. 保留通知停發。記錄目前 schema、migration history、grant／policy、trigger 與合成帳本前值；取得該隔離環境可回復點。只建立驗收所需合成 A/B 店及 OWNER／受權 STAFF／無權 STAFF／顧客，不動既有真實門市。
3. 依 sql-manifest.json 的審查順序在已核實環境演練。明確設定審查 marker、expected_database 與受限 backend role；marker 只是防誤用，不替代 project／host 核對。
4. 套用後核對七表、七欄、RLS／最小 grant／FK／unique／immutable trigger、開關預設 false、既有 revision／金額不變；重跑核對及負面案例；實際 app role 做跨店拒絕測試。
5. 集中完成所有來源修改、型別與程式檢查，再建立必要的一次 QA 預覽。紀錄 build source SHA＝驗收 SHA；沿用同一部署驗完，不為重看畫面重建。
6. 完成 acceptance.csv 全項目。任何未驗／失敗保留原狀態與原因，不能只以單元測試代填雲端 PASS。
7. 清理本輪合成資料並核對未影響原資料；如曾建立臨時驗收連結，驗完立即撤銷。沒有建立就記「不適用」。

SQL 詳細保護見 [候選修正說明](../../../../scripts/sql/addons-release-review/README.md)；runtime 檢查界線見 [執行證據說明](../RUNTIME-EVIDENCE.md)。本批不修改已存在的 Prisma migration checksum，不偽造 applied 紀錄。舊 activation SQL 含無範圍權限回填，不能讓後續 migrate deploy 再執行它；正式落地前須以實際 history 定義審查後的執行／記帳方式。shared core 已含 ownership，演練也重跑獨立 ownership 檔確認相容；正式遷移不應重複記帳或拿重跑成功代替 drift 檢查。

## 權限與金流核對

- 職員初始化只接受同一連線的臨時核准名單，核對 storeId／staffId／ACTIVE，保留既有拒絕；空名單不變更。新功能不能由 plans.edit 全站自動開通。
- 現有正式 Beauty 四表的 RESTRICTIVE scope 限制模組為 BEAUTY，不是單店 predicate。候選 backend USING(true) 也不是租戶隔離證據；必須用實際 API 身分實測店別拒絕，不任意移除 restrictive policy 或新增放權。
- 作品圖片 GET 原設計公開；驗的是管理／上傳／掛圖不能越店，不把公開作品讀取誤判為應拒絕的私人相片。
- 方案本金、堂數／點數、舊預約總額與款項不可改寫；新增附加品項以獨立快照與追加收退款驗證。停用／移除與 HQ 關閉只阻止新增，不破壞歷史與原權限收退款。

## 失敗與回復

| 時點 | 動作 | 禁止 |
|---|---|---|
| 隔離 DDL 尚未提交 | ROLLBACK，記錄出錯檔及 checksum，修正後重做受影響段 | 不跳過失敗項或放寬角色繼續 |
| 部分 additive SQL 已提交 | 對照已套用狀態向前修正；驗收環境若要重置只用其核實回復點 | 不因某檔 BEGIN 而誤稱整個八檔序列原子性 |
| 正式 schema 已提交、功能未開 | 保留新增表欄位，功能關閉，核對相容舊程式與新 client | 不 DROP／DOWN 或盲目回退到不理解新快照的版本 |
| 試點已建立訂單 | 停新增選購，保留歷史顯示與相容 backend 的收退款，向前修正 | 不刪帳、修改舊款、整庫恢復或擅自真實退款 |

## 建置、費用與授權一次說清楚

- 最小新增建置預期：隔離 QA 一次；驗收成功後正式發布一次。這是成功路徑目標，不保證失敗修正永遠不需要重建。
- 本機 CI 定義顯示 PR 到 main 會觸發檢查；Vercel Git 自動 Preview 與正式部署觸發仍須在上傳前唯讀核實。若 Git 已觸發且版本正確就沿用，不再手動重建。
- 沿用既有隔離 DB 是否足夠、是否須新建付費分支，先確認；不預先建立新專案／分支。費用依 Vercel 建置時間與配額、資料庫計算／儲存而定，未取得報價前無法可靠估算；不改預算、不停正式系統。
- 此次授權是「準備完整」，不是公開 push、新增雲端建置或正式 DDL 的授權。依專案 AGENTS「Skill 不增加 push、合併、部署、正式資料寫入或外發權限」，實際外部操作需以這份具體範圍一次核准；不再逐小步重問。

本輪準備交付後，下一個集中執行單位是 **B＋C：隔離環境遷移與同版本 QA 全流程驗收**；其結果決定 D，不再增加沒有結案條件的診斷輪次。
