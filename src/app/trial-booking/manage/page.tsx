import { Suspense } from "react";
import { TrialBookingManager } from "./trial-booking-manager";

export default function TrialBookingManagePage() {
  return <Suspense fallback={<main className="p-6">載入中…</main>}><TrialBookingManager /></Suspense>;
}
