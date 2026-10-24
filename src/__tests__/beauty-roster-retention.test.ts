// @vitest-environment jsdom
import {act,createElement as h,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({refund:vi.fn(),status:vi.fn(),move:vi.fn(),collect:vi.fn(),collectionRead:vi.fn(),push:vi.fn(),refresh:vi.fn(),params:new URLSearchParams(),read:vi.fn(),rosterProps:null as Record<string,unknown>|null}));
vi.mock('next/dynamic',async()=>{const React=await import('react');return {default:(loader:()=>Promise<{default:React.ComponentType<Record<string,unknown>>}>)=>{const C=React.lazy(async()=>{const loaded=await loader();return {default:typeof loaded==='function'?loaded:loaded.default};});return (props:Record<string,unknown>)=>h(React.Suspense,{fallback:null},h(C,props));}};});
vi.mock('@/app/(dashboard)/dashboard/courses/sports-move-confirm',()=>({SportsMoveConfirm:()=>null}));
vi.mock('@/server/actions/beauty-native-roster',()=>({readBeautyRosterOperation:vi.fn(),updateBeautyRosterAttendance:m.status,cancelBeautyRosterAppointment:vi.fn()}));
vi.mock('@/components/beauty/native-roster-source',()=>({BeautyNativeRoster:(props:{suspended:boolean;onCustomer:(id:string)=>void;onMoney:(kind:string,ids:string[])=>void})=>{const [search,setSearch]=useState('');m.rosterProps=props;return h('div',{'data-native-roster-port':true},h('button',{onClick:()=>setSearch('保留的搜尋與篩選')},'設定清單狀態'),h('output',null,search),h('button',{onClick:()=>props.onCustomer('customer')},'開顧客'),h('button',{onClick:()=>props.onMoney('card',['customer'])},'開購買方案'));}}));
vi.mock('@/components/beauty/native-customer-source',()=>({BeautyNativeCustomerWorkspace:(props:{onClose:()=>void;initialAction?:string})=>h('div',{'data-review-customer':true},h('span',null,props.initialAction==='assign'?'購買方案':'顧客資料'),h('button',{onClick:props.onClose},'返回原名單'))}));
vi.mock('@/server/actions/beauty-customer-attribution' ,()=>({bulkAssignBeautyCustomers:vi.fn(),saveBeautyCustomerAttribution:vi.fn(),searchBeautyReferrerCandidates:vi.fn()}));
vi.mock('@/server/actions/beauty-service-price',()=>({saveBeautyServicePrice:vi.fn()}));
vi.mock('@/server/actions/beauty-native-plan',()=>({saveBeautyNativePlan:vi.fn()}));
vi.mock('@/server/actions/beauty-native-service',()=>({saveBeautyNativeService:vi.fn()}));
vi.mock('@/server/actions/beauty-display-order',()=>({saveBeautyDisplayOrder:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh,push:m.push}),useSearchParams:()=>m.params,usePathname:()=>'/dashboard/beauty'}));
vi.mock('@/lib/beauty/calendar-read',()=>({readBeautyCalendar:vi.fn(),projectBeautyCalendar:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/customer-list',()=>({CourseCustomerList:()=>null}));
vi.mock('@/server/actions/beauty',()=>({changeBeautyStatus:m.status,linkBeautyCustomer:vi.fn(),confirmBeautyPurchase:vi.fn(),collectBeautyPayment:m.collect,readBeautyCollection:m.collectionRead,purchaseBeautyPlan:vi.fn(),refundBeautyPayment:m.refund,confirmBeautySettlement:vi.fn(),saveBeautyCustomer:vi.fn(),moveBeautyAppointment:m.move}));
vi.mock('@/components/beauty/schedule-workspace',()=>({BeautyScheduleWorkspace:({onOpen}:{onOpen:(id:string)=>void})=>h('button',{onClick:()=>onOpen('a')},'開啟預約')}));
vi.mock('@/components/beauty/customer-panel',()=>({BeautyCustomerPanel:()=>null}));
vi.mock('@/components/beauty/catalog-editor',()=>({BeautyCatalogEditor:()=>null}));
vi.mock('@/components/beauty/native-schedule-source',()=>({BeautyNativeScheduleDialog:()=>null}));
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
import {BeautyDashboard} from '@/components/beauty/dashboard';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const item={id:'a',groupId:'group',personName:'本人',personPhone:'0900000001',customerId:'customer',serviceId:'service',serviceName:'做臉',startsAt:'2026-10-22T01:00:00.000Z',endsAt:'2026-10-22T02:00:00.000Z',occupiedEndsAt:'2026-10-22T02:00:00.000Z',technicianId:'tech',locationId:'room',cardId:'card',price:1000,status:'RESERVED',revision:7,notes:'本次注意事項'};
const data={date:'2026-10-22',month:'2026-10',calendar:'day',now:Date.parse('2026-10-22T00:00:00Z'),store:{id:'store',slug:'test'},items:[item,{...item,id:'b',personName:'同行者',serviceName:'按摩',endsAt:'2026-10-22T02:30:00.000Z'},{...item,id:'other',groupId:'other-group',personName:'另一組'}],cards:[{id:'card',remaining:5,held:3}],customers:[],services:[],plans:[],techs:[{id:'tech',name:'技師',active:true}],locations:[{id:'room',name:'位置',isActive:true}],payments:[],purchases:[],policy:{},access:{planAccess:true,customerAccess:true,financeAccess:true},manage:{update:true,collect:true,customer:false,card:true},calendarDays:{}} as unknown as BeautyDashboardData;
function nativeRows(){return data.items.filter(b=>b.groupId==='group').map(b=>({...b,customerName:b.personName,customerPhone:b.personPhone,assignedCoachName:'',assignedCoachId:null,bookingKind:b.cardId?'CARD':'SINGLE',pointCost:b.cardId?1:0,cardRemaining:5,unit:'SESSION',trialPayments:[],absenceKind:null,sharedCard:true,operatorCustomerId:null,companionIndex:null,serviceNote:'',termCount:0,termLessons:[],termPrivateLeaves:[],termMakeups:[],absenceHistory:[],service:{revision:b.revision,startsAt:b.startsAt,endsAt:b.endsAt,occupiedEndsAt:b.occupiedEndsAt,serviceName:b.serviceName,technicianName:'技師',locationName:'位置',price:b.price,debit:false,available:2}}));}
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.refund.mockReset().mockResolvedValue({success:true});m.status.mockReset().mockResolvedValue({success:false,error:'合成失敗'});m.move.mockReset().mockResolvedValue({success:true});m.collect.mockReset().mockResolvedValue({success:false,error:"超過應收"});m.push.mockReset();m.refresh.mockReset();m.read.mockImplementation(async()=>({success:true,data:{roster:nativeRows(),session:{startsAt:item.startsAt,pointCost:1,teacherAttendance:'SCHEDULED',teacherNote:'',teacherAttendanceReason:'',waitlistStopMinutes:0},trial:null,cards:[],waitlist:[],sharedCardState:'ENABLED',canPurchase:false}}));m.collectionRead.mockResolvedValue({success:true,data:[{id:'a',revision:7,personName:'本人',serviceName:'做臉',price:1000,discount:{kind:'AMOUNT',value:0},reduction:0,netPrice:1000,collected:0,due:1000}]});m.params=new URLSearchParams();window.history.replaceState(null,"","/dashboard/beauty");});
afterEach(()=>{act(()=>root.unmount());host.remove();});
function button(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===name);expect(b,name).toBeTruthy();return b!;}
async function settleRoster(){await act(async()=>{await import('@/components/beauty/native-roster-source');await new Promise(resolve=>setTimeout(resolve,40));});}
async function open(readOnly=false,manage=data.manage){await act(async()=>root.render(h(BeautyDashboard,{data:{...data,manage},tab:'班表',slug:'test',readOnly})));await act(async()=>button('開啟預約').click());await settleRoster();}

it.each(['開顧客','開購買方案'])('retains the actual dashboard roster mount and state across %s without a router refresh',async label=>{
 await open();await act(async()=>button('設定清單狀態').click());
 const original=host.querySelector<HTMLElement>('[data-native-roster-port]')!;original.scrollTop=180;
 await act(async()=>button(label).click());await act(async()=>{await import('@/components/beauty/native-customer-source');await new Promise(resolve=>setTimeout(resolve,40));});
 expect(host.querySelector('[data-native-roster-port]')).toBe(original);expect(m.rosterProps).toMatchObject({suspended:true});expect(original.closest('[data-right-sheet]')?.getAttribute('aria-hidden')).toBe('true');
 await act(async()=>button('返回原名單').click());
 expect(host.querySelector('[data-native-roster-port]')).toBe(original);expect(original.textContent).toContain('保留的搜尋與篩選');expect(original.scrollTop).toBe(180);expect(m.rosterProps).toMatchObject({suspended:false});expect(original.closest('[data-right-sheet]')?.getAttribute('aria-hidden')).toBe('false');expect(m.refresh).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
});
