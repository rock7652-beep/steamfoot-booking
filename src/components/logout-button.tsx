"use client";

import { useFormStatus } from "react-dom";

export function LogoutButton({
  iconClassName = "text-earth-400",
  className = "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-earth-600 hover:bg-earth-50",
  iconSize = 14,
}: {
  iconClassName?: string;
  className?: string;
  iconSize?: number;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} ${pending ? "opacity-50 pointer-events-none" : ""}`}
    >
      {pending ? (
        <svg
          className={`animate-spin flex-shrink-0 ${iconClassName}`}
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path
            d="M4 12a8 8 0 018-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          className={`flex-shrink-0 ${iconClassName}`}
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15" />
          <path d="M18.75 12l3-3m0 0l-3-3m3 3H9" />
        </svg>
      )}
      {pending ? "登出中…" : "登出"}
    </button>
  );
}
