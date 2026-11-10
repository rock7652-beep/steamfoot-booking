// Actual native roster and member plans components; synthetic data, no business writes.
import {createRoot} from 'react-dom/client';
import {CourseRoster} from '@/app/(dashboard)/dashboard/courses/roster';
import {preparedRoster} from '@/__tests__/fixtures/prepared-roster';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {CustomerLabelsProvider} from '@/components/customer-labels';
import {CoursePortalClient} from '@/app/(customer)/book/course-portal-client';
import type {CoursePortalData} from '@/app/(customer)/book/course-portal';
const portal=new URLSearchParams(location.search).get('mode')==='portal';
const roster=preparedRoster(),b=roster.roster[0];
b.bookingKind='UNPAID';b.cardId=null;b.notes='';b.serviceNote='';b.customerName='合成學員';
const balance={unit:'SESSION',remaining:10,available:10,cost:1,planName:'十堂方案'};
b.sportsBalance={...balance,byUnit:[balance]};
const labels={available:true,enabled:true,canEdit:true,canManage:false,categories:[],labels:[],assignments:{'synthetic-customer':[]}};
const card={id:'synthetic-card',name:'舞蹈（常態）-10堂',unit:'SESSION',termSessionIds:[],templateIds:[],allowShared:false,available:10,remaining:10,held:0,entries:[],expired:false,closed:false,expiresAt:'2027-01-24T00:00:00Z',members:[{id:'synthetic-customer',name:'合成學員'}],grid:{total:10,dates:[]},purchases:[{id:'purchase',points:10,createdAt:'2026-10-27T03:00:00Z',status:'CONFIRMED'}]};
const record={id:'purchase',cardId:card.id,name:card.name,unit:'SESSION',points:10,date:'2026-10-27T03:00:00Z',status:'CONFIRMED',termSizes:[],templateIds:[],due:null,received:0,periods:[],receipts:[],refunds:[],lessonsAvailable:true,lessons:[]};
const data={initialRole:'member',rolePreferenceKey:'copy-cleanup-synthetic',month:'2026-11',serverNow:Date.parse('2026-11-10T11:00:00Z'),memberEnabled:true,hasWork:false,customerId:b.customerId,customerName:b.customerName,storeName:'合成店家',storeId:'synthetic',prefix:'/s/synthetic',cards:[card],plans:[],templates:[],bookings:[],orders:[],sessions:[],hours:[],special:[],config:{},bookingWindow:{closesAt:'2026-12-10T00:00:00Z'},nextBooking:null,nextWork:null,work:[],memberRecords:[record]} as unknown as CoursePortalData;
(window as unknown as {qaAction:(name:string)=>Promise<unknown>}).qaAction=async name=>{throw Error('Unexpected backend action '+name);};
createRoot(document.getElementById('root')!).render(portal?<CoursePortalClient {...data} initialView="plans" readOnly/>:<PanelReadProvider><CustomerLabelsProvider initial={labels}><main className="p-4"><section className="mx-auto flex min-h-[320px] max-w-[1100px] flex-col rounded-xl border bg-white p-3"><h1 className="mb-3 text-lg font-semibold">上課名單</h1><CourseRoster storeId="synthetic" sessionId="synthetic-session" capacity={2} canCreate={false} canEdit sportsNative initialSnapshot={{sessionId:'synthetic-session',data:roster}}/></section></main></CustomerLabelsProvider></PanelReadProvider>);
