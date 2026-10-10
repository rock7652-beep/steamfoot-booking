import { coursePlanSaveInput } from "@/lib/course-plan-save";
import { saveCoursePointPlan } from "@/server/actions/course-members";
import { settingsSavePOST } from "@/server/services/settings-save-route";

export const POST = settingsSavePOST(coursePlanSaveInput, ({expectedStoreId,requestKey,...values}) =>
  saveCoursePointPlan({...values,receipt:{expectedStoreId,requestKey}}));
