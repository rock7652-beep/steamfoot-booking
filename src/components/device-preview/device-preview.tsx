"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createDevicePreviewUrl,
  DEFAULT_DEVICE_PRESET,
  DEFAULT_DEVICE_PREVIEW_PAGE,
  getDevicePreviewPage,
  getDevicePreviewPageForPath,
  isDevicePresetId,
  isDevicePreviewPageId,
  resolveDashboardPreviewPath,
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

  const initialPage = getDevicePreviewPage(page);
  const [framePath, setFramePath] = useState<string>(() =>
    resolveDashboardPreviewPath(initialPage.path, pathname),
  );
  const [frameSrc, setFrameSrc] = useState(() =>
    createDevicePreviewUrl(resolveDashboardPreviewPath(initialPage.path, pathname)),
  );
  const quickPage = getDevicePreviewPageForPath(framePath)?.id ?? page;

  const updateUrl = useCallback((nextPage: DevicePreviewPageId, nextDevice: DevicePresetId) => {
    const params = new URLSearchParams();
    params.set("page", nextPage);
    params.set("device", nextDevice);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router]);

  const handlePageChange = (nextPage: DevicePreviewPageId) => {
    const nextPath = resolveDashboardPreviewPath(getDevicePreviewPage(nextPage).path, pathname);
    setFramePath(nextPath);
    setFrameSrc(createDevicePreviewUrl(nextPath));
    updateUrl(nextPage, device);
  };
  const handleDeviceChange = (nextDevice: DevicePresetId) => updateUrl(quickPage, nextDevice);

  return (
    <div className="min-h-dvh bg-earth-50">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-earth-900">裝置預覽</h1>
            <p className="mt-1 text-sm text-earth-600">在手機、平板與桌機尺寸下操作並檢查蒸管家介面。</p>
          </div>
          <Link
            href={resolveDashboardPreviewPath("/dashboard", pathname)}
            className="inline-flex min-h-10 items-center self-start rounded-lg border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 transition hover:bg-earth-100"
          >
            ← 返回後台
          </Link>
        </div>

        <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-800">
          預覽模式：此畫面使用目前測試資料，用於檢查不同裝置的實際操作與版面。
        </div>

        <DeviceToolbar
          page={quickPage}
          device={device}
          onPageChange={handlePageChange}
          onDeviceChange={handleDeviceChange}
          onRefresh={() => {
            setFrameSrc(createDevicePreviewUrl(framePath));
            setRefreshKey((key) => key + 1);
          }}
          onOpenInNewPage={() => window.open(framePath, "_blank", "noopener,noreferrer")}
        />

        <p className="text-xs text-earth-500 lg:hidden">建議使用平板或桌機進行完整裝置預覽。</p>

        <DeviceFrame
          key={`${frameSrc}-${refreshKey}`}
          device={device}
          src={frameSrc}
          refreshKey={refreshKey}
          onRouteChange={setFramePath}
        />
      </div>
    </div>
  );
}
