import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect,vi} from 'vitest';
import {preparedRoster} from './fixtures/prepared-roster';
import {RosterPlanSummary} from '@/app/(dashboard)/dashboard/courses/roster-plan-summary';
it('以兩行顯示實際方案與單卡餘額，期限及紀錄不攤在名單',()=>{
 const booking=preparedRoster().roster[0];booking.status='ATTENDED';booking.sportsBalance!.remaining=99;
 const html=renderToStaticMarkup(h(RosterPlanSummary,{booking,onOpen:vi.fn()}));
 for(const text of ['剩 8 堂','十堂方案'])expect(html).toContain(text);
 expect(html).not.toContain('2027-01-01');expect(html).not.toContain('此方案上課紀錄');expect(html).not.toContain('99');expect(html).not.toContain('適用方案合計');
});
it('未綁卡時標示適用方案合計及查看方案，不虛構已使用的方案',()=>{
 const booking=preparedRoster().roster[0];booking.cardId=null;booking.bookingKind='UNPAID';
 const html=renderToStaticMarkup(h(RosterPlanSummary,{booking,onOpen:vi.fn()}));
 expect(html).toContain('適用方案合計');expect(html).toContain('查看方案');expect(html).not.toContain('此方案上課紀錄');expect(html).not.toContain('2027-01-01');
});

