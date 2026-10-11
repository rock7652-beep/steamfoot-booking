import {courseBookingWindowSaveInput} from "@/lib/course-booking-window-save";
import {saveSteamBookingWindow} from "@/server/services/steam-booking-window-save";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseBookingWindowSaveInput,saveSteamBookingWindow);
