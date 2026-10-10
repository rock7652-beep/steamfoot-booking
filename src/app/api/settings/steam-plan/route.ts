import {steamPlanSaveInput} from "@/lib/steam-plan-save";
import {saveSteamPlan} from "@/server/services/steam-plan-save";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(steamPlanSaveInput,saveSteamPlan);
