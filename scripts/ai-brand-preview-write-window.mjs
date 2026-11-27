// Shared by runtime and build validation. No implicit operations or unbounded windows.
export const BRAND_PREVIEW_WRITE_OPERATIONS=['save','publish','withdraw','setting','handoff','resume','test'];
export function brandPreviewWriteWindow(env,now=new Date()) {
  const list=env.AI_BRAND_PREVIEW_WRITE_OPERATIONS,until=env.AI_BRAND_PREVIEW_WRITE_UNTIL;
  if(list===undefined&&until===undefined)return {configured:false,valid:false,operations:[]};
  const operations=typeof list==='string'?list.split(','):[],end=Date.parse(until??''),remaining=end-now.getTime();
  const valid=operations.length>0&&new Set(operations).size===operations.length&&operations.every(x=>BRAND_PREVIEW_WRITE_OPERATIONS.includes(x))&&Number.isFinite(end)&&remaining>0&&remaining<=30*60_000;
  return {configured:true,valid,operations:valid?operations:[]};
}
