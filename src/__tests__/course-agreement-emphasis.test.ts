import {expect,it} from 'vitest';
import {courseAgreementTextRuns} from '@/lib/course-agreement-emphasis';
it('preserves all text across overlapping, repeated and multiline highlights',()=>{
 const body='請於前一日 21:00 前請假。\n\n前一日 21:00。<script>保留純文字</script>';
 const runs=courseAgreementTextRuns({title:'條款',body,emphasis:['前一日','前一日 21:00','不在本文的內容']});
 expect(runs.map(r=>r.text).join('')).toBe(body);
 expect(runs.filter(r=>r.emphasized).map(r=>r.text)).toEqual(['前一日 21:00','前一日 21:00']);
});
it('does not retroactively emphasize legacy snapshots or interpret markup',()=>{
 const body='**重要** <u>退費</u> 原有內容';
 expect(courseAgreementTextRuns({title:'舊條款',body})).toEqual([{text:body,emphasized:false}]);
});
