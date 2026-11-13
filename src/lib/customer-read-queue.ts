/** Owned by the authenticated operation provider. Reserve one slot for intent/open. */
export function createCustomerReadQueue(backgroundLimit=1){
 type Job={key:string;run:()=>Promise<unknown>;foreground:boolean;started:boolean;resolve:(value:unknown)=>void;reject:(error:unknown)=>void;promise:Promise<unknown>};
 const jobs=new Map<string,Job>();
 let running=0,background=0;
 function drain(){
  while(running<backgroundLimit+1){
   const waiting=[...jobs.values()].filter(j=>!j.started);
   const job=waiting.find(j=>j.foreground)??(background<backgroundLimit?waiting[0]:undefined);
   if(!job)return;
   job.started=true;running++;const speculative=!job.foreground;if(speculative)background++;
   void Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{
    running--;if(speculative)background--;if(jobs.get(job.key)===job)jobs.delete(job.key);drain();
   });
  }
 }
 return {
  read<T>(key:string,run:()=>Promise<T>,foreground=true):Promise<T>{
   const previous=jobs.get(key);
   if(previous){if(foreground)previous.foreground=true;drain();return previous.promise as Promise<T>;}
   let resolve!:(value:unknown)=>void,reject!:(error:unknown)=>void;
   const promise=new Promise<unknown>((yes,no)=>{resolve=yes;reject=no;});
   jobs.set(key,{key,run,foreground,started:false,resolve,reject,promise});drain();return promise as Promise<T>;
  },
  cancel(key:string){
   const job=jobs.get(key);
   if(job&&!job.started&&!job.foreground){jobs.delete(key);job.reject(new Error('背景讀取已暫停'));}
  },
  /** Detach running work and reject queued reads. Callers retain generation checks. */
  clear(){for(const job of jobs.values())if(!job.started)job.reject(new Error('讀取範圍已更新'));jobs.clear();},
 };
}
