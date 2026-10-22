import {expect,it} from 'vitest';
import {beautyScheduleRange} from '@/lib/beauty/calendar';
import {toLocalDateStr} from '@/lib/date-utils';
it.each(['2026-10-19','2026-10-22','2026-10-25'])('queries the entire displayed week when selected date is %s',date=>{const r=beautyScheduleRange(date,'week');expect(toLocalDateStr(r.start)).toBe('2026-10-19');expect(toLocalDateStr(r.end)).toBe('2026-10-25');});
it('does not lose the previous-year days of a week crossing midnight and New Year',()=>{const r=beautyScheduleRange('2027-01-01','week');expect(r.start.toISOString()).toBe('2026-12-27T16:00:00.000Z');expect(toLocalDateStr(r.end)).toBe('2027-01-03');});
