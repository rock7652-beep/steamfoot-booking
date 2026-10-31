export type NoticeReadTiming = {
  totalMs: number;
  spans: Array<{name:string;startMs:number;durationMs:number;ok:boolean}>;
};

/** Optional browser diagnostics; fixed labels only, no identities or payloads. */
export function markNoticeRead(namespace:string,phase:'intent'|'received'|'paint',timing?:NoticeReadTiming) {
  if(typeof window==='undefined'||!(window as Window&{__STEAMFOOT_NOTICE_PERF__?:boolean}).__STEAMFOOT_NOTICE_PERF__)return;
  performance.mark(`notice.${namespace}.${phase}`);
  if(timing)console.info('[NOTICE_READ_PERF]',JSON.stringify({namespace,...timing}));
}
