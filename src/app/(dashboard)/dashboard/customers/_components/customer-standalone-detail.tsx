"use client";
import { useRouter } from "@/components/use-stable-router";
import { usePathname } from "next/navigation";
import { CustomerInlineDetail, type CustomerPanelContextData } from "./customer-inline-detail";
export function CustomerStandaloneDetail({customerId,initialData}:{customerId:string;initialData:CustomerPanelContextData}) {
  const router=useRouter(),pathname=usePathname();
  const back=()=>router.push(`${pathname.startsWith("/hq/") ? "/hq" : ""}/dashboard/customers`);
  return <div className="mx-auto w-full max-w-5xl rounded-lg border border-earth-200 bg-white">
    <CustomerInlineDetail customerId={customerId} initialData={initialData} readOnly={initialData.readOnly} onBack={back} backLabel="← 返回顧客清單" onUpdated={()=>router.refresh()} />
  </div>;
}
