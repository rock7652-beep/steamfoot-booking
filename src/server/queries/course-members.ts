import { isMusicOpeningMakeupBooking, MUSIC_OPENING_SELECT, readMusicOpeningCard, readMusicOpeningLesson, musicOpeningOperationIssue } from "@/lib/music-opening-runtime";
import "server-only";
import { getCourseSharedCardState } from "@/server/services/course-shared-card";
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
      musicOpeningState: { select: MUSIC_OPENING_SELECT },
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
          ...new Set(cards.flatMap((c) => c.members.map((m) => m.customerId).filter((id): id is string => !!id))),
        ],
      },
    },
    select: { id: true, name: true, phone: true },
  });
  return cards.map((c) => {
    const opening = readMusicOpeningCard(c, storeId, customerId);
    const openingIssue = musicOpeningOperationIssue(opening, c);
    const held = c.bookings.reduce((sum, b) => sum + b.pointCost, 0);
    const originalExpiry = opening.kind === "NATIVE" ? c.expiresAt : opening.kind === "OPENING" && opening.record.expiresAt ? new Date(opening.record.expiresAt) : null;
    const expired = originalExpiry !== null && originalExpiry.getTime() < Date.now();
    return {
      id: c.id,
      name: c.nameSnapshot,
      unit: c.unit,
      musicValidityDays:c.musicValidityDays,
      musicActivatedAt:opening.kind === "OPENING" ? opening.record.activatedAt : c.musicActivatedAt?.toISOString()??null,
      templateIds: c.templateIds,
      termSessionIds:c.termSessionIds,
      allowShared: c.plan.allowShared,
      remaining: c.remaining,
      held,
      closed: !!c.closedAt,
      available: expired || c.closedAt || openingIssue ? 0 : Math.max(0, c.remaining - held),
      expired,
      openingIssue,
      openingImported: opening.kind !== "NATIVE",
      expiresAt: originalExpiry?.toISOString() ?? null,
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
  }).sort((a, b) => Number(a.expired || a.closed) - Number(b.expired || b.closed) || (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
}

export async function getCourseRoster(storeId: string, sessionId: string) {
  const bookings = await coursePrisma.courseBooking.findMany({
    where: { storeId, sessionId },
    select: {
      id: true,
      customerId: true,
      companionIndex: true,
      reserverName: true,
      reserverCustomerId: true,
      operatorCustomerId: true,
      operatorName: true,
      createdAt: true,
      customerName: true,
      status: true,
      absenceKind: true,
      cardId: true,
      musicOpeningMakeupEntitlementId: true,
      musicOpeningTermKey: true,
      musicOpeningLessonOrdinal: true,
      musicOpeningSourceLessonKey: true,
      pointCost: true,
      bookingKind: true,
      session: { select: { startsAt: true, templateId: true, requestKey: true, requestIndex: true, template: { select: { classType: true, musicTermLessons: true } } } },
      trialPrice: true,
      trialPayments: {orderBy:{createdAt:"desc"}},
      notes: true,
      checkedInAt: true,
      card: { select: { id:true,storeId:true,musicActivatedAt:true,musicOpeningStateRequired:true,musicOpeningState:{select:MUSIC_OPENING_SELECT},musicTermSizes:true,musicBonusLessons:true,templateIds:true,unit: true, nameSnapshot: true, termSessionIds:true, expiresAt: true, remaining: true, createdAt: true, plan: { select: { allowShared: true, points: true, musicTerms: true, templateIds: true } }, entries: { where: { kind: "GRANT" }, select: { points: true }, take: 1 }, members: { select: { customerId: true } }, bookings: { select: { bookingKind:true,musicOpeningMakeupEntitlementId:true,companionIndex:true,musicOpeningTermKey:true,musicOpeningLessonOrdinal:true,musicOpeningSourceLessonKey:true,id: true, makeupForBookingId: true, sessionId: true, customerId: true, pointCost: true, status: true, absenceKind: true, session: { select: { startsAt: true, templateId: true } } } } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const canCreateShared = bookings.some(b => !isMusicOpeningMakeupBooking(b) && !b.companionIndex && !!b.customerId && !!b.card?.plan.allowShared && !b.card.termSessionIds.length)
    && await getCourseSharedCardState(storeId) === "ENABLED";
  const groupSession = bookings[0]?.session;
  const groupTermLessons = groupSession?.template.classType === "GROUP" ? groupSession.template.musicTermLessons : null;
  const groupTermStart = groupSession && groupTermLessons ? Math.floor(groupSession.requestIndex / groupTermLessons) * groupTermLessons : null;
  const [termSessionCount, customers, leaveCounts, absenceHistory, confirmedPurchases] = await Promise.all([
    groupSession && groupTermStart !== null && groupTermLessons
    ? coursePrisma.courseSession.count({where:{storeId,requestKey:groupSession.requestKey,templateId:groupSession.templateId,cancelledAt:null,requestIndex:{gte:groupTermStart,lt:groupTermStart+groupTermLessons}}})
    : Promise.resolve(0),
    prisma.customer.findMany({
    where: { storeId, id: { in: bookings.map((b) => b.customerId).filter((id): id is string => !!id) } },
    select: { id: true, phone: true, serviceNote: true, notes: true, assignedStaff: { select: { id: true, displayName: true, storeId: true } } },
  }),
  coursePrisma.courseBooking.groupBy({
    by: ["customerId"],
    where: {storeId, bookingKind:{not:"OPENING_MAKEUP"},musicOpeningMakeupEntitlementId:null, customerId:{in:bookings.map(b=>b.customerId).filter((id): id is string => !!id)}, OR:[{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},{status:"NO_SHOW"}]},
    _count: {id:true},
  }),
  coursePrisma.courseBooking.findMany({
    where: {storeId,bookingKind:{not:"OPENING_MAKEUP"},musicOpeningMakeupEntitlementId:null,customerId:{in:bookings.map(b=>b.customerId).filter((id): id is string => !!id)},OR:[{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},{status:"NO_SHOW"}]},
    select:{customerId:true,status:true,absenceKind:true,session:{select:{startsAt:true}}},
    orderBy:{session:{startsAt:"desc"}},
  }),
  coursePrisma.coursePurchase.findMany({
    where: { storeId, customerId: { in: bookings.map((item) => item.customerId).filter((id): id is string => !!id) }, status: "CONFIRMED", voidedAt: null, cardId: { not: null } },
    select: { customerId: true, cardId: true, points: true, price: true, paymentMethod: true, confirmedAt: true },
  }),
  ]);
  const groupTermComplete = !!groupTermLessons && termSessionCount === groupTermLessons;
  const groupCohortProgress = groupTermComplete && groupSession && groupTermLessons ? {index:groupSession.requestIndex % groupTermLessons+1,count:groupTermLessons} : null;
  const renewalCards = await coursePrisma.coursePointCard.findMany({
    where: { storeId, id: { in: confirmedPurchases.map((purchase) => purchase.cardId).filter((value): value is string => !!value) }, closedAt: null },
    select: { id: true, createdAt: true, remaining: true, templateIds:true,plan: { select: { templateIds: true } }, bookings: { where: { customerId: { in: bookings.map((item) => item.customerId).filter((id): id is string => !!id) }, OR: [{ status: { not: "CANCELLED" } }, { absenceKind: "GROUP_LEAVE_FORFEITED" }] }, select: { customerId: true, status: true, absenceKind: true, session: { select: { startsAt: true } } } } },
  });
  return bookings.map(({ card, checkedInAt, musicOpeningMakeupEntitlementId, musicOpeningTermKey, musicOpeningLessonOrdinal, musicOpeningSourceLessonKey, ...b }) => {
    const openingMakeup = isMusicOpeningMakeupBooking({ ...b, musicOpeningMakeupEntitlementId });
    const opening = readMusicOpeningCard(card, storeId, b.customerId);
    const openingLesson = readMusicOpeningLesson(opening, { ...b, musicOpeningMakeupEntitlementId, musicOpeningTermKey, musicOpeningLessonOrdinal, musicOpeningSourceLessonKey });
    let openingIssue = openingLesson.kind === "BLOCKED" ? openingLesson.issue : null;
    const openingOperationWarning = musicOpeningOperationIssue(opening, card ?? {});
    const sourceLessons = opening.kind === "OPENING" ? (card?.bookings ?? []).map(item => ({ item, lesson: readMusicOpeningLesson(opening, item) })) : [];
    if (sourceLessons.some(item => item.lesson.kind === "BLOCKED")) openingIssue = "此期有來源堂次尚未核對，暫不推算期別";
    const sourceIds = sourceLessons.map(({item}) => item.musicOpeningSourceLessonKey);
    const ordinalIds = sourceLessons.map(({item}) => JSON.stringify([item.musicOpeningTermKey,item.musicOpeningLessonOrdinal]));
    if (new Set(sourceIds).size !== sourceIds.length || new Set(ordinalIds).size !== ordinalIds.length) openingIssue = "来源堂次或原堂序重複，請先核對";
    const currentSourceLessons = sourceLessons.filter(({item}) => item.musicOpeningTermKey === musicOpeningTermKey)
      .sort((a,b) => (a.item.musicOpeningLessonOrdinal ?? 0) - (b.item.musicOpeningLessonOrdinal ?? 0));

    const currentPurchase = !openingMakeup && opening.kind === "NATIVE" ? confirmedPurchases.find((purchase) => purchase.customerId === b.customerId && purchase.cardId === b.cardId) : undefined;
    const renewal = !openingMakeup && opening.kind === "NATIVE" && card && card.templateIds.length
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
      .filter((item) => !isMusicOpeningMakeupBooking(item) && item.customerId === b.customerId && sameEnrollment(item) && (item.status !== "CANCELLED" || item.absenceKind === "GROUP_LEAVE_FORFEITED"))
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
    const privateLeaves = (card?.bookings ?? []).filter((item) => !isMusicOpeningMakeupBooking(item) && item.customerId === b.customerId && sameEnrollment(item) && item.absenceKind === "STUDENT_LEAVE" && termNumber !== null && (((hasSnapshot ? card!.musicTermSizes.length+(musicSnapshotBonus(card!.musicTermSizes,card!.musicBonusLessons,purchasedLessons)?1:0) : card?.plan.musicTerms??1) === 1) || (periodLessons.length > 0 && (!previousTermLesson || item.session.startsAt > previousTermLesson.session.startsAt) && item.session.startsAt <= periodLessons[periodLessons.length - 1].session.startsAt)));
    const termAbsences = periodLessons.filter((item) => item.status === "NO_SHOW" || item.absenceKind === "GROUP_LEAVE_FORFEITED");
    return ({
    ...b,
    createdAt: b.createdAt.toISOString(),
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
    termLessons: periodLessons.map((item,index) => ({ordinal:index+1,date: item.session.startsAt.toISOString(), status: item.status === "ATTENDED" ? "已出席" : item.status === "NO_SHOW" ? "曠課" : item.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假" : "待上課"})),
    termLeaveCount: periodLessons.filter((item) => item.absenceKind === "GROUP_LEAVE_FORFEITED").length + privateLeaves.length,
    termNoShowCount: termAbsences.filter((item) => item.status === "NO_SHOW").length,
    // Private-class leave does not consume a lesson; retain its date in the period's leave history.
    termPrivateLeaves: privateLeaves.map((item) => item.session.startsAt.toISOString()),
    termMakeups: (card?.bookings ?? []).filter(item=>!isMusicOpeningMakeupBooking(item) && item.customerId===b.customerId && item.makeupForBookingId && (item.status!=="CANCELLED" || item.absenceKind==="STUDENT_LEAVE")).flatMap(item=>{
      const source=card?.bookings.find(source=>!isMusicOpeningMakeupBooking(source) && source.id===item.makeupForBookingId);
      return source ? [{originalDate:source.session.startsAt.toISOString(),date:item.session.startsAt.toISOString(),status:item.status==="ATTENDED"?"已補課":item.status==="NO_SHOW"?"補課曠課":item.absenceKind==="STUDENT_LEAVE"?"補課請假":"已安排補課"}] : [];
    }),
    planName: openingMakeup ? "期初補課（獨立權益）" : card?.nameSnapshot ?? (b.bookingKind === "TEACHER_MAKEUP" ? "老師曠課免費補課" : "體驗（不使用方案）"),
    sharedCard: (card?.members.length ?? 0) > 1,
    canAddCompanion: !openingMakeup && canCreateShared && !b.companionIndex && !!b.customerId && !!card?.plan.allowShared && !card.termSessionIds.length,
    bookingSource: b.companionIndex ? `同行 · 預約人 ${b.reserverName ?? b.operatorName}` : b.operatorCustomerId
      ? b.operatorCustomerId === b.customerId
        ? "本人預約"
        : `${b.operatorName ?? "共卡成員"}代約`
      : "店長建立",
    available: !card || card.expiresAt.getTime() < Date.now() ? 0 : Math.max(0, card.remaining - card.bookings.filter((item) => item.status === "RESERVED").reduce((n, item) => n + item.pointCost, 0)),
    cardId: b.cardId,
    cardRemaining: card?.remaining ?? null,
    assignedCoachId: customers.find(c => c.id === b.customerId)?.assignedStaff?.storeId === storeId ? customers.find(c => c.id === b.customerId)?.assignedStaff?.id ?? null : null,
    assignedCoachName: (customers.find(c => c.id === b.customerId)?.assignedStaff?.storeId === storeId ? customers.find(c => c.id === b.customerId)?.assignedStaff?.displayName : "") ?? "",
    expiresAt: card?.expiresAt.toISOString() ?? null,
    customerPhone: customers.find((c) => c.id === b.customerId)?.phone ?? "",
    absenceCount: leaveCounts.find((item)=>item.customerId===b.customerId)?._count.id??0,
    absenceHistory: absenceHistory.filter(item=>item.customerId===b.customerId).map(item=>({date:item.session.startsAt.toISOString(),status:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(item.absenceKind ?? "") ? "請假" : "曠課"})),
    serviceNote: [customers.find((c) => c.id === b.customerId)?.serviceNote, customers.find((c) => c.id === b.customerId)?.notes].filter(Boolean).join("\n"),
    openingIssue: openingIssue ?? openingOperationWarning,
    openingImported: openingMakeup || opening.kind !== "NATIVE",
    ...(openingMakeup ? { openingMakeup: true } : {}),
    openingTuition: opening.kind === "OPENING" ? {paid:opening.record.tuition.paidBeforeCutoff,receivable:opening.record.tuition.receivableAtCutoff} : null,
    termClosedBeforeCutoff: openingLesson.kind === "OPENING" ? openingLesson.closedBeforeCutoff : 0,
    termUnscheduledOrdinals: opening.kind === "NATIVE"
      ? Array.from({length:Math.max(0,termSize-periodLessons.length)},(_,i)=>periodLessons.length+i+1)
      : openingLesson.kind === "OPENING" && !openingIssue
        ? Array.from({length:openingLesson.originalTermLessonCount-openingLesson.closedBeforeCutoff},(_,i)=>openingLesson.closedBeforeCutoff+i+1)
          .filter(ordinal=>!currentSourceLessons.some(({item})=>item.musicOpeningLessonOrdinal===ordinal))
        : [],
    ...(openingMakeup || opening.kind !== "NATIVE" ? {
      termNumber: !openingIssue && openingLesson.kind === "OPENING" ? openingLesson.originalTermNumber : null,
      termIndex: !openingIssue && openingLesson.kind === "OPENING" ? openingLesson.originalLessonOrdinal : null,
      termCount: !openingIssue && openingLesson.kind === "OPENING" ? openingLesson.originalTermLessonCount : 0,
      bonusPeriod:false,
      expiresAt:opening.kind === "OPENING" ? opening.record.expiresAt : null,
      termLessons: !openingIssue ? currentSourceLessons.map(({item}) => ({
        date:item.session.startsAt.toISOString(),ordinal:item.musicOpeningLessonOrdinal!,
        status:item.status==="ATTENDED"?"已出席":item.status==="NO_SHOW"?"曠課":item.absenceKind==="TEACHER_ABSENT"?"教師未授課":item.absenceKind==="STUDENT_LEAVE"||item.absenceKind==="GROUP_LEAVE_FORFEITED"?"請假":item.status==="CANCELLED"?"已取消":"待上課",
      })) : [],
      termLeaveCount:!openingIssue?currentSourceLessons.filter(({item})=>["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(item.absenceKind??"")).length:0,
      termNoShowCount:!openingIssue?currentSourceLessons.filter(({item})=>item.status==="NO_SHOW").length:0,
      termPrivateLeaves:[],termMakeups:[],
      canAddCompanion:false,
      available:openingIssue||openingOperationWarning?0:(!card||card.expiresAt.getTime()<Date.now()?0:Math.max(0,card.remaining-card.bookings.filter(item=>item.status==="RESERVED").reduce((n,item)=>n+item.pointCost,0))),
    } : {}),
  });
  });
}
