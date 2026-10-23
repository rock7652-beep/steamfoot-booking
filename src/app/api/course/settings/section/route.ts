import { courseSettingsSectionSaveInput } from "@/lib/course-settings-sections";
import { saveCourseSettingsSection } from "@/server/actions/course-settings";
import { settingsSavePOST } from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(courseSettingsSectionSaveInput,({values,...receipt})=>saveCourseSettingsSection({...values,receipt}));
