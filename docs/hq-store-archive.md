# HQ 店舖清單封存

- `Store.archivedAt` 只代表 HQ 清單封存，與營運／方案狀態、存取權限無關。
- HQ 店舖管理預設隱藏，`?archived=1` 顯示全部並提供還原。
- HQ 切店選單隱藏封存店；直接網址與既有帳號、測試腳本仍可使用。
- `getAccessibleStores` 授權集合保留完整，只有 `getStoreOptions` 套用清單篩選。
- 每次封存／還原要求 ADMIN 與 staff.manage，timestamp 更新與 AuditLog 同一 transaction。預設店舖不可封存。
- 預覽環境 branch preflight 要求 DATABASE_URL / DIRECT_URL 都指向隔離資料庫。

2026-10-03 使用者授權封存 14 間預覽站驗收店；保留 staging、hsinchu、taichung、zhubei、demo、lubymusic。資料保留：1161 筆顧客，12732 筆課程預約。初次封存留下 ARCHIVE 操作紀錄。

正式資料庫尚未修改，正式合併前先套用 nullable `archivedAt` 欄位 migration。此 PR 不包含自動封存正式門市的資料 migration。
