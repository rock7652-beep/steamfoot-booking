import "server-only";
import {musicPeriodAt,musicSnapshotBonus} from "@/lib/music-course-products";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import type { Prisma } from "../../../generated/course-client";

export async function getCourseCards(storeId: string, customerId?: string, page?: { where: Prisma.CoursePointCardWhereInput; skip: number; take: number; entries?: boolean }) {
  const cards = await coursePrisma.coursePointCard.findMany({
    where: {
      ...page?.where,
      storeId,
      ...(customerId ? { members: { some: { customerId } } } : {}),
    },
    include: {
      plan: { select: { allowShared: true } },
      members: true,
      bookings: { where: { status: "RESERVED" }, select: { pointCost: true } },
      entries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: page && !page.entries ? 0 : 100 },
    },
    ...(page ? { skip: page.skip, take: page.take } : {}),
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
  });
  const people = await prisma.customer.findMany({
    where: {
      storeId,
      id: {
        in: [
          ...new Set(cards.flatMap((c) => c.members.map((m) => m.customerId))),
        ],
      },
    },
    select: { id: true, name: true, phone: true },
  });
  return cards.map((c) => {
    const held = c.bookings.reduce((sum, b) => sum + b.pointCost, 0);
    const expired = c.expiresAt.getTime() < Date.now();
    return {
      id: c.id,
      name: c.nameSnapshot,
      unit: c.unit,
      musicValidityDays:c.musicValidityDays,
      musicActivatedAt:c.musicActivatedAt?.toISOString()??null,
      templateIds: c.templateIds,
      termSessionIds:c.termSessionIds,
      allowShared: c.plan.allowShared,
      remaining: c.remaining,
      held,
      closed: !!c.closedAt,
      available: expired || c.closedAt ? 0 : Math.max(0, c.remaining - held),
      expired,
      expiresAt: c.expiresAt.toISOString(),
      members: c.members.map((m) => ({
        id: m.customerId,
        name: people.find((p) => p.id === m.customerId)?.name ?? "學員",
        phone: people.find((p) => p.id === m.customerId)?.phone ?? "",
      })),
      entries: c.entries.map((e) => ({
        id: e.id,
        kind: e.kind.startsWith("CORRECT:") ? e.kind : e.kind.split(":")[0],
        points: e.points,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }).sort((a, b) => Number(a.expired || a.closed) - Number(b.expired || b.closed) || a.expiresAt.localeCompare(b.expiresAt));
}

export async function getCourseRoster(storeId: string, sessionId: string) {
  const bookings = await coursePrisma.courseBooking.findMany({
    where: { storeId, sessionId },
    select: {
      id: true,
      customerId: true,
      operatorCustomerId: true,
      operatorName: true,
      customerName: true,
      status: true,
      absenceKind: true,
      cardId: true,
      pointCost: true,
      bookingKind: true,
      session: { select: { templateId: true, requestKey: true, requestIndex: true, template: { select: { classType: true, musicTermLessons: true } } } },
      trialPrice: true,
      trialPayments: {orderBy:{createdAt:"desc"}},
      notes: true,
      checkedInAt: true,
      card: { select: { musicTermSizes:true,musicBonusLessons:true,templateIds:true,unit: true, nameSnapshot: true, termSessionIds:true, expiresAt: true, remaining: true, createdAt: true, plan: { select: { points: true, musicTerms: true, templateIds: true } }, entries: { where: { kind: "GRANT" }, select: { points: true }, take: 1 }, members: { select: { customerId: true } }, bookings: { select: { id: true, makeupForBookingId: true, sessionId: true, customerId: true, pointCost: true, status: true, absenceKind: true, session: { select: { startsAt: true, templateId: true } } } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const groupSession = bookings[0]?.session;
  const groupTermLessons = groupSession?.template.classType === "GROUP" ? groupSession.template.musicTermLessons : null;
  const groupTermStart = groupSession && groupTermLessons ? Math.floor(groupSession.requestIndex / groupTermLessons) * groupTermLessons : null;
  const [termSessionCount, customers, leaveCounts, absenceHistory, confirmedPurchases] = await Promise.all([
    groupSession && groupTermStart !== null && groupTermLessons
    ? coursePrisma.courseSession.count({where:{storeId,requestKey:groupSession.requestKey,templateId:groupSession.templateId,cancelledAt:null,requestIndex:{gte:groupTermStart,lt:groupTermStart+groupTermLessons}}})
    : Promise.resolve(0),
    prisma.customer.findMany({
    where: { storeId, id: { in: bookings.map((b) => b.customerId) } },
    select: { id: true, phone: true, serviceNote: true, notes: true, assignedStaff: { select: { displayName: true, storeId: true } } },
  }),
  coursePrisma.courseBooking.groupBy({
    by: ["customerId"],
    where: {storeId, customerId:{in:bookings.map(b=>b.customerId)}, OR:[{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},{status:"NO_SHOW"}]},
    _count: {id:true},
  }),
  coursePrisma.courseBooking.findMany({
    where: {storeId,customerId:{in:bookings.map(b=>b.customerId)},OR:[{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},{status:"NO_SHOW"}]},
    select:{customerId:true,status:true,absenceKind:true,session:{select:{startsAt:true}}},
    orderBy:{session:{startsAt:"desc"}},
  }),
  coursePrisma.coursePurchase.findMany({
    where: { storeId, customerId: { in: bookings.map((item) => item.customerId) }, status: "CONFIRMED", voidedAt: null, cardId: { not: null } },
    select: { customerId: true, cardId: true, points: true, price: true, paymentMethod: true, confirmedAt: true },
  }),
  ]);
  const groupTermComplete = !!groupTermLessons && termSessionCount === groupTermLessons;
  const groupCohortProgress = groupTermComplete && groupSession && groupTermLessons ? {index:groupSession.requestIndex % groupTermLessons+1,count:groupTermLessons} : null;
  const renewalCards = await coursePrisma.coursePointCard.findMany({
    where: { storeId, id: { in: confirmedPurchases.map((purchase) => purchase.cardId).filter((value): value is string => !!value) }, closedAt: null },
    select: { id: true, createdAt: true, remaining: true, templateIds:true,plan: { select: { templateIds: true } }, bookings: { where: { customerId: { in: bookings.map((item) => item.customerId) }, OR: [{ status: { not: "CANCELLED" } }, { absenceKind: "GROUP_LEAVE_FORFEITED" }] }, select: { customerId: true, status: true, absenceKind: true, session: { select: { startsAt: true } } } } },
  });
  return bookings.map(({ card, checkedInAt, ...b }) => {
    const currentPurchase = confirmedPurchases.find((purchase) => purchase.customerId === b.customerId && purchase.cardId === b.cardId);
    const renewal = card && card.templateIds.length
      ? confirmedPurchases
        .filter((purchase) => purchase.customerId === b.customerId && purchase.cardId !== b.cardId)
        .map((purchase) => ({ purchase, next: renewalCards.find((candidate) => candidate.id === purchase.cardId) }))
        .filter(({ purchase, next }) =>
          !!next && next.createdAt > card.createdAt && next.remaining >= purchase.points &&
          next.templateIds.includes(b.session.templateId))
        .sort((left, right) => left.next!.createdAt.getTime() - right.next!.createdAt.getTime())[0] ?? null
      : null;
    const paymentSummary = (purchase: (typeof confirmedPurchases)[number]) => ({
      date: purchase.confirmedAt?.toISOString() ?? null,
      amount: purchase.price,
      method: purchase.paymentMethod,
    });
    const sameEnrollment = (item: { sessionId: string; session: { templateId: string } }) =>
      card?.termSessionIds.length ? card.termSessionIds.includes(item.sessionId) : item.session.templateId === b.session.templateId;
    const allLessons = (card?.bookings ?? [])
      .filter((item) => item.customerId === b.customerId && sameEnrollment(item) && (item.status !== "CANCELLED" || item.absenceKind === "GROUP_LEAVE_FORFEITED"))
      .sort((left, right) => left.session.startsAt.getTime() - right.session.startsAt.getTime());
    const lessonPosition = allLessons.findIndex((item) => item.id === b.id);
    const currentPosition = lessonPosition >= 0 ? lessonPosition : b.absenceKind === "STUDENT_LEAVE" ? allLessons.filter((item) => item.session.startsAt < (card?.bookings.find((entry) => entry.id === b.id)?.session.startsAt ?? new Date(0))).length : -1;
    const purchasedLessons = card?.entries[0]?.points ?? card?.plan.points ?? 0;
    const privateMusicTermLessons = b.session.template.classType === "PRIVATE" && card?.unit === "SESSION"
      ? b.session.template.musicTermLessons : null;
    const legacyTermSize = card?.plan.musicTerms && purchasedLessons % card.plan.musicTerms === 0
      ? purchasedLessons / card.plan.musicTerms
      : privateMusicTermLessons && purchasedLessons % privateMusicTermLessons === 0
        ? privateMusicTermLessons
        : purchasedLessons;
    const snapshotPeriod=card?.musicTermSizes?.length ? musicPeriodAt(card.musicTermSizes,musicSnapshotBonus(card.musicTermSizes,card.musicBonusLessons,purchasedLessons),currentPosition) : null;
    const hasSnapshot=!!card?.musicTermSizes?.length;
    const termSize=snapshotPeriod?.count??legacyTermSize;
    const groupMusic = b.session.template.classType === "GROUP" && card?.unit === "SESSION";
    const validGroupEnrollment = groupMusic && (hasSnapshot || (!!card?.plan.musicTerms && card.templateIds.includes(b.session.templateId) && purchasedLessons % card.plan.musicTerms === 0));
    const missingGroupEnrollment = groupMusic && !validGroupEnrollment;
    const termNumber = snapshotPeriod?.number ?? (!missingGroupEnrollment && termSize > 0 && currentPosition >= 0 ? Math.floor(currentPosition / termSize) + 1 : null);
    const periodStart=snapshotPeriod?.start??(termNumber ? (termNumber-1)*termSize : 0);
    const periodLessons = termNumber ? allLessons.slice(periodStart,periodStart+termSize) : [];
    const previousTermLesson = termNumber && termNumber > 1 ? allLessons[periodStart - 1] : null;
    const privateLeaves = (card?.bookings ?? []).filter((item) => item.customerId === b.customerId && sameEnrollment(item) && item.absenceKind === "STUDENT_LEAVE" && termNumber !== null && (((hasSnapshot ? card!.musicTermSizes.length+(musicSnapshotBonus(card!.musicTermSizes,card!.musicBonusLessons,purchasedLessons)?1:0) : card?.plan.musicTerms??1) === 1) || (periodLessons.length > 0 && (!previousTermLesson || item.session.startsAt > previousTermLesson.session.startsAt) && item.session.startsAt <= periodLessons[periodLessons.length - 1].session.startsAt)));
    const termAbsences = periodLessons.filter((item) => item.status === "NO_SHOW" || item.absenceKind === "GROUP_LEAVE_FORFEITED");
    return ({
    ...b,
    checkedInAt: checkedInAt?.toISOString() ?? null,
    groupCohortProgress,
    trialPayments: b.trialPayments.map(p=>({...p,createdAt:p.createdAt.toISOString(),voidedAt:p.voidedAt?.toISOString()??null})),
    unit: card?.unit ?? "POINT",
    // Private music lessons use the learner’s own card and booked sequence.
    // Group progress is shown only for a dedicated group lesson purchase; each learner owns their purchased total.
    termIndex: !missingGroupEnrollment && currentPosition >= 0 && termSize > 0 && (hasSnapshot || validGroupEnrollment || card?.termSessionIds.length || (privateMusicTermLessons && purchasedLessons % privateMusicTermLessons === 0)) ? snapshotPeriod?.index ?? currentPosition % termSize + 1 : null,
    termCount: !missingGroupEnrollment && (hasSnapshot || validGroupEnrollment || card?.termSessionIds.length || (privateMusicTermLessons && purchasedLessons % privateMusicTermLessons === 0)) ? termSize : 0,
    termNumber,
    bonusPeriod:snapshotPeriod?.bonus??false,
    bonusLessons:card?.musicBonusLessons??0,
    nextPaidLessons: renewal?.purchase.points ?? null,
    termPayment: currentPurchase ? paymentSummary(currentPurchase) : null,
    nextTerm: renewal ? {
      payment: paymentSummary(renewal.purchase),
      lessons: renewal.next!.bookings.filter((item) => item.customerId === b.customerId && (item.status !== "CANCELLED" || item.absenceKind === "GROUP_LEAVE_FORFEITED"))
        .sort((left, right) => left.session.startsAt.getTime() - right.session.startsAt.getTime())
        .map((item) => ({ date: item.session.startsAt.toISOString(), status: item.status === "ATTENDED" ? "已出席" : item.status === "NO_SHOW" ? "曠課" : item.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假" : "待上課" })),
    } : null,
    termLessons: periodLessons.map((item) => ({date: item.session.startsAt.toISOString(), status: item.status === "ATTENDED" ? "已出席" : item.status === "NO_SHOW" ? "曠課" : item.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假" : "待上課"})),
    termLeaveCount: periodLessons.filter((item) => item.absenceKind === "GROUP_LEAVE_FORFEITED").length + privateLeaves.length,
    termNoShowCount: termAbsences.filter((item) => item.status === "NO_SHOW").length,
    // Private-class leave does not consume a lesson; retain its date in the period's leave history.
    termPrivateLeaves: privateLeaves.map((item) => item.session.startsAt.toISOString()),
    termMakeups: (card?.bookings ?? []).filter(item=>item.customerId===b.customerId && item.makeupForBookingId && (item.status!=="CANCELLED" || item.absenceKind==="STUDENT_LEAVE")).flatMap(item=>{
      const source=card?.bookings.find(source=>source.id===item.makeupForBookingId);
      return source ? [{originalDate:source.session.startsAt.toISOString(),date:item.session.startsAt.toISOString(),status:item.status==="ATTENDED"?"已補課":item.status==="NO_SHOW"?"補課曠課":item.absenceKind==="STUDENT_LEAVE"?"補課請假":"已安排補課"}] : [];
    }),
    planName: card?.nameSnapshot ?? (b.bookingKind === "TEACHER_MAKEUP" ? "老師曠課免費補課" : "體驗（不使用方案）"),
    sharedCard: (card?.members.length ?? 0) > 1,
    bookingSource: b.operatorCustomerId
      ? b.operatorCustomerId === b.customerId
        ? "本人預約"
        : `${b.operatorName ?? "共卡成員"}代約`
      : "店長建立",
    available: !card || card.expiresAt.getTime() < Date.now() ? 0 : Math.max(0, card.remaining - card.bookings.filter((item) => item.status === "RESERVED").reduce((n, item) => n + item.pointCost, 0)),
    cardId: b.cardId,
    cardRemaining: card?.remaining ?? null,
    assignedCoachName: (customers.find(c => c.id === b.customerId)?.assignedStaff?.storeId === storeId ? customers.find(c => c.id === b.customerId)?.assignedStaff?.displayName : "") ?? "",
    expiresAt: card?.expiresAt.toISOString() ?? null,
    customerPhone: customers.find((c) => c.id === b.customerId)?.phone ?? "",
    absenceCount: leaveCounts.find((item)=>item.customerId===b.customerId)?._count.id??0,
    absenceHistory: absenceHistory.filter(item=>item.customerId===b.customerId).map(item=>({date:item.session.startsAt.toISOString(),status:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(item.absenceKind ?? "") ? "請假" : "曠課"})),
    serviceNote: [customers.find((c) => c.id === b.customerId)?.serviceNote, customers.find((c) => c.id === b.customerId)?.notes].filter(Boolean).join("\n"),
  });
  });
}
