"use client";

import { useRef, useState } from "react";
import { BeautyPublicBookingForm } from "./public-booking-form";
import { CoursePortalBrand } from "@/components/course-portal-navigation";
import type { BeautyBookingCatalog } from "./booking-form";
import type { readBeautySlots, submitBeautyTrial } from "@/server/actions/beauty";
import styles from "./public-booking-form.module.css";

/** Visual/interaction fixture. Never calls a server action or a database. */
export function BeautyPublicBookingPreview() {
  const [scenario, setScenario] = useState("single");
  const attempts = useRef(0);
  const verifiedIdentity = scenario === "verified" || scenario === "link-pending";
  const catalog: BeautyBookingCatalog = {
    policy: { revision: 1, selfBooking: scenario !== "closed", selfCancel: true, selfReschedule: true, cancelDeduct: false, noShowDeduct: false, cancelLeadMinutes: 120 },
    services: scenario === "empty" ? [] : [
      { id: "sample-massage", name: "全身按摩", duration: 60, trialPrice: 750, price: 1200, revision: 1 },
      ...(scenario === "multiple" ? [{ id: "sample-face", name: "深層放鬆肩頸與臉部舒緩體驗服務", duration: 90, trialDuration: 45, trialPrice: 990, price: 1800, revision: 1 }] : []),
    ],
    techs: [{ id: "sample-tech", name: "範例技師", gender: "FEMALE", serviceIds: ["sample-massage", "sample-face"] }],
  };
  const read: typeof readBeautySlots = async () => { await new Promise(resolve => setTimeout(resolve, 200)); return { success: true, data: { slots: ["09:00", "09:30", "10:00", "10:30", "14:00", "14:30", "18:00"] } }; };
  const submit: typeof submitBeautyTrial = async () => {
    if (scenario === "retry" && attempts.current++ === 0) throw new Error("Synthetic transport failure");
    const linked = scenario === "verified" || scenario === "link-pending" && attempts.current++ > 0;
    return { success: true, data: { groupId: "synthetic-group", ids: ["synthetic-booking"], notificationSetup: { status: linked ? "linked" : "needs_help" } } };
  };
  return <div className={`course-portal ${styles.page}`}>
    <div className="cp-main"><p>隔離預覽：使用範例資料，不會建立預約或發送通知。</p>
      <label>預覽情境 <select aria-label="預覽情境" value={scenario} onChange={e => { attempts.current = 0; setScenario(e.target.value); }}><option value="single">單一服務</option><option value="verified">已驗證 LINE 身分</option><option value="link-pending">模擬連結待確認</option><option value="multiple">多項服務／長名稱</option><option value="retry">模擬送出結果未確認</option><option value="empty">尚無體驗服務</option><option value="closed">店家未開放</option></select></label>
    </div>
    <header className="cp-top"><CoursePortalBrand storeFirst storeName="舒生活｜公開預約範例"/></header>
    <main className="cp-main"><div className="cp-title"><h1>體驗預約</h1></div>
      <BeautyPublicBookingForm key={scenario} slug="synthetic" catalog={catalog} entry={verifiedIdentity ? "synthetic-verified-entry" : undefined} readSlots={read} submitTrial={submit} publicInfo={{ address: "範例地址（非實際營業地點）", contactUrl:"https://line.me/R/ti/p/@synthetic", mapUrl:"https://www.google.com/maps/dir/?api=1&destination=example", massageReminder: true, lineEntryHref:"https://liff.line.me/902-synthetic", lineIdentityVerified:verifiedIdentity }}/>
    </main>
  </div>;
}
