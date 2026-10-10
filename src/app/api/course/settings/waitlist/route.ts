import {waitlistSaveInput} from "@/lib/course-waitlist-save";
import {saveCourseWaitlistSettings} from "@/server/actions/course-waitlist";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(waitlistSaveInput,({expectedStoreId,requestKey,expectedRevision,...values})=>saveCourseWaitlistSettings({...values,receipt:{expectedStoreId,requestKey,expectedRevision}}));
