"use client";
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {DashboardLink} from '@/components/dashboard-link';
import {beautyOpeningRoutes,beautySetupHref} from '@/lib/beauty/opening-guide';
/** Navigation state stays in the store-scoped URL. Saving remains owned by each existing page. */
export function BeautySetupNavigation(){
 const params=useSearchParams(),pathname=usePathname(),router=useRouter();
 const index=beautyOpeningRoutes.findIndex(step=>step.id===params.get('beautySetup'));
 if(index<0)return null;
 const current=beautyOpeningRoutes[index],previous=beautyOpeningRoutes[index-1],next=beautyOpeningRoutes[index+1];
 return <nav aria-label="美業開店設定順序" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm"><strong className="mr-auto">開店設定 {index+1}／8・{current.label}</strong>{previous&&<DashboardLink className="flex min-h-11 items-center rounded-lg border border-earth-200 px-3" href={beautySetupHref(previous.id)}>上一步</DashboardLink>}{next?<DashboardLink className="flex min-h-11 items-center rounded-lg bg-primary-700 px-3 text-white" href={beautySetupHref(next.id)}>下一步：{next.label}</DashboardLink>:<DashboardLink className="flex min-h-11 items-center rounded-lg bg-primary-700 px-3 text-white" href="/dashboard/beauty?tab=首頁&beautySetup=review">前往開店檢查</DashboardLink>}<button type="button" className="min-h-11 px-3" onClick={()=>{const query=new URLSearchParams(params);query.delete('beautySetup');router.replace(pathname+(query.size?'?'+query:''));}}>結束引導</button></nav>;
}
