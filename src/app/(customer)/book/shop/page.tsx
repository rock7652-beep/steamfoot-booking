import { redirect } from "next/navigation";
import { getStoreContext } from "@/lib/store-context";

// 購買方案的入口已整合進「預約與方案」頁面 (/my-bookings?tab=plans)；
// 保留此 route 以避免舊書籤 / 通知連結 404，直接導去新位置。
export default async function ShopPage() {
  const ctx = await getStoreContext();
  const slug = ctx?.storeSlug ?? "zhubei";
  redirect(`/s/${slug}/my-bookings?tab=plans`);
}
