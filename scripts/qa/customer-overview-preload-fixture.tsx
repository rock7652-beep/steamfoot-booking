// Real readers, card browser, detail hook and module progress components; synthetic HTTP only.
import {useCallback,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PanelReadProvider} from '../../src/components/operations/panel-read-cache';
import {useCustomerPlanPreload} from '../../src/components/admin/use-customer-plan-preload';
import {CourseCardBrowser} from '../../src/app/(dashboard)/dashboard/courses/card-browser';
import {CourseCardProgress} from '../../src/app/(dashboard)/dashboard/courses/card-progress';
import {useCardDetail} from '../../src/app/(dashboard)/dashboard/courses/use-card-detail';
import {beautyCustomerReaders} from '../../src/lib/beauty/customer-reader';
import {BeautyPlanProgress} from '../../src/components/beauty/plan-progress';
import {useBeautyNativePlanProgressReader} from '../../src/components/beauty/use-native-plan-progress-reader';
import {RightSheet} from '../../src/components/admin/right-sheet';
function Detail({beauty=false}:{beauty?:boolean}){
 const ports=useMemo(()=>beautyCustomerReaders('synthetic'),[]);
 const detail=useCardDetail(true,'card',1,beauty?ports.browseCards:undefined,false,undefined,{storeId:'synthetic',preloadSource:beauty});
 return <section aria-label="方案詳情">{detail.loading?<p>讀取方案詳細資料中</p>:<><h3>{detail.data?.name}</h3>{beauty?<BeautyPlanProgress cardId="card" customerId="student" storeId="synthetic" scope="synthetic" revision={0}/>:<CourseCardProgress cardId="card" customerId="student" storeId="synthetic"/>}</>}</section>;
}
function Fixture(){
 const [open,setOpen]=useState(false),[detail,setDetail]=useState(false),[ready,setReady]=useState(false),[music,setMusic]=useState(false),[beauty,setBeauty]=useState(false);
 const ports=useMemo(()=>beautyCustomerReaders('synthetic'),[]),progress=useBeautyNativePlanProgressReader('synthetic');
 const preloadProgress=useCallback((customer:string,card:string,revision:number)=>progress.read('synthetic',customer,card,revision),[progress]);
 const getProgress=useCallback((customer:string,card:string,revision:number)=>progress.get('synthetic',customer,card,revision),[progress]);
 const preload=useCustomerPlanPreload({canReadCards:true,canReadBookings:true,storeId:'synthetic',music,load:beauty?ports.browseCards:undefined,support:beauty?ports.support:undefined,preloadCardDetails:beauty,preloadCardProgress:beauty?preloadProgress:undefined,getCardProgress:beauty?getProgress:undefined});
 return <main className="p-6"><h1>合成顧客預讀驗證</h1><button onClick={()=>setMusic(!music)} className="min-h-11 px-3">{music?'音樂':'運動'}</button><button className="min-h-11 px-3" onClick={()=>{setBeauty(true);setReady(false);setDetail(false);}}>美業</button><button className="min-h-11 px-3" onClick={()=>void preload.visibleReader.read('student').then(()=>setReady(true))}>{ready?'預讀完成':'預讀'}</button><button className="min-h-11 px-3" onClick={()=>setOpen(true)}>開啟顧客</button>{open&&<RightSheet open presentation="centered" width={1100} labelledById="customer-title" onClose={()=>setOpen(false)}><header className="flex items-center justify-between border-b p-4"><h2 id="customer-title">合成學員</h2><button className="min-h-11 px-3" onClick={()=>setOpen(false)}>關閉</button></header><div className="overflow-y-auto p-4"><CourseCardBrowser overview customerId="student" storeId="synthetic" canReadBookings native={!music} load={beauty?ports.browseCards:undefined} preloadDetails={beauty} state={{search:'',history:false,page:0}} onChange={()=>{}} onSelect={()=>setDetail(true)} renderProgress={card=>beauty?<BeautyPlanProgress cardId={card.id} customerId="student" storeId="synthetic" scope="synthetic" revision={0}/>:<CourseCardProgress showSummary={false} cardId={card.id} customerId="student" storeId="synthetic"/>}/>{detail&&<Detail beauty={beauty}/>}</div></RightSheet>}</main>;
}
createRoot(document.getElementById('root')!).render(<PanelReadProvider><Fixture/></PanelReadProvider>);
