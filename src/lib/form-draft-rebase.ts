/** Explicit user reconciliation only. Preserve edited fields and adopt new values elsewhere. */
export function rebaseFormDraft<T extends Record<string,string|boolean>>(base:T,values:T,latest:T):T {
 const merged={...latest};
 for(const key of Object.keys(base) as Array<keyof T>)if(values[key]!==base[key])merged[key]=values[key];
 return merged;
}
