"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { formatTWDateTime } from "@/lib/date-utils";
import { createCustomer } from "@/server/actions/customer";
import { loadCourseSessionDetail } from "@/server/actions/course-members";
import { createCourseTrial } from "@/server/actions/course-trial";

const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} bg-primary-700 text-white`;
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";

type SessionOption = {
  id: string;
  nameSnapshot: string;
  startsAt: string;
};

type TrialDetail = {
  settings: {
    trialEnabled: boolean;
    trialDefaultPrice: number;
    trialAllowPriceEdit: boolean;
    trialMinPrice: number;
    trialMaxPrice: number;
  };
  canCreate: boolean;
  customers: { id: string; name: string; phone: string }[];
};

export function CourseTrialQuickModal({
  open,
  sessions,
  onClose,
}: {
  open: boolean;
  sessions: SessionOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [trial, setTrial] = useState<TrialDetail | null>(null);
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const activeSessionId =
    sessions.some((session) => session.id === sessionId)
      ? sessionId
      : sessions[0]?.id ?? "";

  useEffect(() => {
    if (!open || !activeSessionId) return;

    let active = true;
    loadCourseSessionDetail(activeSessionId)
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setError(result.error ?? "讀取體驗設定失敗");
          return;
        }
        setTrial(result.data.trial as TrialDetail);
        setCustomerId("");
        setQuery("");
        setCreatingNew(false);
        setRequestKey(crypto.randomUUID());
      })
      .catch(() => active && setError("讀取失敗，請重試"));
    return () => {
      active = false;
    };
  }, [open, activeSessionId]);

  const selectedSession = sessions.find((session) => session.id === activeSessionId);
  const matches = useMemo(() => {
    if (!trial) return [];
    const q = query.trim().toLocaleLowerCase();
    if (!q) return trial.customers.slice(0, 8);
    return trial.customers
      .filter(
        (customer) =>
          customer.name.toLocaleLowerCase().includes(q) ||
          customer.phone.includes(query.replace(/\D/g, "")),
      )
      .slice(0, 8);
  }, [query, trial]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trial || !activeSessionId || pending) return;
    const data = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        let targetCustomerId = customerId;
        if (creatingNew) {
          const created = await createCustomer({
            name: String(data.get("name") ?? ""),
            phone: String(data.get("phone") ?? ""),
          });
          if (!created.success) {
            if (created.existingCustomerId) {
              targetCustomerId = created.existingCustomerId;
            } else {
              setError(created.error ?? "建立體驗客失敗");
              return;
            }
          } else {
            targetCustomerId = created.data.customerId;
          }
        }

        if (!targetCustomerId) {
          setError("請選擇既有顧客，或建立新體驗客");
          return;
        }

        const result = await createCourseTrial({
          sessionId: activeSessionId,
          customerId: targetCustomerId,
          price: Number(data.get("price")),
          notes: String(data.get("notes") ?? ""),
          requestKey,
        });
        if (!result.success) {
          setError(result.error ?? "建立體驗預約失敗");
          setRequestKey(crypto.randomUUID());
          return;
        }

        router.refresh();
        onClose();
      } catch {
        setError("連線失敗，請重試");
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
      width={620}
      labelledById="course-trial-modal-title"
    >
      <header className="flex items-center justify-between border-b border-earth-200 bg-primary-50/60 px-5 py-3">
        <div>
          <h2 id="course-trial-modal-title" className="font-semibold text-primary-900">
            ＋ 體驗客
          </h2>
          <p className="mt-1 text-sm text-earth-600">找到既有顧客就直接加入；沒有資料可在這裡快速建檔。</p>
        </div>
        <button type="button" className={button} onClick={onClose} disabled={pending}>
          關閉
        </button>
      </header>

      <form id="course-trial-quick-form" onSubmit={submit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="rounded-xl border border-earth-200 bg-earth-50/60 p-3">
          {sessions.length > 1 ? (
            <label className="block text-sm font-medium text-earth-700">
              加入課程
              <select
                className={field}
                value={activeSessionId}
                onChange={(event) => setSessionId(event.target.value)}
                required
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatTWDateTime(new Date(session.startsAt)).slice(11)} · {session.nameSnapshot}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="font-medium text-primary-900">
              {selectedSession
                ? `${formatTWDateTime(new Date(selectedSession.startsAt)).slice(11)} · ${selectedSession.nameSnapshot}`
                : "當日尚無可加入的課程"}
            </p>
          )}
        </section>

        {!trial ? (
          <p className="text-sm text-earth-500">讀取體驗設定中…</p>
        ) : !trial.canCreate || !trial.settings.trialEnabled ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            本店目前未開放建立體驗預約。
          </p>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">體驗客</h3>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    setCreatingNew((value) => !value);
                    setCustomerId("");
                    setQuery("");
                  }}
                >
                  {creatingNew ? "改選既有顧客" : "＋ 建立新體驗客"}
                </button>
              </div>

              {creatingNew ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-earth-700">
                    姓名
                    <input className={field} name="name" required maxLength={100} />
                  </label>
                  <label className="text-sm font-medium text-earth-700">
                    手機
                    <input
                      className={field}
                      name="phone"
                      required
                      inputMode="tel"
                      placeholder="09xxxxxxxx"
                      maxLength={20}
                    />
                  </label>
                  <p className="sm:col-span-2 text-sm text-earth-500">
                    手機若已存在，系統會直接使用既有顧客，不重複建檔。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    className={field}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setCustomerId("");
                    }}
                    placeholder="搜尋姓名或手機"
                    aria-label="搜尋既有顧客"
                  />
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-earth-200">
                    {matches.map((customer) => (
                      <label
                        key={customer.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-earth-100 px-3 py-2 last:border-b-0 hover:bg-primary-50"
                      >
                        <input
                          type="radio"
                          name="existingCustomer"
                          value={customer.id}
                          checked={customerId === customer.id}
                          onChange={() => setCustomerId(customer.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate">{customer.name}</strong>
                          <span className="text-xs text-earth-500">{customer.phone}</span>
                        </span>
                      </label>
                    ))}
                    {!matches.length && (
                      <div className="p-4 text-center text-sm text-earth-500">
                        找不到顧客，可直接按「建立新體驗客」。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-earth-700">
                體驗金額
                <input
                  className={field}
                  name="price"
                  type="number"
                  required
                  readOnly={!trial.settings.trialAllowPriceEdit}
                  min={trial.settings.trialMinPrice}
                  max={trial.settings.trialMaxPrice}
                  key={`trial-price-${activeSessionId}-${trial.settings.trialDefaultPrice}`}
                  defaultValue={trial.settings.trialDefaultPrice}
                />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-earth-700">
                本次備註
                <textarea className={`${field} min-h-24`} name="notes" maxLength={1000} />
              </label>
            </div>
          </>
        )}
      </form>

      <footer className="border-t border-earth-200 bg-white p-4">
        <button
          type="submit"
          form="course-trial-quick-form"
          className={`${primary} w-full`}
          disabled={
            pending ||
            !trial ||
            !trial.canCreate ||
            !trial.settings.trialEnabled ||
            !activeSessionId ||
            (!creatingNew && !customerId)
          }
        >
          {pending ? "建立中…" : "建立並加入課程"}
        </button>
      </footer>
    </RightSheet>
  );
}
