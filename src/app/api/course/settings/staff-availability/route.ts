import {courseAvailabilitySaveInput} from "@/lib/course-staff-availability-save";
import {saveCourseAvailabilityConfirmed} from "@/server/actions/course-availability";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseAvailabilitySaveInput,saveCourseAvailabilityConfirmed);
