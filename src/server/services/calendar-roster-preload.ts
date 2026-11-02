import 'server-only';
import {AppError} from '@/lib/errors';

/** Complete the visible calendar before handing it to the client. Never truncate. */
export async function collectCalendarRosters<T>(sessionIds:readonly string[],read:(id:string)=>Promise<{success:true;data:T}|{success:false;error:string}>):Promise<Record<string,T>> {
 const ids=[...new Set(sessionIds)];
 if(ids.length>1000)throw new AppError('VALIDATION','課表資料超過讀取上限，請聯絡管理者');
 const entries:Array<readonly [string,T]>=[];
 let next=0,failure:string|undefined;
 await Promise.all(Array.from({length:Math.min(2,ids.length)},async()=>{
  while(next<ids.length&&!failure){
   const index=next++,id=ids[index];
   try{const result=await read(id);if(result.success)entries[index]=[id,result.data];else failure=result.error||'課表名單讀取失敗，請重試';}
   catch{failure='課表名單讀取失敗，請重新整理後重試';}
  }
 }));
 if(failure)throw new AppError('VALIDATION',failure);
 return Object.fromEntries(entries);
}
