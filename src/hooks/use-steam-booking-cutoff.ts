"use client";

import { useEffect, useState } from "react";

type TimedSlot = { startTime: string; bookingTimeLeftMs?: number };

export function useSteamBookingCutoff(slots: readonly TimedSlot[], selected: string | null, onExpire: () => void) {
  const [clock, setClock] = useState<{ slots: readonly TimedSlot[]; elapsed: number }>();
  const elapsed = clock?.slots === slots ? clock.elapsed : 0;
  const closed = (slot: TimedSlot) => slot.bookingTimeLeftMs !== undefined && slot.bookingTimeLeftMs < elapsed;
  const selectedExpired = slots.some((slot) => slot.startTime === selected && closed(slot));

  useEffect(() => {
    const deadlines = slots.flatMap((slot) => slot.bookingTimeLeftMs !== undefined && slot.bookingTimeLeftMs >= 0 ? [slot.bookingTimeLeftMs] : []);
    if (deadlines.length === 0) return;
    const receivedAt = performance.now();
    let timer: number;
    function schedule(elapsed: number) {
      const next = Math.min(...deadlines.filter((ms) => ms >= elapsed));
      if (Number.isFinite(next)) {
        timer = window.setTimeout(update, Math.min(next - elapsed + 1, 2_147_483_647));
      }
    }
    function update() {
      window.clearTimeout(timer);
      const elapsed = Math.floor(performance.now() - receivedAt);
      setClock({ slots, elapsed });
      schedule(elapsed);
    }
    schedule(0);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [slots]);

  useEffect(() => {
    if (selectedExpired) onExpire();
  }, [selectedExpired, onExpire]);

  return closed;
}
