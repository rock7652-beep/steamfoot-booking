import {selfBookingSaveInput} from "@/lib/course-self-booking-save";
import {saveCourseSelfBookingSettings} from "@/server/actions/course-settings";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(selfBookingSaveInput,({enabled,...receipt})=>saveCourseSelfBookingSettings({enabled,receipt}));
