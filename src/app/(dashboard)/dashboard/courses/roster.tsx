"use client";

import { CollectTrialModal } from "../bookings/collect-trial-modal";
import { CorrectTrialCollectionModal } from "../bookings/correct-trial-collection-modal";
import {
  createCourseTrial,
  collectCourseTrial,
  voidCourseTrialPayment,
} from "@/server/actions/course-trial";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatTWDateTime } from "@/lib/date-utils";
import { useRouter } from "next/navigation";
import {
  updateCourseRosterBatch,
  loadCourseSessionDetail,
  createCourseBooking,
  saveCourseCustomer,
  updateCourseBookingStatus,
  cancelCourseSession,
} from "@/server/actions/course-members";
import type { CourseCardView } from "./member-workspace";
import type { getCourseRoster } from "@/server/queries/course-members";

const button =
  "min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm disabled:opacity-50";
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";

type RosterView = "roster" | "member-booking" | "trial-booking";

export function CourseRoster({
  sessionId,
  capacity,
  canCreate,
  canEdit,
  allowTrialActions = true,
  view = "roster",
  onDone,
}: {
  sessionId: string;
  capacity: number;
  canCreate: boolean;
  canEdit: boolean;
  allowTrialActions?: boolean;
  view?: RosterView;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [batchTarget, setBatchTarget] = useState<
    "CHECKED_IN" | "ATTENDED" | "NO_SHOW" | "RESERVED"
  >("CHECKED_IN");
  const [showCancelled, setShowCancelled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [roster, setRoster] = useState<
    Awaited<ReturnType<typeof getCourseRoster>>
  >([]);
  const [cards, setCards] = useState<CourseCardView[]>([]);
  const [session, setSession] = useState<{
    startsAt: string;
    pointCost: number;
  } | null>(null);
  const [trial, setTrial] = useState<
    Extract<
      Awaited<ReturnType<typeof loadCourseSessionDetail>>,
      { success: true }
    >["data"]["trial"] | null
  >(null);
  const [paymentBooking, setPaymentBooking] = useState<string | null>(null);
  const [correctPayment, setCorrectPayment] = useState(false);
  const [cardId, setCardId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [trialQuery, setTrialQuery] = useState("");
  const [trialMode, setTrialMode] = useState<"existing" | "new">("existing");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [requestKey, setRequestKey] = useState("");

  async function load() {
    const result = await loadCourseSessionDetail(sessionId);
    if (result.success) {
      setSession(result.data.session);
      setTrial(result.data.trial);
      setRoster(result.data.roster);
      setCards(result.data.cards);
      setLoaded(true);
    } else {
      setMessage(result.error);
    }
  }

  useEffect(() => {
    let active = true;
    loadCourseSessionDetail(sessionId)
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setSession(result.data.session);
          setTrial(result.data.trial);
          setRoster(result.data.roster);
          setCards(result.data.cards);
          setLoaded(true);
          setRequestKey(crypto.randomUUID());
        } else {
          setMessage(result.error);
        }
      })
      .catch(() => active && setMessage("讀取失敗，請重試"));
    return () => {
      active = false;
    };
  }, [sessionId]);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    start(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setMessage(result.error ?? "操作失敗");
          await load();
          router.refresh();
          return;
        }
        setMessage("已完成");
        setSelected([]);
        setRequestKey(crypto.randomUUID());
        await load();
        router.refresh();
        if (view !== "roster") onDone?.();
      } catch {
        setMessage("連線中斷，請重試");
      }
    });
  }

  const card = cards.find((item) => item.id === cardId);
  const payBooking = roster.find((booking) => booking.id === paymentBooking);
  const receipt = payBooking?.trialPayments.find(
    (payment) => payment.status === "SUCCESS",
  );
  const paymentSettings = trial
    ? {
        allowEdit: trial.settings.trialAllowPriceEdit,
        defaultPrice: trial.settings.trialDefaultPrice,
        minPrice: trial.settings.trialMinPrice,
        maxPrice: trial.settings.trialMaxPrice,
      }
    : null;
  const activeRows = roster.filter((booking) => booking.status !== "CANCELLED");
  const cancelledRows = roster.filter(
    (booking) => booking.status === "CANCELLED",
  );
  const chosen = activeRows.filter((booking) =>
    selected.includes(booking.id),
  );
  const rows = showCancelled ? cancelledRows : activeRows;
  const normalizedRosterQuery = memberQuery.trim().toLocaleLowerCase();
  const searchedRows = normalizedRosterQuery
    ? rows.filter((booking) =>
        booking.customerName.toLocaleLowerCase().includes(normalizedRosterQuery),
      )
    : rows;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(searchedRows.length / 10) - 1),
  );
  const displayedRows = searchedRows.slice(
    currentPage * 10,
    currentPage * 10 + 10,
  );
  const count = activeRows.length;

  const learners = useMemo(
    () =>
      Array.from(
        new Map(
          cards
            .flatMap((item) => item.members)
            .map((member) => [member.id, member] as const),
        ).values(),
      ),
    [cards],
  );
  const normalizedMemberQuery = memberQuery.trim().toLocaleLowerCase();
  const filteredLearners = normalizedMemberQuery
    ? learners.filter((member) =>
        member.name.toLocaleLowerCase().includes(normalizedMemberQuery),
      )
    : [];
  const eligibleCards = cards.filter(
    (item) =>
      item.members.some((member) => member.id === customerId) &&
      !item.expired &&
      !item.closed &&
      item.available >= (item.unit === "SESSION" ? 1 : session?.pointCost ?? 1) &&
      (!session || item.expiresAt >= session.startsAt),
  );
  const normalizedTrialQuery = trialQuery.trim().toLocaleLowerCase();
  const filteredTrialCustomers =
    normalizedTrialQuery && trial
      ? trial.customers.filter((customer) =>
          customer.name.toLocaleLowerCase().includes(normalizedTrialQuery),
        )
      : [];

  if (!loaded) {
    return (
      <div className="flex min-h-40 items-center justify-center text-earth-600">
        {message || "讀取中…"}
      </div>
    );
  }

  if (view === "member-booking") {
    return (
      <section className="space-y-4">
        {message && <p role="status" className="text-sm text-primary-700">{message}</p>}
        <div>
          <label htmlFor="course-member-search" className="mb-1 block text-sm font-medium">
            先找學員
          </label>
          <input
            id="course-member-search"
            className={field}
            value={memberQuery}
            onChange={(event) => {
              setMemberQuery(event.target.value);
              setCustomerId("");
              setCardId("");
            }}
            placeholder="輸入學員姓名後開始搜尋"
            autoFocus
          />
          {!normalizedMemberQuery && (
            <p className="mt-2 text-sm text-earth-500">輸入關鍵字後才會顯示符合的學員。</p>
          )}
          {normalizedMemberQuery && (
            <div className="mt-2 max-h-52 divide-y overflow-y-auto rounded-lg border border-earth-200 bg-white">
              {filteredLearners.length ? (
                filteredLearners.map((member) => {
                  const available = cards.filter(
                    (item) =>
                      item.members.some((candidate) => candidate.id === member.id) &&
                      !item.expired &&
                      !item.closed &&
                      item.available >=
                        (item.unit === "SESSION" ? 1 : session?.pointCost ?? 1) &&
                      (!session || item.expiresAt >= session.startsAt),
                  ).length;
                  return (
                    <button
                      type="button"
                      key={member.id}
                      className={`flex w-full items-center justify-between px-3 py-3 text-left hover:bg-primary-50 ${customerId === member.id ? "bg-primary-50" : ""}`}
                      onClick={() => {
                        setCustomerId(member.id);
                        setCardId("");
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      <strong>{member.name}</strong>
                      <span className="text-xs text-earth-500">
                        {available ? `${available} 個可用方案` : "沒有可用方案"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="p-4 text-sm text-earth-500">找不到符合的學員。</p>
              )}
            </div>
          )}
        </div>

        {customerId && (
          <form
            className="space-y-4 rounded-xl border border-earth-200 bg-earth-50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() =>
                createCourseBooking({
                  sessionId,
                  cardId,
                  customerId,
                  requestKey,
                  notes: data.get("notes"),
                }),
              );
            }}
          >
            <p className="text-sm text-earth-600">已選學員</p>
            <p className="font-medium">
              {learners.find((member) => member.id === customerId)?.name}
            </p>
            <label className="block text-sm font-medium">
              本堂可用方案
              <select
                className={`${field} mt-1`}
                value={cardId}
                required
                onChange={(event) => {
                  setCardId(event.target.value);
                  setRequestKey(crypto.randomUUID());
                }}
              >
                <option value="">請選擇</option>
                {eligibleCards.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · 可用 {item.available} {item.unit === "SESSION" ? "堂" : "點"} · 到期{" "}
                    {formatTWDateTime(new Date(item.expiresAt)).slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            {!eligibleCards.length && (
              <p className="text-sm text-earth-600">
                沒有可用方案，請確認共卡成員、額度與到期日。
              </p>
            )}
            <label className="block text-sm font-medium">
              本次備註
              <textarea className={`${field} mt-1 min-h-24`} name="notes" maxLength={1000} />
            </label>
            <button
              className={`${button} w-full bg-primary-700 text-white`}
              disabled={pending || !card}
            >
              {pending ? "處理中…" : "確認排課"}
            </button>
          </form>
        )}
      </section>
    );
  }

  if (view === "trial-booking") {
    if (!allowTrialActions || !trial?.canCreate || !trial.settings.trialEnabled) {
      return <p className="text-sm text-earth-600">目前未開放建立體驗預約。</p>;
    }
    const priceField = (
      <label className="block text-sm font-medium">
        體驗金額
        <input
          name="price"
          type="number"
          required
          readOnly={!trial.settings.trialAllowPriceEdit}
          min={trial.settings.trialMinPrice}
          max={trial.settings.trialMaxPrice}
          defaultValue={trial.settings.trialDefaultPrice}
          className={`${field} mt-1`}
        />
      </label>
    );
    const noteField = (
      <label className="block text-sm font-medium">
        本次備註
        <textarea
          name="notes"
          maxLength={1000}
          className={`${field} mt-1 min-h-24`}
        />
      </label>
    );
    return (
      <section className="space-y-4">
        {message && (
          <p role="status" className="text-sm text-primary-700">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className={`${button} ${trialMode === "existing" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
            onClick={() => setTrialMode("existing")}
          >
            選擇既有顧客
          </button>
          <button
            type="button"
            className={`${button} ${trialMode === "new" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
            onClick={() => setTrialMode("new")}
          >
            ＋ 建立新體驗客
          </button>
        </div>

        {trialMode === "existing" ? (
          <form
            id="course-trial-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() =>
                createCourseTrial({
                  sessionId,
                  customerId: data.get("trial-customer-choice"),
                  price: Number(data.get("price")),
                  notes: data.get("notes"),
                  requestKey,
                }),
              );
            }}
          >
            <div>
              <label
                htmlFor="course-trial-search"
                className="mb-1 block text-sm font-medium"
              >
                找到既有顧客就直接加入
              </label>
              <input
                id="course-trial-search"
                className={field}
                value={trialQuery}
                onChange={(event) => setTrialQuery(event.target.value)}
                placeholder="輸入顧客姓名後開始搜尋"
                autoFocus
              />
              {!normalizedTrialQuery && (
                <p className="mt-2 text-sm text-earth-500">
                  輸入關鍵字後才會顯示符合的顧客。
                </p>
              )}
            </div>
            {normalizedTrialQuery && (
              <div className="max-h-52 divide-y overflow-y-auto rounded-lg border border-earth-200">
                {filteredTrialCustomers.length ? (
                  filteredTrialCustomers.map((customer) => (
                    <label
                      key={customer.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 px-3 hover:bg-primary-50"
                    >
                      <input
                        type="radio"
                        name="trial-customer-choice"
                        value={customer.id}
                        required
                      />
                      <span>{customer.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="p-4 text-sm text-earth-500">
                    找不到既有顧客，可切換「建立新體驗客」快速建檔。
                  </p>
                )}
              </div>
            )}
            {priceField}
            {noteField}
            <p className="text-sm text-earth-600">
              先建立未收款預約並保留名額；收款與出席分開，不占用其他方案。
            </p>
            <button
              className={`${button} w-full bg-primary-700 text-white`}
              disabled={pending}
            >
              {pending ? "處理中…" : "建立並加入課程"}
            </button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(async () => {
                const saved = await saveCourseCustomer({
                  name: data.get("name"),
                  phone: data.get("phone"),
                });
                if (!saved.success) return saved;
                return createCourseTrial({
                  sessionId,
                  customerId: saved.data.id,
                  price: Number(data.get("price")),
                  notes: data.get("notes"),
                  requestKey,
                });
              });
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                姓名
                <input
                  name="name"
                  required
                  maxLength={80}
                  className={`${field} mt-1`}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium">
                手機
                <input
                  name="phone"
                  required
                  maxLength={30}
                  inputMode="tel"
                  placeholder="09xxxxxxxx"
                  className={`${field} mt-1`}
                />
              </label>
            </div>
            <p className="text-sm text-earth-500">
              若手機已存在，請改用「選擇既有顧客」，避免重複建檔。
            </p>
            {priceField}
            {noteField}
            <p className="text-sm text-earth-600">
              建立顧客後會直接加入本堂，並先保留一位名額。
            </p>
            <button
              className={`${button} w-full bg-primary-700 text-white`}
              disabled={pending}
            >
              {pending ? "處理中…" : "建立並加入課程"}
            </button>
          </form>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          已預約 {count}／{capacity} · 未點名{" "}
          {roster.filter((booking) => booking.status === "RESERVED").length}
        </p>
        <input
          className="min-h-11 min-w-56 flex-1 rounded-lg border border-earth-200 px-3 py-2 text-sm sm:max-w-sm"
          value={memberQuery}
          onChange={(event) => {
            setMemberQuery(event.target.value);
            setPage(0);
          }}
          placeholder="搜尋學員姓名"
          aria-label="搜尋上課學員"
        />
      </div>
      {message && <p role="status" className="text-sm text-primary-700">{message}</p>}

      {canEdit && !showCancelled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-earth-200 bg-white p-2">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              aria-label="全選全班學員"
              checked={activeRows.length > 0 && chosen.length === activeRows.length}
              disabled={pending || !activeRows.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? activeRows.map((booking) => booking.id) : [],
                )
              }
            />
            全選全班
          </label>
          <span className="text-sm">已選 {chosen.length} 人</span>
          <select
            aria-label="批次點名狀態"
            className={button}
            value={batchTarget}
            disabled={pending}
            onChange={(event) =>
              setBatchTarget(event.target.value as typeof batchTarget)
            }
          >
            <option value="CHECKED_IN">報到</option>
            <option value="ATTENDED">出席</option>
            <option value="NO_SHOW">未到</option>
            <option value="RESERVED">更正為待點名</option>
          </select>
          <button
            type="button"
            className={button}
            disabled={
              pending ||
              !chosen.length ||
              (batchTarget === "CHECKED_IN" &&
                chosen.some((booking) => booking.status !== "RESERVED"))
            }
            onClick={() =>
              run(() =>
                updateCourseRosterBatch({
                  sessionId,
                  target: batchTarget,
                  bookings: chosen.map((booking) => ({
                    id: booking.id,
                    status: booking.status,
                  })),
                }),
              )
            }
          >
            {pending ? "處理中…" : `套用 ${chosen.length} 人`}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className={`${button} ${!showCancelled ? "border-primary-500 text-primary-800" : ""}`}
          onClick={() => {
            setShowCancelled(false);
            setPage(0);
          }}
        >
          上課名單 {activeRows.length}
        </button>
        <button
          className={`${button} ${showCancelled ? "border-primary-500 text-primary-800" : ""}`}
          onClick={() => {
            setShowCancelled(true);
            setPage(0);
          }}
        >
          已取消預約（{cancelledRows.length}）
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-earth-200">
        <div className="hidden grid-cols-[2fr_2fr_2.5fr_1fr_2fr] gap-3 bg-earth-50 px-3 py-2 text-xs font-medium text-earth-600 md:grid">
          <span>姓名</span>
          <span>方案／收費</span>
          <span>備註</span>
          <span>狀態</span>
          <span>操作</span>
        </div>
        <ul className="max-h-[56vh] divide-y overflow-y-auto overscroll-contain">
          {displayedRows.map((booking) => {
            const paid = booking.trialPayments.find(
              (payment) => payment.status === "SUCCESS",
            );
            const statusLabel =
              booking.status === "ATTENDED"
                ? "已出席"
                : booking.status === "CANCELLED"
                  ? "已取消"
                  : booking.status === "NO_SHOW"
                    ? "未到"
                    : booking.checkedInAt
                      ? "已報到"
                      : "待點名";
            return (
              <li
                key={booking.id}
                className="grid gap-3 border-l-[3px] border-primary-200 bg-white px-3 py-3 text-sm hover:bg-earth-50 md:grid-cols-[2fr_2fr_2.5fr_1fr_2fr]"
              >
                <div className="flex items-start gap-2">
                  {canEdit && booking.status !== "CANCELLED" && (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      aria-label={`選取 ${booking.customerName}`}
                      checked={selected.includes(booking.id)}
                      disabled={pending}
                      onChange={(event) =>
                        setSelected((old) =>
                          event.target.checked
                            ? [...old, booking.id]
                            : old.filter((id) => id !== booking.id),
                        )
                      }
                    />
                  )}
                  <div>
                    <strong>{booking.customerName}</strong>
                    <p className="mt-1 text-xs text-earth-500">
                      {booking.operatorCustomerId
                        ? booking.operatorCustomerId === booking.customerId
                          ? "自己預約"
                          : "共卡代約"
                        : "店長代約"}
                    </p>
                  </div>
                </div>
                <div>
                  {booking.bookingKind === "TRIAL" ? (
                    <>
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        體驗客
                      </span>
                      <p className="mt-1">
                        NT$ {booking.trialPrice} · {paid ? `已收 NT$ ${paid.amount}` : "未收款"}
                      </p>
                      {booking.trialPayments.length > 0 && (
                        <details className="mt-1 text-xs text-earth-600">
                          <summary className="cursor-pointer">收款紀錄</summary>
                          {booking.trialPayments.map((payment) => (
                            <p key={payment.id}>
                              {formatTWDateTime(new Date(payment.createdAt))} · NT$ {payment.amount} ·{" "}
                              {payment.status === "SUCCESS" ? "已收款" : "已作廢"}
                            </p>
                          ))}
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      <strong className="font-medium">{booking.planName}</strong>
                      <p className="mt-1 text-xs text-earth-600">
                        {booking.pointCost} {booking.unit === "SESSION" ? "堂" : "點"} · 可用{" "}
                        {booking.available} {booking.unit === "SESSION" ? "堂" : "點"}
                      </p>
                    </>
                  )}
                </div>
                <div className="text-earth-600">
                  <p>店內：{booking.serviceNote || "—"}</p>
                  <p className="mt-1">本次：{booking.notes || "—"}</p>
                </div>
                <div>
                  <span className="inline-flex rounded-full bg-earth-100 px-2 py-1 text-xs">
                    {statusLabel}
                  </span>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {allowTrialActions &&
                    trial?.canCollect &&
                    booking.bookingKind === "TRIAL" &&
                    booking.status !== "CANCELLED" && (
                      <button
                        className={button}
                        disabled={
                          pending ||
                          (!!paid && (!trial.canCorrect || booking.status !== "RESERVED"))
                        }
                        onClick={() => {
                          setRequestKey(crypto.randomUUID());
                          setCorrectPayment(!!paid);
                          setPaymentBooking(booking.id);
                        }}
                      >
                        {paid ? "更正收款" : "體驗收款"}
                      </button>
                    )}
                  {canEdit && booking.status === "RESERVED" && (
                    <>
                      {!booking.checkedInAt && (
                        <button
                          className={button}
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              updateCourseBookingStatus({
                                bookingId: booking.id,
                                status: "CHECKED_IN",
                              }),
                            )
                          }
                        >
                          報到
                        </button>
                      )}
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            updateCourseBookingStatus({
                              bookingId: booking.id,
                              status: "NO_SHOW",
                            }),
                          )
                        }
                      >
                        未到
                      </button>
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            updateCourseBookingStatus({
                              bookingId: booking.id,
                              status: "ATTENDED",
                            }),
                          )
                        }
                      >
                        出席
                      </button>
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            updateCourseBookingStatus({
                              bookingId: booking.id,
                              status: "CANCELLED",
                            }),
                          )
                        }
                      >
                        取消
                      </button>
                    </>
                  )}
                  {allowTrialActions &&
                    trial?.canCorrect &&
                    paid &&
                    booking.bookingKind === "TRIAL" && (
                      <details className="w-full text-xs">
                        <summary className="cursor-pointer py-2 text-earth-600">作廢收款</summary>
                        <form
                          className="space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const reason = String(
                              new FormData(event.currentTarget).get("reason") ?? "",
                            );
                            run(() =>
                              voidCourseTrialPayment({
                                paymentId: paid.id,
                                reason,
                              }),
                            );
                          }}
                        >
                          <input
                            name="reason"
                            required
                            maxLength={500}
                            placeholder="作廢原因"
                            className={field}
                          />
                          <button disabled={pending} className={button}>
                            確認作廢
                          </button>
                        </form>
                      </details>
                    )}
                </div>
              </li>
            );
          })}
          {!displayedRows.length && (
            <li className="p-8 text-center text-sm text-earth-500">
              沒有符合條件的學員。
            </li>
          )}
        </ul>
      </div>

      {searchedRows.length > 10 && (
        <nav aria-label="學員分頁" className="flex items-center justify-between">
          <button
            className={button}
            disabled={currentPage === 0 || pending}
            onClick={() => setPage(currentPage - 1)}
          >
            上一頁
          </button>
          <span className="text-sm">
            {currentPage + 1} / {Math.ceil(searchedRows.length / 10)} · 共 {searchedRows.length} 人
          </span>
          <button
            className={button}
            disabled={(currentPage + 1) * 10 >= searchedRows.length || pending}
            onClick={() => setPage(currentPage + 1)}
          >
            下一頁
          </button>
        </nav>
      )}

      {payBooking && paymentSettings && !correctPayment && (
        <CollectTrialModal
          key={payBooking.id}
          open
          onClose={() => setPaymentBooking(null)}
          bookingId={payBooking.id}
          customerName={payBooking.customerName}
          dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""}
          expectedAmount={payBooking.trialPrice}
          people={1}
          attendedPeople={null}
          settings={paymentSettings}
          courseMode
          saveAction={(data) => collectCourseTrial({ ...data, requestKey })}
          onCollected={() => {
            setPaymentBooking(null);
            void load();
            router.refresh();
          }}
        />
      )}
      {payBooking && paymentSettings && correctPayment && receipt && (
        <CorrectTrialCollectionModal
          key={receipt.id}
          open
          onClose={() => setPaymentBooking(null)}
          bookingId={payBooking.id}
          originalTransactionId={receipt.id}
          customerName={payBooking.customerName}
          dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""}
          originalAmount={receipt.amount}
          originalMethod={receipt.paymentMethod}
          originalDate={formatTWDateTime(new Date(receipt.createdAt))}
          people={1}
          attendedPeople={null}
          settings={paymentSettings}
          saveAction={(data) =>
            collectCourseTrial({
              ...data,
              originalPaymentId: data.originalTransactionId,
              requestKey,
            })
          }
          onCorrected={() => {
            setPaymentBooking(null);
            void load();
            router.refresh();
          }}
        />
      )}

      {canEdit && (
        <div className="border-t border-earth-200 pt-3">
          {!confirmCancel ? (
            <button
              className={button}
              disabled={pending}
              onClick={() => setConfirmCancel(true)}
            >
              取消整堂課
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm">
                將取消本堂課，影響 {count} 位上課人；未完成預約會釋放額度，紀錄保留。
              </p>
              <button
                className={button}
                disabled={pending}
                onClick={() =>
                  run(() =>
                    cancelCourseSession({ sessionId, expectedBookings: count }),
                  )
                }
              >
                確認取消整堂課
              </button>
              <button className={button} onClick={() => setConfirmCancel(false)}>
                返回
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
