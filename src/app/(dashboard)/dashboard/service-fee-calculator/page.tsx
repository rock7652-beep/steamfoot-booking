import { redirectOperations } from "@/lib/operations-navigation-server";
import { legacyOperationsHref, type OperationsQuery } from "@/lib/operations-navigation";
export default async function Page({ searchParams }: { searchParams: Promise<OperationsQuery> }) {
  return redirectOperations(legacyOperationsHref("monthly", { ...await searchParams }));
}
