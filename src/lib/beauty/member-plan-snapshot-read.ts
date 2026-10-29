import type { BeautyMemberPlanSnapshot } from '@/server/beauty/member-plan-snapshot';
type Result={success:true;data:BeautyMemberPlanSnapshot}|{success:false;denied:boolean};
export async function readBeautyMemberPlanSnapshot(slug:string,storeId:string,customerId:string,scopeKey:string):Promise<Result>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch('/api/beauty/member-plan-snapshot?'+new URLSearchParams({store:slug}),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!response.ok)return {success:false,denied:response.status===401||response.status===403};
    const value=await response.json() as {success:boolean;data?:BeautyMemberPlanSnapshot};
    if(!value.success||!value.data)return {success:false,denied:false};
    if(value.data.storeId!==storeId||value.data.customerId!==customerId||value.data.scopeKey!==scopeKey)return {success:false,denied:true};
    return {success:true,data:value.data};
  }finally{clearTimeout(timeout);}
}
