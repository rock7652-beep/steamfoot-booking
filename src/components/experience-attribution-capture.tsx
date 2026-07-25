"use client";

import { useEffect } from "react";

const KEYS = ["source", "campaign", "creative", "medium", "adset"] as const;
const MAX_LENGTH = 120;

function normalize(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().slice(0, MAX_LENGTH).replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned || null;
}

/**
 * Captures the first valid advertising touch without showing tracking values to
 * the visitor. The cookie lets the later booking flow persist the attribution
 * server-side when the booking is created.
 */
export function ExperienceAttributionCapture({ storeSlug }: { storeSlug: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storageKey = `experience-attribution:${storeSlug}`;
    if (localStorage.getItem(storageKey)) return;

    const attribution = Object.fromEntries(
      KEYS.flatMap((key) => {
        const value = normalize(params.get(key));
        return value ? [[key, value]] : [];
      }),
    );

    const payload = {
      storeSlug,
      source: attribution.source ?? "direct",
      campaign: attribution.campaign ?? null,
      creative: attribution.creative ?? null,
      medium: attribution.medium ?? null,
      adset: attribution.adset ?? null,
      firstTouchAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(payload);
    localStorage.setItem(storageKey, serialized);
    document.cookie = `experience-attribution=${encodeURIComponent(serialized)};path=/;max-age=2592000;samesite=lax`;
  }, [storeSlug]);

  return null;
}
