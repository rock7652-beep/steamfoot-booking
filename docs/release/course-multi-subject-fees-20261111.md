# 多科目通用收費正式發布記錄

2026-11-11 使用者明確同意：建立 PR、必要資料庫遷移與正式發布。實作與驗證見 artifacts/course-multi-subject-fees-20261111；舊文中的未授權／未發布為當時快照，本記錄維護本次發布進度。

- 原始本機 commit ab291437，標頭 cd36fb7f。接入 main f03390c7（PR1543）後為8601c078，標頭634f3b31，無衝突。保留最新方案格子、同電話學員摘要與共卡呈現。
- 只在此 feature branch 阻擋自動部署與 migration dispatcher，延續 repo 現有 review branch 模式；main 的人工 Vercel 發布設定保留，正式通知狀態不變。
- 上線目標：Supabase steamfoot / qijlnhtpbintanzpxkvf，ACTIVE_HEALTHY、PostgreSQL17.6；Vercel steamfoot-booking / prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR，team_IAPnhzLHM4x540wiXg3lTyS9。
- 只執行 supabase/migrations/20261111050549_course_multi_subject_entitlements.sql，SHA256 8e6a4871b02290aa17cefa1e3da6ed2de244e07510b3fc47f74f3d4bdc7f709b。新增3個sportsSubjectIds陣列欄位與3個CHECK，不轉卡、不調帳、不改RLS／ACL。
- 初次正式唯讀盤點：82方案、26卡、25訂單、383預約、57額度分錄，卡片remaining合計256；訂單points372／price109200。卡片模式ASSIGNED13／LEGACY5／OPEN8。三表既有RLS啟用、無PUBLIC／anon／authenticated表權限，尚無新欄位與遷移。正式執行前會再取權威快照，避免以較舊盤點當成即時基準。
- 尚未正式遷移／合併／發布；PR、CI、資料比對與部署驗收於完成後更新。
