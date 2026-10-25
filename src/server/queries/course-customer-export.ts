import { MUSIC_OPENING_CARD_SELECT } from "@/lib/music-opening-runtime";
import "server-only";
import { musicCustomerWhere } from "@/server/services/music-data-scope";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { requireCourseStore } from "@/lib/industry-module-server";
import {customerExportCsv} from "@/lib/customer-export-csv";

export async function getCourseCustomerCsv(storeId: string, access: {cards: boolean; bookings: boolean}, dataScope?:string) {
  await requireCourseStore(storeId);
  const customers = await prisma.customer.findMany({
    where: {storeId, mergedIntoCustomerId: null, ...musicCustomerWhere(storeId,dataScope)},
    select: {id:true,name:true,phone:true,email:true,lineName:true,customerStage:true,address:true,notes:true,emergencyContactName:true,emergencyContactPhone:true,createdAt:true,assignedStaff:{select:{storeId:true,displayName:true}}},
    orderBy: [{name:"asc"},{id:"asc"}],
  });
  const cards = access.cards ? await coursePrisma.coursePointCard.findMany({
    where:{storeId,closedAt:null},
    select:{...MUSIC_OPENING_CARD_SELECT,nameSnapshot:true,remaining:true,expiresAt:true,members:{select:{customerId:true}},bookings:{where:{storeId,status:"RESERVED"},select:{pointCost:true}}},
    orderBy:{expiresAt:{sort:"asc",nulls:"last"}},
  }) : [];
  const classes = access.bookings ? await coursePrisma.$queryRaw<Array<{customerId:string;participations:bigint;completed:bigint;lastVisitAt:Date|null}>>`
    SELECT b."customerId",COUNT(*) AS participations,
      COUNT(*) FILTER (WHERE b.status='ATTENDED') AS completed,
      MAX(s."startsAt") FILTER (WHERE b.status='ATTENDED') AS "lastVisitAt"
    FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    WHERE b."storeId"=${storeId} AND b.status<>'CANCELLED'
    GROUP BY b."customerId"` : [];
  return customerExportCsv(storeId,access,customers,cards,classes);
}
