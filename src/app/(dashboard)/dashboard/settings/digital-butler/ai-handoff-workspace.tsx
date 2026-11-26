"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { AiHandoffSnapshot } from "@/server/ai/handoff-contract";
type Shared = { snapshot: AiHandoffSnapshot | null; accept(snapshot: AiHandoffSnapshot): void };
const Context = createContext<Shared | null>(null);
export const useAiHandoffWorkspace = () => useContext(Context);
export function AiHandoffWorkspace({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AiHandoffSnapshot | null>(null);
  function accept(incoming: AiHandoffSnapshot) {
    if (incoming.viewKey !== viewKey) return;
    setSnapshot(current => ({ ...incoming,
      synthetic: current && current.synthetic.revision > incoming.synthetic.revision ? current.synthetic : incoming.synthetic,
      routing: current && current.routing.revision > incoming.routing.revision ? current.routing : incoming.routing,
    }));
  }
  return <Context.Provider value={{ snapshot, accept }}>{children}</Context.Provider>;
}
