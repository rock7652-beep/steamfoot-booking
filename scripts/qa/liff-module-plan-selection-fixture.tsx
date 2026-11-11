// Actual member forms; synthetic balances and action results only.
import {createRoot} from 'react-dom/client';
import {CoursePortalClient} from '../../src/app/(customer)/book/course-portal-client';
import type {CoursePortalData} from '../../src/app/(customer)/book/course-portal';
import {BeautyMemberBookingForm} from '../../src/components/beauty/member-booking-form';
import type {BeautyBookingCatalog} from '../../src/components/beauty/booking-form';
const qa=window as unknown as {qaCalls:{name:string;args:unknown[]}[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>};
qa.qaCalls=[];
qa.qaAction=async(name,...args)=>{
 if(name==='readCustomerBookingGoods')return {success:true,data:null};
 if(name==='readBeautySlots')return {success:true,data:{slots:['10:00','10:30']}};
 if(name==='createMemberCourseBooking'||name==='bookBeautyParty'){qa.qaCalls.push({name,args});return {success:false,error:'隔離測試已記錄選擇，未建立預約'};}
 throw Error('Unexpected action '+name);
};
const moduleName=new URLSearchParams(location.search).get('module');
const balances=[8,4,1];
const expiries=['2026-12-12T15:59:59Z','2027-03-05T15:59:59Z','2026-12-31T15:59:59Z'];
if(moduleName==='beauty'){
 const catalog={services:[{id:'service',name:'合成服務',price:900,duration:60,trialPrice:null,revision:0}],techs:[],policy:{revision:0,selfBooking:true,selfCancel:true,selfReschedule:true,cancelDeduct:false,noShowDeduct:false,cancelLeadMinutes:0}} as BeautyBookingCatalog;
 const cards=balances.map((remaining,i)=>({id:`card-${i+1}`,name:'十堂方案',remaining,held:0,expiresAt:expiries[i],closed:false,memberIds:['member'],serviceIds:['service'],allowShared:false}));
 createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-md p-4"><BeautyMemberBookingForm catalog={catalog} slug="synthetic" customer={{id:'member'}} cards={cards}/></main>);
}else{
 const session={id:'session',templateId:'template',name:'合成課程',startsAt:'2026-11-14T02:00:00Z',endsAt:'2026-11-14T03:00:00Z',coach:'合成老師',room:'A',cost:1,capacity:8,occupied:0,precautions:'',waitlistAllowed:false,waitlistPosition:null,waitlistRemaining:0};
 const cards=balances.map((remaining,i)=>({id:`card-${i+1}`,planId:'plan',name:'十堂方案',remaining,held:0,available:remaining,unit:'SESSION',templateIds:['template'],members:[{id:'member',name:'合成會員'}],expiresAt:expiries[i],expired:false,closed:false,allowShared:false,entries:[],grids:[]}));
 const data={selfBookingEnabled:true,selfLeaveEnabled:true,selfRescheduleEnabled:true,initialRole:'member',rolePreferenceKey:'synthetic-plan-selection',month:'2026-11',serverNow:Date.parse('2026-11-11T02:00Z'),initialDate:'2026-11-14',initialView:'schedule',memberEnabled:true,hasWork:false,customerId:'member',customerName:'合成會員',storeName:'合成門市',storeId:'synthetic',prefix:'/s/synthetic',companionBookingEnabled:false,cancellationLeadMinutes:0,cards,plans:[],templates:[],bookings:[],orders:[],hours:[],special:[],config:{},bookingWindow:{closesAt:'2026-12-31T15:59:59Z'},nextBooking:null,nextWork:null,work:[],sessions:[session],musicStore:moduleName==='music'} as unknown as CoursePortalData&{initialDate:string;initialView:'schedule'};
 createRoot(document.getElementById('root')!).render(<CoursePortalClient {...data}/>);
}
