# 銀百合課表取得交易連線逾時（2026-11-10）

使用者要求修復正式日誌中的銀百合課表交易逾時並驗收、提供截圖。支線 `fix/silverlily-calendar-transaction-timeout-20261110` 基於已正式發布的 `6deee9e7`，獨立於已合併 PR #1531；本文件不表示修正版已發布。

## 定位

原正式部署 `dpl_7KcpZ8nP3shgDdE26DdTEmuoRV2j` 在台灣時間 17:59:47 已有 `/s/silverlily/admin/dashboard/courses/calendar-sync` 的 `Unable to start a transaction in the given time`；新部署 `dpl_6WLJ4Zch7MXLHTA3KHxRsnCudc2J` 18:14:58 同樣出現。`schedule-options` 亦有同型錯誤。

精確請求 `m68zh-1794305691054-4dbbc728e963` 的 `production_readiness` span 2280.4 ms 失敗，尚未進入 month_scope；不是已取得交易後的 5 秒執行逾時。`sports-series.actor` 與 `sports-staging.actor` 各有一個未指定 options 的 interactive transaction。正式 client 的 serverless 預設 connection_limit=1，普通查詢 pool_timeout=10 秒，Prisma 6.19 interactive acquisition 預設只有 2 秒；短暫併行讀取可使 catalog preflight 提早失敗。

[Prisma v6 交易文件](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions) 區分 maxWait 與 timeout；[Supabase 連線池文件](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits) 區分 application-side pool 與 DB backend connections。正式庫唯讀離散觀察為 11 idle、1 active、2 extension，沒有 lock waiter；max_connections=60，health advisors 無 notice。這不是連續峰值監控，不能推論從未發生全域壓力。

## 修正邊界

只在這兩個 catalog preflight transaction 使用固定、凍結的 `{maxWait:10000, timeout:5000}`；普通池預設等待 10 秒與 preflight acquisition 對齊，仍保留原 5 秒執行上限。沒有重試業務交易、調高連線數、修改 DB 設定、停用 readiness、快取權限或跳過 schema／ledger／RLS／role fingerprint。原 store lock、金額／堂數／固定課展開與 request-key 規則保留。

隔離預覽只增加本支線、既有 `prj_Aq5uK16Dc49OAUPJnP5VtnVAEdTs`／`ttworfzgwejdeolegkxl` 受限 role 與 `addons-qa-fitness` 的精確組合。拒絕 production、正式庫／店家、其他模組及啟用通知；沿用原包裝 helper，新增此分支的自動部署停用列以避免 production-linked Preview 重複建置。這不是正式資格白名單。

## 本機驗證

`scripts/qa/silverlily-transaction-contention.mjs` 使用真正 generated Prisma 6.19 client，連至 127.0.0.1 的記憶體 PGlite PostgreSQL wire server；只有 SELECT、BEGIN、COMMIT，無正式連線或資料表。額外測試工具僅安裝 `/tmp`，不變更專案 dependencies／lockfile。PGlite 為單 backend 相容實作，不代表 Supavisor、正式網路或正式並發效能。

三次交替各先讓同 client 唯一連線被持有 3200 ms：舊版 2002–2003 ms 全部 P2028、callback 未執行；新版 3203–3204 ms 全部成功。持有 11200 ms 時，新版在 10002 ms P2028 且 callback 未執行；pool_timeout 與 maxWait 同時到期時亦可能為 P2024，驗收接受這兩種明確未取得連線的失敗。執行超過原 5000 ms 仍 P2028，不擴大交易執行期限。完整結果見同目錄 local-contention.json。

單元／路由回歸另核對取得期限傳至兩個 action、原 production-only gate、權限與 catalog 失敗時不進入月份同步、無自動重試、排課選項不洩漏計酬，以及原 audit context、store lock、URL pool 與預覽隔離。最終 CI、Preview SHA／ID 與登入後畫面證據維護於本次 PR；Preview 的 production-only catalog gate 不冒稱正式 readiness 已執行。正式修復需依明確發布授權完成後，才另外核對正式來源與課表。
