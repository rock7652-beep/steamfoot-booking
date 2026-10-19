export type SportsMovePatch={id:string;startsAt:string;endsAt:string;roomId:string;coachId:string;rescheduledFromStartsAt:string|null;rescheduledFromEndsAt:string|null;rescheduledFromRoomId:string|null;rescheduledFromCoachId:string|null;rescheduleKind:string|null;rescheduledAt:string|null;releasedAt:string|null};
/** Only committed server values can replace a card; no balance or attendance is guessed. */
export function applySportsMovePatches<T extends {id:string;previewFaded?:string}>(rows:T[],patches:SportsMovePatch[]):T[]{
 const byId=new Map(patches.map(p=>[p.id,p]));
 return rows.map(row=>{const p=byId.get(row.id);if(!p)return row;const {releasedAt,...fields}=p;return {...row,...fields,previewFaded:releasedAt?"異動／請假":undefined} as T;});
}
