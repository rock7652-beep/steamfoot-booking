"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/types";

type CancelAction = (
  previous: ActionResult<void> | null,
  formData: FormData,
) => Promise<ActionResult<void>>;

export function CancelBookingForm({
  action,
  destination,
}: {
  action: CancelAction;
  destination: string;
}) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (result?.success) {
      router.replace(destination);
      router.refresh();
    }
  }, [destination, result, router]);

  return (
    <form action={formAction}>
      {result && !result.success && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error ?? "取消失敗，請重新嘗試"}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-red-600 px-5 text-base font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? "取消中..." : "確認取消"}
      </button>
    </form>
  );
}
