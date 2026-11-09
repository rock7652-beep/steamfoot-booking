import {expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({prisma:{}}));
const m=vi.hoisted(()=>({raw:vi.fn()}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw}}));
import {projectBeautyPublicCalendar,readBeautyPublicCalendar} from '@/server/beauty/public-calendar';
import {isBeautyPublicDateClosed} from '@/lib/beauty/public-calendar';
import type {BusinessHoursRow,SpecialDayRow} from '@/lib/business-hours-resolver';
const hours:BusinessHoursRow[]=[0,1,2,3,4,5,6].map(dayOfWeek=>({dayOfWeek,isOpen:dayOfWeek!==1,openTime:'09:00',closeTime:'18:00',slotInterval:30,defaultCapacity:1}));
it('uses existing business rules for weekly holidays, special reopening, holidays and training, without exposing internal reasons',()=>{
 const specials:SpecialDayRow[]=[{date:new Date('2026-11-02T00:00Z'),type:'custom',reason:'private',openTime:'10:00',closeTime:'14:00',slotInterval:30,defaultCapacity:1},{date:new Date('2026-11-03T00:00Z'),type:'closed',reason:'private',openTime:null,closeTime:null,slotInterval:null,defaultCapacity:null},{date:new Date('2026-11-04T00:00Z'),type:'training',reason:'private',openTime:null,closeTime:null,slotInterval:null,defaultCapacity:null}];
 const c=projectBeautyPublicCalendar(hours,specials);expect(isBeautyPublicDateClosed(c,'2026-11-09')).toBe(true);expect(isBeautyPublicDateClosed(c,'2026-11-02')).toBe(false);expect(isBeautyPublicDateClosed(c,'2026-11-03')).toBe(true);expect(isBeautyPublicDateClosed(c,'2026-11-04')).toBe(true);expect(isBeautyPublicDateClosed(c,'2026-11-05')).toBe(false);expect(JSON.stringify(c)).not.toContain('private');
});
it('treats an unconfigured weekly day as closed and leaves legacy calendars without a snapshot to authoritative slot reads',()=>{expect(isBeautyPublicDateClosed(projectBeautyPublicCalendar([],[]),'2026-11-02')).toBe(true);expect(isBeautyPublicDateClosed(undefined,'2026-11-02')).toBe(false);});

it('reads only the authorized store calendar and projects only public opening state',async()=>{m.raw.mockResolvedValueOnce(hours).mockResolvedValueOnce([]).mockResolvedValueOnce([]);const result=await readBeautyPublicCalendar('authorized-store');expect(result.weekdays).toHaveLength(7);expect(m.raw.mock.calls).toHaveLength(3);for(const call of m.raw.mock.calls)expect(call.slice(1)).toEqual(['authorized-store']);});
