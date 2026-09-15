"use client";

import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import {
  createCourseRoom,
  createCourseTemplate,
  createCourseSchedule,
  updateCourseRoom,
  updateCourseTemplate,
  updateCourseSession,
} from "@/server/actions/course";

type IconProps = { size?: number; className?: string };
function makeIcon(path: string) {
  return function CourseIcon({ size = 20, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    );
  };
}
const BookOpen = makeIcon(
  "M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-2-1-6-2-10 1",
);
const DoorOpen = makeIcon("M3 21h18M5 21V3h12v18M17 3l-8 3v15M13 12h.01");
const Search = makeIcon("M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0");
const Pencil = makeIcon("m15 5 4 4M3 21l5-1L21 7l-4-4L4 16z");
const Clock3 = makeIcon("M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0");
const Users = makeIcon(
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-4M17 3a4 4 0 0 1 0 8",
);
const Coins = makeIcon(
  "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M12 7v10M15 9h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9",
);
const Plus = makeIcon("M12 5v14M5 12h14");

type Room = { id: string; name: string };
type Template = Room & {
  durationMinutes: number;
  capacity: number;
  pointCost: number;
  defaultRoomId: string;
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
};
type Props = {
  selectedDate: string;
  today: string;
  rooms: Room[];
  templates: Template[];
  sessions: Session[];
  coaches: { id: string; displayName: string }[];
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
  selectedDate,
  today,
  rooms,
  templates,
  sessions,
  coaches,
  canCreate,
  canEdit,
  view,
}: Props) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<
    "day" | "schedule" | "catalog" | "edit" | null
  >(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState("");
  const [requestKey, setRequestKey] = useState("");
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
  for (const session of sessions) {
    const day = toLocalDateStr(new Date(session.startsAt));
    byDate.set(day, [...(byDate.get(day) ?? []), session]);
  }
  function go(date: string) {
    const next = new URLSearchParams(params.toString());
    next.set("date", date);
    startTransition(() =>
      router.replace(`${pathname}?${next}`, { scroll: false }),
    );
  }
  function open(next: typeof panel) {
    setPanel(next);
    setError("");
    setNotice("");
  }
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
    ) => Promise<{ success: boolean; error?: string; data?: unknown }>,
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
          setError(result.error ?? "儲存失敗，請重試");
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
      {view === "schedule" && (
        <>
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
                <button
                  className={button}
                  disabled={pending}
                  onClick={() => router.push(`${pathname}?view=catalog`)}
                >
                  課程設定
                </button>
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
          <div
            className="overflow-hidden rounded-lg border border-earth-200 bg-white"
            aria-busy={pending}
          >
            <div className="grid grid-cols-7">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <div
                  key={day}
                  className="py-3 text-center text-sm text-earth-600"
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
                    className={`flex h-[clamp(56px,calc((100dvh-320px)/6),80px)] min-h-14 flex-col items-start justify-start border-t border-earth-100 p-2 text-left sm:px-3 ${date === selectedDate ? "bg-primary-50" : list.length ? "bg-white" : "bg-earth-50 text-earth-400"}`}
                  >
                    <span>{i + 1}</span>
                    {list.length > 0 && (
                      <span className="mt-1 block text-xs sm:text-sm">
                        {list.length} 堂課
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
        </>
      )}
      {view !== "schedule" && (
        <section className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-earth-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                {view === "rooms" ? (
                  <DoorOpen size={23} />
                ) : (
                  <BookOpen size={23} />
                )}
              </div>
              <div>
                <p className="font-medium text-earth-900">
                  {view === "rooms" ? "上課空間" : "你的課程"}
                  <span className="ml-3 rounded-full bg-earth-100 px-2.5 py-1 text-xs text-earth-600">
                    {view === "rooms"
                      ? `${rooms.length} 間`
                      : `${templates.length} 種`}
                  </span>
                </p>
                <p className="mt-1.5 text-sm text-earth-500">
                  {view === "rooms"
                    ? "整理教室名稱，排課時快速選用。"
                    : "設定一次，每次排課都能直接帶入。"}
                </p>
              </div>
            </div>
            {canCreate && (
              <button
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-700 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-800 disabled:opacity-50"
                disabled={pending}
                onClick={() => open("catalog")}
              >
                <Plus size={17} />
                {view === "rooms" ? "新增教室" : "新增課程"}
              </button>
            )}
          </div>
          <div className="relative max-w-md">
            <Search
              aria-hidden="true"
              size={18}
              className="pointer-events-none absolute left-3.5 top-3.5 text-earth-400"
            />
            <input
              aria-label={view === "rooms" ? "搜尋教室" : "搜尋課程"}
              placeholder={view === "rooms" ? "搜尋教室名稱" : "搜尋課程名稱"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-earth-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {view === "catalog" &&
              templates
                .filter((t) =>
                  t.name
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
                )
                .map((t) => (
                  <article
                    key={t.id}
                    className="overflow-hidden rounded-2xl border border-earth-200 bg-white shadow-sm transition hover:border-primary-200"
                  >
                    <div className="p-5 sm:p-6">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <h3 className="min-w-0 break-words text-lg font-semibold leading-relaxed text-primary-900">
                          {t.name}
                        </h3>
                        <BookOpen
                          aria-hidden="true"
                          size={20}
                          className="mt-1 shrink-0 text-earth-400"
                        />
                      </div>
                      <dl className="grid grid-cols-3 divide-x divide-earth-200 rounded-xl bg-earth-50 py-4">
                        {[
                          {
                            label: "課程時長",
                            value: t.durationMinutes,
                            unit: "分鐘",
                            Icon: Clock3,
                          },
                          {
                            label: "每人點數",
                            value: t.pointCost,
                            unit: "點",
                            Icon: Coins,
                          },
                          {
                            label: "人數上限",
                            value: t.capacity,
                            unit: "人",
                            Icon: Users,
                          },
                        ].map(({ label, value, unit, Icon }) => (
                          <div key={label} className="px-2 text-center">
                            <dt className="flex items-center justify-center gap-1.5 text-xs text-earth-500">
                              <Icon size={13} aria-hidden="true" />
                              {label}
                            </dt>
                            <dd className="mt-2 text-xl font-semibold tabular-nums text-earth-900">
                              {value}
                              <span className="ml-1 text-xs font-normal text-earth-500">
                                {unit}
                              </span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-earth-100 px-5 py-3 sm:px-6">
                      <p className="flex min-w-0 items-center gap-2 text-sm text-earth-600">
                        <DoorOpen
                          size={15}
                          className="shrink-0 text-earth-400"
                        />
                        <span className="break-words">
                          <span className="mr-2 text-earth-400">預設</span>
                          {rooms.find((r) => r.id === t.defaultRoomId)?.name ??
                            "尚未指定教室"}
                        </span>
                      </p>
                      {canEdit && (
                        <button
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary-700 transition hover:bg-primary-50 disabled:opacity-50"
                          disabled={pending}
                          onClick={() => {
                            setEditing({ kind: "template", value: t });
                            open("edit");
                          }}
                        >
                          <Pencil size={14} />
                          編輯課程
                        </button>
                      )}
                    </div>
                  </article>
                ))}
            {view === "rooms" &&
              rooms
                .filter((r) =>
                  r.name
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
                )
                .map((r) => {
                  const linked = templates.filter(
                    (t) => t.defaultRoomId === r.id,
                  );
                  return (
                    <article
                      key={r.id}
                      className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm sm:p-6"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-earth-200 bg-earth-50 text-primary-700">
                          <DoorOpen size={23} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-lg font-semibold text-primary-900">
                            {r.name}
                          </h3>
                          <p className="mt-1 text-sm text-earth-500">
                            {linked.length
                              ? `${linked.length} 種課程設為預設教室`
                              : "可於排課時選用"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 flex min-h-16 flex-wrap content-start gap-2">
                        {linked.length ? (
                          linked.map((t) => (
                            <span
                              key={t.id}
                              className="max-w-full break-words rounded-lg bg-primary-50 px-3 py-1.5 text-xs text-primary-700"
                            >
                              {t.name}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-earth-400">
                            尚無課程使用此預設教室
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex justify-end border-t border-earth-100 pt-3">
                        {canEdit && (
                          <button
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary-700 transition hover:bg-primary-50 disabled:opacity-50"
                            disabled={pending}
                            onClick={() => {
                              setEditing({ kind: "room", value: r });
                              open("edit");
                            }}
                          >
                            <Pencil size={14} />
                            編輯教室
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
          </div>
          {(view === "rooms" ? rooms : templates).filter((item) =>
            item.name
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          ).length === 0 && (
            <div className="rounded-2xl border border-dashed border-earth-300 bg-white px-6 py-12 text-center">
              <p className="font-medium text-earth-700">
                {query.trim()
                  ? "找不到符合的結果"
                  : view === "rooms"
                    ? "建立第一間教室"
                    : "建立第一種課程"}
              </p>
              <p className="mt-2 text-sm text-earth-500">
                {query.trim()
                  ? "試試其他名稱，或清除搜尋。"
                  : "使用上方新增按鈕開始設定。"}
              </p>
            </div>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-700"
            >
              {notice}
            </p>
          )}
        </section>
      )}
      {panel && (
        <RightSheet
          open
          onClose={() => {
            if (!pending) setPanel(null);
          }}
          width={520}
          labelledById="course-panel-title"
        >
          <div
            className={
              view === "schedule"
                ? "flex shrink-0 items-center justify-between border-b border-earth-200 p-5"
                : "flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-6 py-6"
            }
          >
            <h2
              id="course-panel-title"
              className={
                view === "schedule"
                  ? "font-medium"
                  : "text-xl font-semibold text-primary-900"
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
                onClick={() => setPanel(null)}
              >
                關閉
              </button>
            }
          </div>
          <div
            className={
              view === "schedule"
                ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
                : "min-h-0 flex-1 space-y-6 overflow-y-auto p-6 [&_label]:space-y-2 [&_label]:text-sm [&_label]:font-medium [&_label]:text-earth-700 [&_input]:min-h-12 [&_input]:rounded-xl [&_input]:px-3 [&_input]:font-normal [&_input]:outline-none [&_input:focus]:border-primary-500 [&_input:focus]:ring-2 [&_input:focus]:ring-primary-100 [&_select]:min-h-12 [&_select]:rounded-xl [&_select]:px-3 [&_select]:font-normal [&_form]:gap-5"
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
                    <h3 className="font-medium">
                      {formatTWDateTime(new Date(s.startsAt)).slice(11)}–
                      {formatTWDateTime(new Date(s.endsAt)).slice(0, 10) !==
                      selectedDate
                        ? "翌日 "
                        : ""}
                      {formatTWDateTime(new Date(s.endsAt)).slice(11)}　
                      {s.nameSnapshot}
                    </h3>
                    <p className="mt-1 text-sm text-earth-600">
                      {coaches.find((c) => c.id === s.coachId)?.displayName ??
                        "教練"}{" "}
                      · {rooms.find((r) => r.id === s.roomId)?.name ?? "教室"} ·
                      每人 {s.pointCost} 點 · 上限 {s.capacity} 人
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
                          setEditing({ kind: "session", value: s });
                          open("edit");
                        }}
                      >
                        編輯排課
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
            {panel === "catalog" && (
              <>
                {canCreate && (
                  <>
                    {view === "rooms" && (
                      <form
                        id="course-room-create-form"
                        onSubmit={(e) =>
                          submit(e, async (data) =>
                            createCourseRoom(data.get("name")),
                          )
                        }
                        className="flex items-end gap-2"
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
                              defaultRoomId: data.get("roomId"),
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
                          <select className={field} name="roomId" required>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </form>
                    )}
                  </>
                )}
              </>
            )}
            {panel === "edit" && editing && canEdit && (
              <form
                key={`${editing.kind}-${editing.value.id}`}
                className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"
                onSubmit={(event) =>
                  submit(
                    event,
                    (data) => {
                      const common = {
                        id: editing.value.id,
                        name: data.get("name"),
                      };
                      if (editing.kind === "room")
                        return updateCourseRoom(common);
                      const details = {
                        durationMinutes: Number(data.get("duration")),
                        capacity: Number(data.get("capacity")),
                        pointCost: Number(data.get("cost")),
                      };
                      if (editing.kind === "template")
                        return updateCourseTemplate({
                          ...common,
                          ...details,
                          defaultRoomId: data.get("roomId"),
                        });
                      return updateCourseSession({
                        id: editing.value.id,
                        ...details,
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
                    ? "僅修改這一堂，其他日期的排課維持原設定。"
                    : editing.kind === "template"
                      ? "修改後套用於新排課；已排課程請從日期內編輯。"
                      : "名稱會同步顯示於使用此教室的課程。"}
                </p>
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
                {editing.kind === "session" && (
                  <>
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
                        {coaches.map((c) => (
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
                        required
                        defaultValue={
                          editing.kind === "template"
                            ? editing.value.defaultRoomId
                            : editing.value.roomId
                        }
                      >
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <div className="sticky bottom-0 col-span-full flex gap-2 bg-white py-3">
                  <button
                    className={button}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      open(editing.kind === "session" ? "day" : null);
                      setEditing(null);
                    }}
                  >
                    取消修改
                  </button>
                  <button className={`${primary} flex-1`} disabled={pending}>
                    {pending ? "儲存中…" : "儲存修改"}
                  </button>
                </div>
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
                ) : (
                  <form
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
                            repeatUntil: repeat ? data.get("until") : undefined,
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
                        {coaches.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
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
                            copySource?.roomId ?? template?.defaultRoomId
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
                      className={`${primary} col-span-full`}
                      disabled={pending}
                    >
                      {pending ? "建立中…" : "建立排課"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
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
                disabled={pending || (view !== "rooms" && !rooms.length)}
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
