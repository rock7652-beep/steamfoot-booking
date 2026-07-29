/** Display copy for Digital Butler conversation sources. Keep this shared by UI and notifications. */
export type DigitalButlerProviderFilter = "LINE" | "MESSENGER" | "INSTAGRAM" | "WEB" | "OTHER";

const PROVIDER_LABELS: Record<string, string> = {
  LINE: "LINE",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEB: "官網",
};

const PROVIDER_NOTIFICATION_LABELS: Record<string, string> = {
  LINE: "LINE 數位管家",
  MESSENGER: "Messenger 數位管家",
  INSTAGRAM: "Instagram 數位管家",
  WEB: "官網表單",
};

function normalizedProvider(provider: string | null | undefined): string {
  return provider?.trim().toUpperCase() ?? "";
}

export function providerLabel(provider: string | null | undefined): string {
  return PROVIDER_LABELS[normalizedProvider(provider)] ?? "其他";
}

export function providerNotificationLabel(provider: string | null | undefined): string {
  return PROVIDER_NOTIFICATION_LABELS[normalizedProvider(provider)] ?? "其他管道";
}

export const DIGITAL_BUTLER_PROVIDER_FILTERS: ReadonlyArray<{
  value: DigitalButlerProviderFilter;
  label: string;
}> = [
  { value: "LINE", label: "LINE" },
  { value: "MESSENGER", label: "Messenger" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WEB", label: "官網" },
  { value: "OTHER", label: "其他" },
];
