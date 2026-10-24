// SPA identifiers remain only for reading archived records; runtime access is retired.
export type IndustryModuleId = "steamfoot" | "spa" | "course" | "beauty";
export type PersistedIndustryModule = "STEAMFOOT" | "SPA" | "COURSE" | "BEAUTY";

export type IndustryFeatureSet = {
  packages: boolean;
  makeupCredits: boolean;
  healthAssessment: boolean;
  referralShare: boolean;
  storedValue: boolean;
};

export type IndustryServiceDefinition = {
  key: "trial" | "single" | "package_3" | "package_5" | "package_10" | "package_annual";
  name: string;
  category: "TRIAL" | "SINGLE" | "PACKAGE";
  durationMinutes: number;
  price: number;
  sessions: number;
  validityDays: number | null;
};

export type IndustryModule = {
  id: IndustryModuleId;
  displayName: string;
  storeTypeLabel: string;
  roles: {
    owner: string;
    provider: string;
    providerPlural: string;
  };
  customer: {
    memberCenterLabel: string;
    summaryTitle: string;
    sessionUnit: string;
    makeupLabel: string;
    walletLabel: string;
    buyLabel: string;
  };
  manager: {
    dashboardLabel: string;
    bookingLabel: string;
    customerLabel: string;
    planLabel: string;
    staffLabel: string;
  };
  booking: {
    resourceModel: "space_capacity" | "provider_availability" | "course_capacity";
    slotIntervalMinutes: number;
    defaultCapacity: number;
    openTime: string;
    closeTime: string;
    closedWeekdays: readonly number[];
  };
  features: IndustryFeatureSet;
  services: readonly IndustryServiceDefinition[];
  theme: {
    accent: string;
    accentSoft: string;
    surface: string;
  };
};

export type MemberHomeTerminology = IndustryModule["customer"];

export const STEAMFOOT_INDUSTRY_MODULE: IndustryModule = {
  id: "steamfoot",
  displayName: "時段模組（蒸足）",
  storeTypeLabel: "蒸足門市",
  roles: {
    owner: "店長",
    provider: "服務人員",
    providerPlural: "服務人員",
  },
  customer: {
    memberCenterLabel: "會員中心",
    summaryTitle: "方案摘要",
    sessionUnit: "堂",
    makeupLabel: "補課",
    walletLabel: "我的方案",
    buyLabel: "購買方案",
  },
  manager: {
    dashboardLabel: "營運總覽",
    bookingLabel: "預約管理",
    customerLabel: "顧客管理",
    planLabel: "方案管理",
    staffLabel: "人員管理",
  },
  booking: {
    resourceModel: "space_capacity",
    slotIntervalMinutes: 60,
    defaultCapacity: 1,
    openTime: "10:00",
    closeTime: "21:00",
    closedWeekdays: [],
  },
  features: {
    packages: true,
    makeupCredits: true,
    healthAssessment: true,
    referralShare: true,
    storedValue: false,
  },
  services: [],
  theme: {
    accent: "#5a6c47",
    accentSoft: "#e8ebe2",
    surface: "#faf8f5",
  },
};

export const COURSE_INDUSTRY_MODULE: IndustryModule = {
  id: "course",
  displayName: "課程模組",
  storeTypeLabel: "運動教室",
  roles: { owner: "店長", provider: "教練", providerPlural: "教練" },
  customer: { memberCenterLabel: "會員專區", summaryTitle: "點數摘要", sessionUnit: "點", makeupLabel: "補課券", walletLabel: "我的點數", buyLabel: "購買點數" },
  manager: { dashboardLabel: "營運總覽", bookingLabel: "課程管理", customerLabel: "學員管理", planLabel: "點數方案", staffLabel: "教練管理" },
  booking: { resourceModel: "course_capacity", slotIntervalMinutes: 60, defaultCapacity: 10, openTime: "09:00", closeTime: "21:00", closedWeekdays: [] },
  features: { packages: true, makeupCredits: true, healthAssessment: true, referralShare: false, storedValue: false },
  services: [],
  theme: { accent: "#355b46", accentSoft: "#e8efe8", surface: "#faf8f5" },
};

export const BEAUTY_INDUSTRY_MODULE: IndustryModule = {
  ...COURSE_INDUSTRY_MODULE, id:"beauty", displayName:"美業模組", storeTypeLabel:"美業店家",
  roles:{owner:"店長",provider:"技師",providerPlural:"技師"},
  customer:{memberCenterLabel:"會員專區",summaryTitle:"方案摘要",sessionUnit:"次",makeupLabel:"",walletLabel:"我的方案",buyLabel:"購買方案"},
  manager:{dashboardLabel:"首頁",bookingLabel:"班表",customerLabel:"顧客管理",planLabel:"收費方式",staffLabel:"技師管理"},
  booking:{...COURSE_INDUSTRY_MODULE.booking,resourceModel:"provider_availability",defaultCapacity:1,slotIntervalMinutes:30},
  features:{packages:true,makeupCredits:false,healthAssessment:true,referralShare:false,storedValue:false},
};
const INDUSTRY_MODULES: Record<Exclude<IndustryModuleId, "spa">, IndustryModule> = {
  steamfoot: STEAMFOOT_INDUSTRY_MODULE,
  beauty: BEAUTY_INDUSTRY_MODULE,
  course: COURSE_INDUSTRY_MODULE,
};

export function getIndustryModule(id: IndustryModuleId): IndustryModule {
  if (id === "spa") throw new Error("SPA 模組已移除");
  return INDUSTRY_MODULES[id];
}

export function resolveIndustryModuleId(value: string | null | undefined): IndustryModuleId {
  if (value === "beauty" || value === "BEAUTY") return "beauty";
  if (value === "spa" || value === "SPA") return "spa";
  if (value === "course" || value === "COURSE") return "course";
  return "steamfoot";
}

export function toPersistedIndustryModule(
  value: IndustryModuleId,
): PersistedIndustryModule {
  if (value === "spa") throw new Error("SPA 模組已移除");
  return value === "beauty" ? "BEAUTY" : value === "course" ? "COURSE" : "STEAMFOOT";
}

export function getIndustryService(
  module: IndustryModule,
  key: IndustryServiceDefinition["key"],
): IndustryServiceDefinition {
  const service = module.services.find((candidate) => candidate.key === key);
  if (!service) throw new Error(`產業模組 ${module.id} 缺少服務設定：${key}`);
  return service;
}
