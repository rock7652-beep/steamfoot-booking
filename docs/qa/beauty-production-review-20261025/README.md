# 美業正式升級審查包

狀態：**可審查，不能執行或部署**。本包不在自動 migration 目錄。兩份 DDL 參考檔開頭均以 unconditional exception 阻止直接執行；不得只移除該行便當作正式 installer。

## 包內檔案

| 檔案 | 內容 |
| --- | --- |
| `00-preflight.readonly.sql` | 既有唯讀 metadata 核對，不讀顧客個資 |
| `01-model.reference.sql` | 從本機最新版 Beauty Prisma datamodel 產生，完整 14 表與模型索引；包括本輪六欄與體驗時長等既有補充欄位 |
| `02-integrity.reference.sql` | 基礎候選的跨店外鍵、時間／價格約束、技師／位置／顧客排斥、體驗限制、同行者共享卡 guard、財務不可變 trigger；補充第 14 表保護；全部啟用 RLS，撤除公開／瀏覽器角色權限，不建立放寬 policy |
| `permissions-review.md` | 現行程式查詢與舊角色候選缺口，下一輪正式權限包必須逐項驗證 |
| `manifest.json` | 基準提交、來源 SHA256、SQL SHA256、14 表 scalar 欄位清單與驗證限制 |

`01` 是模型 DDL，**不包含完整安裝前置、IndustryModule enum 升級、角色建立／policy、共用通知約束更新、共用表依賴或正式店設定**。`02` 不是可單獨執行的 migration，也不替代這些前置。各檔案不可直接串接上正式庫。

沒有複製 Preview installer 的 postgres 身分例外、繞過角色或啟用舊 SPA。產生 SQL 使用 Prisma 的 from-empty 與本機 datamodel，沒有提供 database URL 或連線資料庫。

## 本機驗證與限制

- 模型與產生 SQL 的 14 表 scalar 欄位集合逐表完全一致；六欄全部包含，無舊表欄位 DROP 或資料回填。
- 來源與 SQL 檔案的 SHA256 已寫入 manifest；後續若程式或模型改動，必須重新比對。
- 完整性規則取自現有候選並與模型組合審查，**沒有在 PostgreSQL 執行**；沒有完成空庫首次安裝、鎖影響或角色權限回歸驗證。本環境未提供本機 Postgres server，不能以文字檢查冒充執行成功。
- 不是備份：本包沒有正式顧客、方案或交易資料。

## 正式發布仍須完成

1. 明確核對正式目標 project、Store ID、HQ 綁定；不把隔離店當正式店、不新增重複店。
2. 完成單一、受限的 LOGIN runtime 角色方案；若保留 NOLOGIN 資料角色，須明確決定繼承／切換方式及驗證，不能假設程式會自動 SET ROLE。
3. 形成經審查的單一安裝流程：前置 metadata guard → enum／基礎結構及完整性 → 共用依賴的精確增量 → 最小權限 → postflight。遇到部分安裝或 drift 停止，不重試覆蓋。
4. 在獨立可還原環境執行首次安裝與真實帳本／共享功能驗證；既有隔離庫不可刪表重建來充當空庫。
5. 核對**正式庫**成功備份時間與還原方式。隔離庫 10/25 01:06:17（台灣）的備份不適用正式庫。資料庫備份不涵蓋 Storage 物件本體；整庫還原會影響其他模組交易。
6. 列出新角色與環境秘密的安全配置流程，不將密碼、DSN 或 share token 放入 Git。LINE／外部通知仍關閉。
7. 正式操作前提出精確變更包與部署授權。回退優先關閉新入口／編輯並保留新資料；不得回到忽略既有收費快照限制的程式，也不 DROP Beauty 欄位或恢復 SPA。

## 現金驗收的獨立待辦

**後續已完成**：使用者明確授權補關並指定 1,000 元，已透過 UI 驗證補關／開店、折扣現金收退各 900、重送不重複與今日閉店差額零。詳見 [現金驗收](../../beauty/cash-acceptance-20261025.md)。以下保留授權前限制的歷史記錄。

僅限 `steamfoot-preview` 的 `beauty-hosted-20261021`。已查到 2026-10-21 抽屜 OPEN；沒有授權金額，不猜測現金。先確認補關實際金額與既有抽屜變更授權，再由 UI 補關、開今日抽屜，建立有標記的現金收款／折扣／退款，確認抽屜、BeautyPayment、CashbookEntry 金額一致與重送不重複，保留全部記錄。

本輪未補關、未執行 CASH 交易、未啟用新 QA 帳號。前輪 QA 帳號仍停用，臨時分享連結已撤銷。
