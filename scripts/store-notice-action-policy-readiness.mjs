import {readFileSync} from 'node:fs';
/** Read-only check: old DB policy must not silently accept a new app build. */
export const STORE_NOTICE_ACTION_POLICY_HASH='af0dacaaf9a3a17530c29fff1fd09549';
export const STORE_RECEIVABLE_INDEXES=['Booking_receivable_idx','BeautyAppointment_receivable_idx','BookingParticipant_receivable_idx','Transaction_receivable_booking_idx','Transaction_receivable_participant_idx','CourseSession_receivable_idx','CourseTrialPayment_receivable_idx','CoursePurchase_receivable_idx','BeautyPayment_receivable_idx'];
export function storeNoticeActionSources(){
 const sql=readFileSync(new URL('./sql/store-notice-action-policy.sql',import.meta.url),'utf8');
 const body=sql.match(/AS \$fn\$([\s\S]*?)\$fn\$/)?.[1];
 const sourceBody=(name,tag)=>sql.match(new RegExp(`FUNCTION public\\.${name}\\(\\)[\\s\\S]*?AS \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`))?.[1];
 const content=sourceBody('record_course_booking_content_notice','content'),lead=sourceBody('record_digital_manager_lead_notice','notice'),vip=sourceBody('record_digital_manager_vip_notice','notice'),publish=sourceBody('publish_store_notice','publish');
 if(!body||!content||!lead||!vip||!publish)throw Error('notice_action_policy_source_rejected');
 return {body,content,lead,vip,publish};
}
export async function verifyStoreNoticePublishPolicy(client){
 const {publish}=storeNoticeActionSources();
 const rows=await client.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='publish_store_notice' AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype AND p.prosrc=$1 AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AS ok`,publish);
 if(rows[0]?.ok!==true)throw Error('notice_publish_policy_not_ready');
}
export async function verifyStoreNoticeActionPolicy(client){
 await verifyStoreNoticePublishPolicy(client);
 const {body,content,lead,vip}=storeNoticeActionSources();
 const rows=await client.$queryRawUnsafe(`SELECT
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='suppress_informational_store_notice' AND p.prosrc=$1 AND NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AND
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='record_course_booking_content_notice' AND p.prosrc=$2 AND NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AND
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='record_digital_manager_lead_notice' AND p.prosrc=$3 AND NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AND
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='record_digital_manager_vip_notice' AND p.prosrc=$4 AND NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AND
  (SELECT count(*)=2 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname IN ('SteamfootStoreNotice','CourseStoreNotice') AND t.tgname IN ('action_only_steam_notice','action_only_course_notice') AND t.tgfoid=to_regprocedure('public.suppress_informational_store_notice()') AND t.tgenabled='O' AND t.tgtype=23) AND
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public."CourseBooking"'::regclass AND tgname='course_booking_content_notice' AND tgfoid=to_regprocedure('public.record_course_booking_content_notice()') AND tgenabled='O' AND tgtype=17) AND
  (SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename='DigitalManagerNotice' AND policyname IN ('beauty_digital_manager_read','beauty_digital_manager_update') AND md5(qual)=$5 AND (cmd='SELECT' AND with_check IS NULL OR cmd='UPDATE' AND md5(with_check)=$5)) AND
  EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."CourseStoreNotice"'::regclass AND conname='CourseStoreNotice_kind_check' AND convalidated AND pg_get_constraintdef(oid) LIKE '%UPDATE%') AND
  (SELECT count(*)=9 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($6::text[]) AND i.indisvalid AND i.indisready) AS ok`,body,content,lead,vip,STORE_NOTICE_ACTION_POLICY_HASH,STORE_RECEIVABLE_INDEXES);
 if(rows[0]?.ok!==true)throw Error('notice_action_policy_not_ready');
 return true;
}
