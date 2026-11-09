import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({stores:vi.fn(),feature:vi.fn(),transaction:vi.fn(),setting:vi.fn(),execute:vi.fn(),query:vi.fn(),appointments:vi.fn(),countAppointments:vi.fn(),countPurchases:vi.fn(),record:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findMany:m.stores}}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/server/beauty/access',()=>({beautyTransaction:m.transaction}));
vi.mock('@/server/services/digital-manager-notices',()=>({recordDigitalManagerNotice:m.record}));
import {runBeautyDigitalManagerReminders} from '@/server/beauty/digital-manager-reminders';
const now=new Date('2026-10-22T01:05:00Z');
const tx={beautySetting:{findUnique:m.setting},$executeRaw:m.execute,$queryRaw:m.query,beautyAppointment:{findMany:m.appointments,count:m.countAppointments},beautyPurchase:{count:m.countPurchases}};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BEAUTY_MODULE_ENABLED','1');vi.stubEnv('BEAUTY_NOTIFICATIONS_ENABLED','0');m.stores.mockResolvedValue([{id:'s'}]);m.feature.mockResolvedValue(true);m.transaction.mockImplementation(async(_actor,work)=>work(tx));m.setting.mockResolvedValue({backendNoticesEnabled:true});m.execute.mockResolvedValue(1);m.query.mockResolvedValue([{activatedAt:new Date('2026-10-20T00:00:00Z')}]);m.appointments.mockResolvedValue([{id:'appointment',endsAt:new Date('2026-10-21T23:30:00Z')}]);m.countPurchases.mockResolvedValue(1);m.countAppointments.mockResolvedValue(0);m.record.mockResolvedValue(1);});
afterEach(()=>vi.unstubAllEnvs());
it('creates incomplete and daily store notices with LINE disabled',async()=>{
 expect(await runBeautyDigitalManagerReminders(now)).toEqual({recorded:2,failed:0});
 expect(m.execute).toHaveBeenCalledTimes(2);expect(m.execute.mock.calls[1].slice(1)).toEqual(['s',new Date('2026-10-20T16:00:00Z'),new Date('2026-10-22T00:05:00Z')]);
 expect(m.record).toHaveBeenCalledWith(tx,{storeId:'s',eventKey:'beauty-digest:s:2026-10-22',eventType:'DAILY_ACTION_DIGEST',targetId:'s'});
 expect(m.stores).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({operatingStatus:{in:['ACTIVE','TRIAL']}})}));
});
it('ignores a legacy disabled setting and uses activation time to avoid historical backfill',async()=>{
 m.setting.mockResolvedValueOnce({backendNoticesEnabled:false});await runBeautyDigitalManagerReminders(now);expect(m.record).toHaveBeenCalledTimes(1);m.record.mockClear();m.execute.mockClear();
 m.query.mockResolvedValue([{activatedAt:now}]);m.appointments.mockResolvedValue([]);await runBeautyDigitalManagerReminders(now);
 expect(m.execute.mock.calls[1][2]).toEqual(new Date('2026-10-22T00:05:00Z'));expect(m.record).not.toHaveBeenCalled();
});
