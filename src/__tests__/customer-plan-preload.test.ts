// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({cards:vi.fn(),native:vi.fn(),periods:vi.fn(),overview:vi.fn(),orders:vi.fn(),progress:vi.fn()}));
vi.mock('@/server/actions/course-card-progress',()=>({loadCourseCardProgress:m.progress}));
vi.mock('@/server/actions/course-browse',()=>({browseCourseCards:m.cards}));
vi.mock('@/lib/course-card-read-client',()=>({readNativeCourseCards:m.native}));
vi.mock('@/lib/music-period-read-client',()=>({readMusicPeriods:m.periods}));
vi.mock('@/server/actions/music-student-workspace',()=>({loadMusicStudentWorkspace:m.overview}));
vi.mock('@/server/actions/course-customer-history',()=>({loadCourseCustomerPurchases:m.orders}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/dashboard/courses',useSearchParams:()=>new URLSearchParams()}));
import {PanelReadProvider,useInvalidateCustomerPlanReads} from '@/components/operations/panel-read-cache';
import {CourseCardProgress} from '@/app/(dashboard)/dashboard/courses/card-progress';
import {useCustomerPlanPreload,useCustomerCardReader} from '@/components/admin/use-customer-plan-preload';
let invalidate:()=>void;
let root:Root,host:HTMLDivElement,preload:ReturnType<typeof useCustomerPlanPreload>,reader:ReturnType<typeof useCustomerCardReader>;
type Options=Parameters<typeof useCustomerPlanPreload>[0];
function Parent({options,open}:{options:Options;open:boolean}){const value=useCustomerPlanPreload(options),clear=useInvalidateCustomerPlanReads();React.useEffect(()=>{preload=value;invalidate=clear;},[value,clear]);return open?React.createElement(Child,{options}):null;}
function Child({options}:{options:Options}){const value=useCustomerCardReader(options);React.useEffect(()=>{reader=value;},[value]);return options.storeId?React.createElement(CourseCardProgress,{storeId:options.storeId,customerId:"student",cardId:"sessions",revision:options.revision}):null;}
async function render(options:Options,open=false,store='A',instance='panel'){await act(async()=>root.render(React.createElement(PanelReadProvider,{key:store},React.createElement(Parent,{key:instance,options,open}))));}
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');root=createRoot(host);for(const fn of Object.values(m))fn.mockResolvedValue({success:true,rows:[],data:[],hasMore:false});});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();});
it.each([false,true])('shares a completed background read with a newly opened customer (%s native)',async native=>{
 const options={canReadCards:true,native};await render(options);await act(async()=>preload.reader.read('A'));
 await render(options,true);expect(await reader.read({customerId:'A',search:'',history:false,page:0})).toMatchObject({success:true});expect(native?m.native:m.cards).toHaveBeenCalledOnce();
 await reader.read({customerId:'B',search:'',history:false,page:0});expect(native?m.native:m.cards).toHaveBeenCalledTimes(2);
});
it('prepares music overview, periods and purchases independently, without discarding them on open',async()=>{
 await render({music:true,canReadCards:true,canReadBookings:true,canReadTransactions:true});await preload.reader.read('student');
 expect(preload.reader.get('student')).toBe(true);expect(m.cards).toHaveBeenCalledOnce();expect(m.periods).toHaveBeenCalledExactlyOnceWith('student');expect(m.overview).toHaveBeenCalledExactlyOnceWith('student',false);expect(m.orders).toHaveBeenCalledExactlyOnceWith('student',0);
 preload.prefetch('student');await Promise.resolve();expect(m.periods).toHaveBeenCalledOnce();
});
it('does not issue reads for disabled permissions or mix operational periods into legacy scope',async()=>{
 await render({music:true,canReadCards:false,canReadBookings:false,canReadTransactions:false});await preload.reader.read('student');expect(Object.values(m).every(fn=>fn.mock.calls.length===0)).toBe(true);
 await render({music:true,dataScope:'legacy',canReadCards:true,canReadBookings:true,canReadTransactions:true});await preload.reader.read('student');expect(m.cards).toHaveBeenCalledOnce();expect(m.periods).not.toHaveBeenCalled();expect(m.orders).not.toHaveBeenCalled();
});
it('invalidates after purchase revision, expiration or a different account/store scope',async()=>{
 vi.useFakeTimers();const options={canReadCards:true};await render(options);await preload.reader.read('student');
 await render({...options,revision:1});await preload.reader.read('student');expect(m.cards).toHaveBeenCalledTimes(2);
 vi.advanceTimersByTime(15000);expect(preload.reader.get('student')).toBe(false);await preload.reader.read('student');expect(m.cards).toHaveBeenCalledTimes(3);
 await render({...options,revision:1},false,'B');expect(preload.reader.get('student')).toBe(false);await preload.reader.read('student');expect(m.cards).toHaveBeenCalledTimes(4);
});
it('allows foreground retry after speculative failures and deduplicates an in-flight open',async()=>{
 m.cards.mockResolvedValueOnce({success:false,error:'offline'});const options={canReadCards:true};await render(options);await preload.reader.read('student');expect(preload.reader.get('student')).toBe(false);
 let done!:(value:unknown)=>void;m.cards.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));const background=preload.reader.read('student');await Promise.resolve();await render(options,true);
 const opened=reader.read({customerId:'student',search:'',history:false,page:0});done({success:true,rows:[],hasMore:false});await opened;await background;expect(m.cards).toHaveBeenCalledTimes(2);
});

it.each(['mutation','customer-event'])('does not resurrect pre-purchase revision zero after closing and reopening a beauty panel (%s)',async trigger=>{
 const load=vi.fn().mockResolvedValueOnce({success:true,rows:[{id:'old-plan'}],hasMore:false}).mockResolvedValueOnce({success:true,rows:[{id:'purchased-plan'}],hasMore:false});
 const options={load,canReadCards:true,native:true};
 await render(options,true);await preload.reader.read('customer');expect(preload.reader.get('customer')).toBe(true);
 await act(async()=>{if(trigger==='mutation')invalidate();else window.dispatchEvent(new Event('customer-search-invalidated'));});
 await render({...options,revision:1},true);
 // A keyed native panel remount resets its own local counter, while the provider survives.
 await render(options,true,'A','reopened');expect(preload.reader.get('customer')).toBe(false);
 expect(await reader.read({customerId:'customer',search:'',history:false,page:0})).toMatchObject({rows:[{id:'purchased-plan'}]});expect(load).toHaveBeenCalledTimes(2);
});
it('detaches pre-purchase in-flight reads in all previous revisions',async()=>{
 let finish!:(value:unknown)=>void;
 const load=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({success:true,rows:[{id:'new-plan'}],hasMore:false});
 const options={load,canReadCards:true};await render(options);
 const pending=preload.reader.read('customer');await Promise.resolve();
 await act(async()=>invalidate());await render(options,true,'A','reopened');
 expect(await reader.read({customerId:'customer',search:'',history:false,page:0})).toMatchObject({rows:[{id:'new-plan'}]});
 finish({success:true,rows:[{id:'old-plan'}],hasMore:false});await pending;
 expect(await reader.read({customerId:'customer',search:'',history:false,page:0})).toMatchObject({rows:[{id:'new-plan'}]});
});

it('preloads only session progress for the authorized store, reuses it on open, and clears it after a purchase',async()=>{
 m.cards.mockResolvedValue({success:true,rows:[{id:'sessions',unit:'SESSION'},{id:'points',unit:'POINT'}],hasMore:false});
 m.progress.mockResolvedValue({success:true,data:{available:true,total:8,completed:[],shared:false}});
 const options={canReadCards:true,canReadBookings:true,storeId:'store-A'};
 await render(options);await preload.reader.read('student');
 expect(m.progress).toHaveBeenCalledExactlyOnceWith({cardId:'sessions',customerId:'student',expectedStoreId:'store-A',dataScope:undefined});
 await render(options,true);expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(8);expect(m.progress).toHaveBeenCalledOnce();
 await act(async()=>invalidate());await preload.reader.read('student');expect(m.progress).toHaveBeenCalledTimes(2);
});
it('never preloads progress without booking access or for a different module adapter',async()=>{
 m.cards.mockResolvedValue({success:true,rows:[{id:'card',unit:'SESSION'}],hasMore:false});
 await render({canReadCards:true,storeId:'store'});await preload.reader.read('student');expect(m.progress).not.toHaveBeenCalled();
 const load=vi.fn().mockResolvedValue({success:true,rows:[{id:'card',unit:'SESSION'}],hasMore:false});
 await render({load,canReadCards:true,canReadBookings:true,storeId:'store'});await preload.reader.read('student');expect(m.progress).not.toHaveBeenCalled();
});
it('caps background progress requests at five cards per learner',async()=>{
 m.cards.mockResolvedValue({success:true,rows:Array.from({length:20},(_,i)=>({id:String(i),unit:'SESSION'})),hasMore:false});
 await render({canReadCards:true,canReadBookings:true,storeId:'store'});await preload.reader.read('student');expect(m.progress.mock.calls.map(call=>call[0].cardId)).toEqual(['0','1','2','3','4']);
});
