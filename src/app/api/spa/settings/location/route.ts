import { spaLocationValues, spaSaveReceipt } from "@/lib/spa-settings-save";
import { saveSpaLocation } from "@/server/actions/spa-resources";
import { settingsSavePOST } from "@/server/services/settings-save-route";

const schema=spaLocationValues.merge(spaSaveReceipt).refine(row=>!row.id||!!row.expectedRevision);
export const POST=settingsSavePOST(schema,async ({expectedStoreId,requestKey,expectedRevision,...values})=>
  saveSpaLocation({...values,receipt:{expectedStoreId,requestKey,expectedRevision}}));
