"use client";
import {saveSteamfootNoticeSetting} from "@/server/actions/steamfoot-store-notices";
import {OperationSettingSwitch} from "./operation-setting-switch";
export function SteamfootNoticeSetting(props:{storeId:string;initialEnabled:boolean;canEdit:boolean}) {
 return <OperationSettingSwitch {...props} title="後台異動通知" save={saveSteamfootNoticeSetting} eventName="steamfoot-notices-setting"/>;
}
