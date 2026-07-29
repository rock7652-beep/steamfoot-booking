import { NextResponse } from "next/server";

const ZHUBEI_TRIAL_BOOKING_URL =
  "https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form";

export function GET(): NextResponse {
  return NextResponse.redirect(ZHUBEI_TRIAL_BOOKING_URL, 307);
}
