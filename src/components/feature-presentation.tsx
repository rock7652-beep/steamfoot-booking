"use client";

import { createContext, useContext, type ReactNode } from "react";
import { FEATURES } from "@/lib/feature-flags";
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
  return <FeatureStateEntry state={state} label={label}>{children}</FeatureStateEntry>;
}

/** Shared three-state presentation; owner adapters provide their own entitlement. */
export function FeatureStateEntry({state,label,children}:{state:FeaturePresentationState|undefined;label:string;children:ReactNode}) {
  if (state === "HIDDEN") return null;
  if (state === "LOCKED") return <div className="flex min-h-11 items-center justify-between gap-3 border-b border-earth-100 py-3 text-sm"><span className="font-medium text-primary-900">{label}</span><span className="text-earth-500">未開通</span></div>;
  return children;
}

/** One existing settings entry for independently entitled capabilities. */
export function DigitalButlerSettingsEntry({ children }: { children: ReactNode }) {
  const deterministic = useFeaturePresentation(FEATURES.DIGITAL_BUTLER);
  const ai = useFeaturePresentation(FEATURES.AI_DIGITAL_BUTLER);
  const feature = ai === "ENABLED" && deterministic !== "ENABLED" ? FEATURES.AI_DIGITAL_BUTLER : FEATURES.DIGITAL_BUTLER;
  return <FeatureEntry feature={feature} label="數位管家">{children}</FeatureEntry>;
}
