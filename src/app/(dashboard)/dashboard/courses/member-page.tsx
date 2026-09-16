import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireCourseStore } from "@/lib/industry-module-server";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { getCourseCards } from "@/server/queries/course-members";
import { PageShell, PageHeader } from "@/components/desktop";
import { CoursePurchaseReview } from "./purchase-review";
import { CourseMemberWorkspace } from "./member-workspace";
export async function CourseMemberPage({
  view,
}: {
  view: "customers" | "plans";
}) {
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(
      user.role,
      user.staffId,
      view === "customers" ? "customer.read" : "wallet.read",
    ))
  )
    notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireCourseStore(storeId);
  const canReadCards = await checkPermission(
    user.role,
    user.staffId,
    "wallet.read",
  );
  const canReadPeople = await checkPermission(
    user.role,
    user.staffId,
    "customer.read",
  );
  const [people, plans, cards, canEdit, canAssign, canCreate, canManageStaff] =
    await Promise.all([
      canReadPeople
        ? prisma.customer.findMany({
            where: { storeId, mergedIntoCustomerId: null },
            select: { id: true, name: true, phone: true, email: true, gender: true, birthday: true, height: true, lineName: true, serviceNote: true },
            orderBy: { name: "asc" },
          })
        : [],
      canReadCards
        ? coursePrisma.coursePointPlan.findMany({
            where: { storeId },
            orderBy: { name: "asc" },
          })
        : [],
      canReadCards ? getCourseCards(storeId) : [],
      checkPermission(
        user.role,
        user.staffId,
        view === "customers" ? "customer.update" : "plans.edit",
      ),
      checkPermission(user.role, user.staffId, "wallet.create"),
      checkPermission(
        user.role,
        user.staffId,
        view === "customers" ? "customer.create" : "plans.edit",
      ),
      user.role === "OWNER"
        ? checkPermission(user.role, user.staffId, "staff.manage")
        : false,
    ]);
  const templates = await coursePrisma.courseTemplate.findMany({where:{storeId},select:{id:true,name:true}});
  const orders = view === "plans" && canReadCards ? await coursePrisma.coursePurchase.findMany({where:{storeId,status:"PENDING"},orderBy:{createdAt:"asc"}}) : [];
  const buyers = orders.length ? await prisma.customer.findMany({where:{storeId,id:{in:orders.map(o=>o.customerId)}},select:{id:true,name:true}}) : [];
  return (
    <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6">
      <PageHeader title={view === "customers" ? "顧客管理" : "方案管理"} />
      {view === "plans" && <CoursePurchaseReview canConfirm={canAssign} orders={orders.map(o=>({id:o.id,name:o.name,price:o.price,transferLastFive:o.transferLastFive,customerName:buyers.find(c=>c.id===o.customerId)?.name??"顧客"}))}/>}
      <CourseMemberWorkspace
        templates={templates}
        view={view}
        canReadBookings={await checkPermission(user.role, user.staffId, "booking.read")}
        people={people.map((p) => ({ ...p, birthday: p.birthday?.toISOString().slice(0, 10) ?? "" }))}
        plans={plans}
        cards={cards}
        canEdit={canEdit}
        canCreate={canCreate}
        canManageStaff={canManageStaff}
        canAssign={canAssign && canReadCards && canReadPeople}
      />
    </PageShell>
  );
}
