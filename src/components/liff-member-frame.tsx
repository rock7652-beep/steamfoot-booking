import type { ReactNode } from "react";

export function LiffMemberFrame({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  return <div className={`liff-customer-ui flex flex-col bg-[linear-gradient(180deg,#f5f2eb_0%,#faf8f5_34%,#faf8f5_100%)] ${preview ? "min-h-[calc(100dvh-45px)]" : "min-h-screen"}`}>{children}</div>;
}
