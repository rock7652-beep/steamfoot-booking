export const DEVICE_PREVIEW_PAGES = [
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
    id: "revenue",
    label: "營運",
    path: "/dashboard/revenue",
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
  return `${path}?devicePreview=1`;
}
