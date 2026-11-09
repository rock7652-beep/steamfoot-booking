import type {AddOnGroup} from '@/lib/add-ons';
/** Shared goods apply when at least one current appointment uses a mapped service. */
export function beautyServiceGoodsGroups(groups:readonly AddOnGroup[],serviceIds:readonly string[]){
 const selected=new Set(serviceIds);
 return groups.filter(g=>g.kind==='SHARED_GOODS'&&g.subjectIds?.some(id=>selected.has(id)));
}
/** Preserve existing inactive bindings, but never add foreign or retired services. */
export function validateBeautyGoodsServices(groups:readonly AddOnGroup[],previous:readonly AddOnGroup[],services:readonly {id:string;active:boolean}[]){
 const available=new Map(services.map(s=>[s.id,s]));
 for(const group of groups)for(const id of group.subjectIds??[]){
  const service=available.get(id);
  if(!service)throw Error('適用服務不屬於本店，請重新選擇');
  if(!service.active&&!previous.find(g=>g.id===group.id)?.subjectIds?.includes(id))throw Error('已停用的服務不可新增對應');
 }
}
