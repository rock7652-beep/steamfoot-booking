import type {CourseRosterData,CourseRosterSource} from '@/app/(dashboard)/dashboard/courses/roster-source';
export async function syncBeautyRoster(scope:string,store:string,version?:string):Promise<{success:true;version:string;unchanged:boolean;data?:CourseRosterData}|{success:false;error:string}>{
 const at=performance.now(),query=new URLSearchParams({scope,store,...(version?{version}:{})}),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const r=await fetch('/api/beauty/roster?'+query,{cache:'no-store',credentials:'same-origin',signal:controller.signal});const value=await r.json();if(typeof value?.success!=='boolean'||!r.ok&&value.success)throw Error('名單讀取回應不正確');return value;}
 finally{clearTimeout(timer);performance.measure(version?'beauty-read.roster.version':'beauty-read.roster.full',{start:at,end:performance.now()});}
}
export async function readBeautyRoster(scope:string,store:string):ReturnType<CourseRosterSource['read']>{
 const result=await syncBeautyRoster(scope,store);if(!result.success)return result;if(!result.data)return {success:false,error:'名單回應不完整'};return {success:true,data:result.data};
}
