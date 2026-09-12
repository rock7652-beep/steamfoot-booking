import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { spaResourceStore } from "@/server/actions/spa-resources";
import { spaPrisma } from "@/lib/spa-db";
import { LocationWorkspace } from "./workspace";

export default async function SpaResourcesPage() {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role,user.staffId,"business_hours.manage")) notFound();
  const storeId = await spaResourceStore("business_hours.manage");
  const [locations,treatments] = await Promise.all([
    spaPrisma.spaServiceLocation.findMany({where:{storeId},include:{treatments:true},orderBy:{sortOrder:"asc"}}),
    spaPrisma.spaTreatment.findMany({where:{storeId},select:{id:true,name:true,variantLabel:true},orderBy:{sortOrder:"asc"}}),
  ]);
  return <LocationWorkspace locations={locations.map(l=>({id:l.id,name:l.name,isActive:l.isActive,treatmentIds:l.treatments.map(t=>t.treatmentId)}))} treatments={treatments.map(t=>({id:t.id,name:t.variantLabel?`${t.name} · ${t.variantLabel}`:t.name}))}/>;
}
