export const UNCLASSIFIED_TAIWAN_REGION = "未分類";

export const TAIWAN_REGION_ORDER = [
  "台北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹縣",
  "新竹市",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "嘉義市",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
] as const;

const REGION_ALIASES: Record<string, string> = {
  臺北市: "台北市",
  臺中市: "台中市",
  臺南市: "台南市",
  臺東縣: "台東縣",
};

const STORE_REGION_HINTS: Record<string, string> = {
  以斯帖蒸足坊: "新竹市",
  暖沐蒸足: "台中市",
};

const LOCALITY_REGION_HINTS: Record<string, string> = {
  竹北: "新竹縣",
  zhubei: "新竹縣",
  新竹: "新竹市",
  台中: "台中市",
  臺中: "台中市",
};

function normalizeRegionInput(input: string): string {
  const withoutPostalCode = input.replace(/^\s*\d{3,5}/, "");
  return Object.entries(REGION_ALIASES).reduce(
    (value, [from, to]) => value.replaceAll(from, to),
    withoutPostalCode,
  );
}

export function resolveTaiwanRegion(input: string | null | undefined): string {
  if (!input) return UNCLASSIFIED_TAIWAN_REGION;

  const normalized = normalizeRegionInput(input);
  const directRegion = TAIWAN_REGION_ORDER.find((region) => normalized.includes(region));
  if (directRegion) return directRegion;

  const hintedRegion = Object.entries(STORE_REGION_HINTS).find(([keyword]) =>
    normalized.includes(keyword),
  );
  if (hintedRegion) return hintedRegion[1];

  const localityRegion = Object.entries(LOCALITY_REGION_HINTS).find(([keyword]) =>
    normalized.includes(keyword),
  );
  return localityRegion?.[1] ?? UNCLASSIFIED_TAIWAN_REGION;
}

export function resolveTaiwanLocationLabel(input: string | null | undefined): string | null {
  if (!input) return null;

  const normalized = normalizeRegionInput(input);
  const region = resolveTaiwanRegion(normalized);
  const addressAfterRegion =
    region === UNCLASSIFIED_TAIWAN_REGION
      ? normalized
      : normalized.slice(normalized.indexOf(region) + region.length);
  const match = addressAfterRegion.match(/^(.+?[鄉鎮市區])/);
  return match?.[1] ?? null;
}
