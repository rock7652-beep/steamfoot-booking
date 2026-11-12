// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({cards:vi.fn(),native:vi.fn(),periods:vi.fn(),overview:vi.fn(),orders:vi.fn(),progress:vi.fn(),next:vi.fn()}));
vi.mock('@/lib/customer-support-read-client',async importOriginal=>({...await importOriginal<typeof import('@/lib/customer-support-read-client')>(),readCustomerOverview:m.overview}));
vi.mock('@/server/actions/course-members',()=>({loadCourseCustomerBookings:m.next}));
vi.mock('@/server/actions/course-browse',()=>({browseCourseCards:m.cards}));
vi.mock('@/lib/course-card-read-client',()=>({readNativeCourseCards:m.cards,readCourseCardProgress:m.progress}));
vi.mock('@/lib/music-period-read-client',()=>({readMusicPeriods:m.periods}));
vi.mock('@/server/actions/music-student-workspace',()=>({loadMusicStudentWorkspace:m.overview}));
vi.mock('@/server/actions/course-customer-history',()=>({loadCourseCustomerPurchases:m.orders}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/dashboard/courses',useSearchParams:()=>new URLSearchParams()}));
import {PanelReadProvider,useInvalidateCustomerPlanReads} from '@/components/operations/panel-read-cache';
import {CustomerNextBooking} from '@/app/(dashboard)/dashboard/courses/customer-next-booking';
import {CourseCardProgress} from '@/app/(dashboard)/dashboard/courses/card-progress';
import {useCustomerPlanPreload,useCustomerCardReader} from '@/components/admin/use-customer-plan-preload';
let invalidate:()=>void;
let root:Root,host:HTMLDivElement,preload:ReturnType<typeof useCustomerPlanPreload>,reader:ReturnType<typeof useCustomerCardReader>;
type Options=Parameters<typeof useCustomerPlanPreload>[0];
function Parent({options,open}:{options:Options;open:boolean}){const value=useCustomerPlanPreload(options),clear=useInvalidateCustomerPlanReads();React.useEffect(()=>{preload=value;invalidate=clear;},[value,clear]);return open?React.createElement(Child,{options}):null;}
function Child({options}:{options:Options}){const value=useCustomerCardReader(options);React.useEffect(()=>{reader=value;},[value]);return options.storeId?React.createElement(React.Fragment,null,React.createElement(CourseCardProgress,{storeId:options.storeId,customerId:"student",cardId:"sessions",revision:options.revision}),!options.music&&!options.load&&options.canReadBookings&&React.createElement(CustomerNextBooking,{customerId:"student",revision:options.revision,storeId:options.storeId})):null;}
async function render(options:Options,open=false,store='A',instance='panel'){await act(async()=>root.render(React.createElement(PanelReadProvider,{key:store},React.createElement(Parent,{key:instance,options,open}))));}
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');root=createRoot(host);for(const fn of Object.values(m))fn.mockResolvedValue({success:true,rows:[],data:[],hasMore:false});});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();});
it.each([false,true])('shares a completed background read with a newly opened customer (%s native)',async native=>{
 const options={canReadCards:true,native};await render(options);await act(async()=>preload.reader.read('A'));
 await render(options,true);expect(await reader.read({customerId:'A',search:'',history:false,page:0})).toMatchObject({success:true});expect(m.cards).toHaveBeenCalledOnce();
 await reader.read({customerId:'B',search:'',history:false,page:0});expect(m.cards).toHaveBeenCalledTimes(2);
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
it('caps background progress requests at the displayed twenty-card page',async()=>{
 m.cards.mockResolvedValue({success:true,rows:Array.from({length:40},(_,i)=>({id:String(i),unit:'SESSION'})),hasMore:false});
 await render({canReadCards:true,canReadBookings:true,storeId:'store'});await preload.reader.read('student');expect(m.progress.mock.calls.map(call=>call[0].cardId)).toEqual(Array.from({length:20},(_,i)=>String(i)));
});

it('preloads a module adapter through its own authorized progress port with the matching revision',async()=>{
 const load=vi.fn().mockResolvedValue({success:true,rows:[{id:'beauty-card',unit:'SESSION'},{id:'points',unit:'POINT'}],hasMore:false});
 const preloadCardProgress=vi.fn().mockResolvedValue({success:true});
 await render({load,preloadCardProgress,canReadCards:true,canReadBookings:true,revision:3});await preload.reader.read('customer');
 expect(preloadCardProgress).toHaveBeenCalledExactlyOnceWith('customer','beauty-card',3);expect(m.progress).not.toHaveBeenCalled();
 preloadCardProgress.mockClear();await render({load,preloadCardProgress,canReadCards:true,canReadBookings:false,revision:4});await preload.reader.read('customer');expect(preloadCardProgress).not.toHaveBeenCalled();
});

it('does not report the customer preload complete while dated grids are still loading',async()=>{
 m.cards.mockResolvedValue({success:true,rows:[{id:'sessions',unit:'SESSION'}],hasMore:false});
 let finish!:(value:unknown)=>void;m.progress.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await render({canReadCards:true,canReadBookings:true,storeId:'store-A'});
 const background=preload.reader.read('student');await vi.waitFor(()=>expect(m.progress).toHaveBeenCalledOnce());
 expect(preload.reader.get('student')).toBe(false);
 finish({success:true,data:{available:true,total:10,completed:[],voided:[],shared:false}});await background;
 expect(preload.reader.get('student')).toBe(true);
});

it('checks the module grid cache before marking a beauty preload ready',async()=>{
 const load=vi.fn().mockResolvedValue({success:true,rows:[{id:'beauty-card',unit:'SESSION'}],hasMore:false});
 let finish!:()=>void;let completed=false;
 const preloadCardProgress=vi.fn().mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{completed=true;resolve();};}));
 const getCardProgress=vi.fn(()=>completed?{success:true}:undefined);
 await render({load,preloadCardProgress,getCardProgress,canReadCards:true,canReadBookings:true,revision:2});
 const background=preload.reader.read('customer');await vi.waitFor(()=>expect(preloadCardProgress).toHaveBeenCalledOnce());
 expect(preload.reader.get('customer')).toBe(false);expect(getCardProgress).toHaveBeenCalledWith('customer','beauty-card',2);
 finish();await background;expect(preload.reader.get('customer')).toBe(true);
});

it('prioritizes the visible active plans without reading collapsed history, periods or payments',async()=>{
 m.cards.mockImplementation(async(args:{history:boolean})=>({success:true,rows:[{id:args.history?'historical':'active',unit:'SESSION'}],hasMore:false}));
 m.progress.mockResolvedValue({success:true,data:{available:true,total:10,completed:[],voided:[],shared:false}});
 await render({music:true,canReadCards:true,canReadBookings:true,canReadTransactions:true,storeId:'store-A'});
 await preload.visibleReader.read('student');expect(preload.visibleReader.get('student')).toBe(true);
 expect(m.cards.mock.calls.filter(call=>call[0].customerId).map(call=>call[0].history)).toEqual([false]);expect(m.progress.mock.calls.map(call=>call[0].cardId)).toEqual(['active']);
 expect(m.overview).toHaveBeenCalledExactlyOnceWith('student',false);expect(m.periods).not.toHaveBeenCalled();expect(m.orders).not.toHaveBeenCalled();
});
it('keeps a bounded dated-grid snapshot visible while an expired preload revalidates, but never across mutations',async()=>{
 vi.useFakeTimers();m.cards.mockResolvedValue({success:true,rows:[{id:'sessions',unit:'SESSION'}],hasMore:false});
 m.progress.mockResolvedValueOnce({success:true,data:{available:true,total:10,completed:[],voided:[],shared:false}});
 const options={canReadCards:true,canReadBookings:true,storeId:'store-A'};await render(options);await preload.reader.read('student');
 vi.advanceTimersByTime(15001);let finish!:(value:unknown)=>void;m.progress.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await render(options,true);expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(host.textContent).not.toContain('讀取上課進度中');expect(m.progress).toHaveBeenCalledTimes(2);
 await act(async()=>invalidate());await render({...options,revision:1},true);expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(0);
 await act(async()=>finish({success:true,data:{available:true,total:10,completed:[],voided:[],shared:false}}));
});

it.each([false,true])('opens native customer grids from the bundled read without extra progress requests (music=%s)',async music=>{
 const result={success:true,data:{available:true,total:8,completed:[],shared:false}};
 m.cards.mockResolvedValue({success:true,rows:[{id:'sessions',unit:'SESSION'}],hasMore:false,progress:[{cardId:'sessions',result}]});
 const options={music,canReadCards:true,canReadBookings:true,storeId:'store-A'};
 await render(options);await act(async()=>preload.visibleReader.read('student'));
 expect(m.cards).toHaveBeenCalledWith({customerId:'student',dataScope:undefined,search:'',history:false,page:0},'store-A');
 expect(m.cards).toHaveBeenCalledWith({cardId:'sessions',dataScope:undefined});
 await render(options,true);
 expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(8);
 expect(host.textContent).not.toContain('讀取上課進度');expect(m.progress).not.toHaveBeenCalled();expect(m.cards).toHaveBeenCalledTimes(2);
});
it('does not reinstall bundled grids after a mutation invalidates an in-flight customer read',async()=>{
 let finish!:(value:unknown)=>void;
 m.cards.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const options={canReadCards:true,canReadBookings:true,storeId:'store-A'};
 await render(options);
 // Read through the card port so the test isolates the bundle installation.
 await render(options,true);
 const reading=reader.read({customerId:'student',search:'',history:false,page:0});await Promise.resolve();
 await act(async()=>invalidate());
 finish({success:true,rows:[{id:'sessions',unit:'SESSION'}],hasMore:false,progress:[{cardId:'sessions',result:{success:true,data:{available:true,total:99,completed:[],shared:false}}}]});
 await reading;
 await render(options,false);await render(options,true);
 expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(0);
});

it('preloads the sports next-booking block with the visible plans',async()=>{
 await render({canReadCards:true,canReadBookings:true,storeId:'store-A'});
 await preload.visibleReader.read('student');
 expect(m.next).toHaveBeenCalledExactlyOnceWith('student',0,{mode:'upcoming'});
 expect(preload.visibleReader.get('student')).toBe(true);
 await render({canReadCards:true,canReadBookings:true,storeId:'store-A'},true);
 expect(host.textContent).not.toContain('讀取下次預約');expect(m.next).toHaveBeenCalledOnce();
 await act(async()=>invalidate());expect(preload.visibleReader.get('student')).toBe(false);
});
it('prepares complete Beauty details through the same explicitly enabled source and store scope',async()=>{
 const load=vi.fn().mockResolvedValue({success:true,rows:[{id:'beauty-card',unit:'SESSION'}],hasMore:false});
 await render({load,storeId:'beauty-store',canReadCards:true,preloadCardDetails:true});
 await preload.visibleReader.read('customer');
 expect(load).toHaveBeenCalledWith({cardId:'beauty-card',dataScope:undefined});expect(load).toHaveBeenCalledTimes(2);
 expect(preload.visibleReader.get('customer')).toBe(true);
 await preload.visibleReader.read('customer');expect(load).toHaveBeenCalledTimes(2);
});
it('prepares visible source support even if a no-support reader was mounted first',async()=>{
 const options={canReadCards:false,storeId:'same-store'};
 await render(options);
 const support=vi.fn().mockResolvedValue({success:true,data:{membership:{},advanced:{data:{}}}});
 await render({...options,support} as unknown as Options);
 await preload.visibleReader.read('customer');expect(support).toHaveBeenCalledOnce();expect(preload.visibleReader.get('customer')).toBe(true);
});

it('prepares all twenty visible details, including plans beyond the old five-card limit',async()=>{
 const load=vi.fn(async(input:{cardId?:string})=>({success:true,rows:input.cardId?[{id:input.cardId}]:Array.from({length:21},(_,i)=>({id:`plan-${i}`})),hasMore:false}));
 await render({load:load as unknown as NonNullable<Options['load']>,preloadCardDetails:true,storeId:'beauty',canReadCards:true});
 await preload.visibleReader.read('customer');
 expect(load.mock.calls.filter(([arg])=>arg.cardId).map(([arg])=>arg.cardId)).toEqual(Array.from({length:20},(_,i)=>`plan-${i}`));
 expect(preload.visibleReader.get('customer')).toBe(true);
});
it('prepares a beauty next service even without wallet permission and reuses the same store scope',async()=>{
 const load=vi.fn(),bookings=vi.fn().mockResolvedValue({success:true,data:[],hasMore:false});
 const options={load,bookings,preloadCardDetails:true,storeId:'beauty',canReadCards:false,canReadBookings:true};
 await render(options);await preload.visibleReader.read('student');
 expect(bookings).toHaveBeenCalledExactlyOnceWith('student',0,{mode:'upcoming'});expect(load).not.toHaveBeenCalled();
 await act(async()=>root.render(React.createElement(PanelReadProvider,{key:'A'},React.createElement(React.Fragment,null,React.createElement(Parent,{key:'panel',options,open:false}),React.createElement(CustomerNextBooking,{customerId:'student',load:bookings,serviceMode:true,storeId:'beauty',preloadSource:true})))));
 expect(host.textContent).not.toContain('讀取下次預約');expect(bookings).toHaveBeenCalledOnce();
 await act(async()=>invalidate());await preload.visibleReader.read('student');expect(bookings).toHaveBeenCalledTimes(2);
});
