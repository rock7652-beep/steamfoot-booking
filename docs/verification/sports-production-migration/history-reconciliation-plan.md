# 22 項 migration 紀錄差異處理方案

基準為 2026-10-18 09:54 的正式唯讀快照與 main@c0fa70ba。這份文件是逐項處理方案，**不是已修復紀錄或允許重跑的清單**。本 PR 不改寫 Prisma／Supabase migration history、不執行 resolve／repair、不回填資料。

## 判定流程

1. 以原始 migration SHA-256 固定比對版本，查 Prisma 成功／失敗／回退紀錄與 Supabase version／name；同名僅作線索，不能證明 SQL 相同。
2. 唯讀比較完整作用範圍：欄位型別、預設、nullable、indexes、constraints、FK、RLS／ACL、函式／trigger，若含 DML，另核對預期資料結果。不可只憑表存在或 migration 名稱判定等價。
3. 已由其他核准 migration 完整實現者，建立逐物件等價／後繼證據，另提 history-only 修復 PR；若被後繼限制取代，要證明現行能力仍保留，不重跑早期 SQL。修復 history 也需另行授權，禁止直接插入／刪除 migration 紀錄。
4. 部分實現或定義不符者另提最小向前修正並演練；未實現但不屬此次運動修正者排入獨立工作，不隨這筆 migration 補跑。
5. 每一項處理結論包含原檔 hash、來源核准證據、實際 schema／資料比對、審查者與執行範圍；未核實維持 PLAN_ONLY_NOT_RECONCILED。所有 22 項都不在此次單筆 SQL 的執行授權範圍。

## 逐項計畫

| Prisma migration | 核對物件 | 現有線索（未代表等價） | 處理方案 |
| --- | --- | --- | --- |
| `20260923150000_trial_booking_source_analytics` | bookingSource 欄位與統計索引 | 20260923120840 / trial_booking_source_analytics_20260923 | 比對 varchar(16)、nullable 與索引；不回填歷史來源。 |
| `20260924090000_course_monthly_settlement` | 月結三表與 course_capture_compensation 函式 | 20260924123440 / course_monthly_settlement | 比對表、FK、RLS／ACL 與目前函式完整定義；不得以舊版函式覆蓋後續音樂計酬。 |
| `20260924143000_course_staff_availability_v1` | 教師固定／例外可授課時段兩表 | 尚無直接同名對應 | 查兩表、複合 FK、CHECK 與 unique index；缺漏另提增量修正，不混入本筆。 |
| `20260924160000_course_personal_income` | CourseSettlementSetting.personalIncomeEnabled | 20260925011831 / course_personal_income | 比對 boolean、NOT NULL、default=false，不更改現行開關。 |
| `20260925040000_course_monthly_notifications` | CourseMonthlyNotification 與重送唯一鍵 | 20260925103129 / course_monthly_notifications | 比對欄位、唯一鍵、FK、RLS／ACL；不補發通知。 |
| `20260925121500_course_music_reschedule_v1` | CourseSession 改課欄位／CourseSessionMove | 尚無直接同名對應 | 核對歷史欄位、移課紀錄、FK 與 scope CHECK；不重排課程。 |
| `20260925124707_steamfoot_rent_terms` | StaffRentTerm 與租金條款限制 | 20260925133226 / steamfoot_rent_terms | 核對金額、週期、月份 CHECK／索引／RLS；不補扣租金。 |
| `20260925182000_course_session_teacher_note` | CourseSession.teacherNote | 尚無直接同名對應 | 核對 NOT NULL、default 空字串；不得覆寫既有備註。 |
| `20260925191000_course_music_absence` | 教師缺席／補課欄位及課程／預約 CHECK | 尚無直接同名對應 | 核對最新 CHECK 全集；禁止直接套回早期限定狀態而破壞後續 CHECKED_IN 或其他已核准狀態。 |
| `20260926001000_course_student_leave_restore_entry` | CoursePointEntry_values 請假恢復格式 | 已證實目前 CHECK 含 CANCELLED:RESERVED | 禁止重跑：舊檔不含目前合法的 USAGE，更不含本 PR 新取消格式。核對後以後繼限制證據提出 history 修復，不改寫舊檔。 |
| `20260926010000_course_group_leave_forfeit` | 團體請假 absenceKind CHECK | 後繼教師缺席限制須一併比對 | 禁止直接回到只允許 STUDENT_LEAVE／GROUP_LEAVE_FORFEITED 的舊 CHECK；保留 TEACHER_ABSENT 等已核准值。 |
| `20260926011000_course_self_organized_type` | CourseTemplate.classType CHECK | 尚無直接同名對應 | 比對 PRIVATE／SELF_ORGANIZED／GROUP 與目前核准全集；缺項採向前擴充，不猜舊課分類。 |
| `20260926020000_music_course_products` | 音樂商品欄位、限制、計酬 snapshot 與函式 | 尚無直接同名對應 | 逐項核對商品欄位及函式現行行為；CREATE OR REPLACE 舊函式不可直接重跑。 |
| `20260927130000_course_released_original_slots` | CourseSession.releasedAt 與排課排他限制 | 尚無直接同名對應 | 禁止重跑原 UPDATE 回填與重建排他限制；核對現況及異動釋放規則，缺漏另案審查。 |
| `20260930081500_add_operation_audit_read_permission` | StaffPermission audit.read 授權資料 | 20260930020631 / add_operation_audit_read_permission | 屬權限資料變更；須另行唯讀彙總核對 owner 授權，不以重跑 INSERT 補授權。 |
| `20260930093000_shared_customer_labels` | 共用顧客標籤四表與複合 FK | customer_label_item_order 為後繼線索，非等價證明 | 比對完整四表、唯一鍵、FK／RLS／ACL；不得只憑後繼名稱標記 applied。 |
| `20261001093000_course_teacher_absence_refund` | TEACHER_ABSENT absenceKind 格式 | 目前完整 CHECK 尚需專項核對 | 核對最新合法格式與教師缺席免扣流程；只在證據充分後提 history 修復。 |
| `20261001143955_course_space_rentals` | 空間出租兩表、價格欄位、函式／觸發器 | 已證實 CourseRental 存在；不代表整檔等價 | 比對 CourseRentalPayment、RLS、占用／停用 guard 及 isTrial 等全部物件；不可重建既有出租資料。 |
| `20261003105340_course_companion_booking` | 同伴欄位／候補／帳本 USAGE | 20261003120909 / course_companion_booking；正式 CHECK 已含 USAGE | 禁止直接重跑舊欄位 DDL 或覆寫新 CHECK；比對 nullable／同伴欄位／索引及後繼修正。 |
| `20261006070000_customer_care_lifecycle` | CustomerFollowUp 關懷欄位與索引 | 20261006085647 / customer_care_lifecycle | 核對三個 nullable 欄位、索引；不新增關懷或通知。 |
| `20261006120000_store_catalog_order` | Store.catalogSortOrder | 20261006034040 / store_catalog_order | 核對 NOT NULL、default=0；不重排現有店家順序。 |
| `20261008054000_course_student_self_booking` | CourseBookingRule 自主預約開關與 revision | 20261008103400 / course_student_self_booking_20261008 | 核對兩欄、預設值與現行開關；不重設或啟用任何店家的自主預約。 |

## 本筆正式 migration 與兩套 history 的界線

本 PR 僅在 Supabase migrations 登錄一筆運動取消帳本／排課 metadata migration。Prisma schema 本身無法完整表達這些 CHECK、RLS 與版本標記，因此不另外建立同內容 Prisma migration，以免重複套用。未建立任何自動執行器或批次 db push／migrate deploy 路徑。

執行前必須先完成 history 差異的分類與書面處置，確定環境不會自動補跑這 22 筆。單筆 migration 本身不得因 history 清理而包含其他模組 DDL／DML。未來若統一 history，須另案審查，且不改寫已合併的舊 migration 檔案。

未通過備份、執行角色、schema 前置核對與正式授權時，本筆 migration 同樣不可執行。main 與本審查分支的 Vercel 自動部署均維持停用。
