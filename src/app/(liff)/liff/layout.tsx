import BuildFooter from "@/components/build-footer";

/**
 * LIFF route layout — 故意 *不* 沿用 (customer) layout，因為：
 *   1. (customer) layout 會 getCurrentUser() 後 redirect，不允許未登入訪問
 *   2. LIFF 入口必須允許未登入（PR-A 階段不接 NextAuth 流程）
 *
 * 故另開 (liff) route group，避免被 customer auth gate 擋下。
 */
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-earth-50">
      <main className="flex-1">{children}</main>
      <BuildFooter />
    </div>
  );
}
