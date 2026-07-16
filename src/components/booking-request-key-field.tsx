"use client";

import { useState } from "react";
import { createBookingRequestKey } from "@/lib/booking-request-key";

export function BookingRequestKeyField() {
  const [requestKey] = useState(createBookingRequestKey);

  return (
    <input
      type="hidden"
      name="requestKey"
      value={requestKey}
      suppressHydrationWarning
    />
  );
}
