export type IndustryModuleId = "steamfoot" | "spa";
export type PersistedIndustryModule = "STEAMFOOT" | "SPA";

export type IndustryModule = {
  id: IndustryModuleId;
  displayName: string;
  bookingResource: "space_capacity" | "provider_availability";
  ownerLabel: string;
  providerLabel: string;
};

/** Client-safe presentation registry. Runtime authorization must use Store.industryModule. */
export const INDUSTRY_MODULES: Record<IndustryModuleId, IndustryModule> = {
  steamfoot: {
    id: "steamfoot",
    displayName: "蒸足門市模組",
    bookingResource: "space_capacity",
    ownerLabel: "店長",
    providerLabel: "服務人員",
  },
  spa: {
    id: "spa",
    displayName: "SPA／美容美體模組",
    bookingResource: "provider_availability",
    ownerLabel: "店長",
    providerLabel: "芳療師",
  },
};

export function resolveIndustryModuleId(value: string | null | undefined): IndustryModuleId {
  return value === "SPA" || value === "spa" ? "spa" : "steamfoot";
}

export function toPersistedIndustryModule(value: IndustryModuleId): PersistedIndustryModule {
  return value === "spa" ? "SPA" : "STEAMFOOT";
}
