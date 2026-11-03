import "server-only";
import { beautyDatabaseSelection } from "../../scripts/beauty-database-scope.mjs";
import { buildDatabaseUrl } from "./database-url";

/** Only the Beauty client selects the dedicated secret. Other clients retain DATABASE_URL. */
export function buildBeautyDatabaseUrl(): string {
  const dedicated = beautyDatabaseSelection(process.env);
  return dedicated === undefined ? buildDatabaseUrl() : buildDatabaseUrl(dedicated);
}
