"use server";
import {readMusicStudentWorkspace} from "@/server/queries/music-student-workspace";
export async function loadMusicStudentWorkspace(input: unknown) {
  return readMusicStudentWorkspace(input);
}
