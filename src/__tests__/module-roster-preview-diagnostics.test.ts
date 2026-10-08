import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { allowModuleRosterPreviewDiagnostics } from "@/lib/module-roster-preview-diagnostics";
import { RosterPreviewDiagnosticsProvider, safeRosterErrorCode, useRosterPreviewErrorCode } from "@/components/admin/roster-preview-diagnostics";

const env = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/unify-module-notes-density", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres", DIRECT_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres" };
const scope = {role:"ADMIN",storeId:"staging-store",pathname:"/s/staging/admin/dashboard/bookings"};
it("requires the exact isolated preview, authorized admin, route and test store", () => {
  expect(allowModuleRosterPreviewDiagnostics(env,scope)).toBe(true);
  for (const override of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},{VERCEL_GIT_REPO_OWNER:"other"},{VERCEL_GIT_REPO_SLUG:"other"},{VERCEL:""},{WORKERS_CI_BRANCH:"other"},{CF_PAGES_BRANCH:"other"},{DATABASE_URL:"postgresql://production.invalid/postgres"},{DIRECT_URL:""}]) expect(allowModuleRosterPreviewDiagnostics({...env,...override},scope)).toBe(false);
  for (const override of [{role:"OWNER"},{storeId:"other-store"},{storeId:null},{pathname:"/hq/dashboard/bookings"},{pathname:"/s/other/admin/dashboard/bookings"},{pathname:"/s/staging/admin/dashboard/customers"}]) expect(allowModuleRosterPreviewDiagnostics(env,{...scope,...override})).toBe(false);
});
it.each([
  ["Minified React error #185; visit https://example.invalid/PRIVATE?notes=SECRET", "REACT_185"],
  ["Cannot read properties of null (reading 'PRIVATE_DATA')", "NULL_PROPERTY"],
  ["Maximum update depth exceeded: PRIVATE_DATA", "UPDATE_DEPTH"],
  ["Rendered fewer hooks than expected", "HOOK_ORDER"],
  ["PRIVATE_DATA is not a function", "NOT_CALLABLE"],
  ["PRIVATE_DATA is not iterable", "INVALID_LIST"],
  ["Invalid time value", "INVALID_DATE"],
  ["removeChild failed: PRIVATE_DATA", "DOM_REMOVE_CHILD"],
  ["PRIVATE_DATA https://example.invalid/secret", "UNCLASSIFIED"],
  [null, "UNCLASSIFIED"],
])("emits only a safe allowlisted error marker", (message, code) => {
  expect(safeRosterErrorCode(message)).toBe(code);
});
function Probe() { const code=useRosterPreviewErrorCode(new Error("Minified React error #185; PRIVATE_DATA")); return createElement("p",null,code); }
it("renders no diagnostic by default or for production/another store", () => {
  expect(renderToStaticMarkup(createElement(Probe))).toBe("<p></p>");
  for(const enabled of [false,allowModuleRosterPreviewDiagnostics({...env,VERCEL_ENV:"production"},scope),allowModuleRosterPreviewDiagnostics(env,{...scope,storeId:"other-store"})]) expect(renderToStaticMarkup(createElement(RosterPreviewDiagnosticsProvider,{enabled},createElement(Probe)))).toBe("<p></p>");
  expect(renderToStaticMarkup(createElement(RosterPreviewDiagnosticsProvider,{enabled:true},createElement(Probe)))).toBe("<p>REACT_185</p>");
});
