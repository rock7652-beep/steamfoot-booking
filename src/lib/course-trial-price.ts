import {clampTrialTotal} from "@/lib/shop-config";
type Settings=Parameters<typeof clampTrialTotal>[2];
export function courseTrialPrice(requested:number|undefined,settings:Settings,template?:{musicTrialMode?:string|null;musicPricePerLesson?:number|null}) {
  const quoted=template?.musicTrialMode==="FREE"?0:template?.musicTrialMode==="PAID"?(template.musicPricePerLesson??settings.trialDefaultPrice):settings.trialDefaultPrice;
  if(requested===undefined||requested===quoted)return quoted;
  if(requested===0&&settings.trialAllowPriceEdit)return 0;
  return clampTrialTotal(requested,1,settings);
}
