"use client";

import { useState } from "react";
import { BookingRequestKeyLifecycle } from "@/lib/booking-request-key";

export function useBookingRequestKey(): BookingRequestKeyLifecycle {
  const [lifecycle] = useState(() => new BookingRequestKeyLifecycle());
  return lifecycle;
}
