# PR #1276 正式上線準備

狀態：上線步驟已盤點，尚未授權正式資料庫寫入、正式環境變數或合併。
驗證版本：879e616e11d8ff80268fb5f513a190cd588be1ac；隔離 Vercel READY；完整回歸9,132通過，TypeScript、修改檔ESLint與diff check通過。Cloudflare依使用者2026-10-10指示跳過，不記為成功。

## 資料更新
- 正式目標必須核對既有正式專案 qijlnhtpbintanzpxkvf；隔離測試專案 ttworfzgwejdeolegkxl 不得混用。
- 正式 SQL 尚待包裝；docs/sql/booking-participants-draft.sql 與 booking-participants-walk-in-upgrade.sql 都是隔離審查材料，不能當正式 migration 直接執行。
- 空白正式 schema 應一次新增群組、參與者、索引、同店外鍵、身份／整組交易／本人堂數 guards、RLS與瀏覽器撤權；不拆歷史預約、不拆款、不猜同行身份。
- draft 已有 walletSessionId 與 wallet guard，upgrade 另加外鍵及重建 guard；直接順序執行會重複建立 trigger。正式單一 SQL 必須合併並確認本人堂數外鍵。
- 正式 migration 須採明確目標與schema前置狀態檢查、單次交易、鎖逾時／執行逾時、完成後schema驗證；不得順便部署其他 pending migrations。
- 更新前確認備份可用。檢查Booking／Transaction規模及新唯一索引鎖定時間，安排適當時段。
- 建置流程目前僅有隔離 readiness，正式開啟前須加入等效只讀schema檢查；一般建置不可偷偷新增表或執行fixture。

## 功能開啟
1. 先完成正式 migration 與等效空白schema PostgreSQL驗證。
2. 先部署相容程式，BOOKING_PARTICIPANTS_ENABLED保持關閉。
3. 正式資料庫核對兩表、欄位、外鍵、唯一索引、五個有效trigger、函式撤權、RLS、anon/authenticated無表存取。
4. 取得正式部署／開啟授權後，只在正式server環境設定BOOKING_PARTICIPANTS_ENABLED=true；不得使用NEXT_PUBLIC變數。
5. 正式部署完成後再確認實際功能；既有合成預覽紀錄不複製到正式庫。
目前只有全域開關，沒有店家白名單，不能宣稱可僅開一店。

## 暫停與回復
目前false會同時停止逐人actions、面板與分析讀取；已有逐人資料後不可把false當安全回復，也不可退回不認得逐人資料的舊版。
正式開啟前須拆出「停止新預約初始化／臨時加人」與「既有逐人資料讀取／處理」兩種控制，保留帳務及分析正確。
新增表／已收款資料不可因功能暫停刪除；回復採相容程式版本及保留schema。不能移除資料庫guard讓舊整組收款繞過逐人紀錄。

## 本輪範圍與尚待完成
已驗：FIRST_TRIAL原約加人最多4個歷史位置、本人卡扣1堂、同行獨立499收費、剩餘堂數退款、主要分析與來源到店率。
未開：原PACKAGE_SESSION／補課整組自動拆分、共卡／跨店卡；四模組全入口、所有報表與iPadOS真機未完整驗收。
正式就緒仍需：正式單一migration、schema readiness、分離暫停開關及相應測試。完成前不申請正式合併。
