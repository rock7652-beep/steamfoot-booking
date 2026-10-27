import {prisma} from "@/lib/db";
import {MonthlyStoreProvider} from "@/components/operations/monthly-store-context";
import { beautyManager } from "@/server/beauty/access";
import { settlement } from "@/server/beauty/commerce";
import { beautyPrisma } from "@/lib/beauty-db";
import type { Prisma } from "../../../generated/beauty-client";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { IncomeMonthFilter } from "@/components/income-month-filter";
import { BeautyNativeFeeReport } from "./native-fee-source";
import { PageHeader } from "@/components/desktop";
export async function BeautyMonthly({storeId,month,readOnly}:{storeId:string;month:string;readOnly:boolean}) {
  const actor = await beautyManager("teacher.settlement.read");
  if(actor.storeId!==storeId)return <p role="alert">店家已切換，請重新開啟。</p>;
  const user=await getCurrentUser();
  if(!user || !await checkPermission(user.role,user.staffId,"teacher.compensation.read"))return <p role="alert">目前沒有技師費用檢視權限。</p>;
  const [report,last,techs] = await Promise.all([
    settlement(beautyPrisma as unknown as Prisma.TransactionClient,storeId,month),
    beautyPrisma.beautySettlement.findFirst({where:{storeId,month},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{fingerprint:true}}),
    beautyPrisma.beautyTechnician.findMany({where:{storeId},select:{id:true,name:true}}),
  ]);
  const lines=report.lines.map(line=>({kind:"FEE" as const,id:line.id,staffId:line.technicianId,name:techs.find(t=>t.id===line.technicianId)?.name??"技師",label:`${line.personName} · ${line.serviceName}`,date:line.date,amount:line.fee,paid:line.paid,issue:null,payments:[]}));
  const store=await prisma.store.findUnique({where:{id:storeId},select:{name:true}});
  return <MonthlyStoreProvider storeId={storeId} name={store?.name??storeId}><section className="min-w-0 space-y-3"><PageHeader compact title="月結管理" subtitle={store?.name} actions={<IncomeMonthFilter month={month}/>}/>
    <BeautyNativeFeeReport storeId={storeId} month={month} lines={lines} fingerprint={report.fingerprint} confirmed={last?.fingerprint===report.fingerprint} previous={!!last} canConfirm={!readOnly&&await checkPermission(user.role,user.staffId,"teacher.settlement.confirm")}/>
  </section></MonthlyStoreProvider>;
}
