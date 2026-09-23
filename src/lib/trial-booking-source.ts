/** An allowlisted, link-based acquisition label, never inferred from login identity. */
export const TRIAL_BOOKING_SOURCES = ["LINE", "MESSENGER", "GOOGLE_MAPS", "INSTAGRAM", "OTHER"] as const;
export type TrialBookingSource = (typeof TRIAL_BOOKING_SOURCES)[number];

const SOURCE_BY_LINK: Record<string, TrialBookingSource> = {
  line: "LINE",
  messenger: "MESSENGER",
  google_maps: "GOOGLE_MAPS",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
  other: "OTHER",
};

/** Unknown or malformed links remain unrecorded; no referrer/identity guessing. */
export function normalizeTrialBookingSource(value: string | undefined): TrialBookingSource | null {
  return value ? SOURCE_BY_LINK[value.toLowerCase()] ?? null : null;
}

export const TRIAL_BOOKING_SOURCE_LABELS: Record<TrialBookingSource, string> = {
  LINE: "LINE",
  MESSENGER: "Messenger",
  GOOGLE_MAPS: "Google 地圖",
  INSTAGRAM: "IG",
  OTHER: "其他／未記錄",
};

export function trialBookingSourceLabel(value: string | null | undefined): string {
  const source = TRIAL_BOOKING_SOURCES.find((item) => item === value);
  return source ? TRIAL_BOOKING_SOURCE_LABELS[source] : TRIAL_BOOKING_SOURCE_LABELS.OTHER;
}
