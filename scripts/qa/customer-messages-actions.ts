import type {MessageDraft, MessageFilters, MessageHistory, MessagePerson, MessagePreview} from "../../src/lib/customer-message";
export const people:MessagePerson[]=Array.from({length:32},(_,i)=>({id:"person-"+(i+1),name:"示範顧客 "+(i+1),phone:"09•• ••• "+String(i+1).padStart(3,"0"),lineStatus:i===1?"UNLINKED":"LINKED",stage:"ACTIVE"}));
type Call={operation:string;id?:string;input?:MessageDraft};
declare global {interface Window {__messageQA:{calls:Call[];failConfirmation:boolean}}}
window.__messageQA={calls:[],failConfirmation:false};
let history:MessageHistory[]=[],sequence=0;
const previews=new Map<string,MessagePreview>();
export async function searchMessageCustomers(_store:string,filters:MessageFilters,page=1){
  await new Promise(resolve=>setTimeout(resolve,filters.search==="slow"?200:5));
  if(filters.search==="error")return {success:false as const,error:"示範讀取失敗"};
  const rows=people.filter(p=>(!filters.search||p.name.includes(filters.search)||p.phone.includes(filters.search))&&(!filters.line||p.lineStatus===filters.line)&&(!filters.stage||p.stage===filters.stage));
  return {success:true as const,data:{rows:rows.slice((page-1)*25,page*25),total:rows.length,page}};
}
export async function selectMessageCustomers(_store:string,filters:MessageFilters){return {success:true as const,data:people.filter(p=>(!filters.search||p.name.includes(filters.search))&&(!filters.line||p.lineStatus===filters.line))};}
export async function previewMessage(_store:string,input:MessageDraft){
  window.__messageQA.calls.push({operation:"preview",input});
  const selected=people.filter(p=>input.customerIds.includes(p.id));
  const id="preview-"+(++sequence);
  const result:MessagePreview={id,body:input.body.trim(),scheduledAt:input.timing==="now"?new Date().toISOString():new Date(input.date+"T"+input.time+":00+08:00").toISOString(),immediate:input.timing==="now",expiresAt:new Date(Date.now()+900000).toISOString(),ready:selected.filter(p=>p.lineStatus==="LINKED"),excluded:selected.filter(p=>p.lineStatus!=="LINKED").map(p=>({...p,reason:"尚未綁定本店 LINE"})),blocker:location.search.includes("blocked")?"此環境僅供預覽，不會對顧客發送訊息":null,quota:{used:100,limit:1000}};
  previews.set(id,result);return {success:true as const,data:result};
}
export async function confirmMessage(_store:string,id:string){
  window.__messageQA.calls.push({operation:"confirm",id});
  const p=previews.get(id)!;
  if(!history.some(h=>h.id===id))history.unshift({id,body:p.body,scheduledAt:p.scheduledAt,createdAt:new Date().toISOString(),status:"QUEUED",total:p.ready.length+p.excluded.length,accepted:0,pending:p.ready.length,failed:0,skipped:p.excluded.length,unknown:0});
  if(window.__messageQA.failConfirmation){window.__messageQA.failConfirmation=false;throw new Error("Response lost after commit");}
  return {success:true as const,data:{id,status:"QUEUED"}};
}
export async function loadMessageHistory(){return {success:true as const,data:[...history]};}
export async function loadMessageSelection(_store:string,ids:string[]){return {success:true as const,data:ids.map(id=>people.find(p=>p.id===id)!)};}
export async function cancelMessage(_store:string,id:string){history=history.map(h=>h.id===id?{...h,status:"CANCELLED",skipped:h.skipped+h.pending,pending:0}:h);return {success:true as const,data:{id}};}
