import { getStoreContext } from "@/lib/store-context";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import RegisterForm from "./register-form";

export default async function RegisterPage() {
  const context = await getStoreContext();
  const storeSlug = context?.storeSlug ?? "zhubei";
  const store = await resolveStoreBySlug(storeSlug);
  return <RegisterForm storeSlug={storeSlug} storeName={getCustomerFacingStoreName(store)}/>;
}
