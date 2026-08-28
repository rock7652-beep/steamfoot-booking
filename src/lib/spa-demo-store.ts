import type { SpaProviderSpecialty } from "@/lib/spa-scheduling";

export const SPA_DEMO_STORE = {
  id: "demo-store",
  slug: "demo",
  name: "沐光舒療 SPA 示範店",
  address: "新竹縣竹北市光明六路示範號",
  mapUrl: "https://maps.google.com/?q=24.8387,121.0178",
} as const;

export const SPA_DEMO_OWNER_STAFF_ID = "spa-demo-owner";

export type SpaDemoBookingStatus =
  | "新客體驗"
  | "已確認"
  | "待到店"
  | "已到店"
  | "服務中"
  | "已完成";

export type SpaDemoTone = "sage" | "sand" | "rose" | "slate";

export type SpaDemoProvider = {
  id: string;
  badge: string;
  name: string;
  specialties: string;
  specialtyKeys: readonly SpaProviderSpecialty[];
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  weeklyAvailability: readonly {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[];
  scheduleExceptions: readonly {
    date: string;
    label: string;
    tone: "leave" | "extra";
  }[];
};

export type SpaDemoBooking = {
  id: string;
  date: string;
  time: string;
  customer: string;
  service: string;
  serviceItems: readonly string[];
  providerId: string;
  durationMinutes: number;
  bufferMinutes: number;
  status: SpaDemoBookingStatus;
  tone: SpaDemoTone;
  remainingSessions: number | null;
  note: string;
};

export type SpaDemoPreviewData = {
  presentation: {
    id: string;
    slug: string;
    name: string;
    address: string;
    mapUrl: string;
  };
  providers: readonly SpaDemoProvider[];
  bookings: readonly SpaDemoBooking[];
  source: "fixture" | "database";
};

export type SpaDemoStoreIdentity = {
  id: string;
  slug: string;
  isDemo: boolean;
};

export function isSpaDemoStoreId(storeId: string | null | undefined): boolean {
  return storeId === SPA_DEMO_STORE.id;
}

export function assertSpaDemoStoreIdentity(store: SpaDemoStoreIdentity | null): asserts store is SpaDemoStoreIdentity {
  if (
    !store ||
    store.id !== SPA_DEMO_STORE.id ||
    store.slug !== SPA_DEMO_STORE.slug ||
    store.isDemo !== true
  ) {
    throw new Error("SPA_DEMO_STORE_IDENTITY_MISMATCH");
  }
}

export const SPA_DEMO_PROVIDERS: readonly SpaDemoProvider[] = [
  {
    id: "spa-demo-staff-08",
    badge: "08",
    name: "陳語安",
    specialties: "精油芳療・肩頸舒壓",
    specialtyKeys: ["body", "head"],
    emergencyContact: { name: "陳小姐", relation: "姊姊", phone: "0900-000-008" },
    weeklyAvailability: [
      { dayOfWeek: 0, startTime: "10:00", endTime: "18:00" },
      { dayOfWeek: 2, startTime: "10:00", endTime: "18:00" },
      { dayOfWeek: 3, startTime: "10:00", endTime: "20:00" },
      { dayOfWeek: 4, startTime: "10:00", endTime: "18:00" },
      { dayOfWeek: 5, startTime: "10:00", endTime: "20:00" },
      { dayOfWeek: 6, startTime: "10:00", endTime: "18:00" },
    ],
    scheduleExceptions: [],
  },
  {
    id: "spa-demo-staff-10",
    badge: "10",
    name: "張若琳",
    specialties: "深層芳療・複合療程",
    specialtyKeys: ["body", "head", "foot", "face"],
    emergencyContact: { name: "張先生", relation: "配偶", phone: "0900-000-010" },
    weeklyAvailability: [
      { dayOfWeek: 0, startTime: "10:00", endTime: "19:00" },
      { dayOfWeek: 2, startTime: "12:00", endTime: "21:00" },
      { dayOfWeek: 3, startTime: "12:00", endTime: "21:00" },
      { dayOfWeek: 4, startTime: "12:00", endTime: "21:00" },
      { dayOfWeek: 6, startTime: "10:00", endTime: "19:00" },
    ],
    scheduleExceptions: [
      { date: "2026-09-03", label: "個人休假", tone: "leave" },
    ],
  },
  {
    id: "spa-demo-staff-16",
    badge: "16",
    name: "王心瑜",
    specialties: "臉部保養・新客體驗",
    specialtyKeys: ["face", "head"],
    emergencyContact: { name: "王小姐", relation: "母親", phone: "0900-000-016" },
    weeklyAvailability: [
      { dayOfWeek: 0, startTime: "11:00", endTime: "20:00" },
      { dayOfWeek: 2, startTime: "11:00", endTime: "20:00" },
      { dayOfWeek: 3, startTime: "11:00", endTime: "20:00" },
      { dayOfWeek: 4, startTime: "11:00", endTime: "20:00" },
      { dayOfWeek: 5, startTime: "11:00", endTime: "20:00" },
    ],
    scheduleExceptions: [
      { date: "2026-09-05", label: "臨時加班 10:00–16:00", tone: "extra" },
    ],
  },
];

export const SPA_DEMO_BOOKINGS: readonly SpaDemoBooking[] = [
  {
    id: "spa-demo-booking-lin",
    date: "2026-08-29",
    time: "10:00",
    customer: "林小姐",
    service: "新客舒壓體驗 60 分鐘",
    serviceItems: ["新客舒壓體驗 60 分"],
    providerId: "spa-demo-staff-08",
    durationMinutes: 60,
    bufferMinutes: 30,
    status: "新客體驗",
    tone: "rose",
    remainingSessions: null,
    note: "首次到店，肩頸容易緊繃",
  },
  {
    id: "spa-demo-booking-zhang",
    date: "2026-08-29",
    time: "10:00",
    customer: "張小姐",
    service: "全身精油舒壓＋頭部舒壓＋足部放鬆",
    serviceItems: ["全身精油舒壓 60 分", "頭部舒壓 30 分", "足部放鬆 30 分"],
    providerId: "spa-demo-staff-10",
    durationMinutes: 120,
    bufferMinutes: 30,
    status: "待到店",
    tone: "sand",
    remainingSessions: 6,
    note: "偏好力道中等，避開左肩舊傷",
  },
  {
    id: "spa-demo-booking-zhou",
    date: "2026-08-29",
    time: "11:30",
    customer: "周小姐",
    service: "全身芳療單次 90 分鐘",
    serviceItems: ["全身芳療單次 90 分"],
    providerId: "spa-demo-staff-16",
    durationMinutes: 90,
    bufferMinutes: 30,
    status: "已確認",
    tone: "sage",
    remainingSessions: null,
    note: "單次服務，現場付款",
  },
  {
    id: "spa-demo-booking-wang",
    date: "2026-08-29",
    time: "14:30",
    customer: "王小姐",
    service: "全身芳療單次 90 分鐘",
    serviceItems: ["全身芳療單次 90 分"],
    providerId: "spa-demo-staff-08",
    durationMinutes: 90,
    bufferMinutes: 30,
    status: "已確認",
    tone: "sage",
    remainingSessions: null,
    note: "希望加強腰背",
  },
  {
    id: "spa-demo-booking-li",
    date: "2026-08-29",
    time: "14:30",
    customer: "李小姐",
    service: "舒壓療程 5 次",
    serviceItems: ["舒壓療程 90 分"],
    providerId: "spa-demo-staff-10",
    durationMinutes: 90,
    bufferMinutes: 30,
    status: "待到店",
    tone: "sand",
    remainingSessions: 3,
    note: "療程將於 9/30 到期",
  },
  {
    id: "spa-demo-booking-xu",
    date: "2026-08-29",
    time: "16:00",
    customer: "許小姐",
    service: "年度保養 12 次",
    serviceItems: ["年度保養 90 分"],
    providerId: "spa-demo-staff-16",
    durationMinutes: 90,
    bufferMinutes: 30,
    status: "已確認",
    tone: "sage",
    remainingSessions: 8,
    note: "固定每兩週保養",
  },
  {
    id: "spa-demo-booking-before",
    date: "2026-08-28",
    time: "13:00",
    customer: "吳小姐",
    service: "舒壓療程 3 次",
    serviceItems: ["舒壓療程 90 分"],
    providerId: "spa-demo-staff-08",
    durationMinutes: 90,
    bufferMinutes: 30,
    status: "已完成",
    tone: "slate",
    remainingSessions: 1,
    note: "已完成服務",
  },
];

export const SPA_DEMO_FIXTURE: SpaDemoPreviewData = {
  presentation: SPA_DEMO_STORE,
  providers: SPA_DEMO_PROVIDERS,
  bookings: SPA_DEMO_BOOKINGS,
  source: "fixture",
};
