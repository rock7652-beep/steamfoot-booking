"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SpaCustomerList } from "./spa-customer-list";
import {
  SpaCustomerOverview,
  SpaServiceHistory,
  type SpaCustomerProfile,
} from "./spa-customer-overview";
import type { SpaCustomerSummary } from "@/server/queries/spa-customer-summary";
import type { SpaCustomerPermissions } from "./spa-customers";
import { getSpaCustomerProfile } from "@/server/actions/spa-customer-profile";
import { RightSheet } from "@/components/admin/right-sheet";
import { DashboardLink } from "@/components/dashboard-link";
import {
  getSpaCustomerAccount,
  purchaseSpaCredit,
  refundSpaPayment,
} from "@/server/actions/spa-commerce";
import { toLocalDateStr } from "@/lib/date-utils";
type Account = Extract<
  Awaited<ReturnType<typeof getSpaCustomerAccount>>,
  { success: true }
>;
const money = (n: number) => `NT$${n.toLocaleString()}`;
const methodName: Record<string, string> = {
  CASH: "現金",
  CARD: "刷卡",
  STORED_VALUE: "儲值",
  ENTITLEMENT: "方案扣次",
};
const date = (s: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(s));
export function SpaCustomersWorkspace({
  customers,
  search,
  ...permissions
}: {
  customers: SpaCustomerSummary[];
  search: string;
} & SpaCustomerPermissions) {
  const [selected, setSelected] = useState<{
    id: string;
    request: Promise<Awaited<ReturnType<typeof getSpaCustomerProfile>>>;
  } | null>(null);
  const router = useRouter();
  // Cache only for this mounted store/list revision; refresh invalidates notes and summaries together.
  const cache = useMemo(
    () => ({
      rows: customers,
      requests: new Map<
        string,
        Promise<Awaited<ReturnType<typeof getSpaCustomerProfile>>>
      >(),
    }),
    [customers],
  );
  const loadProfile = (id: string) => {
    let request = cache.requests.get(id);
    if (!request) {
      request = getSpaCustomerProfile(id)
        .then((r) => {
          if (!r.success) cache.requests.delete(id);
          return r;
        })
        .catch((e) => {
          cache.requests.delete(id);
          throw e;
        });
      cache.requests.set(id, request);
    }
    return request;
  };
  const customer = customers.find((c) => c.id === selected?.id);
  const profileRequest = selected?.request;
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <SpaCustomerList
        customers={customers}
        search={search}
        permissions={permissions}
        onOpen={(c) => setSelected({ id: c.id, request: loadProfile(c.id) })}
        onPrefetch={(id) => {
          void loadProfile(id).catch(() => {});
        }}
      />
      {customer && profileRequest && (
        <AccountPanel
          key={customer.id}
          customer={customer}
          permissions={permissions}
          profileRequest={profileRequest}
          onChanged={() => {
            cache.requests.delete(customer.id);
            setSelected({ id: customer.id, request: loadProfile(customer.id) });
            router.refresh();
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
function AccountPanel({
  customer,
  permissions,
  profileRequest,
  onChanged,
  onClose,
}: {
  customer: SpaCustomerSummary;
  permissions: SpaCustomerPermissions;
  profileRequest: Promise<Awaited<ReturnType<typeof getSpaCustomerProfile>>>;
  onChanged: () => void;
  onClose: () => void;
}) {
  const customerId = customer.id;
  const {
    canSell,
    canRefund,
    canReadAccounts,
    canReadBookings,
    canEdit,
    canBook,
  } = permissions;
  const [tab, setTab] = useState<"overview" | "credit" | "history">("overview");
  const [profile, setProfile] = useState<SpaCustomerProfile | null>(null),
    [profileError, setProfileError] = useState("");
  const [profileRetry, setProfileRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const request = profileRetry
      ? getSpaCustomerProfile(customerId)
      : profileRequest;
    request
      .then((r) => {
        if (live) {
          if (r.success) {
            setProfile(r);
            setProfileError("");
          } else setProfileError(r.error);
        }
      })
      .catch(() => {
        if (live) setProfileError("顧客資料讀取失敗");
      });
    return () => {
      live = false;
    };
  }, [customerId, profileRequest, profileRetry]);
  const [account, setAccount] = useState<Account | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0),
    [pending, start] = useTransition();
  const [mode, setMode] = useState<"PACKAGE" | "TOPUP" | null>(null),
    [packageId, setPackageId] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<"CASH" | "CARD">("CASH"),
    [confirmed, setConfirmed] = useState(false),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [refund, setRefund] = useState<{
      kind: "SALE" | "RECEIPT";
      id: string;
      label: string;
      method: string;
    } | null>(null),
    [reason, setReason] = useState("");
  useEffect(() => {
    if (!canReadAccounts || tab === "overview") return;
    let live = true;
    getSpaCustomerAccount(customerId)
      .then((r) => {
        if (live) {
          if (r.success) {
            setAccount(r);
            setError("");
          } else setError(r.error);
        }
      })
      .catch(() => {
        if (live) setError("讀取失敗，請重試。");
      });
    return () => {
      live = false;
    };
  }, [customerId, revision, canReadAccounts, tab]);
  const refundForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (refund)
      refundForm.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [refund]);
  const pack = account?.packages.find((p) => p.id === packageId);
  const reset = () => {
    setAccount(null);
    setMode(null);
    setRefund(null);
    setConfirmed(false);
    setRequestKey(crypto.randomUUID());
    setRevision((v) => v + 1);
    onChanged();
  };
  return (
    <RightSheet
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      width={620}
      labelledById="spa-account-title"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
        <header className="flex items-center justify-between">
          <h2 id="spa-account-title" className="text-xl font-bold">
            {customer.name}
          </h2>
          <button disabled={pending} onClick={onClose}>
            關閉
          </button>
        </header>
        <nav
          aria-label="顧客資料分頁"
          className="sticky top-0 z-10 flex gap-1 border-b bg-white pb-2"
        >
          {(
            [
              ["overview", "顧客概況"],
              ...(canReadAccounts ? [["credit", "方案與儲值"]] : []),
              ...(canReadAccounts || canReadBookings
                ? [["history", "服務與帳務紀錄"]]
                : []),
            ] as [typeof tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              disabled={pending || !!mode || !!refund}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-lg px-2 py-3 text-sm ${tab === value ? "bg-earth-100 font-bold" : "text-earth-500"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {profileError && (
          <p role="alert" className="text-red-700">
            {profileError}{" "}
            <button onClick={() => setProfileRetry((v) => v + 1)}>
              重新讀取
            </button>
          </p>
        )}
        <div hidden={tab !== "overview"}>
          {profile ? (
            <SpaCustomerOverview
              customer={customer}
              profile={profile}
              canEdit={canEdit}
              canBook={canBook}
              canReadBookings={canReadBookings}
              onSaved={onChanged}
            />
          ) : (
            <p role="status">讀取顧客資料中…</p>
          )}
        </div>
        {tab === "history" && canReadBookings && (
          <SpaServiceHistory profile={profile} />
        )}
        <div
          hidden={tab === "overview" || !canReadAccounts}
          className="space-y-5"
        >
          {error && (
            <p role="alert" className="text-red-700">
              {error}{" "}
              <button onClick={() => setRevision((v) => v + 1)}>
                重新讀取
              </button>
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-green-50 p-3">
              {notice}
            </p>
          )}
          {!account ? (
            <p>讀取中…</p>
          ) : (
            <>
              <div hidden={tab !== "credit"} className="space-y-5">
                <section className="rounded-xl bg-earth-50 p-4">
                  <p>儲值餘額</p>
                  <strong className="text-2xl">
                    {money(account.wallet?.balance ?? 0)}
                  </strong>
                  {account.wallet && account.wallet.status !== "ACTIVE" && (
                    <p>帳戶已停用</p>
                  )}
                </section>
                {canSell && !mode && !refund && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="rounded-lg bg-earth-800 p-3 text-white"
                      onClick={() => {
                        setMode("PACKAGE");
                        setConfirmed(false);
                      }}
                    >
                      購買方案
                    </button>
                    <button
                      className="rounded-lg border p-3"
                      onClick={() => {
                        setMode("TOPUP");
                        setConfirmed(false);
                      }}
                    >
                      儲值加值
                    </button>
                  </div>
                )}
                {mode && (
                  <form
                    className="space-y-3 rounded-xl border p-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!confirmed) return;
                      setError("");
                      start(async () => {
                        try {
                          const r = await purchaseSpaCredit({
                            customerId,
                            kind: mode,
                            amount:
                              mode === "PACKAGE"
                                ? (pack?.price ?? -1)
                                : Number(amount),
                            paymentMethod: method,
                            requestKey,
                            ...(mode === "PACKAGE"
                              ? {
                                  packageId,
                                  expectedPackageUpdatedAt: pack?.updatedAt,
                                }
                              : {}),
                          });
                          if (!r.success) {
                            setError(r.error);
                            return;
                          }
                          setNotice(
                            mode === "PACKAGE"
                              ? "方案已購買，堂數已入帳。"
                              : "加值完成，餘額已更新。",
                          );
                          reset();
                        } catch {
                          setError("連線失敗，請重試同一筆；不會重複入帳。");
                        }
                      });
                    }}
                  >
                    <fieldset disabled={pending} className="space-y-3">
                      <legend className="font-bold">
                        {mode === "PACKAGE" ? "購買方案" : "儲值加值"}
                      </legend>
                      {mode === "PACKAGE" ? (
                        <>
                          <label className="block">
                            方案
                            <select
                              required
                              value={packageId}
                              onChange={(e) => {
                                setPackageId(e.target.value);
                                setConfirmed(false);
                              }}
                              className="mt-1 w-full rounded-lg border p-3"
                            >
                              <option value="">請選擇方案</option>
                              {account.packages.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} · {p.uses} 次 · {money(p.price)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {pack && (
                            <p>
                              今日起生效，有效 {pack.validityDays}{" "}
                              天（含今日）。應收 {money(pack.price)}。
                            </p>
                          )}
                          {!account.packages.length && (
                            <DashboardLink
                              href="/dashboard/plans"
                              className="underline"
                            >
                              先到方案管理建立方案
                            </DashboardLink>
                          )}
                        </>
                      ) : (
                        <label className="block">
                          加值金額
                          <input
                            required
                            type="number"
                            min={1}
                            max={9999999}
                            step={1}
                            value={amount}
                            onChange={(e) => {
                              setAmount(e.target.value);
                              setConfirmed(false);
                            }}
                            className="mt-1 w-full rounded-lg border p-3"
                          />
                        </label>
                      )}
                      <label className="block">
                        收款方式
                        <select
                          value={method}
                          onChange={(e) => {
                            setMethod(e.target.value as "CASH" | "CARD");
                            setConfirmed(false);
                          }}
                          className="ml-3 rounded border p-2"
                        >
                          <option value="CASH">現金</option>
                          <option value="CARD">刷卡</option>
                        </select>
                      </label>
                      {method === "CARD" && (
                        <p className="text-sm">請先在店內刷卡機完成收款。</p>
                      )}
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          required
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        確認已收到上述金額
                      </label>
                      <div className="flex gap-3">
                        <button
                          disabled={!confirmed || (mode === "PACKAGE" && !pack)}
                          className="rounded-lg bg-earth-800 p-3 text-white"
                        >
                          {pending ? "處理中…" : "確認收款並入帳"}
                        </button>
                        <button type="button" onClick={() => setMode(null)}>
                          返回
                        </button>
                      </div>
                    </fieldset>
                  </form>
                )}
              </div>
              {refund && (
                <form
                  ref={refundForm}
                  className="space-y-3 rounded-xl border border-red-200 p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!confirmed) return;
                    setError("");
                    start(async () => {
                      try {
                        const r = await refundSpaPayment({
                          kind: refund.kind,
                          id: refund.id,
                          reason,
                        });
                        if (!r.success) {
                          setError(r.error);
                          return;
                        }
                        setNotice("已完成全額退款／退回堂數，紀錄已保留。");
                        reset();
                      } catch {
                        setError("連線失敗，請重試；不會重複退款。");
                      }
                    });
                  }}
                >
                  <fieldset disabled={pending} className="space-y-3">
                    <legend className="font-bold">
                      全額退款 · {refund.label}
                    </legend>
                    <p>
                      {refund.method === "CASH" || refund.method === "CARD"
                        ? "請確認已透過原付款方式退回款項；刷卡退款需先在刷卡機操作。"
                        : "將退回原儲值帳戶或原方案堂數，保留原有效期限。"}
                    </p>
                    <label className="block">
                      退款原因
                      <input
                        required
                        maxLength={300}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-1 w-full rounded border p-3"
                      />
                    </label>
                    <label className="flex gap-2">
                      <input
                        required
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      確認退款內容
                    </label>
                    <button
                      disabled={!confirmed}
                      className="rounded-lg bg-red-700 p-3 text-white"
                    >
                      確認全額退回
                    </button>
                    <button
                      type="button"
                      className="ml-3"
                      onClick={() => setRefund(null)}
                    >
                      返回
                    </button>
                  </fieldset>
                </form>
              )}
              <section hidden={tab !== "credit"}>
                <h3 className="mb-2 font-bold">顧客方案</h3>
                <div className="space-y-2">
                  {account.entitlements.map((e) => (
                    <div key={e.id} className="rounded-lg border p-3">
                      <strong>{e.name}</strong>
                      <p>
                        剩餘 {e.remaining} 次 · 已保留 {e.reserved} 次 · 可用{" "}
                        {e.status === "ACTIVE" &&
                        (!e.expiryDate || e.expiryDate >= toLocalDateStr())
                          ? Math.max(0, e.remaining - e.reserved)
                          : 0}{" "}
                        次
                      </p>
                      <p className="text-sm text-earth-500">
                        {e.expiryDate ? `到期日 ${e.expiryDate}` : "無到期日"} ·{" "}
                        {e.status === "VOIDED"
                          ? "已退購／作廢"
                          : e.expiryDate && e.expiryDate < toLocalDateStr()
                            ? "已到期"
                            : e.status === "EXHAUSTED"
                              ? "已用完"
                              : "方案紀錄"}
                      </p>
                    </div>
                  ))}
                  {!account.entitlements.length && <p>尚無方案</p>}
                </div>
              </section>
              <div hidden={tab !== "history"} className="space-y-5">
                <section>
                  <h3 className="mb-2 font-bold">
                    收款與結帳紀錄（最近 100 筆）
                  </h3>
                  {[
                    ...account.sales.map((s) => ({
                      ...s,
                      kind: "SALE" as const,
                      uses: null,
                    })),
                    ...account.receipts.map((r) => ({
                      ...r,
                      kind: "RECEIPT" as const,
                    })),
                  ]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((r) => (
                      <details key={r.id} className="border-b py-3">
                        <summary className="cursor-pointer">
                          <strong>{r.name}</strong>
                          <span className="block text-sm">
                            {methodName[r.paymentMethod]} ·{" "}
                            {r.paymentMethod === "ENTITLEMENT"
                              ? `${r.uses} 次`
                              : money(r.amount)}{" "}
                            · {r.refunded ? "已退款" : "已完成"}
                          </span>
                        </summary>
                        <p className="mt-2 text-xs text-earth-500">
                          {date(r.createdAt)}
                        </p>
                        {canRefund &&
                          !r.refunded &&
                          !mode &&
                          !refund &&
                          !(
                            r.kind === "SALE" &&
                            "sourceId" in r &&
                            "kind" in r &&
                            account.sales.find((s) => s.id === r.id)?.kind ===
                              "PACKAGE" &&
                            (() => {
                              const e = account.entitlements.find(
                                (e) => e.id === r.sourceId,
                              );
                              return (
                                !e ||
                                e.remaining !== e.total ||
                                e.reserved > 0 ||
                                e.status === "VOIDED"
                              );
                            })()
                          ) &&
                          !(
                            r.kind === "SALE" &&
                            account.sales.find((s) => s.id === r.id)?.kind ===
                              "TOPUP" &&
                            (account.wallet?.balance ?? 0) < r.amount
                          ) && (
                            <button
                              className="mt-1 text-sm text-red-700 underline"
                              onClick={() => {
                                setRefund({
                                  kind: r.kind,
                                  id: r.id,
                                  label: `${r.name} · ${r.paymentMethod === "ENTITLEMENT" ? `${r.uses} 次` : money(r.amount)}`,
                                  method: r.paymentMethod,
                                });
                                setReason("");
                                setConfirmed(false);
                              }}
                            >
                              全額退款／退回
                            </button>
                          )}
                      </details>
                    ))}
                </section>
                <details>
                  <summary className="cursor-pointer font-bold">
                    儲值明細
                  </summary>
                  {account.entries.map((e) => (
                    <p key={e.id} className="border-b py-2 text-sm">
                      {date(e.createdAt)} · {e.amount >= 0 ? "+" : ""}
                      {money(e.amount)} · 餘額 {money(e.balanceAfter)}
                    </p>
                  ))}
                </details>
                <details>
                  <summary className="cursor-pointer font-bold">
                    退款紀錄
                  </summary>
                  {account.refunds.map((r) => (
                    <p key={r.id} className="border-b py-2 text-sm">
                      {date(r.createdAt)} ·{" "}
                      {r.paymentMethod === "ENTITLEMENT"
                        ? `${r.uses} 次`
                        : money(r.amount)}{" "}
                      · {r.reason}
                    </p>
                  ))}
                </details>
              </div>
            </>
          )}
        </div>
      </div>
    </RightSheet>
  );
}
