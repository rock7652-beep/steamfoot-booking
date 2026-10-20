import "server-only";
import { PrismaClient } from "../../generated/beauty-client";
import { buildDatabaseUrl } from "./database-url";
// Same guarded connection URL as the other module clients; no secondary secrets.
import { guardedSportsSharedCardPreviewClient } from "./sports-shared-card-preview";
const globalBeauty=globalThis as unknown as {beauty?:PrismaClient};
export const beautyPrisma=guardedSportsSharedCardPreviewClient(()=>globalBeauty.beauty,()=>new PrismaClient({datasources:{db:{url:buildDatabaseUrl()}}}));
if(process.env.NODE_ENV!=="production")globalBeauty.beauty=beautyPrisma;
