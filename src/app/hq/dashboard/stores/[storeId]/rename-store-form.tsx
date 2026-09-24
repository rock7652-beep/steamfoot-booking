"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { renameStoreAction, type RenameStoreFormState } from "@/server/actions/store-rename";

const initialState: RenameStoreFormState = { success: null, error: null };

export function RenameStoreForm({
  storeId,
  currentName,
}: {
  storeId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(renameStoreAction, initialState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-earth-700">
        顯示店名
        <input
          key={currentName}
          name="name"
          type="text"
          defaultValue={currentName}
          maxLength={80}
          required
          className="h-10 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm text-earth-900 focus:border-primary-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {pending ? "儲存中…" : "儲存新店名"}
      </button>
      {(state.error || state.success) && (
        <p role="status" className={`w-full text-sm ${state.error ? "text-red-700" : "text-green-700"}`}>
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}
