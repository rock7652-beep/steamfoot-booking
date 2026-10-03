"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureKey } from "@/lib/feature-flags";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";

export type FeaturePresentationMap = Partial<Record<FeatureKey, FeaturePresentationState>>;
const Context = createContext<FeaturePresentationMap>({});

export function FeaturePresentationProvider({ states, children }: { states: FeaturePresentationMap; children: ReactNode }) {
  return <Context.Provider value={states}>{children}</Context.Provider>;
}

export function useFeaturePresentation(feature: FeatureKey) {
  return useContext(Context)[feature];
}

/** Do not mount hidden/locked editors or trigger their data requests. */
export function FeatureEntry({ feature, label, children }: { feature: FeatureKey; label: string; children: ReactNode }) {
  const state = useFeaturePresentation(feature);
  if (state === "HIDDEN") return null;
  if (state === "LOCKED") return <div className="flex min-h-11 items-center justify-between gap-3 border-b border-earth-100 py-3 text-sm"><span className="font-medium text-primary-900">{label}</span><span className="text-earth-500">未開通</span></div>;
  return children;
}
