import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
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
            select: { id: true, name: true, phone: true, email: true, gender: true, birthday: true, height: true, lineName: true, serviceNote: true, address: true, notes: true, lineUserId: true, lineLinkStatus: true, customerStage: true, createdAt: true, totalPoints: true, mergedIntoCustomerId: true, user: {select:{status:true}}, assignedStaff: {select:{id:true,storeId:true,displayName:true,colorCode:true}}, sponsor:{select:{id:true,storeId:true,name:true}}, _count:{select:{sponsoredCustomers:{where:{storeId,mergedIntoCustomerId:null}}}} },
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
  const lastClasses = view === "customers" ? await coursePrisma.$queryRaw<{customerId:string;lastVisitAt:Date}[]>`
    SELECT b."customerId", MAX(s."startsAt") AS "lastVisitAt"
    FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    WHERE b."storeId"=${storeId} AND b.status='ATTENDED'
    GROUP BY b."customerId"` : [];
  const lastClassByCustomer = new Map(lastClasses.map(row=>[row.customerId,row.lastVisitAt]));
  const customerRows = people.map(p=>({
    id:p.id,name:p.name,phone:p.phone,lineName:p.lineName,lineUserId:p.lineUserId,
    lineLinkStatus:p.lineLinkStatus,customerStage:p.customerStage,createdAt:p.createdAt,
    totalPoints:p.totalPoints,sponsoredCount:p._count.sponsoredCustomers,
    sponsor:p.sponsor?.storeId===storeId ? {id:p.sponsor.id,name:p.sponsor.name} : null,
    assignedStaff:p.assignedStaff?.storeId===storeId ? {id:p.assignedStaff.id,displayName:p.assignedStaff.displayName,colorCode:p.assignedStaff.colorCode} : null,
    mergedIntoCustomerId:p.mergedIntoCustomerId,userStatus:p.user?.status??null,
    serviceNote:p.serviceNote,lastVisitAt:lastClassByCustomer.get(p.id)??null,
    validPackageSessions:0,
  }));
  const templates = await coursePrisma.courseTemplate.findMany({where:{storeId},select:{id:true,name:true}});
  const orders = view === "plans" && canReadCards ? await coursePrisma.coursePurchase.findMany({where:{storeId,status:"PENDING"},orderBy:{createdAt:"asc"}}) : [];
  const buyers = orders.length ? await prisma.customer.findMany({where:{storeId,id:{in:orders.map(o=>o.customerId)}},select:{id:true,name:true}}) : [];
  return (
    <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6">
      <PageHeader title={view === "customers" ? "顧客管理" : "方案管理"} />
      {view === "plans" && <CoursePurchaseReview canConfirm={canAssign} orders={orders.map(o=>({id:o.id,name:o.name,price:o.price,transferLastFive:o.transferLastFive,customerName:buyers.find(c=>c.id===o.customerId)?.name??"顧客"}))}/>}
      <CourseMemberWorkspace
        customerRows={customerRows}
        canReadCards={canReadCards}
        healthEnabled={await hasStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY)}
        templates={templates}
        view={view}
        canReadBookings={await checkPermission(user.role, user.staffId, "booking.read")}
        people={people.map((p) => ({ id:p.id,name:p.name,phone:p.phone,email:p.email,gender:p.gender,height:p.height,lineName:p.lineName,serviceNote:p.serviceNote,address:p.address,notes:p.notes,birthday: p.birthday?.toISOString().slice(0, 10) ?? "" }))}
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
