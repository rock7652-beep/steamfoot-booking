/** Session-scoped pointers contain only the order identifier and request key.
 * They are not authoritative: all results are verified with the server. */
export type OnlineConfirmStatus = 'PREPARED' | 'COMMITTED' | 'ACKNOWLEDGED' | 'CANCELLED';
export type OnlineConfirmView = { status: OnlineConfirmStatus; requestKey: string; purchaseId: string | null; customerName:string; planName:string; amount:number|null; canCommit:boolean };
export type OnlineConfirmEntry = OnlineConfirmView & { orderId: string };
export type OnlineConfirmPointer = { orderId: string; requestKey: string };
type Result<T> = { success: true; data: T } | { success: false; error?: string };
type Scope = OnlineConfirmPointer & { expectedStoreId: string };
export type OnlineConfirmPort = {
  list: (scope: { expectedStoreId: string }) => Promise<Result<OnlineConfirmEntry[]>>;
  read: (scope: Scope) => Promise<Result<OnlineConfirmView | null>>;
  prepare: (scope: Scope) => Promise<Result<OnlineConfirmView>>;
  commit: (scope: Scope) => Promise<Result<OnlineConfirmView>>;
  cancel: (scope: Scope) => Promise<Result<OnlineConfirmView>>;
  acknowledge: (scope: Scope) => Promise<Result<OnlineConfirmView>>;
};
export type OnlineConfirmSnapshot = { kind: 'ready'; entries: OnlineConfirmEntry[]; localMissing: OnlineConfirmPointer | null } | { kind: 'uncertain'; reason: 'storage' | 'network' | 'protocol' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function pointerValid(x: unknown): x is OnlineConfirmPointer {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const p=x as Record<string,unknown>;
  return Object.keys(p).sort().join(',')==='orderId,requestKey' && typeof p.orderId==='string' && p.orderId.length>0 && p.orderId.length<=180 && typeof p.requestKey==='string' && uuid.test(p.requestKey);
}
function validView(x: unknown, requestKey?: string): x is OnlineConfirmView {
  if (!x || typeof x!=='object') return false;
  const v=x as OnlineConfirmView;
  return typeof v.requestKey==='string' && uuid.test(v.requestKey) && (!requestKey||v.requestKey===requestKey) &&
    ['PREPARED','COMMITTED','ACKNOWLEDGED','CANCELLED'].includes(v.status) && typeof v.customerName==='string' && typeof v.planName==='string' && (v.amount===null || Number.isSafeInteger(v.amount)&&v.amount>=0) && typeof v.canCommit==='boolean' && (!v.canCommit || (v.amount!==null && !!v.customerName && !!v.planName)) &&
    (['COMMITTED','ACKNOWLEDGED'].includes(v.status) ? typeof v.purchaseId==='string' && !!v.purchaseId : v.purchaseId===null);
}
export function createBeautyOnlineConfirmRecovery(o: {storeId:string;userId:string;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;randomUUID:()=>string;port:OnlineConfirmPort}) {
  const {storeId,userId,storage,port}=o;
  if (!storeId||!userId) throw new Error('Missing online confirmation scope');
  const storageKey=`beauty-online-confirm:v1:${encodeURIComponent(storeId)}:${encodeURIComponent(userId)}`;
  const error=(reason:'storage'|'network'|'protocol'):OnlineConfirmSnapshot=>({kind:'uncertain',reason});
  function local(): OnlineConfirmPointer | null | undefined {
    try { const raw=storage.getItem(storageKey); if(raw===null)return null;const value:unknown=JSON.parse(raw);return pointerValid(value)?value:undefined; } catch{return undefined;}
  }
  function remember(p:OnlineConfirmPointer):boolean {
    try {const existing=local();if(existing===undefined || (existing && (existing.orderId!==p.orderId||existing.requestKey!==p.requestKey)))return false;storage.setItem(storageKey,JSON.stringify(p));const saved=local();return !!saved&&saved.orderId===p.orderId&&saved.requestKey===p.requestKey;}catch{return false;}
  }
  function forget(p:OnlineConfirmPointer):boolean {
    try {const old=local();if(old===undefined)return false;if(!old||old.orderId!==p.orderId||old.requestKey!==p.requestKey)return true;storage.removeItem(storageKey);return local()===null;}catch{return false;}
  }
  const scoped=(p:OnlineConfirmPointer):Scope=>({...p,expectedStoreId:storeId});
  async function inspect():Promise<OnlineConfirmSnapshot> {
    const p=local();if(p===undefined)return error('storage');
    try {
      const listed=await port.list({expectedStoreId:storeId});if(!listed.success)return error('network');
      if(!Array.isArray(listed.data)||listed.data.some(row=>!row||typeof row.orderId!=='string'||!row.orderId||!validView(row)||!['PREPARED','COMMITTED'].includes(row.status)))return error('protocol');
      const entries=[...listed.data];let localMissing:OnlineConfirmPointer|null=null;
      if(p&&!entries.some(row=>row.orderId===p.orderId&&row.requestKey===p.requestKey)){
        const found=await port.read(scoped(p));if(!found.success)return error('network');
        if(!found.data)localMissing=p;
        else if(!validView(found.data,p.requestKey))return error('protocol');
        else entries.push({...found.data,orderId:p.orderId});
      }
      return {kind:'ready',entries,localMissing};
    }catch{return error('network');}
  }
  async function start(orderId:string):Promise<OnlineConfirmSnapshot> {
    const before=await inspect();if(before.kind!=='ready'||before.entries.length||before.localMissing)return before;
    let requestKey:string;try{requestKey=o.randomUUID();}catch{return error('storage');}
    const p={orderId,requestKey};if(!pointerValid(p)||!remember(p))return error('storage');
    try {const r=await port.prepare(scoped(p));if(!r.success)return error('network');if(!validView(r.data,requestKey))return error('protocol');return {kind:'ready',entries:[{...r.data,orderId}],localMissing:null};}catch{return error('network');}
  }
  async function change(p:OnlineConfirmPointer, action:'commit'|'cancel'|'acknowledge'):Promise<OnlineConfirmSnapshot> {
    if(!pointerValid(p))return error('protocol');
    try {
      const result=await port[action](scoped(p));if(!result.success)return error('network');
      if(!validView(result.data,p.requestKey))return error('protocol');
      if(action==='acknowledge'){
        if(result.data.status!=='ACKNOWLEDGED'||!forget(p))return error('storage');
        return inspect();
      }
      return {kind:'ready',entries:[{...result.data,orderId:p.orderId}],localMissing:null};
    }catch{return error('network');}
  }
  async function clearCancelled(p:OnlineConfirmPointer):Promise<OnlineConfirmSnapshot> {
    try {const result=await port.read(scoped(p));if(!result.success)return error('network');if(!validView(result.data,p.requestKey)||result.data.status!=='CANCELLED')return error('protocol');if(!forget(p))return error('storage');return inspect();}catch{return error('network');}
  }
  return {inspect,start,commit:(p:OnlineConfirmPointer)=>change(p,'commit'),cancel:(p:OnlineConfirmPointer)=>change(p,'cancel'),acknowledge:(p:OnlineConfirmPointer)=>change(p,'acknowledge'),clearCancelled};
}
