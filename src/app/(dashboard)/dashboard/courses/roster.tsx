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
  "min-h-10 rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50";
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";

type RosterView = "roster" | "member-booking" | "trial-booking";

export function CourseRoster({
  sessionId,
  capacity,
  canEdit,
  allowTrialActions = true,
  view = "roster",
  onDone,
  onCreateCustomer,
  onMemberBookingReadyChange,
  musicLayout = false,
  teacherName = "",
  teacherPhone = "",
  roomName = "",
  courseName = "",
}: {
  sessionId: string;
  capacity: number;
  canCreate: boolean;
  canEdit: boolean;
  allowTrialActions?: boolean;
  view?: RosterView;
  onDone?: () => void;
  onCreateCustomer?: () => void;
  onMemberBookingReadyChange?: (ready: boolean) => void;
  musicLayout?: boolean;
  teacherName?: string;
  teacherPhone?: string;
  roomName?: string;
  courseName?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [batchTarget, setBatchTarget] = useState<
    "CHECKED_IN" | "ATTENDED" | "RESERVED"
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
  const [noShowBooking, setNoShowBooking] = useState<{
    id: string;
    name: string;
    trial: boolean;
  } | null>(null);
  const [cancelBooking, setCancelBooking] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [cardId, setCardId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [trialQuery, setTrialQuery] = useState("");
  const [trialMode, setTrialMode] = useState<"existing" | "new">("new");
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
    const refresh = () =>
      loadCourseSessionDetail(sessionId)
        .then((result) => {
          if (!active) return;
          if (result.success) {
            setSession(result.data.session);
            setTrial(result.data.trial);
            setRoster(result.data.roster);
            setCards(result.data.cards);
            setLoaded(true);
            setRequestKey((current) => current || crypto.randomUUID());
          } else {
            setMessage(result.error);
          }
        })
        .catch(() => active && setMessage("讀取失敗，請重試"));
    void refresh();
    const refreshVisibleRoster = () => {
      if (view === "roster" && document.visibilityState === "visible") {
        void refresh();
      }
    };
    const timer =
      view === "roster"
        ? window.setInterval(refreshVisibleRoster, 60_000)
        : undefined;
    window.addEventListener("focus", refreshVisibleRoster);
    document.addEventListener("visibilitychange", refreshVisibleRoster);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleRoster);
      document.removeEventListener("visibilitychange", refreshVisibleRoster);
    };
  }, [sessionId, view]);

  function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage = "已完成",
  ) {
    start(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setMessage(result.error ?? "操作失敗");
          await load();
          router.refresh();
          return;
        }
        setMessage(successMessage);
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
    ? rows.filter(
        (booking) =>
          booking.customerName
            .toLocaleLowerCase()
            .includes(normalizedRosterQuery) ||
          booking.customerPhone.includes(normalizedRosterQuery),
      )
    : rows;
  const count = activeRows.length;
  const waitingCount = activeRows.filter(
    (booking) => booking.status === "RESERVED",
  ).length;
  const attendedCount = activeRows.filter(
    (booking) => booking.status === "ATTENDED",
  ).length;
  const noShowCount = activeRows.filter(
    (booking) => booking.status === "NO_SHOW",
  ).length;
  const trialCount = activeRows.filter(
    (booking) => booking.bookingKind === "TRIAL",
  ).length;
  const unpaidTrialCount = activeRows.filter(
    (booking) =>
      booking.bookingKind === "TRIAL" &&
      !booking.trialPayments.some((payment) => payment.status === "SUCCESS"),
  ).length;

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
  const normalizedMemberPhoneQuery = memberQuery.replace(/\D/g, "");
  const filteredLearners = normalizedMemberQuery
    ? learners.filter(
        (member) =>
          member.name.toLocaleLowerCase().includes(normalizedMemberQuery) ||
          (normalizedMemberPhoneQuery &&
            member.phone.replace(/\D/g, "").includes(normalizedMemberPhoneQuery)),
      )
    : [];
  const eligibleCardsFor = (memberId: string) =>
    cards
      .filter(
        (item) =>
          item.members.some((member) => member.id === memberId) &&
          !item.expired &&
          !item.closed &&
          item.available >=
            (item.unit === "SESSION" ? 1 : session?.pointCost ?? 1) &&
          (!session || item.expiresAt >= session.startsAt),
      )
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const eligibleCards = eligibleCardsFor(customerId);
  const memberBookingReady = Boolean(
    customerId && cardId && eligibleCards.some((item) => item.id === cardId),
  );

  useEffect(() => {
    if (view !== "member-booking") return;
    onMemberBookingReadyChange?.(memberBookingReady);
    return () => onMemberBookingReadyChange?.(false);
  }, [memberBookingReady, onMemberBookingReadyChange, view]);

  const normalizedTrialQuery = trialQuery.trim().toLocaleLowerCase();
  const normalizedTrialPhoneQuery = trialQuery.replace(/\D/g, "");
  const filteredTrialCustomers =
    normalizedTrialQuery && trial
      ? trial.customers.filter(
          (customer) =>
            customer.name.toLocaleLowerCase().includes(normalizedTrialQuery) ||
            (normalizedTrialPhoneQuery &&
              customer.phone.replace(/\D/g, "").includes(normalizedTrialPhoneQuery)),
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
      <form
        id="course-member-booking-form"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!customerId || !cardId) {
            setMessage("請先選擇學員與有效方案");
            return;
          }
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
            placeholder="輸入部分姓名或手機末幾碼"
            autoFocus
          />
          {!normalizedMemberQuery && (
            <p className="mt-2 text-sm text-earth-500">輸入關鍵字後才會顯示符合的學員。</p>
          )}
          {normalizedMemberQuery && (
            <div className="mt-2 max-h-52 divide-y overflow-y-auto rounded-lg border border-earth-200 bg-white">
              {filteredLearners.length ? (
                filteredLearners.map((member) => {
                  const memberCards = eligibleCardsFor(member.id);
                  const available = memberCards.length;
                  return (
                    <button
                      type="button"
                      key={member.id}
                      className={`flex w-full items-center justify-between px-3 py-3 text-left hover:bg-primary-50 ${customerId === member.id ? "bg-primary-50" : ""}`}
                      onClick={() => {
                        setCustomerId(member.id);
                        setCardId(memberCards[0]?.id ?? "");
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      <span>
                        <strong className="block">{member.name}</strong>
                        <span className="text-xs text-earth-500">{member.phone || "未填電話"}</span>
                      </span>
                      <span className="text-xs text-earth-500">
                        {available ? `${available} 個可用方案` : "沒有可用方案"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="space-y-2 p-4">
                  <p className="text-sm text-earth-500">找不到符合的學員。</p>
                  {allowTrialActions && onCreateCustomer && (
                    <button
                      type="button"
                      className={button}
                      onClick={onCreateCustomer}
                    >
                      ＋ 直接建立新顧客
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {allowTrialActions && onCreateCustomer && !normalizedMemberQuery && (
            <button
              type="button"
              className={`${button} mt-2`}
              onClick={onCreateCustomer}
            >
              ＋ 直接建立新顧客
            </button>
          )}
          {allowTrialActions && onCreateCustomer && (
            <p className="mt-2 text-xs text-earth-500">
              新顧客可直接建檔並以體驗預約加入本堂，不必先前往顧客管理。
            </p>
          )}
        </div>

        {customerId && (
          <div className="space-y-3 rounded-xl border border-earth-200 bg-earth-50 p-3">
            <p className="text-sm text-earth-600">已選學員</p>
            <p className="font-medium">
              {learners.find((member) => member.id === customerId)?.name}
            </p>
            <label className="block text-sm font-medium">
              有效方案
              {eligibleCards.length > 1 && (
                <span className="ml-2 font-normal text-earth-500">
                  已優先帶入最快到期方案
                </span>
              )}
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
                沒有可用方案，請先指派方案。
              </p>
            )}
            <label className="block text-sm font-medium">
              本次備註
              <textarea className={`${field} mt-1 min-h-20`} name="notes" maxLength={1000} />
            </label>
          </div>
        )}
      </form>
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
          className={`${field} mt-1 min-h-20`}
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
            className={`${button} ${trialMode === "new" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
            onClick={() => setTrialMode("new")}
          >
            ＋ 新增體驗客
          </button>
          <button
            type="button"
            className={`${button} ${trialMode === "existing" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
            onClick={() => setTrialMode("existing")}
          >
            已有顧客資料
          </button>
        </div>

        {trialMode === "existing" ? (
          <form
            id="course-trial-booking-form"
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
                placeholder="輸入部分姓名或手機末幾碼"
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
                      <span>
                        <strong className="block">{customer.name}</strong>
                        <span className="text-xs text-earth-500">{customer.phone || "未填電話"}</span>
                      </span>
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
          </form>
        ) : (
          <form
            id="course-trial-booking-form"
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
          </form>
        )}
      </section>
    );
  }

  return (
    <section className={musicLayout ? "flex min-h-0 flex-col gap-3 lg:h-full" : "flex h-full min-h-0 flex-col gap-3"}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg bg-primary-50 px-3 py-2">
          <strong className="block text-base text-primary-900">
            {count}/{capacity}
          </strong>
          <span className="text-xs text-earth-600">已預約／容量</span>
        </div>
        <div className="rounded-lg bg-earth-50 px-3 py-2">
          <strong className="block text-base text-earth-800">{waitingCount}</strong>
          <span className="text-xs text-earth-600">待點名</span>
        </div>
        <div className="rounded-lg bg-primary-50 px-3 py-2">
          <strong className="block text-base text-primary-900">{attendedCount}</strong>
          <span className="text-xs text-earth-600">已出席</span>
        </div>
        <div className="rounded-lg bg-earth-50 px-3 py-2">
          <strong className="block text-base text-earth-800">{noShowCount}</strong>
          <span className="text-xs text-earth-600">未到</span>
        </div>
        <div className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 sm:col-span-1">
          <strong className="block text-base text-amber-900">
            {trialCount} 人
          </strong>
          <span className="text-xs text-earth-600">體驗客</span>
          {unpaidTrialCount > 0 && (
            <span className="mt-0.5 block text-xs font-medium text-amber-800">
              未收款 {unpaidTrialCount} 人
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`${button} ${!showCancelled ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
          onClick={() => setShowCancelled(false)}
        >
          上課名單 {activeRows.length}
        </button>
        <button
          className={`${button} ${showCancelled ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
          onClick={() => setShowCancelled(true)}
        >
          已取消（{cancelledRows.length}）
        </button>
        <input
          className="min-h-10 min-w-56 flex-1 rounded-lg border border-earth-200 px-3 py-1.5 text-sm sm:ml-auto sm:max-w-sm"
          value={memberQuery}
          onChange={(event) => setMemberQuery(event.target.value)}
          placeholder="搜尋姓名或手機"
          aria-label="搜尋上課學員"
        />
      </div>

      {message && (
        <p
          role="status"
          className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800"
        >
          {message}
        </p>
      )}

      {canEdit && !showCancelled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-earth-200 bg-earth-50/60 px-3 py-2">
          <label className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              aria-label="全選全班學員"
              checked={activeRows.length > 0 && chosen.length === activeRows.length}
              disabled={pending || !activeRows.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? activeRows.map((booking) => booking.id)
                    : [],
                )
              }
            />
            全選
          </label>
          <span className="text-sm text-earth-600">已選 {chosen.length} 人</span>
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
            <option value="RESERVED">更正為待點名</option>
          </select>
          <button
            type="button"
            className={`${button} border-primary-300 bg-white text-primary-800`}
            disabled={
              pending ||
              !chosen.length ||
              (batchTarget === "CHECKED_IN" &&
                chosen.some((booking) => booking.status !== "RESERVED"))
            }
            onClick={() =>
              run(
                () =>
                  updateCourseRosterBatch({
                    sessionId,
                    target: batchTarget,
                    bookings: chosen.map((booking) => ({
                      id: booking.id,
                      status: booking.status,
                    })),
                  }),
                `已更新 ${chosen.length} 位學員`,
              )
            }
          >
            {pending ? "處理中…" : `套用 ${chosen.length} 人`}
          </button>
          <span className="ml-auto text-xs text-earth-500">每 60 秒自動更新</span>
        </div>
      )}

      {musicLayout ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          <section className="min-h-0 rounded-xl border border-earth-200 bg-white lg:overflow-y-auto" aria-label="學員">
            <h3 className="sticky top-0 z-10 border-b border-earth-200 bg-earth-50 px-3 py-2 text-sm font-semibold text-earth-800">學員 · {searchedRows.length} 人</h3>
            <ul className="divide-y divide-earth-100">
              {searchedRows.map((booking) => <li key={booking.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${booking.status === "ATTENDED" ? "border-l-4 border-l-emerald-500" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && booking.status !== "CANCELLED" && <input type="checkbox" aria-label={`選取 ${booking.customerName}`} checked={selected.includes(booking.id)} disabled={pending} onChange={(event) => setSelected((old) => event.target.checked ? [...old, booking.id] : old.filter((id) => id !== booking.id))} />}
                  <strong>{booking.customerName}</strong>
                  <span className="rounded-full bg-earth-100 px-2 py-0.5 text-xs text-earth-700">{booking.status === "ATTENDED" ? "已出席" : booking.status === "NO_SHOW" ? "未到" : booking.status === "CANCELLED" ? "已取消" : booking.checkedInAt ? "已報到" : "待點名"}</span>
                  {booking.bookingKind === "TRIAL" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">體驗</span>}
                </div>
                <div className="text-xs text-earth-600">
                  <a className="text-primary-700 hover:underline" href={booking.customerPhone ? `tel:${booking.customerPhone}` : undefined}>{booking.customerPhone || "未填電話"}</a>
                  <span className="ml-2 hidden sm:inline">{booking.bookingKind === "TRIAL" ? `體驗 NT$ ${booking.trialPrice}` : `${booking.planName} · 可用 ${booking.available} ${booking.unit === "SESSION" ? "堂" : "點"}`}</span>
                </div>
                {(booking.serviceNote || booking.notes) && <span className="hidden text-xs text-earth-600 xl:inline" title={`${booking.serviceNote ?? ""} ${booking.notes ?? ""}`}>備註</span>}
                {canEdit && <div className="ml-auto flex flex-wrap gap-1">
                  {booking.status === "RESERVED" && <>
                    <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: booking.id, status: "ATTENDED" }), `已將 ${booking.customerName} 標記出席`)}>出席</button>
                    <button className={button} disabled={pending} onClick={() => setNoShowBooking({ id: booking.id, name: booking.customerName, trial: booking.bookingKind === "TRIAL" })}>未到</button>
                    <button className={button} disabled={pending} onClick={() => setCancelBooking({ id: booking.id, name: booking.customerName })}>取消</button>
                  </>}
                  {(booking.status === "ATTENDED" || booking.status === "NO_SHOW") && <button className={button} disabled={pending} onClick={() => run(() => updateCourseRosterBatch({ sessionId, target: "RESERVED", bookings: [{ id: booking.id, status: booking.status }] }), `已更正 ${booking.customerName}`)}>更正</button>}
                  {allowTrialActions && trial?.canCollect && booking.bookingKind === "TRIAL" && !booking.trialPayments.some((payment) => payment.status === "SUCCESS") && booking.status !== "CANCELLED" && <button className={button} disabled={pending} onClick={() => { setRequestKey(crypto.randomUUID()); setCorrectPayment(false); setPaymentBooking(booking.id); }}>收款</button>}
                </div>}
              </li>)}
              {!searchedRows.length && <li className="p-8 text-center text-sm text-earth-500">沒有符合條件的學員</li>}
            </ul>
          </section>
          <aside className="min-h-0 rounded-xl border border-earth-200 bg-white p-3 lg:overflow-y-auto" aria-label="老師與課程">
            <h3 className="border-b border-earth-100 pb-2 text-sm font-semibold text-earth-800">老師</h3>
            <p className="mt-3 text-base font-semibold text-earth-900">{teacherName}</p>
            <a className="mt-1 inline-block text-sm text-primary-700 hover:underline" href={teacherPhone ? `tel:${teacherPhone}` : undefined}>{teacherPhone || "未填老師電話"}</a>
            <dl className="mt-3 space-y-2 text-sm text-earth-700">
              <div className="flex gap-2"><dt className="w-12 shrink-0 text-earth-500">課程</dt><dd>{courseName}</dd></div>
              <div className="flex gap-2"><dt className="w-12 shrink-0 text-earth-500">教室</dt><dd>{roomName}</dd></div>
              {session && <div className="flex gap-2"><dt className="w-12 shrink-0 text-earth-500">時間</dt><dd>{formatTWDateTime(new Date(session.startsAt))}</dd></div>}
            </dl>
          </aside>
        </div>
      ) : <div className="min-h-0 flex-1 overflow-x-auto rounded-xl border border-earth-200">
        <div className="grid min-w-[1120px] grid-cols-[2fr_2fr_2.4fr_0.9fr_2.7fr] gap-3 bg-earth-50 px-3 py-2 text-xs font-medium text-earth-600">
          <span>學員／電話</span>
          <span>方案／收費</span>
          <span>備註</span>
          <span>狀態</span>
          <span>操作</span>
        </div>
        <ul className="max-h-[calc(100dvh-25rem)] min-h-48 min-w-[1120px] divide-y overflow-y-auto overscroll-contain">
          {searchedRows.map((booking) => {
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
            const statusClass =
              booking.status === "ATTENDED"
                ? "bg-primary-100 text-primary-900"
                : booking.status === "NO_SHOW"
                  ? "bg-amber-100 text-amber-900"
                  : booking.status === "CANCELLED"
                    ? "bg-earth-100 text-earth-500"
                    : "bg-earth-100 text-earth-700";
            return (
              <li
                key={booking.id}
                className="grid min-h-16 grid-cols-[2fr_2fr_2.4fr_0.9fr_2.7fr] items-center gap-3 border-l-[3px] border-primary-200 bg-white px-3 py-2 text-sm hover:bg-earth-50"
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
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1">
                      <strong className="truncate" title={booking.customerName}>
                        {booking.customerName}
                      </strong>
                      {booking.sharedCard && (
                        <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800">
                          共卡
                        </span>
                      )}
                    </p>
                    <a
                      className="block truncate text-xs text-primary-700 hover:underline"
                      href={booking.customerPhone ? `tel:${booking.customerPhone}` : undefined}
                    >
                      {booking.customerPhone || "未填電話"}
                    </a>
                    <span className="block truncate text-[11px] text-earth-500">
                      {booking.bookingSource}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  {booking.bookingKind === "TRIAL" ? (
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      title={`體驗客 · NT$ ${booking.trialPrice} · ${
                        paid ? `已收 NT$ ${paid.amount}` : "未收款"
                      }`}
                    >
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        體驗客
                      </span>
                      {paid ? (
                        <span className="inline-flex rounded-full bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-800">
                          ✓ 已收 NT$ {paid.amount}
                        </span>
                      ) : (
                        <>
                          <span className="text-sm text-earth-700">NT$ {booking.trialPrice}</span>
                          <span className="text-sm font-medium text-amber-700">未收款</span>
                          {allowTrialActions &&
                            trial?.canCollect &&
                            booking.status !== "CANCELLED" && (
                              <button
                                type="button"
                                className="min-h-8 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                disabled={pending}
                                onClick={() => {
                                  setRequestKey(crypto.randomUUID());
                                  setCorrectPayment(false);
                                  setPaymentBooking(booking.id);
                                }}
                              >
                                收款
                              </button>
                            )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p
                      className="truncate"
                      title={`${booking.planName} · ${booking.pointCost} ${
                        booking.unit === "SESSION" ? "堂" : "點"
                      } · 可用 ${booking.available}`}
                    >
                      <strong className="font-medium">{booking.planName}</strong>
                      <span className="text-xs text-earth-600">
                        {" "}· {booking.pointCost}{" "}
                        {booking.unit === "SESSION" ? "堂" : "點"} ·{" "}
                      </span>
                      <span
                        className={
                          booking.available <= 3
                            ? "rounded bg-amber-50 px-1 font-medium text-amber-800"
                            : "text-xs text-earth-600"
                        }
                      >
                        可用 {booking.available}
                      </span>
                    </p>
                  )}
                </div>
                <p
                  className="truncate text-earth-600"
                  title={`店內：${booking.serviceNote || "—"}｜本次：${booking.notes || "—"}`}
                >
                  店內：{booking.serviceNote || "—"}｜本次：{booking.notes || "—"}
                </p>
                <div>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {allowTrialActions &&
                    trial?.canCollect &&
                    paid &&
                    booking.bookingKind === "TRIAL" &&
                    booking.status !== "CANCELLED" && (
                      <button
                        type="button"
                        className={button}
                        disabled={
                          pending ||
                          !trial.canCorrect ||
                          booking.status !== "RESERVED"
                        }
                        onClick={() => {
                          setRequestKey(crypto.randomUUID());
                          setCorrectPayment(true);
                          setPaymentBooking(booking.id);
                        }}
                      >
                        更正收款
                      </button>
                    )}
                  {canEdit && booking.status === "RESERVED" && (
                    <>
                      <button
                        className={`${button} border-primary-300 bg-primary-50 text-primary-800`}
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              updateCourseBookingStatus({
                                bookingId: booking.id,
                                status: "ATTENDED",
                              }),
                            `已將 ${booking.customerName} 標記出席並完成方案結算`,
                          )
                        }
                      >
                        出席
                      </button>
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          setNoShowBooking({
                            id: booking.id,
                            name: booking.customerName,
                            trial: booking.bookingKind === "TRIAL",
                          })
                        }
                      >
                        未到
                      </button>
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          setCancelBooking({
                            id: booking.id,
                            name: booking.customerName,
                          })
                        }
                      >
                        取消
                      </button>
                    </>
                  )}
                  {canEdit &&
                    (booking.status === "ATTENDED" ||
                      booking.status === "NO_SHOW") && (
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              updateCourseRosterBatch({
                                sessionId,
                                target: "RESERVED",
                                bookings: [
                                  {
                                    id: booking.id,
                                    status: booking.status,
                                  },
                                ],
                              }),
                            `已將 ${booking.customerName} 更正為待點名`,
                          )
                        }
                      >
                        更正
                      </button>
                    )}
                  {allowTrialActions &&
                    trial?.canCorrect &&
                    paid &&
                    booking.bookingKind === "TRIAL" && (
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() => {
                          const reason = window.prompt("請輸入作廢原因");
                          if (reason?.trim()) {
                            run(() =>
                              voidCourseTrialPayment({
                                paymentId: paid.id,
                                reason: reason.trim(),
                              }),
                            );
                          }
                        }}
                      >
                        作廢收款
                      </button>
                    )}
                </div>
              </li>
            );
          })}
          {!searchedRows.length && (
            <li className="p-8 text-center text-sm text-earth-500">
              沒有符合條件的學員。
            </li>
          )}
        </ul>
      </div>}


      {noShowBooking && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-no-show-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="course-no-show-title" className="text-lg font-semibold">
                  {noShowBooking.name} 未到處理
                </h3>
                <p className="mt-1 text-sm text-earth-600">
                  {noShowBooking.trial
                    ? "體驗客沒有方案額度，將只記錄未到。"
                    : "請選擇本次未到的扣堂方式。"}
                </p>
              </div>
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => setNoShowBooking(null)}
              >
                關閉
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                className={`${button} w-full text-left`}
                disabled={pending}
                onClick={() => {
                  const booking = noShowBooking;
                  setNoShowBooking(null);
                  run(
                    () =>
                      updateCourseBookingStatus({
                        bookingId: booking.id,
                        status: "NO_SHOW",
                        noShowChoice: "DEDUCTED",
                      }),
                    booking.trial
                      ? `已將 ${booking.name} 標記未到`
                      : `已將 ${booking.name} 標記未到並扣除本次額度`,
                  );
                }}
              >
                <strong className="block">
                  {noShowBooking.trial ? "標記體驗客未到" : "未到扣堂"}
                </strong>
                <span className="text-xs text-earth-600">
                  {noShowBooking.trial
                    ? "只記錄未到，不扣方案，也不發補課券。"
                    : "扣除本次方案額度，不發補課券。"}
                </span>
              </button>
              {!noShowBooking.trial && (
                <button
                  type="button"
                  className={`${button} w-full border-primary-500 text-left`}
                  disabled={pending}
                  onClick={() => {
                    const booking = noShowBooking;
                    setNoShowBooking(null);
                    run(
                      () =>
                        updateCourseBookingStatus({
                          bookingId: booking.id,
                          status: "NO_SHOW",
                          noShowChoice: "DEDUCTED_WITH_MAKEUP",
                        }),
                      `已將 ${booking.name} 標記未到，並發放 7 日補課券`,
                    );
                  }}
                >
                  <strong className="block">未到扣堂＋發補課券</strong>
                  <span className="text-xs text-earth-600">
                    扣除本次方案額度，補課券 7 日內有效。
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {cancelBooking && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-cancel-booking-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="course-cancel-booking-title" className="text-lg font-semibold">
              取消 {cancelBooking.name} 的預約？
            </h3>
            <p className="mt-2 text-sm text-earth-600">
              取消後會立即退還 1 個課程名額，並釋放尚未扣除的方案額度。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => setCancelBooking(null)}
              >
                返回
              </button>
              <button
                type="button"
                className={`${button} bg-primary-700 text-white`}
                disabled={pending}
                onClick={() => {
                  const booking = cancelBooking;
                  setCancelBooking(null);
                  run(
                    () =>
                      updateCourseBookingStatus({
                        bookingId: booking.id,
                        status: "CANCELLED",
                      }),
                    `已取消 ${booking.name} 的預約，並釋放名額與方案額度`,
                  );
                }}
              >
                確認取消並退還名額
              </button>
            </div>
          </div>
        </div>
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
              className={`${button} border-red-200 text-red-700`}
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
