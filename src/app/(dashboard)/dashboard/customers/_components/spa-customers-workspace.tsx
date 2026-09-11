"use client";
import {
  SPA_PAYMENT_LABELS,
  SPA_EXTERNAL_PAYMENT_METHODS,
  SPA_COLLECTION_HINTS,
  isSpaExternalPayment,
  type SpaExternalPaymentMethod,
} from "@/lib/spa-payment-methods";
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
const methodName = SPA_PAYMENT_LABELS;
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
            const request = loadProfile(customer.id);
            setSelected((current) =>
              current?.id === customer.id
                ? { id: customer.id, request }
                : current,
            );
            router.refresh();
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
export function AccountPanel({
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
  const [historyTab, setHistoryTab] = useState<
    "service" | "payments" | "wallet" | "refunds"
  >(canReadBookings ? "service" : "payments");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [showPastPlans, setShowPastPlans] = useState(false);
  const inRange = (at: string) => {
    const day = toLocalDateStr(new Date(at));
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  };
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
  const [transferLast4, setTransferLast4] = useState("");
  const [mode, setMode] = useState<"PACKAGE" | "TOPUP" | null>(null),
    [packageId, setPackageId] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<SpaExternalPaymentMethod>("CASH"),
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
  const historyScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    historyScroll.current?.scrollTo({ top: 0 });
  }, [tab, historyTab]);
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-earth-100 bg-white px-5 pt-5">
          <header className="flex items-center justify-between gap-3 pb-3">
            <h2
              id="spa-account-title"
              className="min-w-0 break-words text-xl font-bold"
            >
              {customer.name}
              <span className="mt-1 block text-sm font-normal text-earth-500">
                {customer.phone && !customer.phone.startsWith("_")
                  ? customer.phone
                  : "未填電話"}
              </span>
            </h2>
            <button
              className="shrink-0 rounded-lg px-3 py-2"
              disabled={pending}
              onClick={onClose}
            >
              關閉
            </button>
          </header>
          <nav aria-label="顧客資料分頁" className="flex gap-1 bg-white pb-2">
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
                className={`flex-1 rounded-lg px-2 py-3 text-sm ${tab === value ? "bg-[#E8EDDF] font-bold text-[#4B5E3B]" : "text-earth-500"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "history" && (
            <nav aria-label="紀錄分類" className="flex gap-2 pb-3">
              {(
                [
                  ...(canReadBookings ? [["service", "服務"]] : []),
                  ...(canReadAccounts
                    ? [
                        ["payments", "收款"],
                        ["wallet", "儲值"],
                        ["refunds", "退款"],
                      ]
                    : []),
                ] as [typeof historyTab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={pending || !!refund}
                  aria-pressed={historyTab === value}
                  onClick={() => {
                    setHistoryTab(value);
                    setHistoryStatus("");
                  }}
                  className={`flex-1 rounded-lg px-2 py-2 text-sm ${historyTab === value ? "bg-[#596D45] text-white" : "bg-earth-50"}`}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
        {profileError && (
          <p role="alert" className="text-red-700">
            {profileError}{" "}
            <button onClick={() => setProfileRetry((v) => v + 1)}>
              重新讀取
            </button>
          </p>
        )}
        <div hidden={tab !== "overview"} className="min-h-0 flex-1">
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
        <div
          ref={historyScroll}
          hidden={tab === "overview"}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5"
        >
          {tab === "history" && (
            <div className="space-y-2 rounded-xl bg-earth-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="min-w-0 text-xs text-earth-600">
                  開始日期
                  <input
                    aria-label="紀錄開始日期"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 block w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-sm"
                  />
                </label>
                <label className="min-w-0 text-xs text-earth-600">
                  結束日期
                  <input
                    aria-label="紀錄結束日期"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 block w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                {historyTab !== "refunds" && (
                  <select
                    aria-label="紀錄狀態"
                    value={historyStatus}
                    onChange={(e) => setHistoryStatus(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-earth-200 bg-white p-2 text-sm"
                  >
                    <option value="">
                      全部{historyTab === "wallet" ? "異動" : "狀態"}
                    </option>
                    {(historyTab === "service"
                      ? [
                          ["CONFIRMED", "已預約"],
                          ["PENDING", "待確認"],
                          ["COMPLETED", "已完成"],
                          ["CANCELLED", "已取消"],
                          ["NO_SHOW", "未到"],
                        ]
                      : historyTab === "wallet"
                        ? [
                            ["IN", "增加額度"],
                            ["OUT", "扣除額度"],
                          ]
                        : [
                            ["ACTIVE", "未退款"],
                            ["REFUNDED", "已退款"],
                          ]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="shrink-0 px-2 py-2 text-sm text-[#596D45]"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setHistoryStatus("");
                  }}
                >
                  清除篩選
                </button>
              </div>
              <p className="text-xs text-earth-500">篩選目前已載入的最近紀錄</p>
              {dateFrom && dateTo && dateFrom > dateTo && (
                <p role="alert" className="text-sm text-red-700">
                  結束日期不可早於開始日期
                </p>
              )}
            </div>
          )}
          {tab === "history" && historyTab === "service" && canReadBookings && (
            <SpaServiceHistory
              profile={profile}
              dateFrom={dateFrom}
              dateTo={dateTo}
              status={historyStatus}
            />
          )}
          <div
            hidden={
              tab === "overview" ||
              !canReadAccounts ||
              (tab === "history" && historyTab === "service")
            }
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
                    <strong className="text-2xl text-[#596D45] tabular-nums">
                      {money(account.wallet?.balance ?? 0)}
                    </strong>
                    {account.wallet && account.wallet.status !== "ACTIVE" && (
                      <p>帳戶已停用</p>
                    )}
                  </section>
                  {canSell && !mode && !refund && (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        className="rounded-lg bg-[#596D45] p-3 text-white"
                        onClick={() => {
                          setMode("PACKAGE");
                          setConfirmed(false);
                        }}
                      >
                        購買方案
                      </button>
                      <button
                        className="rounded-lg border border-earth-200 p-3"
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
                      className="space-y-3 rounded-xl border border-earth-200 p-4"
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
                              ...(method === "TRANSFER"
                                ? { transferLast4 }
                                : {}),
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
                                className="mt-1 w-full rounded-lg border border-earth-200 p-3"
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
                              className="mt-1 w-full rounded-lg border border-earth-200 p-3"
                            />
                          </label>
                        )}
                        {(mode !== "PACKAGE" || pack) && (
                          <>
                            <div className="rounded-lg bg-earth-50 p-3">
                              <span>應收金額</span>
                              <strong className="ml-3 text-xl">
                                {money(
                                  mode === "PACKAGE"
                                    ? pack!.price
                                    : Number(amount) || 0,
                                )}
                              </strong>
                            </div>
                            <fieldset className="space-y-2">
                              <legend>收款方式</legend>
                              <div className="grid grid-cols-2 gap-3">
                                {SPA_EXTERNAL_PAYMENT_METHODS.map((value) => (
                                  <button
                                    key={value}
                                    type="button"
                                    aria-pressed={method === value}
                                    onClick={() => {
                                      setMethod(value);
                                      setTransferLast4("");
                                      setConfirmed(false);
                                    }}
                                    className={`rounded-lg border border-earth-200 p-3 ${method === value ? "border-earth-800 bg-[#596D45] text-white" : "bg-white"}`}
                                  >
                                    {methodName[value]}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            {method === "TRANSFER" && (
                              <label className="block">
                                轉出帳號後四碼
                                <input
                                  required
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]{4}"
                                  minLength={4}
                                  maxLength={4}
                                  value={transferLast4}
                                  onChange={(e) => {
                                    setTransferLast4(
                                      e.target.value.replace(/[^0-9]/g, ""),
                                    );
                                    setConfirmed(false);
                                  }}
                                  placeholder="例如 0123"
                                  className="mt-1 w-full rounded-lg border border-earth-200 p-3"
                                />
                              </label>
                            )}
                            <p className="text-sm text-earth-500">
                              {SPA_COLLECTION_HINTS[method]}
                            </p>
                            <label className="flex gap-2">
                              <input
                                type="checkbox"
                                required
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                              />
                              確認已收到上述金額
                            </label>
                          </>
                        )}
                        <div className="flex gap-3">
                          <button
                            disabled={
                              !confirmed || (mode === "PACKAGE" && !pack)
                            }
                            className="rounded-lg bg-[#596D45] p-3 text-white"
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
                        {isSpaExternalPayment(refund.method)
                          ? "請先透過原付款方式退回款項（現金、刷卡機、銀行或支付平台），再記錄退款；此操作不會自動退款至外部帳戶。"
                          : "將退回原儲值帳戶或原方案堂數，保留原有效期限。"}
                      </p>
                      <label className="block">
                        退款原因
                        <input
                          required
                          maxLength={300}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="mt-1 w-full rounded border border-earth-200 p-3"
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
                    {account.entitlements
                      .filter(
                        (e) =>
                          showPastPlans ||
                          (e.status === "ACTIVE" &&
                            e.remaining > 0 &&
                            (!e.expiryDate ||
                              e.expiryDate >= toLocalDateStr())),
                      )
                      .map((e) => (
                        <div
                          key={e.id}
                          className="rounded-lg border border-earth-200 p-3"
                        >
                          <strong>{e.name}</strong>
                          <p>
                            可用{" "}
                            {e.status === "ACTIVE" &&
                            (!e.expiryDate || e.expiryDate >= toLocalDateStr())
                              ? Math.max(0, e.remaining - e.reserved)
                              : 0}{" "}
                            次
                          </p>
                          <p className="text-sm text-earth-500">
                            預約保留 {e.reserved} 次 ·{" "}
                            {e.expiryDate
                              ? `到期日 ${e.expiryDate}`
                              : "無到期日"}{" "}
                            ·{" "}
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
                    {!account.entitlements.some(
                      (e) =>
                        e.status === "ACTIVE" &&
                        e.remaining > 0 &&
                        (!e.expiryDate || e.expiryDate >= toLocalDateStr()),
                    ) &&
                      !showPastPlans && (
                        <p className="py-3 text-sm text-earth-500">
                          目前沒有可用方案
                        </p>
                      )}
                    {account.entitlements.some(
                      (e) =>
                        e.status !== "ACTIVE" ||
                        e.remaining <= 0 ||
                        (e.expiryDate && e.expiryDate < toLocalDateStr()),
                    ) && (
                      <button
                        type="button"
                        aria-expanded={showPastPlans}
                        className="py-3 text-sm text-[#596D45]"
                        onClick={() => setShowPastPlans((v) => !v)}
                      >
                        {showPastPlans
                          ? "收起歷史方案"
                          : "查看已用完／到期／作廢方案"}
                      </button>
                    )}
                  </div>
                </section>
                <div hidden={tab !== "history"} className="space-y-5">
                  <section hidden={historyTab !== "payments"}>
                    <h3 className="mb-2 font-bold">
                      收款與結帳紀錄（最近 100 筆）
                    </h3>
                    {![...account.sales, ...account.receipts].some(
                      (r) =>
                        inRange(r.createdAt) &&
                        (!historyStatus ||
                          (historyStatus === "REFUNDED"
                            ? r.refunded
                            : !r.refunded)),
                    ) && (
                      <p className="py-3 text-sm text-earth-500">
                        沒有符合條件的收款紀錄
                      </p>
                    )}
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
                      .filter(
                        (r) =>
                          inRange(r.createdAt) &&
                          (!historyStatus ||
                            (historyStatus === "REFUNDED"
                              ? r.refunded
                              : !r.refunded)),
                      )
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((r) => (
                        <details
                          key={r.id}
                          className="border-b border-earth-100 py-3"
                        >
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
                            {r.transferLast4 &&
                              ` · 轉帳後四碼 ${r.transferLast4}`}
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
                  <section hidden={historyTab !== "wallet"}>
                    <h3 className="font-bold">儲值明細</h3>
                    {!account.entries.some(
                      (e) =>
                        inRange(e.createdAt) &&
                        (!historyStatus ||
                          (historyStatus === "IN"
                            ? e.amount >= 0
                            : e.amount < 0)),
                    ) && (
                      <p className="py-3 text-sm text-earth-500">
                        沒有符合條件的儲值明細
                      </p>
                    )}
                    {account.entries
                      .filter(
                        (e) =>
                          inRange(e.createdAt) &&
                          (!historyStatus ||
                            (historyStatus === "IN"
                              ? e.amount >= 0
                              : e.amount < 0)),
                      )
                      .map((e) => (
                        <p
                          key={e.id}
                          className="border-b border-earth-100 py-2 text-sm"
                        >
                          {date(e.createdAt)} · {e.amount >= 0 ? "+" : ""}
                          {money(e.amount)} · 餘額 {money(e.balanceAfter)}
                        </p>
                      ))}
                  </section>
                  <section hidden={historyTab !== "refunds"}>
                    <h3 className="font-bold">退款紀錄</h3>
                    {!account.refunds.some((r) => inRange(r.createdAt)) && (
                      <p className="py-3 text-sm text-earth-500">
                        沒有符合條件的退款紀錄
                      </p>
                    )}
                    {account.refunds
                      .filter((r) => inRange(r.createdAt))
                      .map((r) => (
                        <p
                          key={r.id}
                          className="border-b border-earth-100 py-2 text-sm"
                        >
                          {date(r.createdAt)} ·{" "}
                          {methodName[r.paymentMethod] ?? r.paymentMethod} ·{" "}
                          {r.paymentMethod === "ENTITLEMENT"
                            ? `${r.uses} 次`
                            : money(r.amount)}{" "}
                          · {r.reason}
                          {r.transferLast4 &&
                            ` · 原轉帳後四碼 ${r.transferLast4}`}
                        </p>
                      ))}
                  </section>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </RightSheet>
  );
}
