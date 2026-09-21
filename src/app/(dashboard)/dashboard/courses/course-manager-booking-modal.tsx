"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { formatTWDateTime } from "@/lib/date-utils";
import {
  createCourseBooking,
  searchCourseBookingCandidates,
} from "@/server/actions/course-members";

const button =
  "min-h-11 rounded-xl border border-earth-200 bg-white px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} border-primary-700 bg-primary-700 text-white`;
const field =
  "min-h-12 w-full rounded-xl border border-earth-200 bg-white px-3 py-2.5 text-base outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

type Candidate = {
  id: string;
  name: string;
  phone: string;
  plans: Array<{
    id: string;
    name: string;
    unit: string;
    available: number;
    expiresAt: string;
    cost: number;
  }>;
};

export function CourseManagerBookingModal({
  open,
  sessionId,
  sessionLabel,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  sessionLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [cardId, setCardId] = useState("");
  const [message, setMessage] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open || !query.trim()) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchCourseBookingCandidates({ sessionId, query })
        .then((result) => {
          if (!active) return;
          if (!result.success) {
            setMessage(result.error ?? "搜尋失敗");
            setCandidates([]);
            return;
          }
          const rows = result.data as Candidate[];
          setCandidates(rows);
          setMessage("");
          const digits = query.replace(/\D/g, "");
          if (rows.length === 1 && digits.length >= 6) {
            setCustomerId(rows[0].id);
            setCardId(rows[0].plans[0]?.id ?? "");
          }
        })
        .catch(() => active && setMessage("搜尋失敗，請重試"))
        .finally(() => active && setSearching(false));
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query, sessionId]);

  const selectedCustomer = useMemo(
    () => candidates.find((candidate) => candidate.id === customerId) ?? null,
    [candidates, customerId],
  );
  const selectedPlan = selectedCustomer?.plans.find((plan) => plan.id === cardId) ?? null;

  function selectCustomer(candidate: Candidate) {
    setCustomerId(candidate.id);
    setCardId(candidate.plans[0]?.id ?? "");
    setRequestKey(crypto.randomUUID());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer || !selectedPlan || pending) return;
    const data = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createCourseBooking({
          sessionId,
          cardId: selectedPlan.id,
          customerId: selectedCustomer.id,
          notes: data.get("notes"),
          requestKey,
        });
        if (!result.success) {
          setMessage(result.error ?? "排課失敗");
          setRequestKey(crypto.randomUUID());
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setMessage("連線失敗，請重試");
        setRequestKey(crypto.randomUUID());
      }
    });
  }

  return (
    <RightSheet
      compact
      open={open}
      onClose={onClose}
      variant="modal"
      width={560}
      labelledById="course-manager-booking-title"
    >
      <header className="flex items-center justify-between border-b border-earth-200 bg-primary-50/60 px-5 py-3">
        <div>
          <h2 id="course-manager-booking-title" className="font-semibold text-primary-900">
            ＋ 排課
          </h2>
          <p className="mt-1 text-sm text-earth-600">{sessionLabel}</p>
        </div>
        <button className={button} type="button" onClick={onClose} disabled={pending}>
          關閉
        </button>
      </header>

      <form
        id="course-manager-booking-form"
        onSubmit={submit}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
      >
        {message && (
          <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {message}
          </p>
        )}

        <section className="space-y-2">
          <label className="block text-sm font-medium text-earth-700">
            先找學員
            <input
              className={field}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCustomerId("");
                setCardId("");
              }}
              inputMode="tel"
              placeholder="輸入手機號碼或姓名"
              autoFocus
            />
          </label>
          {searching && <p className="text-xs text-earth-500">搜尋中…</p>}
          {query.trim() && !searching && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-earth-200 bg-white">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 border-b border-earth-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-primary-50 ${customerId === candidate.id ? "bg-primary-50" : ""}`}
                  onClick={() => selectCustomer(candidate)}
                >
                  <span>
                    <strong className="block">{candidate.name}</strong>
                    <span className="text-xs text-earth-500">{candidate.phone}</span>
                  </span>
                  <span className="text-xs text-earth-500">
                    {candidate.plans.length ? `${candidate.plans.length} 個可用方案` : "沒有可用方案"}
                  </span>
                </button>
              ))}
              {!candidates.length && (
                <p className="p-4 text-center text-sm text-earth-500">
                  找不到符合的本店學員。
                </p>
              )}
            </div>
          )}
        </section>

        {selectedCustomer && (
          <section className="space-y-3 rounded-xl border border-earth-200 bg-earth-50/60 p-4">
            <div>
              <span className="text-xs text-earth-500">已選學員</span>
              <p className="font-medium text-primary-900">
                {selectedCustomer.name} · {selectedCustomer.phone}
              </p>
            </div>

            {selectedCustomer.plans.length ? (
              <label className="block text-sm font-medium text-earth-700">
                本堂可用方案
                <select
                  className={field}
                  value={cardId}
                  required
                  onChange={(event) => {
                    setCardId(event.target.value);
                    setRequestKey(crypto.randomUUID());
                  }}
                >
                  <option value="">請選擇方案</option>
                  {selectedCustomer.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · 可用 {plan.available} {plan.unit === "SESSION" ? "堂" : "點"} · 到期 {formatTWDateTime(new Date(plan.expiresAt)).slice(0,10)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                這位學員目前沒有可用於本堂課的有效方案。
              </p>
            )}

            {selectedPlan && (
              <p className="text-sm text-earth-600">
                本次先保留 {selectedPlan.cost} {selectedPlan.unit === "SESSION" ? "堂" : "點"}，出席後才正式扣抵。
              </p>
            )}
          </section>
        )}

        <label className="block text-sm font-medium text-earth-700">
          本次備註
          <textarea
            className={`${field} min-h-24 resize-y`}
            name="notes"
            maxLength={1000}
            placeholder="選填"
          />
        </label>
      </form>

      <footer className="border-t border-earth-200 bg-white p-4">
        <button
          form="course-manager-booking-form"
          type="submit"
          className={`${primary} w-full`}
          disabled={pending || !selectedCustomer || !selectedPlan}
        >
          {pending ? "排課中…" : "確認排課"}
        </button>
      </footer>
    </RightSheet>
  );
}
