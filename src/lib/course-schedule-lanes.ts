/** Partition overlapping sessions within one resource and Taiwan calendar day. */
export function scheduleLanes<T extends {id:string; startsAt:string; endsAt:string; roomId:string; coachId:string}>(sessions:T[], resource:"roomId"|"coachId"="roomId") {
  const result = new Map<string,{lane:number;count:number}>();
  const groups = new Map<string,T[]>();
  for (const session of sessions) {
    // Compare instants rather than mixing serialized offsets and local clock text.
    const key = session[resource];
    const rows = groups.get(key) ?? [];
    rows.push(session); groups.set(key,rows);
  }
  for (const rows of groups.values()) {
    rows.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id));
    let cluster:T[]=[]; let clusterEnd=0;
    const flush=()=>{
      const ends:number[]=[];
      for (const row of cluster) {
        let lane=ends.findIndex(end=>end<=Date.parse(row.startsAt));
        if(lane<0) lane=ends.length;
        ends[lane]=Date.parse(row.endsAt); result.set(row.id,{lane,count:0});
      }
      for(const row of cluster) result.get(row.id)!.count=ends.length;
      cluster=[];
    };
    for(const row of rows) {
      const start=Date.parse(row.startsAt);
      if(cluster.length && start>=clusterEnd) flush();
      cluster.push(row); clusterEnd=Math.max(cluster.length===1?0:clusterEnd,Date.parse(row.endsAt));
    }
    flush();
  }
  return result;
}
