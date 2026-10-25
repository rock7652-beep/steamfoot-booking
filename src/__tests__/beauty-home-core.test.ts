import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),raw:vi.fn(),customers:vi.fn(),todos:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw}}));
vi.mock('@/server/queries/course-home',()=>({getCourseHomeCustomers:m.customers,getCourseHomeTodos:m.todos}));
import {beautyDailyHref,getBeautyHomeToday,getBeautyHomeReceipts,getBeautyHomeCustomers,getBeautyHomeTodos,getBeautyUnassignedPlanCount} from '@/server/beauty/home';
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'a'});m.todos.mockResolvedValue({total:0,items:[]});});
it('rejects cross-store home readers before reading any data',async()=>{
 await expect(getBeautyHomeToday('b','2026-10-23')).rejects.toThrow();
 await expect(getBeautyHomeReceipts('b','2026-10-23','2026-10-23')).rejects.toThrow();
 await expect(getBeautyHomeCustomers('b',null,null)).rejects.toThrow();
 await expect(getBeautyUnassignedPlanCount('b',null)).rejects.toThrow();
 await expect(getBeautyHomeTodos('b',{payments:true,attendance:true,followUp:true,staffScope:null})).rejects.toThrow();
 expect(m.raw).not.toHaveBeenCalled();expect(m.customers).not.toHaveBeenCalled();expect(m.todos).not.toHaveBeenCalled();
});
it('reads the actual Taipei day independently of the dashboard loaded month',async()=>{
 m.raw.mockResolvedValue([{sessions:2,ended:1,bookings:2,attended:1,nextEnd:null}]);
 expect(await getBeautyHomeToday('a','2026-10-23')).toMatchObject({sessions:2,attended:1});
 const [strings,...values]=m.raw.mock.calls[0];
 expect(strings.join('')).toContain('BeautyAppointment');expect(strings.join('')).not.toContain('CourseSession');
 expect(values).toContainEqual(new Date('2026-10-22T16:00:00Z'));expect(values).toContainEqual(new Date('2026-10-23T15:59:59.999Z'));
});
it('uses signed Beauty payment events, without adding cashbook income twice',async()=>{
 m.raw.mockResolvedValue([{purchases:1000,purchaseCount:1,trial:0,refunds:400,voids:0}]);
 expect(await getBeautyHomeReceipts('a','2026-10-23','2026-10-23')).toMatchObject({gross:1000,net:600});
 expect(m.manager).toHaveBeenCalledWith('transaction.read');
 expect(m.raw.mock.calls[0][0].join('')).not.toContain('CashbookEntry');
});
it('reuses the original shared customer identity count with the authorized assignment scope',async()=>{
 m.customers.mockResolvedValue({total:null,mine:7});
 expect(await getBeautyHomeCustomers('a','staff','staff')).toEqual({total:null,mine:7});
 expect(m.customers).toHaveBeenCalledWith('a','staff','staff');
});
it('retains historical/shared cards when counting customers without a plan',async()=>{
 m.raw.mockResolvedValue([{total:3}]);expect(await getBeautyUnassignedPlanCount('a','staff')).toBe(3);
 const q=m.raw.mock.calls[0][0];expect(q.sql).toContain('ANY(k."memberIds")');expect(q.sql).not.toContain('"closedAt"');expect(q.values).toContain('staff');
});
it('does not query pending tasks when no task permissions are enabled',async()=>{
 expect(await getBeautyHomeTodos('a',{payments:false,attendance:false,followUp:false,staffScope:null})).toEqual({total:0,items:[]});expect(m.raw).not.toHaveBeenCalled();expect(m.todos).not.toHaveBeenCalled();
});
it('loads permitted Beauty tasks and routes the original home list back to the right core',async()=>{
 m.raw.mockResolvedValue([{total:1,items:[{id:'booking',kind:'attendance',label:'服務',date:'2026-10-23T01:00:00Z'}]}]);
 const r=await getBeautyHomeTodos('a',{payments:false,attendance:true,followUp:false,staffScope:null});
 const q=m.raw.mock.calls[0][0];expect(q.sql).toContain('BeautyAppointment');expect(q.sql).not.toContain('BeautyPurchase');expect(q.sql).not.toContain('CourseSession');
 expect(m.todos).not.toHaveBeenCalled();
 const href=new URL(r.items[0].href,'http://localhost');expect(href.searchParams.get('tab')).toBe('班表');expect(href.searchParams.get('bookingId')).toBe('booking');
});
it('reads shared follow-up tasks through the existing core without touching the restricted Beauty connection',async()=>{
 m.todos.mockResolvedValue({total:1,items:[{id:'lead/one',kind:'followUp',label:'跟進',date:'2026-10-23T01:00:00Z',href:'/shared'}]});
 const now=new Date('2026-10-23T02:00:00Z');
 const r=await getBeautyHomeTodos('a',{payments:false,attendance:false,followUp:true,staffScope:'manager'},now,0,3);
 expect(m.raw).not.toHaveBeenCalled();
 expect(m.todos).toHaveBeenCalledWith('a',{payments:false,attendance:false,followUp:true,staffScope:'manager'},now,0,3);
 expect(r.total).toBe(1);expect(r.items[0].href).toBe('/dashboard/digital-butler/leads?leadId=lead%2Fone');
});
it('merges authorized cores before applying pagination, preserving totals and time order without granting shared-table access',async()=>{
 m.raw.mockImplementation(async(q:{sql:string})=>{if(q.sql.includes('DigitalButlerLead'))throw Error('42501 permission denied');return [{total:3,items:[{id:'b1',kind:'attendance',label:'服務1',date:'2026-10-23T01:00:00Z'},{id:'b3',kind:'payment',label:'核帳',date:'2026-10-23T03:00:00Z'},{id:'b5',kind:'attendance',label:'服務2',date:'2026-10-23T05:00:00Z'}]}];});
 m.todos.mockResolvedValue({total:2,items:[{id:'f2',kind:'followUp',label:'跟進1',date:'2026-10-23T02:00:00Z',href:'/shared'},{id:'f4',kind:'followUp',label:'跟進2',date:'2026-10-23T04:00:00Z',href:'/shared'}]});
 const now=new Date('2026-10-23T06:00:00Z');
 const r=await getBeautyHomeTodos('a',{payments:true,attendance:true,followUp:true,staffScope:'manager'},now,2,2);
 expect(r.total).toBe(5);expect(r.items.map(i=>i.id)).toEqual(['b3','f4']);
 const q=m.raw.mock.calls[0][0];expect(q.sql).not.toContain('DigitalButlerLead');expect(q.values).toContain('a');expect(q.values).toContain(4);
 expect(m.todos).toHaveBeenCalledWith('a',{payments:false,attendance:false,followUp:true,staffScope:'manager'},now,0,4);
});
it('does not show zero pending tasks when an authorized shared reader fails',async()=>{
 m.todos.mockRejectedValueOnce(Error('shared core unavailable'));
 await expect(getBeautyHomeTodos('a',{payments:false,attendance:false,followUp:true,staffScope:null})).rejects.toThrow('shared core unavailable');
});
it('keeps original schedule, customer and care navigation parameters while changing module destinations',()=>{
 for(const [path,tab] of [['/dashboard/courses?date=2026-10-23','班表'],['/dashboard/courses?view=customers&staff=manager','顧客管理'],['/dashboard/growth?segment=low&month=2026-10','顧客經營']]){
  const url=new URL(beautyDailyHref(path),'http://localhost');expect(url.pathname).toBe('/dashboard/beauty');expect(url.searchParams.get('tab')).toBe(tab);
 }
 expect(new URL(beautyDailyHref('/dashboard/revenue?dateFrom=2026-10-01&dateTo=2026-10-23'),'http://localhost').searchParams.get('endDate')).toBe('2026-10-23');
});
