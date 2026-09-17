"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { toLocalDateStr, dayRange, formatTWDateTime } from "@/lib/date-utils";
import {
  saveCourseCustomer,
  saveCoursePointPlan,
  assignCoursePointCard,
  setCourseCardMembers,
} from "@/server/actions/course-members";
import { saveCourseStaff } from "@/server/actions/course-staff";
import type { getCourseCards } from "@/server/queries/course-members";

import { CourseCustomerPurchases } from "./customer-purchases";
import { CourseCustomerList } from "./customer-list";
import type { CustomerRow } from "../customers/_components/customers-table";
import { CourseCustomerBookings } from "./customer-bookings";
import { BirthdayFields } from "@/components/birthday-fields";
import { CourseCustomerHealth } from "./customer-health";
type Person = { id: string; name: string; phone: string; email: string | null; gender: string | null; birthday: string; height: number | null; lineName: string | null; serviceNote: string | null; address: string | null; notes: string | null };
type Plan = {
  id: string;
  name: string;
  points: number;
  price: number;
  validDays: number;
  isActive: boolean;
  unit: string;
  templateIds: string[];
};
export type CourseCardView = Awaited<ReturnType<typeof getCourseCards>>[number];
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseMemberWorkspace({
  view,
  templates,
  people,
  plans,
  cards,
  canEdit,
  canCreate,
  canManageStaff,
  canAssign,
  canReadBookings,
  canReadTransactions,
  healthEnabled,
  customerRows,
  canReadCards,
}: {
  view: "customers" | "plans";
  templates: {id:string;name:string}[];
  people: Person[];
  plans: Plan[];
  cards: CourseCardView[];
  canEdit: boolean;
  canCreate: boolean;
  canManageStaff: boolean;
  canAssign: boolean;
  canReadBookings: boolean;
  canReadTransactions: boolean;
  healthEnabled: boolean;
  customerRows: CustomerRow[];
  canReadCards: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initialPerson = view === "customers" ? people.find(p => p.id === params.get("customerId")) ?? null : null;
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const [panel, setPanel] = useState<
    "person" | "plan" | "assign" | "card" | "coach" | "health" | null
  >(initialPerson ? "person" : null);
  const [person, setPerson] = useState<Person | null>(initialPerson);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cardId, setCardId] = useState("");
  const [planId, setPlanId] = useState(plans.find((p) => p.isActive)?.id ?? "");
  const [requestKey, setRequestKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const card = cards.find((c) => c.id === cardId);
  function open(value: typeof panel) {
    if (value === "assign" && !plans.some((p) => p.id === planId && p.isActive))
      setPlanId(plans.find((p) => p.isActive)?.id ?? "");
    setError("");
    setNotice("");
    setRequestKey(crypto.randomUUID());
    setPanel(value);
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<{ success: boolean; error?: string }>,
  ) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    start(async () => {
      try {
        const result = await action(data);
        if (!result.success) {
          setError(result.error ?? "儲存失敗");
          return;
        }
        setPanel(null);
        setNotice("已儲存");
        router.refresh();
      } catch {
        setError("連線中斷，請重試");
      }
    });
  }
  const filteredPlans = plans
    .filter(
      (p) =>
        p.name.includes(search.trim()) &&
        (status === "all" || p.isActive === (status === "active")),
    )
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const totalRows = filteredPlans.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(totalRows / 20) - 1));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "plans" && <input
          className={`${field} max-w-xs`}
          aria-label="搜尋"
          placeholder="搜尋方案"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />}
        {view === "plans" && (
          <select
            className={`${field} max-w-36`}
            aria-label="狀態篩選"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          >
            <option value="all">全部狀態</option>
            <option value="active">上架</option>
            <option value="inactive">下架</option>
          </select>
        )}
        {canCreate && (
          <button
            className={button}
            onClick={() => {
              setPerson(null);
              setPlan(null);
              open(view === "customers" ? "person" : "plan");
            }}
          >
            ＋新增{view === "customers" ? "顧客" : "點數方案"}
          </button>
        )}
        {canAssign && (
          <button
            className={button}
            disabled={!people.length || !plans.some((p) => p.isActive)}
            onClick={() => { setPerson(null); open("assign"); }}
          >
            指派方案
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="mb-3 text-primary-700">
          {notice}
        </p>
      )}
      {view === "customers" ? <CourseCustomerList rows={customerRows} cards={cards} canReadCards={canReadCards}
        onView={id => { setPerson(people.find(p => p.id === id) ?? null); open("person"); }}
        onCreate={canCreate ? () => { setPerson(null); open("person"); } : undefined}
        onAssign={canAssign ? id => { setPerson(people.find(p => p.id === id) ?? null); open("assign"); } : undefined}
      /> : (
      <div className="overflow-x-auto rounded-lg border border-earth-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-earth-50">
            <tr>
              {["方案", "點數", "售價", "有效天數", "狀態", "操作"].map((h) => (
                <th key={h} className="whitespace-nowrap p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {filteredPlans.slice(currentPage * 20, (currentPage + 1) * 20).map((p) => (
                  <tr
                    key={p.id}
                    className={p.isActive ? "" : "bg-earth-50 text-earth-400"}
                  >
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{p.points}</td>
                    <td className="p-3">{p.price}</td>
                    <td className="p-3">{p.validDays}</td>
                    <td className="p-3">{p.isActive ? "上架" : "下架"}</td>
                    <td className="p-3">
                      {canEdit && (
                        <button
                          className={button}
                          onClick={() => {
                            setPlan(p);
                            open("plan");
                          }}
                        >
                          編輯
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      )}
      {view === "plans" && (
        <section className="mt-5">
          <h2 className="mb-2 font-semibold">已指派方案</h2>
          <div className="divide-y rounded-lg border bg-white">
            {cards.map((c) => (
              <button
                key={c.id}
                className={`flex min-h-14 w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm ${c.expired ? "bg-earth-50 text-earth-400" : ""}`}
                onClick={() => {
                  setCardId(c.id);
                  open("card");
                }}
              >
                <span>
                  {c.name}
                  {c.closed ? "（已結清停用）" : c.expired ? "（已到期）" : ""} ·{" "}
                  {c.members.map((m) => m.name).join("、")}
                </span>
                <span>
                  剩餘 {c.remaining}／占用 {c.held}／可用 {c.available} · 到期{" "}
                  {toLocalDateStr(new Date(c.expiresAt))}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {view === "plans" && totalRows > 20 && <nav aria-label="清單分頁" className="flex items-center justify-end gap-3"><span className="text-sm">共 {totalRows} 筆 · 第 {currentPage + 1}／{Math.ceil(totalRows / 20)} 頁</span><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁</button><button className={button} disabled={(currentPage + 1) * 20 >= totalRows} onClick={() => setPage(currentPage + 1)}>下一頁</button></nav>}
      {panel && (
        <RightSheet
          open
          onClose={() => !pending && setPanel(null)}
          width={520}
          labelledById="course-member-sheet"
        >
          <header className="flex shrink-0 items-center justify-between border-b p-4">
            <h2 id="course-member-sheet" className="font-semibold">
              {panel === "person"
                ? "顧客詳細資料"
                : panel === "health" ? "健康追蹤" : panel === "plan"
                  ? "點數方案"
                  : panel === "assign"
                    ? "指派方案"
                    : panel === "coach"
                      ? "加入為教練"
                      : "方案與共卡"}
            </h2>
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={() => setPanel(null)}
            >
              關閉
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            {panel === "coach" && person && (
              <form
                id="course-member-form"
                onSubmit={(e) =>
                  submit(e, () =>
                    saveCourseStaff({
                      name: person.name,
                      kind: "coach",
                      customerId: person.id,
                      requestKey,
                    }),
                  )
                }
              >
                <p>
                  {person.name}{" "}
                  將使用已綁定的會員帳號存取「我的工作」，不建立後台密碼。
                </p>
              </form>
            )}
            {panel === "health" && healthEnabled && person && <CourseCustomerHealth customerId={person.id} canEdit={canEdit} />}
            {panel === "person" && person && <section className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {healthEnabled && <button className={button} onClick={() => open("health")}>健康追蹤</button>}
                {canManageStaff && <button className={button} onClick={() => open("coach")}>加入為教練</button>}
                {canAssign && <button className={button} onClick={() => open("assign")}>指派方案</button>}
              </div>
              {canReadCards && <details><summary className="min-h-11 cursor-pointer py-2">持有／共卡方案</summary>
                {cards.filter(c=>c.members.some(m=>m.id===person.id)).map(c=><button key={c.id} className={`${button} mb-2 block w-full text-left`} onClick={()=>{setCardId(c.id);open("card");}}>{c.name} · 可用 {c.available} {c.unit === "SESSION" ? "堂" : "點"} · 到期 {toLocalDateStr(new Date(c.expiresAt))}{c.closed ? "（已結清）" : c.expired ? "（已到期）" : ""}</button>)}
                {!cards.some(c=>c.members.some(m=>m.id===person.id)) && <p className="text-sm text-earth-500">尚無方案</p>}
              </details>}
              <details><summary className="min-h-11 cursor-pointer py-2">身分與歸屬資訊</summary><dl className="space-y-2 text-sm">
                <div>LINE 綁定：{customerRows.find(c=>c.id===person.id)?.lineLinkStatus === "LINKED" ? "已綁定" : "尚未綁定"}</div>
                <div>直屬店長：{customerRows.find(c=>c.id===person.id)?.assignedStaff?.displayName ?? "未指派"}</div>
                <div>推薦人：{customerRows.find(c=>c.id===person.id)?.sponsor?.name ?? "無"}</div>
              </dl></details>
            </section>}
            {panel !== "person" && view === "customers" && person && <button type="button" className={`${button} mb-3`} disabled={pending} onClick={()=>open("person")}>返回 {person.name} 詳情</button>}
            {panel === "person" && (
              <form
                id="course-member-form"
                className="space-y-3"
                onSubmit={(e) =>
                  submit(e, (d) =>
                    saveCourseCustomer({
                      id: person?.id,
                      name: d.get("name"),
                      phone: d.get("phone"),
                      email: d.get("email"), gender: d.get("gender"), birthday: d.get("birthday"), height: d.get("height"), lineName: d.get("lineName"), serviceNote: d.get("serviceNote"), address: d.get("address"), notes: d.get("notes"),
                    }),
                  )
                }
              >
                <label className="block">
                  姓名
                  <input
                    className={field}
                    name="name"
                    defaultValue={person?.name}
                    readOnly={person ? !canEdit : !canCreate}
                    required
                    maxLength={80}
                  />
                </label>
                <label className="block">
                  電話
                  <input
                    className={field}
                    name="phone"
                    defaultValue={person?.phone}
                    readOnly={person ? !canEdit : !canCreate}
                    maxLength={30}
                    required
                  />
                </label>
                <fieldset disabled={person ? !canEdit : !canCreate} className="space-y-3">
                  <label className="block">電子信箱<input className={field} name="email" type="email" defaultValue={person?.email ?? ""} /></label>
                  <label className="block">性別<select className={field} name="gender" defaultValue={person?.gender ?? ""}><option value="">未填</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label>
                  <div>生日<BirthdayFields defaultValue={person?.birthday} className={field} /></div>
                  <label className="block">身高（cm）<input className={field} name="height" type="number" min={50} max={250} step="any" defaultValue={person?.height ?? ""} /></label>
                  <label className="block">LINE 名稱<input className={field} name="lineName" maxLength={100} defaultValue={person?.lineName ?? ""} /></label>
                  <label className="block">地址<input className={field} name="address" maxLength={300} defaultValue={person?.address ?? ""} /></label>
                  <label className="block">顧客備註<textarea className={field} name="notes" maxLength={1000} defaultValue={person?.notes ?? ""} /></label>
                  <label className="block">顧客服務備註（後台限定）<textarea className={field} name="serviceNote" maxLength={1000} defaultValue={person?.serviceNote ?? ""} /></label>
                </fieldset>
              </form>
            )}
            {panel === "person" && person && canReadTransactions && <CourseCustomerPurchases key={person.id} customerId={person.id} />}
            {panel === "person" && person && canReadBookings && <CourseCustomerBookings key={person.id} customerId={person.id} />}
            {panel === "plan" && (
              <form
                id="course-member-form"
                className="space-y-3"
                onSubmit={(e) =>
                  submit(e, (d) =>
                    saveCoursePointPlan({
                      id: plan?.id,
                      name: d.get("name"),
                      points: Number(d.get("points")),
                      price: Number(d.get("price")),
                      validDays: Number(d.get("days")),
                      isActive: d.get("active") === "yes",
                      unit: d.get("unit"),
                      templateIds: d.getAll("templateIds"),
                    }),
                  )
                }
              >
                <label className="block">
                  名稱
                  <input
                    className={field}
                    name="name"
                    defaultValue={plan?.name}
                    required
                  />
                </label>
                <label className="block">額度單位<select className={field} name="unit" defaultValue={plan?.unit??"POINT"}><option value="POINT">點數</option><option value="SESSION">堂數（每堂使用 1 堂）</option></select></label>
                <fieldset className="space-y-2"><legend>適用課程（未勾選表示全部課程）</legend>{templates.map(t=><label key={t.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="templateIds" value={t.id} defaultChecked={plan?.templateIds.includes(t.id)}/>{t.name}</label>)}</fieldset>
                {[
                  ["額度", "points", plan?.points ?? 10, 1],
                  ["售價", "price", plan?.price ?? 0, 0],
                  ["有效天數", "days", plan?.validDays ?? 90, 1],
                ].map(([label, name, value, min]) => (
                  <label key={String(name)} className="block">
                    {label}
                    <input
                      className={field}
                      name={String(name)}
                      type="number"
                      min={Number(min)}
                      defaultValue={Number(value)}
                      required
                    />
                  </label>
                ))}
                <label className="block">
                  狀態
                  <select
                    className={field}
                    name="active"
                    defaultValue={plan?.isActive === false ? "no" : "yes"}
                  >
                    <option value="yes">上架</option>
                    <option value="no">下架</option>
                  </select>
                </label>
                <p className="text-sm text-earth-500">
                  修改預設不影響已指派方案。本輪提供點數方案，無自動續費。
                </p>
              </form>
            )}
            {panel === "assign" && (
              <form
                id="course-member-form"
                className="space-y-3"
                onSubmit={(e) =>
                  submit(e, (d) =>
                    assignCoursePointCard({
                      planId,
                      customerId: d.get("customerId"),
                      expiresDate: d.get("expires"),
                      requestKey,
                    }),
                  )
                }
              >
                <label className="block">
                  顧客
                  <select className={field} name="customerId" defaultValue={person?.id ?? ""} required>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.phone}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  方案
                  <select
                    className={field}
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    required
                  >
                    {plans
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.points} 點
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block" key={planId}>
                  有效至（含當日）
                  <input
                    className={field}
                    type="date"
                    name="expires"
                    required
                    defaultValue={toLocalDateStr(
                      new Date(
                        dayRange(toLocalDateStr()).start.getTime() +
                          ((plans.find((p) => p.id === planId)?.validDays ??
                            90) -
                            1) *
                            86400000,
                      ),
                    )}
                  />
                </label>
                <p className="text-sm text-earth-500">
                  指派會新增點數紀錄；收款請在營運登錄實際收支。
                </p>
              </form>
            )}
            {panel === "card" && card && (
              <>
                <CourseCardSummary card={card} />
                {canAssign && (
                  <form
                    id="course-member-form"
                    className="mt-4 space-y-2"
                    onSubmit={(e) =>
                      submit(e, (d) =>
                        setCourseCardMembers({
                          cardId: card.id,
                          customerIds: d.getAll("members"),
                        }),
                      )
                    }
                  >
                    <h3 className="font-medium">共卡授權成員</h3>
                    <p className="text-sm text-earth-500">
                      每位成員均可只替另一位成員預約。
                    </p>
                    {people.map((p) => (
                      <label
                        key={p.id}
                        className="flex min-h-11 items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          name="members"
                          value={p.id}
                          defaultChecked={card.members.some(
                            (m) => m.id === p.id,
                          )}
                        />
                        {p.name}
                      </label>
                    ))}
                  </form>
                )}
                <CourseCardEntries card={card} />
              </>
            )}
          </div>
          {panel !== "health" && (panel !== "person" || (person ? canEdit : canCreate)) && (panel !== "card" || canAssign) && (
            <footer className="shrink-0 border-t bg-white p-4">
              <button
                form="course-member-form"
                type="submit"
                className={`${button} w-full bg-primary-700 text-white`}
                disabled={pending}
              >
                {pending ? "儲存中…" : "儲存"}
              </button>
            </footer>
          )}
        </RightSheet>
      )}
    </>
  );
}
export function CourseCardSummary({ card }: { card: CourseCardView }) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold">{card.name}</h3>
      <p>
        剩餘 {card.remaining} · 已預約占用 {card.held} · 可用 {card.available}{" "}
        {card.unit === "SESSION" ? "堂" : "點"}
      </p>
      <p>
        期限：{toLocalDateStr(new Date(card.expiresAt))}
        {new Date(card.expiresAt) < new Date() ? "（已到期）" : ""}
      </p>
      <p>授權成員：{card.members.map((m) => m.name).join("、")}</p>
    </div>
  );
}
export function CourseCardEntries({ card }: { card: CourseCardView }) {
  const labels: Record<string, string> = {
    GRANT: "取得額度",
    REFUND: "退款收回額度",
    VOID: "誤建作廢收回額度",
    RESERVE: "預約占用",
    RELEASE: "釋放占用",
    DEBIT: "出席使用",
  };
  return (
    <section className="mt-5">
      <h3 className="font-medium">最近額度紀錄</h3>
      <ul className="divide-y text-sm">
        {card.entries.map((e) => (
          <li key={e.id} className="py-2">
            {formatTWDateTime(new Date(e.createdAt))} ·{" "}
            {e.kind.startsWith("CORRECT:") ? "點名更正" : labels[e.kind] ?? e.kind} {e.points} {card.unit === "SESSION" ? "堂" : "點"}
          </li>
        ))}
      </ul>
    </section>
  );
}
