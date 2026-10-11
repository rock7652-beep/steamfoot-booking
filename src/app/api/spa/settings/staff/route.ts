import {spaStaffSettingsSaveInput} from "@/lib/staff-settings-save";
import {saveSpaStaffConfirmed} from "@/server/actions/spa-operations";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(spaStaffSettingsSaveInput,saveSpaStaffConfirmed);
