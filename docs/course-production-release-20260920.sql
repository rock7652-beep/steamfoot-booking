BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(2026092015);
DO $guard$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Course%' AND c.relkind='r')
 OR EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='IndustryModule' AND e.enumlabel='COURSE') THEN
  RAISE EXCEPTION 'Course already present or partial; do not replay';
 END IF;
 IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Unresolved migration failure'; END IF;
IF (SELECT md5(jsonb_build_object(
'columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default,datetime_precision FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('TrialCareSetting','TrialCarePreference','TrialCareLog') OR (table_name='Booking' AND column_name='trialCareCompletedAt') OR (table_name='SpaBooking' AND column_name='isTrial') OR (table_name='SpaPackage' AND column_name='publicVisible'))) x),
'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('TrialCareSetting','TrialCarePreference','TrialCareLog')),
'indexes',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public' AND tablename IN ('TrialCareSetting','TrialCarePreference','TrialCareLog')),
'rls',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('TrialCareSetting','TrialCarePreference','TrialCareLog'))
)::text) AS fingerprint) IS DISTINCT FROM '857e92677b71d3646656d53232f9e671' THEN RAISE EXCEPTION 'TrialCare schema changed: re-audit before history repair'; END IF;
IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE (version,name) IN (('20260916054027','trial_care_public_spa_packages'),('20260916054015','trial_care_20260916'))) <> 2 THEN RAISE EXCEPTION 'Original TrialCare history missing'; END IF;
IF EXISTS (WITH expected AS (SELECT '0_baseline' AS name, 'faf3b9f98281b49eafaa5cd30af8bd390d13015778527bfd272bd066af8c0070' AS checksum UNION ALL SELECT '20260413_points_expand' AS name, 'b557b9e1c42f1d51bce01fb282041bbb4be327ddb44f1d03a78044fff979ed86' AS checksum UNION ALL SELECT '20260413_role_rename' AS name, '7b5ffcde100f0088ba7248c4b145053e5ce2ae17da02ebe8f9501e06ae23d3b5' AS checksum UNION ALL SELECT '20260415_store_is_demo' AS name, '2ad6f57cb3764e71eae920c2d181a64acf8e82eeeaea91808acb7a46a97d3780' AS checksum UNION ALL SELECT '20260415_store_line_destination' AS name, '331b45afee3ddbeaeec15613ae8d597c073e18e273b2237acab9c8d744811576' AS checksum UNION ALL SELECT '20260415_store_scoped_unique' AS name, '16ddf96c46c9fbd0cc9d6d73f24eda02e9c8ec8b392782fd1b5f2721fc8d25dc' AS checksum UNION ALL SELECT '20260416_remove_shop_plan' AS name, 'b2af8c3bde0a1d8e80b784fd0f8f6608cc97e5787535cac204efe164d30f6714' AS checksum UNION ALL SELECT '20260417_add_referral_events' AS name, '800043b6b9ae4eecebdaa9c2882b75134973f1f84ba7520dde3f2513003a5d0a' AS checksum UNION ALL SELECT '20260423_referral_points_system' AS name, 'bc8a7f0672f9e906a1e6d2758222663f4e5e9bfa3ec5fee28cdfe067d9ba0920' AS checksum UNION ALL SELECT '20260424_add_store_bank_info_and_plan_visibility' AS name, '060eda7f551376f517d7f83f654decc75cde2c30dcd15920250fd57ed3703176' AS checksum UNION ALL SELECT '20260424_add_transaction_payment_fields' AS name, 'a285fd09692c181cf8b4ae8887b27bcea2cd180bbf477cbfd9fab4ae762d42e4' AS checksum UNION ALL SELECT '20260426_add_customer_purchase_inputs' AS name, '70b23589b8995fa5a2eaa767b0314bee1840e51a88d86ab22229c1a9fba25190' AS checksum UNION ALL SELECT '20260426_add_wallet_session' AS name, 'e8d67a6352c7b385418445674fee2588b969f50d969bb9f2634b2caef53ba01b' AS checksum UNION ALL SELECT '20260429_create_bonus_rule' AS name, '5e9a5bc71635231aecdebcac590e9b82ca3bb938a793b74854c2898b34e91d40' AS checksum UNION ALL SELECT '20260429_add_customer_merge_tracking' AS name, '2bbbd4cc7328b52d201af94054ceca2e43425386697d65941c7ecd4354f250c0' AS checksum UNION ALL SELECT '20260429_add_transaction_void_and_audit_log' AS name, 'f3ec0cb9b81606f65020aa9c67c22741a561615eca890b1f6f767a41da0019b5' AS checksum UNION ALL SELECT '20260430_add_transaction_refund_v2' AS name, 'ef8b255f5e041696029fc3a94b7bfb9fb2520735e3aa0831f7cb18feb13abf67' AS checksum UNION ALL SELECT '20260506_add_backfill_enum_values' AS name, 'b32c5b017ca31f6a45bfbd62b87daa580aab4540d2b9a7f6b4eae8909bc454b9' AS checksum UNION ALL SELECT '20260511_message_log_trigger_at' AS name, 'bde975d30788b2c22d9d292225ab888631b154a27ce1930e9219951b09c3e234' AS checksum UNION ALL SELECT '20260513_add_paper_migration_transaction_type' AS name, '716c739bd9b53cfd3e1c2cd200d40775f2df0c783db9cd84e7043a87e6ac91a1' AS checksum UNION ALL SELECT '20260514_add_cash_drawer_session_and_entry' AS name, '7769650c95060c42e3f8d763b4fe6fa9cbab2a1332d738b64df3e739a114edb6' AS checksum UNION ALL SELECT '20260515_add_todo_dismiss' AS name, '8e9f65ce6fcc987fbcd66fd19bf05a83858e0ed384b2243d4df0c175dc2d1b95' AS checksum UNION ALL SELECT '20260516_add_trial_settings' AS name, '531f615b75bc3c6b0a23be08b02b495b0e2a7a24228ddcba8437931389cbca4c' AS checksum UNION ALL SELECT '20260517_add_booking_expected_amount' AS name, '9ceb49f222211e943cfe21055817cf3ec708970bc8cee6ea0cc2002606052f53' AS checksum UNION ALL SELECT '20260518_add_shop_config_bookable_until' AS name, 'ad1351e57d39e5ecb6159435a727e33145c32e98dbb63b351a993f743002d875' AS checksum UNION ALL SELECT '20260525_add_cron_run_log' AS name, 'b136f2a9f543c8f82255357836d2fdc69acad32b553b738d2c3bdba83d0dee09' AS checksum UNION ALL SELECT '20260527_add_per_store_presentation' AS name, 'b4850c9f2539641708eebfd0e40c093975db9730f2d481cbf6df16dcf421f7df' AS checksum UNION ALL SELECT '20260529_add_cashbook_payment_method' AS name, '63ec99e757f64751f76f2d7a967e3c8a337d6abf7a09eb35a25ab7ad76f9e4e9' AS checksum UNION ALL SELECT '20260605_add_customer_service_note' AS name, '5b744f0b8e6cc687831eb21692b2adff44a78d4fe2529163f0d4bd0a781a1115' AS checksum UNION ALL SELECT '20260605_makeup_credit_multi_per_booking' AS name, '3528808a8719cdbee871c6789395a03994265d46be4b96d10124a95dffa90c24' AS checksum UNION ALL SELECT '20260605_pr_noshow2_booking_makeup_credit' AS name, '7ffa72bd1d8543ba92d2e99ee55a80130d94e4864488801dfd52f94d254e969d' AS checksum UNION ALL SELECT '20260607_add_booking_attended_people' AS name, 'ac36d4ecd0c23a3e8ea10c44e2e064d07cb40da8b2ddc2fa192d5d2448e0c3f9' AS checksum UNION ALL SELECT '20260614_add_subscription_payment_method' AS name, '8d5bc871dce3ebcc509a350b40ea147cb085281fc2947056fba06e81648e54c6' AS checksum UNION ALL SELECT '20260616_add_store_operating_status' AS name, 'a299f2fe600792e38215ef9a199eeff783beb37be6195e0afab36c37b7d7e66f' AS checksum UNION ALL SELECT '20260628_add_customer_identity_link' AS name, '220d1d3e8fc327d54ad6b40698ea9bf8b9a7d0614cdc80b6aae20ca53b97760e' AS checksum UNION ALL SELECT '20260702_add_store_feature_entitlements' AS name, 'c11a1c4be50b060d690743e83f9166f035ae394b6a3ea3a51916f39dcffc5e28' AS checksum UNION ALL SELECT '20260705_add_store_settlements' AS name, '988a00c38e43ed841a869e4ed37fda8b73fd70e69d489c55d34cd791da6bf8ca' AS checksum UNION ALL SELECT '20260706_add_healthflow_link_callback_replay' AS name, 'f77a3d3164385829a553cb8334f8d7ae73328c22f3e85e1217dc40d8f99680f0' AS checksum UNION ALL SELECT '20260714_add_referral_share_template' AS name, 'a07cb208af428e987216a0d9a4133fc59ed3d85bfba291b473e76f256011e666' AS checksum UNION ALL SELECT '20260617_add_customer_follow_up' AS name, '89ac9542e14edcf6f92aaae058374fd7b0bd87d2ee8bebd5d42977438541fb3f' AS checksum UNION ALL SELECT '20260715_add_referral_template_favorites_usage' AS name, '7b099a3b36efa79521e23af3e11dd92e2ee5b9a28d0c2946fe6f95f803a1291a' AS checksum UNION ALL SELECT '20260716153000_add_booking_submission_idempotency' AS name, '12ff697e5812b6cacd0f35dff2f5c9cc50b41c2b8bcb50ec8b77547e3a056374' AS checksum UNION ALL SELECT '20260717090000_add_weekly_booking_recurrence' AS name, '376d89a0fe6e530e9d745d39017750040ff9fbd4416de31119c3276260cc3aa5' AS checksum UNION ALL SELECT '20260718010000_add_line_rebind_capture' AS name, 'aef2e02248e57e0cc04f77c690befdd57717966342310ebd3643adde06deaf20' AS checksum UNION ALL SELECT '20260718023000_add_line_rebind_old_user_hash' AS name, 'b22c5f777e7581b2e0eba94651e3235a6c8a4dba8f4342e1741deecbdcee36e1' AS checksum UNION ALL SELECT '20260718110000_add_line_oauth_attempt' AS name, 'd39a79cd56cad7b5812a2020742f3c5019f3eea82a9c5f25291b0042f188d3cf' AS checksum UNION ALL SELECT '20260718123000_add_line_oauth_session_consumed_at' AS name, '56f1a04e537c4fbedbe55cf7ea5ad3e463fa0178721e866ae1f5702b28662576' AS checksum UNION ALL SELECT '20260720091000_replace_pending_validity_with_expiry_snapshot' AS name, '4491266c2e2eddd68ec026287b5f827e0cdf2ae0d99a82fd2d0e42f54b72607d' AS checksum UNION ALL SELECT '20260720090000_pending_payment_entitlement_snapshots' AS name, '5abcf23c954db92d7994d27e067b9d0ddaf5598a03eacec99d024a5eb4ed7ca4' AS checksum UNION ALL SELECT '20260721090000_add_central_member_link_review_request' AS name, '28217e38ceb86a1c3126c89c0ec0d8220309ca6418776342d5cdfa16c6bf2b3a' AS checksum UNION ALL SELECT '20260721130000_add_central_member_link_review_resolution' AS name, '0c5ec8637c90b8fd633d2117766da5d1fb5377b0132e28c58ac0d6742dd0ea83' AS checksum UNION ALL SELECT '20260722090000_enable_rls_on_remaining_application_tables' AS name, '3ee048315007d1b65845248f3b94ffeaeb235777430506b7952311cd1d7ebeda' AS checksum UNION ALL SELECT '20260723190000_add_digital_butler_core_model' AS name, '008842256c267580fe68afbe40044c4502c170d910b0657fb827196e8c09acb9' AS checksum UNION ALL SELECT '20260725150000_add_digital_butler_lead_tracking' AS name, '4a9f4c435c379fae1fa6b3c7674a2a80e1fdf2e718a8116264aeb9548ec8d62e' AS checksum UNION ALL SELECT '20260723183000_add_reminder_line_route' AS name, '25cafa207263a4d3b8e07acd7a5c4f772cef80e9c41fa2b4338e43320c6db0d7' AS checksum UNION ALL SELECT '20260727090000_channel_neutral_digital_butler' AS name, '6744950189954220f13414084826d3c99eb70b61cd3d1c36fdef0493000c6ded' AS checksum UNION ALL SELECT '20260727100000_add_session_balance_notifications' AS name, '0e5124c937050672dbbe6d03e4b5ff7f4837ef93d99eb4ea609e6c8f78e01c7e' AS checksum UNION ALL SELECT '20260727190000_add_session_balance_notification_settings' AS name, '3febbc1b25f27a442cde206b9edbf6f69d798ef53103c680cea911c614b4b20a' AS checksum UNION ALL SELECT '20260727194500_add_session_balance_response_closure' AS name, '209f1fac03f0f33728d52432604aa10a40804edd2ee4396ce6ad24994104e6a2' AS checksum UNION ALL SELECT '20260727233000_add_store_line_notification_recipients' AS name, '4c393699434ff690ec5486551c262344322164f49e4d759e79ce45a0a2b1f64b' AS checksum UNION ALL SELECT '20260729090000_add_messenger_audit_runs' AS name, '6edbd88d9fd2ab9e368b963d21f7d90ef2ed1f8e8c467a29c20f9a3c8d8e1488' AS checksum UNION ALL SELECT '20260801090000_add_transaction_payment_splits' AS name, '74750d2d3f24dba84a4f58380a8ed9868734500ddd50e8d632d223cefeb07287' AS checksum UNION ALL SELECT '20260802090000_add_digital_butler_human_support_summary' AS name, '9218b485f642748141666778d7643bc5ba1aee27541ae8dc17461dacd3884ad5' AS checksum UNION ALL SELECT '20260808090000_enable_transaction_payment_split_rls' AS name, 'bdc2cd86ea67507df334271b3589c7e416bad4ec2c1cddc96da23b7f3d0f2064' AS checksum UNION ALL SELECT '20260808100000_add_trial_booking_chat_self_service' AS name, 'fcd758f18d3a157e7cbb7512632871812c976723a13e373fe6ad0c2cf8d0ba08' AS checksum UNION ALL SELECT '20260810120000_messenger_utility_reminder_idempotency' AS name, 'fd25c2412c5c64cc7c20d502753747964b0e20feaebeee200c6d69bc997bb894' AS checksum UNION ALL SELECT '20260814183000_add_transaction_conversion_snapshot' AS name, '71f451fb1a4830543ab32c6d7f6ed2ef88be7b0fd6a9bbd5ffe69e0e50148e13' AS checksum UNION ALL SELECT '20260821170000_add_business_hour_segments' AS name, '16dc68c35ff503ce4f74200f5276345fce9cded1201ca273e1f59917f8d17c4b' AS checksum UNION ALL SELECT '20260824150000_add_native_customer_health_records' AS name, 'd5321d6a3ff38509d045b185e2cccdfac09acd35145ab3cd7035573bc0cb2c04' AS checksum UNION ALL SELECT '20260825133000_add_customer_health_history_grants' AS name, '06edaac6806880cde37ccdd97f87dfdc0156e35c65d79a339e073a746962a713' AS checksum UNION ALL SELECT '20260828141500_add_spa_treatments_skills_availability' AS name, '3476e614e0ad94e5b0c6c8600d774bf1a99f6dffe73a2c5b7fd8791eec0a501a' AS checksum UNION ALL SELECT '20260830093000_add_spa_stored_value_wallet' AS name, '6e378397e446d99b7b08be1a24adf61a3cbf8fbed5e5c2e1b2a8171147a72e3f' AS checksum UNION ALL SELECT '20260831140000_add_spa_staff_compensation' AS name, '5acd2291d5d12bfe40d0833e649546f7c786712d16e029ab304f815e6c09e7d2' AS checksum UNION ALL SELECT '20260901110000_add_isolated_spa_models' AS name, '3aa07c29d74f873330684ad7df3c5d9127024b0b0f968812ded0beef275a6e1d' AS checksum UNION ALL SELECT '20260901123000_add_store_industry_module' AS name, '122833ba641dc3de3f531e4dac9ab451d2c8726c9967e2464e04cdb63ea0a69f' AS checksum UNION ALL SELECT '20260901153000_cutover_spa_operational_models' AS name, '7f4d31438b95457c06e3f7cedf40389083e14b9574c81b71499f53377e51d300' AS checksum UNION ALL SELECT '20260901154500_remove_legacy_spa_shared_schema' AS name, '82c6decf83583550e2768af26fa266ad06f6102b2df66294636dce4fae93c0ab' AS checksum UNION ALL SELECT '20260903120000_backfill_spa_payments' AS name, 'eaee8d6e128ad5f43f1079a956a94820569fac017ee932b733f8d984bee0e290' AS checksum UNION ALL SELECT '20260826143000_add_recurring_confirmation_notification' AS name, 'c1acba47d93b5f2b0e0e5f8fb1dbc54837640d8c2b2f64b2da0a2366ee74fa2c' AS checksum UNION ALL SELECT '20260913090000_add_staff_member_link' AS name, '97bc01e987723d307f895f54282636c441919a70584a660f6ab9f45c6b3be180' AS checksum UNION ALL SELECT '20260914100000_same_day_manager_reminder' AS name, '46d78356a8e05d60ba97afd58ebf3815d0839f102be1d68200dc432f1d81b467' AS checksum UNION ALL SELECT '20260914150000_manager_notification_center' AS name, '0f5b03d85d25ad76be75bb40f6d92889e110e3bac3cc8e546cd09f48385db4e4' AS checksum), actual AS (SELECT migration_name AS name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) SELECT 1 FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d) THEN RAISE EXCEPTION 'Active Prisma history differs from audit'; END IF;
END $guard$;
CREATE TEMP TABLE course_release_legacy_guard (name text PRIMARY KEY, digest text) ON COMMIT DROP;
INSERT INTO course_release_legacy_guard VALUES ('Store',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."Store" t));
INSERT INTO course_release_legacy_guard VALUES ('Staff',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['phone','emergencyContactName','emergencyContactPhone','courseCoachEnabled','courseQualificationsConfirmed','courseQualifiedTemplateIds','courseBirthday','emergencyContactRelation']::text[])::text),'' ORDER BY id),'')) FROM public."Staff" t));
INSERT INTO course_release_legacy_guard VALUES ('Customer',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['emergencyContactName','emergencyContactPhone']::text[])::text),'' ORDER BY id),'')) FROM public."Customer" t));
INSERT INTO course_release_legacy_guard VALUES ('StaffMemberLink',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['courseMemberEnabled']::text[])::text),'' ORDER BY id),'')) FROM public."StaffMemberLink" t));
INSERT INTO course_release_legacy_guard VALUES ('MessageLog',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['courseBookingId','courseCardId']::text[])::text),'' ORDER BY id),'')) FROM public."MessageLog" t));
INSERT INTO course_release_legacy_guard VALUES ('Booking',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."Booking" t));
INSERT INTO course_release_legacy_guard VALUES ('SpaBooking',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."SpaBooking" t));
INSERT INTO course_release_legacy_guard VALUES ('Transaction',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."Transaction" t));

-- Source: prisma/migrations/20260915090000_add_course_scheduling/migration.sql
-- Additive only: no existing store is converted or enabled by this migration.
ALTER TYPE "IndustryModule" ADD VALUE IF NOT EXISTS 'COURSE';
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "CourseRoom" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "pointCost" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "defaultRoomId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "pointCost" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "requestKey" TEXT NOT NULL,
    "requestIndex" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseRoom_id_storeId_key" ON "CourseRoom"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRoom_storeId_name_key" ON "CourseRoom"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTemplate_id_storeId_key" ON "CourseTemplate"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTemplate_storeId_name_key" ON "CourseTemplate"("storeId", "name");

-- CreateIndex
CREATE INDEX "CourseSession_storeId_startsAt_idx" ON "CourseSession"("storeId", "startsAt");

-- CreateIndex
CREATE INDEX "CourseSession_storeId_coachId_startsAt_idx" ON "CourseSession"("storeId", "coachId", "startsAt");

-- CreateIndex
CREATE INDEX "CourseSession_storeId_roomId_startsAt_idx" ON "CourseSession"("storeId", "roomId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSession_id_storeId_key" ON "CourseSession"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSession_storeId_requestKey_requestIndex_key" ON "CourseSession"("storeId", "requestKey", "requestIndex");

-- AddForeignKey
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_defaultRoomId_storeId_fkey" FOREIGN KEY ("defaultRoomId", "storeId") REFERENCES "CourseRoom"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_templateId_storeId_fkey" FOREIGN KEY ("templateId", "storeId") REFERENCES "CourseTemplate"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_roomId_storeId_fkey" FOREIGN KEY ("roomId", "storeId") REFERENCES "CourseRoom"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseRoom" ADD CONSTRAINT "CourseRoom_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_coachId_storeId_fkey" FOREIGN KEY ("coachId", "storeId") REFERENCES "Staff"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;

ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_values_check" CHECK (
  "durationMinutes" BETWEEN 1 AND 480 AND "pointCost" BETWEEN 1 AND 10000 AND capacity BETWEEN 1 AND 500
);
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_values_check" CHECK (
  "endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '480 minutes'
  AND "pointCost" BETWEEN 1 AND 10000 AND capacity BETWEEN 1 AND 500 AND "requestIndex" >= 0
);

-- Half-open intervals allow adjacent courses and protect concurrent writes.
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_room_overlap" EXCLUDE USING gist (
  "storeId" WITH =, "roomId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("cancelledAt" IS NULL);
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_coach_overlap" EXCLUDE USING gist (
  "storeId" WITH =, "coachId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("cancelledAt" IS NULL);

-- No browser/PostgREST policies. Only the existing server DB role may access.
ALTER TABLE "CourseRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSession" ENABLE ROW LEVEL SECURITY;

-- Source: prisma/migrations/20260915140000_course_points_booking/migration.sql
-- CreateTable
CREATE TABLE "CoursePointPlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "validDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CoursePointPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePointCard" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePointCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCardMember" (
    "cardId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "CourseCardMember_pkey" PRIMARY KEY ("cardId","customerId")
);

-- CreateTable
CREATE TABLE "CourseBooking" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "operatorCustomerId" TEXT,
    "operatorName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "pointCost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePointEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "bookingId" TEXT,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseBookingRule" (
    "storeId" TEXT NOT NULL,
    "bookingLeadMinutes" INTEGER NOT NULL DEFAULT 0,
    "cancellationLeadMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseBookingRule_pkey" PRIMARY KEY ("storeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointPlan_id_storeId_key" ON "CoursePointPlan"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointPlan_storeId_name_key" ON "CoursePointPlan"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointCard_id_storeId_key" ON "CoursePointCard"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointCard_storeId_requestKey_key" ON "CoursePointCard"("storeId", "requestKey");

-- CreateIndex
CREATE INDEX "CourseCardMember_storeId_customerId_idx" ON "CourseCardMember"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "CourseBooking_storeId_sessionId_status_idx" ON "CourseBooking"("storeId", "sessionId", "status");

-- CreateIndex
CREATE INDEX "CourseBooking_storeId_cardId_status_idx" ON "CourseBooking"("storeId", "cardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourseBooking_id_storeId_key" ON "CourseBooking"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseBooking_storeId_requestKey_key" ON "CourseBooking"("storeId", "requestKey");

-- CreateIndex
CREATE INDEX "CoursePointEntry_storeId_cardId_createdAt_idx" ON "CoursePointEntry"("storeId", "cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointEntry_bookingId_kind_key" ON "CoursePointEntry"("bookingId", "kind");

-- AddForeignKey
ALTER TABLE "CoursePointCard" ADD CONSTRAINT "CoursePointCard_planId_storeId_fkey" FOREIGN KEY ("planId", "storeId") REFERENCES "CoursePointPlan"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCardMember" ADD CONSTRAINT "CourseCardMember_cardId_storeId_fkey" FOREIGN KEY ("cardId", "storeId") REFERENCES "CoursePointCard"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_cardId_storeId_fkey" FOREIGN KEY ("cardId", "storeId") REFERENCES "CoursePointCard"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_sessionId_storeId_fkey" FOREIGN KEY ("sessionId", "storeId") REFERENCES "CourseSession"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_cardId_storeId_fkey" FOREIGN KEY ("cardId", "storeId") REFERENCES "CoursePointCard"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "CourseBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defence in depth for writes outside the application transaction.
CREATE UNIQUE INDEX "CourseBooking_active_learner" ON "CourseBooking" ("storeId", "sessionId", "customerId") WHERE status <> 'CANCELLED';
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT "CoursePointPlan_values" CHECK (points > 0 AND price >= 0 AND "validDays" > 0);
ALTER TABLE "CoursePointCard" ADD CONSTRAINT "CoursePointCard_balance" CHECK (remaining >= 0);
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK ("pointCost" > 0 AND status IN ('RESERVED', 'CANCELLED', 'ATTENDED'));
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND kind IN ('GRANT', 'RESERVE', 'RELEASE', 'DEBIT'));
ALTER TABLE "CourseBookingRule" ADD CONSTRAINT "CourseBookingRule_values" CHECK ("bookingLeadMinutes" >= 0 AND "cancellationLeadMinutes" >= 0);
ALTER TABLE "CourseCardMember" ADD CONSTRAINT "CourseCardMember_customer_fk" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_customer_fk" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_operator_customer_fk" FOREIGN KEY ("operatorCustomerId", "storeId") REFERENCES "Customer"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_operator_fk" FOREIGN KEY ("operatorUserId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_actor_fk" FOREIGN KEY ("actorUserId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT "CoursePointPlan_store_fk" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseBookingRule" ADD CONSTRAINT "CourseBookingRule_store_fk" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CoursePointPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoursePointCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseCardMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoursePointEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseBookingRule" ENABLE ROW LEVEL SECURITY;

-- Source: prisma/migrations/20260915150000_course_coach_member_mode/migration.sql
ALTER TABLE "StaffMemberLink" ADD COLUMN IF NOT EXISTS "courseMemberEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

-- Source: supabase/migrations/20260915082019_course_catalog_categories.sql
-- Additive course-only metadata; preserves all existing schedules and RLS.
ALTER TABLE public."CourseRoom" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE public."CourseTemplate" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE public."CourseRoom" ADD CONSTRAINT "CourseRoom_category_length" CHECK (char_length("category") <= 40);
ALTER TABLE public."CourseTemplate" ADD CONSTRAINT "CourseTemplate_category_length" CHECK (char_length("category") <= 40);

-- Source: supabase/migrations/20260915123055_course_catalog_details.sql
ALTER TABLE "CourseRoom" ADD COLUMN "capacity" INTEGER, ADD COLUMN "details" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CourseRoom" ADD CONSTRAINT "CourseRoom_capacity_positive" CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 500);
ALTER TABLE "CourseTemplate" ALTER COLUMN "defaultRoomId" DROP NOT NULL;
ALTER TABLE "CourseTemplate" ADD COLUMN "description" TEXT NOT NULL DEFAULT '', ADD COLUMN "precautions" TEXT NOT NULL DEFAULT '';

-- Source: supabase/migrations/20260916024857_course_attendance_and_staff_contacts.sql
-- Additive only: existing bookings, balances and staff identities are preserved.
ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS "checkedInAt" timestamptz(3);
ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE "CourseBooking" DROP CONSTRAINT IF EXISTS "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK ("pointCost" > 0 AND status IN ('RESERVED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'));
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContactName" text NOT NULL DEFAULT '';
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" text NOT NULL DEFAULT '';

-- Source: supabase/migrations/20260916090234_course_portal_integration.sql
-- Additive, course-only. Apply to isolated Preview first; production needs approval.
ALTER TABLE "CoursePointPlan" ADD COLUMN "unit" text NOT NULL DEFAULT 'POINT', ADD COLUMN "templateIds" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePointCard" ADD COLUMN "unit" text NOT NULL DEFAULT 'POINT', ADD COLUMN "templateIds" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT course_plan_unit CHECK (unit IN ('POINT','SESSION'));
ALTER TABLE "CoursePointCard" ADD CONSTRAINT course_card_unit CHECK (unit IN ('POINT','SESSION'));
CREATE TABLE "CoursePurchase" (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES "Store"(id), "customerId" text NOT NULL,
 "planId" text NOT NULL, name text NOT NULL, unit text NOT NULL CHECK (unit IN ('POINT','SESSION')),
 points integer NOT NULL CHECK(points>0), price integer NOT NULL CHECK(price>=0), "validDays" integer NOT NULL CHECK("validDays">0),
 "templateIds" text[] NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED')),
 "transferLastFive" text NOT NULL CHECK("transferLastFive" ~ '^[0-9]{5}$'), "requestKey" text NOT NULL,
 "cardId" text, "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" timestamp, "confirmedBy" text,
 FOREIGN KEY("planId","storeId") REFERENCES "CoursePointPlan"(id,"storeId"),
 FOREIGN KEY("cardId","storeId") REFERENCES "CoursePointCard"(id,"storeId")
);
CREATE UNIQUE INDEX "CoursePurchase_storeId_requestKey_key" ON "CoursePurchase"("storeId","requestKey");
CREATE INDEX "CoursePurchase_storeId_customerId_createdAt_idx" ON "CoursePurchase"("storeId","customerId","createdAt");
ALTER TABLE "CoursePurchase" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePurchase" FROM anon, authenticated;

ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN ('GRANT','RESERVE','RELEASE','DEBIT') OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$' OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'));

-- Source: supabase/migrations/20260917000515_course_purchase_refunds.sql
-- Isolated preview first. Production execution requires separate authorization.
ALTER TABLE "CoursePointCard" ADD COLUMN "closedAt" timestamptz(3);
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_id_storeId_key" UNIQUE (id,"storeId");
ALTER TABLE "CoursePurchase" DROP CONSTRAINT "CoursePurchase_status_check";
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_status_check" CHECK(status IN ('PENDING','CONFIRMED','REFUNDED'));
CREATE TABLE "CoursePurchaseRefund" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id),
  "purchaseId" text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK(amount > 0),
  points integer NOT NULL CHECK(points > 0),
  reason text NOT NULL CHECK(length(trim(reason)) > 0),
  "actorUserId" text NOT NULL REFERENCES "User"(id),
  "requestKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY("purchaseId","storeId") REFERENCES "CoursePurchase"(id,"storeId"),
  UNIQUE("storeId","requestKey")
);
CREATE INDEX "CoursePurchaseRefund_storeId_createdAt_idx" ON "CoursePurchaseRefund"("storeId","createdAt");
ALTER TABLE "CoursePurchaseRefund" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePurchaseRefund" FROM anon, authenticated;
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND') OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$' OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'));

-- Source: supabase/migrations/20260917002754_course_purchase_corrections.sql
-- Additive course-only metadata and audited voids. No production execution authorized.
ALTER TABLE "CoursePurchase" ADD COLUMN note text NOT NULL DEFAULT '',
 ADD COLUMN "revenueStaffId" text, ADD COLUMN "voidedAt" timestamptz(3),
 ADD COLUMN "voidedBy" text REFERENCES "User"(id), ADD COLUMN "voidReason" text,
 ADD CONSTRAINT "CoursePurchase_revenueStaff_scope" FOREIGN KEY("revenueStaffId","storeId") REFERENCES "Staff"(id,"storeId");
ALTER TABLE "CoursePurchase" DROP CONSTRAINT "CoursePurchase_status_check";
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_status_check" CHECK(status IN ('PENDING','CONFIRMED','REFUNDED','VOIDED'));
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_void_details" CHECK(status<>'VOIDED' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason"))>0));
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID') OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$' OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'));

-- Source: supabase/migrations/20260917011137_course_customer_emergency_contacts.sql
-- Additive optional contact fields; preserve all existing customer rows and identity links.
ALTER TABLE "Customer"
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT;

-- Source: supabase/migrations/20260917030753_course_reminder_links.sql
-- Additive course links on the mature delivery log. Existing steam/SPA rows stay null.
ALTER TABLE "MessageLog"
  ADD COLUMN "courseBookingId" TEXT,
  ADD COLUMN "courseCardId" TEXT;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_courseBooking_store_fkey"
  FOREIGN KEY ("courseBookingId", "storeId") REFERENCES "CourseBooking" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_courseCard_store_fkey"
  FOREIGN KEY ("courseCardId", "storeId") REFERENCES "CoursePointCard" (id, "storeId") ON DELETE RESTRICT;
CREATE INDEX "MessageLog_courseBookingId_idx" ON "MessageLog" ("courseBookingId");
CREATE INDEX "MessageLog_courseCardId_idx" ON "MessageLog" ("courseCardId");
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_course_source_check"
  CHECK (("courseBookingId" IS NULL AND "courseCardId" IS NULL) OR ("bookingId" IS NULL AND "spaBookingId" IS NULL));

-- Source: supabase/migrations/20260917081039_course_negotiated_refund.sql
-- Preview only until separately authorized for production.
ALTER TABLE "CoursePurchaseRefund" ADD COLUMN method text NOT NULL DEFAULT 'OTHER';
ALTER TABLE "CoursePurchaseRefund" ADD CONSTRAINT "CoursePurchaseRefund_method_check"
  CHECK (method IN ('CASH','BANK_TRANSFER','CARD','OTHER'));
ALTER TABLE "CoursePurchaseRefund" DROP CONSTRAINT "CoursePurchaseRefund_points_check";
ALTER TABLE "CoursePurchaseRefund" ADD CONSTRAINT "CoursePurchaseRefund_points_check" CHECK (points >= 0);
ALTER TABLE "CoursePurchaseRefund" DROP CONSTRAINT "CoursePurchaseRefund_purchaseId_key";
CREATE INDEX "CoursePurchaseRefund_purchaseId_idx" ON "CoursePurchaseRefund"("purchaseId");

-- Source: supabase/migrations/20260917094700_course_low_balance_reminders.sql
-- Course-only, opt-in per plan. Existing plans remain disabled and data is preserved.
ALTER TABLE "CoursePointPlan"
  ADD COLUMN "lowBalanceEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "lowBalanceThreshold" integer,
  ADD CONSTRAINT "CoursePointPlan_low_balance_check" CHECK (
    ("lowBalanceThreshold" IS NULL OR "lowBalanceThreshold" >= 0)
    AND (NOT "lowBalanceEnabled" OR "lowBalanceThreshold" IS NOT NULL)
  );
CREATE TABLE "CourseBalanceReminderPreference" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id),
  "customerId" text NOT NULL,
  "stoppedAt" timestamptz(3),
  "lastEventAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  UNIQUE ("storeId", "customerId"),
  FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id,"storeId")
);
ALTER TABLE "CourseBalanceReminderPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseBalanceReminderPreference" FROM anon, authenticated;
-- Roll back application first. Prefer leaving this additive schema in place.
-- Export preference rows before any later approved removal; never discard opt-outs.

-- Source: supabase/migrations/20260917143018_course_trial_separate_payment_attendance.sql
-- Additive course-only change. Existing card bookings remain CARD and retain all balances.

ALTER TABLE "CourseBooking" ALTER COLUMN "cardId" DROP NOT NULL;
ALTER TABLE "CourseBooking" ADD COLUMN "bookingKind" TEXT NOT NULL DEFAULT 'CARD', ADD COLUMN "trialPrice" INTEGER;
ALTER TABLE "CourseBooking" DROP CONSTRAINT "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
 status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW') AND
 (("bookingKind"='CARD' AND "cardId" IS NOT NULL AND "pointCost">0 AND "trialPrice" IS NULL)
 OR ("bookingKind"='TRIAL' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NOT NULL AND "trialPrice" BETWEEN 0 AND 1000000))
);
CREATE TABLE "CourseTrialPayment" (
 id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "bookingId" TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 1000000),
 "paymentMethod" TEXT NOT NULL CHECK ("paymentMethod" IN ('CASH','TRANSFER','LINE_PAY','CREDIT_CARD','OTHER')),
 "paymentSplits" JSONB, status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS','VOIDED')),
 note TEXT NOT NULL DEFAULT '', "requestKey" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMPTZ(3), "voidReason" TEXT,
 CONSTRAINT "CourseTrialPayment_bookingId_storeId_fkey" FOREIGN KEY ("bookingId","storeId") REFERENCES "CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 CONSTRAINT "CourseTrialPayment_storeId_requestKey_key" UNIQUE ("storeId","requestKey"),
 CONSTRAINT "CourseTrialPayment_void_consistency" CHECK ((status='SUCCESS' AND "voidedAt" IS NULL AND "voidReason" IS NULL) OR (status='VOIDED' AND "voidedAt" IS NOT NULL AND length("voidReason")>0))
);
CREATE UNIQUE INDEX "CourseTrialPayment_one_success" ON "CourseTrialPayment"("bookingId") WHERE status='SUCCESS';
CREATE INDEX "CourseTrialPayment_storeId_createdAt_idx" ON "CourseTrialPayment"("storeId","createdAt");
ALTER TABLE "CourseTrialPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseTrialPayment" FROM anon, authenticated;

-- Source: supabase/migrations/20260918235710_course_batch2_catalog_qualifications.sql
-- Additive only. Existing bookings, account links, balances and snapshots remain intact.
-- Rollback: revert application, keep columns/data. Do not drop populated columns.
ALTER TABLE "CourseTemplate" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC', ADD COLUMN "classType" TEXT;
UPDATE "CourseTemplate" SET "visibility"='OFF' WHERE NOT "isActive";
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_visibility_check" CHECK ("visibility" IN ('PUBLIC','HIDDEN','OFF')), ADD CONSTRAINT "CourseTemplate_classType_check" CHECK ("classType" IS NULL OR "classType" IN ('PRIVATE','GROUP'));
ALTER TABLE "CourseRoom" ADD COLUMN "equipment" TEXT NOT NULL DEFAULT '', ADD COLUMN "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Staff" ADD COLUMN "courseCoachEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "courseQualificationsConfirmed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "courseQualifiedTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "courseBirthday" DATE, ADD COLUMN "emergencyContactRelation" TEXT NOT NULL DEFAULT '';
-- Preserve existing course teachers; no new qualification is inferred from history.
UPDATE "Staff" s SET "courseCoachEnabled"=true FROM "Store" st
 WHERE st.id=s."storeId" AND st."industryModule"::text='COURSE'
 AND (EXISTS(SELECT 1 FROM "CourseSession" c WHERE c."storeId"=s."storeId" AND c."coachId"=s.id)
 OR EXISTS(SELECT 1 FROM "StaffMemberLink" l WHERE l."storeId"=s."storeId" AND l."staffId"=s.id)
 OR EXISTS(SELECT 1 FROM "User" u WHERE u.id=s."userId" AND u.role::text='CUSTOMER'));

DO $verify$ BEGIN
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."Store" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='Store') THEN RAISE EXCEPTION 'Legacy data changed: Store'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['phone','emergencyContactName','emergencyContactPhone','courseCoachEnabled','courseQualificationsConfirmed','courseQualifiedTemplateIds','courseBirthday','emergencyContactRelation']::text[])::text),'' ORDER BY id),'')) FROM public."Staff" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='Staff') THEN RAISE EXCEPTION 'Legacy data changed: Staff'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['emergencyContactName','emergencyContactPhone']::text[])::text),'' ORDER BY id),'')) FROM public."Customer" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='Customer') THEN RAISE EXCEPTION 'Legacy data changed: Customer'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['courseMemberEnabled']::text[])::text),'' ORDER BY id),'')) FROM public."StaffMemberLink" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='StaffMemberLink') THEN RAISE EXCEPTION 'Legacy data changed: StaffMemberLink'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY['courseBookingId','courseCardId']::text[])::text),'' ORDER BY id),'')) FROM public."MessageLog" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='MessageLog') THEN RAISE EXCEPTION 'Legacy data changed: MessageLog'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."Booking" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='Booking') THEN RAISE EXCEPTION 'Legacy data changed: Booking'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."SpaBooking" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='SpaBooking') THEN RAISE EXCEPTION 'Legacy data changed: SpaBooking'; END IF;
IF (SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[]::text[])::text),'' ORDER BY id),'')) FROM public."Transaction" t) IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='Transaction') THEN RAISE EXCEPTION 'Legacy data changed: Transaction'; END IF;
IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Course%' AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'Course RLS missing'; END IF;
END $verify$;
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES (gen_random_uuid()::text,'825de4008c37012de5194e58c4fe411830e3e3a4a7654f8190373091497b35b9',clock_timestamp(),'20260916053215_trial_care_public_spa_packages','History reconciliation only; existing Supabase DDL and schema fingerprint verified; no SQL replay',clock_timestamp(),1);
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES (gen_random_uuid()::text,'b3be636b9e64f0560bb3152c4014c0ec9dcfc3ef189887ecff31bc70a7706565',clock_timestamp(),'20260916090000_trial_care','History reconciliation only; existing Supabase DDL and schema fingerprint verified; no SQL replay',clock_timestamp(),1);
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES (gen_random_uuid()::text,'62f0badca303fa73e8ac1d3c3bbe58a53c6984e982901a6772829ec0369b0d14',clock_timestamp(),'20260915090000_add_course_scheduling','Executed exact source in atomic course release',clock_timestamp(),1);
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES (gen_random_uuid()::text,'b0d95b00dc323ee59b4215ec5cac4548e603cca0d46f07caa0e5b6eb84bb6364',clock_timestamp(),'20260915140000_course_points_booking','Executed exact source in atomic course release',clock_timestamp(),1);
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES (gen_random_uuid()::text,'16e8239080b12749ab92bb74ce091490a3f729748820a1b87ce50a2517528a09',clock_timestamp(),'20260915150000_course_coach_member_mode','Executed exact source in atomic course release',clock_timestamp(),1);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260915082019','course_catalog_categories',ARRAY['-- Additive course-only metadata; preserves all existing schedules and RLS.
ALTER TABLE public."CourseRoom" ADD COLUMN "category" TEXT NOT NULL DEFAULT '''';
ALTER TABLE public."CourseTemplate" ADD COLUMN "category" TEXT NOT NULL DEFAULT '''';
ALTER TABLE public."CourseRoom" ADD CONSTRAINT "CourseRoom_category_length" CHECK (char_length("category") <= 40);
ALTER TABLE public."CourseTemplate" ADD CONSTRAINT "CourseTemplate_category_length" CHECK (char_length("category") <= 40);
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260915123055','course_catalog_details',ARRAY['ALTER TABLE "CourseRoom" ADD COLUMN "capacity" INTEGER, ADD COLUMN "details" TEXT NOT NULL DEFAULT '''';
ALTER TABLE "CourseRoom" ADD CONSTRAINT "CourseRoom_capacity_positive" CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 500);
ALTER TABLE "CourseTemplate" ALTER COLUMN "defaultRoomId" DROP NOT NULL;
ALTER TABLE "CourseTemplate" ADD COLUMN "description" TEXT NOT NULL DEFAULT '''', ADD COLUMN "precautions" TEXT NOT NULL DEFAULT '''';
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260916024857','course_attendance_and_staff_contacts',ARRAY['-- Additive only: existing bookings, balances and staff identities are preserved.
ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS "checkedInAt" timestamptz(3);
ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '''';
ALTER TABLE "CourseBooking" DROP CONSTRAINT IF EXISTS "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK ("pointCost" > 0 AND status IN (''RESERVED'', ''CANCELLED'', ''ATTENDED'', ''NO_SHOW''));
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '''';
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContactName" text NOT NULL DEFAULT '''';
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" text NOT NULL DEFAULT '''';
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260916090234','course_portal_integration',ARRAY['-- Additive, course-only. Apply to isolated Preview first; production needs approval.
ALTER TABLE "CoursePointPlan" ADD COLUMN "unit" text NOT NULL DEFAULT ''POINT'', ADD COLUMN "templateIds" text[] NOT NULL DEFAULT ''{}'';
ALTER TABLE "CoursePointCard" ADD COLUMN "unit" text NOT NULL DEFAULT ''POINT'', ADD COLUMN "templateIds" text[] NOT NULL DEFAULT ''{}'';
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT course_plan_unit CHECK (unit IN (''POINT'',''SESSION''));
ALTER TABLE "CoursePointCard" ADD CONSTRAINT course_card_unit CHECK (unit IN (''POINT'',''SESSION''));
CREATE TABLE "CoursePurchase" (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES "Store"(id), "customerId" text NOT NULL,
 "planId" text NOT NULL, name text NOT NULL, unit text NOT NULL CHECK (unit IN (''POINT'',''SESSION'')),
 points integer NOT NULL CHECK(points>0), price integer NOT NULL CHECK(price>=0), "validDays" integer NOT NULL CHECK("validDays">0),
 "templateIds" text[] NOT NULL, status text NOT NULL DEFAULT ''PENDING'' CHECK(status IN (''PENDING'',''CONFIRMED'')),
 "transferLastFive" text NOT NULL CHECK("transferLastFive" ~ ''^[0-9]{5}$''), "requestKey" text NOT NULL,
 "cardId" text, "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" timestamp, "confirmedBy" text,
 FOREIGN KEY("planId","storeId") REFERENCES "CoursePointPlan"(id,"storeId"),
 FOREIGN KEY("cardId","storeId") REFERENCES "CoursePointCard"(id,"storeId")
);
CREATE UNIQUE INDEX "CoursePurchase_storeId_requestKey_key" ON "CoursePurchase"("storeId","requestKey");
CREATE INDEX "CoursePurchase_storeId_customerId_createdAt_idx" ON "CoursePurchase"("storeId","customerId","createdAt");
ALTER TABLE "CoursePurchase" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePurchase" FROM anon, authenticated;

ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN (''GRANT'',''RESERVE'',''RELEASE'',''DEBIT'') OR kind ~ ''^(DEBIT|RELEASE):[0-9a-f-]{36}$'' OR kind ~ ''^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$''));
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917000515','course_purchase_refunds',ARRAY['-- Isolated preview first. Production execution requires separate authorization.
ALTER TABLE "CoursePointCard" ADD COLUMN "closedAt" timestamptz(3);
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_id_storeId_key" UNIQUE (id,"storeId");
ALTER TABLE "CoursePurchase" DROP CONSTRAINT "CoursePurchase_status_check";
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_status_check" CHECK(status IN (''PENDING'',''CONFIRMED'',''REFUNDED''));
CREATE TABLE "CoursePurchaseRefund" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id),
  "purchaseId" text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK(amount > 0),
  points integer NOT NULL CHECK(points > 0),
  reason text NOT NULL CHECK(length(trim(reason)) > 0),
  "actorUserId" text NOT NULL REFERENCES "User"(id),
  "requestKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY("purchaseId","storeId") REFERENCES "CoursePurchase"(id,"storeId"),
  UNIQUE("storeId","requestKey")
);
CREATE INDEX "CoursePurchaseRefund_storeId_createdAt_idx" ON "CoursePurchaseRefund"("storeId","createdAt");
ALTER TABLE "CoursePurchaseRefund" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePurchaseRefund" FROM anon, authenticated;
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN (''GRANT'',''RESERVE'',''RELEASE'',''DEBIT'',''REFUND'') OR kind ~ ''^(DEBIT|RELEASE):[0-9a-f-]{36}$'' OR kind ~ ''^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$''));
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917002754','course_purchase_corrections',ARRAY['-- Additive course-only metadata and audited voids. No production execution authorized.
ALTER TABLE "CoursePurchase" ADD COLUMN note text NOT NULL DEFAULT '''',
 ADD COLUMN "revenueStaffId" text, ADD COLUMN "voidedAt" timestamptz(3),
 ADD COLUMN "voidedBy" text REFERENCES "User"(id), ADD COLUMN "voidReason" text,
 ADD CONSTRAINT "CoursePurchase_revenueStaff_scope" FOREIGN KEY("revenueStaffId","storeId") REFERENCES "Staff"(id,"storeId");
ALTER TABLE "CoursePurchase" DROP CONSTRAINT "CoursePurchase_status_check";
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_status_check" CHECK(status IN (''PENDING'',''CONFIRMED'',''REFUNDED'',''VOIDED''));
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_void_details" CHECK(status<>''VOIDED'' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason"))>0));
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN (''GRANT'',''RESERVE'',''RELEASE'',''DEBIT'',''REFUND'',''VOID'') OR kind ~ ''^(DEBIT|RELEASE):[0-9a-f-]{36}$'' OR kind ~ ''^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$''));
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917011137','course_customer_emergency_contacts',ARRAY['-- Additive optional contact fields; preserve all existing customer rows and identity links.
ALTER TABLE "Customer"
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT;
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917030753','course_reminder_links',ARRAY['-- Additive course links on the mature delivery log. Existing steam/SPA rows stay null.
ALTER TABLE "MessageLog"
  ADD COLUMN "courseBookingId" TEXT,
  ADD COLUMN "courseCardId" TEXT;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_courseBooking_store_fkey"
  FOREIGN KEY ("courseBookingId", "storeId") REFERENCES "CourseBooking" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_courseCard_store_fkey"
  FOREIGN KEY ("courseCardId", "storeId") REFERENCES "CoursePointCard" (id, "storeId") ON DELETE RESTRICT;
CREATE INDEX "MessageLog_courseBookingId_idx" ON "MessageLog" ("courseBookingId");
CREATE INDEX "MessageLog_courseCardId_idx" ON "MessageLog" ("courseCardId");
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_course_source_check"
  CHECK (("courseBookingId" IS NULL AND "courseCardId" IS NULL) OR ("bookingId" IS NULL AND "spaBookingId" IS NULL));
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917081039','course_negotiated_refund',ARRAY['-- Preview only until separately authorized for production.
ALTER TABLE "CoursePurchaseRefund" ADD COLUMN method text NOT NULL DEFAULT ''OTHER'';
ALTER TABLE "CoursePurchaseRefund" ADD CONSTRAINT "CoursePurchaseRefund_method_check"
  CHECK (method IN (''CASH'',''BANK_TRANSFER'',''CARD'',''OTHER''));
ALTER TABLE "CoursePurchaseRefund" DROP CONSTRAINT "CoursePurchaseRefund_points_check";
ALTER TABLE "CoursePurchaseRefund" ADD CONSTRAINT "CoursePurchaseRefund_points_check" CHECK (points >= 0);
ALTER TABLE "CoursePurchaseRefund" DROP CONSTRAINT "CoursePurchaseRefund_purchaseId_key";
CREATE INDEX "CoursePurchaseRefund_purchaseId_idx" ON "CoursePurchaseRefund"("purchaseId");
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917094700','course_low_balance_reminders',ARRAY['-- Course-only, opt-in per plan. Existing plans remain disabled and data is preserved.
ALTER TABLE "CoursePointPlan"
  ADD COLUMN "lowBalanceEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "lowBalanceThreshold" integer,
  ADD CONSTRAINT "CoursePointPlan_low_balance_check" CHECK (
    ("lowBalanceThreshold" IS NULL OR "lowBalanceThreshold" >= 0)
    AND (NOT "lowBalanceEnabled" OR "lowBalanceThreshold" IS NOT NULL)
  );
CREATE TABLE "CourseBalanceReminderPreference" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id),
  "customerId" text NOT NULL,
  "stoppedAt" timestamptz(3),
  "lastEventAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  UNIQUE ("storeId", "customerId"),
  FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id,"storeId")
);
ALTER TABLE "CourseBalanceReminderPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseBalanceReminderPreference" FROM anon, authenticated;
-- Roll back application first. Prefer leaving this additive schema in place.
-- Export preference rows before any later approved removal; never discard opt-outs.
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260917143018','course_trial_separate_payment_attendance',ARRAY['-- Additive course-only change. Existing card bookings remain CARD and retain all balances.
BEGIN;
ALTER TABLE "CourseBooking" ALTER COLUMN "cardId" DROP NOT NULL;
ALTER TABLE "CourseBooking" ADD COLUMN "bookingKind" TEXT NOT NULL DEFAULT ''CARD'', ADD COLUMN "trialPrice" INTEGER;
ALTER TABLE "CourseBooking" DROP CONSTRAINT "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
 status IN (''RESERVED'',''CANCELLED'',''ATTENDED'',''NO_SHOW'') AND
 (("bookingKind"=''CARD'' AND "cardId" IS NOT NULL AND "pointCost">0 AND "trialPrice" IS NULL)
 OR ("bookingKind"=''TRIAL'' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NOT NULL AND "trialPrice" BETWEEN 0 AND 1000000))
);
CREATE TABLE "CourseTrialPayment" (
 id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "bookingId" TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 1000000),
 "paymentMethod" TEXT NOT NULL CHECK ("paymentMethod" IN (''CASH'',''TRANSFER'',''LINE_PAY'',''CREDIT_CARD'',''OTHER'')),
 "paymentSplits" JSONB, status TEXT NOT NULL DEFAULT ''SUCCESS'' CHECK (status IN (''SUCCESS'',''VOIDED'')),
 note TEXT NOT NULL DEFAULT '''', "requestKey" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMPTZ(3), "voidReason" TEXT,
 CONSTRAINT "CourseTrialPayment_bookingId_storeId_fkey" FOREIGN KEY ("bookingId","storeId") REFERENCES "CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 CONSTRAINT "CourseTrialPayment_storeId_requestKey_key" UNIQUE ("storeId","requestKey"),
 CONSTRAINT "CourseTrialPayment_void_consistency" CHECK ((status=''SUCCESS'' AND "voidedAt" IS NULL AND "voidReason" IS NULL) OR (status=''VOIDED'' AND "voidedAt" IS NOT NULL AND length("voidReason")>0))
);
CREATE UNIQUE INDEX "CourseTrialPayment_one_success" ON "CourseTrialPayment"("bookingId") WHERE status=''SUCCESS'';
CREATE INDEX "CourseTrialPayment_storeId_createdAt_idx" ON "CourseTrialPayment"("storeId","createdAt");
ALTER TABLE "CourseTrialPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseTrialPayment" FROM anon, authenticated;
COMMIT;
']::text[]);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260918235710','course_batch2_catalog_qualifications',ARRAY['-- Additive only. Existing bookings, account links, balances and snapshots remain intact.
-- Rollback: revert application, keep columns/data. Do not drop populated columns.
ALTER TABLE "CourseTemplate" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT ''PUBLIC'', ADD COLUMN "classType" TEXT;
UPDATE "CourseTemplate" SET "visibility"=''OFF'' WHERE NOT "isActive";
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_visibility_check" CHECK ("visibility" IN (''PUBLIC'',''HIDDEN'',''OFF'')), ADD CONSTRAINT "CourseTemplate_classType_check" CHECK ("classType" IS NULL OR "classType" IN (''PRIVATE'',''GROUP''));
ALTER TABLE "CourseRoom" ADD COLUMN "equipment" TEXT NOT NULL DEFAULT '''', ADD COLUMN "location" TEXT NOT NULL DEFAULT '''';
ALTER TABLE "Staff" ADD COLUMN "courseCoachEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "courseQualificationsConfirmed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "courseQualifiedTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "courseBirthday" DATE, ADD COLUMN "emergencyContactRelation" TEXT NOT NULL DEFAULT '''';
-- Preserve existing course teachers; no new qualification is inferred from history.
UPDATE "Staff" s SET "courseCoachEnabled"=true FROM "Store" st
 WHERE st.id=s."storeId" AND st."industryModule"::text=''COURSE''
 AND (EXISTS(SELECT 1 FROM "CourseSession" c WHERE c."storeId"=s."storeId" AND c."coachId"=s.id)
 OR EXISTS(SELECT 1 FROM "StaffMemberLink" l WHERE l."storeId"=s."storeId" AND l."staffId"=s.id)
 OR EXISTS(SELECT 1 FROM "User" u WHERE u.id=s."userId" AND u.role::text=''CUSTOMER''));
']::text[]);
COMMIT;
