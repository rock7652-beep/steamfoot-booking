import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { checkClosedCashDrawers } from "@/server/reconciliation/finance-checks";
import { CashDrawerDifferencesView } from "./cash-drawer-differences-view";
/** Called only inside the authorized drawer workspace; reads never change a close. */
async function readDifferences({storeId,today}:{storeId:string;today:string}) {
  try {
    const first=parseTaiwanDateToDbDate(today.slice(0,7)+"-01"),last=parseTaiwanDateToDbDate(today);
    const [result,sessions]=await Promise.all([
      Promise.resolve().then(()=>checkClosedCashDrawers(storeId,first,last)),
      Promise.resolve().then(()=>prisma.cashDrawerSession.findMany({where:{storeId,status:"CLOSED",businessDate:{gte:first,lte:last},closingDifference:{not:0}},select:{id:true,businessDate:true,expectedClosingCash:true,closingActualCash:true,closingDifference:true,closingNote:true},orderBy:{businessDate:"desc"}})),
    ]);
    const issues=result.debugPayload.issues as {sessionId:string;businessDate:string;saved:number;current:number;difference:number}[];
    const rows=sessions.map(row=>({id:row.id,date:row.businessDate.toISOString().slice(0,10),expected:Number(row.expectedClosingCash),actual:Number(row.closingActualCash),difference:Number(row.closingDifference),note:row.closingNote??"—"}));

    return {rows,issues};
  } catch {
    return null;
  }
}

export async function CashDrawerReconciliation({storeId,today}:{storeId:string;today:string}) {
  const data=await readDifferences({storeId,today});
  if(!data)return <p role="alert" className="rounded-lg border p-3 text-sm">現金差異核對暫時無法讀取，請重新開啟；目前不能判定帳目一致。</p>;
  return <CashDrawerDifferencesView {...data}/>;
}
