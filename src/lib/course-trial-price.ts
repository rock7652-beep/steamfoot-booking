import {clampTrialTotal} from "@/lib/shop-config";
type Settings=Parameters<typeof clampTrialTotal>[2];
export function courseTrialPrice(requested:number|undefined,settings:Settings,template?:{musicTrialMode?:string|null;musicPricePerLesson?:number|null;category?:string|null}) {
  const isTrial=!!template?.musicTrialMode||["體驗","體驗課","trial"].includes((template?.category??"").trim().replace(/\s+/g,"").toLocaleLowerCase());
  const quoted=template?.musicTrialMode==="FREE"?0:isTrial&&template?.musicPricePerLesson!=null?template.musicPricePerLesson:settings.trialDefaultPrice;
  if(requested===undefined||requested===quoted)return quoted;
  if(requested===0&&settings.trialAllowPriceEdit)return 0;
  return clampTrialTotal(requested,1,settings);
}
