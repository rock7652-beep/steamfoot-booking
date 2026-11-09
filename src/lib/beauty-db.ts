import { loadBeautyPrismaRuntime } from "./generated-prisma-runtime";
import {withExplicitRelationJoins} from "./explicit-relation-joins";
import "server-only";
import type { PrismaClient } from "../../generated/beauty-client";
import { buildBeautyDatabaseUrl } from "./beauty-database-url";
import { guardedSportsSharedCardPreviewClient } from "./sports-shared-card-preview";
const { PrismaClient: RuntimePrismaClient } = loadBeautyPrismaRuntime();
const globalBeauty=globalThis as unknown as {beauty?:PrismaClient;beautyDatabaseUrl?:string};
// Validation happens before cache lookup too: an old pool cannot mask bad config.
const url=buildBeautyDatabaseUrl();
export const beautyPrisma=guardedSportsSharedCardPreviewClient(()=>globalBeauty.beautyDatabaseUrl===url?globalBeauty.beauty:undefined,()=>withExplicitRelationJoins(new RuntimePrismaClient({datasources:{db:{url}}})));
if(process.env.NODE_ENV!=="production") {globalBeauty.beauty=beautyPrisma;globalBeauty.beautyDatabaseUrl=url;}
