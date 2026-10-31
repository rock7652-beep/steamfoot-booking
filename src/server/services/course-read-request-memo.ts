import "server-only";
import {coursePrisma} from "@/lib/course-db";
import {memoizeReadRequest} from "./read-request-memo";
import {measureMusicRead} from "@/lib/music-read-timing";

/** Metadata only in an explicitly scoped HTTP read. Never reuse a transaction
 * client's snapshot, even when a transaction is opened inside that read. */
export function memoizeCourseReadRequest<T>(reader:object,key:string,read:()=>Promise<T>):Promise<T>{
  return reader===coursePrisma?memoizeReadRequest(`course.metadata:${key}`,()=>measureMusicRead("courseMetadata",read)):read();
}
