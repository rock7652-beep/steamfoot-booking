# 多科目通用收費正式發布記錄

2026-11-11 使用者明確同意：建立 PR、必要資料庫遷移與正式發布。實作與驗證見 artifacts/course-multi-subject-fees-20261111；舊文中的未授權／未發布為當時快照，本記錄維護本次發布進度。

- 原始本機 commit ab291437，標頭 cd36fb7f。接入 main f03390c7（PR1543）後為8601c078，標頭634f3b31，無衝突。保留最新方案格子、同電話學員摘要與共卡呈現。
- 只在此 feature branch 阻擋自動部署與 migration dispatcher，延續 repo 現有 review branch 模式；main 的人工 Vercel 發布設定保留，正式通知狀態不變。
- 上線目標：Supabase steamfoot / qijlnhtpbintanzpxkvf，ACTIVE_HEALTHY、PostgreSQL17.6；Vercel steamfoot-booking / prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR，team_IAPnhzLHM4x540wiXg3lTyS9。
- 只執行 supabase/migrations/20261111050549_course_multi_subject_entitlements.sql，SHA256 8e6a4871b02290aa17cefa1e3da6ed2de244e07510b3fc47f74f3d4bdc7f709b。新增3個sportsSubjectIds陣列欄位與3個CHECK，不轉卡、不調帳、不改RLS／ACL。
- 初次正式唯讀盤點：82方案、26卡、25訂單、383預約、57額度分錄，卡片remaining合計256；訂單points372／price109200。卡片模式ASSIGNED13／LEGACY5／OPEN8。三表既有RLS啟用、無PUBLIC／anon／authenticated表權限，尚無新欄位與遷移。正式執行前會再取權威快照，避免以較舊盤點當成即時基準。
- 尚未正式遷移／合併／發布；PR、CI、資料比對與部署驗收於完成後更新。

## 已確認的既有建置阻擋

- 先前 main f03390c7 的 Vercel建置 dpl_6pPKtFocyx72k5yZhRw5x5uJK2o6 在部署輸出時失敗：_middleware 250.08MB，超過250MB限制。不是本PR產生的正式建置。原 trace 250,990,376 bytes，其中驗收截圖51,055,822 bytes；原後處理只刪NFT條目，平台後續仍會重新追蹤實體來源。
- 在既有嚴格 production/main/project/build-sandbox gate 內，新增將 artifacts 下的驗收圖片逐一驗證SHA256並封存於建置根目錄外，再移出該短暫建置工作區。Git裡的證據保留；public圖片、docs、JSON證據、QA腳本、憑證與執行程式不移動。沒有提高平台限制、變更執行權限或部署設定來繞過拒絕。

## PR／CI進度

- PR1544： https://github.com/rock7652-beep/steamfoot-booking/pull/1544 ，首輪head66ba31a8。Typecheck、ESLint、Targeted、Mixed enrollment、Music makeup通過。Shared-card中的fee-save測試本身通過，但原驗收閘仍要求6案例，現已增加3案例，故更新為9個全數通過且無skip，沒有降低驗收標準。
- 封裝修正與範圍回歸29測試通過；接入最新main的119關聯測試通過，TypeScript再次通過。
- 自動核准審查拒絕完整正式資料快照與後續數量／額度／雜湊讀取，理由為發布授權未涵蓋敏感商務資料的輸出。已停止該資料操作並提出最小範圍的額外授權，不以其他通道繞過。正式資料庫尚未更新。
