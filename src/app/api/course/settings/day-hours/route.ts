import {courseDayHoursSaveInput} from "@/lib/course-day-hours-save";
import {saveCourseDayHours} from "@/server/actions/course-business-hours";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseDayHoursSaveInput,({values,...receipt})=>saveCourseDayHours({...values,receipt}));
