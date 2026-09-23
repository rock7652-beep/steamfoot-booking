/** An allowlisted, link-based acquisition label, never inferred from login identity. */
export const TRIAL_BOOKING_SOURCES = ["LINE", "MESSENGER", "GOOGLE_MAPS", "INSTAGRAM"] as const;
export type TrialBookingSource = (typeof TRIAL_BOOKING_SOURCES)[number];

const SOURCE_BY_LINK: Record<string, TrialBookingSource> = {
  line: "LINE",
  messenger: "MESSENGER",
  google_maps: "GOOGLE_MAPS",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
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
};
