"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createDevicePreviewUrl,
  getDashboardRoutePrefix,
  isPreviewableDashboardPath,
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
import type { IndustryModuleId } from "@/lib/industry-modules";
import { DeviceFrame } from "./device-frame";
import { DeviceToolbar } from "./device-toolbar";

export function DevicePreview({ moduleId = "steamfoot", canViewAudit = false, sportsPreview = false }: { moduleId?: IndustryModuleId; canViewAudit?: boolean; sportsPreview?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);

  const requestedPage = searchParams.get("page");
  const requestedDevice = searchParams.get("device");
  const page: DevicePreviewPageId = isDevicePreviewPageId(requestedPage, moduleId) && (requestedPage !== "operation-audits" || canViewAudit)
    ? requestedPage
    : DEFAULT_DEVICE_PREVIEW_PAGE;
  const device: DevicePresetId = isDevicePresetId(requestedDevice)
    ? requestedDevice
    : requestedDevice === "tabletPortrait" || moduleId === "course" ? "tablet" : DEFAULT_DEVICE_PRESET;

  const pendingPage = useRef<DevicePreviewPageId | null>(page);
  const initialPage = getDevicePreviewPage(page, moduleId);
  const [framePath, setFramePath] = useState<string>(() =>
    resolveDashboardPreviewPath(initialPage.path, pathname),
  );
  const [frameSrc, setFrameSrc] = useState(() =>
    createDevicePreviewUrl(resolveDashboardPreviewPath(initialPage.path, pathname)),
  );
  const quickPage = getDevicePreviewPageForPath(framePath, moduleId)?.id ?? page;

  const updateUrl = useCallback((nextPage: DevicePreviewPageId, nextDevice: DevicePresetId, replace = false) => {
    const params = new URLSearchParams();
    params.set("page", nextPage);
    params.set("device", nextDevice);
    const next = `${pathname}?${params.toString()}`;
    if (sportsPreview) {
      if (`${window.location.pathname}${window.location.search}` !== next) {
        window.history[replace ? "replaceState" : "pushState"](null, "", next);
      }
      return;
    }
    router.replace(next, { scroll: false });
  }, [pathname, router, sportsPreview]);

  // Native history changes only the studio controls; it must not reload the iframe.
  useEffect(() => {
    if (!sportsPreview) return;
    const restore = () => {
      const requested = new URLSearchParams(window.location.search).get("page");
      const nextPage = isDevicePreviewPageId(requested, moduleId) && (requested !== "operation-audits" || canViewAudit)
        ? requested : DEFAULT_DEVICE_PREVIEW_PAGE;
      const nextPath = resolveDashboardPreviewPath(getDevicePreviewPage(nextPage, moduleId).path, pathname);
      pendingPage.current = nextPage;
      setFramePath(nextPath);
      setFrameSrc(createDevicePreviewUrl(nextPath));
      // Inner navigation can differ from the original src prop; history must load its actual target.
      setRefreshKey(key => key + 1);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [sportsPreview, moduleId, canViewAudit, pathname]);

  const handleRouteChange = useCallback((path: string) => {
    if (!sportsPreview) { setFramePath(path); return; }
    const destination = new URL(path, window.location.origin);
    if (destination.origin !== window.location.origin ||
        getDashboardRoutePrefix(destination.pathname) !== getDashboardRoutePrefix(pathname) ||
        !isPreviewableDashboardPath(destination.pathname)) return;
    const nextPage = getDevicePreviewPageForPath(path, moduleId);
    if (!nextPage || (nextPage.id === "operation-audits" && !canViewAudit)) return;
    if (pendingPage.current && pendingPage.current !== nextPage.id) return;
    pendingPage.current = null;
    setFramePath(path);
    // The frame already navigated. Update history without changing frameSrc/key.
    const currentPage = new URLSearchParams(window.location.search).get("page") ?? DEFAULT_DEVICE_PREVIEW_PAGE;
    if (currentPage !== nextPage.id) updateUrl(nextPage.id, device);
  }, [sportsPreview, pathname, moduleId, canViewAudit, updateUrl, device, pendingPage]);

  const handlePageChange = (nextPage: DevicePreviewPageId) => {
    pendingPage.current = nextPage;
    const nextPath = resolveDashboardPreviewPath(getDevicePreviewPage(nextPage, moduleId).path, pathname);
    setFramePath(nextPath);
    setFrameSrc(createDevicePreviewUrl(nextPath));
    updateUrl(nextPage, device);
  };
  const handleDeviceChange = (nextDevice: DevicePresetId) => {
    if (sportsPreview && nextDevice === device) return;
    updateUrl(quickPage, nextDevice, true);
  };

  return (
    <div className="min-h-dvh bg-earth-50">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-earth-900">裝置預覽</h1>
            <p className="mt-1 text-sm text-earth-600">{moduleId === "course" ? "檢查課程後台在 iPad 與桌機尺寸下的版面與操作。" : "在手機、平板與桌機尺寸下操作並檢查蒸管家介面。"}</p>
          </div>
          <Link
            href={resolveDashboardPreviewPath("/dashboard", pathname)}
            className="inline-flex min-h-10 items-center self-start rounded-lg border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 transition hover:bg-earth-100"
          >
            ← 返回後台
          </Link>
        </div>

        <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-800">
          {quickPage === "frontend-preview"
            ? "前台預覽僅供查看，不會儲存或發送通知。"
            : "預覽會使用目前門市資料；新增、修改與刪除會實際生效。"}
        </div>

        <DeviceToolbar
          moduleId={moduleId}
          canViewAudit={canViewAudit}
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
          resilientLoading={sportsPreview}
          onRouteChange={handleRouteChange}
        />
      </div>
    </div>
  );
}
