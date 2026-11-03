# 共用編輯與排序驗證來源

- `results.json`：實際原元件／專案 CSS 的本機瀏覽器測試；server action 與導航為假接點。**不是 hosted 登入、真實儲存或實體裝置驗收。**
- 截圖：顧客編輯 768、人員權限 390、技師服務拆帳 1024、服務排序 768。
- 原運動及 Beauty 同時使用 `customer-overview.tsx`、`CourseCustomerDraftForm`、`staff-editor-fields.tsx`、`useCourseDisplayOrder`；不是額外產品測試頁面。
- SQL／權限：`beauty-display-order.test.ts`、`beauty-customer-profile-database.test.ts` 為實際 PGlite commit／重讀／rollback，權限 transport 模擬。真正 Supabase Preview 管理連線只驗現有表與 rollback 測試、anon/authenticated 讀寫拒絕；未建立分享連結。
- 真正 Preview DB rollback 後核對：`CourseDisplayOrder(storeId=beauty-hosted-20261021,kind=room)` 為 0 筆。
- 自動回歸 64 檔／469 項通過；詳見上層 `shared-editors-and-order-20261022.md`。

最終程式版本 `fe44babb`；`deployment.json` 記錄 READY 的隔離 Preview。最後修正的顧客讀取保護另驗 3 檔／10 項，本機 6 情境再次通過。HTTP 回應是 Vercel Authentication 提示，**不是登入後業務驗收**。
