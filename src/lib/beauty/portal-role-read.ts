import type {BeautyPortalData} from '@/server/beauty/queries';
type Result={success:true;data:BeautyPortalData}|{success:false;error:string};
/** Same-origin, cookie-authenticated read. Never persist or serve a stale role payload. */
export async function readBeautyPortalRole(work:boolean,slug:string):Promise<Result>{
 const response=await fetch('/api/beauty/portal-role?'+new URLSearchParams({work:work?'1':'0',store:slug}),{cache:'no-store',credentials:'same-origin'});
 const result=await response.json() as Result;
 if(!response.ok||!result.success)return {success:false,error:!result.success?result.error:'切換失敗，請重試。'};
 if(result.data.work!==work||result.data.store.slug!==slug)return {success:false,error:'店家或身分已變更，請重新登入。'};
 return result;
}
