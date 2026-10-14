# 音教雲匯入重做

入口：音樂課表 → 音教雲資料匯入（`/dashboard/courses/opening-import`）。

舊單步權益上傳 action 已停用；新流程為選檔、唯讀預覽、確認、交易寫入與下載讀回備份。接受 `injiaoyun-migration-draft-v1` JSON，每批最多 100 位學生、500 KB。來源檔不進公開程式庫。

## 本版行為

- 原始與整理後的學生、學費、簽到／請假、排課資料整份保存於不可修改的批次 JSON。核對來源學生、原始姓名與各類紀錄數量。
- 可確認且電話未衝突的學生新增基本資料；其他學生仍封存並顯示待核對。電話唯一限制尚未改成家庭聯絡人模型。
- 來源 ID 與標記決定學生對應，不用姓名、電話或舊 LINE 狀態自動合併／綁定。
- 不產生購課、收款、點名扣堂、預約、薪資或通知。期限與日期保留原文；缺失的餘堂、課程／教師／教室映射仍需獨立核實才能啟用權益。
- 預覽雜湊於交易內重新核對，資料變動須重新預覽。相同內容重送讀回同一批次。提交結果不明時保留固定批次編號，先讀回。
- 批次及基本資料同一 Serializable 交易；讀回不符整筆回滾。來源備份不可更新或刪除，避免撤回基本資料時遺失原文。

## 隔離與驗收

沿用既有精確 branch/repo/Preview/兩條 DB 連線/store-lubymusic 守門。讀寫均須原 wallet、booking 與 customer read/create 權限。營業時間可預覽，但既有寫入時段守門保留。

SQL 位於 `docs/sql/music-source-import-preview.sql`，只手動套既有隔離 Preview，不進 production migration runner。表啟用 RLS、撤銷公開與 client 存取；沒有 client policy 是 server-only 模型的預期狀態。

本機：81 項相关測試、TypeScript、修改檔案 ESLint 通過。其中 6 項 PGlite PostgreSQL adapter 測試涵蓋原子寫入、重送、回滾、過期預覽、範圍／營業時間及 client 存取拒絕；不等同原生 PostgreSQL 多連線併發或實際 UI 業務驗收。

UI 受影響：匯入頁及音樂課表入口。桌機 1366、1440、iPad 1024×768、768×1024、窄容器待部署後驗收。歷史轉為營運權益、舊學生清除與重匯尚待驗證新流程後執行。不得把封存或靜態畫面驗收稱為課程、部分付款、退款等完整移轉驗收。
