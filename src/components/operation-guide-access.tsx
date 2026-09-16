"use client";
import { createContext } from "react";
import type { GuideAccess } from "@/lib/operation-guide-types";
export const GuideAccessContext = createContext<GuideAccess>({ module: "steamfoot", permissions: [], features: {} });
