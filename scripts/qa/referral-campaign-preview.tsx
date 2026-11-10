// Reuse the approved static marketing snapshot and render the actual new component.
// No application routing, database access, credentials or subscription mutations.
import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { ReferralCampaign } from "../../src/app/pricing/referral-campaign";

async function main() {
  const root = "artifacts/marketing-copy-20261104/preview";
  const file = `${root}/index.html`;
  const existing = readFileSync(file, "utf8").replace(/<!-- referral-campaign:start -->[\s\S]*?<!-- referral-campaign:end -->/, "");
  const marker = '<section aria-labelledby="store-work-title"';
  if (!existing.includes(marker)) throw new Error("Expected marketing homepage insertion point missing");
  writeFileSync(file, existing.replace(marker, `<!-- referral-campaign:start -->${renderToStaticMarkup(<ReferralCampaign />)}<!-- referral-campaign:end -->${marker}`));
  const css = await postcss([tailwindcss()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  writeFileSync(`${root}/style.css`, css.css);
  console.log("Rendered referral campaign and refreshed preview CSS; no database access.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
