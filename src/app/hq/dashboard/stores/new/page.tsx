import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import NewStoreForm from "./new-store-form";

export default async function NewStorePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await checkPermission(user.role, user.staffId, "staff.manage"))) notFound();
  return <NewStoreForm />;
}
