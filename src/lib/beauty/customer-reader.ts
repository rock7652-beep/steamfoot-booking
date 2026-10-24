import type {CourseCustomerSource} from '@/app/(dashboard)/dashboard/courses/member-source';
async function read<T>(store:string,operation:string,input?:unknown,offset?:number,range?:{from?:string;to?:string}):Promise<T>{
 const at=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch('/api/beauty/customer-read',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({store,operation,input,offset,range}),signal:controller.signal});const result=await response.json();if(typeof result?.success!=='boolean'||!response.ok&&result.success)throw Error('顧客讀取回應不正確');return result as T;}
 finally{clearTimeout(timer);performance.measure('beauty-read.customer.'+operation,{start:at,end:performance.now()});}
}
export function beautyCustomerReaders(store:string):Pick<CourseCustomerSource,'browseCards'|'reservations'|'bookings'|'purchases'|'cashStatus'|'support'>{
 return {browseCards:input=>read(store,'cards',input),reservations:input=>read(store,'reservations',input),bookings:(id,offset,range)=>read(store,'bookings',id,offset,range),purchases:(id,offset,range)=>read(store,'purchases',id,offset,range),cashStatus:()=>read(store,'cash'),support:async id=>{
  const result=await read<Awaited<ReturnType<NonNullable<CourseCustomerSource['support']>>>>(store,'support',id);
  if(result.success){const c=result.data.advanced.data.customer;
   c.lineLinkedAt=c.lineLinkedAt?new Date(String(c.lineLinkedAt)):null;
   c.lineBindingCodeCreatedAt=c.lineBindingCodeCreatedAt?new Date(String(c.lineBindingCodeCreatedAt)):null;
   c.followUps=c.followUps.map(row=>({...row,createdAt:new Date(String(row.createdAt))}));
  }return result;
 }};
}
