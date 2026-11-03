import {expect,it} from 'vitest';
import {reviewedNoticeLifecycleSql,assertNoticeGraceBaseline,NOTICE_GRACE_BASELINE} from '../../scripts/store-notice-lifecycle-release-review.mjs';
it('pins the approved one-time grace backfill candidate',()=>{
 const sql=reviewedNoticeLifecycleSql();expect(sql).toContain('AND "handledAt" IS NULL THEN statement_timestamp()');expect(sql).toContain('ELSE "createdAt" END');expect(sql).not.toContain('DELETE FROM');expect(sql).not.toContain('CREATE ROLE');expect(sql).not.toContain('SECURITY DEFINER');
});
it('accepts only the exact reviewed two-message population, not just the count',()=>{
 expect(assertNoticeGraceBaseline(NOTICE_GRACE_BASELINE)).toBe(true);
 expect(()=>assertNoticeGraceBaseline({...NOTICE_GRACE_BASELINE,count:3})).toThrow('population_changed');
 expect(()=>assertNoticeGraceBaseline({...NOTICE_GRACE_BASELINE,fingerprint:'different'})).toThrow('population_changed');
 expect(()=>assertNoticeGraceBaseline(null)).toThrow('population_changed');
});
