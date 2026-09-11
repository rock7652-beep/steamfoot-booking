export type IndustryModuleId = "steamfoot" | "spa";
export type PersistedIndustryModule = "STEAMFOOT" | "SPA";

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
    resourceModel: "space_capacity" | "provider_availability";
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
  displayName: "蒸足門市模組",
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

export const SPA_INDUSTRY_MODULE: IndustryModule = {
  id: "spa",
  displayName: "SPA／美容美體模組",
  storeTypeLabel: "SPA／美容美體店",
  roles: {
    owner: "店長",
    provider: "芳療師",
    providerPlural: "芳療師",
  },
  customer: {
    memberCenterLabel: "會員中心",
    summaryTitle: "療程摘要",
    sessionUnit: "次",
    makeupLabel: "補做資格",
    walletLabel: "我的療程",
    buyLabel: "購買療程",
  },
  manager: {
    dashboardLabel: "今日營運",
    bookingLabel: "預約管理",
    customerLabel: "顧客管理",
    planLabel: "療程管理",
    staffLabel: "芳療師管理",
  },
  booking: {
    resourceModel: "provider_availability",
    slotIntervalMinutes: 90,
    defaultCapacity: 1,
    openTime: "10:00",
    closeTime: "21:00",
    closedWeekdays: [1],
  },
  features: {
    packages: true,
    makeupCredits: true,
    healthAssessment: false,
    referralShare: true,
    storedValue: false,
  },
  services: [
    {
      key: "trial",
      name: "新客舒壓體驗 60 分鐘",
      category: "TRIAL",
      durationMinutes: 60,
      price: 899,
      sessions: 1,
      validityDays: 30,
    },
    {
      key: "single",
      name: "全身芳療單次 90 分鐘",
      category: "SINGLE",
      durationMinutes: 90,
      price: 1800,
      sessions: 1,
      validityDays: null,
    },
    {
      key: "package_3",
      name: "舒壓療程 3 次",
      category: "PACKAGE",
      durationMinutes: 90,
      price: 5100,
      sessions: 3,
      validityDays: 60,
    },
    {
      key: "package_5",
      name: "舒壓療程 5 次",
      category: "PACKAGE",
      durationMinutes: 90,
      price: 8000,
      sessions: 5,
      validityDays: 90,
    },
    {
      key: "package_10",
      name: "深層芳療 10 次",
      category: "PACKAGE",
      durationMinutes: 90,
      price: 15000,
      sessions: 10,
      validityDays: 180,
    },
    {
      key: "package_annual",
      name: "年度保養 12 次",
      category: "PACKAGE",
      durationMinutes: 90,
      price: 16800,
      sessions: 12,
      validityDays: 365,
    },
  ],
  theme: {
    accent: "#60704d",
    accentSoft: "#edf0e8",
    surface: "#faf8f4",
  },
};

const INDUSTRY_MODULES: Record<IndustryModuleId, IndustryModule> = {
  steamfoot: STEAMFOOT_INDUSTRY_MODULE,
  spa: SPA_INDUSTRY_MODULE,
};

export function getIndustryModule(id: IndustryModuleId): IndustryModule {
  return INDUSTRY_MODULES[id];
}

export function resolveIndustryModuleId(value: string | null | undefined): IndustryModuleId {
  return value === "spa" || value === "SPA" ? "spa" : "steamfoot";
}

export function toPersistedIndustryModule(
  value: IndustryModuleId,
): PersistedIndustryModule {
  return value === "spa" ? "SPA" : "STEAMFOOT";
}

export function getIndustryService(
  module: IndustryModule,
  key: IndustryServiceDefinition["key"],
): IndustryServiceDefinition {
  const service = module.services.find((candidate) => candidate.key === key);
  if (!service) throw new Error(`產業模組 ${module.id} 缺少服務設定：${key}`);
  return service;
}
