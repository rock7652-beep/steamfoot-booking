// Synthetic catalog only. No customer identities or production credentials.
import {createRoot} from 'react-dom/client';
import {useSearchParams} from 'next/navigation';
import {MusicSubjectCatalog} from '../../src/app/(dashboard)/dashboard/courses/music-subject-catalog';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {CoursePlanPageHeader} from '../../src/app/(dashboard)/dashboard/courses/plan-page-header';
import {CourseMemberWorkspace} from '../../src/app/(dashboard)/dashboard/courses/member-workspace';
const music=new URLSearchParams(location.search).get('module')==='music';
const subjects=[{id:'A',name:music?'鋼琴（一般課程）':'舞蹈（基礎課程）',category:'',isActive:true},{id:'B',name:music?'小提琴（一般課程）':'舞蹈（零基礎成芭）',category:'',isActive:true}];
const templates=subjects.map(s=>({id:'t'+s.id,name:s.name,category:'',isActive:true,musicSubjectId:s.id}));
const make=(id:string,subject:string,name:string,active=true)=>({id,name,points:name.includes('20堂')?20:10,price:name.includes('20堂')?8550:4500,validDays:90,isActive:active,unit:'SESSION',templateIds:music?['t'+subject]:[],sportsMode:'ASSIGNED',sportsSubjectId:subject,chargeSettings:{kind:'plan',durationMinutes:60,providerIds:[],trialPrice:null,trialDuration:null}});
const plans=[make('a1','A',music?'鋼琴10堂':'瑜伽10堂'),make('b1','B',music?'小提琴10堂':'零基礎成芭10堂'),make('a2','A',music?'鋼琴20堂':'kpop20堂'),{...make('pending','','舊方案待核對'),sportsMode:'OPEN',sportsSubjectId:null,templateIds:[]},make('off','A','已下架收費',false)];
const qa=window as unknown as {qaCalls:unknown[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>};
qa.qaCalls=[];
qa.qaAction=async(name,...args)=>{
 if(name!=='saveSportsFee')throw Error('預覽禁止後端操作：'+name);
 qa.qaCalls.push(args[0]);
 const input=args[0] as Record<string,unknown>,ids=input.subjectIds as string[];
 return {success:true,data:{id:'synthetic-saved',name:input.name,points:input.amount,price:input.price,storeCost:input.storeCost??0,unit:input.unit==='點數'?'POINT':'SESSION',validDays:input.days,isActive:input.active,customerPurchasable:input.customerPurchasable,allowShared:input.shared,templateIds:ids.map(id=>'t'+id),termSessionIds:[],musicTerms:null,musicBonusLessons:0,musicTermSizes:[],sportsMode:ids.length>1?'SUBJECTS':'ASSIGNED',sportsSubjectId:ids.length===1?ids[0]:null,sportsSubjectIds:ids.length>1?ids:[],sportsCost:1,chargeSettings:input.chargeSettings,lowBalanceEnabled:false,lowBalanceThreshold:null}};
};
const sportsData={storeId:'synthetic',date:'2026-11-11',schedulingModes:{selfBookingEnabled:true,assignedSchedulingEnabled:true},subjects:subjects.map(s=>({...s,active:true,updatedAt:'v1',templateId:'t'+s.id})),fees:[],lessons:[],students:[],customers:[],rooms:[],coaches:[{id:"teacher",name:"合成老師",templates:["tA","tB"]}]};
function Fixture(){const params=useSearchParams();return <OperationScope scope="fee-groups-synthetic"><div className="flex min-h-screen min-w-0 bg-earth-50"><aside className="hidden w-60 shrink-0 border-r border-earth-200 bg-white p-5 min-[900px]:block"><strong className="text-lg text-primary-800">蒸管家</strong><p className="mt-8">收費方式</p></aside><main className="min-w-0 flex-1 space-y-3 p-4"><div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm"><span>介面預覽 · 合成資料 · 不會儲存</span><a href="?module=sports">運動全部</a><a href="?module=sports&subjectId=A">運動指定項目</a><a href="?module=music">音樂全部</a></div><>{params.get('view')==='catalog'?<MusicSubjectCatalog subjects={subjects.map(s=>({...s,description:''}))} sportsNative={!music} storeId="synthetic" canEdit={false} canCreate={false}/>:<><CoursePlanPageHeader nativeFees/><CourseMemberWorkspace music={music} sportsNative={!music} sportsData={music?undefined:sportsData} previewStoreId="synthetic" view="plans" subjects={subjects} templates={templates} people={[]} plans={plans} cards={[]} customerRows={[]} assignmentStaff={[]} canEdit canCreate canDelete={false} canManageStaff={false} canAssign={false} canReadBookings={false} canReadTransactions={false} healthEnabled={false} canReadCards={false} canAssignManager={false} sharedCardState="HIDDEN"/></>}</></main></div></OperationScope>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
