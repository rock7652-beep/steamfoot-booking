import 'server-only';
import {Prisma} from '../../../generated/beauty-client';
import {AppError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
import {serviceInput,technicianInput,planInput,rate} from '@/lib/beauty/contracts';
import {audit,type BeautyActor} from './access';

/** Single catalog validator/writer shared by all management interfaces. */
export async function persistBeautyCatalog(tx:Prisma.TransactionClient,a:BeautyActor,kind:'service'|'technician'|'plan',input:unknown){
      let record:unknown;
      if (kind === "service") {
        const { id, revision, ...d } = serviceInput.parse(input);
        const {defaultRate,...fields}=d;
        const values={...fields,...(defaultRate===undefined?{}:{defaultRate:defaultRate??Prisma.DbNull})};
        if (id) {
          const prior = await tx.beautyService.findFirst({
            where: { storeId: a.storeId, id, revision },
          });
          if (!prior) throw new AppError("CONFLICT", "服務已更新，請重新開啟");
          if (
            !d.active &&
            (await tx.beautyAppointment.count({
              where: { storeId: a.storeId, serviceId: id, status: "RESERVED" },
            }))
          )
            throw new AppError("CONFLICT", "請先處理未來預約再下架");
          if(d.defaultRate===null&&prior.defaultRate){
            const inheriting=await tx.beautyTechnician.findMany({where:{storeId:a.storeId,serviceIds:{has:id}},select:{rates:true}});
            if(inheriting.some(t=>!rate.safeParse((t.rates as Record<string,unknown>)[id]).success))throw new AppError('CONFLICT','仍有技師沿用本項預設計酬，請先設定個別計酬');
          }
          record = await tx.beautyService.update({
            where: { id },
            data: { ...values, revision: { increment: 1 } },
          });
        } else
          record = await tx.beautyService.create({ data: { ...values, storeId: a.storeId } });
      } else if (kind === "plan") {
        const { id, revision, ...d } = planInput.parse(input);
        if (
          (await tx.beautyService.count({
            where: { storeId: a.storeId, id: { in: d.serviceIds } },
          })) !== new Set(d.serviceIds).size
        )
          throw new AppError("FORBIDDEN", "方案包含非本店服務");
        if (id) {
          if (
            !(await tx.beautyPlan.findFirst({
              where: { storeId: a.storeId, id, revision },
            }))
          )
            throw new AppError("CONFLICT", "方案已更新");
          record = await tx.beautyPlan.update({
            where: { id },
            data: { ...d, revision: { increment: 1 } },
          });
        } else
          record = await tx.beautyPlan.create({ data: { ...d, storeId: a.storeId } });
      } else {
        const { id, revision, ...d } = technicianInput.parse(input);
        if (
          (await tx.beautyService.count({
            where: { storeId: a.storeId, id: { in: d.serviceIds } },
          })) !== new Set(d.serviceIds).size
        )
          throw new AppError("FORBIDDEN", "包含非本店服務");
        const missing=d.serviceIds.filter(id=>!d.rates[id]);
        if(missing.length){
          const defaults=await tx.beautyService.findMany({where:{storeId:a.storeId,id:{in:missing}},select:{id:true,defaultRate:true}});
          if(missing.some(id=>!rate.safeParse(defaults.find(s=>s.id===id)?.defaultRate).success))throw new AppError('VALIDATION','每項可服務項目須設定計酬，或沿用已設定的服務預設');
        }
        if (
          d.userId &&
          !(await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT c.id FROM "Customer" c WHERE c."storeId"=${a.storeId} AND c."userId"=${d.userId} AND c."mergedIntoCustomerId" IS NULL`.then(
            (r) => r.length,
          ))
        )
          throw new AppError("FORBIDDEN", "請選擇本店已連結會員帳號");
        if (id) {
          if (
            !(await tx.beautyTechnician.findFirst({
              where: { storeId: a.storeId, id, revision },
            }))
          )
            throw new AppError("CONFLICT", "技師設定已更新");
          const future = await tx.beautyAppointment.findMany({
            where: {
              storeId: a.storeId,
              technicianId: id,
              status: "RESERVED",
              occupiedEndsAt: { gt: new Date() },
            },
          });
          const { availableTechnician } =
            await import("@/lib/beauty/allocation");
          if (
            future.some(
              (b) =>
                !d.active ||
                !d.serviceIds.includes(b.serviceId) ||
                (b.preference !== "ANY" && b.preference !== d.gender) ||
                !availableTechnician(
                  { ...d, id },
                  toLocalDateStr(b.startsAt),
                  +b.startsAt,
                  +b.occupiedEndsAt,
                ),
            )
          )
            throw new AppError("CONFLICT", "設定影響既有預約，請先處理班表");
          record=await tx.beautyTechnician.update({
            where: { id },
            data: { ...d, revision: { increment: 1 } },
          });
        } else
          record=await tx.beautyTechnician.create({
            data: { ...d, storeId: a.storeId },
          });
      }
      await audit(tx, a, "CATALOG", JSON.stringify({ kind, input }));
      return { saved: true, record };
}
