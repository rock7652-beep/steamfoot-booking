import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({admin:vi.fn(),permission:vi.fn(),storeFind:vi.fn(),userFind:vi.fn(),transaction:vi.fn(),globalPermissions:vi.fn(),failHours:false,committed:[] as {kind:string;data:unknown}[],writes:[] as {kind:string;data:unknown}[]}));
vi.mock('@/lib/base-url',()=>({deriveBaseUrl:()=> 'https://isolated.example.test'}));
vi.mock('@/lib/session',()=>({requireAdminSession:m.admin}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,createDefaultPermissions:m.globalPermissions,ALL_PERMISSIONS:['customer.read','staff.manage','booking.create'],getDefaultPermissionsForRole:(role:string)=>role==='OWNER'?['customer.read','staff.manage','booking.create']:['customer.read']}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.storeFind},user:{findUnique:m.userFind},$transaction:m.transaction}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {createStoreAction} from '@/server/actions/store-onboarding';
const input={name:'合成美業店',slug:'synthetic-beauty',plan:'EXPERIENCE' as const,isDemo:false,industryModule:'BEAUTY' as const,owner:{name:'合成負責人',email:'owner@example.invalid',password:'synthetic-only-123'},initialStaff:[{name:'合成店長',email:'manager@example.invalid',role:'MANAGER' as const}]};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('BEAUTY_MODULE_ENABLED','1');m.failHours=false;m.committed=[];m.writes=[];m.storeFind.mockResolvedValue(null);m.userFind.mockResolvedValue(null);
 m.transaction.mockImplementation(async(work:(db:unknown)=>Promise<unknown>)=>{
  const pending:{kind:string;data:unknown}[]=[];const add=(kind:string,data:unknown)=>{pending.push({kind,data});m.writes.push({kind,data});};
  const db={store:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>{add('store',data);return {...data,currentSubscriptionId:null};})},user:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>{add('user',data);return {staff:{id:`staff-${pending.length}`}};})},staffPermission:{createMany:vi.fn(async({data}:{data:unknown})=>add('permissions',data))},businessHours:{createMany:vi.fn(async({data}:{data:unknown})=>{if(m.failHours)throw Error('synthetic hours failure');add('hours',data);})},bookingSlot:{createMany:vi.fn(()=>{throw Error('Legacy slots forbidden for Beauty');})}};
  const result=await work(db);m.committed.push(...pending);return result;
 });
});
afterEach(()=>vi.unstubAllEnvs());
it('creates all Beauty records and role-specific permissions in the same transaction without legacy slots or external permission writes',async()=>{
 const result=await createStoreAction(input);expect(result.success).toBe(true);expect(m.transaction).toHaveBeenCalledOnce();expect(m.globalPermissions).not.toHaveBeenCalled();
 const users=m.committed.filter(r=>r.kind==='user').map(r=>r.data as {role:string});expect(users.map(r=>r.role)).toEqual(['OWNER','MANAGER']);
 const permissions=m.committed.filter(r=>r.kind==='permissions').map(r=>r.data as {permission:string;granted:boolean}[]);expect(permissions).toHaveLength(2);expect(permissions[0].find(r=>r.permission==='staff.manage')?.granted).toBe(true);expect(permissions[1].find(r=>r.permission==='staff.manage')?.granted).toBe(false);
 expect((m.committed.find(r=>r.kind==='hours')?.data as unknown[])).toHaveLength(7);
});
it('does not leave a store, account or permissions committed after a later provisioning failure',async()=>{
 m.failHours=true;const silent=vi.spyOn(console,'error').mockImplementation(()=>{});try{expect(await createStoreAction(input)).toMatchObject({success:false});expect(m.writes.some(r=>r.kind==='store')).toBe(true);expect(m.writes.some(r=>r.kind==='permissions')).toBe(true);expect(m.committed).toEqual([]);expect(m.globalPermissions).not.toHaveBeenCalled();}finally{silent.mockRestore();}
});
it('prepares a 30-day trial without starting the clock even when a stale client submits a paid plan',async()=>{
 const result=await createStoreAction({...input,plan:'GROWTH'});
 expect(result).toMatchObject({success:true,data:{store:{plan:'EXPERIENCE',planStatus:'TRIAL',currentSubscriptionId:null}}});
 const data=m.committed.find(r=>r.kind==='store')?.data as Record<string,unknown>;
 expect(data.plan).toBe('EXPERIENCE');expect(data).not.toHaveProperty('planEffectiveAt');expect(data).not.toHaveProperty('planExpiresAt');
});
it('requires HQ authorization and module activation before entering creation',async()=>{
 vi.stubEnv('BEAUTY_MODULE_ENABLED','0');expect(await createStoreAction(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();vi.stubEnv('BEAUTY_MODULE_ENABLED','1');m.admin.mockRejectedValueOnce(Error('FORBIDDEN'));await expect(createStoreAction(input)).rejects.toThrow('FORBIDDEN');expect(m.transaction).not.toHaveBeenCalled();
});
