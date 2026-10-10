import { spaPackageValues, spaSaveReceipt } from "@/lib/spa-settings-save";
import { saveSpaPackage } from "@/server/actions/spa-commerce";
import { settingsSavePOST } from "@/server/services/settings-save-route";

const schema=spaPackageValues.merge(spaSaveReceipt).refine(row=>!row.id||!!row.expectedUpdatedAt);
export const POST=settingsSavePOST(schema,async ({expectedStoreId,requestKey,expectedRevision,...values})=>
  saveSpaPackage({...values,receipt:{expectedStoreId,requestKey,expectedRevision}}));
