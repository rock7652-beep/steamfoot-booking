美業會員原本一次只能選一項主服務；持有 A、B 不同方案時，現在可在同筆預約加選 B，依序安排並各自預留一次。預設同一位技師，需要時才分別安排；各段加做仍單次計費，後台可將應付金額拆成現金、轉帳、信用卡及其他方式混合支付。

預約確認、班表與後台明細顯示分段時間和方案；移除重複說明，保留服務、技師、扣次與金額。沿用現有 group、appointment、Store lock、command 與資料庫排他限制，不新增 schema；段間保留既有整理時間。同步後台操作指南。

驗證：244 項相關測試與全專案型別檢查通過；後續文案／金額顯示修改的 47 項回歸通過；六種模擬尺寸 × 三入口共 18 條隔離元件操作通過。新增 QA 分支 guard 的 21 項測試通過。另補驗僅第二段加做時的應付金額。詳細證據見 docs/verification/beauty-service-journey-20261103.md。

限制：目前為隔離元件與 PGlite／測試替身證據，尚未建立本版 hosted Preview，登入後完整 Prisma 交易、真機及遠端 PostgreSQL 競態未驗；未合併或發布正式站。Preview 計畫見 artifacts/beauty-service-journey-20261103/preview-plan.md。
