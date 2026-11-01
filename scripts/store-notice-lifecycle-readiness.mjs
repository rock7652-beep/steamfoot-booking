import {readFileSync} from 'node:fs';
import {reviewedNoticeLifecycleSql} from './store-notice-lifecycle-release-review.mjs';
export const NOTICE_LIFECYCLE_FINGERPRINT='27af17e45cc23f72cd85f89b6d5f83fb';
/** Read-only: validates the exact additive schema before the legacy baseline gate. */
export async function verifyStoreNoticeLifecycleReadiness(tx){
 reviewedNoticeLifecycleSql();
 const [shape]=await tx.$queryRawUnsafe(readFileSync('scripts/qa/store-notice-lifecycle-schema-fingerprint.sql','utf8'));
 if(shape?.fingerprint!==NOTICE_LIFECYCLE_FINGERPRINT)throw Error('notice_lifecycle_schema_rejected');
 const report=readFileSync('scripts/qa/store-notice-lifecycle-postflight.sql','utf8');
 const [result]=await tx.$queryRawUnsafe(report.slice(report.indexOf('WITH required_tables'),report.lastIndexOf('COMMIT;')));
 const required=['columnsReady','publishTriggersReady','beautyReadGrantReady','destructiveCapabilitiesAbsent'];
 if(required.some(key=>result?.postflight?.[key]!==true))throw Error('notice_lifecycle_access_rejected');
 return true;
}
