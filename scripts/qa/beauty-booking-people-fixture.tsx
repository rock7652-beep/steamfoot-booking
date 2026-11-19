// Actual member portal; synthetic rows only. Server actions and network are blocked by the runner.
import {createRoot} from 'react-dom/client';
import {BeautyPortal} from '@/components/beauty/portal';
const scenario=new URLSearchParams(location.search).get('case')??'two';
const recipients:Record<string,(string|null)[]>={two:['member','companion'],journey:['member','member'],mixed:['member','member','companion'],unnamed:[null,null],single:['member']};
const people=recipients[scenario];
const makeItems=(history:boolean)=>people.map((customerId,i)=>({id:(history?'past-':'future-')+i,groupId:history?'past':'future',customerId,personName:customerId==='member'?'合成會員':'同行者',serviceName:scenario==='journey'||scenario==='mixed'?i===1?'臉部保養':'身體按摩':'身體按摩',serviceId:'service-'+i,technicianId:'tech-'+i,startsAt:`${history?'2026-01-20':'2099-11-20'}T0${i+1}:00:00Z`,endsAt:`${history?'2026-01-20':'2099-11-20'}T0${i+2}:00:00Z`,status:history?'COMPLETED':'RESERVED',addOnItems:[],revision:0}));
const data={store:{id:'synthetic',slug:'synthetic',name:'合成美業店家'},announcementItems:[],scopeKey:'synthetic',canWork:false,work:false,customer:{id:'member',name:'合成會員',phone:''},cards:[],members:[],items:[...makeItems(false),...makeItems(true)],plans:[],purchases:[],grants:[],income:[],bank:null,services:[],techs:people.map((_,i)=>({id:'tech-'+i,name:'技師 '+(i+1)})),policy:{selfBooking:true,selfCancel:true,selfReschedule:true}} as unknown as Parameters<typeof BeautyPortal>[0]['data'];
const preview={selection:{},memberId:'member'} as unknown as Parameters<typeof BeautyPortal>[0]['preview'];
createRoot(document.getElementById('root')!).render(<><p>隔離預覽・合成資料</p><BeautyPortal data={data} initialView="bookings" preview={preview}/></>);
