import "server-only";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { coursePrisma } from "@/lib/course-db";
import { PERMISSION_LABELS } from "@/lib/permissions";
import { auditRecord, auditSnapshotTarget, auditTargetLabel, auditText, type AuditReferences, type PresentedAudit } from "@/lib/audit-presentation";

type AuditRow = PresentedAudit & { id: string; targetId: string; storeId: string | null };
/** Called only after the audit query's authorization. Every name lookup is
 * constrained to the evidence's store; never follow an arbitrary snapshot ID
 * into another store. Current names supplement, never replace, snapshots. */
export async function resolveAuditPresentation(rows: AuditRow[], options: { hq?: boolean } = {}) {
  const targets = new Map<string, string>();
  const refs: Record<string, AuditReferences> = Object.fromEntries(rows.map(row => [row.id, {}]));
  const groups = (types: string[]) => rows.filter(r => r.storeId && types.includes(r.targetType)).map(r => ({ id: r.targetId, storeId: r.storeId! }));
  const storeIds = [...new Set(rows.flatMap(r => r.storeId ? [r.storeId] : []))];
  const viewedStoreIds = options.hq ? rows.flatMap(r=>[r.beforeJson,r.afterJson].flatMap(v=>Object.entries(auditRecord(v)).filter(([key])=>["viewedStoreId","ownStoreId"].includes(key)).flatMap(([,value])=>typeof value === "string" && value !== "__all__" ? [value] : []))) : [];
  const visibleStoreIds = [...new Set([...storeIds,...viewedStoreIds])];
  const set = (type: string, id: string, storeId: string, label: string) => targets.set(`${type}:${storeId}:${id}`, auditText(label));
  await Promise.all([
    (async () => { const OR = groups(["Booking"]); if (!OR.length) return;
      const found = await prisma.booking.findMany({ where: { OR }, select: { id: true, storeId: true, bookingDate: true, slotTime: true, customer: { select: { name: true } } } });
      found.forEach(r => set("Booking",r.id,r.storeId,`${r.customer.name} · ${r.bookingDate.toISOString().slice(0,10)} ${r.slotTime}`)); })(),
    (async () => { const OR = groups(["Customer"]); if (!OR.length) return;
      const found = await prisma.customer.findMany({ where: { OR }, select: { id: true, storeId: true, name: true } }); found.forEach(r => set("Customer",r.id,r.storeId,r.name)); })(),
    (async () => { const OR = groups(["Staff","StaffPermission"]); if (!OR.length) return;
      const found = await prisma.staff.findMany({ where: { OR }, select: { id: true, storeId: true, user: { select: { name: true } } } });
      found.forEach(r => ["Staff","StaffPermission"].forEach(t => set(t,r.id,r.storeId,r.user.name))); })(),
    (async () => { const OR = groups(["CustomerPlanWallet"]); if (!OR.length) return;
      const found = await prisma.customerPlanWallet.findMany({ where: { OR }, select: { id: true, storeId: true, customer: { select: { name: true } }, plan: { select: { name: true } } } });
      found.forEach(r => set("CustomerPlanWallet",r.id,r.storeId,`${r.customer.name} · ${r.plan.name}`)); })(),
    (async () => { const OR = groups(["CashbookEntry"]); if (!OR.length) return;
      const found = await prisma.cashbookEntry.findMany({ where: { OR }, select: { id: true, storeId: true, entryDate: true, category: true, amount: true } });
      found.forEach(r => set("CashbookEntry",r.id,r.storeId,`${r.entryDate.toISOString().slice(0,10)} · ${r.category ?? "收支"} · NT$ ${Number(r.amount).toLocaleString("zh-TW")}`)); })(),
    (async () => { const OR = groups(["Transaction"]); if (!OR.length) return;
      const found = await prisma.transaction.findMany({ where: { OR }, select: { id: true, storeId: true, customer: { select: { name: true } }, amount: true } });
      found.forEach(r => set("Transaction",r.id,r.storeId,`${r.customer.name} · NT$ ${Number(r.amount).toLocaleString("zh-TW")}`)); })(),
    (async () => { const OR = groups(["SpaBooking"]); if (!OR.length) return;
      const found = await spaPrisma.spaBooking.findMany({ where: { OR }, select: { id: true, storeId: true, customerId: true, serviceNameSnapshot: true, bookingDate: true, startTime: true } });
      const customers = found.length ? await prisma.customer.findMany({ where: { OR: found.map(r=>({id:r.customerId,storeId:r.storeId})) }, select: { id: true, storeId: true, name: true } }) : [];
      const names = new Map(customers.map(r=>[`${r.storeId}:${r.id}`,r.name]));
      found.forEach(r => set("SpaBooking",r.id,r.storeId,`${names.get(`${r.storeId}:${r.customerId}`) ?? "顧客姓名未記錄"} · ${r.serviceNameSnapshot} · ${r.bookingDate.toISOString().slice(0,10)} ${r.startTime}`)); })(),
    (async () => { const OR = groups(["CourseBooking"]); if (!OR.length) return;
      const found = await coursePrisma.courseBooking.findMany({ where: { OR }, select: { id: true, storeId: true, customerName: true, session: { select: { nameSnapshot: true, startsAt: true } } } });
      found.forEach(r => set("CourseBooking",r.id,r.storeId,`${r.customerName} · ${r.session.nameSnapshot} · ${r.session.startsAt.toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false})}`)); })(),
    (async () => { const OR = groups(["CourseSession"]); if (!OR.length) return;
      const found = await coursePrisma.courseSession.findMany({ where: { OR }, select: { id: true, storeId: true, nameSnapshot: true, startsAt: true } });
      found.forEach(r => set("CourseSession",r.id,r.storeId,`${r.nameSnapshot} · ${r.startsAt.toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false})}`)); })(),
    (async () => { const OR = groups(["CourseTemplate"]); if (!OR.length) return;
      const found = await coursePrisma.courseTemplate.findMany({ where: { OR }, select: { id: true, storeId: true, name: true } }); found.forEach(r => set("CourseTemplate",r.id,r.storeId,r.name)); })(),
    ...(["InventoryProduct","InventorySupplier"] as const).map(async type => { const OR = groups([type]); if (!OR.length) return;
      const found = type === "InventoryProduct" ? await prisma.inventoryProduct.findMany({where:{OR},select:{id:true,storeId:true,name:true}}) : await prisma.inventorySupplier.findMany({where:{OR},select:{id:true,storeId:true,name:true}});
      found.forEach(r=>set(type,r.id,r.storeId,r.name)); }),
    (async () => { const OR = groups(["InventoryOrder"]); if (!OR.length) return;
      const found = await prisma.inventoryOrder.findMany({ where:{OR},select:{id:true,storeId:true,partyName:true,date:true,workOrderNumber:true,kind:true} });
      found.forEach(r=>set("InventoryOrder",r.id,r.storeId,`${r.kind === "SALE" ? "銷貨" : "進貨"} · ${r.partyName} · ${r.date.toISOString().slice(0,10)}${r.workOrderNumber ? ` · ${r.workOrderNumber}` : ""}`)); })(),
    (async () => { const OR = groups(["InventoryPayment"]); if (!OR.length) return;
      const found = await prisma.inventoryPayment.findMany({where:{OR},select:{id:true,storeId:true,partyName:true,date:true,total:true}});
      found.forEach(r=>set("InventoryPayment",r.id,r.storeId,`${r.partyName} · ${r.date.toISOString().slice(0,10)} · NT$ ${r.total.toLocaleString("zh-TW")}`)); })(),
    (async () => { const OR = groups(["InventoryStockCount"]); if (!OR.length) return;
      const found = await prisma.inventoryStockCount.findMany({where:{OR},select:{id:true,storeId:true,date:true,reason:true}});
      found.forEach(r=>set("InventoryStockCount",r.id,r.storeId,`${r.date.toISOString().slice(0,10)} · ${r.reason}`)); })(),
    (async () => { if (!storeIds.length) return;
      const stores = await prisma.store.findMany({where:{id:{in:visibleStoreIds}},select:{id:true,name:true}});
      for (const row of rows) for (const store of stores) if (options.hq || row.storeId === store.id) {
        for (const key of ["storeId","viewedStoreId","ownStoreId"]) refs[row.id][`${key}:${store.id}`] = `${store.name}（目前名稱）`;
        for (const type of ["Store","StoreView","BusinessHours","CourseWaitlistSetting","CustomerLabel"]) if (row.targetId === store.id) set(type,store.id,store.id,store.name);
      } })(),
  ]);
  // Name references are batched and scoped separately for each evidence store.
  for (const storeId of storeIds) {
    const scoped = rows.filter(r=>r.storeId === storeId);
    const ids = (keys: string[]) => [...new Set(scoped.flatMap(r=>[r.beforeJson,r.afterJson].flatMap(v=>Object.entries(auditRecord(v)).filter(([k])=>keys.includes(k)).flatMap(([,v])=>typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x):x is string=>typeof x === "string") : []))))];
    const customerKeys = ["customerId","customerIds"], staffKeys = ["staffId","assignedStaffId","revenueStaffId","serviceStaffId"], planKeys = ["planId","servicePlanId"];
    const [customers,staff,plans] = await Promise.all([
      ids(customerKeys).length ? prisma.customer.findMany({where:{storeId,id:{in:ids(customerKeys)}},select:{id:true,name:true}}) : [],
      ids(staffKeys).length ? prisma.staff.findMany({where:{storeId,id:{in:ids(staffKeys)}},select:{id:true,user:{select:{name:true}}}}) : [],
      ids(planKeys).length ? prisma.servicePlan.findMany({where:{storeId,id:{in:ids(planKeys)}},select:{id:true,name:true}}) : [],
    ]);
    for (const row of scoped) {
      customers.forEach(r=>{ refs[row.id][`customerId:${r.id}`] = `${r.name}（目前姓名）`; });
      staff.forEach(r=>staffKeys.forEach(key=>{ refs[row.id][`${key}:${r.id}`] = `${r.user.name}（目前姓名）`; }));
      plans.forEach(r=>planKeys.forEach(key=>{ refs[row.id][`${key}:${r.id}`] = `${r.name}（目前名稱）`; }));
    }
  }
  for (const row of rows) for (const snapshot of [row.beforeJson,row.afterJson]) {
    const permissions = auditRecord(snapshot).permissions;
    const codes = Array.isArray(permissions) ? permissions.filter((v):v is string=>typeof v === "string") : Object.keys(auditRecord(permissions));
    for (const code of codes) if (Object.hasOwn(PERMISSION_LABELS,code)) refs[row.id][`permission:${code}`] = PERMISSION_LABELS[code as keyof typeof PERMISSION_LABELS];
  }
  return new Map(rows.map(row => {
    const snapshot = auditSnapshotTarget(row), current = targets.get(`${row.targetType}:${row.storeId}:${row.targetId}`);
    return [row.id, { target: snapshot ?? (current ? `${auditTargetLabel(row.targetType)} · ${current}（目前資料）` : `${auditTargetLabel(row.targetType)} · 舊紀錄未保存辨識內容，或資料已移除`), references: refs[row.id] }];
  }));
}
