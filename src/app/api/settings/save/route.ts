import { shopSettingsSaveInput } from "@/lib/shop-settings-save";
import { saveShopSettings } from "@/server/services/shop-settings-save";
import { settingsSavePOST } from "@/server/services/settings-save-route";
export const POST=settingsSavePOST(shopSettingsSaveInput,saveShopSettings);
