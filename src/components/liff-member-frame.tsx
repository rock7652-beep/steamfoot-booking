import type { ReactNode } from "react";

export function LiffMemberFrame({ children }: { children: ReactNode }) {
  return <div className="liff-customer-ui flex min-h-screen flex-col bg-[linear-gradient(180deg,#f5f2eb_0%,#faf8f5_34%,#faf8f5_100%)]">{children}</div>;
}
