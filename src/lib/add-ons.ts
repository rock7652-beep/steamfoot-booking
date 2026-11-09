import { z } from "zod";

export const addOnOption = z.object({
  id: z.string().min(1).max(100),
  imageId: z.string().min(1).max(100).nullable().optional(),
  name: z.string().trim().min(1).max(100),
  price: z.number().int().min(0).max(10000000),
  duration: z.number().int().min(0).max(720),
  active: z.boolean().default(true),
});
export type AddOnTeachingSubject={id:string;name:string;isActive:boolean};
export const addOnGroup = z.object({
  kind:z.enum(['PERSON','SHARED_GOODS']).optional(),
  subjectIds:z.array(z.string().min(1).max(100)).max(500).refine(ids=>new Set(ids).size===ids.length,"教學項目不可重複").optional(),
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(100).default("額外加做"),
  required: z.boolean().default(false),
  multiple: z.boolean().default(true),
  options: z.array(addOnOption).max(50),
});
export const addOnGroups = z.array(addOnGroup).max(20).superRefine((groups, ctx) => {
  const ids = groups.flatMap(g => [g.id, ...g.options.map(o => o.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({code:"custom", message:"附加項目識別碼不可重複"});
  for (const group of groups) if(group.kind==='SHARED_GOODS'&&(group.required||group.options.some(o=>o.duration!==0)))ctx.addIssue({code:'custom',message:'共同商品須為選填，且不增加服務時間'});
  for (const group of groups) if (group.required && !group.options.some(o => o.active)) ctx.addIssue({code:"custom", message:"必選群組至少需要一個啟用項目"});
});
export type AddOnGroup = z.infer<typeof addOnGroup>;
/** Catalog errors must describe the invalid field, not every failure as duration. */
export function addOnCatalogError(error:unknown):string {
 if(error instanceof z.ZodError){
  const issue=error.issues[0],field=issue?.path.at(-1);
  const prefix=typeof issue?.path[0]==='number'&&issue.path[1]==='options'&&typeof issue.path[2]==='number'?`第 ${issue.path[0]+1} 組、第 ${issue.path[2]+1} 個項目：`:'';
  if(field==='name')return prefix+(issue.code==='too_big'?'名稱最多 100 字':'請填寫名稱，或移除未完成的項目');
  if(field==='title')return '請填寫群組名稱（最多 100 字）';
  if(field==='price')return prefix+(issue.code==='too_big'?'金額不可超過 10,000,000 元':'金額請填寫 0 元以上的整數');
  if(issue?.code==='custom')return issue.message;
  return '請核對附加項目的設定';
 }
 return error instanceof Error?error.message:'請核對附加項目的設定';
}
export const selectedAddOnIds = z.array(z.string().min(1).max(100)).max(100).optional();
export const addOnSnapshot = addOnOption.omit({active:true}).extend({groupId:z.string(),groupTitle:z.string(),quantity:z.literal(1)});
export const addOnSnapshots = z.array(addOnSnapshot).max(100);
export type AddOnSnapshot = z.infer<typeof addOnSnapshot>;

/** Resolve prices and time exclusively from the authoritative service catalog. */
export function resolveAddOns(input: unknown, selected: readonly string[] = []): AddOnSnapshot[] {
  const groups = addOnGroups.parse(input ?? []).filter(g=>g.kind!=='SHARED_GOODS');
  if (new Set(selected).size !== selected.length) throw new Error("附加項目不可重複選取");
  const allowed = new Set(groups.flatMap(g => g.options.filter(o => o.active).map(o => o.id)));
  if (selected.some(id => !allowed.has(id))) throw new Error("附加項目已停用或不適用此服務，請重新選擇");
  return groups.flatMap(group => {
    const options = group.options.filter(o => selected.includes(o.id));
    if (group.required && options.length === 0) throw new Error(`請選擇「${group.title}」`);
    if (!group.multiple && options.length > 1) throw new Error(`「${group.title}」最多選擇一項`);
    return options.map(option => addOnSnapshot.parse({...option, groupId:group.id, groupTitle:group.title, quantity:1 as const}));
  });
}
export function addOnTotals(items: readonly (Omit<AddOnSnapshot,'quantity'>&{quantity:number})[]) {
  return items.reduce((sum, item) => ({price:sum.price+item.price*item.quantity, duration:sum.duration+item.duration*item.quantity}), {price:0,duration:0});
}

/** Existing selections remain editable at their booked prices, even after catalog retirement. */
export function bookingAddOnGroups(catalog:unknown,items:readonly (Omit<AddOnSnapshot,'quantity'>&{quantity:number})[]):AddOnGroup[]{
 const groups=addOnGroups.parse(catalog??[]);
 for(const item of items){
  let group=groups.find(g=>g.id===item.groupId);
  if(!group){group={id:item.groupId,title:item.groupTitle,required:false,multiple:true,options:[]};groups.push(group);}
  const option={id:item.id,name:item.name,price:item.price,duration:item.duration,imageId:item.imageId,active:true};
  const index=group.options.findIndex(o=>o.id===item.id);
  if(index<0)group.options.push(option);else group.options[index]=option;
 }
 return groups;
}

export const addOnModule = z.enum(['BEAUTY','STEAMFOOT','FITNESS','MUSIC']);
export type AddOnModule = z.infer<typeof addOnModule>;
export function moduleAddOnGroups(module:AddOnModule,input:unknown){
 addOnModule.parse(module);
 const groups=addOnGroups.parse(input);
 if(module!=='BEAUTY'&&groups.some(g=>g.options.some(o=>o.duration!==0)))throw new Error('此模組的附加項目不得增加時間');
 return groups;
}
export function resolveModuleAddOns(module:AddOnModule,input:unknown,selected:readonly string[]=[]){
 return resolveAddOns(moduleAddOnGroups(module,input),selected);
}

/** Unassigned course groups never implicitly apply to every teaching item. */
export function courseSubjectAddOnGroups(module:'FITNESS'|'MUSIC',input:unknown,subjectId:string|null|undefined){
 return moduleAddOnGroups(module,input).filter(group=>!!subjectId&&group.subjectIds?.includes(subjectId));
}

// Technical request bound, independent of party size; not a stock/entitlement limit.
export const MAX_SHARED_GOODS_QUANTITY=9999;
export const sharedGoodsSelection=z.array(z.object({id:z.string().min(1).max(100),quantity:z.number().int().min(1).max(MAX_SHARED_GOODS_QUANTITY)}).strict()).max(100);
export const sharedGoodsSnapshot=addOnSnapshot.extend({quantity:z.number().int().min(1).max(MAX_SHARED_GOODS_QUANTITY),ownership:z.literal('RESERVATION'),duration:z.literal(0)});
export const sharedGoodsSnapshots=z.array(sharedGoodsSnapshot).max(100);
export function resolveSharedGoods(input:unknown,selections:unknown){
 const selected=sharedGoodsSelection.parse(selections),groups=addOnGroups.parse(input??[]).filter(g=>g.kind==='SHARED_GOODS');
 if(new Set(selected.map(o=>o.id)).size!==selected.length)throw new Error('商品不可重複，請直接調整數量');
 const allowed=new Set(groups.flatMap(g=>g.options.filter(o=>o.active).map(o=>o.id)));
 if(selected.some(o=>!allowed.has(o.id)))throw new Error('商品已停用或不適用此預約');
 const items=groups.flatMap(g=>{const choices=selected.filter(o=>g.options.some(p=>p.id===o.id));if(!g.multiple&&choices.length>1)throw new Error(`「${g.title}」最多選擇一種商品`);return choices.map(choice=>sharedGoodsSnapshot.parse({...g.options.find(o=>o.id===choice.id)!,groupId:g.id,groupTitle:g.title,quantity:choice.quantity,ownership:'RESERVATION'}));});
 if(addOnTotals(items).price>10000000)throw new Error('共同商品總額不可超過 10,000,000 元');
 return items;
}
