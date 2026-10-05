import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PageShell, PageHeader } from "@/components/desktop";
import { inventoryContext, inventoryData } from "@/server/services/inventory";
import { InventoryWorkspace } from "./workspace";
import { AppError } from "@/lib/errors";
export default async function InventoryPage() {
    const user = await getCurrentUser();
    if (!user)
        redirect("/login");
    if (!await checkPermission(user.role, user.staffId, "inventory.read"))
        return <PageShell><PageHeader title="進銷存"/><p>沒有查看進銷存的權限</p></PageShell>;
    let data, message;
    try {
        data = await inventoryData(await inventoryContext());
    } catch (error) {
        if (error instanceof AppError && ["VALIDATION", "FORBIDDEN"].includes(error.code))
            message = error.message;
        else throw error;
    }
    if (!data) return <PageShell><PageHeader title="進銷存"/><p role="status">{message}</p></PageShell>;
    return <PageShell><InventoryWorkspace key={data.store.id + ":" + user.id + ":" + data.canCost} initial={data}/></PageShell>;
}
