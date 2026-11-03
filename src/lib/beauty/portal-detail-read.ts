import type {readBeautyCardHistory as History,readBeautyOwnIncome as Income,readBeautyWorkRecords as Records} from '@/server/actions/beauty-portal';
/** Authenticated same-origin GET; the response cannot replace RSC props or their readVersion. */
async function read<T>(slug:string,params:Record<string,string>):Promise<T>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
 try{
  const response=await fetch('/api/beauty/portal-details?'+new URLSearchParams({store:slug,...params}),{cache:'no-store',credentials:'same-origin',signal:controller.signal});
  const result=await response.json();
  if(!result||typeof result.success!=='boolean'||(result.success?!('data' in result):typeof result.error!=='string')||(!response.ok&&result.success))throw new Error('讀取失敗');
  return result as T;
 }finally{clearTimeout(timer);}
}
export async function readBeautyCardHistory(cardId:string,slug:string){return read<Awaited<ReturnType<typeof History>>>(slug,{kind:'history',card:cardId});}
export async function readBeautyOwnIncome(month:string,slug:string){return read<Awaited<ReturnType<typeof Income>>>(slug,{kind:'income',month});}
export async function readBeautyWorkRecords(input:{month:string;pending:boolean;search:string;page:number},slug:string){return read<Awaited<ReturnType<typeof Records>>>(slug,{kind:'records',month:input.month,pending:input.pending?'1':'0',search:input.search,page:String(input.page)});}
