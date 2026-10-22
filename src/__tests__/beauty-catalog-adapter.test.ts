import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({catalog:vi.fn(),location:vi.fn(),refresh:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({saveBeautyCatalog:m.catalog,saveBeautyLocation:m.location}));
vi.mock('@/app/(dashboard)/dashboard/courses/workspace',()=>({CourseWorkspace:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace',()=>({CourseMemberWorkspace:()=>null}));
import {createBeautyCatalogAdapter} from '@/components/beauty/catalog-adapter';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const service={id:'service',revision:4,name:'做臉',category:'保養',duration:60,buffer:15,price:1000,trialPrice:500,active:true};
const plan={id:'scheme',revision:3,name:'七次方案',sessions:7,price:6500,validDays:80,serviceIds:['service'],allowShared:true,customerPurchasable:false,active:true,lowBalanceEnabled:true,lowBalanceThreshold:2};
const data={storeId:'store',services:[service],plans:[plan],locations:[{id:'room',name:'空間',isActive:true,category:'A',details:'備註',equipment:'設備',location:'二樓'}]} as unknown as BeautyDashboardData;
beforeEach(()=>{vi.resetAllMocks();m.catalog.mockImplementation(async(_kind,input)=>({success:true,data:{saved:true,record:{...input,id:input.id??'new',revision:input.revision+1}}}));});
it('changing service duration preserves both prices, returns the authoritative revision, and rejects stale source',async()=>{
 const a=createBeautyCatalogAdapter('服務項目',data,true,m.refresh);const r=await a.save('template',{id:'service',catalogRevision:4,name:'新做臉',category:'保養',durationMinutes:90,bufferMinutes:20});
 expect(m.catalog).toHaveBeenCalledWith('service',expect.objectContaining({revision:4,duration:90,buffer:20,price:1000,trialPrice:500}));expect(r).toMatchObject({success:true,data:{catalogRevision:5,durationMinutes:90}});
 m.catalog.mockClear();expect(await a.save('template',{id:'service',catalogRevision:3})).toMatchObject({success:false});expect(m.catalog).not.toHaveBeenCalled();
});
it.each(['single','trial'] as const)('changes %s price while preserving the other price, availability and full duration',async kind=>{
 const a=createBeautyCatalogAdapter('收費方式',data,true,m.refresh),p=a.products.find(p=>p.catalogKind===kind)!;await a.form.save({catalogKind:kind,catalogPriceValue:'750',templateIds:['service']},p);
 expect(m.catalog).toHaveBeenCalledWith('service',expect.objectContaining({id:'service',duration:60,buffer:15,active:true,price:kind==='single'?750:1000,trialPrice:kind==='trial'?750:500}));
});
it('saving a new arbitrary session plan keeps family sharing, service scope and reminder settings',async()=>{
 const a=createBeautyCatalogAdapter('收費方式',data,true,m.refresh);const r=await a.form.save({catalogKind:'plan',name:'九次方案',points:9,price:8000,validDays:120,templateIds:['service'],allowShared:true,customerPurchasable:false,isActive:true,lowBalanceEnabled:true,lowBalanceThreshold:'3'},null);
 expect(m.catalog).toHaveBeenCalledWith('plan',expect.objectContaining({sessions:9,validDays:120,serviceIds:['service'],allowShared:true,lowBalanceThreshold:3}));expect(r).toMatchObject({success:true,data:{id:'plan:new',points:9,catalogRevision:1}});
});
it('keeps successful and rejected batch IDs separate and blocks every write in readonly mode',async()=>{
 const a=createBeautyCatalogAdapter('收費方式',data,true,m.refresh);const r=await a.status.apply({kind:'plan',ids:['plan:scheme','single:service'],active:false});expect(r).toMatchObject({success:true,succeeded:['plan:scheme'],failed:[{id:'single:service'}]});
 m.catalog.mockClear();const locked=createBeautyCatalogAdapter('收費方式',data,false,m.refresh);expect(await locked.form.save({catalogKind:'plan'},null)).toMatchObject({success:false});expect(await locked.status.apply({kind:'plan',ids:['plan:scheme'],active:true})).toMatchObject({success:false});expect(m.catalog).not.toHaveBeenCalled();expect(m.location).not.toHaveBeenCalled();
});

it('immediately resaves an authoritative returned plan before the parent RSC refresh without using a stale revision',async()=>{
 const a=createBeautyCatalogAdapter('收費方式',data,true,m.refresh),prior=a.products.find(p=>p.id==='plan:scheme')!;
 const input={catalogKind:'plan',name:prior.name,points:9,price:8000,validDays:120,templateIds:['service'],allowShared:true,customerPurchasable:false,isActive:true};
 const first=await a.form.save(input,prior);expect(first.success).toBe(true);if(!first.success)return;await a.form.save({...input,points:10},first.data);
 expect(m.catalog).toHaveBeenLastCalledWith('plan',expect.objectContaining({id:'scheme',revision:4,sessions:10}));
});
