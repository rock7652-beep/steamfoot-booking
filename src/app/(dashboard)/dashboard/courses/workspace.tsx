"use client";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";

import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CourseRoster } from "./roster";
import { CourseTrialQuickModal } from "./course-trial-quick-modal";
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
  canDelete?: boolean;
  canEdit: boolean;
  view: "schedule" | "catalog" | "rooms";
};
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} bg-primary-700 text-white`;
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";

export function CourseWorkspace({
  canDelete=false,
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
  const [rosterSessionId, setRosterSessionId] = useState<string | null>(null);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<
    "day" | "schedule" | "catalog" | "edit" | "inspect" | null
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
    setError("");
    setNotice("");
  }
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
                    ＋ 新增課程
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form className="flex items-end gap-2" onSubmit={event => {
              event.preventDefault();
              const date = String(new FormData(event.currentTarget).get("jumpDate"));
              if (parseTaipeiDateTime(date, "00:00")) go(date);
            }}>
              <label className="text-sm text-earth-700">日期（台灣時間）
                <input key={selectedDate} name="jumpDate" aria-label="課表日期" type="date" required defaultValue={selectedDate} className={field}/>
              </label>
              <button className={button} disabled={pending}>前往</button>
            </form>
            <label className="text-sm text-earth-700">教練
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
            </select></label>
            <label className="text-sm text-earth-700">教室
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
            </select></label>
            <label className="text-sm text-earth-700">分類
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
            </select></label>
          </div>
          <div
            className="min-h-[360px] overflow-hidden rounded-lg border border-earth-200 bg-white sm:h-[clamp(430px,58dvh,650px)]"
            aria-busy={pending}
          >
            <div className="grid h-full grid-cols-7 auto-rows-fr">
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
                    className={`flex min-w-0 min-h-12 flex-col items-start justify-start border-t border-earth-100 px-1 py-1 text-left sm:min-h-0 sm:px-2 ${date === selectedDate ? "bg-primary-50" : list.length ? "bg-white" : "bg-earth-50 text-earth-400"}`}
                  >
                    <span className="shrink-0 text-xs leading-4">{i + 1}</span>
                    {list.length > 0 && <span className="mt-1 text-xs font-medium sm:hidden">{list.length} 堂</span>}
                    {list.slice(0, 2).map((s) => (
                      <span
                        key={s.id}
                        className="hidden w-full shrink-0 truncate leading-[14px] sm:block sm:text-[11px]"
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
        <RightSheet
          compact
          open
          onClose={closePanel}
          width={view === "schedule" && panel !== "day" ? 720 : 520}
          variant={view === "schedule" && panel !== "day" ? "modal" : "right"}
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
                  ? "編輯課程"
                  : editing?.kind === "room"
                    ? "編輯教室"
                    : copyTemplate ? "複製課程" : "編輯課程"
                : panel === "inspect" ? (editing?.kind === "room" ? "查看教室" : "查看課程") : panel === "catalog"
                  ? view === "rooms"
                    ? "新增教室"
                    : "新增課程"
                  : panel === "schedule"
                    ? copySource
                      ? "複製課程"
                      : "新增課程"
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
                : "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [&_label]:space-y-1 [&_label]:text-sm [&_label]:font-medium [&_label]:text-earth-700 [&_input]:min-h-11 [&_input]:rounded-xl [&_input]:px-3 [&_input]:font-normal [&_input]:outline-none [&_input:focus]:border-primary-500 [&_input:focus]:ring-2 [&_input:focus]:ring-primary-100 [&_select]:min-h-11 [&_select]:rounded-xl [&_select]:px-3 [&_select]:font-normal [&_form]:gap-3"
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
            {panel === "day" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-2">
                  <p className="text-sm text-primary-800">
                    {(byDate.get(selectedDate) ?? []).length} 堂課 · 共 {new Set((byDate.get(selectedDate) ?? []).flatMap((s) => s.bookings.map((b) => b.customerId))).size} 人 · {(byDate.get(selectedDate) ?? []).reduce((n, s) => n + s.bookings.length, 0)} 人次
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canCreate && (
                      <button className={primary} onClick={openSchedule} disabled={pending}>
                        ＋ 新增課程
                      </button>
                    )}
                    {canCreate && (
                      <button
                        className={button}
                        onClick={() => setTrialModalOpen(true)}
                        disabled={pending || (byDate.get(selectedDate) ?? []).length === 0}
                      >
                        ＋ 體驗客
                      </button>
                    )}
                  </div>
                </div>
                {(byDate.get(selectedDate) ?? []).length === 0 && (
                  <p className="py-8 text-center text-earth-500">當日尚無課程</p>
                )}
                <div className="space-y-2">
                  {(byDate.get(selectedDate) ?? []).map((s, index) => (
                    <article key={s.id} className="rounded-xl border border-earth-200 bg-white p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-earth-500">當日第 {index + 1} 堂</p>
                        <h3 className="mt-1 font-medium text-primary-900">
                          {formatTWDateTime(new Date(s.startsAt)).slice(11)}–
                          {formatTWDateTime(new Date(s.endsAt)).slice(0, 10) !== selectedDate ? "翌日 " : ""}
                          {formatTWDateTime(new Date(s.endsAt)).slice(11)}　{s.nameSnapshot}
                        </h3>
                        <p className="mt-1 text-sm text-earth-600">
                          {allCoaches.find((c) => c.id === s.coachId)?.displayName ?? "教練"} · {allRooms.find((r) => r.id === s.roomId)?.name ?? "教室"} · {s.bookings.length}/{s.capacity} 人
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className={button} disabled={pending} onClick={() => setRosterSessionId(s.id)}>
                          上課名單 {s.bookings.length}
                        </button>
                        {canEdit && (
                          <button
                            className={button}
                            disabled={pending}
                            onClick={() => {
                              setEditing({ kind: "session", value: s });
                              open("edit");
                            }}
                          >
                            編輯課程
                          </button>
                        )}
                        {canCreate && (
                          <button
                            className={button}
                            disabled={pending}
                            onClick={() => {
                              setCopySource(s);
                              setChosen(s.templateId);
                              setRepeat(false);
                              setRequestKey(crypto.randomUUID());
                              open("schedule");
                            }}
                          >
                            複製課程
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
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
                    ? "只調整這堂課需要變更的內容；其他設定會沿用原課程。"
                    : editing.kind === "template"
                      ? "修改後套用於之後新增的課程；已建立的課程請從課表內編輯。"
                      : "名稱會同步顯示於使用此教室的課程。"}
                </p>
                {editing.kind === "session" && editing.value.bookings.length > 0 && (
                  <p role="note" className="col-span-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    本堂已有 {editing.value.bookings.length} 人預約；修改日期、時間、教練或教室後，預約會保留。
                  </p>
                )}
                {editing.kind === "session" ? (
                  <>
                    <div className="col-span-full rounded-xl border border-earth-200 bg-earth-50 px-3 py-2">
                      <span className="text-xs text-earth-500">課程</span>
                      <p className="font-medium text-primary-900">{editing.value.nameSnapshot}</p>
                    </div>
                    <input type="hidden" name="templateId" value={editing.value.templateId} />
                    <input type="hidden" name="name" value={editing.value.nameSnapshot} />
                  </>
                ) : (
                  <label className="col-span-full">
                    {editing.kind === "room" ? "教室名稱" : "課程名稱"}
                    <input
                      className={field}
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={editing.value.name}
                    />
                  </label>
                )}
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
                    <label>
                      日期
                      <input
                        className={field}
                        name="date"
                        type="date"
                        required
                        defaultValue={toLocalDateStr(new Date(editing.value.startsAt))}
                      />
                    </label>
                    <label>
                      開始時間
                      <input
                        className={field}
                        name="time"
                        type="time"
                        required
                        defaultValue={formatTWDateTime(new Date(editing.value.startsAt)).slice(11)}
                      />
                    </label>
                    <label>
                      教練
                      <select
                        className={field}
                        name="coachId"
                        required
                        defaultValue={editing.value.coachId}
                      >
                        {allCoaches
                          .filter(
                            (coach) =>
                              (coach.status === "ACTIVE" &&
                                coach.courseCoachEnabled &&
                                coach.courseQualificationsConfirmed &&
                                coach.courseQualifiedTemplateIds.includes(editing.value.templateId)) ||
                              coach.id === editing.value.coachId,
                          )
                          .map((coach) => (
                            <option
                              key={coach.id}
                              value={coach.id}
                              disabled={coach.status !== "ACTIVE"}
                            >
                              {coach.displayName}{coach.status !== "ACTIVE" ? "（已停用）" : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      教室
                      <select
                        className={field}
                        name="roomId"
                        required
                        defaultValue={editing.value.roomId}
                      >
                        {allRooms
                          .filter((room) => room.isActive || room.id === editing.value.roomId)
                          .map((room) => (
                            <option
                              key={room.id}
                              value={room.id}
                              disabled={!room.isActive}
                            >
                              {room.name}{!room.isActive ? "（已停用）" : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      人數上限
                      <input
                        className={field}
                        name="capacity"
                        type="number"
                        min={Math.max(1, editing.value.bookings.length)}
                        max={500}
                        required
                        defaultValue={editing.value.capacity}
                      />
                    </label>
                    <label>
                      套用範圍
                      <select className={field} name="scope" defaultValue="single">
                        <option value="single">只改這堂</option>
                        <option value="future">這堂及後續</option>
                      </select>
                    </label>
                    <input
                      type="hidden"
                      name="duration"
                      value={Math.max(
                        1,
                        Math.round(
                          (new Date(editing.value.endsAt).getTime() -
                            new Date(editing.value.startsAt).getTime()) /
                            60000,
                        ),
                      )}
                    />
                    <input type="hidden" name="cost" value={editing.value.pointCost} />
                  </>
                )}
                {editing.kind === "template" && (
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
                      預設教室
                      <select
                        className={field}
                        name="roomId"
                        defaultValue={editing.value.defaultRoomId ?? ""}
                      >
                        <option value="">不指定</option>
                        {allRooms
                          .filter(
                            (r) =>
                              !r.isActive &&
                              r.id === editing.value.defaultRoomId,
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
                {editing.kind === "template" && <DebitRule/>}
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
                    <p>請先建立課程設定。</p>
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
                  <p>目前沒有可使用的教室，請先到「教室管理」新增或恢復使用。</p>
                ) : (
                  <form
                    id="course-schedule-form"
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
                            additionalDates: !copySource && !repeat
                              ? data.getAll("additionalDates").map(String)
                              : undefined,
                            repeatUntil: !copySource && repeat
                              ? data.get("until")
                              : undefined,
                            weekdays:
                              !copySource && repeat && data.getAll("weekday").length
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
                      <>
                        <div className="col-span-full rounded-xl border border-earth-200 bg-earth-50 p-3">
                          <p className="font-medium text-primary-900">{copySource.nameSnapshot}</p>
                          <p className="mt-1 text-sm text-earth-600">
                            {allCoaches.find((coach) => coach.id === copySource.coachId)?.displayName ?? "教練"} ·
                            {" "}{allRooms.find((room) => room.id === copySource.roomId)?.name ?? "教室"} ·
                            {" "}上限 {copySource.capacity} 人 ·
                            {" "}{Math.round((new Date(copySource.endsAt).getTime() - new Date(copySource.startsAt).getTime()) / 60000)} 分鐘
                          </p>
                          <p className="mt-1 text-xs text-earth-500">只需選新日期與時間，其餘設定全部沿用。</p>
                        </div>
                        <input type="hidden" name="coachId" value={copySource.coachId} />
                        <input type="hidden" name="roomId" value={copySource.roomId} />
                        <input type="hidden" name="capacity" value={copySource.capacity} />
                        <input
                          type="hidden"
                          name="duration"
                          value={Math.max(
                            1,
                            Math.round(
                              (new Date(copySource.endsAt).getTime() -
                                new Date(copySource.startsAt).getTime()) /
                                60000,
                            ),
                          )}
                        />
                      </>
                    ) : (
                      <>
                        <label className="col-span-full">
                          課程
                          <select
                            className={field}
                            aria-label="課程"
                            value={chosen}
                            onChange={(e) => setChosen(e.target.value)}
                            required
                          >
                            {templates.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="col-span-full">
                          教練
                          <select className={field} name="coachId" required>
                            {coaches
                              .filter(
                                (coach) =>
                                  coach.courseQualificationsConfirmed &&
                                  coach.courseQualifiedTemplateIds.includes(chosen),
                              )
                              .map((coach) => (
                                <option key={coach.id} value={coach.id}>
                                  {coach.displayName}
                                </option>
                              ))}
                          </select>
                          {!coaches.some(
                            (coach) =>
                              coach.courseQualificationsConfirmed &&
                              coach.courseQualifiedTemplateIds.includes(chosen),
                          ) && (
                            <span className="mt-1 block text-sm text-amber-800">
                              這門課尚未設定可授課教練，請先到人員管理設定。
                            </span>
                          )}
                        </label>
                      </>
                    )}

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
                            ? formatTWDateTime(new Date(copySource.startsAt)).slice(11)
                            : "18:00"
                        }
                        required
                      />
                    </label>

                    {!copySource && (
                      <>
                        {rooms.length > 1 ? (
                          <label>
                            教室
                            <select
                              className={field}
                              name="roomId"
                              defaultValue={template?.defaultRoomId ?? rooms[0]?.id ?? ""}
                              required
                            >
                              {rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <div className="self-end rounded-lg border border-earth-200 bg-earth-50 px-3 py-2">
                            <span className="block text-xs text-earth-500">教室</span>
                            <span>{rooms[0]?.name}</span>
                            <input type="hidden" name="roomId" value={rooms[0]?.id ?? ""} />
                          </div>
                        )}
                        <label>
                          人數上限
                          <input
                            className={field}
                            name="capacity"
                            type="number"
                            defaultValue={template?.capacity}
                            min={1}
                            max={500}
                            required
                          />
                        </label>
                        <details className="col-span-full rounded-xl border border-earth-200 px-3">
                          <summary className="min-h-11 cursor-pointer py-3 font-medium">
                            更多排程選項
                          </summary>
                          <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2">
                            <label>
                              本堂時長（分鐘）
                              <input
                                className={field}
                                name="duration"
                                type="number"
                                defaultValue={template?.durationMinutes}
                                min={1}
                                max={480}
                                required
                              />
                            </label>
                            <label>
                              建立方式
                              <select
                                className={field}
                                value={repeat ? "weekly" : "once"}
                                onChange={(e) => setRepeat(e.target.value === "weekly")}
                              >
                                <option value="once">單次課程</option>
                                <option value="weekly">每週重複</option>
                              </select>
                            </label>

                            {!repeat && (
                              <div className="col-span-full space-y-2">
                                {extraDateKeys.map((dateKey, index) => (
                                  <div key={dateKey} className="flex items-end gap-2">
                                    <label className="flex-1">
                                      其他日期 {index + 1}
                                      <input
                                        className={field}
                                        aria-label={`其他日期 ${index + 1}`}
                                        type="date"
                                        required
                                        name="additionalDates"
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={button}
                                      onClick={() =>
                                        setExtraDateKeys((current) =>
                                          current.filter((_, itemIndex) => itemIndex !== index),
                                        )
                                      }
                                    >
                                      移除
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className={button}
                                  disabled={extraDateKeys.length >= 52}
                                  onClick={() =>
                                    setExtraDateKeys((current) => [
                                      ...current,
                                      crypto.randomUUID(),
                                    ])
                                  }
                                >
                                  ＋ 加其他日期
                                </button>
                              </div>
                            )}

                            {repeat && (
                              <>
                                <fieldset className="col-span-full">
                                  <legend className="mb-1 text-sm font-medium">每週上課日</legend>
                                  <div className="flex flex-wrap gap-3">
                                    {["日", "一", "二", "三", "四", "五", "六"].map(
                                      (day, index) => (
                                        <label
                                          key={day}
                                          className="flex min-h-11 items-center gap-1"
                                        >
                                          <input type="checkbox" name="weekday" value={index} />
                                          {day}
                                        </label>
                                      ),
                                    )}
                                  </div>
                                </fieldset>
                                <label className="col-span-full">
                                  結束日期
                                  <input className={field} type="date" name="until" required />
                                </label>
                              </>
                            )}
                          </div>
                        </details>
                      </>
                    )}
                  </form>
                )}
              </>
            )}
          </div>
          {panel === "inspect" && canEdit && <footer className="shrink-0 border-t bg-white p-4"><button className={`${primary} w-full`} onClick={()=>open("edit")}>編輯{editing?.kind === "room" ? "教室":"課程"}</button></footer>}
          {panel === "schedule" && (
            <footer className="shrink-0 border-t bg-white p-4">
              <button
                form="course-schedule-form"
                type="submit"
                className={`${primary} w-full`}
                disabled={pending}
              >
                {pending ? "處理中…" : copySource ? "確認複製課程" : "確認新增課程"}
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
      {rosterSessionId && (() => {
        const rosterSession = sessions.find((session) => session.id === rosterSessionId);
        if (!rosterSession) return null;
        return (
          <RightSheet
            compact
            open
            variant="modal"
            width={980}
            onClose={() => setRosterSessionId(null)}
            labelledById="course-roster-modal-title"
          >
            <header className="flex items-center justify-between border-b border-earth-200 bg-primary-50/60 px-5 py-3">
              <div>
                <h2 id="course-roster-modal-title" className="font-semibold text-primary-900">上課名單</h2>
                <p className="mt-1 text-sm text-earth-600">
                  {formatTWDateTime(new Date(rosterSession.startsAt)).slice(0,16)} · {rosterSession.nameSnapshot}
                </p>
              </div>
              <button className={button} onClick={() => setRosterSessionId(null)}>關閉</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <CourseRoster
                sessionId={rosterSession.id}
                capacity={rosterSession.capacity}
                canCreate={canCreate}
                canEdit={canEdit}
                compactOnly
              />
            </div>
          </RightSheet>
        );
      })()}
      <CourseTrialQuickModal
        open={trialModalOpen}
        sessions={(byDate.get(selectedDate) ?? []).map((session) => ({
          id: session.id,
          nameSnapshot: session.nameSnapshot,
          startsAt: session.startsAt,
        }))}
        onClose={() => setTrialModalOpen(false)}
      />
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
