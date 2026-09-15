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

type Room = { id: string; name: string };
type Template = Room & {
  durationMinutes: number;
  capacity: number;
  pointCost: number;
  defaultRoomId: string;
};
type Session = {
  id: string;
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
}: Props) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<
    "day" | "schedule" | "catalog" | "edit" | null
  >(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
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
  function openSchedule() {
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
        router.refresh();
      } catch {
        setError("連線失敗，請重試；重複送出不會重複排課。");
      }
    });
  }
  const template = templates.find((t) => t.id === chosen);
  return (
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
              onClick={() => open("catalog")}
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
            <div key={day} className="py-3 text-center text-sm text-earth-600">
              {day}
            </div>
          ))}
          {Array.from({ length: parseLocalDate(first).getDay() }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
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
                className={`min-h-24 border-t border-earth-100 p-2 text-left align-top sm:min-h-28 sm:p-3 ${date === selectedDate ? "bg-primary-50" : list.length ? "bg-white" : "bg-earth-50 text-earth-400"}`}
              >
                <span>{i + 1}</span>
                {list.length > 0 && (
                  <span className="mt-3 block text-xs sm:text-sm">
                    {list.length} 堂課
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-sm text-earth-500">淡色：當日無課程，可選擇日期排課</p>
      <p role="status" aria-live="polite" className="text-sm text-primary-700">
        {pending ? "處理中…" : notice}
      </p>
      {panel && (
        <RightSheet
          open
          onClose={() => {
            if (!pending) setPanel(null);
          }}
          width={520}
          labelledById="course-panel-title"
        >
          <div className="flex items-center justify-between border-b border-earth-200 p-5">
            <h2 id="course-panel-title" className="font-medium">
              {panel === "edit"
                ? editing?.kind === "session"
                  ? "編輯單堂排課"
                  : editing?.kind === "room"
                    ? "編輯教室"
                    : "編輯課程預設"
                : panel === "catalog"
                  ? "課程設定"
                  : panel === "schedule"
                    ? "新增排課"
                    : selectedDate}
            </h2>
            <button
              className={button}
              disabled={pending}
              onClick={() => setPanel(null)}
            >
              關閉
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
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
                {templates.map((t) => (
                  <div key={t.id} className="border-b border-earth-100 pb-3">
                    <h3>{t.name}</h3>
                    <p className="text-sm text-earth-500">
                      {t.durationMinutes} 分鐘 · {t.pointCost} 點 · 上限{" "}
                      {t.capacity} 人
                    </p>
                    {canEdit && (
                      <button
                        className={`${button} mt-2`}
                        disabled={pending}
                        onClick={() => {
                          setEditing({ kind: "template", value: t });
                          open("edit");
                        }}
                      >
                        編輯課程
                      </button>
                    )}
                  </div>
                ))}
                <div className="space-y-2">
                  {rooms.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{r.name}</span>
                      {canEdit && (
                        <button
                          className={button}
                          disabled={pending}
                          onClick={() => {
                            setEditing({ kind: "room", value: r });
                            open("edit");
                          }}
                        >
                          編輯教室
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canCreate && (
                  <>
                    <h3 className="font-medium">新增課程</h3>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        教室：
                        {rooms.map((r) => r.name).join("、") || "尚未建立"}
                      </span>
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() => setAddingRoom(!addingRoom)}
                      >
                        新增教室
                      </button>
                    </div>
                    {addingRoom && (
                      <form
                        onSubmit={(e) =>
                          submit(
                            e,
                            async (data) => createCourseRoom(data.get("name")),
                            () => setAddingRoom(false),
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
                        <button className={button} disabled={pending}>
                          加入
                        </button>
                      </form>
                    )}
                    <form
                      className="grid grid-cols-2 gap-3"
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
                      <label className="col-span-2">
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
                      <button
                        className={`${primary} col-span-2`}
                        disabled={pending || !rooms.length}
                      >
                        {pending ? "儲存中…" : "建立課程"}
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
            {panel === "edit" && editing && canEdit && (
              <form
                key={`${editing.kind}-${editing.value.id}`}
                className="grid grid-cols-2 gap-3"
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
                      setPanel(editing.kind === "session" ? "day" : "catalog");
                      setEditing(null);
                    },
                  )
                }
              >
                <p className="col-span-2 text-sm text-earth-600">
                  {editing.kind === "session"
                    ? "僅修改這一堂，其他日期的排課維持原設定。"
                    : editing.kind === "template"
                      ? "修改後套用於新排課；已排課程請從日期內編輯。"
                      : "名稱會同步顯示於使用此教室的課程。"}
                </p>
                <label className="col-span-2">
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
                    <label className="col-span-2">
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
                <div className="sticky bottom-0 col-span-2 flex gap-2 bg-white py-3">
                  <button
                    className={button}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      open(editing.kind === "session" ? "day" : "catalog");
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
                    <button className={primary} onClick={() => open("catalog")}>
                      設定課程
                    </button>
                  </>
                ) : !coaches.length ? (
                  <p>本店尚無可排課的教練，請先完成人員建檔。</p>
                ) : (
                  <form
                    className="grid grid-cols-2 gap-3"
                    onSubmit={(e) =>
                      submit(
                        e,
                        (data) =>
                          createCourseSchedule({
                            templateId: chosen,
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
                    <label className="col-span-2">
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
                    <label>
                      教練
                      <select className={field} name="coachId" required>
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
                        defaultValue={selectedDate}
                        required
                      />
                    </label>
                    <label>
                      開始時間
                      <input
                        className={field}
                        name="time"
                        type="time"
                        defaultValue="18:00"
                        required
                      />
                    </label>
                    <label key={`duration-${chosen}`}>
                      時長（分鐘）
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
                    <label key={`capacity-${chosen}`}>
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
                    {rooms.length > 1 ? (
                      <label key={`room-${chosen}`}>
                        教室
                        <select
                          className={field}
                          name="roomId"
                          defaultValue={template?.defaultRoomId}
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
                    <label className="col-span-2">
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
                      <label className="col-span-2">
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
                      className={`${primary} col-span-2`}
                      disabled={pending}
                    >
                      {pending ? "建立中…" : "建立排課"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </RightSheet>
      )}
    </>
  );
}
