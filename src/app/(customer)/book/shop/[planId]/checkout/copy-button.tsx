"use client";

import { useState } from "react";
import { toast } from "sonner";

export function CopyButton({
  value,
  label = "複製",
  onCopied,
}: {
  value: string;
  label?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗，請手動選取");
    }
  }

  return (
    <button
      type="button"
      aria-live="polite"
      onClick={handleCopy}
      className="rounded-md border border-earth-300 bg-white px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-50"
    >
      {copied ? "已複製" : label}
    </button>
  );
}
