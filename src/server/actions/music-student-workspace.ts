"use server";
import {readMusicStudentWorkspace} from "@/server/queries/music-student-workspace";
export async function loadMusicStudentWorkspace(input: unknown, includeTuition: unknown = true) {
  return readMusicStudentWorkspace(input, false, undefined, includeTuition);
}
