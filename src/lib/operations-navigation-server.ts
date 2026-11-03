import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { scopedOperationsHref } from "./operations-navigation";
/** Proxy overwrites this header with the actual HQ/store pathname. */
export async function redirectOperations(href:string):Promise<never> {
  const pathname=(await headers()).get("x-next-pathname")??"";
  return redirect(scopedOperationsHref(href,pathname));
}
