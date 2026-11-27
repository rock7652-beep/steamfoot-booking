# Phase 2：隔離測試店知識管理

沿用 PR #1596 與既有數位管家入口，僅允許四個 AI 合成店、plans.edit、獨立 AI 權益及精確 Preview 環境。正式站、通路整合與業務寫入仍未開放。

## 操作與資料

店家介紹、最多六題 FAQ、最多二十個禁止關鍵詞，以及三個引用開關組成一份草稿；總內容限制 3,200 UTF-8 bytes。儲存不改變已發布內容。發布複製手動內容與引用開關，不複製營運資料；撤下保留草稿。每次操作使用 revision 比對，並在私有資料列鎖內更新；重送舊版本不能重複發布或覆蓋他人修改。失敗保留本機草稿，重新載入須確認捨棄。

私有 AiButlerKnowledgeDocument 僅在隔離資料庫安裝；RLS 與 SELECT/INSERT/UPDATE 僅給既有測試角色及四個 fixture storeId。沒有瀏覽器資料庫存取、商業資料寫入授權或自動 Production migration。

## 權威引用

- 模組讀取 getStoreIndustryModule；課程細分沿用 readCourseBusinessProfile，不接受測試表單傳入模組覆蓋。
- 今天營業時間以台灣日期、既有 readServiceHoursState 與 serviceDayRule／resolvedCourseHours 計算，包含特殊營業日。只說明營業時間，不推算可預約名額。
- 蒸足讀取 active 且 publicVisible 的 ServicePlan；美業服務讀取 active BeautyService；課程讀取 active、PUBLIC 的 CourseTemplate。
- 方案價格只讀取可公開購買的 ServicePlan、BeautyPlan、CoursePointPlan 的定價；不提供優惠計算、個人權益、技師成本或即時交易報價。
- 每類最多六項、單筆回覆最多 800 字；超出或缺少來源不截斷事實，發布明示阻擋，測試轉真人。源資料一律按 storeId 查詢。

每次測試重讀已發布內容與原營運設定。來源 ID 包含內容 hash，快照 fingerprint 包含發布版本、禁止事項、模組與實際引用內容。模型回覆之後再次讀取；撤下、發布、來源／模組異動或讀取失敗時，舊答案轉真人並正常結算已發生的 API 費用，不把已知費用留成 UNKNOWN。五分鐘有效期仍受既有服務篩選。

禁止關鍵詞採 NFKC、大小寫與空白正規化的字面包含比對，不是語意禁語服務。命中時不呼叫模型，保留事件去重與持久接手；基本受保護請求仍由固定防線及分類器限制。恢復對話不會解除全域停止或店家開關。

## 驗收範圍

既有合成情境測試保留；新增已發布知識測試可輸入最多 400 字的合成問題，Mock 完整問題比對或明確選擇計費 OpenAI。不可輸入真實顧客資料。全域停止優先，真實外發封鎖不變。

必要案例：草稿／發布分離、更新與撤下、版本衝突保留、權限與店家隔離、私有資料 RLS、原價格即時異動、特殊營業日、禁止詞零模型呼叫、晚到回覆抑制及桌機／iPad／窄容器。執行證據以本輪 acceptance 紀錄為準；本文件不是部署或實體裝置驗收聲明。
