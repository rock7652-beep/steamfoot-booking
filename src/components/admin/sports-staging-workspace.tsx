"use client";
import {
  useState,
  useId,
  cloneElement,
  useRef,
  useEffect,
  type ReactElement,
  type FormEvent,
  type ReactNode,
} from "react";
import { RightSheet } from "./right-sheet";
import { addTaiwanDuration, parseLocalDate } from "@/lib/date-utils";
import "./sports-staging.css";
import {
  loadSportsStaging,
  saveSportsSubject,
  saveSportsFee,
  sportsStagingCommand,
} from "@/server/actions/sports-staging";
import type { SportsSnapshot, SportsLesson } from "@/lib/sports-staging-types";
type Subject = { id: string; name: string; category: string; active: boolean };
type Fee = {
  id: string;
  subject: string;
  name: string;
  unit: string;
  amount: number;
  price: number;
  days: number;
  cost: number;
  shared: boolean;
};
type Lesson = SportsLesson;
const kinds = ["每週固定", "隔週固定", "單次", "體驗", "空間出租"];
const fixedKind = (kind: string) => kind === "每週固定" || kind === "隔週固定";
const money = (n: number) => "NT$ " + n.toLocaleString("zh-TW");
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<{ id?: string }>, { id })}
    </div>
  );
}
export function SportsStagingWorkspace({
  initial,
  production = false,
  storeName = "運動流程測試店",
}: {
  initial: SportsSnapshot;
  production?: boolean;
  storeName?: string;
}) {
  const [live, setLive] = useState(initial),
    [pending, setPending] = useState(false);
  const readGeneration = useRef(0);
  const inFlight = useRef(false),
    requestKey = useRef(crypto.randomUUID());
  const students = Array.from(
    live.students
      .reduce((m, s) => {
        const key = `${s.id}:${s.fee}`;
        if (!m.has(key) || m.get(key)!.available < s.available) m.set(key, s);
        return m;
      }, new Map<string, SportsSnapshot["students"][number]>())
      .values(),
  );
  const base = addTaiwanDuration(
      live.date,
      -((parseLocalDate(live.date).getDay() + 6) % 7),
      "DAY",
    ),
    weekEnd = addTaiwanDuration(base, 6, "DAY");
  const [tab, setTab] = useState("課表"),
    [subjects, setSubjects] = useState<Subject[]>(initial.subjects),
    [fees, setFees] = useState<Fee[]>(initial.fees),
    [lessons, setLessons] = useState<Lesson[]>(initial.lessons);
  const faded = lessons
    .filter((l) => fixedKind(l.kind) && l.originalDate)
    .map((l) => ({
      ...l,
      id: l.id + "-reference",
      date: l.originalDate!,
      time: l.originalTime!,
    }));
  const [move, setMove] = useState({ date: "", time: "" });
  const [panel, setPanel] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("全部"),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<Lesson | null>(null);
  const [draft, setDraft] = useState({
    subject: initial.subjects[0]?.id ?? "",
    fee:
      initial.fees.find((f) => f.subject === initial.subjects[0]?.id)?.id ?? "",
    kind: "每週固定",
    mode: "指定學員",
    date: addTaiwanDuration(initial.date, 1, "DAY"),
    time: "09:00",
    duration: 60,
    count: 4,
    coach: initial.coaches[0]?.name ?? "",
    room: initial.rooms[0]?.name ?? "",
    capacity: 8,
    price: 499,
    customer: "",
    phone: "",
    students: [] as string[],
  });
  const [feeUnit, setFeeUnit] = useState("點數");
  const [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [editing, setEditing] = useState<string | null>(null);
  const fee = fees.find((f) => f.id === draft.fee),
    rental = draft.kind === "空間出租",
    trial = draft.kind === "體驗",
    recurring = ["每週固定", "隔週固定"].includes(draft.kind);
  const dates = /^\d{4}-\d{2}-\d{2}$/.test(draft.date)
    ? Array.from(
        { length: recurring ? Math.max(1, Math.min(24, draft.count || 1)) : 1 },
        (_, i) =>
          addTaiwanDuration(
            draft.date,
            i * (draft.kind === "隔週固定" ? 14 : 7),
            "DAY",
          ),
      )
    : [];
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
  const unit = fee?.unit === "點數" ? "點" : "堂",
    required = (fee?.unit === "點數" ? fee.cost : 1) * dates.length;
  const close = () => {
    if (pending) return;
    if (dirty && !window.confirm("尚有未儲存的修改，確定關閉？")) return;
    setPanel("");
    setDetail(null);
    setDirty(false);
    setError("");
  };
  const open = (which: string, id: string | null = null) => {
    requestKey.current = crypto.randomUUID();
    setFeeUnit(fees.find((f) => f.id === id)?.unit ?? "點數");
    setEditing(id);
    setDirty(false);
    setError("");
    setDetail(null);
    setPanel(which);
  };
  const patch = (value: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...value }));
    setDirty(true);
    setError("");
  };
  async function reload() {
    const generation = ++readGeneration.current;
    const r = await loadSportsStaging();
    if (!r.success) throw new Error(r.error);
    if (generation !== readGeneration.current) return r.data;
    setLive(r.data);
    setSubjects(r.data.subjects);
    setFees(r.data.fees);
    setLessons(r.data.lessons);
    setDetail((old) =>
      old ? (r.data.lessons.find((l) => l.id === old.id) ?? null) : null,
    );
    return r.data;
  }
  async function run(
    work: () => Promise<{ success: boolean; error?: string }>,
    message: string,
    keep = false,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    readGeneration.current++;
    setPending(true);
    setError("");
    try {
      const r = await work();
      if (!r.success) throw new Error(r.error ?? "操作失敗");
      setDirty(false);
      setNotice(message);
      if (!keep) {
        setPanel("");
        setDetail(null);
      }
      requestKey.current = crypto.randomUUID();
      try {
        await reload();
      } catch {
        setNotice(message + "；畫面同步失敗，請按更新核對，勿重複送出。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (
        (!panel || panel === "課程詳情") &&
        !dirty &&
        !inFlight.current &&
        document.visibilityState === "visible"
      )
        void reload().catch(() => {});
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [panel, dirty]);
  function saveSubject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        saveSportsSubject({
          id: editing ?? undefined,
          name: String(f.get("name")),
          category: String(f.get("category")),
          active: f.get("active") === "yes",
          expectedUpdatedAt: live.subjects.find((s) => s.id === editing)
            ?.updatedAt,
          requestKey: requestKey.current,
        }),
      "教學項目已儲存",
    );
  }
  function saveFee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        saveSportsFee({
          id: editing ?? undefined,
          subject: String(f.get("subject")),
          name: String(f.get("name")),
          unit: String(f.get("unit")),
          amount: Number(f.get("amount")),
          price: Number(f.get("price")),
          days: Number(f.get("days")),
          cost: Number(f.get("cost") || 1),
          shared: f.get("shared") === "on",
          coachIds: f.getAll("coachIds"),
          requestKey: requestKey.current,
          snapshot: live.fees.find((p) => p.id === editing)?.snapshot,
        }),
      "收費方式已儲存",
    );
  }
  function saveMove(e: FormEvent) {
    e.preventDefault();
    if (detail)
      void run(
        () =>
          sportsStagingCommand({
            operation: "move",
            payload: { id: detail.id, ...move },
          }),
        "本堂時間已更新，其他課次維持原安排",
      );
  }
  function saveSchedule(e: FormEvent) {
    e.preventDefault();
    void run(
      () =>
        sportsStagingCommand({
          operation: "schedule",
          payload: { ...draft, requestKey: requestKey.current },
        }),
      draft.kind === "空間出租"
        ? "空間租借已建立"
        : draft.mode === "指定學員"
          ? "排課已建立並完成指定學員預約"
          : "排課已建立並開放選課",
    );
  }
  function command(
    operation: string,
    payload: Record<string, unknown>,
    message: string,
  ) {
    void run(
      () =>
        sportsStagingCommand({
          operation,
          payload: { ...payload, requestKey: requestKey.current },
        }),
      message,
      operation !== "cancel",
    );
  }
  const selectedSubject = subjects.find((s) => s.id === editing),
    selectedFee = fees.find((f) => f.id === editing);
  return (
    <div className="sports-staging">
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            蒸管家<span>運動教室</span>
          </div>
          <div className="store">
            {storeName}<small>{production ? "店家後台" : "隔離測試站"}</small>
          </div>
          <nav aria-label="主要功能">
            {["課表", "教學項目", "收費方式"].map((t) => (
              <button
                key={t}
                aria-label={t}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => {
                  setTab(t);
                  setQuery("");
                  setFilter("全部");
                }}
              >
                <span>{t === "課表" ? "▦" : t === "教學項目" ? "◈" : "▤"}</span>
                {t}
              </button>
            ))}
          </nav>
          <div className="side-note">運動名稱 → 收費方式 → 排課</div>
        </aside>
        <main>
          <header className="top">
            <span>店家後台</span>
            <span className="pill">{production ? "運動教室" : "隔離測試站 · 已串接核心"}</span>
          </header>
          <div className="content">
            <div className="heading">
              <div>
                <p className="eyebrow">{storeName}</p>
                <h1>{tab}</h1>
                <p className="muted">
                  {tab === "課表"
                    ? "依排課類型安排時段，指定學員或開放選課。"
                    : tab === "教學項目"
                      ? "管理運動名稱；價格與額度在收費方式設定。"
                      : "每項運動可設定不同點數或堂數收費。"}
                </p>
              </div>
              <button
                className="primary"
                onClick={() =>
                  open(
                    tab === "課表"
                      ? "排課"
                      : tab === "教學項目"
                        ? "教學項目"
                        : "收費方式",
                  )
                }
              >
                ＋
                {tab === "課表"
                  ? "新增排課"
                  : tab === "教學項目"
                    ? "新增教學項目"
                    : "新增收費方式"}
              </button>
            </div>
            {!production && <div className="preview-note">
              使用獨立測試資料庫；儲存、預約、收款與扣抵會保存在測試站。
            </div>}
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            <div className="toolbar">
              <input
                aria-label="搜尋"
                placeholder={
                  tab === "課表" ? "搜尋運動、老師或空間" : "搜尋名稱"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {tab === "課表" ? (
                <select
                  aria-label="排課類型篩選"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {["全部", ...kinds].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <select
                  aria-label="運動篩選"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>全部</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => void reload().catch((e) => setNotice(String(e)))}
                disabled={pending}
              >
                更新
              </button>
              <span className="muted">
                {tab === "課表"
                  ? `${base}–${weekEnd} · 後續排課列於下方`
                  : "儲存後直接更新清單"}
              </span>
            </div>
            {tab === "教學項目" && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {["運動名稱", "分類", "收費方式", "狀態", "操作"].map(
                        (t) => (
                          <th key={t}>{t}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects
                      .filter(
                        (s) =>
                          (filter === "全部" || s.id === filter) &&
                          s.name.includes(query),
                      )
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.name}</strong>
                          </td>
                          <td>{s.category || "未分類"}</td>
                          <td>
                            {fees.filter((f) => f.subject === s.id).length} 種
                          </td>
                          <td>
                            <span className="pill">
                              {s.active ? "上架" : "下架"}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => open("教學項目", s.id)}>
                              編輯
                            </button>{" "}
                            <button
                              onClick={() => {
                                setTab("收費方式");
                                setFilter(s.id);
                              }}
                            >
                              查看收費
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "收費方式" && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "收費名稱／運動",
                        "計費",
                        "售價",
                        "效期",
                        "每堂扣抵",
                        "操作",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fees
                      .filter(
                        (f) =>
                          (filter === "全部" || f.subject === filter) &&
                          (f.name + name(f.subject)).includes(query),
                      )
                      .map((f) => (
                        <tr key={f.id}>
                          <td>
                            <strong>{f.name}</strong>
                            <small>
                              {name(f.subject)}
                              {f.shared ? " · 可共用" : ""}
                            </small>
                          </td>
                          <td>
                            {f.amount} {f.unit === "點數" ? "點" : "堂"}
                          </td>
                          <td>{money(f.price)}</td>
                          <td>{f.days} 天</td>
                          <td>{f.unit === "點數" ? `${f.cost} 點` : "1 堂"}</td>
                          <td>
                            <button onClick={() => open("收費方式", f.id)}>
                              編輯
                            </button>
                            <button
                              onClick={() => {
                                setEditing(f.id);
                                setPanel("購買收費方案");
                                requestKey.current = crypto.randomUUID();
                              }}
                            >
                              購買
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "課表" && (
              <>
                <div className="legend">
                  {kinds.map((k, i) => (
                    <span key={k}>
                      <i data-kind={i} />
                      {k}
                    </span>
                  ))}
                </div>
                <div className="table-scroll">
                  <div className="week">
                    {Array.from({ length: 7 }, (_, i) => (
                      <section key={i}>
                        <h2>
                          {["一", "二", "三", "四", "五", "六", "日"][i]}{" "}
                          <span>
                            {addTaiwanDuration(base, i, "DAY").slice(5)}
                          </span>
                        </h2>
                        {[...lessons, ...faded]
                          .filter(
                            (l) =>
                              l.date === addTaiwanDuration(base, i, "DAY") &&
                              (filter === "全部" || l.kind === filter) &&
                              (name(l.subject) + l.coach + l.room).includes(
                                query,
                              ),
                          )
                          .sort(
                            (a, b) =>
                              a.time.localeCompare(b.time) ||
                              Number(faded.includes(b)) -
                                Number(faded.includes(a)),
                          )
                          .map((l) => (
                            <button
                              className="lesson"
                              data-faded={
                                faded.includes(l) ? "true" : undefined
                              }
                              disabled={faded.includes(l)}
                              key={
                                l.id + (faded.includes(l) ? "-reference" : "")
                              }
                              data-kind={kinds.indexOf(l.kind)}
                              onClick={() => {
                                setDetail(l);
                                setPanel("課程詳情");
                                setDirty(false);
                              }}
                            >
                              <span className="lesson-kind">{l.kind}</span>
                              <strong>{l.time}</strong>
                              <b>
                                {l.kind === "空間出租"
                                  ? l.room
                                  : name(l.subject)}
                              </b>
                              <span>
                                {l.kind === "空間出租" ? "空間租借" : l.mode}
                              </span>
                              <small>
                                {l.kind === "空間出租"
                                  ? money(l.price)
                                  : l.coach + " · " + l.room}
                              </small>
                              <small>
                                {l.kind === "空間出租"
                                  ? `${l.duration} 分鐘`
                                  : `${l.students.length}/${l.capacity} 人`}
                              </small>
                            </button>
                          ))}
                      </section>
                    ))}
                  </div>
                </div>
                {lessons.some((l) => l.date > weekEnd) && (
                  <section className="future">
                    <h2>後續排課</h2>
                    {lessons
                      .filter((l) => l.date > weekEnd)
                      .map((l) => (
                        <button
                          key={l.id}
                          onClick={() => {
                            setDetail(l);
                            setPanel("課程詳情");
                            setDirty(false);
                          }}
                        >
                          {l.date} {l.time} · {name(l.subject)} · {l.kind} ·{" "}
                          {l.mode}
                        </button>
                      ))}
                  </section>
                )}
              </>
            )}
          </div>
        </main>
        <RightSheet
          open={!!panel}
          onClose={close}
          presentation="centered"
          width={760}
          labelledById="preview-panel-title"
        >
          <header className="panel-head">
            <div>
              <span className="eyebrow">
                {detail ? "排課資料" : editing ? "編輯" : "新增"} · {production ? "課程管理" : "測試站"}
              </span>
              <h2 id="preview-panel-title">{panel}</h2>
            </div>
            <button onClick={close}>關閉</button>
          </header>
          <div className="panel-body">
            {panel === "購買收費方案" && (
              <form
                id="edit-form"
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const plan = live.fees.find((p) => p.id === editing);
                  if (plan)
                    void run(
                      () =>
                        sportsStagingCommand({
                          operation: "purchase",
                          payload: {
                            planId: plan.id,
                            customerId: f.get("customerId"),
                            expectedPrice: plan.price,
                            requestKey: requestKey.current,
                          },
                        }),
                      "方案購買已完成，卡片與帳本已建立",
                    );
                }}
              >
                <p className="full">
                  {selectedFee?.name} · {money(selectedFee?.price ?? 0)} ·
                  信用卡
                </p>
                <Field label="購買學員">
                  <select name="customerId">
                    {live.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </form>
            )}
            {panel === "教學項目" && (
              <form
                id="edit-form"
                onSubmit={saveSubject}
                onChange={() => setDirty(true)}
                className="form"
              >
                <Field label="運動名稱">
                  <input
                    name="name"
                    required
                    defaultValue={selectedSubject?.name}
                  />
                </Field>
                <Field label="分類">
                  <input
                    name="category"
                    defaultValue={selectedSubject?.category}
                  />
                </Field>
                <Field label="狀態">
                  <select
                    name="active"
                    defaultValue={
                      selectedSubject?.active === false ? "no" : "yes"
                    }
                  >
                    <option value="yes">上架</option>
                    <option value="no">下架</option>
                  </select>
                </Field>
                <p className="muted">一個運動可建立多種收費方式。</p>
              </form>
            )}
            {panel === "收費方式" && (
              <form
                id="edit-form"
                onSubmit={saveFee}
                onChange={() => setDirty(true)}
                className="form"
              >
                <Field label="運動">
                  <select name="subject" defaultValue={selectedFee?.subject}>
                    {subjects
                      .filter((s) => s.active)
                      .map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="收費名稱">
                  <input
                    name="name"
                    required
                    defaultValue={selectedFee?.name}
                  />
                </Field>
                <Field label="計費單位">
                  <select
                    name="unit"
                    value={feeUnit}
                    onChange={(e) => setFeeUnit(e.target.value)}
                  >
                    <option>點數</option>
                    <option>堂數</option>
                  </select>
                </Field>
                <Field label="總額度">
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    required
                    defaultValue={selectedFee?.amount ?? 10}
                  />
                </Field>
                <Field label="售價（元）">
                  <input
                    name="price"
                    type="number"
                    min="0"
                    required
                    defaultValue={selectedFee?.price ?? 4800}
                  />
                </Field>
                <Field label="有效期（天）">
                  <input
                    name="days"
                    type="number"
                    min="1"
                    required
                    defaultValue={selectedFee?.days ?? 90}
                  />
                </Field>
                {feeUnit === "點數" && (
                  <Field label="點數方案每堂扣抵（點）">
                    <input
                      name="cost"
                      type="number"
                      min="1"
                      required
                      defaultValue={selectedFee?.cost ?? 1}
                    />
                  </Field>
                )}
                <p className="muted">
                  堂數每堂扣 1
                  堂；點數依適用課程扣抵。已售方案與歷史課次保留原資料。
                </p>
                <fieldset className="full learner">
                  <legend>本課程可授課教練（由有權限者設定）</legend>
                  {live.coaches.map((c) => (
                    <label key={c.id} className="check">
                      <input
                        type="checkbox"
                        name="coachIds"
                        value={c.id}
                        defaultChecked={
                          !!selectedFee &&
                          c.templates.includes(
                            live.fees.find((p) => p.id === editing)
                              ?.templateId ?? "",
                          )
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </fieldset>
                <label className="check">
                  <input
                    name="shared"
                    type="checkbox"
                    defaultChecked={selectedFee?.shared}
                  />
                  允許共用額度
                </label>
              </form>
            )}
            {panel === "排課" && (
              <form id="edit-form" onSubmit={saveSchedule} className="form">
                <div className="full">
                  <span className="label">排課類型</span>
                  <div className="choices">
                    {kinds.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={draft.kind === k}
                        onClick={() => patch({ kind: k })}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                {!rental && (
                  <>
                    <Field label="教學項目">
                      <select
                        value={draft.subject}
                        onChange={(e) =>
                          patch({
                            subject: e.target.value,
                            fee:
                              fees.find((f) => f.subject === e.target.value)
                                ?.id ?? "",
                            students: [],
                          })
                        }
                      >
                        {subjects
                          .filter((s) => s.active)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {!trial && (
                      <Field label="適用收費方式">
                        <select
                          value={draft.fee}
                          onChange={(e) =>
                            patch({ fee: e.target.value, students: [] })
                          }
                        >
                          {fees
                            .filter((f) => f.subject === draft.subject)
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name} · {f.unit}
                              </option>
                            ))}
                        </select>
                      </Field>
                    )}
                    <div className="full">
                      <span className="label">參加方式</span>
                      <div className="choices">
                        {["指定學員", "開放選課"].map((mode) => (
                          <button
                            type="button"
                            key={mode}
                            aria-pressed={draft.mode === mode}
                            onClick={() => patch({ mode })}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <Field label="首次日期">
                  <input
                    type="date"
                    required
                    value={draft.date}
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                </Field>
                <Field label="開始時間">
                  <input
                    type="time"
                    required
                    value={draft.time}
                    onChange={(e) => patch({ time: e.target.value })}
                  />
                </Field>
                <Field label="時長（分鐘）">
                  <select
                    value={draft.duration}
                    onChange={(e) =>
                      patch({ duration: Number(e.target.value) })
                    }
                  >
                    {[30, 60, 90, 120].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                {recurring && (
                  <Field label="排課堂數">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      required
                      value={draft.count}
                      onChange={(e) => patch({ count: Number(e.target.value) })}
                    />
                  </Field>
                )}
                {!rental && (
                  <Field label="授課教練">
                    <select
                      value={draft.coach}
                      onChange={(e) => patch({ coach: e.target.value })}
                    >
                      {live.coaches.map((c) => (
                        <option key={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="空間">
                  <select
                    value={draft.room}
                    onChange={(e) => patch({ room: e.target.value })}
                  >
                    {live.rooms
                      .filter((r) => !rental || r.rental)
                      .map((r) => (
                        <option key={r.id}>{r.name}</option>
                      ))}
                  </select>
                </Field>
                {!rental && (
                  <Field label="人數上限">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      required
                      value={draft.capacity}
                      onChange={(e) =>
                        patch({ capacity: Number(e.target.value) })
                      }
                    />
                  </Field>
                )}
                {(trial || rental) && (
                  <Field label={rental ? "租借金額（元）" : "體驗價格（元）"}>
                    <input
                      type="number"
                      min="0"
                      required
                      value={draft.price}
                      onChange={(e) => patch({ price: Number(e.target.value) })}
                    />
                  </Field>
                )}
                {rental ? (
                  <>
                    <Field label="租借人">
                      <input
                        required
                        value={draft.customer}
                        onChange={(e) => patch({ customer: e.target.value })}
                      />
                    </Field>
                    <Field label="租借電話">
                      <input
                        required
                        value={draft.phone}
                        onChange={(e) => patch({ phone: e.target.value })}
                      />
                    </Field>
                  </>
                ) : draft.mode === "指定學員" ? (
                  <fieldset className="full learner">
                    <legend>指定學員 · 本次{dates.length}堂</legend>
                    {(trial
                      ? live.customers.map((c) => ({
                          ...c,
                          fee: "",
                          cardId: c.id,
                          available: 0,
                        }))
                      : students.filter((s) => s.fee === draft.fee)
                    ).map((s) => (
                      <label key={s.cardId} className="check">
                        <input
                          type="checkbox"
                          checked={draft.students.includes(s.id)}
                          onChange={(e) =>
                            patch({
                              students: e.target.checked
                                ? [...draft.students, s.id]
                                : draft.students.filter((id) => id !== s.id),
                            })
                          }
                        />
                        <strong>{s.name}</strong>
                        <span className="muted">
                          {trial
                            ? "體驗學員"
                            : `可用 ${s.available} ${unit} · 本次保留 ${required} ${unit}`}
                        </span>
                      </label>
                    ))}
                    {!trial && !students.some((s) => s.fee === draft.fee) && (
                      <p>目前沒有適用此收費方式的學員。</p>
                    )}
                  </fieldset>
                ) : (
                  <div className="full summary">
                    <strong>開放學員自行選課</strong>
                    <p>
                      {trial
                        ? "依體驗價格報名。"
                        : "限持有適用方案且額度、效期符合的學員。"}
                      名額上限 {draft.capacity} 人；不會自動加入固定學員。
                    </p>
                  </div>
                )}
                <div className="full summary">
                  <strong>
                    {rental
                      ? "空間出租"
                      : `${name(draft.subject)} · ${draft.kind} · ${draft.mode}`}
                  </strong>
                  <p>
                    {rental
                      ? `${draft.room} · ${money(draft.price)}`
                      : trial
                        ? `體驗收費 ${money(draft.price)}，不扣一般方案額度`
                        : `${fee?.name ?? "尚未選擇收費"} · 每堂 ${fee?.unit === "點數" ? fee.cost : 1} ${unit}`}
                  </p>
                  <details>
                    <summary>查看 {dates.length} 個排課日期</summary>
                    <ul>
                      {dates.map((date) => (
                        <li key={date}>
                          {date} {draft.time} · {draft.duration} 分鐘
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
                {error && (
                  <p role="alert" className="full error">
                    {error}
                  </p>
                )}
              </form>
            )}
            {panel === "調整本堂" && detail && (
              <form id="edit-form" onSubmit={saveMove} className="form">
                <p className="full muted">只調整本堂，其他課次維持原安排。</p>
                <Field label="新日期">
                  <input
                    type="date"
                    required
                    value={move.date}
                    onChange={(e) => {
                      setMove((v) => ({ ...v, date: e.target.value }));
                      setDirty(true);
                      setError("");
                    }}
                  />
                </Field>
                <Field label="新時間">
                  <input
                    type="time"
                    required
                    value={move.time}
                    onChange={(e) => {
                      setMove((v) => ({ ...v, time: e.target.value }));
                      setDirty(true);
                      setError("");
                    }}
                  />
                </Field>
                {error && (
                  <p role="alert" className="full error">
                    {error}
                  </p>
                )}
              </form>
            )}
            {detail && panel === "課程詳情" && (
              <div className="detail">
                <div className="detail-type">
                  {detail.kind} ·{" "}
                  {detail.kind === "空間出租" ? "租借" : detail.mode}
                </div>
                <h3>
                  {detail.kind === "空間出租"
                    ? detail.room
                    : name(detail.subject)}
                </h3>
                <p>
                  {detail.date} {detail.time} · {detail.duration} 分鐘
                </p>
                <p>
                  {detail.kind === "空間出租"
                    ? `租借空間：${detail.room}`
                    : `${detail.coach} · ${detail.room}`}
                </p>
                <p>
                  {detail.kind === "體驗" || detail.kind === "空間出租"
                    ? money(detail.price)
                    : fees.find((f) => f.id === detail.fee)?.name}
                </p>
                <h4>
                  {detail.kind === "空間出租"
                    ? "租借安排"
                    : detail.mode === "指定學員"
                      ? "指定學員"
                      : "報名情況"}
                </h4>
                <p>
                  {detail.students
                    .map((id) => students.find((s) => s.id === id)?.name)
                    .join("、") ||
                    (detail.mode === "開放選課"
                      ? "尚無學員報名"
                      : "尚無指定學員")}
                </p>
                <button
                  onClick={() => {
                    setMove({ date: detail.date, time: detail.time });
                    setPanel("調整本堂");
                    setError("");
                  }}
                >
                  調整本堂時間
                </button>
                <h4>名單與扣抵</h4>
                {detail.bookings.map((b) => (
                  <div key={b.id} className="booking-row">
                    <strong>
                      {b.name} · {b.status}
                    </strong>
                    {b.status === "RESERVED" && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          command(
                            "attendance",
                            { bookingId: b.id, status: "ATTENDED" },
                            "出席已記錄",
                          )
                        }
                      >
                        標記出席
                      </button>
                    )}
                    {b.status !== "CANCELLED" && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          command(
                            "attendance",
                            {
                              bookingId: b.id,
                              status: "CANCELLED",
                              expectedStatus: b.status,
                            },
                            "預約已取消並依原規則釋放或還點",
                          )
                        }
                      >
                        取消預約
                      </button>
                    )}
                    {b.trial && !b.paymentId && b.status === "RESERVED" && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          command(
                            "trial-collect",
                            {
                              bookingId: b.id,
                              amount: detail.price,
                              paymentMethod: "CREDIT_CARD",
                            },
                            "體驗收款已登錄",
                          )
                        }
                      >
                        登錄體驗收款
                      </button>
                    )}
                    {b.paymentId && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          command(
                            "trial-void",
                            {
                              paymentId: b.paymentId,
                              reason: production ? "收款更正" : "測試站收款更正",
                            },
                            "體驗收款已作廢",
                          )
                        }
                      >
                        作廢體驗收款
                      </button>
                    )}
                  </div>
                ))}
                {detail.kind !== "空間出租" && (
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      command(
                        "join",
                        {
                          sessionId: detail.id,
                          customerId: f.get("customerId"),
                        },
                        "學員已加入",
                      );
                    }}
                  >
                    <Field label="加入學員">
                      <select name="customerId">
                        {live.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button disabled={pending}>加入本堂</button>
                  </form>
                )}
                {detail.kind === "空間出租" && !detail.paymentId && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      command(
                        "rental-collect",
                        {
                          rentalId: detail.id,
                          revision: detail.revision,
                          amount: detail.price,
                          paymentMethod: "OTHER",
                          reason: "",
                        },
                        "租借收款已登錄",
                      )
                    }
                  >
                    登錄租借收款
                  </button>
                )}
                {detail.kind === "空間出租" && detail.paymentId && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      command(
                        "rental-collect",
                        {
                          rentalId: detail.id,
                          revision: detail.revision,
                          originalId: detail.paymentId,
                          voidOnly: true,
                          amount: 0,
                          paymentMethod: "OTHER",
                          reason: production ? "核對作廢" : "測試站核對作廢",
                        },
                        "租借收款已作廢",
                      )
                    }
                  >
                    作廢租借收款
                  </button>
                )}
                <button
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("確認取消本堂／租借？"))
                      command(
                        "cancel",
                        {
                          id: detail.id,
                          revision: detail.revision,
                          expectedBookings: detail.bookings.filter(
                            (b) => b.status !== "CANCELLED",
                          ).length,
                        },
                        "排課已取消",
                      );
                  }}
                >
                  取消本堂
                </button>
              </div>
            )}
            {error && panel !== "排課" && panel !== "調整本堂" && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
          <footer className="panel-footer">
            <span className="muted">
              {pending ? "處理中…" : dirty ? "尚未儲存" : production ? "已儲存" : "隔離測試資料"}
            </span>
            {(!detail || panel === "調整本堂") && (
              <button
                disabled={pending}
                type="submit"
                form="edit-form"
                className="primary"
              >
                {panel === "排課"
                  ? "確認建立排課"
                  : panel === "調整本堂"
                    ? "儲存本堂時間"
                    : "儲存"}
              </button>
            )}
          </footer>
        </RightSheet>
      </div>
    </div>
  );
}
