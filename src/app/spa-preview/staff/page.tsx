import { redirect } from "next/navigation";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";

export default function SpaStaffPreviewEntryPage() {
  redirect(`/s/${SPA_DEMO_STORE.slug}/liff/staff-preview`);
}
