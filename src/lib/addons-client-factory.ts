import {guardedSportsSharedCardPreviewClient} from './sports-shared-card-preview';
import {loadCoursePrismaRuntime} from './generated-prisma-runtime';
import 'server-only';
import {Prisma,PrismaClient} from '@prisma/client';
import {withExplicitRelationJoins} from './explicit-relation-joins';
import {withMusicRetirement} from './music-retirement';
import {assertMusicOpeningRuntimeIsolation,withMusicOpeningRuntimeSchema} from './music-opening-preview-isolation';
import {withAuditDatabaseContext} from './audit-db-context';
import {assertStoreMemberWorkorderReviewOnly} from '../../scripts/store-member-workorder-review-gate.mjs';

/** Same transaction/actor/archive wrappers as the main client, separate pool. */
export function createAddOnsClient(url:string):PrismaClient{
 assertStoreMemberWorkorderReviewOnly();
 assertMusicOpeningRuntimeIsolation();
 return guardedSportsSharedCardPreviewClient(()=>undefined,()=>withAuditDatabaseContext(withMusicRetirement(withMusicOpeningRuntimeSchema(withExplicitRelationJoins(new PrismaClient({
  datasources:{db:{url}},log:['error'],
 }))),Prisma.dmmf.datamodel.models),true));
}

/** Course models use their own generated runtime, with the same dedicated role. */
export function createCourseAddOnsClient(url:string){
 assertStoreMemberWorkorderReviewOnly();
 assertMusicOpeningRuntimeIsolation();
 const {PrismaClient:CourseClient,Prisma:CoursePrisma}=loadCoursePrismaRuntime();
 return guardedSportsSharedCardPreviewClient(()=>undefined,()=>withAuditDatabaseContext(withMusicRetirement(withMusicOpeningRuntimeSchema(withExplicitRelationJoins(new CourseClient({datasources:{db:{url}},log:['error']}))),CoursePrisma.dmmf.datamodel.models)));
}
