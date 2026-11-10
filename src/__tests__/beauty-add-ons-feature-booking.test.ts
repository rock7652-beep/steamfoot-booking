import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({enabled:vi.fn(),allocate:vi.fn()}));
vi.mock('@/server/services/add-on-access',()=>({isBeautyServiceAddOnsEnabled:m.enabled}));
vi.mock('@/server/beauty/charge-runtime',()=>({beautyChargeRulesEnabled:()=>false}));
vi.mock('@/lib/beauty/allocation',()=>({allocateParty:m.allocate}));
vi.mock('@/lib/course-business-hours',()=>({resolvedCourseHours:()=>({periods:[]})}));
vi.mock('@/lib/auth',()=>({auth:vi.fn()}));
vi.mock('@/lib/session',()=>({requireSession:vi.fn(),getCurrentUser:vi.fn(),requireStaffSession:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
vi.mock('@/server/beauty/access',()=>({beautyTransaction:vi.fn(),command:vi.fn(),audit:vi.fn()}));
import {findAllocation} from '@/server/beauty/booking';
type Args=Parameters<typeof findAllocation>;
const groups=[{id:'g',title:'卸甲方式',required:true,multiple:false,options:[{id:'extra',name:'卸甲',duration:30,price:100,active:true}]}];
const loaded={services:[{id:'s',duration:60,buffer:0,addOnGroups:groups}],technicians:[],locations:[],occupied:[],hours:[],specials:[],policy:{leadMinutes:0,bookableDays:30},slots:['10:00'],memberSlots:[]} as unknown as NonNullable<Args[5]>;
const input={date:'2026-11-01',time:'10:00',people:[{serviceId:'s',addOnIds:[],customerId:null}]} as unknown as Args[2];
const actor={storeId:'store',userId:'u',manager:true};
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T01:00:00Z'));m.enabled.mockResolvedValue(false);m.allocate.mockReturnValue([]);});
afterEach(()=>vi.useRealTimers());
it('closed add-ons do not leave an impossible required question in a main-service booking',async()=>{
 const result=await findAllocation({} as Args[0],actor,input,[],undefined,loaded);
 expect(result.services[0].addOnGroups).toEqual([]);expect(result.services[0].duration).toBe(60);
 expect(loaded.services[0].addOnGroups).toEqual(groups);
});
it('rejects old-page or forged extra IDs after HQ/local closure',async()=>{
 await expect(findAllocation({} as Args[0],actor,{...input,people:input.people.map(p=>({...p,addOnIds:['extra']}))},[],undefined,loaded)).rejects.toThrow('附加選購已關閉');
 expect(m.allocate).not.toHaveBeenCalled();
});
it('retains established service duration snapshots when rescheduling after closure',async()=>{
 await findAllocation({} as Args[0],actor,input,['old-appointment'],undefined,loaded,false,{serviceId:'s',duration:90,buffer:5});
 expect(m.enabled).not.toHaveBeenCalled();
 expect(m.allocate).toHaveBeenCalledWith(expect.objectContaining({services:[expect.objectContaining({id:'s',duration:90,buffer:5,addOnGroups:[]})]}));
});
it('allows authorized manager backfill while retaining customer deadlines and slot rules',async()=>{
 const past={...input,date:'2026-10-30'};
 await expect(findAllocation({} as Args[0],actor,past,[],undefined,loaded)).resolves.toBeDefined();
 expect(m.allocate).toHaveBeenCalledOnce();
 await expect(findAllocation({} as Args[0],actor,past,[],undefined,{...loaded,policy:{...loaded.policy,bookableUntilDate:'2026-01-01',cancelDeduct:false as const,noShowDeduct:false as const}})).resolves.toBeDefined();
 m.allocate.mockClear();
 await expect(findAllocation({} as Args[0],{...actor,manager:false},past,[],undefined,loaded)).rejects.toThrow('預約截止');
 await expect(findAllocation({} as Args[0],actor,{...past,time:'03:17'},[],undefined,loaded)).rejects.toThrow('此開始時間未開放');
 await expect(findAllocation({} as Args[0],actor,{...input,date:'2027-01-01'},[],undefined,loaded)).rejects.toThrow('尚未開放');
 expect(m.allocate).not.toHaveBeenCalled();
});
