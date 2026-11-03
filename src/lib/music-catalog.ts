/** Resolve catalog labels by stable item identity, never by matching names. */
type ItemTemplate = {id:string;name:string;musicSubjectId?:string|null};
type Item = {id:string;name:string};
export function musicPlanItems(templateIds:string[], templates:ItemTemplate[], subjects:Item[]) {
 const items=new Map<string,Item>();
 for(const id of templateIds){
  const template=templates.find(t=>t.id===id);
  if(!template)continue;
  const subject=subjects.find(s=>s.id===template.musicSubjectId);
  const item=subject??{id:template.id,name:template.name};
  items.set(item.id,item);
 }
 return [...items.values()];
}
