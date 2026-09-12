"use client";

import type { DevicePreviewPageId } from "@/lib/device-preview";
import { DEVICE_PREVIEW_PAGES } from "@/lib/device-preview";

interface DevicePageSelectProps {
  value: DevicePreviewPageId;
  onChange: (value: DevicePreviewPageId) => void;
}

export function DevicePageSelect({ value, onChange }: DevicePageSelectProps) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-earth-600 sm:max-w-xs">
      快速前往
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as DevicePreviewPageId)}
        className="h-10 w-full rounded-lg border border-earth-300 bg-white px-3 text-sm font-medium text-earth-800 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        aria-label="快速前往"
      >
        {DEVICE_PREVIEW_PAGES.map((page) => (
          <option key={page.id} value={page.id}>
            {page.label}
          </option>
        ))}
      </select>
    </label>
  );
}
