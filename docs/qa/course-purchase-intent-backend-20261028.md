# 課程購買意圖後端（尚未開啟）

新增課程購買 PREPARED、COMMITTED、CANCELLED 意圖；提交及取消均取得既有課程門市鎖，提交與 COMMITTED 在同一交易完成。取消未出現的 key 也建立墓碑，避免註冊或提交晚到；COMMITTED 且尚未經授權確認仍佔用同學員唯一未結欄位。收到明確確認後才設置 acknowledgedAt，讓下一筆購買進行。

服務端以經 zod 正規化的完整購買資料計算 `v1`、domain-separated HMAC-SHA256，使用既有 AUTH_SECRET／NEXTAUTH_SECRET；不持久化原始付款資料。缺少密鑰時準備與提交失敗；密鑰輪替後舊待處理意圖不可用新資料提交，仍可依 requestKey 安全取消；已提交意圖可核對／確認。密鑰不出現在狀態回應。此設計不回溯清除既有音樂 tuition 指紋資料。

狀態與待確認查詢重核 `wallet.create`、`transaction.create`、`customer.read`、門市及顧客可見範圍，不要求額外 `transaction.read`，只回應狀態、原 key、交易 ID。新增或取消須用寫入授權與訂閱檢查；折扣／贈堂及期課另核對相應權限。查無 key 並不代表原請求已安全失敗。

`COURSE_PURCHASE_INTENTS_ENABLED=1` 才會強制新意圖；預設關閉。開啟後沒有意圖的舊購買客戶端會在交易前被拒；但已在舊版服務上執行的請求不會自動獲得保護。必須先完成所有入口與版本的驗收、停止新購買及排空舊版和在途請求，再決定是否啟用；禁止隱性 fallback 繞過。旗標不保護美業獨立收款，該模組需另行驗證。

migration 由本機 Prisma `migrate dev --create-only` 依現行 `prisma/migrations` 慣例產生，另加狀態約束、未結部分唯一索引、三個外鍵和 RLS；未對遠端資料庫執行。回退不可直接刪表或清除墓碑：須先停止新請求、排空舊部署與所有在途請求、逐筆安全核對／取消或確認未結意圖；旗標切換、保留期間與其他系統依賴須先核查，再安排回退。正常情況保留表與歷史記錄。

本機真實 PostgreSQL 的隔離 schema 測試涵蓋取消先鎖、提交先鎖、晚到 prepare 與 checkout、不同 key 同學員競爭、同 key 重送、未確認 COMMITTED 阻擋、ack 重試及競爭、密鑰輪替與缺失、部分唯一及 RLS，以及六次依序確認的購買。相同 key 併發測試調用實際 `assignCourseWithCheckout`，但 Prisma model adapter、計酬與通知為測試替身，不能視為真實帳簿流水或 Preview 端到端驗收。測試 URL 必須由 `COURSE_INTENT_TEST_DATABASE_URL` 明確指定本機 loopback、資料庫名稱以 `_test` 結尾；測試只建立並刪除唯一測試 schema 與測試角色。

實際環境尚需驗證不同角色及店家、真實購買與營運帳簿、完整 UI、重整、斷線、遲到請求、舊版升級與通知；跨裝置無法觀察尚未抵達伺服器的註冊請求，客戶端不得把查無當作可以重新收款。此文件不表示已正式上線或可開啟旗標。
