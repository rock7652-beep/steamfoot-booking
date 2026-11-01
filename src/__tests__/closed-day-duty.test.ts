import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({industry:vi.fn(),special:vi.fn(),hours:vi.fn(),overrides:vi.fn(),upsert:vi.fn(),permission:vi.fn()}));
const hours={dayOfWeek:2,isOpen:false,openTime:null,closeTime:null,slotInterval:60,defaultCapacity:6};
const override={date:new Date('2030-11-05'),startTime:'19:30',type:'enabled',capacity:4,reason:null};
vi.mock('@/lib/db',()=>({prisma:{specialBusinessDay:{findFirst:m.special,findMany:async()=>[]},businessHours:{findFirst:m.hours,findMany:async()=>[hours]},slotOverride:{findMany:m.overrides},staff:{findMany:async()=>[],findUnique:async()=>({id:'staff',storeId:'s',status:'ACTIVE'})},dutyAssignment:{groupBy:async()=>[],upsert:m.upsert}}}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:m.industry}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>({role:'OWNER',storeId:'s',staffId:'staff'})}));
vi.mock('@/lib/permissions',()=>({checkPermission:async()=>true,requirePermission:m.permission}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:async()=> 's',resolveWriteStoreId:async()=> 's'}));
vi.mock('@/lib/manager-visibility',()=>({getStoreFilter:()=>({storeId:'s'}),assertStoreAccess:vi.fn()}));
vi.mock('@/server/queries/duty',()=>({getDutyByDate:async()=>[]}));
vi.mock('@/lib/revalidation',()=>({revalidateDuty:vi.fn()}));
vi.mock('@/server/services/course-duty-mutation',()=>({withDutyMutation:async(_store:string,work:(db:unknown,course:boolean)=>unknown)=>{const {prisma}=await import('@/lib/db');return work(prisma,false)}}));
vi.mock('@/app/(dashboard)/dashboard/duty/[date]/duty-day-editor',()=>({DutyDayEditor:()=>null}));
import DutyDayPage from '@/app/(dashboard)/dashboard/duty/[date]/page';
import {upsertDutyAssignment} from '@/server/actions/duty';
import {serviceHoursReceipt} from '@/server/services/service-hours-state';
beforeEach(()=>{vi.clearAllMocks();m.industry.mockResolvedValue('steamfoot');m.special.mockResolvedValue(null);m.hours.mockResolvedValue(hours);m.overrides.mockResolvedValue([override]);m.upsert.mockResolvedValue({id:'duty'});m.permission.mockResolvedValue({role:'OWNER',storeId:'s',staffId:'staff'});});
it('值班日表允許編輯加開時段，週複製目標包含該日',async()=>{
 const view=await DutyDayPage({params:Promise.resolve({date:'2030-11-05'}),searchParams:Promise.resolve({})});
 const props=view.props.children.props;
 expect(props).toMatchObject({isClosed:false,slots:['19:30']});
 expect(props.weekDayInfo.find((d:{date:string})=>d.date==='2030-11-05')).toMatchObject({isBusinessDay:true});
 expect(props.weekDayInfo.find((d:{date:string})=>d.date==='2030-11-06')).toMatchObject({isBusinessDay:false});
});
it('課程值班不採用蒸足的加開覆寫',async()=>{
 m.industry.mockResolvedValue('course');
 const view=await DutyDayPage({params:Promise.resolve({date:'2030-11-05'}),searchParams:Promise.resolve({})});
 expect(view.props.children.props).toMatchObject({isClosed:true,slots:[]});
});
it('後端允許指定加開時段值班，仍阻擋其他公休時段',async()=>{
 const input={date:'2030-11-05',slotTime:'19:30',staffId:'staff',dutyRole:'SERVICE',participationType:'FULL'};
 // Use the actual schema's enums below; no database writes are performed.
 const {dutyAssignmentSchema}=await import('@/lib/validators/duty');
 const role=dutyAssignmentSchema.shape.dutyRole.options[0],participation=dutyAssignmentSchema.shape.participationType.options[0];
 expect(await upsertDutyAssignment({...input,dutyRole:role,participationType:participation})).toMatchObject({success:true});
 m.upsert.mockClear();
 expect(await upsertDutyAssignment({...input,slotTime:'18:30',dutyRole:role,participationType:participation})).toMatchObject({success:false});
 expect(m.upsert).not.toHaveBeenCalled();
});
it('設定回執僅為蒸足開放公休加開，美業維持公休',()=>{
 const state={hours:[hours],specials:[],overrides:[override]};
 const steam=serviceHoursReceipt(state,'2030-11-05',true),beauty=serviceHoursReceipt(state,'2030-11-05');
 expect(steam.day).toMatchObject({status:'closed',canAddSlotsOnClosedDay:true,slots:[{startTime:'19:30',capacity:4}]});
 expect(steam.summary['2030-11-05']).toMatchObject({status:'custom',slotCount:1});
 expect(beauty.day).toMatchObject({status:'closed',canAddSlotsOnClosedDay:false,slots:[]});
 expect(beauty.summary['2030-11-05']).toMatchObject({status:'closed',slotCount:0});
});
