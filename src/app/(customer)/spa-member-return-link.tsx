"use client";

import { usePathname } from "next/navigation";
import { AppLink as Link } from "@/components/app-link";

export function SpaMemberReturnLink({ storeSlug }: { storeSlug: string }) {
  const pathname = usePathname();
  const memberHome = `/s/${storeSlug}/book`;

  if (pathname === memberHome || pathname === `${memberHome}/`) return null;

  return (
    <Link
      href={memberHome}
      className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-primary-700"
    >
      <span aria-hidden="true">←</span>
      返回會員專區
    </Link>
  );
}
