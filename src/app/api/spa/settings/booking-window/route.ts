import {courseBookingWindowSaveInput} from "@/lib/course-booking-window-save";
import {saveSpaBookingWindow} from "@/server/services/spa-booking-window-save";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseBookingWindowSaveInput,saveSpaBookingWindow);
