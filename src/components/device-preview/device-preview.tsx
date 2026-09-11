"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createDevicePreviewUrl,
  DEFAULT_DEVICE_PRESET,
  DEFAULT_DEVICE_PREVIEW_PAGE,
  getDevicePreviewPage,
  isDevicePresetId,
  isDevicePreviewPageId,
  type DevicePresetId,
  type DevicePreviewPageId,
} from "@/lib/device-preview";
import { DeviceFrame } from "./device-frame";
import { DeviceToolbar } from "./device-toolbar";

export function DevicePreview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);

  const requestedPage = searchParams.get("page");
  const requestedDevice = searchParams.get("device");
  const page: DevicePreviewPageId = isDevicePreviewPageId(requestedPage)
    ? requestedPage
    : DEFAULT_DEVICE_PREVIEW_PAGE;
  const device: DevicePresetId = isDevicePresetId(requestedDevice)
    ? requestedDevice
    : DEFAULT_DEVICE_PRESET;

  const selectedPage = getDevicePreviewPage(page);
  const previewUrl = useMemo(() => createDevicePreviewUrl(selectedPage.path), [selectedPage.path]);

  const updateUrl = useCallback((nextPage: DevicePreviewPageId, nextDevice: DevicePresetId) => {
    const params = new URLSearchParams();
    params.set("page", nextPage);
    params.set("device", nextDevice);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router]);

  const handlePageChange = (nextPage: DevicePreviewPageId) => updateUrl(nextPage, device);
  const handleDeviceChange = (nextDevice: DevicePresetId) => updateUrl(page, nextDevice);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-earth-900">裝置預覽</h1>
        <p className="mt-1 text-sm text-earth-600">快速查看蒸管家在手機、平板與桌機上的實際呈現。</p>
      </div>

      <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-800">
        預覽模式：此畫面用於檢查不同裝置的版面呈現。
      </div>

      <DeviceToolbar
        page={page}
        device={device}
        onPageChange={handlePageChange}
        onDeviceChange={handleDeviceChange}
        onRefresh={() => setRefreshKey((key) => key + 1)}
        onOpenInNewPage={() => window.open(selectedPage.path, "_blank", "noopener,noreferrer")}
      />

      <p className="text-xs text-earth-500 lg:hidden">建議使用平板或桌機進行完整裝置預覽。</p>

      <DeviceFrame
        key={`${previewUrl}-${refreshKey}`}
        device={device}
        src={previewUrl}
        refreshKey={refreshKey}
      />
    </div>
  );
}
