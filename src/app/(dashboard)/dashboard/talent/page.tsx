import { redirect } from "next/navigation";

/**
 * 舊 /dashboard/talent 路由 → 已搬家到 /dashboard/growth
 *
 * 保留此檔做 301 redirect，避免書籤/外部連結失效。
 */
export default function TalentLegacyRedirect() {
  redirect("/dashboard/growth");
}
