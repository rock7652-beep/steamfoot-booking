"use client";

import { useRef, useState } from "react";
import {
  createHealthflowEntryUrl,
  type CreateHealthflowEntryUrlResult,
} from "@/server/actions/liff-health";

const START_LABEL = "前往量測";
const LOADING_LABEL = "正在前往…";
const ERROR_MESSAGE = "暫時無法前往 AI 健康評估，請稍後再試。";

type CreateEntryUrlAction = (
  storeSlug: string,
) => Promise<CreateHealthflowEntryUrlResult>;

type Navigate = (url: string) => void;

export type StartHealthflowEntryResult = "navigated" | "failed";
type InFlightRef = { current: boolean };

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
}): Promise<StartHealthflowEntryResult | "ignored"> {
  if (inFlightRef?.current) return "ignored";
  if (inFlightRef) inFlightRef.current = true;

  try {
    const result = await createEntryUrl(storeSlug);
    if (result.status !== "ok") return "failed";

    navigate(result.url);
    return "navigated";
  } finally {
    if (inFlightRef) inFlightRef.current = false;
  }
}

export function HealthflowEntryButton({ storeSlug }: { storeSlug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      if (outcome === "failed") {
        setError(ERROR_MESSAGE);
      }
    } catch {
      setError(ERROR_MESSAGE);
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
          {error}
        </p>
      )}
    </div>
  );
}
