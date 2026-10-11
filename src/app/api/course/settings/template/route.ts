import { courseTemplateSaveInput } from "@/lib/course-template-save";
import { saveCourseTemplateSettings } from "@/server/actions/course";
import { settingsSavePOST } from "@/server/services/settings-save-route";

export const POST = settingsSavePOST(courseTemplateSaveInput, saveCourseTemplateSettings);
