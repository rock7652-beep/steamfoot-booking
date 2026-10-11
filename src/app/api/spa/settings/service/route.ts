import { spaServiceValues, spaSaveReceipt } from "@/lib/spa-settings-save";
import { saveSpaServiceDetails } from "@/server/actions/spa-service-staff";
import { settingsSavePOST } from "@/server/services/settings-save-route";

const schema=spaServiceValues.merge(spaSaveReceipt).refine(row=>!row.id||!!row.expectedRevision);
export const POST=settingsSavePOST(schema,async ({expectedStoreId,requestKey,expectedRevision,...values})=>
  saveSpaServiceDetails({...values,receipt:{expectedStoreId,requestKey,expectedRevision}}));
