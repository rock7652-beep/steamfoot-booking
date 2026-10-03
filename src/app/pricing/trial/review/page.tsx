import { notFound } from "next/navigation";
import { isProduction } from "@/lib/runtime-env";
import { DeviceReview } from "./device-review";
export const dynamic = "force-dynamic";
export default function Page() {
  if (isProduction()) notFound();
  return <DeviceReview />;
}
