import { schedulingModeInput } from "@/lib/course-scheduling-mode-save";
import { saveCourseSchedulingMode } from "@/server/actions/course-scheduling-modes";
import { settingsSavePOST } from "@/server/services/settings-save-route";
export const POST = settingsSavePOST(schedulingModeInput, saveCourseSchedulingMode);
