import {serviceHoursSaveInput} from "@/lib/service-hours-save";
import {saveServiceHours} from "@/server/services/service-hours-save";
import {settingsSavePOST} from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(serviceHoursSaveInput,saveServiceHours);
