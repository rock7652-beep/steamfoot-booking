import { BeautyPortal } from "@/components/beauty/portal";
import { beautyPortal } from "@/server/beauty/queries";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ work?: string }>;
}) {
  const q = await searchParams;
  return <BeautyPortal data={await beautyPortal(q.work === "1")} />;
}
