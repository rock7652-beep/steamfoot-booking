import {expect,it} from 'vitest';
import {isNextDayReminderBatch,nextDayReminderTriggerAt} from '@/lib/next-day-reminder-time';
import {beautyNotificationMessages} from '@/lib/beauty/notification-message';

it.each([
 ['2026-10-26T09:59:59Z',false],['2026-10-26T10:00:00Z',true],
 ['2026-10-26T10:04:59Z',true],['2026-10-26T10:05:00Z',false],
 ['2026-10-26T13:59:00Z',false],['2026-10-26T16:00:00Z',false],
])('uses only the Taiwan 18:00 cron window for %s', (instant,allowed)=>{
 expect(isNextDayReminderBatch(new Date(instant))).toBe(allowed);
});
it('uses the Taiwan date after UTC midnight crossings',()=>{
 expect(nextDayReminderTriggerAt(new Date('2026-10-26T16:05Z')).toISOString()).toBe('2026-10-27T10:00:00.000Z');
});
it('builds a branded Flex with store-specific membership and contact actions',()=>{
 const [card]=beautyNotificationMessages({kind:'MOVED',body:'原事件',storeName:'測試店',customerName:'測試顧客',serviceName:'按摩',time:'2026-10-27 10:00',memberUrl:'https://liff.line.me/902-test/bookings',contactUrl:'https://line.me/R/ti/p/@test'});
 expect(card.type).toBe('flex');const json=JSON.stringify(card);
 for(const text of ['預約改期','測試店','測試顧客','按摩','2026-10-27 10:00','查看預約','聯繫店家'])expect(json).toContain(text);
 expect(json).toContain('https://liff.line.me/902-test/bookings');
});
it('does not invent another store link when the account is unconfigured',()=>{
 const json=JSON.stringify(beautyNotificationMessages({kind:'REMINDER',body:'明日服務',storeName:'店家',memberUrl:'javascript:invalid'}));
 expect(json).not.toContain('javascript:');expect(json).not.toContain('查看預約');expect(json).toContain('明日服務');
});
