"use client";

import type { DevicePresetId, DevicePreviewPageId } from "@/lib/device-preview";
import { DEVICE_PRESETS } from "@/lib/device-preview";
import { DevicePageSelect } from "./device-page-select";

interface DeviceToolbarProps {
  page: DevicePreviewPageId;
  device: DevicePresetId;
  onPageChange: (page: DevicePreviewPageId) => void;
  onDeviceChange: (device: DevicePresetId) => void;
  onRefresh: () => void;
  onOpenInNewPage: () => void;
}

export function DeviceToolbar({
  page,
  device,
  onPageChange,
  onDeviceChange,
  onRefresh,
  onOpenInNewPage,
}: DeviceToolbarProps) {
  const preset = DEVICE_PRESETS[device];

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <DevicePageSelect value={page} onChange={onPageChange} />

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-earth-600">裝置</span>
          <div className="inline-flex w-full rounded-lg bg-earth-100 p-1 sm:w-auto" role="group" aria-label="選擇預覽裝置">
            {(Object.keys(DEVICE_PRESETS) as DevicePresetId[]).map((presetId) => (
              <button
                key={presetId}
                type="button"
                onClick={() => onDeviceChange(presetId)}
                aria-pressed={device === presetId}
                className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none ${
                  device === presetId
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-earth-600 hover:text-earth-800"
                }`}
              >
                {DEVICE_PRESETS[presetId].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="mr-auto rounded-md bg-primary-50 px-2.5 py-2 text-xs font-medium tabular-nums text-primary-700 lg:mr-0">
            {preset.width} × {preset.height}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-10 rounded-lg border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 transition hover:bg-earth-50"
          >
            重新整理
          </button>
          <button
            type="button"
            onClick={onOpenInNewPage}
            className="min-h-10 rounded-lg border border-primary-300 bg-primary-50 px-3 text-sm font-medium text-primary-700 transition hover:bg-primary-100"
          >
            另開新頁
          </button>
        </div>
      </div>
    </div>
  );
}
