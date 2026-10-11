import {courseBookingWindowSaveInput} from "@/lib/course-booking-window-save";
import {saveCourseBookingWindowConfirmed} from "@/server/actions/course-booking-window";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseBookingWindowSaveInput,saveCourseBookingWindowConfirmed);
