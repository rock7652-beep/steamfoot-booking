import type {CoursePlanCatalogTemplate} from './course-plan-save';
/** Merge server-confirmed metadata atomically with its plan, before route props catch up. */
export function mergeCoursePlanCatalog<T extends {id:string}>(source:T[],plans:{name?:string;templateIds:string[];catalogTemplates?:CoursePlanCatalogTemplate[]}[]):Array<T|(CoursePlanCatalogTemplate&{displayName?:string;currentTeaching?:boolean})>{
 const merged=new Map<string,T|(CoursePlanCatalogTemplate&{displayName?:string;currentTeaching?:boolean})>(source.map(row=>[row.id,row]));
 for(const plan of plans)for(const template of plan.catalogTemplates??[]){
  if(plan.templateIds.includes(template.id))merged.set(template.id,{...template,displayName:plan.name??template.name,currentTeaching:template.isActive});
 }
 return [...merged.values()];
}
