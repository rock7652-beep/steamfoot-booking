import {dutySettingsSaveInput} from "@/lib/duty-settings-save";
import {saveDutySettings} from "@/server/services/duty-settings-save";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(dutySettingsSaveInput,saveDutySettings);
