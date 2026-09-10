import { prisma } from "@/lib/db";
import { SpaCustomersWorkspace } from "./spa-customers-workspace";
export async function SpaCustomers({storeId,search,canSell,canRefund}:{storeId:string;search:string;canSell:boolean;canRefund:boolean}){
 const customers=await prisma.customer.findMany({where:{storeId,...(search?{OR:[{name:{contains:search,mode:"insensitive" as const}},{phone:{contains:search}}]}:{})},select:{id:true,name:true,phone:true},orderBy:{name:"asc"},take:100});
 return <SpaCustomersWorkspace customers={customers} search={search} canSell={canSell} canRefund={canRefund}/>;
}
