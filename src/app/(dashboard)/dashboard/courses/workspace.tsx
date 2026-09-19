"use client";

import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CourseRoster } from "./roster";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  parseTaipeiDateTime,
  toLocalDateStr,
} from "@/lib/date-utils";
import {
  previewCourseSchedule,
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
  bookings: { customerId: string }[];
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
  rooms: Room[];
  templates: Template[];
  sessions: Session[];
  coaches: { id: string; displayName: string; status: string;courseCoachEnabled:boolean;courseQualificationsConfirmed:boolean;courseQualifiedTemplateIds:string[] }[];
  canCreate: boolean;
  canEdit: boolean;
  view: "schedule" | "catalog" | "rooms";
};
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} bg-primary-700 text-white`;
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";

export function CourseWorkspace({
  selectedDate: loadedDate,
  today,
  rooms: allRooms,
  templates: allTemplates,
  sessions,
  coaches: allCoaches,
  canCreate,
  canEdit,
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
  const [expandedSession, setExpandedSession] = useState<string | null>(params.get("session"));
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<
    "day" | "schedule" | "catalog" | "edit" | null
  >(canCreate && params.get("action") === "schedule" ? "schedule" : params.get("action") === "booking" || params.get("session") ? "day" : null);
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
  const [schedulePreview, setSchedulePreview] = useState<{
    dates: { startsAt: string; conflict: boolean }[];
    capacityWarning: string | null;
  } | null>(null);
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
  const byDate = new Map<string, Session[]>();
  for (const session of sessions.filter(
    (s) =>
      (roomFilter === "all" || s.roomId === roomFilter) &&
      (coachFilter === "all" || s.coachId === coachFilter) &&
      (category === "all" ||
        allTemplates.find((t) => t.id === s.templateId)?.category === category),
  )) {
    const day = toLocalDateStr(new Date(session.startsAt));
    byDate.set(day, [...(byDate.get(day) ?? []), session]);
  }
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
    setSchedulePreview(null);
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="mr-2 font-medium">
                {year} 年 {mon} 月
              </h2>
              <button
                className={button}
                disabled={pending}
                aria-label="上個月"
                onClick={() => go(addTaiwanDuration(first, -1, "MONTH"))}
              >
                ‹
              </button>
              <button
                className={button}
                disabled={pending}
                onClick={() => go(today)}
              >
                今天
              </button>
              <button
                className={button}
                disabled={pending}
                aria-label="下個月"
                onClick={() => go(addTaiwanDuration(first, 1, "MONTH"))}
              >
                ›
              </button>
            </div>
            {(canCreate || canEdit) && (
              <div className="flex gap-2">
                {canCreate && (
                  <button
                    className={primary}
                    disabled={pending}
                    onClick={openSchedule}
                  >
                    ＋ 排課
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="教練篩選"
              className={button}
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
            >
              <option value="all">全部教練</option>
              {allCoaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <select
              aria-label="教室篩選"
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
            <select
              aria-label="課程分類篩選"
              className={button}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">全部分類</option>
              {[...new Set(allTemplates.map((t) => t.category))].map((c) => (
                <option key={c} value={c}>
                  {c || "未分類"}
                </option>
              ))}
            </select>
          </div>
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
                  list = byDate.get(date) ?? [];
                return (
                  <button
                    key={date}
                    disabled={pending}
                    aria-label={`${date}，${list.length} 堂課`}
                    onClick={() => {
                      go(date);
                      open("day");
                    }}
                    className={`flex h-[clamp(68px,calc((100dvh-320px)/6),80px)] min-h-[68px] flex-col items-start justify-start border-t border-earth-100 px-2 py-1 text-left sm:px-3 ${date === selectedDate ? "bg-primary-50" : list.length ? "bg-white" : "bg-earth-50 text-earth-400"}`}
                  >
                    <span className="shrink-0 text-xs leading-4">{i + 1}</span>
                    {list.slice(0, 2).map((s) => (
                      <span
                        key={s.id}
                        className="block w-full shrink-0 truncate text-[10px] leading-[14px] sm:text-[11px]"
                      >
                        {formatTWDateTime(new Date(s.startsAt)).slice(11)}{" "}
                        {s.nameSnapshot}
                      </span>
                    ))}
                    {list.length > 2 && (
                      <span className="shrink-0 text-[10px] leading-[14px] sm:text-[11px]">
                        ＋{list.length - 2} 堂
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-earth-500">
            淡色：當日無課程，可選擇日期排課
          </p>
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
          {view==="catalog" && canEdit && selectedIds.length>0 && <form className="flex flex-wrap items-center gap-2" onSubmit={e=>submit(e,async d=>batchCourseTemplates({ids:selectedIds,...(d.get("batchCategory")!==""?{category:d.get("batchCategory")}:{}),...(d.get("batchVisibility")?{visibility:d.get("batchVisibility")}: {})}),()=>setSelectedIds([]))}>
            <span>已選 {selectedIds.length} 筆</span><input name="batchCategory" className={button} placeholder="調整分類"/><select name="batchVisibility" className={button}><option value="">狀態不變</option><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select><button className={button} disabled={pending}>套用至選取課程</button>
          </form>}
          <p className="text-sm text-earth-500">
            共 {filteredItems.length} 筆／全部 {catalogItems.length} 筆 ·
            隱藏僅供店長使用；下架／停用不供新增使用，既有紀錄保留。
          </p>
          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-earth-50 text-earth-600">
                <tr>
                  {(view === "rooms"
                    ? ["教室名稱", "分類", "容納人數", "狀態", "操作"]
                    : [
                        "課程名稱",
                        "分類",
                        "時長",
                        "每人點數",
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
              <tbody className="divide-y divide-earth-100">
                {filteredItems.map((item) => {
                  const template =
                    "durationMinutes" in item ? (item as Template) : null;
                  return (
                    <tr
                      key={item.id}
                      className={
                        item.isActive && (!template || template.visibility === "PUBLIC")
                          ? "hover:bg-primary-50/40"
                          : "bg-earth-50 opacity-60 hover:opacity-100 focus-within:opacity-100"
                      }
                    >
                      <th
                        scope="row"
                        className="max-w-64 px-4 py-3 font-medium text-primary-900"
                      >
                        {view === "catalog" && canEdit && <input aria-label={`選取 ${item.name}`} type="checkbox" className="mr-2" checked={selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>}{item.name}
                        {template && <span className="block text-xs text-earth-500">{template.classType==="PRIVATE"?"私課":template.classType==="GROUP"?"團課":"課型待補"}</span>}
                      </th>
                      <td className="px-4 py-3">{item.category || "未分類"}</td>
                      {template ? (
                        <>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {template.durationMinutes} 分
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {template.pointCost}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {template.capacity}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3 tabular-nums">
                          {item.capacity ?? "未設定"}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-xs ${item.isActive ? "bg-primary-50 text-primary-700" : "bg-earth-100 text-earth-500"}`}
                        >
                          {template ? ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[template.visibility ?? "PUBLIC"]) : item.isActive ? "啟用":"停用"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
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
                                  open("edit");
                                }}
                              >
                                編輯{template ? "課程" : "教室"}
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
        <RightSheet
          compact
          open
          onClose={closePanel}
          width={520}
          labelledById="course-panel-title"
        >
          <div
            className={
              view === "schedule"
                ? "flex shrink-0 items-center justify-between border-b border-earth-200 p-5"
                : "flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-3"
            }
          >
            <h2
              id="course-panel-title"
              className={
                view === "schedule"
                  ? "font-medium"
                  : "text-lg font-semibold text-primary-900"
              }
            >
              {panel === "edit"
                ? editing?.kind === "session"
                  ? "編輯單堂排課"
                  : editing?.kind === "room"
                    ? "編輯教室"
                    : "編輯課程預設"
                : panel === "catalog"
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
                ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
                : "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [&_label]:space-y-2 [&_label]:text-sm [&_label]:font-medium [&_label]:text-earth-700 [&_input]:min-h-11 [&_input]:rounded-xl [&_input]:px-3 [&_input]:font-normal [&_input]:outline-none [&_input:focus]:border-primary-500 [&_input:focus]:ring-2 [&_input:focus]:ring-primary-100 [&_select]:min-h-12 [&_select]:rounded-xl [&_select]:px-3 [&_select]:font-normal [&_form]:gap-3"
            }
          >
            {view !== "schedule" && panel === "catalog" && (
              <p className="rounded-xl border border-earth-200 bg-earth-50 p-4 text-sm leading-relaxed text-earth-600">
                {view === "rooms"
                  ? "為上課空間取一個容易辨識的名稱，例如：一樓教室、瑜珈教室。"
                  : "填寫課程的基本設定，之後排課會自動帶入，也能依每一堂課調整。"}
              </p>
            )}
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
            {panel === "day" && (
              <>
                <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">{(byDate.get(selectedDate) ?? []).length} 堂課 · 共 {new Set((byDate.get(selectedDate) ?? []).flatMap((s) => s.bookings.map((b) => b.customerId))).size} 人 · {(byDate.get(selectedDate) ?? []).reduce((n, s) => n + s.bookings.length, 0)} 人次</p>
                {canCreate && (
                  <button
                    className={primary}
                    onClick={openSchedule}
                    disabled={pending}
                  >
                    ＋ 排課
                  </button>
                )}
                {(byDate.get(selectedDate) ?? []).length === 0 && (
                  <p className="text-earth-500">當日尚無課程</p>
                )}
                {(byDate.get(selectedDate) ?? []).map((s) => (
                  <div key={s.id} className="border-b border-earth-100 py-3">
                    <h3 className="font-medium"><button className="min-h-11 text-left text-primary-800" aria-expanded={expandedSession === s.id} onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}>
                      {formatTWDateTime(new Date(s.startsAt)).slice(11)}–
                      {formatTWDateTime(new Date(s.endsAt)).slice(0, 10) !==
                      selectedDate
                        ? "翌日 "
                        : ""}
                      {formatTWDateTime(new Date(s.endsAt)).slice(11)}　
                      {s.nameSnapshot} · {s.bookings.length}／{s.capacity} 人 {expandedSession === s.id ? "▾" : "▸"}
                    </button></h3>
                    <p className="mt-1 text-sm text-earth-600">
                      {allCoaches.find((c) => c.id === s.coachId)
                        ?.displayName ?? "教練"}{" "}
                      ·{" "}
                      {allRooms.find((r) => r.id === s.roomId)?.name ?? "教室"}{" "}
                      · 每人 {s.pointCost} 點 · 上限 {s.capacity} 人
                    </p>
                    {canCreate && (
                      <button
                        className={`${button} mt-2 mr-2`}
                        disabled={pending}
                        onClick={() => {
                          setCopySource(s);
                          setChosen(s.templateId);
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
                        className={`${button} mt-2`}
                        disabled={pending}
                        onClick={() => {
                          setEditTemplateId(s.templateId);setEditing({ kind: "session", value: s });
                          open("edit");
                        }}
                      >
                        編輯排課
                      </button>
                    )}
                    {expandedSession === s.id && <CourseRoster
                      sessionId={s.id}
                      capacity={s.capacity}
                      canCreate={canCreate}
                      canEdit={canEdit}
                    />}
                  </div>
                ))}
              </>
            )}
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
                        <RoomFields/>
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
                        <ClassType/>
                        <label className="col-span-full">
                          課程名稱
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
                          每人點數
                          <input
                            className={field}
                            name="cost"
                            type="number"
                            defaultValue={2}
                            min={1}
                            max={10000}
                            required
                          />
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
                        <TemplateMore />
                      </form>
                    )}
                  </>
                )}
              </>
            )}
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
                {editing.kind==="template" && <ClassType value={editing.value.classType}/>}
                {editing.kind==="room" && <RoomFields equipment={editing.value.equipment} location={editing.value.location}/>}
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
                    details={editing.value.details}
                  />
                )}
                {editing.kind === "template" && (
                  <TemplateMore
                    description={editing.value.description}
                    precautions={editing.value.precautions}
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
                      每人點數
                      <input
                        className={field}
                        name="cost"
                        type="number"
                        min={1}
                        max={10000}
                        required
                        defaultValue={editing.value.pointCost}
                      />
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
                              {r.name}（已隱藏，請另選教室）
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
                      setSchedulePreview(null);
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
                        {copySource.nameSnapshot} · 每人 {copySource.pointCost}{" "}
                        點<br />
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
                              {t.name} · {t.pointCost} 點
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
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
                      {!coaches.some(c=>c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(chosen)) && <span className="block text-sm text-amber-800">本課程尚無具授課資格的啟用教練，請先至人員管理設定資格。</span>}
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
                      <div className="self-center">
                        {rooms[0]?.name}
                        <input
                          type="hidden"
                          name="roomId"
                          value={rooms[0]?.id ?? ""}
                        />
                      </div>
                    )}
                    {roomCapacityNotice && (
                      <p
                        role="status"
                        className="col-span-full text-sm text-amber-700"
                      >
                        {roomCapacityNotice}
                      </p>
                    )}
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
                                setSchedulePreview(null);
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
                            setSchedulePreview(null);
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
                    <button
                      type="button"
                      className={`${button} col-span-full`}
                      disabled={pending}
                      onClick={(event) => {
                        const form = event.currentTarget.form!;
                        if (!form.reportValidity()) return;
                        const data = new FormData(form);
                        startTransition(async () => {
                          const result = await previewCourseSchedule({
                            templateId: chosen,
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
                          });
                          if (result.success) {
                            setSchedulePreview(result.data);
                            setError("");
                          } else setError(result.error);
                        });
                      }}
                    >
                      預覽日期與衝突
                    </button>
                    {schedulePreview && (
                      <div className="col-span-full text-sm">
                        {schedulePreview.capacityWarning && (
                          <p className="text-amber-700">
                            {schedulePreview.capacityWarning}
                          </p>
                        )}
                        <ul>
                          {schedulePreview.dates.map((d) => (
                            <li
                              key={d.startsAt}
                              className={d.conflict ? "text-red-700" : ""}
                            >
                              {formatTWDateTime(new Date(d.startsAt))} ·{" "}
                              {d.conflict ? "撞期" : "可排課"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </form>
                )}
              </>
            )}
          </div>
          {panel === "schedule" && (
            <footer className="shrink-0 border-t bg-white p-4">
              <button
                form="course-schedule-form"
                type="submit"
                className={`${primary} w-full`}
                disabled={
                  pending ||
                  !schedulePreview ||
                  schedulePreview.dates.some((d) => d.conflict)
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
                儲存修改
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
    </>
  );
}

function RoomMore({
  capacity,
  details,
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
        <summary>更多資訊</summary>
        <label>
          設備、位置與備註
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
      <summary>更多內容</summary>
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

function ClassType({value}:{value?:string|null}) {return <label className="col-span-full">課型<select className={field} name="classType" defaultValue={value ?? ""}><option value="">待補設定</option><option value="PRIVATE">私課</option><option value="GROUP">團課</option></select></label>;}
function RoomFields({equipment,location}:{equipment?:string;location?:string}) {return <details className="col-span-full"><summary className="min-h-11 cursor-pointer py-3">設備／位置</summary><label className="block">設備<input className={field} name="equipment" defaultValue={equipment}/></label><label className="block">位置<input className={field} name="location" defaultValue={location}/></label></details>;}
