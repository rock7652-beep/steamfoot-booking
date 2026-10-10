import {staffSettingsSaveInput} from "@/lib/staff-settings-save";
import {saveStaffConfirmed} from "@/server/actions/staff";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(staffSettingsSaveInput,saveStaffConfirmed);
