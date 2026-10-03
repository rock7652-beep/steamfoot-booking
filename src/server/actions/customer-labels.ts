"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireWritablePermission, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId, validateStoreAccess } from "@/lib/store";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { requireStoreFeature, hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError, handleActionError } from "@/lib/errors";
import { EMPTY_LABELS, type LabelSnapshot } from "@/lib/customer-labels";
const nameSchema = z.string().trim().min(1).max(8);
const idSchema = z.string().min(1).max(100);
export async function loadCustomerLabels(ids: string[] = [], requestedStoreId?: string): Promise<LabelSnapshot> {
  const fetchedAt=Date.now();
  const user = await requirePermission("customer.read");
  const storeId = requestedStoreId ? await validateStoreAccess(user, idSchema.parse(requestedStoreId), "read") : await getActiveStoreForRead(user);
  if (!storeId || !await hasStoreFeature(storeId, FEATURES.CUSTOMER_LABELS)) return EMPTY_LABELS;
  const customerIds = z.array(idSchema).max(500).parse(ids);
  const [setting, categories, labels, visible, canEdit] = await Promise.all([
    prisma.customerLabelSetting.findUnique({where:{storeId}}),
    prisma.customerLabelCategory.findMany({where:{storeId},orderBy:[{position:"asc"},{number:"asc"}]}),
    prisma.customerLabel.findMany({where:{storeId},orderBy:[{position:"asc"},{name:"asc"},{id:"asc"}]}),
    customerIds.length ? prisma.customer.findMany({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:{in:customerIds},mergedIntoCustomerId:null},select:{id:true}}) : [],
    checkPermission(user.role,user.staffId,"customer.update"),
  ]);
  const enabled = setting?.enabled ?? false;
  const rows = enabled && visible.length ? await prisma.customerLabelAssignment.findMany({where:{storeId,customerId:{in:visible.map(c=>c.id)}}}) : [];
  const assignments: Record<string,string[]> = {};
  for(const c of visible) assignments[c.id]=[];
  for(const row of rows) assignments[row.customerId].push(row.labelId);
  return {storeId,fetchedAt,available:true,enabled,canEdit:canEdit && (user.role==="ADMIN" || storeId===user.storeId),canManage:user.role==="ADMIN" || (user.role==="OWNER" && storeId===user.storeId),categories,labels,assignments};
}
export async function manageCustomerLabels(input: unknown) {
  try {
    const user=await requireWritablePermission("customer.update");
    if(user.role!=="OWNER" && user.role!=="ADMIN") throw new AppError("FORBIDDEN","僅店長可管理標籤");
    const storeId=await resolveWriteStoreId(user);
    await requireStoreFeature(storeId,FEATURES.CUSTOMER_LABELS);
    const data=z.discriminatedUnion("action",[
      z.object({action:z.literal("enable"),enabled:z.boolean()}),
      z.object({action:z.literal("category"),id:idSchema.optional(),name:nameSchema}),
      z.object({action:z.literal("label"),id:idSchema.optional(),categoryId:idSchema,name:nameSchema}),
      z.object({action:z.literal("active"),kind:z.enum(["category","label"]),id:idSchema,active:z.boolean()}),
      z.object({action:z.literal("order"),ids:z.array(idSchema).max(100)}),
      z.object({action:z.literal("label-order"),categoryId:idSchema,ids:z.array(idSchema).max(500)}),
    ]).parse(input);
    const metadata=await prisma.$transaction(async tx=>{
      // Serializes category numbers, settings and assignments for this store.
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      await tx.customerLabelSetting.upsert({where:{storeId},create:{storeId},update:{}});
      if(data.action==="enable") await tx.customerLabelSetting.update({where:{storeId},data:{enabled:data.enabled}});
      if(data.action==="category") {
        if(data.id) {
          const result=await tx.customerLabelCategory.updateMany({where:{id:data.id,storeId},data:{name:data.name}});
          if(!result.count) throw new AppError("NOT_FOUND","分類不存在");
        } else {
          const setting=await tx.customerLabelSetting.update({where:{storeId},data:{nextCategoryNumber:{increment:1}}});
          const number=setting.nextCategoryNumber-1;
          await tx.customerLabelCategory.create({data:{storeId,name:data.name,number,position:number}});
        }
      }
      if(data.action==="label") {
        const category=await tx.customerLabelCategory.findFirst({where:{id:data.categoryId,storeId,active:true}});
        if(!category) throw new AppError("VALIDATION","請選擇啟用中的分類");
        if(data.id) {
          const result=await tx.customerLabel.updateMany({where:{id:data.id,storeId},data:{name:data.name,categoryId:data.categoryId}});
          if(!result.count) throw new AppError("NOT_FOUND","標籤不存在");
        } else {
          const last=await tx.customerLabel.findFirst({where:{storeId,categoryId:data.categoryId},orderBy:{position:"desc"},select:{position:true}});
          await tx.customerLabel.create({data:{storeId,categoryId:data.categoryId,name:data.name,position:(last?.position??-1)+1}});
        }
      }
      if(data.action==="active") {
        const result=data.kind==="category" ? await tx.customerLabelCategory.updateMany({where:{storeId,id:data.id},data:{active:data.active}}) : await tx.customerLabel.updateMany({where:{storeId,id:data.id},data:{active:data.active}});
        if(!result.count) throw new AppError("NOT_FOUND","資料不存在");
      }
      if(data.action==="order") {
        const categories=await tx.customerLabelCategory.findMany({where:{storeId},select:{id:true}});
        if(new Set(data.ids).size!==data.ids.length || categories.length!==data.ids.length || categories.some(c=>!data.ids.includes(c.id))) throw new AppError("CONFLICT","分類已變更，請重新整理");
        for(const [position,id] of data.ids.entries()) await tx.customerLabelCategory.updateMany({where:{storeId,id},data:{position}});
      }
      if(data.action==="label-order") {
        const labels=await tx.customerLabel.findMany({where:{storeId,categoryId:data.categoryId},select:{id:true}});
        const category=await tx.customerLabelCategory.findFirst({where:{storeId,id:data.categoryId}});
        if(!category || new Set(data.ids).size!==data.ids.length || labels.length!==data.ids.length || labels.some(l=>!data.ids.includes(l.id))) throw new AppError("CONFLICT","標籤已變更，請重新整理");
        for(const [position,id] of data.ids.entries()) await tx.customerLabel.updateMany({where:{storeId,categoryId:data.categoryId,id},data:{position}});
      }
      await tx.auditLog.create({data:{actorUserId:user.id,targetType:"CustomerLabel",targetId:storeId,action:"CUSTOMER_LABEL_MANAGE",afterJson:data}});
      const [setting,categories,labels]=await Promise.all([
        tx.customerLabelSetting.findUniqueOrThrow({where:{storeId},select:{enabled:true}}),
        tx.customerLabelCategory.findMany({where:{storeId},orderBy:[{position:"asc"},{number:"asc"}],select:{id:true,name:true,number:true,position:true,active:true}}),
        tx.customerLabel.findMany({where:{storeId},orderBy:[{position:"asc"},{name:"asc"},{id:"asc"}],select:{id:true,categoryId:true,name:true,active:true,position:true}}),
      ]);
      return {enabled:setting.enabled,categories,labels};
    });
    return {success:true as const,metadata};
  }catch(error){return handleActionError(error);}
}
export async function setCustomerLabel(input: unknown) {
  try {
    const data=z.object({customerId:idSchema,labelId:idSchema,selected:z.boolean()}).parse(input);
    const user=await requireWritablePermission("customer.update");
    const storeId=await resolveWriteStoreId(user);
    await requireStoreFeature(storeId,FEATURES.CUSTOMER_LABELS);
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const setting=await tx.customerLabelSetting.findUnique({where:{storeId}});
      if(!setting?.enabled) throw new AppError("FORBIDDEN","顧客標籤已關閉");
      const customer=await tx.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:data.customerId,mergedIntoCustomerId:null},select:{id:true}});
      if(!customer) throw new AppError("FORBIDDEN","無權修改此顧客");
      const label=await tx.customerLabel.findFirst({where:{storeId,id:data.labelId}});
      if(!label) throw new AppError("NOT_FOUND","標籤不存在");
      const category=await tx.customerLabelCategory.findFirst({where:{storeId,id:label.categoryId}});
      if(data.selected && (!label.active || !category?.active)) throw new AppError("CONFLICT","標籤已停用");
      if(data.selected) await tx.customerLabelAssignment.upsert({where:{storeId_customerId_labelId:{storeId,customerId:customer.id,labelId:label.id}},create:{storeId,customerId:customer.id,labelId:label.id},update:{}});
      else await tx.customerLabelAssignment.deleteMany({where:{storeId,customerId:customer.id,labelId:label.id}});
      await tx.auditLog.create({data:{actorUserId:user.id,targetType:"Customer",targetId:customer.id,action:"CUSTOMER_LABEL_SET",afterJson:data}});
    });
    return {success:true as const};
  }catch(error){return handleActionError(error);}
}
