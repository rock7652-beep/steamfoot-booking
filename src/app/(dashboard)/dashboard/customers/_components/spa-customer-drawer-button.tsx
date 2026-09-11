"use client";
import { useEffect, useRef, useState } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { getSpaCustomerDrawer } from "@/server/actions/spa-customer-drawer";
import { AccountPanel } from "./spa-customers-workspace";

type Loaded = Extract<
  Awaited<ReturnType<typeof getSpaCustomerDrawer>>,
  { success: true }
>;
export function SpaCustomerDrawerButton({
  customerId,
}: {
  customerId: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center whitespace-nowrap text-primary-700 underline underline-offset-4"
      >
        查看顧客
      </button>
      {open && (
        <CustomerDrawer
          customerId={customerId}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
function CustomerDrawer({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    data: Loaded;
    request: Promise<Loaded["profile"]>;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getSpaCustomerDrawer(customerId)
      .then((result) => {
        if (!active) return;
        if (result.success)
          setLoaded({ data: result, request: Promise.resolve(result.profile) });
        else setError(result.error);
      })
      .catch(() => {
        if (active) setError("顧客資料讀取失敗，請重試。");
      });
    return () => {
      active = false;
    };
  }, [customerId, retry]);
  if (loaded)
    return (
      <AccountPanel
        customer={loaded.data.customer}
        permissions={loaded.data.permissions}
        profileRequest={loaded.request}
        onChanged={() => {}}
        onClose={onClose}
      />
    );
  return (
    <RightSheet
      open
      onClose={onClose}
      width={620}
      labelledById="spa-customer-loading-title"
    >
      <header className="flex items-center justify-between border-b border-earth-200 p-5">
        <h2 id="spa-customer-loading-title" className="text-xl font-bold">
          顧客資料
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 px-3">
          關閉
        </button>
      </header>
      <div className="p-5">
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setError("");
                setRetry((v) => v + 1);
              }}
              className="mt-3 min-h-11 rounded-lg bg-primary-700 px-4 text-white"
            >
              重新讀取
            </button>
          </div>
        ) : (
          <p role="status">讀取顧客資料中…</p>
        )}
      </div>
    </RightSheet>
  );
}
