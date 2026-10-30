import type {readBeautyCollection} from '@/server/actions/beauty';
import type {readBeautyCollectionPurchaseIntent} from '@/server/actions/beauty-collection-intent';

type StatusInput={expectedStoreId:string;ids:string[];requestKey?:string};
async function read<T>(store:string|undefined,operation:'quote'|'status',ids:string[],requestKey?:string):Promise<T>{
 if(!store)throw Error('門市資訊遺失，請重新開啟收款');
 const at=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/beauty/collection-read',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({store,operation,ids,...(requestKey?{requestKey}:{})})});
  const result=await response.json();
  if(typeof result?.success!=='boolean'||!response.ok&&result.success)throw Error('收款讀取回應不正確');
  return result as T;
 }finally{clearTimeout(timer);if(typeof performance.measure==='function')performance.measure('beauty-read.collection.'+operation,{start:at,end:performance.now()});}
}
/** Read-only HTTP transport; no Next Action or layout/RSC refresh is involved. */
export function readBeautyCollectionQuote(ids:string[],store?:string):ReturnType<typeof readBeautyCollection>{return read(store,'quote',ids);}
export function readBeautyCollectionStatus(input:StatusInput):ReturnType<typeof readBeautyCollectionPurchaseIntent>{return read(input.expectedStoreId,'status',input.ids,input.requestKey);}
