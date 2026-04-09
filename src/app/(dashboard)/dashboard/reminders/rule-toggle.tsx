"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toggleReminderRule } from "@/server/actions/reminder";

export function RuleToggle({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) {
  const [enabled, setEnabled] = useState(isEnabled);
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    setPending(true);
    const result = await toggleReminderRule(ruleId, !enabled);
    if (result.success) {
      setEnabled(!enabled);
      toast.success(!enabled ? "規則已啟用" : "規則已停用");
    } else {
      toast.error(result.error ?? "操作失敗");
    }
    setPending(false);
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        enabled ? "bg-primary-600" : "bg-earth-300"
      } ${pending ? "opacity-50" : ""}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
