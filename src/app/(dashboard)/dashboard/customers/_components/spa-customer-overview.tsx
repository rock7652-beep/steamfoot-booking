"use client";
import { useState, useTransition } from "react";
import { DashboardLink } from "@/components/dashboard-link";
import {
  saveSpaCustomerNote,
  getSpaCustomerProfile,
} from "@/server/actions/spa-customer-profile";
import type { SpaCustomerSummary } from "@/server/queries/spa-customer-summary";
export type SpaCustomerProfile = Extract<
  Awaited<ReturnType<typeof getSpaCustomerProfile>>,
  { success: true }
>;
export function SpaCustomerOverview({
  customer,
  profile,
  canEdit,
  canBook,
  canReadBookings,
  onSaved,
}: {
  customer: SpaCustomerSummary;
  profile: SpaCustomerProfile;
  canEdit: boolean;
  canBook: boolean;
  canReadBookings: boolean;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(profile.customer.serviceNote ?? ""),
    [previous, setPrevious] = useState(profile.customer.serviceNote),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-earth-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">基本資料</h3>
            <p className="mt-2">{profile.customer.name}</p>
            <p className="text-sm text-earth-500">
              {profile.customer.phone?.startsWith("_")
                ? "未填電話"
                : profile.customer.phone || "未填電話"}
            </p>
          </div>
          {canEdit && (
            <DashboardLink
              href={`/dashboard/customers/${encodeURIComponent(customer.id)}/edit`}
              className="text-sm underline"
            >
              編輯資料
            </DashboardLink>
          )}
        </div>
      </section>
      <section
        hidden={!canReadBookings}
        className="rounded-xl border border-earth-200 p-4"
      >
        <h3 className="font-bold">來店與預約</h3>
        <p className="mt-2 text-sm">
          最近來店：{customer.lastVisit ?? "尚無完成服務紀錄"}
        </p>
        <p className="mt-1 text-sm">
          下次預約：{customer.nextVisit ?? "尚未預約"}
        </p>
        {canBook && (
          <DashboardLink
            href={`/dashboard/spa-schedule?customerId=${encodeURIComponent(customer.id)}&new=1`}
            className="mt-4 inline-block rounded-lg bg-earth-800 px-4 py-3 text-white"
          >
            ＋為這位顧客預約
          </DashboardLink>
        )}
      </section>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setNotice("");
          start(async () => {
            try {
              const r = await saveSpaCustomerNote({
                customerId: customer.id,
                serviceNote: note,
                previousNote: previous,
              });
              if (!r.success) {
                setError(r.error);
                return;
              }
              setPrevious(r.serviceNote);
              setNote(r.serviceNote ?? "");
              setNotice("備註已儲存");
              onSaved();
            } catch {
              setError("儲存失敗，內容已保留，請重試。");
            }
          });
        }}
      >
        <label htmlFor="spa-service-note" className="block font-bold">
          服務偏好與注意事項
        </label>
        <p className="text-sm text-earth-500">
          僅供店內服務參考，例如力道偏好、指定人員或需留意事項。
        </p>
        {canEdit ? (
          <>
            <textarea
              id="spa-service-note"
              rows={5}
              maxLength={2000}
              disabled={pending}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：喜歡輕力道，服務前先確認當天需求。"
              className="w-full resize-y rounded-xl border p-3"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-earth-500">{note.length}/2000</span>
              <button
                disabled={pending || note === (previous ?? "")}
                className="rounded-lg bg-earth-800 px-4 py-2 text-white disabled:opacity-50"
              >
                {pending ? "儲存中…" : "儲存備註"}
              </button>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap rounded-xl bg-earth-50 p-3">
            {note || "尚無服務備註"}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}{" "}
            <button
              type="button"
              disabled={pending}
              className="underline"
              onClick={() =>
                start(async () => {
                  try {
                    const r = await getSpaCustomerProfile(customer.id);
                    if (r.success) {
                      setNote(r.customer.serviceNote ?? "");
                      setPrevious(r.customer.serviceNote);
                      setError("");
                      setNotice("已讀取最新備註");
                    } else setError(r.error);
                  } catch {
                    setError("讀取失敗，請重試。");
                  }
                })
              }
            >
              重新讀取，取代未儲存內容
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="text-green-700">
            {notice}
          </p>
        )}
      </form>
    </div>
  );
}
export function SpaServiceHistory({
  profile,
}: {
  profile: SpaCustomerProfile | null;
}) {
  const labels: Record<string, string> = {
    PENDING: "待確認",
    CONFIRMED: "已預約",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    NO_SHOW: "未到",
  };
  return (
    <section>
      <h3 className="mb-3 font-bold">服務紀錄（最近 100 筆）</h3>
      {profile ? (
        profile.bookings.length ? (
          profile.bookings.map((b) => (
            <details key={b.id} className="border-b py-3">
              <summary className="cursor-pointer text-sm">
                {b.date} {b.startTime} · {b.service} ·{" "}
                {labels[b.status] ?? b.status}
              </summary>
              <p className="mt-2 text-sm text-earth-500">
                {b.startTime}–{b.endTime} · {b.staff}
              </p>
            </details>
          ))
        ) : (
          <p className="text-sm text-earth-500">尚無服務紀錄</p>
        )
      ) : (
        <p role="status">讀取服務紀錄中…</p>
      )}
    </section>
  );
}
