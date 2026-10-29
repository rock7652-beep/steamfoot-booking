import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),user:vi.fn(),permission:vi.fn(),feature:vi.fn(),people:vi.fn(),rows:vi.fn(),anchor:vi.fn(),cards:vi.fn(),held:vi.fn(),techs:vi.fn(),raw:vi.fn(),tx:vi.fn(),update:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.people}}}));
vi.mock('@/lib/session',()=>({getCurrentUser:m.user}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({assignedStaffId:'self'})}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyAppointment:{findMany:m.rows,findFirst:m.anchor,groupBy:m.held},beautyCard:{findMany:m.cards},beautyTechnician:{findMany:m.techs},$queryRaw:m.raw}}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.tx,audit:m.audit}));
import {readBeautyNativeRoster,saveBeautyNativeRosterNote} from '@/server/actions/beauty-native-roster';
const actor={storeId:'store',userId:'owner'},row={id:'b',storeId:'store',groupId:'g',group:{customerId:'c',contactName:'本人'},customerId:'c',personName:'顧客',personPhone:'0900000000',technicianId:'t',locationId:'room',serviceId:'s',serviceName:'做臉',price:1000,cardId:'card',isTrial:false,status:'NO_SHOW',debit:false,notes:'原備註',revision:2,startsAt:new Date('2026-11-02T01:00:00Z'),endsAt:new Date('2026-11-02T02:00:00Z'),occupiedEndsAt:new Date('2026-11-02T02:15:00Z'),createdAt:new Date('2026-10-23T01:00:00Z')};
const tx={beautyAppointment:{findFirst:m.anchor,update:m.update}};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue(actor);m.user.mockResolvedValue({role:'PARTNER',staffId:'self'});m.permission.mockResolvedValue(true);m.feature.mockResolvedValue(true);m.rows.mockResolvedValue([row]);m.anchor.mockResolvedValue(row);m.people.mockResolvedValue([{id:'c',phone:'0900000000',serviceNote:'店內提醒',notes:null,assignedStaff:{id:'manager',storeId:'store',displayName:'店長'}}]);m.cards.mockResolvedValue([{id:'card',remaining:4,memberIds:['c'],name:'五次方案',serviceIds:['s'],allowShared:false,expiresAt:new Date('2090-01-01'),closedAt:null}]);m.held.mockResolvedValue([{cardId:'card',_count:{id:2}}]);m.techs.mockResolvedValue([{id:'t',name:'技師'}]);m.raw.mockResolvedValue([{id:'room',name:'床位'}]);m.tx.mockImplementation((_a,work)=>work(tx));});
it('reads authoritative service duration, cleanup, debit and all reservations on the card',async()=>{expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:true,data:{roster:[{status:'NO_SHOW',cardRemaining:4,available:2,service:{revision:2,debit:false,available:2,serviceName:'做臉',technicianName:'技師',locationName:'床位',endsAt:row.endsAt.toISOString(),occupiedEndsAt:row.occupiedEndsAt.toISOString()}}]}});expect(m.rows.mock.calls[0][0].where).toMatchObject({storeId:'store',startsAt:{gte:expect.any(Date),lte:expect.any(Date)}});});
it('does not read or disclose card identity or balances without wallet permission',async()=>{m.permission.mockImplementation(async(_r,_s,p)=>p!=='wallet.read');expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:true,data:{roster:[{cardId:null,cardRemaining:null,bookingKind:'CARD',service:{available:null}}]}});expect(m.cards).not.toHaveBeenCalled();expect(m.held).not.toHaveBeenCalled();});
it('does not read or disclose customer contacts or notes without customer permission',async()=>{m.permission.mockImplementation(async(_r,_s,p)=>p!=='customer.read');expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:true,data:{roster:[{customerId:null,customerPhone:'',notes:'',serviceNote:''}]}});expect(m.people).not.toHaveBeenCalled();});
it('rejects foreign booking anchors and invalid dates before listing records',async()=>{m.anchor.mockResolvedValue(null);expect(await readBeautyNativeRoster('booking:foreign')).toMatchObject({success:false});expect(m.anchor).toHaveBeenCalledWith({where:{id:'foreign',storeId:'store'},select:{groupId:true}});expect(await readBeautyNativeRoster('day:2026-02-30')).toMatchObject({success:false});expect(await readBeautyNativeRoster('arbitrary')).toMatchObject({success:false});expect(m.rows).not.toHaveBeenCalled();});
it('saves notes under the original Store lock with CAS and advances the booking revision',async()=>{const r=await saveBeautyNativeRosterNote({sessionId:'day:2026-11-02',bookingId:'b',expectedNote:'原備註',note:'更新'});expect(r).toMatchObject({success:true,revision:3});expect(m.update).toHaveBeenCalledWith({where:{id:'b'},data:{notes:'更新',revision:{increment:1}}});expect(m.audit).toHaveBeenCalled();});
it('rejects stale note edits, foreign day scopes and other groups without overwriting',async()=>{expect(await saveBeautyNativeRosterNote({sessionId:'day:2026-11-02',bookingId:'b',expectedNote:'過期',note:'更新'})).toMatchObject({success:false,currentValue:'原備註'});expect(await saveBeautyNativeRosterNote({sessionId:'day:2026-11-03',bookingId:'b',expectedNote:'原備註',note:'更新'})).toMatchObject({success:false});m.anchor.mockResolvedValueOnce(row).mockResolvedValueOnce({groupId:'other'});expect(await saveBeautyNativeRosterNote({sessionId:'booking:other',bookingId:'b',expectedNote:'原備註',note:'更新'})).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();});
it('recognizes a committed note retry without advancing the revision again',async()=>{expect(await saveBeautyNativeRosterNote({sessionId:'day:2026-11-02',bookingId:'b',expectedNote:'舊備註',note:'原備註'})).toMatchObject({success:true,revision:2});expect(m.update).not.toHaveBeenCalled();});
it('denies unauthorized access before reading or writing the service store',async()=>{m.manager.mockRejectedValue(Error('denied'));expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:false});expect(await saveBeautyNativeRosterNote({sessionId:'day:2026-11-02',bookingId:'b',expectedNote:'原備註',note:'更新'})).toMatchObject({success:false});expect(m.rows).not.toHaveBeenCalled();expect(m.tx).not.toHaveBeenCalled();});

it('shows the current authorized customer name and phone without rewriting appointment snapshots',async()=>{
 m.people.mockResolvedValue([{id:'c',name:'更新姓名',phone:'0999999999',serviceNote:'更新店內備註',notes:'',assignedStaff:{id:'self',displayName:'新所屬店長',storeId:'store'}}]);
 const result=await readBeautyNativeRoster('day:2026-11-02');expect(result).toMatchObject({success:true,data:{roster:[{customerName:'更新姓名',customerPhone:'0999999999',assignedCoachName:'新所屬店長',serviceNote:'更新店內備註'}]}});
 expect(row.personName).toBe('顧客');expect(row.personPhone).toBe('0900000000');expect(m.update).not.toHaveBeenCalled();
 expect(m.people).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'store',assignedStaffId:'self',mergedIntoCustomerId:null}),select:expect.objectContaining({name:true,phone:true})}));
});
it('retains the booking snapshot for an unlinked or invisible customer',async()=>{m.people.mockResolvedValue([]);expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:true,data:{roster:[{customerName:row.personName,customerPhone:row.personPhone}]}});});

it('includes a renewed service package and all shared holds while keeping the debit source',async()=>{
 const base={memberIds:['c'],name:'做臉方案',serviceIds:['s'],allowShared:false,expiresAt:new Date('2090-01-01'),closedAt:null};
 const old={...base,id:'card',remaining:1},renewal={...base,id:'renewal',remaining:20,memberIds:['c','family']};
 m.cards.mockImplementation(async q=>q.where.id?[old]:[old,renewal]);
 m.held.mockResolvedValue([{cardId:'card',_count:{id:1}},{cardId:'renewal',_count:{id:2}}]);
 const result=await readBeautyNativeRoster('day:2026-11-02');
 expect(result).toMatchObject({success:true,data:{roster:[{cardId:'card',cardRemaining:1,applicableBalance:{
  groups:[{unit:'USE',remaining:21,held:3,available:18}],cards:[{id:'card'},{id:'renewal',shared:true}]
 }}]}});
 expect(m.cards.mock.calls[1][0].where).toMatchObject({storeId:'store',closedAt:null,memberIds:{hasSome:['c']}});
 expect(m.held.mock.calls[0][0].where).toMatchObject({storeId:'store',cardId:{in:['card','renewal']},status:'RESERVED'});
});
it('excludes expired, closed and different-service packages from the beauty total',async()=>{
 const base={memberIds:['c'],name:'方案',serviceIds:['s'],allowShared:false,expiresAt:new Date('2090-01-01'),closedAt:null,remaining:20};
 m.cards.mockImplementation(async q=>q.where.id?[]:[
  {...base,id:'valid'},
  {...base,id:'expired',expiresAt:new Date('2000-01-01')},
  {...base,id:'closed',closedAt:new Date()},
  {...base,id:'other-service',serviceIds:['other']},
  {...base,id:'other-person',memberIds:['other']},
 ]);
 expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:true,data:{roster:[{applicableBalance:{
  groups:[{unit:'USE',remaining:20,held:0,available:20}],cards:[{id:'valid'}]
 }}]}});
});
it('honors purchased technician restrictions and rejects corrupt snapshots in the total',async()=>{
 vi.stubEnv('BEAUTY_CHARGE_RULES_ENABLED','1');
 vi.stubEnv('BEAUTY_CHARGE_RULES_SCOPE','stores');
 vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','store');
 try {
  const base={planId:'plan',memberIds:['c'],name:'方案',serviceIds:['s'],allowShared:false,expiresAt:new Date('2090-01-01'),closedAt:null};
  const cards=[{...base,id:'card',remaining:1},{...base,id:'renewal',remaining:20},{...base,id:'other-tech',remaining:99},{...base,id:'corrupt',remaining:99}];
  m.cards.mockImplementation(async q=>q.where.id?[cards[0]]:cards);
  m.raw.mockImplementation(async strings=>strings.join('').includes('FROM "BeautyCard"')?cards.map(c=>({
   id:c.id,ruleIsNull:false,chargeRuleSnapshot:c.id==='corrupt'?null:{version:1,rule:{
    storeId:'store',chargeId:'plan:plan',revision:1,serviceIds:['s'],mode:'SELECTED',technicianIds:[c.id==='other-tech'?'other':'t']
   }}
  })):[{id:'room',name:'床位'}]);
  m.held.mockResolvedValue([{cardId:'card',_count:{id:1}}]);
  expect(await readBeautyNativeRoster('day:2026-11-02')).toMatchObject({success:true,data:{roster:[{applicableBalance:{
   groups:[{unit:'USE',remaining:21,held:1,available:20}],cards:[{id:'card'},{id:'renewal'}]
  }}]}});
 } finally {vi.unstubAllEnvs();}
});
