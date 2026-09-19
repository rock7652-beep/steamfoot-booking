import "server-only";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { toLocalDateStr } from "@/lib/date-utils";

export async function getCourseCustomerCsv(storeId: string, access: {cards: boolean; bookings: boolean}) {
  await requireCourseStore(storeId);
  const customers = await prisma.customer.findMany({
    where: {storeId, mergedIntoCustomerId: null},
    select: {id:true,name:true,phone:true,email:true,lineName:true,customerStage:true,address:true,notes:true,emergencyContactName:true,emergencyContactPhone:true,createdAt:true,assignedStaff:{select:{storeId:true,displayName:true}}},
    orderBy: [{name:"asc"},{id:"asc"}],
  });
  const cards = access.cards ? await coursePrisma.coursePointCard.findMany({
    where:{storeId,closedAt:null},
    select:{nameSnapshot:true,unit:true,remaining:true,expiresAt:true,members:{select:{customerId:true}},bookings:{where:{storeId,status:"RESERVED"},select:{pointCost:true}}},
    orderBy:{expiresAt:"asc"},
  }) : [];
  const classes = access.bookings ? await coursePrisma.$queryRaw<Array<{customerId:string;participations:bigint;completed:bigint;lastVisitAt:Date|null}>>`
    SELECT b."customerId",COUNT(*) AS participations,
      COUNT(*) FILTER (WHERE b.status='ATTENDED') AS completed,
      MAX(s."startsAt") FILTER (WHERE b.status='ATTENDED') AS "lastVisitAt"
    FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    WHERE b."storeId"=${storeId} AND b.status<>'CANCELLED'
    GROUP BY b."customerId"` : [];
  const now = new Date();
  const stages:Record<string,string>={LEAD:"名單",TRIAL:"體驗",ACTIVE:"已購課",INACTIVE:"已停用"};
  const rows: Array<Array<string|number>> = [["姓名","電話","Email","LINE名稱","狀態","直屬店長","地址","緊急聯絡人","緊急聯絡電話","一般備註","方案（逐卡：剩餘／占用／可用／到期）","可用點數（共卡不可跨人加總）","可用堂數（共卡不可跨人加總）","未取消預約人次","完成出席人次","最近上課","建立日期"]];
  for (const c of customers) {
    const memberCards = cards.filter(card=>card.members.some(m=>m.customerId===c.id));
    const balances = memberCards.map(card=>{
      const held=card.bookings.reduce((sum,b)=>sum+b.pointCost,0);
      return {...card,held,available:card.expiresAt<now?0:Math.max(0,card.remaining-held)};
    });
    const attendance=classes.find(row=>row.customerId===c.id);
    const unread="無檢視權限";
    rows.push([
      c.name,c.phone,c.email??"",c.lineName??"",stages[c.customerStage]??c.customerStage,
      c.assignedStaff?.storeId===storeId?c.assignedStaff.displayName:"未指派",c.address??"",c.emergencyContactName??"",c.emergencyContactPhone??"",c.notes??"",
      access.cards?balances.map(card=>`${card.nameSnapshot}${card.members.length>1?"（共卡）":""}：剩餘${card.remaining}／占用${card.held}／可用${card.available}${card.unit==="SESSION"?"堂":"點"}／${toLocalDateStr(card.expiresAt)}${card.expiresAt<now?"（已到期）":""}`).join("；"):unread,
      access.cards?balances.filter(card=>card.unit==="POINT").reduce((sum,card)=>sum+card.available,0):unread,
      access.cards?balances.filter(card=>card.unit==="SESSION").reduce((sum,card)=>sum+card.available,0):unread,
      access.bookings?String(attendance?.participations??0):unread,access.bookings?String(attendance?.completed??0):unread,
      access.bookings?(attendance?.lastVisitAt?toLocalDateStr(attendance.lastVisitAt):""):unread,toLocalDateStr(c.createdAt),
    ]);
  }
  return "\uFEFF"+rows.map(row=>row.map(value=>{
    const text=String(value);
    const safe=typeof value==="string"&&/^[=+@\-\t\r]/.test(text)?"'"+text:text;
    return `"${safe.replaceAll('"','""')}"`;
  }).join(",")).join("\r\n");
}
