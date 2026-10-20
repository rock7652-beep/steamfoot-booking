import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BeautyDashboard } from "../../src/components/beauty/dashboard";
import { BeautyPortal } from "../../src/components/beauty/portal";
import type { BeautyPortalData } from "../../src/server/beauty/queries";
import { BeautyBookingForm } from "../../src/components/beauty/booking-form";
import type { BeautyDashboardData } from "../../src/server/beauty/queries";
import "../../src/app/globals.css";
const services = [
  {
    id: "face",
    storeId: "synthetic",
    name: "保濕做臉",
    duration: 60,
    buffer: 15,
    price: 1000,
    trialPrice: 500,
    category: "臉部",
    active: true,
    revision: 0,
  },
  {
    id: "massage",
    storeId: "synthetic",
    name: "全身舒壓按摩",
    duration: 90,
    buffer: 0,
    price: 1500,
    trialPrice: 800,
    category: "按摩",
    active: true,
    revision: 0,
  },
];
const techs = [
  {
    id: "t1",
    name: "小美",
    gender: "FEMALE",
    serviceIds: ["face", "massage"],
    rates: {
      face: { mode: "FIXED", value: 300 },
      massage: { mode: "PERCENT", value: 50, base: "PAID" },
    },
    weekly: [],
    exceptions: {},
    userId: null,
    active: true,
    storeId: "synthetic",
    revision: 0,
    sort: 0,
    grants: [],
  },
  {
    id: "t2",
    name: "阿明",
    gender: "MALE",
    serviceIds: ["massage"],
    rates: { massage: { mode: "FIXED", value: 500 } },
    weekly: [],
    exceptions: {},
    userId: null,
    active: true,
    storeId: "synthetic",
    revision: 0,
    sort: 1,
    grants: [],
  },
];
const data = {
  now: Date.parse("2099-10-20T01:00Z"),
  date: "2099-10-20",
  month: "2099-10",
  services,
  techs,
  locations: [
    { id: "r1", name: "第一床", isActive: true },
    { id: "r2", name: "第二床", isActive: true },
  ],
  plans: [],
  customers: [],
  cards: [],
  items: [
    {
      id: "a",
      personName: "合成顧客",
      personPhone: "0912345678",
      serviceName: "保濕做臉",
      startsAt: "2099-10-20T02:00Z",
      endsAt: "2099-10-20T03:00Z",
      status: "RESERVED",
      price: 500,
      revision: 0,
      groupId: "g",
      technicianId: "t1",
      locationId: "r1",
      cardId: null,
      customerId: null,
      notes: "測試資料",
      fee: 0,
      preference: "FEMALE",
      cancelDeduct: false,
      noShowDeduct: false,
      isTrial: false,
    },
  ],
  calendar: "day",
  analytics: [],
  manage: {
    update: true,
    collect: true,
    refund: true,
    card: true,
    members: true,
    customer: true,
    customerEdit: true,
    plan: true,
    technician: true,
    location: true,
    settings: true,
    feeConfirm: true,
    feePay: true,
  },
  payments: [],
  purchases: [],
  policy: {
    storeId: "synthetic",
    revision: 0,
    notifications: false,
    selfBooking: true,
    selfCancel: true,
    selfReschedule: true,
    cancelDeduct: false,
    noShowDeduct: false,
    leadMinutes: 0,
    cancelLeadMinutes: 240,
    bookableDays: 30,
  },
  report: null,
  access: {
    customerAccess: true,
    planAccess: true,
    staffAccess: true,
    financeAccess: true,
    feeAccess: true,
    settingsAccess: true,
    writeAccess: true,
  },
} as BeautyDashboardData;
function Fixture() {
  const [tab, setTab] = useState<
    "班表" | "技師管理" | "收費方式" | "服務項目" | "設定"
  >("班表");
  const front = new URLSearchParams(location.search).get("front");
  if (front === "portal" || front === "work") {
    const portal: BeautyPortalData = {
      store: { id: "synthetic", name: "合成美業", slug: "synthetic" },
      services,
      techs,
      policy: data.policy,
      canWork: true,
      work: front === "work",
      customer: { id: "member", name: "合成顧客", phone: "0912345678" },
      members: [],
      plans: [],
      bank: null,
      purchases: [],
      grants: ["complete", "cancel", "reschedule", "income"],
      items: data.items,
      cards: [],
      income: [],
    };
    return <BeautyPortal data={portal} />;
  }
  if (new URLSearchParams(location.search).has("front"))
    return (
      <main className="mx-auto max-w-3xl p-4">
        <h1>合成美業｜體驗預約</h1>
        <BeautyBookingForm
          catalog={{ services, techs }}
          mode="public"
          slug="synthetic"
        />
      </main>
    );
  return (
    <main className="min-h-screen space-y-4 bg-earth-50 p-4">
      <h1 className="text-lg font-semibold">美業介面驗收（合成資料）</h1>
      <nav className="flex flex-wrap gap-3">
        {(["班表", "技師管理", "收費方式", "服務項目", "設定"] as const).map(
          (t) => (
            <button
              key={t}
              className="min-h-11 rounded border px-3"
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </nav>
      <BeautyDashboard key={tab} tab={tab} data={data} slug="synthetic" />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
