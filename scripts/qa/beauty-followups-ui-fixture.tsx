// Actual shared components, synthetic data and blocked production writers.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {BeautyCardManagement} from '../../src/components/beauty/card-management';
import {StoreImageAnnouncements} from '../../src/components/image-announcements/carousel';
import {CustomerLabelsProvider,CustomerLabels} from '../../src/components/customer-labels';
import {CourseSelfBookingSettings} from '../../src/app/(dashboard)/dashboard/courses/course-self-booking-settings';
import {LineOfficialAccountsCard} from '../../src/app/(dashboard)/dashboard/settings/line-official-accounts/line-official-accounts-card';
import DashboardShell from '../../src/components/dashboard-shell-with-hq-line';
import {FEATURES} from '../../src/lib/feature-flags';
import type {CourseCardView} from '../../src/app/(dashboard)/dashboard/courses/member-workspace';
declare global{interface Window{qaAction:(name:string,...args:unknown[])=>Promise<unknown>;qaCalls:{name:string;args:unknown[]}[];qaPending:boolean}}
window.qaCalls=[];window.qaPending=false;
window.qaAction=async(name,...args)=>{window.qaCalls.push({name,args});if(name==='getCurrentLineOfficialAccountStatus')return {storeSlug:'synthetic',storeName:'合成美業店',status:'NORMAL'};
 if(name==='saveBeautyCardManagement'){const input=args[0] as {operation:string;expiresDate?:string;expectedExpiresAt:string;cardId:string};return {success:true,data:{id:input.cardId,remaining:input.operation==='close'?0:4,closed:input.operation==='close',expiresAt:input.expiresDate?input.expiresDate+'T15:59:59.999Z':input.expectedExpiresAt}};}
 throw Error('Unexpected synthetic writer: '+name);
};
const labels={storeId:'synthetic',available:true,enabled:true,canEdit:false,canManage:false,categories:[{id:'cat',name:'需求',number:1,position:0,active:true}],labels:[{id:'vip',name:'重要顧客',categoryId:'cat',active:true}],assignments:{visible:['vip']}};
const initial={id:'synthetic-card',name:'按摩方案',remaining:4,held:0,available:4,expiresAt:'2027-04-22T15:59:59.999Z',closed:false,expired:false,unit:'SESSION',members:[],entries:[]} as unknown as CourseCardView;
function Fixture(){const [view,setView]=useState('card'),[card,setCard]=useState(initial),[labelCustomer,setLabelCustomer]=useState('visible');
 const nav=<label>驗收頁面<select aria-label="驗收頁面" value={view} onChange={e=>setView(e.target.value)}>{['card','public','nav'].map(id=><option key={id}>{id}</option>)}</select></label>;
 return <OperationScope scope="qa:beauty:followups">{view==='nav'?<DashboardShell industryModule="beauty" industryModuleId="beauty" isOwner pricingPlan="EXPERIENCE" userName="驗收店長" roleLabel="店長" activeStoreId="synthetic" storeOptions={[{id:'synthetic',name:'合成美業店',isDefault:true}]} permissions={['booking.read','work_order.read','inventory.read']} effectiveFeatures={Object.fromEntries(Object.values(FEATURES).map(key=>[key,true]))} logoutButton={null}>{nav}<h1>美業共用功能入口</h1></DashboardShell>:<main className="mx-auto max-w-4xl space-y-4 p-4">{nav}{view==='card'?<><h1>方案管理</h1><p>剩餘 {card.remaining} 次</p><BeautyCardManagement key={card.id+':'+card.expiresAt+':'+card.remaining} storeId="synthetic" card={card} onPending={value=>{window.qaPending=value;}} onSaved={()=>{const value=window.qaCalls.at(-1)!.args[0] as {operation:string;expiresDate?:string};setCard(old=>({...old,remaining:value.operation==='close'?0:4,closed:value.operation==='close',expiresAt:value.expiresDate?value.expiresDate+'T15:59:59.999Z':old.expiresAt}));}}/></>:<>
 <h1>顧客公告與設定</h1><StoreImageAnnouncements storeSlug="synthetic"/>
 <CourseSelfBookingSettings immediate storeId="synthetic" title="允許顧客自行預約" initialEnabled canEdit expanded={false} onEdit={()=>{}} onClose={()=>{}}/>
 <CustomerLabelsProvider initial={labels}><div aria-label="顧客標籤"><CustomerLabels customerId={labelCustomer} readOnly displayOnly variant="badge"/></div><button className="min-h-11 rounded border p-2" onClick={()=>setLabelCustomer('new-visible')}>切換標籤顧客</button></CustomerLabelsProvider>
 <LineOfficialAccountsCard scope="current" initialStatuses={[{storeSlug:'synthetic',storeName:'合成美業店',status:'NORMAL'}]}/>
 </>}</main>}</OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
