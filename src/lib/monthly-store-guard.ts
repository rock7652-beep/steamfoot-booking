import {AppError} from "@/lib/errors";
/** A displayed HQ form is bound to the selected store; a stale tab cannot write after switching. */
export function assertMonthlyStore(input:unknown, storeId:string, role:string) {
  const expected=input && typeof input==="object" && "expectedStoreId" in input ? input.expectedStoreId : undefined;
  if ((role==="ADMIN" && expected!==storeId) || (expected!==undefined && expected!==storeId))
    throw new AppError("CONFLICT", "目前門市已切換，請重新開啟月結後再操作。");
}
