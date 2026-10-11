import "server-only";
import type {Prisma} from "@prisma/client";
import {AppError} from "@/lib/errors";
import {ALL_PERMISSIONS} from "@/lib/permissions";

/** Call after the role/scope checks, inside the existing staff transaction. */
export async function replaceStaffPermissionGrants(tx:Pick<Prisma.TransactionClient,"staffPermission">,staffId:string,granted:readonly string[]) {
  await writeStaffPermissionChanges(tx,staffId,ALL_PERMISSIONS.map(permission=>({permission,granted:granted.includes(permission)})));
}

/** Partial edits retain every permission omitted by the editor. */
export async function writeStaffPermissionChanges(tx:Pick<Prisma.TransactionClient,"staffPermission">,staffId:string,changes:readonly {permission:string;granted:boolean}[]) {
  if(changes.some(row=>!ALL_PERMISSIONS.includes(row.permission as typeof ALL_PERMISSIONS[number]) || typeof row.granted!=="boolean"))throw new AppError("VALIDATION","權限設定不正確");
  if(!changes.length)return;
  const values=changes.map(row=>({...row,staffId}));
  // Existing IDs and relations remain intact; only missing permission rows are inserted.
  await tx.staffPermission.createMany({data:values,skipDuplicates:true});
  for(const allowed of [true,false]){
    const permissions=values.filter(value=>value.granted===allowed).map(value=>value.permission);
    if(permissions.length)await tx.staffPermission.updateMany({where:{staffId,permission:{in:permissions}},data:{granted:allowed}});
  }
}
