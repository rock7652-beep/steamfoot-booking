import {beforeEach,expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/beauty-client';
const m=vi.hoisted(()=>({service:vi.fn(),technician:vi.fn(),raw:vi.fn(),cards:vi.fn(),holds:vi.fn(),reserve:vi.fn(),settings:vi.fn(),command:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({command:m.command}));
vi.mock('@/server/beauty/booking',()=>({reserveParty:m.reserve,settings:m.settings}));
import {reserveNativeBeautySchedule} from '@/server/beauty/native-schedule';
const actor={storeId:'store-a',userId:'owner',manager:true};
const tx={beautyService:{findFirst:m.service},beautyTechnician:{findFirst:m.technician},$queryRaw:m.raw,beautyCard:{findMany:m.cards},beautyAppointment:{groupBy:m.holds}} as unknown as Prisma.TransactionClient;
const requestKey='00000000-0000-4000-8000-000000000001';
const base={operation:'schedule',expectedServiceRevision:7,payload:{requestKey,subject:'service',kind:'單次',mode:'指定學員',date:'2026-12-10',time:'10:00',duration:60,count:1,coach:'untrusted label',coachId:'tech',room:'位置 A',capacity:1,students:['customer'],waitlistLimit:0,waitlistStopMinutes:240,price:0,customer:'untrusted',phone:'untrusted',customerId:null}};
function input(patch:Partial<typeof base.payload>={}){return {...base,payload:{...base.payload,...patch}};}
beforeEach(()=>{
 vi.clearAllMocks();
 m.service.mockResolvedValue({id:'service',revision:7,duration:60,trialPrice:800});
 m.technician.mockResolvedValue({id:'tech'});
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('').includes('CourseRoom')?[{id:'room'}]:[{id:'customer',name:'真正顧客',phone:'0900000001'}]);
 m.cards.mockResolvedValue([{id:'card',memberIds:['customer'],remaining:3}]);m.holds.mockResolvedValue([]);
 m.settings.mockResolvedValue({revision:2});m.reserve.mockResolvedValue({groupId:'group',ids:['appointment']});
 m.command.mockImplementation(async(_tx:unknown,_a:unknown,_k:unknown,_i:unknown,work:()=>unknown)=>work());
});
it('uses only store-bound Beauty data and the original reservation core, taking customer identity from the server',async()=>{
 expect(await reserveNativeBeautySchedule(tx,actor,input())).toEqual({groupId:'group',ids:['appointment']});
 expect(m.service).toHaveBeenCalledWith({where:{id:'service',storeId:'store-a',active:true}});
 expect(m.technician).toHaveBeenCalledWith({where:{id:'tech',storeId:'store-a',active:true,serviceIds:{has:'service'}}});
 expect(m.cards.mock.calls[0][0]).toMatchObject({where:{storeId:'store-a',closedAt:null,memberIds:{hasSome:['customer']}},orderBy:[{expiresAt:'asc'},{id:'asc'}]});
 expect(m.reserve.mock.calls[0][2]).toMatchObject({policyRevision:2,contactName:'真正顧客',phone:'0900000001',isTrial:false,people:[{name:'真正顧客',phone:'0900000001',customerId:'customer',serviceRevision:7,cardId:'card',specifiedTechnicianId:'tech',specifiedLocationId:'room'}]});
 expect(m.reserve.mock.calls[0][2].requestKey).not.toBe(requestKey);
 expect(m.command).toHaveBeenCalledWith(tx,actor,requestKey,input(),expect.any(Function));
});
it.each(['每週固定','隔週固定'])('does not silently turn %s into one appointment',async kind=>{
 await expect(reserveNativeBeautySchedule(tx,actor,input({kind}))).rejects.toThrow('固定週期');expect(m.command).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
it.each([{mode:'開放選課'},{waitlistLimit:2}])('rejects unsupported open/waitlist semantics before any creation: %j',async patch=>{
 await expect(reserveNativeBeautySchedule(tx,actor,input(patch))).rejects.toThrow('開放選課');expect(m.reserve).not.toHaveBeenCalled();
});
it('requires a manager even if called directly with a module actor',async()=>{
 await expect(reserveNativeBeautySchedule(tx,{...actor,manager:false},input())).rejects.toThrow('僅供店家');expect(m.raw).not.toHaveBeenCalled();
});
it.each([{students:[]},{students:['customer','customer'],capacity:2},{capacity:2}])('rejects empty/duplicate/mismatched participant intents: %j',async patch=>{
 await expect(reserveNativeBeautySchedule(tx,actor,input(patch))).rejects.toThrow();expect(m.reserve).not.toHaveBeenCalled();
});
it('rejects changed services and incompatible duration without ignoring the native fields',async()=>{
 m.service.mockResolvedValueOnce({id:'service',revision:8,duration:60});await expect(reserveNativeBeautySchedule(tx,actor,input())).rejects.toThrow('已更新');
 await expect(reserveNativeBeautySchedule(tx,actor,input({duration:45}))).rejects.toThrow('時長');expect(m.reserve).not.toHaveBeenCalled();
});
it('rejects foreign technician, missing/ambiguous room and missing/merged/inactive customers',async()=>{
 m.technician.mockResolvedValueOnce(null);await expect(reserveNativeBeautySchedule(tx,actor,input())).rejects.toThrow('本店');
 m.raw.mockResolvedValueOnce([{id:'a'},{id:'b'}]);await expect(reserveNativeBeautySchedule(tx,actor,input())).rejects.toThrow('位置');
 m.raw.mockResolvedValueOnce([{id:'room'}]).mockResolvedValueOnce([]);await expect(reserveNativeBeautySchedule(tx,actor,input())).rejects.toThrow('顧客');expect(m.reserve).not.toHaveBeenCalled();
});
it('respects outstanding holds and never over-allocates one shared card within a new party',async()=>{
 m.cards.mockResolvedValue([{id:'shared',memberIds:['customer','other'],remaining:2}]);m.holds.mockResolvedValue([{cardId:'shared',_count:{id:1}}]);
 m.raw.mockResolvedValueOnce([{id:'room'}]).mockResolvedValueOnce([{id:'customer',name:'一',phone:'0900000001'},{id:'other',name:'二',phone:'0900000002'}]);
 await expect(reserveNativeBeautySchedule(tx,actor,input({students:['customer','other'],capacity:2}))).rejects.toThrow('沒有可用方案');expect(m.reserve).not.toHaveBeenCalled();
});
it('chooses the next available authorized card without crediting or deducting any card itself',async()=>{
 m.cards.mockResolvedValue([{id:'held',memberIds:['customer'],remaining:1},{id:'other-person',memberIds:['other'],remaining:9},{id:'available',memberIds:['customer'],remaining:1}]);m.holds.mockResolvedValue([{cardId:'held',_count:{id:1}}]);
 await reserveNativeBeautySchedule(tx,actor,input());expect(m.reserve.mock.calls[0][2].people[0].cardId).toBe('available');
});
it('keeps trial bookings off cards and rejects a price override unsupported by the Beauty core',async()=>{
 await reserveNativeBeautySchedule(tx,actor,input({kind:'體驗',price:800}));expect(m.cards).not.toHaveBeenCalled();expect(m.reserve.mock.calls[0][2]).toMatchObject({isTrial:true,people:[{cardId:null}]});
 m.reserve.mockClear();await expect(reserveNativeBeautySchedule(tx,actor,input({kind:'體驗',price:799}))).rejects.toThrow('體驗費');expect(m.reserve).not.toHaveBeenCalled();
});
it('replays the native intent receipt before re-reading changed services or picking a different card',async()=>{
 m.command.mockResolvedValue({groupId:'previous',ids:['previous-item']});m.service.mockResolvedValue(null);
 expect(await reserveNativeBeautySchedule(tx,actor,input())).toMatchObject({groupId:'previous'});expect(m.service).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
