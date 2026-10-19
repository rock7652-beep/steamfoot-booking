# PR #1359 隔離資料庫演練

日期：2026-10-19；候選提交 `7d4ea42cb77991e5fc0d19013bf5cd914df8a52c`。

**結果：51 項真實 PostgreSQL 檢查、19 組實際查詢結果交由原程式 verifier 驗證，以及 100 項程式回歸測試均通過。未發現本次演練範圍內的阻擋問題。**

## 隔離範圍

- 全新 `sports-pr1359-rehearsal-20261019` PostgreSQL 16.15 容器（postgres:16-alpine），network=none、無 port mapping、無主機或既有測試站資料目錄掛載；僅自身匿名資料 volume。
- 直接執行 PR 的原始 SQL 候選，沒有改寫 SQL。SHA-256：`a3ac4e02943e3391c674e76e5a73c7f1c3edca728b914f1563e335918c1b7ff0`。
- 僅建立合成 Store、音樂系列及帳本哨兵，未下載或複製正式資料；未讀取正式連線密碼。
- 原始碼及 PR 不變；沒有合併、部署或更動線上旗標。正式站及音樂測試站均未連線或修改。

## 實際資料庫驗證

1. 未指定應用角色、瀏覽器角色、NOLOGIN 角色、瀏覽器可繼承角色：候選拒絕，整筆 DDL 回退，新表不存在。
2. 正確後端 LOGIN：候選成功，新表為空；重跑候選拒絕且不覆寫既有資料。
3. 實際以 `sports_app` 登入：確認非 owner、非 superuser、無 BYPASSRLS；可 SELECT/INSERT/UPDATE，不能 DELETE/TRUNCATE/ALTER。
4. anon/authenticated/service_role：實際 SET ROLE 後 SELECT/UPDATE 都被拒絕；非授權 LOGIN readiness 拒絕。
5. 唯一 request、時長、頻率、學員 JSON、Store 外鍵：實際違規寫入均拒絕。
6. 實際 runtime search_path 下 readiness 通過；缺表時拒絕。
7. 分別改動 RLS、default、constraint、policy、瀏覽器授權、應用授權及唯一鍵：readiness 均拒絕。各項異動 transaction ROLLBACK 後恢復通過。
8. 模擬停止系列的交易回退：untilDate 保持空值；受控寫入停止日期後仍保留原系列與歷史欄位，readiness 通過。
9. 合成音樂系列與帳本前後 checksum 一致，沒有建立 Preview 表。

19 組資料庫 readiness 實際結果另交由 PR 原有 `verifySportsPermanentReadiness()` 執行，接受／拒絕結果皆符合預期；不是自行重新實作應用判斷。

## 應用保護及回退驗證

原 PR 12 個測試檔、100 項測試重新通過，涵蓋正式 opt-in／白名單、錯誤環境拒絕、SQL identifier 固定、跨店讀取限制、暫停新增而保留既有表路由、部署／migration 拒絕、固定課、調課撞課、出席更正、缺課釋放、取消與補課相關回歸。

`SPORTS_PERMANENT_CREATION_PAUSED=1` 的程式保護由原測試驗證，不在任何線上環境設定。有資料後的回退採「暫停新增、保留新版核心與歷史、前向修復」，不切回舊核心、不關閉總旗標、不刪表。資料庫部分驗證停止日期交易回退及保留資料；這不等於完整網站停課／扣還點流程的真實 DB 端對端演練。

## 證據與重現

- `results.json`：51 項 SQL 檢查與候選雜湊。
- `sql-transcript.json`：實際 SQL、連線角色、stdout/stderr/exit code；全部為本機合成資料。
- `readiness-observations.json`、`verifier-results.json`：實際查詢與原程式 verifier 結果。
- `application-tests.log`：100 項程式測試結果。
- `rehearse.py`：SQL 演練 harness；須使用全新、無網路、無對外埠的同名 PostgreSQL 容器執行，不能指向既有容器。
- `verify-observations.mjs`：將實際 SQL 結果交由原 verifier 驗證。
- `readiness.sql`：從 PR 匯出的原始唯讀 SQL。

## 證據邊界與後續

這次證明候選能在 PostgreSQL 16 安裝、非 owner 後端角色能依 RLS 使用新表，以及拒絕／回退保護按預期運作。它不是正式應用角色權限證明，也不是正式 Supabase 完整 schema 副本或瀏覽器交易端對端驗收。既有帳本／規則 readiness、真正應用連線、正式店家白名單與網站流程，仍須在未來明確授權的正式安裝與啟用步驟驗證。

不需要為本次結果追加備份查證或更改密碼。下一步是以本證據重新審查 PR #1359，決定是否准予合併；本次沒有執行合併。
