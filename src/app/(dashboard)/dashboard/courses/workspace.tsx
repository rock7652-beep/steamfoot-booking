"use client";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";

import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CourseRoster } from "./roster";
import {
  CourseScheduleBoard,
  type CourseScheduleMode,
} from "./course-schedule-board";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  parseTaipeiDateTime,
  toLocalDateStr,
} from "@/lib/date-utils";
import {
  updateCourseSeries,
  createCourseRoom,
  createCourseTemplate,
  createCourseSchedule,
  updateCourseRoom,
  updateCourseTemplate,
  updateCourseSession,
  setCourseCatalogStatus,
  batchCourseTemplates,
} from "@/server/actions/course";
import { courseSessionStatus } from "@/lib/course-session-status";

type Room = {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  capacity: number | null;
  details?: string;
  equipment?:string;location?:string;visibility?:string;classType?:string|null;
  uses?: { id:string;nameSnapshot: string; startsAt: string }[];
};
type Template = Omit<Room, "capacity"> & {
  durationMinutes: number;
  capacity: number;
  pointCost: number;
  defaultRoomId: string | null;
  description?: string;
  precautions?: string;
};
type Session = {
  bookings: {
    customerId: string;
    customerName: string;
    status: string;
    bookingKind: string;
  }[];
  id: string;
  templateId: string;
  nameSnapshot: string;
  startsAt: string;
  endsAt: string;
  coachId: string;
  roomId: string;
  capacity: number;
  pointCost: number;
};
type Props = {
  selectedDate: string;
  today: string;
  nowIso: string;
  calendarDays: Record<
    string,
    { status: "open" | "closed" | "training" | "custom"; reason: string | null }
  >;
  rooms: Room[];
  templates: Template[];
  sessions: Session[];
  coaches: { id: string; displayName: string; status: string;courseCoachEnabled:boolean;courseQualificationsConfirmed:boolean;courseQualifiedTemplateIds:string[] }[];
  canCreate: boolean;
  canDelete?: boolean;
  canEdit: boolean;
  cashbookShortcut?: ReactNode;
  businessProfile: "FITNESS" | "MUSIC";
  view: "schedule" | "catalog" | "rooms";
};
const button =
  "min-h-10 rounded-lg border border-earth-200 px-3 py-1.5 text-sm disabled:opacity-50";
const primary = `${button} bg-primary-700 text-white`;
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";

export function CourseWorkspace({
  canDelete=false,
  selectedDate: loadedDate,
  today,
  nowIso,
  calendarDays,
  rooms: allRooms,
  templates: allTemplates,
  sessions,
  coaches: allCoaches,
  canCreate,
  canEdit,
  cashbookShortcut,
  businessProfile,
  view,
}: Props) {
  const coaches = allCoaches.filter((c) => c.status === "ACTIVE" && c.courseCoachEnabled);
  const rooms = allRooms.filter((r) => r.isActive);
  const templates = allTemplates.filter((t) => t.isActive);
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const requestedDate = params.get("date");
  const selectedDate = requestedDate && parseTaipeiDateTime(requestedDate, "00:00") ? requestedDate : loadedDate;
  const requestedScheduleMode = params.get("scheduleView");
  const [scheduleMode, setScheduleMode] = useState<CourseScheduleMode>(
    requestedScheduleMode === "day" || requestedScheduleMode === "week"
      ? requestedScheduleMode
      : "month",
  );
  function changeScheduleMode(nextMode: CourseScheduleMode) {
    setScheduleMode(nextMode);
    const next = new URLSearchParams(params.toString());
    next.set("scheduleView", nextMode);
    window.history.replaceState(null, "", `${pathname}?${next}`);
  }
  const [courseDialog, setCourseDialog] = useState<{
    sessionId: string;
    kind: "roster" | "member-booking" | "trial-booking";
  } | null>(
    params.get("session")
      ? { sessionId: params.get("session")!, kind: "roster" }
      : null,
  );
  const [memberBookingReady, setMemberBookingReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [panel, setPanel] = useState<
    "day" | "schedule" | "catalog" | "edit" | "inspect" | null
  >(canCreate && params.get("action") === "schedule" ? "schedule" : params.get("action") === "booking" || params.get("session") ? "day" : null);
  useEffect(() => {
    if (view !== "schedule" || panel !== "day") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLastUpdated(new Date());
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [panel, router, view]);
  const [dirty, setDirty] = useState(false);
  function closePanel() {
    if (pending || (dirty && !window.confirm("尚有未儲存的修改，要放棄並關閉嗎？"))) return;
    setDirty(false);
    setPanel(null);
  }
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [roomFilter, setRoomFilter] = useState(params.get("room") ?? "all");
  const [coachFilter, setCoachFilter] = useState("all");
  const catalogItems = view === "rooms" ? allRooms : allTemplates;
  const categories = [
    ...new Set(catalogItems.map((item) => item.category)),
  ].sort();
  const filteredItems = catalogItems
    .filter(
      (item) =>
        item.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()) &&
        (status === "all" || (view === "rooms" ? item.isActive === (status === "active") : (item.visibility ?? (item.isActive?"PUBLIC":"OFF")) === status)) &&
        (category === "all" || item.category === category) &&
        (view === "rooms" ||
          roomFilter === "all" ||
          ("defaultRoomId" in item && item.defaultRoomId === roomFilter)),
    )
    .sort((a, b) => {
      const rank = (item: Room) => !item.isActive ? 2 : item.visibility === "HIDDEN" ? 1 : 0;
      return rank(a) - rank(b);
    });
  function changeStatus(item: Room, visibility?:string) {
    if (pending) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await setCourseCatalogStatus({
          id: item.id,
          kind: view === "rooms" ? "room" : "template",
          isActive: visibility ? visibility!=="OFF" : !item.isActive,
          visibility,
        });
        if (!result.success) {
          setError(result.error ?? "更新失敗");setConflicts(result.conflicts ?? []);
          return;
        }
        setNotice("狀態已更新，既有預約與歷史保留。");
        router.refresh();
      } catch {
        setError("連線失敗，請重試。");
      }
    });
  }
  const [conflicts,setConflicts]=useState<ConflictItem[]>([]);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [copyTemplate,setCopyTemplate]=useState(false);
  const [editTemplateId,setEditTemplateId]=useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(templates[0]?.id ?? "");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [repeat, setRepeat] = useState(false);
  const [editing, setEditing] = useState<
    | { kind: "room"; value: Room }
    | { kind: "template"; value: Template }
    | { kind: "session"; value: Session }
    | null
  >(null);
  const month = selectedDate.slice(0, 7),
    first = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(year, mon, 0).getDate();
  const filteredScheduleSessions = sessions.filter(
    (s) =>
      (roomFilter === "all" || s.roomId === roomFilter) &&
      (coachFilter === "all" || s.coachId === coachFilter) &&
      (category === "all" ||
        allTemplates.find((t) => t.id === s.templateId)?.category === category),
  );
  const byDate = new Map<string, Session[]>();
  for (const session of filteredScheduleSessions) {
    const day = toLocalDateStr(new Date(session.startsAt));
    byDate.set(day, [...(byDate.get(day) ?? []), session]);
  }
  for (const list of byDate.values()) list.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id));
  function go(date: string) {
    const next = new URLSearchParams(params.toString());
    next.set("date", date);
    if (date.slice(0, 7) === loadedDate.slice(0, 7)) {
      // All sessions for this month are already loaded. Keep the open sheet,
      // filters and scroll position instead of remounting through navigation.
      window.history.replaceState(null, "", `${pathname}?${next}`);
    } else startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  function open(next: typeof panel) {
    setConflicts([]);
    setDirty(false);
    setPanel(next);
    setExtraDateKeys([]);
    setRoomCapacityNotice("");
    setError("");
    setNotice("");
  }
  const [roomCapacityNotice, setRoomCapacityNotice] = useState("");
  const [extraDateKeys, setExtraDateKeys] = useState<string[]>([]);
  const [copySource, setCopySource] = useState<Session | null>(null);
  function openSchedule() {
    setCopySource(null);
    setChosen(templates[0]?.id ?? "");
    setRequestKey(crypto.randomUUID());
    setRepeat(false);
    open("schedule");
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (
      data: FormData,
    ) => Promise<{ success: boolean; error?: string; conflicts?:ConflictItem[]; data?: unknown }>,
    after?: (data: FormData) => void,
  ) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget,
      data = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const result = await action(data);
        if (!result.success) {
          setError(result.error ?? "儲存失敗，請重試");setConflicts(result.conflicts ?? []);
          return;
        }
        const count =
          result.data &&
          typeof result.data === "object" &&
          "count" in result.data
            ? result.data.count
            : null;
        setNotice(
          typeof count === "number" ? `已建立 ${count} 堂課程` : "已儲存",
        );
        setDirty(false);
        form.reset();
        after?.(data);
        if (panel === "catalog") setPanel(null);
        router.refresh();
      } catch {
        setError("連線失敗，請重試；重複送出不會重複排課。");
      }
    });
  }
  const template = templates.find((t) => t.id === chosen);
  return (
    <>
      {!panel && <CourseConflicts items={conflicts}/>}
      {view === "schedule" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="mr-1 min-w-[112px]">
                <h1 className="text-base font-semibold text-earth-900">{businessProfile === "MUSIC" ? "音樂課表" : "課表排程"}</h1>
                <p className="hidden text-[11px] text-earth-500 sm:block">安排與查看店內課程</p>
              </div>
              <div
                className="inline-flex rounded-lg border border-earth-200 bg-white p-1"
                aria-label="課表視角"
              >
                {(["month", "week", "day"] as CourseScheduleMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={pending}
                    onClick={() => changeScheduleMode(mode)}
                    className={`min-h-8 rounded-md px-3 text-sm ${
                      scheduleMode === mode
                        ? "bg-primary-50 font-medium text-primary-900"
                        : "text-earth-600"
                    }`}
                  >
                    {mode === "month" ? "月表" : mode === "week" ? "週表" : "日表"}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  className={`${button} min-h-9 px-2.5`}
                  disabled={pending}
                  aria-label={
                    scheduleMode === "month"
                      ? "上個月"
                      : scheduleMode === "week"
                        ? "上一週"
                        : "前一天"
                  }
                  onClick={() =>
                    go(
                      scheduleMode === "month"
                        ? addTaiwanDuration(first, -1, "MONTH")
                        : addTaiwanDuration(
                            selectedDate,
                            -1,
                            scheduleMode === "week" ? "WEEK" : "DAY",
                          ),
                    )
                  }
                >
                  ‹
                </button>
                <button
                  className={`${button} min-h-9 px-3`}
                  disabled={pending}
                  onClick={() => go(today)}
                >
                  今天
                </button>
                <button
                  className={`${button} min-h-9 px-2.5`}
                  disabled={pending}
                  aria-label={
                    scheduleMode === "month"
                      ? "下個月"
                      : scheduleMode === "week"
                        ? "下一週"
                        : "後一天"
                  }
                  onClick={() =>
                    go(
                      scheduleMode === "month"
                        ? addTaiwanDuration(first, 1, "MONTH")
                        : addTaiwanDuration(
                            selectedDate,
                            1,
                            scheduleMode === "week" ? "WEEK" : "DAY",
                          ),
                    )
                  }
                >
                  ›
                </button>
              </div>
              <label className="sr-only" htmlFor="course-schedule-date">課表日期</label>
              <input
                id="course-schedule-date"
                key={selectedDate}
                aria-label="課表日期"
                type="date"
                defaultValue={selectedDate}
                disabled={pending}
                onChange={(event) => {
                  const date = event.target.value;
                  if (parseTaipeiDateTime(date, "00:00")) go(date);
                }}
                className="min-h-9 rounded-lg border border-earth-200 bg-white px-2.5 text-sm text-earth-700"
              />
              <span className="hidden text-sm font-medium text-earth-700 xl:inline">
                {scheduleMode === "month"
                  ? `${year} 年 ${mon} 月`
                  : scheduleMode === "week"
                    ? `${selectedDate} 當週`
                    : selectedDate}
              </span>
            </div>
            {(cashbookShortcut || canCreate || canEdit) && (
              <div className="flex shrink-0 gap-2">
                {cashbookShortcut}
                {canCreate && (
                  <button
                    className={`${primary} min-h-9`}
                    disabled={pending}
                    onClick={openSchedule}
                  >
                    ＋ 排課
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-earth-200 bg-earth-50/50 px-2 py-2">
            <span className="px-1 text-xs font-medium text-earth-500">篩選</span>
            <label className="sr-only" htmlFor="course-coach-filter">{businessProfile === "MUSIC" ? "老師" : "教練"}</label>
            <select
              id="course-coach-filter"
              aria-label="教練篩選"
              className={`${button} min-h-9 bg-white py-1`}
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
            >
              <option value="all">{businessProfile === "MUSIC" ? "全部老師" : "全部教練"}</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.displayName}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="course-room-filter">教室</label>
            <select
              id="course-room-filter"
              aria-label="教室篩選"
              className={`${button} min-h-9 bg-white py-1`}
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
            >
              <option value="all">全部教室</option>
              {allRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="course-category-filter">分類</label>
            <select
              id="course-category-filter"
              aria-label="課程分類篩選"
              className={`${button} min-h-9 bg-white py-1`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">全部分類</option>
              {[...new Set(allTemplates.map((template) => template.category))].map((item) => (
                <option key={item} value={item}>
                  {item || "未分類"}
                </option>
              ))}
            </select>
            {(coachFilter !== "all" || roomFilter !== "all" || category !== "all") && (
              <button
                type="button"
                className="min-h-9 rounded-lg px-2.5 text-xs text-earth-600 hover:bg-white"
                onClick={() => {
                  setCoachFilter("all");
                  setRoomFilter("all");
                  setCategory("all");
                }}
              >
                清除篩選
              </button>
            )}
          </div>
          {scheduleMode === "month" ? (
            <>
              <div
            className="overflow-hidden rounded-lg border border-earth-200 bg-white"
            aria-busy={pending}
          >
            <div className="grid grid-cols-7">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-sm text-earth-600"
                >
                  {day}
                </div>
              ))}
              {Array.from(
                { length: parseLocalDate(first).getDay() },
                (_, i) => (
                  <div key={`blank-${i}`} />
                ),
              )}
              {Array.from({ length: days }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                  list = byDate.get(date) ?? [],
                  calendarDay = calendarDays[date],
                  isClosed =
                    calendarDay?.status === "closed" ||
                    calendarDay?.status === "training",
                  closureLabel =
                    calendarDay?.status === "training" ? "員工訓練" : "公休";
                return (
                  <button
                    key={date}
                    disabled={pending}
                    aria-label={`${date}，${isClosed ? closureLabel : `${list.length} 堂課`}`}
                    onClick={() => {
                      go(date);
                      changeScheduleMode("day");
                    }}
                    className={`relative flex min-w-0 h-16 sm:h-24 xl:h-28 flex-col items-start justify-start border-t border-earth-100 px-1 py-1.5 text-left sm:px-3 sm:py-2 ${date === today ? "ring-2 ring-inset ring-primary-500" : ""} ${
                      isClosed
                        ? "bg-earth-100 text-earth-500"
                        : date === selectedDate
                          ? "bg-primary-50"
                          : list.length
                            ? "bg-white"
                            : "bg-earth-50 text-earth-400"
                    }`}
                  >
                    <span className={`shrink-0 text-xs font-medium leading-4 ${date===today?"text-primary-800":"text-earth-700"}`}>{i + 1}{date===today&&<span className="ml-1 hidden text-[10px] sm:inline">今天</span>}</span>
                    {isClosed && (
                      <span
                        className="mt-1 max-w-full truncate rounded bg-earth-200 px-1.5 py-0.5 text-[10px] font-medium text-earth-700"
                        title={calendarDay?.reason || closureLabel}
                      >
                        {closureLabel}
                      </span>
                    )}
                    {list.length > 0 && <span className="mt-1 text-xs font-medium sm:hidden">{list.length} 堂</span>}
                    {list.slice(0, 2).map((s) => (
                      <span
                        key={s.id}
                        className={`hidden w-full shrink-0 truncate leading-[14px] sm:block sm:text-[11px] rounded-sm border-l-2 px-1 ${courseSessionStatus(s, nowIso).calendarClass} ${courseSessionStatus(s, nowIso).accentClass}`}
                        title={`${s.nameSnapshot} · ${courseSessionStatus(s, nowIso).label}`}
                      >
                        {formatTWDateTime(new Date(s.startsAt)).slice(11)}{" "}
                        {s.nameSnapshot}
                      </span>
                    ))}
                    {list.length > 2 && (
                      <span className="hidden shrink-0 leading-[14px] sm:block sm:text-[11px]">
                        ＋{list.length - 2} 堂
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-earth-600" aria-label="課程狀態圖例">
            {[
              ["未開始", "bg-sky-50 text-sky-800"],
              ["進行中", "bg-amber-50 text-amber-800"],
              ["待點名", "bg-violet-50 text-violet-800"],
              ["已完成", "bg-emerald-50 text-emerald-800"],
              ["未到", "bg-red-50 text-red-700"],
              ["已結束", "bg-earth-100 text-earth-700"],
            ].map(([label, tone]) => <span key={label} className={`rounded-full px-2 py-1 ${tone}`}>{label}</span>)}
            <span>灰底「公休／員工訓練」：當日不可排課</span>
          </div>
            </>
          ) : (
            <CourseScheduleBoard
              businessProfile={businessProfile}
              mode={scheduleMode}
              selectedDate={selectedDate}
              today={today}
              sessions={filteredScheduleSessions}
              rooms={allRooms}
              coaches={allCoaches}
              templates={allTemplates}
              pending={pending}
              onSelectDate={go}
              onOpenSession={(sessionId, date) => {
                go(date);
                setCourseDialog({ sessionId, kind: "roster" });
              }}
            />
          )}
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-primary-700"
          >
            {pending ? "處理中…" : notice}
          </p>
        </div>
      )}
      <datalist id="course-category-options">
        {categories.filter(Boolean).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {view !== "schedule" && (
        <section
          className="space-y-3"
          aria-label={view === "rooms" ? "教室清單" : "課程清單"}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-48 flex-1">
              <span className="sr-only">搜尋名稱</span>
              <input
                className={field}
                placeholder={view === "rooms" ? "搜尋教室名稱" : "搜尋課程名稱"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="篩選分類"
              className={button}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">全部分類</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c || "未分類"}
                </option>
              ))}
            </select>
            <select
              aria-label="篩選狀態"
              className={button}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部狀態</option>
              <option value={view === "rooms" ? "active" : "PUBLIC"}>
                {view === "rooms" ? "啟用" : "上架"}
              </option>
              <option value={view === "rooms" ? "inactive" : "OFF"}>
                {view === "rooms" ? "停用" : "下架"}
              </option>
              {view === "catalog" && <option value="HIDDEN">隱藏</option>}
            </select>
            {view === "catalog" && (
              <select
                aria-label="篩選預設教室"
                className={button}
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
              >
                <option value="all">全部教室</option>
                {allRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className={button}
              onClick={() => {
                setQuery("");
                setStatus("all");
                setCategory("all");
                setRoomFilter("all");
              }}
            >
              清除篩選
            </button>
            {canCreate && (
              <button
                className={primary}
                disabled={pending}
                onClick={() => open("catalog")}
              >
                ＋ {view === "rooms" ? "新增教室" : "新增課程"}
              </button>
            )}
          </div>
          {view==="rooms" && canEdit && <CourseBatchBar canDelete={canDelete} names={Object.fromEntries(filteredItems.map(r=>[r.id,r.name]))} kind="room" ids={filteredItems.map(r=>r.id)} selected={selectedIds} onChange={setSelectedIds}/>}
          {view==="catalog" && canEdit && <CourseBatchBar canDelete={canDelete} kind="template" deleteOnly names={Object.fromEntries(filteredItems.map(r=>[r.id,r.name]))} ids={filteredItems.map(r=>r.id)} selected={selectedIds} onChange={setSelectedIds}/>}
          {view==="catalog" && canEdit && selectedIds.length>0 && <form className="flex flex-wrap items-center gap-2" onSubmit={e=>submit(e,async d=>batchCourseTemplates({ids:selectedIds,...(d.get("batchCategory")!==""?{category:d.get("batchCategory")}:{}),...(d.get("batchVisibility")?{visibility:d.get("batchVisibility")}: {})}),()=>setSelectedIds([]))}>
            <span>已選 {selectedIds.length} 筆</span><input name="batchCategory" className={button} placeholder="調整分類"/><select name="batchVisibility" className={button}><option value="">狀態不變</option><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select><button className={button} disabled={pending}>套用至選取課程</button>
          </form>}
          <p className="text-sm text-earth-500">
            共 {filteredItems.length} 筆／全部 {catalogItems.length} 筆 ·
            {view === "rooms" ? "停用教室不供新排課使用；既有紀錄保留。" : "隱藏僅供店長使用；下架不供新增使用，既有紀錄保留。"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
            <table className="block w-full text-left text-sm sm:table sm:min-w-[680px]">
              <thead className="hidden bg-earth-50 text-earth-600 sm:table-header-group">
                <tr>
                  {(view === "rooms"
                    ? ["教室名稱", "分類", "容納人數", "狀態", "操作"]
                    : [
                        "課程名稱",
                        "分類",
                        "時長",
                        "每人方案扣抵",
                        "人數上限",
                        "狀態",
                        "操作",
                      ]
                  ).map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block divide-y divide-earth-100 sm:table-row-group">
                {filteredItems.map((item) => {
                  const template =
                    "durationMinutes" in item ? (item as Template) : null;
                  return (
                    <tr
                      key={item.id}
                      className={"block p-3 sm:table-row sm:p-0 " + (
                        item.isActive && (!template || template.visibility === "PUBLIC")
                          ? "hover:bg-primary-50/40"
                          : "bg-earth-50 opacity-60 hover:opacity-100 focus-within:opacity-100"
                      )}
                    >
                      <th
                        scope="row"
                        className="block break-words pb-2 font-medium text-primary-900 sm:table-cell sm:max-w-64 sm:px-4 sm:py-3"
                      >
                        {canEdit && <input aria-label={`選取 ${item.name}`} type="checkbox" className="mr-2" checked={selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>}{item.name}
                        {template && <span className="block text-xs text-earth-500">{template.classType==="PRIVATE"?"私課":template.classType==="GROUP"?"團課":"課型待補"}</span>}
                      </th>
                      <td className="block py-1 sm:table-cell sm:px-4 sm:py-3"><span className="text-earth-500 sm:hidden">分類： </span>{item.category || "未分類"}</td>
                      {template ? (
                        <>
                          <td className="block py-1 tabular-nums sm:table-cell sm:whitespace-nowrap sm:px-4 sm:py-3">
                            <span className="text-earth-500 sm:hidden">時長： </span>
                            {template.durationMinutes} 分
                          </td>
                          <td className="block py-1 tabular-nums sm:table-cell sm:px-4 sm:py-3">
                            點數卡 {template.pointCost} 點；堂數卡 1 堂
                          </td>
                          <td className="block py-1 tabular-nums sm:table-cell sm:px-4 sm:py-3">
                            <span className="text-earth-500 sm:hidden">人數上限： </span>
                            {template.capacity}
                          </td>
                        </>
                      ) : (
                        <td className="block py-1 tabular-nums sm:table-cell sm:px-4 sm:py-3">
                          <span className="text-earth-500 sm:hidden">容納人數： </span>
                          {item.capacity ?? "未設定"}
                        </td>
                      )}
                      <td className="block py-2 sm:table-cell sm:whitespace-nowrap sm:px-4 sm:py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-xs ${item.isActive ? "bg-primary-50 text-primary-700" : "bg-earth-100 text-earth-500"}`}
                        >
                          {template ? ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[template.visibility ?? "PUBLIC"]) : item.isActive ? "啟用":"停用"}
                        </span>
                      </td>
                      <td className="block py-2 sm:table-cell sm:px-4">
                        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:whitespace-nowrap">
                          {canEdit && (
                            <>
                              <button
                                className={button}
                                disabled={pending}
                                onClick={() => {
                                  setCopyTemplate(false);
                                  setEditing(
                                    template
                                      ? { kind: "template", value: template }
                                      : { kind: "room", value: item },
                                  );
                                  open("inspect");
                                }}
                              >
                                查看{template ? "課程" : "教室"}
                              </button>
                              {template ? <>
                                <select className={button} aria-label={`${item.name} 狀態`} value={template.visibility ?? "PUBLIC"} disabled={pending} onChange={e=>changeStatus(item,e.target.value)}><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select>
                                {canCreate && <button className={button} onClick={()=>{setCopyTemplate(true);setEditing({kind:"template",value:{...template,name:template.name+"（複製）"}});open("edit");}}>複製設定</button>}
                              </> : <><button className={button} disabled={pending} onClick={()=>changeStatus(item)}>{item.isActive?"停用":"啟用"}</button><button className={button} onClick={()=>router.push(`${pathname}?date=${selectedDate}&room=${encodeURIComponent(item.id)}`)}>查看課表</button></>}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredItems.length && (
              <p className="p-8 text-center text-earth-500">
                沒有符合條件的資料，請調整篩選或新增資料。
              </p>
            )}
          </div>
          {notice && (
            <p role="status" className="text-sm text-primary-700">
              {notice}
            </p>
          )}
          {error && !panel && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </section>
      )}
      {panel && (
        <RightSheet presentation="centered"
          compact
          open
          onClose={closePanel}
          width={520}
          labelledById="course-panel-title"
        >
          <div
            className={
              view === "schedule"
                ? "flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2"
                : "flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2"
            }
          >
            <h2
              id="course-panel-title"
              className={
                view === "schedule"
                  ? "font-medium"
                  : "text-base font-semibold text-primary-900"
              }
            >
              {panel === "edit"
                ? editing?.kind === "session"
                  ? "編輯單堂排課"
                  : editing?.kind === "room"
                    ? "編輯教室"
                    : copyTemplate ? "複製課程" : "編輯課程"
                : panel === "inspect" ? (editing?.kind === "room" ? "查看教室" : "查看課程") : panel === "catalog"
                  ? view === "rooms"
                    ? "新增教室"
                    : "新增課程"
                  : panel === "schedule"
                    ? copySource
                      ? "複製排課"
                      : "新增排課"
                    : selectedDate}
            </h2>
            {
              <button
                className={button}
                disabled={pending}
                onClick={closePanel}
              >
                關閉
              </button>
            }
          </div>
          <div
            onChangeCapture={(event) => { if ((event.target as HTMLElement).closest("form")) setDirty(true); }}
            className={
              view === "schedule"
                ? "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
                : "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [&_label]:space-y-1 [&_label]:text-sm [&_label]:font-medium [&_label]:text-earth-700 [&_input]:min-h-10 [&_input]:rounded-xl [&_input]:px-3 [&_input]:font-normal [&_input]:outline-none [&_input:focus]:border-primary-500 [&_input:focus]:ring-2 [&_input:focus]:ring-primary-100 [&_select]:min-h-10 [&_select]:rounded-xl [&_select]:px-3 [&_select]:font-normal [&_form]:gap-3"
            }
          >
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-primary-700">
                {notice}
              </p>
            )}
            {panel === "day" &&
              (() => {
                const daySessions = byDate.get(selectedDate) ?? [];
                const booked = daySessions.reduce(
                  (total, item) => total + item.bookings.length,
                  0,
                );
                const capacity = daySessions.reduce(
                  (total, item) => total + item.capacity,
                  0,
                );
                const fullClasses = daySessions.filter(
                  (item) => item.bookings.length >= item.capacity,
                ).length;
                return (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs text-earth-500">
                      <span>
                        每 60 秒自動更新
                        {lastUpdated
                          ? ` · 最後更新 ${lastUpdated.toLocaleTimeString("zh-TW", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-earth-700"
                        onClick={() => {
                          router.refresh();
                          setLastUpdated(new Date());
                        }}
                      >
                        立即更新
                      </button>
                    </div>
                    <div className="grid grid-cols-3 divide-x rounded-xl border border-primary-100 bg-primary-50/70 py-2 text-center">
                      <p>
                        <strong className="block text-base text-primary-800">
                          {daySessions.length}
                        </strong>
                        <span className="text-xs text-earth-600">堂課</span>
                      </p>
                      <p>
                        <strong className="block text-base text-primary-800">
                          {booked}/{capacity}
                        </strong>
                        <span className="text-xs text-earth-600">已預約／容量</span>
                      </p>
                      <p>
                        <strong className="block text-base text-primary-800">
                          {fullClasses}
                        </strong>
                        <span className="text-xs text-earth-600">堂已滿</span>
                      </p>
                    </div>
                    {(calendarDays[selectedDate]?.status === "closed" ||
                      calendarDays[selectedDate]?.status === "training") && (
                      <p className={`rounded-lg px-3 py-2 text-sm font-medium ${daySessions.length ? "border border-amber-200 bg-amber-50 text-amber-900" : "bg-earth-100 text-earth-700"}`}>
                        {daySessions.length
                          ? `${calendarDays[selectedDate]?.status === "training" ? "員工訓練日" : "公休日"}已有 ${daySessions.length} 堂既有課程；可查看與處理，但不可新增排課。`
                          : calendarDays[selectedDate]?.status === "training"
                            ? "員工訓練"
                            : "公休"}
                        {!daySessions.length && calendarDays[selectedDate]?.reason
                          ? ` · ${calendarDays[selectedDate].reason}`
                          : ""}
                      </p>
                    )}
                    {!daySessions.length && (
                      <p className="rounded-xl border border-dashed border-earth-200 p-8 text-center text-earth-500">
                        當日尚無課程
                      </p>
                    )}
                    {daySessions.map((session, index) => {
                      const isFull =
                        session.bookings.length >= session.capacity;
                      const sessionState = courseSessionStatus(session, nowIso);
                      const openSeats = Math.max(
                        0,
                        session.capacity - session.bookings.length,
                      );
                      return (
                        <article
                          key={session.id}
                          className={`rounded-xl border border-l-4 border-earth-200 bg-white px-3 py-2.5 ${sessionState.accentClass}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-800">
                              第 {index + 1} 堂
                            </span>
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <span className={`rounded-full px-2 py-1 text-xs font-medium ${sessionState.badgeClass}`}>{sessionState.label}</span>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-medium ${
                                isFull
                                  ? "bg-primary-100 text-primary-900"
                                  : "bg-earth-100 text-earth-700"
                              }`}
                              >
                                {isFull
                                  ? `已滿 ${session.bookings.length}/${session.capacity}`
                                  : `尚有 ${openSeats} 位 · ${session.bookings.length}/${session.capacity}`}
                              </span>
                            </div>
                          </div>
                          <h3 className="mt-2 flex flex-wrap items-baseline gap-x-2 font-semibold text-primary-900">
                            <span>
                              {formatTWDateTime(new Date(session.startsAt)).slice(11)}–
                              {formatTWDateTime(new Date(session.endsAt)).slice(0, 10) !==
                              selectedDate
                                ? "翌日 "
                                : ""}
                              {formatTWDateTime(new Date(session.endsAt)).slice(11)}
                            </span>
                            <span>{session.nameSnapshot}</span>
                          </h3>
                          <p className="mt-1 truncate text-sm text-earth-600">
                            {allCoaches.find((coach) => coach.id === session.coachId)
                              ?.displayName ?? "未指定教練"}
                            {" · "}
                            {allRooms.find((room) => room.id === session.roomId)?.name ??
                              "未指定教室"}
                            {" · "}
                            點數卡 {session.pointCost} 點／堂數卡 1 堂
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className={`${button} border-primary-300 bg-primary-50 text-primary-800`}
                              onClick={() =>
                                setCourseDialog({
                                  sessionId: session.id,
                                  kind: "roster",
                                })
                              }
                            >
                              上課名單 {session.bookings.length}
                            </button>
                            {canCreate && (
                              <>
                                <button
                                  type="button"
                                  className={button}
                                  onClick={() =>
                                    setCourseDialog({
                                      sessionId: session.id,
                                      kind: "member-booking",
                                    })
                                  }
                                >
                                  ＋ 學員預約
                                </button>
                                <button
                                  type="button"
                                  className={button}
                                  onClick={() =>
                                    setCourseDialog({
                                      sessionId: session.id,
                                      kind: "trial-booking",
                                    })
                                  }
                                >
                                  ＋ 體驗客
                                </button>
                              </>
                            )}
                            {(canCreate || canEdit) && (
                              <details className="relative ml-auto">
                                <summary className={`${button} cursor-pointer list-none`}>
                                  更多
                                </summary>
                                <div className="absolute right-0 z-10 mt-1 grid min-w-36 gap-1 rounded-xl border border-earth-200 bg-white p-2 shadow-lg">
                                  {canCreate && (
                                    <button
                                      type="button"
                                      className={button}
                                      disabled={pending}
                                      onClick={() => {
                                        setCopySource(session);
                                        setChosen(session.templateId);
                                        setRepeat(false);
                                        setRequestKey(crypto.randomUUID());
                                        open("schedule");
                                      }}
                                    >
                                      複製排課
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      className={button}
                                      disabled={pending}
                                      onClick={() => {
                                        setEditTemplateId(session.templateId);
                                        setEditing({
                                          kind: "session",
                                          value: session,
                                        });
                                        open("edit");
                                      }}
                                    >
                                      編輯排課
                                    </button>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </>
                );
              })()}
            <CourseConflicts items={conflicts}/>
            {panel === "catalog" && (
              <>
                {canCreate && (
                  <>
                    {view === "rooms" && (
                      <form
                        id="course-room-create-form"
                        onSubmit={(e) =>
                          submit(e, async (data) =>
                            createCourseRoom({
                              capacity: data.get("roomCapacity")
                                ? Number(data.get("roomCapacity"))
                                : null,
                              details: data.get("details") || "",
                              equipment:data.get("equipment") || "",location:data.get("location") || "",
                              name: data.get("name"),
                              category: data.get("category"),
                            }),
                          )
                        }
                        className="grid gap-3"
                      >
                        <label className="flex-1">
                          教室名稱
                          <input
                            className={field}
                            name="name"
                            required
                            maxLength={80}
                          />
                        </label>
                        <label className="col-span-full">
                          分類
                          <input
                            className={field}
                            name="category"
                            maxLength={40}
                            list="course-category-options"
                            placeholder="輸入或選擇分類"
                          />
                        </label>
                        <RoomMore />
                      </form>
                    )}
                    {view !== "rooms" && (
                      <form
                        id="course-template-create-form"
                        className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"
                        onSubmit={(e) =>
                          submit(e, (data) =>
                            createCourseTemplate({
                              name: data.get("name"),
                              category: data.get("category"),
                              defaultRoomId: data.get("roomId") || null,
                              description: data.get("description") || "",
                              precautions: data.get("precautions") || "",
                              classType:data.get("classType") || null,
                              durationMinutes: Number(data.get("duration")),
                              pointCost: Number(data.get("cost")),
                              capacity: Number(data.get("capacity")),
                            }),
                          )
                        }
                      >
                        <label className="col-span-full">
                          課程名稱
                          <input
                            className={field}
                            name="name"
                            required
                            maxLength={80}
                          />
                        </label>
                        <ClassType required/>
                        <label className="col-span-full">
                          分類
                          <input
                            className={field}
                            name="category"
                            maxLength={40}
                            list="course-category-options"
                            placeholder="輸入或選擇分類"
                          />
                        </label>
                        <label>
                          時長（分鐘）
                          <input
                            className={field}
                            name="duration"
                            type="number"
                            defaultValue={60}
                            min={1}
                            max={480}
                            required
                          />
                        </label>
                        <label>
                          點數卡每人扣點
                          <input
                            className={field}
                            name="cost"
                            type="number"
                            defaultValue={2}
                            min={1}
                            max={10000}
                            required
                          />
                          <span className="block text-sm text-earth-600">堂數卡每次固定扣 1 堂，依使用卡別扣抵。</span>
                        </label>
                        <label>
                          人數上限
                          <input
                            className={field}
                            name="capacity"
                            type="number"
                            defaultValue={10}
                            min={1}
                            max={500}
                            required
                          />
                        </label>
                        <label>
                          預設教室
                          <select className={field} name="roomId">
                            <option value="">不指定</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <DebitRule/><TemplateMore />
                      </form>
                    )}
                  </>
                )}
              </>
            )}
            {panel === "inspect" && editing && editing.kind !== "session" && <section className="space-y-3">
              <dl className="divide-y divide-earth-100">{[
                ["名稱",editing.value.name],["分類",editing.value.category || "未分類"],
                ["狀態",editing.kind === "room" ? (editing.value.isActive ? "啟用":"停用") : ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[editing.value.visibility ?? "PUBLIC"])],
                ...(editing.kind === "template" ? [["課型",editing.value.classType === "PRIVATE" ? "私課" : editing.value.classType === "GROUP" ? "團課":"待補設定"],["排課預設",`${editing.value.durationMinutes} 分鐘 · 上限 ${editing.value.capacity} 人`],["方案扣抵",`點數卡每人 ${editing.value.pointCost} 點；堂數卡每人 1 堂`],["預設教室",allRooms.find(r=>r.id===editing.value.defaultRoomId)?.name ?? "不指定"]] : [["容納人數",editing.value.capacity ?? "未設定"]]),
              ].map(([label,value])=><div key={String(label)} className="grid grid-cols-[7rem_1fr] gap-3 py-3"><dt className="text-earth-500">{label}</dt><dd>{value}</dd></div>)}</dl>
              {editing.kind === "template" && <DebitRule/>}
              <details><summary className="min-h-11 cursor-pointer py-3">{editing.kind === "template" ? "課程介紹與注意事項":"設備、位置與備註"}</summary>{(editing.kind === "template" ? [editing.value.description,editing.value.precautions]:[editing.value.equipment,editing.value.location,editing.value.details]).map((value,i)=><p key={i} className="whitespace-pre-wrap py-2">{value || "未填"}</p>)}</details>
            </section>}
            {panel === "edit" && editing && canEdit && (
              <form
                id="course-edit-form"
                key={`${editing.kind}-${editing.value.id}`}
                className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"
                onSubmit={(event) =>
                  submit(
                    event,
                    (data) => {
                      const common = {
                        id: editing.value.id,
                        name: data.get("name"),
                        category: data.get("category"),
                      };
                      if (editing.kind === "room")
                        return updateCourseRoom({
                          ...common,
                          capacity: data.get("roomCapacity")
                            ? Number(data.get("roomCapacity"))
                            : null,
                          details: data.get("details") || "",
                              equipment:data.get("equipment") || "",location:data.get("location") || "",
                        });
                      const details = {
                        durationMinutes: Number(data.get("duration")),
                        capacity: Number(data.get("capacity")),
                        pointCost: Number(data.get("cost")),
                      };
                      if (editing.kind === "template")
                        return (copyTemplate?createCourseTemplate:updateCourseTemplate)({
                          ...common,
                          ...details,
                          defaultRoomId: data.get("roomId") || null,
                          description: data.get("description") || "",
                          precautions: data.get("precautions") || "",
                              classType:data.get("classType") || null,
                        });
                      return (
                        data.get("scope") === "future"
                          ? updateCourseSeries
                          : updateCourseSession
                      )({
                        id: editing.value.id,
                        ...details,
                        templateId:data.get("templateId") || undefined,
                        nameSnapshot: data.get("name"),
                        date: data.get("date"),
                        time: data.get("time"),
                        roomId: data.get("roomId"),
                        coachId: data.get("coachId"),
                      });
                    },
                    (data) => {
                      if (editing.kind === "session")
                        go(String(data.get("date")));
                      setPanel(editing.kind === "session" ? "day" : null);
                      setEditing(null);
                    },
                  )
                }
              >
                <p className="col-span-full text-sm text-earth-600">
                  {editing.kind === "session"
                    ? "修改範圍可選這堂或同一批次的這堂及後續，撞期時整批不會儲存。"
                    : editing.kind === "template"
                      ? "修改後套用於新排課；已排課程請從日期內編輯。"
                      : "名稱會同步顯示於使用此教室的課程。"}
                </p>
                {editing.kind === "session" && editing.value.bookings.length > 0 && <div role="note" className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  本堂已有 {editing.value.bookings.length} 人次預約。修改日期、時間、教室或教練會影響這些學員；預約會保留，不會自動取消或退款。請先確認調整並通知受影響學員（本次儲存不自動發送通知）。
                  <p className="mt-1">已有預約不可更換課程或點數；已完成出席不可修改。選「這堂及後續」還會影響同批後續課次，儲存時逐堂檢查，有衝突整批不儲存。</p>
                </div>}
                {editing.kind==="session" && <label className="col-span-full">課程項目<select className={field} name="templateId" value={editTemplateId || editing.value.templateId} onChange={e=>setEditTemplateId(e.target.value)}>{allTemplates.filter(t=>t.isActive || t.id===editing.value.templateId).map(t=><option key={t.id} value={t.id}>{t.name}{t.visibility==="OFF"?"（下架：保留原課）":""}</option>)}</select></label>}
                <label className="col-span-full">
                  {editing.kind === "room" ? "教室名稱" : "課程名稱"}
                  <input
                    className={field}
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={
                      editing.kind === "session"
                        ? editing.value.nameSnapshot
                        : editing.value.name
                    }
                  />
                </label>
                {editing.kind === "template" && <ClassType value={editing.value.classType} required={copyTemplate}/>}
                {editing.kind !== "session" && (
                  <label className="col-span-full">
                    分類
                    <input
                      className={field}
                      name="category"
                      maxLength={40}
                      defaultValue={editing.value.category}
                      list="course-category-options"
                      placeholder="輸入或選擇分類"
                    />
                  </label>
                )}
                {editing.kind === "room" && (
                  <RoomMore
                    capacity={editing.value.capacity}
                    equipment={editing.value.equipment} location={editing.value.location}
                    details={editing.value.details}
                  />
                )}

                {editing.kind === "session" && (
                  <>
                    <label className="col-span-full">
                      修改範圍
                      <select className={field} name="scope">
                        <option value="single">僅這堂</option>
                        <option value="future">這堂及後續</option>
                      </select>
                    </label>
                    <label>
                      日期
                      <input
                        className={field}
                        name="date"
                        type="date"
                        required
                        defaultValue={toLocalDateStr(
                          new Date(editing.value.startsAt),
                        )}
                      />
                    </label>
                    <label>
                      開始時間
                      <input
                        className={field}
                        name="time"
                        type="time"
                        required
                        defaultValue={formatTWDateTime(
                          new Date(editing.value.startsAt),
                        ).slice(11)}
                      />
                    </label>
                    <DebitRule/>
                    <label className="col-span-full">
                      教練
                      <select
                        className={field}
                        name="coachId"
                        required
                        defaultValue={editing.value.coachId}
                      >
                        {allCoaches
                          .filter(
                            (c) =>
                              c.status !== "ACTIVE" &&
                              c.id === editing.value.coachId,
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id} disabled>
                              {c.displayName}（已停用，請另選教練）
                            </option>
                          ))}
                        {coaches.filter(c=>(c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(editTemplateId || editing.value.templateId)) || (c.id===editing.value.coachId && !c.courseQualificationsConfirmed && (!editTemplateId || editTemplateId===editing.value.templateId))).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {editing.kind !== "room" && (
                  <>
                    <label>
                      時長（分鐘）
                      <input
                        className={field}
                        name="duration"
                        type="number"
                        min={1}
                        max={480}
                        required
                        defaultValue={
                          editing.kind === "template"
                            ? editing.value.durationMinutes
                            : (new Date(editing.value.endsAt).getTime() -
                                new Date(editing.value.startsAt).getTime()) /
                              60000
                        }
                      />
                    </label>
                    <label>
                      人數上限
                      <input
                        className={field}
                        name="capacity"
                        type="number"
                        min={1}
                        max={500}
                        required
                        defaultValue={editing.value.capacity}
                      />
                    </label>
                    <label>
                      點數卡每人扣點
                      <input
                        className={field}
                        name="cost"
                        type="number"
                        min={1}
                        max={10000}
                        required
                        defaultValue={editing.value.pointCost}
                      />
                      <span className="block text-sm text-earth-600">堂數卡每次固定扣 1 堂，依使用卡別扣抵。</span>
                    </label>
                    <label>
                      {editing.kind === "template" ? "預設教室" : "教室"}
                      <select
                        className={field}
                        name="roomId"
                        required={editing.kind === "session"}
                        defaultValue={
                          editing.kind === "template"
                            ? (editing.value.defaultRoomId ?? "")
                            : editing.value.roomId
                        }
                      >
                        {editing.kind === "template" && (
                          <option value="">不指定</option>
                        )}
                        {allRooms
                          .filter(
                            (r) =>
                              !r.isActive &&
                              r.id ===
                                (editing.kind === "template"
                                  ? editing.value.defaultRoomId
                                  : editing.value.roomId),
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id} disabled>
                              {r.name}（已停用，請另選教室）
                            </option>
                          ))}
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {editing.kind !== "room" && <DebitRule/>}
                {editing.kind === "template" && (
                  <TemplateMore
                    description={editing.value.description}
                    precautions={editing.value.precautions}
                  />
                )}
              </form>
            )}
            {panel === "schedule" && (
              <>
                {!templates.length ? (
                  <>
                    <p>請先建立課程預設。</p>
                    <button
                      className={primary}
                      onClick={() => router.push(`${pathname}?view=catalog`)}
                    >
                      設定課程
                    </button>
                  </>
                ) : !coaches.length ? (
                  <p>本店尚無可排課的教練，請先完成人員建檔。</p>
                ) : !rooms.length ? (
                  <p>
                    目前沒有可使用的教室，請至左側「教室管理」新增或恢復使用後再排課。
                  </p>
                ) : (
                  <form
                    id="course-schedule-form"
                    onChange={(e) => {
                      const fields = new FormData(e.currentTarget);
                      const limit = rooms.find(
                        (r) => r.id === fields.get("roomId"),
                      )?.capacity;
                      setRoomCapacityNotice(
                        limit && Number(fields.get("capacity")) > limit
                          ? `人數上限超過教室容納 ${limit} 人，請確認容量`
                          : "",
                      );
                    }}
                    className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"
                    onSubmit={(e) =>
                      submit(
                        e,
                        (data) =>
                          createCourseSchedule({
                            templateId: chosen,
                            sourceSessionId: copySource?.id,
                            roomId: data.get("roomId"),
                            coachId: data.get("coachId"),
                            date: data.get("date"),
                            time: data.get("time"),
                            durationMinutes: Number(data.get("duration")),
                            capacity: Number(data.get("capacity")),
                            additionalDates: repeat
                              ? undefined
                              : data.getAll("additionalDates").map(String),
                            repeatUntil: repeat ? data.get("until") : undefined,
                            weekdays:
                              repeat && data.getAll("weekday").length
                                ? data.getAll("weekday").map(Number)
                                : undefined,
                            requestKey,
                          }),
                        (data) => {
                          go(String(data.get("date")));
                          setPanel("day");
                        },
                      )
                    }
                  >
                    {copySource ? (
                      <p className="col-span-full">
                        {copySource.nameSnapshot} · 點數卡每人 {copySource.pointCost} 點／堂數卡每人 1 堂<br />
                        選擇新日期並確認時間後建立，原課程會保留。
                      </p>
                    ) : (
                      <label className="col-span-full">
                        課程
                        <select
                          className={field}
                          aria-label="課程"
                          value={chosen}
                          onChange={(e) => setChosen(e.target.value)}
                          required
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} · 點數卡 {t.pointCost} 點；堂數卡 1 堂
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <DebitRule/>
                    <label className="col-span-full">
                      教練
                      <select
                        className={field}
                        name="coachId"
                        required
                        defaultValue={copySource?.coachId}
                      >
                        {coaches.filter(c=>c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(chosen)).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
                      {!coaches.some(c=>c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(chosen)) && <span className="block text-sm text-amber-800">本課程尚無具授課資格的啟用教練，請先至人員管理設定資格。<a className="block min-h-11 py-2 underline" href={pathname.replace(/\/courses$/, "/staff")} target="_blank" rel="noopener noreferrer">開啟人員管理（保留此排課草稿）</a><button type="button" className={button} onClick={()=>router.refresh()}>已設定，更新教練名單</button></span>}
                    </label>
                    <label>
                      日期
                      <input
                        className={field}
                        name="date"
                        type="date"
                        defaultValue={copySource ? "" : selectedDate}
                        required
                      />
                    </label>
                    <label>
                      開始時間
                      <input
                        className={field}
                        name="time"
                        type="time"
                        defaultValue={
                          copySource
                            ? formatTWDateTime(
                                new Date(copySource.startsAt),
                              ).slice(11)
                            : "18:00"
                        }
                        required
                      />
                    </label>
                    {rooms.length > 1 ? (
                      <label key={`room-${chosen}`}>
                        教室
                        <select
                          className={field}
                          name="roomId"
                          defaultValue={
                            copySource?.roomId ?? template?.defaultRoomId ?? ""
                          }
                          required
                        >
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="self-center"><span className="block text-sm">教室</span>
                        {rooms[0]?.name}
                        <input
                          type="hidden"
                          name="roomId"
                          value={rooms[0]?.id ?? ""}
                        />
                      </div>
                    )}
                    <label key={`capacity-${chosen}`}>
                      人數上限
                      <input
                        className={field}
                        name="capacity"
                        type="number"
                        defaultValue={
                          copySource?.capacity ?? template?.capacity
                        }
                        min={1}
                        max={500}
                        required
                      />
                    </label>
                    {roomCapacityNotice && (
                      <p
                        role="status"
                        className="col-span-full text-sm text-amber-700"
                      >
                        {roomCapacityNotice}
                      </p>
                    )}
                    <details className="col-span-full"><summary className="min-h-11 cursor-pointer py-3">調整本堂時長（預設 {copySource ? Math.round((new Date(copySource.endsAt).getTime()-new Date(copySource.startsAt).getTime())/60000) : template?.durationMinutes} 分鐘）</summary>
                    <label key={`duration-${chosen}`}>
                      時長（分鐘）
                      <input
                        className={field}
                        name="duration"
                        type="number"
                        defaultValue={
                          copySource
                            ? (new Date(copySource.endsAt).getTime() -
                                new Date(copySource.startsAt).getTime()) /
                              60000
                            : template?.durationMinutes
                        }
                        min={1}
                        max={480}
                        required
                      />
                    </label>
                    </details>
                    <label className="col-span-full">
                      重複
                      <select
                        className={field}
                        value={repeat ? "weekly" : "once"}
                        onChange={(e) => setRepeat(e.target.value === "weekly")}
                      >
                        <option value="once">僅此一堂</option>
                        <option value="weekly">每週重複</option>
                      </select>
                    </label>
                    {!repeat && (
                      <div className="col-span-full space-y-2">
                        {extraDateKeys.map((dateKey, index) => (
                          <div
                            key={dateKey}
                            className="flex items-center gap-2"
                          >
                            <label className="flex-1">
                              其他日期 {index + 1}
                              <input
                                className={field}
                                aria-label={`其他日期 ${index + 1}`}
                                type="date"
                                required
                                name="additionalDates"
                                defaultValue=""
                              />
                            </label>
                            <button
                              type="button"
                              className={button}
                              onClick={() => {
                                setExtraDateKeys((current) =>
                                  current.filter((_, i) => i !== index),
                                );
                              }}
                            >
                              移除
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className={button}
                          disabled={extraDateKeys.length >= 52}
                          onClick={() => {
                            setExtraDateKeys((current) => [
                              ...current,
                              crypto.randomUUID(),
                            ]);
                          }}
                        >
                          ＋ 加入排課日期
                        </button>
                        {extraDateKeys.length > 0 && (
                          <p className="text-sm text-earth-500">
                            以上日期使用相同時間、教練與教室；重複日期只建立一堂。如有撞期，整批不會建立。
                          </p>
                        )}
                      </div>
                    )}
                    {repeat && (
                      <fieldset className="col-span-full">
                        <legend>每週上課日（未選則依起始日）</legend>
                        <div className="flex flex-wrap gap-3">
                          {["日", "一", "二", "三", "四", "五", "六"].map(
                            (d, i) => (
                              <label
                                key={d}
                                className="flex min-h-11 items-center gap-1"
                              >
                                <input
                                  type="checkbox"
                                  name="weekday"
                                  value={i}
                                />
                                {d}
                              </label>
                            ),
                          )}
                        </div>
                      </fieldset>
                    )}
                    {repeat && (
                      <label className="col-span-full">
                        結束日期
                        <input
                          className={field}
                          type="date"
                          name="until"
                          required
                        />
                      </label>
                    )}
                    <p className="col-span-full text-sm text-earth-500">
                      按下確認後會自動檢查教練、教室、營業時間與撞期；若有衝突，整批不會建立。
                    </p>
                  </form>
                )}
              </>
            )}
          </div>
          {panel === "day" &&
            canCreate &&
            calendarDays[selectedDate]?.status !== "closed" &&
            calendarDays[selectedDate]?.status !== "training" && (
              <footer className="shrink-0 border-t border-earth-200 bg-white p-4">
                <button
                  type="button"
                  className={`${primary} w-full`}
                  onClick={openSchedule}
                  disabled={pending}
                >
                  ＋ 新增排課
                </button>
              </footer>
            )}
          {panel === "inspect" && canEdit && <footer className="shrink-0 border-t bg-white p-4"><button className={`${primary} w-full`} onClick={()=>open("edit")}>編輯{editing?.kind === "room" ? "教室":"課程"}</button></footer>}
          {panel === "schedule" && (
            <footer className="shrink-0 border-t bg-white p-4">
              <button
                form="course-schedule-form"
                type="submit"
                className={`${primary} w-full`}
                disabled={
                  pending
                }
              >
                {pending ? "建立中…" : "確認建立排課"}
              </button>
            </footer>
          )}
          {panel === "edit" && editing && (
            <footer className="flex shrink-0 gap-2 border-t bg-white p-4">
              <button
                className={button}
                disabled={pending}
                onClick={() => {
                  if (dirty && !window.confirm("尚有未儲存的修改，要放棄嗎？")) return;
                  open(editing.kind === "session" ? "day" : null);
                  setEditing(null);
                }}
              >
                取消修改
              </button>
              <button
                form="course-edit-form"
                type="submit"
                className={`${primary} flex-1`}
                disabled={pending}
              >
                {copyTemplate && editing.kind === "template" ? "建立課程" : "儲存修改"}
              </button>
            </footer>
          )}
          {panel === "catalog" && canCreate && (
            <div className="shrink-0 border-t border-earth-200 bg-white p-4">
              <button
                type="submit"
                form={
                  view === "rooms"
                    ? "course-room-create-form"
                    : "course-template-create-form"
                }
                className={`${primary} w-full`}
                disabled={pending}
              >
                {pending
                  ? "儲存中…"
                  : view === "rooms"
                    ? "建立教室"
                    : "建立課程"}
              </button>
            </div>
          )}
        </RightSheet>
      )}
      {courseDialog &&
        sessions.find((session) => session.id === courseDialog.sessionId) &&
        (() => {
          const dialogSession = sessions.find(
            (session) => session.id === courseDialog.sessionId,
          )!;
          const dialogTitle =
            courseDialog.kind === "roster"
              ? "上課名單"
              : courseDialog.kind === "member-booking"
                ? "＋ 學員預約"
                : "＋ 新顧客／體驗客";
          return (
            <RightSheet
              open
              onClose={() => setCourseDialog(null)}
              width={courseDialog.kind === "roster" ? 820 : 560}
              labelledById="course-operation-title"
            >
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-earth-200 bg-primary-50 px-4 py-3">
                <div className="min-w-0">
                  <h2
                    id="course-operation-title"
                    className="truncate text-lg font-semibold text-primary-900"
                  >
                    {dialogTitle}
                  </h2>
                  <p className="mt-1 text-sm text-earth-600">
                    {formatTWDateTime(new Date(dialogSession.startsAt))} ·{" "}
                    {dialogSession.nameSnapshot} ·{" "}
                    {allCoaches.find((coach) => coach.id === dialogSession.coachId)
                      ?.displayName ?? "未指定教練"}
                    {" · "}
                    {allRooms.find((room) => room.id === dialogSession.roomId)?.name ??
                      "未指定教室"}
                  </p>
                </div>
                <button
                  type="button"
                  className={button}
                  onClick={() => setCourseDialog(null)}
                >
                  關閉
                </button>
              </header>
              <div
                className={`min-h-0 flex-1 overscroll-contain p-3 sm:p-4 ${
                  courseDialog.kind === "roster"
                    ? "overflow-hidden"
                    : "overflow-y-auto"
                }`}
              >
                <CourseRoster
                  key={`${dialogSession.id}-${courseDialog.kind}`}
                  sessionId={dialogSession.id}
                  capacity={dialogSession.capacity}
                  canCreate={canCreate}
                  canEdit={canEdit}
                  view={courseDialog.kind}
                  onDone={() => setCourseDialog(null)}
                  onMemberBookingReadyChange={setMemberBookingReady}
                  onCreateCustomer={() =>
                    setCourseDialog({
                      sessionId: dialogSession.id,
                      kind: "trial-booking",
                    })
                  }
                />
              </div>
              {courseDialog.kind !== "roster" && (
                <footer className="shrink-0 border-t border-earth-200 bg-white px-4 py-3">
                  <button
                    type="submit"
                    form={
                      courseDialog.kind === "member-booking"
                        ? "course-member-booking-form"
                        : "course-trial-booking-form"
                    }
                    className={`${primary} w-full disabled:cursor-not-allowed disabled:bg-earth-200 disabled:text-earth-500`}
                    disabled={
                      courseDialog.kind === "member-booking" &&
                      !memberBookingReady
                    }
                  >
                    {courseDialog.kind === "member-booking"
                      ? "確認學員預約"
                      : "建立並加入課程"}
                  </button>
                </footer>
              )}
            </RightSheet>
          );
        })()}
    </>
  );
}

function RoomMore({
  capacity,
  details, equipment, location,
}: {
  capacity?: number | null;
  details?: string;
  equipment?:string;location?:string;visibility?:string;classType?:string|null;
}) {
  return (
    <>
      <label className="col-span-full">
        容納人數
        <input
          className={field}
          name="roomCapacity"
          type="number"
          min={1}
          max={500}
          defaultValue={capacity ?? ""}
        />
      </label>
      <details className="col-span-full">
        <summary className="min-h-11 cursor-pointer py-3">選填：設備、位置與備註</summary>
        <RoomFields equipment={equipment} location={location}/>
        <label>
          備註（保留原有內容）
          <textarea
            className={field}
            name="details"
            maxLength={5000}
            defaultValue={details}
          />
        </label>
      </details>
    </>
  );
}
function TemplateMore({
  description,
  precautions,
}: {
  description?: string;
  precautions?: string;
}) {
  return (
    <details className="col-span-full">
      <summary className="min-h-11 cursor-pointer py-3">選填：課程介紹與注意事項</summary>
      <label>
        課程介紹
        <textarea
          className={field}
          name="description"
          maxLength={5000}
          defaultValue={description}
        />
      </label>
      <label>
        注意事項
        <textarea
          className={field}
          name="precautions"
          maxLength={5000}
          defaultValue={precautions}
        />
      </label>
    </details>
  );
}

function ClassType({value,required=false}:{value?:string|null;required?:boolean}) {return <label className="col-span-full">課型{required ? "（必填）" : ""}<select className={field} name="classType" required={required} defaultValue={value ?? ""}><option value="">{required ? "請選擇課型" : "待補設定"}</option><option value="PRIVATE">私課</option><option value="GROUP">團課</option></select></label>;}
function RoomFields({equipment,location}:{equipment?:string;location?:string}) {return <><label className="block">設備<input className={field} name="equipment" defaultValue={equipment}/></label><label className="block">位置<input className={field} name="location" defaultValue={location}/></label></>;}

function DebitRule() {
  return <p className="col-span-full text-sm leading-relaxed text-earth-600">依使用卡別扣抵：點數卡每次扣課程設定點數；堂數卡每次固定扣 1 堂，不會同時扣兩種額度。須使用適用本課程的方案。預約先占用，出席才正式扣抵。</p>;
}
