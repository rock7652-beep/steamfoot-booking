"use client";

import { useRef, useState } from "react";
import {
  createHealthflowEntryUrl,
  type CreateHealthflowEntryUrlResult,
} from "@/server/actions/liff-health";

const START_LABEL = "前往量測";
const LOADING_LABEL = "正在前往…";

type EntryFailureStatus = Exclude<
  CreateHealthflowEntryUrlResult["status"],
  "ok"
>;

const ERROR_MESSAGES: Record<EntryFailureStatus, string> = {
  no_customer: "目前無法辨識顧客資料，請重新登入或聯繫門市。",
  store_mismatch: "目前登入資料與此門市不一致，請由原門市入口進入。",
  feature_unavailable: "此門市目前尚未開放健康評估。",
  service_unavailable: "健康評估服務暫時無法使用，請稍後再試。",
};

const CLIENT_ERROR_MESSAGE = "健康評估服務暫時無法使用，請稍後再試。";

export function getHealthflowEntryErrorMessage(status: EntryFailureStatus) {
  return ERROR_MESSAGES[status];
}

type CreateEntryUrlAction = (
  storeSlug: string,
) => Promise<CreateHealthflowEntryUrlResult>;

type Navigate = (url: string) => void;

export type StartHealthflowEntryResult =
  | { outcome: "navigated" }
  | { outcome: "failed"; status: EntryFailureStatus; requestId: string }
  | { outcome: "ignored" };
type InFlightRef = { current: boolean };

export function formatHealthflowEntryErrorCode(requestId: string) {
  const suffix = requestId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `HF-${suffix || "UNKNOWN"}`;
}

export async function startHealthflowEntryNavigation({
  storeSlug,
  createEntryUrl = createHealthflowEntryUrl,
  navigate,
  inFlightRef,
}: {
  storeSlug: string;
  createEntryUrl?: CreateEntryUrlAction;
  navigate: Navigate;
  inFlightRef?: InFlightRef;
}): Promise<StartHealthflowEntryResult> {
  if (inFlightRef?.current) return { outcome: "ignored" };
  if (inFlightRef) inFlightRef.current = true;

  try {
    const result = await createEntryUrl(storeSlug);
    if (result.status !== "ok") {
      return {
        outcome: "failed",
        status: result.status,
        requestId: result.requestId,
      };
    }

    navigate(result.url);
    return { outcome: "navigated" };
  } finally {
    if (inFlightRef) inFlightRef.current = false;
  }
}

export function HealthflowEntryButton({ storeSlug }: { storeSlug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);
  const inFlightRef = useRef(false);

  const handleClick = async () => {
    if (inFlightRef.current) return;

    setPending(true);
    setError(null);

    try {
      const outcome = await startHealthflowEntryNavigation({
        storeSlug,
        inFlightRef,
        navigate: (url) => {
          window.location.href = url;
        },
      });
      if (outcome.outcome === "failed") {
        console.warn("healthflow_entry_client_result", {
          requestId: outcome.requestId,
          resultStatus: outcome.status,
        });
        setError({
          message: getHealthflowEntryErrorMessage(outcome.status),
          requestId: outcome.requestId,
        });
      }
    } catch (exception) {
      console.error("healthflow_entry_client_exception", {
        requestId: null,
        resultStatus: "transport_exception",
        exceptionName:
          exception instanceof Error ? exception.name : "UnknownClientException",
      });
      setError({ message: CLIENT_ERROR_MESSAGE, requestId: null });
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  };

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary-600 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? LOADING_LABEL : START_LABEL}
        {!pending && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M7.5 16.5L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        )}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs leading-relaxed text-red-600">
          {error.message}
          {error.requestId && (
            <span className="mt-1 block font-mono text-[11px]">
              錯誤代碼：{formatHealthflowEntryErrorCode(error.requestId)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
