import { getStoreContext } from "@/lib/store-context";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import RegisterForm from "./register-form";
import { BookingLineEntry } from "@/components/booking-line-entry";
import { resolveBookingLineEntry } from "@/server/services/booking-line-entry";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export default async function RegisterPage() {
  const context = await getStoreContext();
  const storeSlug = context?.storeSlug ?? "zhubei";
  const store = await resolveStoreBySlug(storeSlug);
  const lineEntry = store && await getStoreIndustryModule(store.id) === "course" ? resolveBookingLineEntry(storeSlug) : null;
  return <div className="w-full max-w-sm"><BookingLineEntry href={lineEntry?.url}/><RegisterForm storeSlug={storeSlug} storeName={getCustomerFacingStoreName(store)}/></div>;
}
