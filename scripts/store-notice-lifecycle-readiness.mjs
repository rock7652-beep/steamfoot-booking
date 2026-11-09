import {readFileSync} from 'node:fs';
import {reviewedNoticeLifecycleSql} from './store-notice-lifecycle-release-review.mjs';
import {verifyStoreNoticePublishPolicy} from './store-notice-action-policy-readiness.mjs';
export const NOTICE_LIFECYCLE_FINGERPRINT='27af17e45cc23f72cd85f89b6d5f83fb';
/** Read-only: validates the exact additive schema before the legacy baseline gate. */
export async function verifyStoreNoticeLifecycleReadiness(tx,{readArchive=false}={}){
 const original=reviewedNoticeLifecycleSql();
 let sql=readFileSync('scripts/qa/store-notice-lifecycle-schema-fingerprint.sql','utf8'),parameters=[];
 if(readArchive){
  await verifyStoreNoticePublishPolicy(tx);
  const body=original.match(/CREATE FUNCTION public\.publish_store_notice\(\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$/)?.[1];
  if(!body)throw Error('notice_original_publish_source_rejected');
  // Only normalize the explicitly verified new publisher. Every column, index,
  // trigger and other function retains its original strict fingerprint check.
  sql=sql.replace('p.proname,p.prosrc,p.prosecdef',"p.proname,CASE WHEN p.proname='publish_store_notice' THEN $1::text ELSE p.prosrc END,p.prosecdef");parameters=[body];
 }
 const [shape]=await tx.$queryRawUnsafe(sql,...parameters);
 if(shape?.fingerprint!==NOTICE_LIFECYCLE_FINGERPRINT)throw Error('notice_lifecycle_schema_rejected');
 const report=readFileSync('scripts/qa/store-notice-lifecycle-postflight.sql','utf8');
 const [result]=await tx.$queryRawUnsafe(report.slice(report.indexOf('WITH required_tables'),report.lastIndexOf('COMMIT;')));
 const required=['columnsReady','publishTriggersReady','beautyReadGrantReady','destructiveCapabilitiesAbsent'];
 if(required.some(key=>result?.postflight?.[key]!==true))throw Error('notice_lifecycle_access_rejected');
 return true;
}
