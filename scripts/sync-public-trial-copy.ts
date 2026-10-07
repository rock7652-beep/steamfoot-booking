import { readFileSync, writeFileSync } from "node:fs";
import { renderPublicTrialList } from "../src/lib/public-marketing-copy";

const path = "public/pricing/apply.html";
const html = readFileSync(path, "utf8");
const pattern = /<!-- public-trial-copy:start -->[\s\S]*?<!-- public-trial-copy:end -->/;
if (!pattern.test(html)) throw new Error("Application trial copy markers missing");
writeFileSync(path, html.replace(pattern, `<!-- public-trial-copy:start -->\n<ul>\n${renderPublicTrialList()}\n</ul>\n<!-- public-trial-copy:end -->`));
