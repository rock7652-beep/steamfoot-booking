"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

type Tone = "default" | "orange" | "green" | "primary" | "amber";

const triggerTone: Record<Tone, string> = {
  default: "border-earth-200 bg-white hover:bg-primary-50",
  orange: "border-orange-200 bg-white hover:bg-orange-50",
  green: "border-green-200 bg-white hover:bg-green-50",
  primary: "border-primary-200 bg-primary-50/40 hover:bg-primary-50",
  amber: "border-amber-200 bg-amber-50/40 hover:bg-amber-50",
};

const titleTone: Record<Tone, string> = {
  default: "text-earth-900",
  orange: "text-earth-900",
  green: "text-earth-900",
  primary: "text-primary-900",
  amber: "text-amber-900",
};

interface Props {
  title: string;
  helper: string;
  tone?: Tone;
  children: ReactNode;
  triggerClassName?: string;
}

/**
 * 現金抽屜的操作視窗。
 *
 * 表單仍由 Server Component 傳入；此元件只負責開關、版面與未儲存提醒，
 * 不接觸任何現金計算或送出邏輯。
 */
export function CashActionModal({
  title,
  helper,
  tone = "default",
  children,
  triggerClassName = "",
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!dirty || window.confirm("尚未送出，確定要關閉嗎？")) {
        setOpen(false);
        setDirty(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, dirty]);

  function requestClose() {
    if (dirty && !window.confirm("尚未送出，確定要關閉嗎？")) return;
    setOpen(false);
    setDirty(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex min-h-[52px] w-full flex-col justify-center rounded-xl border px-3 py-2.5 text-left transition-colors ${triggerTone[tone]} ${triggerClassName}`}
      >
        <span className={`text-sm font-semibold ${titleTone[tone]}`}>{title}</span>
        <span className="mt-0.5 text-xs text-earth-500">{helper}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) requestClose();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-3xl sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-earth-200 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-earth-900">
                  {title}
                </h2>
                <p className="mt-0.5 text-sm text-earth-500">{helper}</p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-medium text-earth-600 hover:bg-earth-100"
                aria-label={`關閉${title}`}
              >
                關閉
              </button>
            </header>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0px,env(safe-area-inset-bottom))]"
              onInput={() => setDirty(true)}
              onChange={() => setDirty(true)}
            >
              {children}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
