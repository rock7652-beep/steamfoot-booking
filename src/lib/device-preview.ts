export const DEVICE_PREVIEW_PAGES = [
  {
    id: "dashboard",
    label: "首頁",
    path: "/dashboard",
  },
  {
    id: "bookings",
    label: "預約管理",
    path: "/dashboard/bookings",
  },
  {
    id: "customers",
    label: "顧客管理",
    path: "/dashboard/customers",
  },
  {
    id: "plans",
    label: "方案管理",
    path: "/dashboard/plans",
  },
  {
    id: "growth",
    label: "顧客經營",
    path: "/dashboard/growth",
  },
  {
    id: "revenue",
    label: "營運",
    path: "/dashboard/revenue",
  },
  {
    id: "settings",
    label: "設定",
    path: "/dashboard/settings",
  },
] as const;

export const DEVICE_PRESETS = {
  mobile: {
    label: "手機",
    width: 390,
    height: 844,
  },
  tablet: {
    label: "平板",
    width: 768,
    height: 1024,
  },
  desktop: {
    label: "桌機",
    width: 1440,
    height: 900,
  },
} as const;

export type DevicePreviewPageId = (typeof DEVICE_PREVIEW_PAGES)[number]["id"];
export type DevicePresetId = keyof typeof DEVICE_PRESETS;

export const DEFAULT_DEVICE_PREVIEW_PAGE: DevicePreviewPageId = "bookings";
export const DEFAULT_DEVICE_PRESET: DevicePresetId = "mobile";

export function isDevicePreviewPageId(value: string | null): value is DevicePreviewPageId {
  return DEVICE_PREVIEW_PAGES.some((page) => page.id === value);
}

export function isDevicePresetId(value: string | null): value is DevicePresetId {
  return value !== null && value in DEVICE_PRESETS;
}

export function getDevicePreviewPage(id: DevicePreviewPageId) {
  return DEVICE_PREVIEW_PAGES.find((page) => page.id === id)!;
}

export function createDevicePreviewUrl(path: string) {
  const [pathname, query = ""] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("devicePreview", "1");
  return `${pathname}?${params.toString()}`;
}

export function getDevicePreviewPageForPath(path: string) {
  const pathname = path.split("?", 1)[0];
  return DEVICE_PREVIEW_PAGES
    .filter((page) => pathname === page.path || pathname.startsWith(`${page.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

export function isPreviewableDashboardPath(path: string) {
  const pathname = path.split("?", 1)[0];
  return (
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) &&
    pathname !== "/dashboard/device-preview" &&
    !pathname.startsWith("/dashboard/device-preview/")
  );
}
