import type {LabelSnapshot} from './customer-labels';
/** Same-origin, authorized and scoped on every read; no global customer cache. */
export async function readCustomerLabels(ids:string[],storeId?:string):Promise<LabelSnapshot>{
 const at=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/customer-labels/read',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,...(storeId?{storeId}:{})}),signal:controller.signal});
  const result=await response.json();
  if(!response.ok||typeof result?.enabled!=='boolean'||!result.assignments)throw Error('標籤讀取失敗');
  if(storeId&&result.storeId&&result.storeId!==storeId)throw Error('門市已變更，請重新開啟');
  return result as LabelSnapshot;
 }finally{clearTimeout(timer);try{performance.measure?.('customer-labels.read',{start:at,end:performance.now()});}catch{/* Optional timing cannot change a read result. */}}
}
