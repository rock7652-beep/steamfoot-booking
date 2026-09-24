"use client";

import React from "react";

import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { normalizeAvailabilityPeriods, periodContains, minuteOfDay } from "@/lib/course-availability";

export type CourseScheduleMode = "month" | "week" | "day";

type Booking = {
  customerId: string;
  customerName: string;
  status: string;
  bookingKind: string;
};

type Session = {
  id: string;
  templateId: string;
  nameSnapshot: string;
  startsAt: string;
  endsAt: string;
  coachId: string;
  roomId: string;
  capacity: number;
  pointCost: number;
  bookings: Booking[];
};

type Room = {
  id: string;
  name: string;
  isActive: boolean;
};

type Coach = {
  id: string;
  displayName: string;
  status: string;
  courseCoachEnabled: boolean;
};

type Template = {
  id: string;
  name: string;
  classType?: string | null;
};

type Props = {
  businessProfile: "FITNESS" | "MUSIC";
  mode: Exclude<CourseScheduleMode, "month">;
  selectedDate: string;
  today: string;
  sessions: Session[];
  rooms: Room[];
  coaches: Coach[];
  templates: Template[];
  pending?: boolean;
  storePeriods: {openTime:string;closeTime:string}[];
  staffAvailability: {staffId:string;dayOfWeek:number;segments:unknown}[];
  staffAvailabilityExceptions: {staffId:string;date:string;type:string;segments:unknown;reason:string|null}[];
  onOpenEmpty: (value:{time:string;roomId?:string;coachId?:string})=>void;
  onSelectDate: (date: string) => void;
  onOpenSession: (sessionId: string, date: string) => void;
};

type ResourceView = "room" | "coach";
type QuickFilter = "all" | "trial" | "near-full" | "full" | "pending";

const tab =
  "min-h-8 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50";

function hhmm(iso: string) {
  return formatTWDateTime(new Date(iso)).slice(11);
}

function sessionDate(session: Session) {
  return toLocalDateStr(new Date(session.startsAt));
}

function firstCustomer(session: Session) {
  return session.bookings.find((booking) => booking.customerName.trim())?.customerName.trim() ?? "";
}

function isTrial(session: Session) {
  return session.bookings.some((booking) => booking.bookingKind === "TRIAL");
}

function pendingCheckins(session: Session) {
  return session.bookings.filter(
    (booking) => !["CHECKED_IN", "ATTENDED", "NO_SHOW", "CANCELLED"].includes(booking.status),
  ).length;
}

function openSeats(session: Session) {
  return Math.max(0, session.capacity - session.bookings.length);
}

function isFull(session: Session) {
  return session.bookings.length >= session.capacity;
}

function isNearFull(session: Session) {
  const remaining = openSeats(session);
  return remaining > 0 && remaining <= 2;
}

function filterSession(session: Session, filter: QuickFilter) {
  if (filter === "trial") return isTrial(session);
  if (filter === "near-full") return isNearFull(session);
  if (filter === "full") return isFull(session);
  if (filter === "pending") return pendingCheckins(session) > 0;
  return true;
}

function weekStart(date: string) {
  const day = parseLocalDate(date).getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addTaiwanDuration(date, offset, "DAY");
}

function shortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function adaptiveCopy(
  session: Session,
  templates: Template[],
  coaches: Coach[],
  rooms: Room[],
  businessProfile: "FITNESS" | "MUSIC",
) {
  const template = templates.find((item) => item.id === session.templateId);
  const coach =
    coaches.find((item) => item.id === session.coachId)?.displayName ?? (businessProfile === "MUSIC" ? "未指定老師" : "未指定教練");
  const room = rooms.find((item) => item.id === session.roomId)?.name ?? "未指定教室";
  const privateClass = template?.classType === "PRIVATE";
  const customer = firstCustomer(session);

  return {
    privateClass,
    primary: privateClass && customer ? customer : session.nameSnapshot,
    secondary: privateClass
      ? session.nameSnapshot
      : `${session.bookings.length} / ${session.capacity} 人`,
    coach,
    room,
  };
}

function SessionCard({
  session,
  templates,
  coaches,
  rooms,
  compact = false,
  dense = false,
  resourceView,
  businessProfile,
  onOpen,
}: {
  session: Session;
  templates: Template[];
  coaches: Coach[];
  rooms: Room[];
  compact?: boolean;
  dense?: boolean;
  resourceView?: ResourceView;
  businessProfile: "FITNESS" | "MUSIC";
  onOpen: () => void;
}) {
  const copy = adaptiveCopy(session, templates, coaches, rooms, businessProfile);
  const seats = openSeats(session);
  const musicDense = dense && businessProfile === "MUSIC";
  const showCapacityState = !musicDense || !copy.privateClass;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-lg border text-left transition hover:border-primary-300 hover:bg-primary-50/40 focus:outline-none focus:ring-2 focus:ring-primary-200 ${dense ? "p-1.5" : "p-2"} ${musicDense && !copy.privateClass ? "border-earth-200 border-l-2 border-l-primary-300 bg-primary-50/20" : "border-earth-200 bg-white"}`}
      aria-label={`${copy.primary}，${hhmm(session.startsAt)}，${copy.coach}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate font-semibold text-earth-900 ${dense ? "text-xs" : "text-sm"}`}>{copy.primary}</p>
          <p className={`truncate text-earth-600 ${dense ? "mt-0 text-[10px]" : "mt-0.5 text-xs"}`}>{copy.secondary}</p>
        </div>
        {!compact && (
          <span className="shrink-0 text-[11px] font-medium text-earth-500">
            {hhmm(session.startsAt)}
          </span>
        )}
      </div>
      <p className={`truncate text-earth-500 ${dense ? "mt-0.5 text-[10px]" : "mt-1 text-xs"}`}>
        {dense && resourceView === "room"
          ? copy.coach
          : dense && resourceView === "coach"
            ? copy.room
            : `${copy.coach} · ${copy.room}`}
      </p>
      <div className={`flex flex-wrap gap-1 ${dense ? "mt-1" : "mt-1.5"}`}>
        {isTrial(session) && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            體驗
          </span>
        )}
        {showCapacityState && (isFull(session) ? (
          <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-900">
            滿班
          </span>
        ) : isNearFull(session) ? (
          <span className="rounded-full bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-700">
            剩 {seats} 位
          </span>
        ) : null)}
        {pendingCheckins(session) > 0 && (
          <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
            待報到 {pendingCheckins(session)}
          </span>
        )}
        {copy.privateClass && !musicDense && (
          <span className="rounded-full bg-earth-50 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">
            {businessProfile === "MUSIC" ? "一對一" : "私教"}
          </span>
        )}
      </div>
    </button>
  );
}

export function CourseScheduleBoard({
  businessProfile,
  mode,
  selectedDate,
  today,
  sessions,
  rooms,
  coaches,
  templates,
  pending = false,
  storePeriods,
  staffAvailability,
  staffAvailabilityExceptions,
  onOpenEmpty,
  onSelectDate,
  onOpenSession,
}: Props) {
  const activeRooms = rooms.filter((room) => room.isActive);
  const activeCoaches = coaches.filter(
    (coach) => coach.status === "ACTIVE" && coach.courseCoachEnabled,
  );
  const [resourceView, setResourceView] = React.useState<ResourceView>("room");
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>("all");

  if (mode === "week") {
    const start = weekStart(selectedDate);
    const dates = Array.from({ length: 7 }, (_, index) =>
      addTaiwanDuration(start, index, "DAY"),
    );
    return (
      <section className="space-y-2" aria-label="週課表">
        <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
          <div className="grid min-w-[900px] grid-cols-7 divide-x divide-earth-100">
            {dates.map((date) => {
              const list = sessions
                .filter((session) => sessionDate(session) === date)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              return (
                <div key={date} className={date === selectedDate ? "bg-primary-50/40" : ""}>
                  <button
                    type="button"
                    className={`sticky top-0 z-10 w-full border-b border-earth-100 bg-white px-3 py-2 text-left ${date === today ? "text-primary-800" : "text-earth-700"}`}
                    onClick={() => onSelectDate(date)}
                  >
                    <span className="block text-xs">{date === today ? "今天 · " : ""}{shortDate(date)}</span>
                    <strong className="text-sm">{list.length} 堂</strong>
                  </button>
                  <div className="space-y-2 p-2">
                    {list.length ? (
                      list.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          templates={templates}
                          coaches={coaches}
                          rooms={rooms}
                          compact
                          businessProfile={businessProfile}
                          onOpen={() => onOpenSession(session.id, date)}
                        />
                      ))
                    ) : (
                      <p className="py-8 text-center text-xs text-earth-400">無課程</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  const daySessions = sessions
    .filter((session) => sessionDate(session) === selectedDate)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const filtered = daySessions.filter((session) => filterSession(session, quickFilter));
  const resources =
    resourceView === "room"
      ? activeRooms.map((room) => ({ id: room.id, name: room.name }))
      : activeCoaches.map((coach) => ({ id: coach.id, name: coach.displayName }));
  const normalizedStorePeriods = normalizeAvailabilityPeriods(storePeriods);
  const boundaryMinutes = normalizedStorePeriods.flatMap((period)=>[minuteOfDay(period.openTime),minuteOfDay(period.closeTime)]);
  const sessionMinutes = filtered.flatMap((session)=>[minuteOfDay(hhmm(session.startsAt)),minuteOfDay(hhmm(session.endsAt))]);
  const minMinute = Math.min(...(boundaryMinutes.length ? boundaryMinutes : sessionMinutes.length ? sessionMinutes : [9*60]));
  const maxMinute = Math.max(...(boundaryMinutes.length ? boundaryMinutes : sessionMinutes.length ? sessionMinutes : [22*60]));
  const firstHour = Math.floor(minMinute/60);
  const lastHour = Math.max(firstHour,Math.ceil(maxMinute/60)-1);
  const times = Array.from({length:lastHour-firstHour+1},(_,index)=>`${String(firstHour+index).padStart(2,"0")}:00`);
  const selectedDayOfWeek=parseLocalDate(selectedDate).getDay();
  const coachPeriods=(staffId:string)=>{
    const exception=staffAvailabilityExceptions.find(item=>item.staffId===staffId&&item.date===selectedDate);
    if(exception?.type==="UNAVAILABLE") return [];
    if(exception?.type==="CUSTOM") return normalizeAvailabilityPeriods(exception.segments);
    const rows=staffAvailability.filter(item=>item.staffId===staffId);
    if(!rows.length) return normalizedStorePeriods;
    return normalizeAvailabilityPeriods(rows.find(item=>item.dayOfWeek===selectedDayOfWeek)?.segments);
  };
  const resourcePeriods=(resourceId:string)=>resourceView==="room"
    ? normalizedStorePeriods
    : coachPeriods(resourceId);
  const slotConflict=(resourceId:string,startTime:string)=>{
    const start=minuteOfDay(startTime),end=start+30;
    return filtered.some(session=>{
      const same=resourceView==="room"?session.roomId===resourceId:session.coachId===resourceId;
      if(!same) return false;
      const sessionStart=minuteOfDay(hhmm(session.startsAt)),sessionEnd=minuteOfDay(hhmm(session.endsAt));
      return start<sessionEnd&&end>sessionStart;
    });
  };
  const resourceCount = Math.max(resources.length, 1);
  const musicDense = businessProfile === "MUSIC";
  const timetableWidth = musicDense
    ? "100%"
    : resourceCount === 1
      ? "44%"
      : resourceCount === 2
        ? "64%"
        : resourceCount === 3
          ? "80%"
          : "100%";
  const timetableMinWidth = musicDense
    ? 64 + resourceCount * 132
    : resourceCount === 1
      ? 420
      : resourceCount === 2
        ? 620
        : resourceCount === 3
          ? 780
          : 72 + resourceCount * 220;

  const booked = daySessions.reduce((sum, session) => sum + session.bookings.length, 0);
  const trials = daySessions.reduce(
    (sum, session) => sum + session.bookings.filter((booking) => booking.bookingKind === "TRIAL").length,
    0,
  );
  const nearFull = daySessions.filter(isNearFull).length;
  const full = daySessions.filter(isFull).length;
  const pendingCount = daySessions.reduce(
    (sum, session) => sum + pendingCheckins(session),
    0,
  );

  const filters: Array<{ id: QuickFilter; label: string; value: number }> = [
    { id: "all", label: "今日課程", value: daySessions.length },
    { id: "trial", label: "體驗", value: trials },
    { id: "near-full", label: "快滿", value: nearFull },
    { id: "full", label: "滿班", value: full },
    { id: "pending", label: "待報到", value: pendingCount },
  ];

  return (
    <section className="space-y-2" aria-label="日課表">
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <div
          className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-earth-200 bg-white px-2 py-1.5"
          aria-label="今日狀態快速篩選"
        >
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              disabled={pending}
              onClick={() => setQuickFilter(filter.id)}
              className={`${tab} ${quickFilter === filter.id ? "bg-primary-50 text-primary-900" : "text-earth-600 hover:bg-earth-50"}`}
            >
              <span>{filter.label}</span>
              <strong className="ml-1">{filter.value}</strong>
            </button>
          ))}
          <span className="px-2 text-xs text-earth-300">｜</span>
          <span className="px-1 text-xs text-earth-600">
            預約 <strong className="text-earth-800">{booked}</strong> 人
          </span>
        </div>

        <div className="inline-flex rounded-lg border border-earth-200 bg-white p-0.5" aria-label="課表資源視角">
          <button
            type="button"
            className={`min-h-8 rounded-md px-3 text-xs ${resourceView === "room" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("room")}
          >
            教室視角
          </button>
          <button
            type="button"
            className={`min-h-8 rounded-md px-3 text-xs ${resourceView === "coach" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("coach")}
          >
            {businessProfile === "MUSIC" ? "老師視角" : "教練視角"}
          </button>
        </div>
      </div>

      {!daySessions.length ? (
        <div className="rounded-xl border border-dashed border-earth-200 bg-white p-10 text-center text-earth-500">
          當日尚無課程
        </div>
      ) : !filtered.length ? (
        <div className="rounded-xl border border-dashed border-earth-200 bg-white p-8 text-center text-earth-500">
          此篩選目前沒有課程
        </div>
      ) : (
        <div className={`max-w-full pb-1 ${musicDense ? "max-h-[calc(100vh-260px)] min-h-[420px] overflow-auto rounded-xl border border-earth-200 bg-white" : "overflow-x-auto"}`}>
          <div
            className={musicDense ? "bg-white" : "overflow-hidden rounded-xl border border-earth-200 bg-white"}
            style={{
              width: timetableWidth,
              minWidth: timetableMinWidth,
            }}
          >
            <div
              className="grid w-full"
              style={{
                gridTemplateColumns: musicDense
                  ? `64px repeat(${resourceCount}, minmax(124px, 1fr))`
                  : `72px repeat(${resourceCount}, minmax(180px, 1fr))`,
              }}
            >
              <div className={`sticky left-0 top-0 z-50 border-b border-r border-earth-200 bg-earth-50 px-2 text-xs font-medium text-earth-500 ${musicDense ? "py-2" : "py-3"}`}>
                時間
              </div>
            {resources.length ? (
              resources.map((resource) => (
                <div
                  key={resource.id}
                  className={`sticky top-0 z-40 border-b border-r border-earth-200 bg-earth-50 font-semibold text-earth-800 ${musicDense ? "px-2 py-2 text-xs" : "px-3 py-3 text-sm"}`}
                >
                  {resource.name}
                </div>
              ))
            ) : (
              <div className="sticky top-0 z-20 border-b border-earth-200 bg-earth-50 px-3 py-3 text-sm text-earth-500">
                尚無可用{resourceView === "room" ? "教室" : businessProfile === "MUSIC" ? "老師" : "教練"}
              </div>
            )}

            {times.map((time) => (
              <React.Fragment key={time}>
                <div className={`sticky left-0 z-30 border-b border-r border-earth-100 bg-white px-2 text-xs font-medium text-earth-600 ${musicDense ? "py-2" : "py-3"}`}>
                  {time}
                </div>
                {(resources.length ? resources : [{ id: "__none", name: "" }]).map((resource) => {
                  const list = filtered.filter(
                    (session) =>
                      hhmm(session.startsAt).slice(0,2) === time.slice(0,2) &&
                      (resourceView === "room"
                        ? session.roomId === resource.id
                        : session.coachId === resource.id),
                  );
                  return (
                    <div
                      key={`${time}:${resource.id}`}
                      className={`relative border-b border-r border-earth-100 ${musicDense ? "min-h-24" : "min-h-20 space-y-2 p-2"}`}
                    >
                      {musicDense && resource.id !== "__none" && (
                        <div className="absolute inset-0 grid grid-rows-2">
                          {["00","30"].map((minute)=>{
                            const startTime=`${time.slice(0,2)}:${minute}`;
                            const storeOpen=periodContains(normalizedStorePeriods,startTime,30);
                            const resourceOpen=periodContains(resourcePeriods(resource.id),startTime,30);
                            const available=storeOpen&&resourceOpen&&!slotConflict(resource.id,startTime);
                            const reason=!storeOpen?"店家未開放":!resourceOpen?(resourceView==="coach"?"老師未排班":"不可使用"):slotConflict(resource.id,startTime)?"已有課程":"";
                            return (
                              <button
                                key={minute}
                                type="button"
                                disabled={!available||pending}
                                title={available?`${startTime} 可排課`:reason}
                                aria-label={available?`${startTime} 可排課`:`${startTime} ${reason}`}
                                onClick={()=>available&&onOpenEmpty({time:startTime,...(resourceView==="room"?{roomId:resource.id}:{coachId:resource.id})})}
                                className={`group relative border-b border-earth-100/70 text-left last:border-b-0 ${available?"bg-white hover:bg-primary-50":"cursor-not-allowed bg-earth-100/70"}`}
                              >
                                {available&&<span className="pointer-events-none absolute left-1 top-1 hidden rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-primary-800 shadow-sm group-hover:block">＋ {startTime}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className={musicDense?"relative z-10 p-1 pointer-events-none":"contents"}>
                        {list.map((session) => (
                          <div key={session.id} className={musicDense&&hhmm(session.startsAt).endsWith(":30")?"mt-10 pointer-events-auto":"pointer-events-auto"}>
                            <SessionCard
                              session={session}
                              templates={templates}
                              coaches={coaches}
                              rooms={rooms}
                              businessProfile={businessProfile}
                              dense={musicDense}
                              resourceView={resourceView}
                              onOpen={() => onOpenSession(session.id, selectedDate)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
