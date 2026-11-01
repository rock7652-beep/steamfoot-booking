import {expect,it} from 'vitest';
import {NOTICE_LATEST_MS,NOTICE_RETENTION_MS,noticeSection,noticeWindow} from '@/lib/store-notice-lifecycle';
const now=new Date('2026-11-01T16:00:00Z');
it('uses elapsed time at exactly 72 and 240 hours, including Taiwan midnight',()=>{
 expect(noticeSection(new Date(now.getTime()-NOTICE_LATEST_MS+1),now)).toBe('latest');
 expect(noticeSection(new Date(now.getTime()-NOTICE_LATEST_MS),now)).toBe('history');
 expect(noticeSection(new Date(now.getTime()-NOTICE_RETENTION_MS+1),now)).toBe('history');
 expect(noticeSection(new Date(now.getTime()-NOTICE_RETENTION_MS),now)).toBe('expired');
 expect(noticeSection(new Date(now.getTime()+1),now)).toBe('expired');
 expect(noticeWindow(false,now).after).toEqual(noticeWindow(true,now).through);
 expect(noticeWindow(true,now).after).toEqual(new Date('2026-10-22T16:00:00Z'));
});
