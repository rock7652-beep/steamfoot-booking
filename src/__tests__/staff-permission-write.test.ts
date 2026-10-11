import {expect,it,vi} from "vitest";
import type {Prisma} from "@prisma/client";
import {ALL_PERMISSIONS} from "@/lib/permissions";
import {replaceStaffPermissionGrants,writeStaffPermissionChanges} from "@/server/services/staff-permission-write";
it("replaces known grants in at most three writes while preserving other staff, unknown permissions and existing rows",async()=>{
 const rows=new Map<string,{id:string;staffId:string;permission:string;granted:boolean}>([
  ["a:transaction.refund",{id:"kept",staffId:"a",permission:"transaction.refund",granted:true}],
  ["a:legacy",{id:"legacy",staffId:"a",permission:"legacy",granted:true}],
  ["b:transaction.refund",{id:"other",staffId:"b",permission:"transaction.refund",granted:true}],
 ]);
 const createMany=vi.fn(async({data})=>{for(const row of data){const key=`${row.staffId}:${row.permission}`;if(!rows.has(key))rows.set(key,{...row,id:key});}return {count:data.length};});
 const updateMany=vi.fn(async({where,data})=>{for(const row of rows.values())if(row.staffId===where.staffId&&where.permission.in.includes(row.permission))row.granted=data.granted;return {count:1};});
 const tx={staffPermission:{createMany,updateMany}} as unknown as Pick<Prisma.TransactionClient,"staffPermission">;
 await replaceStaffPermissionGrants(tx,"a",["transaction.read"]);
 expect(createMany).toHaveBeenCalledTimes(1);expect(updateMany).toHaveBeenCalledTimes(2);expect(rows.get("a:transaction.refund")).toMatchObject({id:"kept",granted:false});expect(rows.get("a:transaction.read")?.granted).toBe(true);
 expect(rows.get("a:legacy")?.granted).toBe(true);expect(rows.get("b:transaction.refund")?.granted).toBe(true);expect(ALL_PERMISSIONS.every(code=>rows.get(`a:${code}`)?.granted===(code==="transaction.read"))).toBe(true);
 await writeStaffPermissionChanges(tx,"a",[{permission:"transaction.create",granted:true}]);expect(rows.get("a:transaction.read")?.granted).toBe(true);expect(rows.get("a:transaction.create")?.granted).toBe(true);expect(rows.get("a:transaction.refund")?.granted).toBe(false);
 const calls=createMany.mock.calls.length;await expect(writeStaffPermissionChanges(tx,"a",[{permission:"unknown",granted:true}])).rejects.toThrow("權限設定不正確");expect(createMany).toHaveBeenCalledTimes(calls);
 await replaceStaffPermissionGrants(tx,"a",ALL_PERMISSIONS);expect(ALL_PERMISSIONS.every(code=>rows.get(`a:${code}`)?.granted)).toBe(true);expect(rows.get("a:transaction.refund")?.id).toBe("kept");
});
