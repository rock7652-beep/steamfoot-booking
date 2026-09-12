"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { provisionSpaStoreAction } from "@/server/actions/spa-provisioning";

export function SpaProvisionButton({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError("");
          startTransition(async () => {
            const result = await provisionSpaStoreAction(storeId);
            if (!result.success) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "SPA 佈建中…" : "佈建 SPA 模組"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
