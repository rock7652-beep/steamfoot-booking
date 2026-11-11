import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),find:vi.fn(),lookup:vi.fn(),lock:vi.fn(),list:vi.fn(),create:vi.fn(),update:vi.fn(),auditFind:vi.fn(),auditCreate:vi.fn(),limit:vi.fn(),count:vi.fn()}));
vi.mock('@/lib/auth',()=>({auth:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.find,findMany:m.list,updateMany:m.update},$transaction:async(run:(tx:unknown)=>unknown)=>run({$queryRaw:m.lock,customer:{findFirst:(args:{where:{id?:unknown}})=>typeof args.where.id==='string'?m.find(args):m.lookup(args),count:m.count,create:m.create,updateMany:m.update},auditLog:{findUnique:m.auditFind,create:m.auditCreate}})}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{}}));
vi.mock('@/lib/addons-db',()=>({addonsPrisma:{}}));
vi.mock('@/lib/session',()=>({requireSession:vi.fn(),getCurrentUser:vi.fn(),requireStaffSession:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.manager,courseManagerRead:m.manager}));
vi.mock('@/lib/feature-gate',()=>({getStoreLimitsByStoreId:m.limit}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
vi.mock('next/server',()=>({after:vi.fn()}));
import {saveCourseCustomer} from '@/server/actions/course-members';
import {createScheduleCustomer} from '@/server/actions/course-schedule-enrollment';
import {searchCourseCustomers} from '@/server/actions/course-browse';
afterEach(()=>vi.unstubAllEnvs());
const base={name:'小安',phone:'0912345678',requestKey:'51331a2d-d143-4b60-820e-9e23da96cd71'};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:'store',user:{id:'manager',role:'OWNER',staffId:'staff'}});m.limit.mockResolvedValue({maxCustomers:null});m.count.mockResolvedValue(0);m.auditFind.mockResolvedValue(null);m.lookup.mockImplementation(async({where}:{where:{name?:string}})=>where.name?null:{id:'phone-owner'});m.create.mockImplementation(async({data}:{data:unknown})=>({id:'child',...data as object}));});
it('stores the shared phone as contact data and uses a receipt to prevent replay duplicates',async()=>{
 let receipt:unknown=null;m.auditCreate.mockImplementation(async({data}:{data:unknown})=>{receipt=data;});m.auditFind.mockImplementation(async()=>receipt);
 expect(await saveCourseCustomer(base)).toMatchObject({success:true,data:{id:'child'}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({storeId:'store',name:'小安',phone:'',contactPhone:'0912345678'})}));
 expect(await saveCourseCustomer(base)).toMatchObject({success:true,data:{id:'child'}});
 expect(m.create).toHaveBeenCalledOnce();
 expect(m.auditCreate.mock.calls[0][0].data.module).toBe('COURSE');
 expect(await saveCourseCustomer({...base,name:'小晴'})).toMatchObject({success:false,error:expect.stringContaining('建立請求已使用')});
 expect(m.create).toHaveBeenCalledOnce();
});
it('requires a stable request and preserves existing linked identities',async()=>{
 expect(await saveCourseCustomer({...base,requestKey:undefined})).toMatchObject({success:false,error:expect.stringContaining('重新開啟')});
 m.find.mockResolvedValue({phone:'0912345678',contactPhone:null,userId:'existing-user'});
 expect(await saveCourseCustomer({...base,id:'existing',sharedContactPhone:true})).toMatchObject({success:false,error:expect.stringContaining('已連結會員身分')});
 expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it('does not convert an existing contact-only learner back to a personal-phone identity when an older writer omits the flag',async()=>{
 m.find.mockResolvedValue({phone:'',contactPhone:'0912345678'});m.update.mockResolvedValue({count:1});
 expect(await saveCourseCustomer({...base,id:'child',sharedContactPhone:undefined})).toMatchObject({success:true});
 expect(m.update.mock.calls[0][0]).toMatchObject({where:{id:'child',storeId:'store'},data:{phone:'',contactPhone:'0912345678'}});
});
it.each(['personal','contact'])('updates an existing learner to a shared guardian number already stored as %s data',async kind=>{
 m.find.mockResolvedValue({phone:'0912345678',contactPhone:null});
 m.lookup.mockResolvedValue({id:'sibling',[kind==='personal'?'phone':'contactPhone']:'0987654321'});
 m.update.mockResolvedValue({count:1});
 const expectedUpdatedAt='2026-11-11T01:00:00.000Z';
 expect(await saveCourseCustomer({...base,id:'child',phone:'0987-654-321',expectedUpdatedAt})).toMatchObject({success:true,data:{id:'child'}});
 expect(m.lookup).toHaveBeenCalledWith({where:{storeId:'store',id:{not:'child'},OR:[{phone:'0987654321'},{contactPhone:'0987654321'}]},select:{id:true}});
 expect(m.lock).toHaveBeenCalledOnce();
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'child',storeId:'store',mergedIntoCustomerId:null,updatedAt:new Date(expectedUpdatedAt)},data:expect.objectContaining({phone:'',contactPhone:'0987654321'})}));
 expect(m.create).not.toHaveBeenCalled();
});
it('keeps an unchanged personal phone and its linked identity when another learner shares that contact',async()=>{
 m.find.mockResolvedValue({phone:base.phone,contactPhone:null,userId:'member'});m.update.mockResolvedValue({count:1});
 expect(await saveCourseCustomer({...base,id:'child'})).toMatchObject({success:true});
 expect(m.lookup).not.toHaveBeenCalled();
 expect(m.update.mock.calls[0][0].data).toMatchObject({phone:base.phone,contactPhone:null});
});
it('keeps a changed personal phone when the authorized store has no collision',async()=>{
 m.find.mockResolvedValue({phone:'0900000000',contactPhone:null});m.lookup.mockResolvedValue(null);m.update.mockResolvedValue({count:1});
 expect(await saveCourseCustomer({...base,id:'child'})).toMatchObject({success:true});
 expect(m.update.mock.calls[0][0].data).toMatchObject({phone:base.phone,contactPhone:null});
});
it.each(['userId','lineUserId','googleId','lineBindingCode'])('does not discard %s when automatically detecting a shared phone',async field=>{
 m.find.mockResolvedValue({phone:'0900000000',contactPhone:null,[field]:'linked'});
 expect(await saveCourseCustomer({...base,id:'child'})).toMatchObject({success:false,error:expect.stringContaining('已連結會員身分')});
 expect(m.update).not.toHaveBeenCalled();
});
it('rechecks identity bindings inside the store lock before converting contact data',async()=>{
 m.find.mockResolvedValueOnce({phone:'0900000000',contactPhone:null}).mockResolvedValueOnce({phone:'0900000000',contactPhone:null,userId:'new-link'});
 expect(await saveCourseCustomer({...base,id:'child'})).toMatchObject({success:false,error:expect.stringContaining('已連結會員身分')});
 expect(m.update).not.toHaveBeenCalled();
});
it('preserves stale-edit rejection for shared phone corrections',async()=>{
 m.find.mockResolvedValue({phone:'0900000000',contactPhone:null});m.update.mockResolvedValue({count:0});
 expect(await saveCourseCustomer({...base,id:'child',expectedUpdatedAt:'2026-11-11T01:00:00.000Z'})).toMatchObject({success:false,error:expect.stringContaining('顧客資料已有更新')});
 expect(m.create).not.toHaveBeenCalled();
});
it('keeps tenant permission and quota checks ahead of writes',async()=>{
 m.manager.mockRejectedValueOnce(new Error('not authorized'));
 expect(await saveCourseCustomer(base)).toMatchObject({success:false});expect(m.create).not.toHaveBeenCalled();
 m.limit.mockResolvedValue({maxCustomers:1});m.count.mockResolvedValue(1);
 expect(await saveCourseCustomer(base)).toMatchObject({success:false,error:'已達方案顧客額度上限'});expect(m.create).not.toHaveBeenCalled();
});

it('creates another learner automatically instead of substituting the first child who uses the same phone',async()=>{
 m.find.mockImplementation(async({where}:{where:{name?:string;id?:string}})=>where.id?{id:'child',name:'小晴',phone:'',contactPhone:'0912345678'}:null);
 expect(await createScheduleCustomer({...base,name:'小晴'})).toMatchObject({success:true,customer:{id:'child',name:'小晴',phone:'0912345678'}});
 expect(m.create.mock.calls[0][0].data).toMatchObject({phone:'',contactPhone:'0912345678'});
});
it('reuses an authorized exact name-and-phone match rather than duplicating that learner',async()=>{
 m.find.mockResolvedValue({id:'existing-child',name:'小安',phone:'0912345678'});
 expect(await createScheduleCustomer(base)).toMatchObject({success:true,customer:{id:'existing-child',existing:true}});
 expect(m.create).not.toHaveBeenCalled();
});
it('searches the guardian number within the authorized store and returns both learner IDs',async()=>{
 m.list.mockResolvedValue([{id:'child-a',name:'小安',phone:'',contactPhone:'0912345678'},{id:'child-b',name:'小晴',phone:'',contactPhone:'0912345678'}]);
 expect(await searchCourseCustomers('0912345678')).toMatchObject({success:true,rows:[{id:'child-a',phone:'0912345678',sharedContactPhone:true},{id:'child-b',phone:'0912345678',sharedContactPhone:true}]});
 expect(m.list.mock.calls[0][0].where).toMatchObject({storeId:'store',OR:expect.arrayContaining([{contactPhone:{contains:'0912345678',mode:'insensitive'}}])});
});

it('keeps SELF_ONLY learners assigned to the creating staff and rejects an unresolved staff identity',async()=>{
 vi.stubEnv('MANAGER_VISIBILITY_MODE','SELF_ONLY');m.manager.mockResolvedValue({storeId:'store',user:{id:'manager',role:'MANAGER',staffId:'staff'}});
 expect(await saveCourseCustomer(base)).toMatchObject({success:true});
 expect(m.create.mock.calls[0][0].data.assignedStaffId).toBe('staff');
 m.create.mockClear();m.manager.mockResolvedValue({storeId:'store',user:{id:'manager',role:'MANAGER',staffId:null}});
 expect(await saveCourseCustomer(base)).toMatchObject({success:false,error:expect.stringContaining('管理身分')});
 expect(m.create).not.toHaveBeenCalled();
});
it('accepts only name and phone from the form and creates independent IDs for two children',async()=>{
 m.create.mockImplementation(async({data}:{data:{name:string}})=>({id:data.name==='小安'?'child-a':'child-b'}));
 expect(await saveCourseCustomer(base)).toMatchObject({success:true,data:{id:'child-a'}});
 expect(await saveCourseCustomer({...base,name:'小晴',requestKey:'07ad289f-bc07-4c39-a2a9-04cb20b14e46'})).toMatchObject({success:true,data:{id:'child-b'}});
 expect(m.create.mock.calls.map(([call])=>({name:call.data.name,phone:call.data.phone,contactPhone:call.data.contactPhone}))).toEqual([{name:'小安',phone:'',contactPhone:'0912345678'},{name:'小晴',phone:'',contactPhone:'0912345678'}]);
});
