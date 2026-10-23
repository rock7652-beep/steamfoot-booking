"use client";
import {createContext,useContext,useMemo,type ReactNode} from "react";
import {useConfirmedSettingsRows} from "@/components/admin/use-confirmed-settings-rows";
const DutyStatusContext=createContext<{enabled:boolean;confirm:(enabled:boolean)=>void}|null>(null);
export function DutyStatusProvider({enabled,children}:{enabled:boolean;children?:ReactNode}){
 const source=useMemo(()=>[{id:"duty",enabled}],[enabled]);
 const receipt=useConfirmedSettingsRows(source,row=>String(row.enabled));
 return <DutyStatusContext.Provider value={{enabled:receipt.rows[0].enabled,confirm:enabled=>receipt.confirm({id:"duty",enabled})}}>{children}</DutyStatusContext.Provider>;
}
export function useDutyStatus(){return useContext(DutyStatusContext);}
export function DutyEnabledContent({when=true,children}:{when?:boolean;children?:ReactNode}){
 const status=useDutyStatus();return status?.enabled===when?<>{children}</>:null;
}
