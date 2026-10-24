/** Pricing type changes service time only when the shop configured an explicit trial duration. */
export function serviceDuration(service:{duration:number;trialDuration?:number|null},isTrial=false){return isTrial?(service.trialDuration??service.duration):service.duration;}
