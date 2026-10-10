import {courseStaffSaveInput} from "@/lib/course-staff-save";
import {saveCourseStaffConfirmed} from "@/server/actions/course-staff";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseStaffSaveInput,saveCourseStaffConfirmed,400000);
