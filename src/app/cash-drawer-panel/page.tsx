import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CashDrawerPage from "@/app/(dashboard)/dashboard/cash-drawer/page";

/** Proxy reaches this lightweight document only after the normal HQ/store
 * route guards. The shared page still authorizes every financial read. */
export default async function CashDrawerPanelPage(props: Parameters<typeof CashDrawerPage>[0]) {
  const pathname = (await headers()).get("x-next-pathname") ?? "";
  if (!/^(?:\/hq|\/s\/[^/]+\/admin)\/dashboard\/cash-drawer\/?$/.test(pathname)
    || (await props.searchParams).cashDrawerPanel !== "1") notFound();
  return <div className="px-4 py-2"><CashDrawerPage {...props} /></div>;
}
