import {weeklySaveInput} from "@/lib/course-weekly-hours-save";
import {saveCourseWeeklyHours} from "@/server/actions/course-business-hours";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(weeklySaveInput,({days,confirmForSetup,...receipt})=>saveCourseWeeklyHours({days,confirmForSetup,receipt}));
