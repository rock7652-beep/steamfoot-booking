import { redirect } from "next/navigation";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";

export default function SpaManagerPreviewEntryPage() {
  redirect(`/s/${SPA_DEMO_STORE.slug}/liff/manager-preview`);
}
