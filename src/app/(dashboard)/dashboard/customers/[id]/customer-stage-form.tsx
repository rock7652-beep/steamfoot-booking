"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateCustomerStage } from "@/server/actions/customer";

const STAGE_LABEL: Record<string, string> = {
  LEAD: "名單", TRIAL: "體驗", ACTIVE: "已購課", INACTIVE: "已停用",
};

interface Props {
  customerId: string;
  currentStage: string;
}

export function CustomerStageForm({ customerId, currentStage }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const stage = formData.get("stage") as string;
    if (stage === currentStage) return;
    startTransition(async () => {
      try {
        await updateCustomerStage(customerId, stage as "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE");
        toast.success("狀態已更新");
      } catch {
        toast.error("更新失敗");
      }
    });
  }

  return (
    <form action={handleSubmit} className="mt-4 flex items-center gap-2 border-t pt-4">
      <label className="text-sm text-earth-600">更新狀態：</label>
      <select
        name="stage"
        defaultValue={currentStage}
        className="rounded border border-earth-300 px-2 py-1 text-sm"
      >
        {Object.entries(STAGE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg px-3 py-1 text-sm font-medium bg-earth-100 text-earth-700 hover:bg-earth-200 disabled:opacity-50 transition"
      >
        {isPending ? "更新中..." : "更新"}
      </button>
    </form>
  );
}
