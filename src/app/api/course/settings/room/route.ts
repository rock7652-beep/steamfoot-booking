import { courseRoomEditInput } from "@/lib/course-room-input";
import { saveCourseRoomSettings } from "@/server/actions/course";
import { settingsSavePOST } from "@/server/services/settings-save-route";
export const POST = settingsSavePOST(courseRoomEditInput, saveCourseRoomSettings);
