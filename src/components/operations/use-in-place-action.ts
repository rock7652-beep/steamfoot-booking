"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { useRouter } from "@/components/use-stable-router";
import { navigationTarget } from "@/lib/navigation-target";
import type { ActionResult } from "@/types";

/** A confirmed write is followed by a separate RSC GET, never a full document
 * reload or a same-URL Server Action redirect. Balances still come from server.
 * Remount only form fields after success so repeated entries start empty.
 */
export function useInPlaceAction<T>(
  action: (previous: ActionResult<T> | null, data: FormData) => Promise<ActionResult<T>>,
  returnPath: string,
  successMessage: string,
) {
  const router = useRouter();
  const submitting = useRef(false);
  const [formVersion, setFormVersion] = useState(0);
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(async (previous, data) => {
    try {
      const result = await action(previous, data);
      if (!result.success) return result;
      toast.success(successMessage);
      setFormVersion(version => version + 1);
      const target = navigationTarget(returnPath, window.location.href);
      if (target.unchanged) router.refresh();
      else router.replace(target.href, { scroll: false });
      return null;
    } catch (error) {
      unstable_rethrow(error);
      return { success: false, error: "尚未確認送出結果，輸入已保留；請先核對紀錄，避免重複送出。" };
    } finally {
      submitting.current = false;
    }
  }, null);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Native React action forms reset uncontrolled fields even on a rejected
    // result. Dispatch explicitly so only a confirmed receipt clears input.
    event.preventDefault();
    if (submitting.current || pending) return;
    submitting.current = true;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
  return { state, formAction, onSubmit, pending, formVersion };
}
