import {courseWorkPermissionInput} from "@/lib/course-work-permission-save";
import {saveCourseWorkPermission} from "@/server/services/course-work-permission-save";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseWorkPermissionInput,input=>saveCourseWorkPermission(input,"route"),4000);
