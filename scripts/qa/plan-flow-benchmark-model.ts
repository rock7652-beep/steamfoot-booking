// Synthetic read ports with a fixed delay. No real service or database is called.
const model={version:0,calls:[] as {kind:string;version:number;started:number;finished?:number}[]};
export const transportDelayMs=180;
export function modelVersion(){return model.version;}
export function mutateModel(){model.version++;}
export function callSnapshot(){return model.calls.map(call=>({...call}));}
export function progress(version=model.version){return {available:true as const,total:10,completed:[{id:'original',date:'2026-11-03T02:00:00.000Z',customerName:'合成顧客'},...(version>0?[{id:'backfill',date:version>2?'2026-11-06T02:00:00.000Z':'2026-11-05T02:00:00.000Z',customerName:'合成顧客'}]:[])],voided:version>1?[{id:'void',date:'2026-11-11T02:00:00.000Z',customerName:'合成顧客'}]:[]};}
export function remaining(version=model.version){return 10-progress(version).completed.length-progress(version).voided.length;}
export function card(version=model.version){return {id:'card',planId:'plan',name:'合成十堂方案',unit:'SESSION' as const,templateIds:[],termSessionIds:[],allowShared:false,musicValidityDays:null,musicActivatedAt:null,openingIssue:null,openingImported:false,remaining:remaining(version),held:1,available:remaining(version)-1,closed:false,expired:false,expiresAt:'2027-12-31T00:00:00Z',members:[{id:'customer',name:'合成顧客',phone:''}],entries:[]};}
export async function readModel(kind:string){
 const version=model.version,call={kind,version,started:performance.now(),finished:undefined as number|undefined};model.calls.push(call);
 await new Promise(resolve=>setTimeout(resolve,transportDelayMs));call.finished=performance.now();
 if(kind==='cards')return {success:true as const,rows:[card(version)],hasMore:false,totals:[]};
 if(kind==='progress')return {success:true as const,data:{...progress(version),shared:false,canReadPrice:true,purchasePrice:3000,purchasedAt:'2026-10-20T02:00:00Z'}};
 if(kind==='beauty-progress')return {success:true as const,data:{progress:progress(version),price:3000,purchasedAt:'2026-10-20T02:00:00Z',shared:false}};
 if(kind==='detail')return {progress:progress(version),remaining:remaining(version),price:3000};
 return {success:true as const,data:[],rows:[],hasMore:false};
}
export const readNativeCourseCards=()=>readModel('cards');
export const readCourseCardProgress=()=>readModel('progress');
export const readMusicPeriods=()=>readModel('periods');
export const readBeautyNativeCardProgress=()=>readModel('beauty-progress');
