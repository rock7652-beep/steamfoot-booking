import { pathToFileURL } from "node:url";
import { readStoreLineConfigs } from "../src/lib/store-line-config";

/** Validate both sources in the build environment without logging identifiers or
 * secrets. This runs before migration/build commands and never contacts LINE. */
export function storeLineAdditionsPreflight() {
  if (!process.env.STORE_LINE_ADDITIONAL_CONFIG_JSON) return { enabled: false };
  readStoreLineConfigs();
  return { enabled: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = storeLineAdditionsPreflight();
    console.info(`[store-line-additions-preflight] ${result.enabled ? "passed" : "not configured"}`);
  } catch {
    // Do not print parsed values, Zod errors or process.env.
    console.error("[store-line-additions-preflight] blocked: check store mappings and Provider compatibility; existing settings were not changed");
    process.exitCode = 1;
  }
}
