/** UI ports for module-specific writes. The default course implementation remains unchanged. */
export type CatalogStatusDriver = {
 impact:(input:{kind:string;ids:string[]})=>Promise<{success:true;count:number}|{success:false;error:string}>;
 apply:(input:{kind:string;ids:string[];active:boolean})=>Promise<{success:true;succeeded:string[];failed:{id:string;error:string}[]}|{success:false;error:string}>;
};
