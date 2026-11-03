export const MUSIC_DEFAULT_DURATION_MINUTES = 50;

/** A scheduling identity belongs to a teaching item, never to a tuition version. */
export const musicTeachingPrefix = "teaching:";
export function musicTeachingKey(subjectId:string,trial=false) { return `${trial?"teaching-trial:":musicTeachingPrefix}${subjectId}`; }
export function musicTeachingSubjectId(key:string) { return key.startsWith("teaching-trial:")?key.slice("teaching-trial:".length):key.startsWith(musicTeachingPrefix)?key.slice(musicTeachingPrefix.length):null; }

export function musicSubjectQualifications(ids:string[],subjects:{id:string}[],templates:{id:string;musicSubjectId?:string|null}[]) {
  return subjects.filter(subject=>ids.includes(musicTeachingKey(subject.id))||templates.some(template=>template.musicSubjectId===subject.id&&ids.includes(template.id))).map(subject=>musicTeachingKey(subject.id));
}

/** Shared by enrollment UI; the backend independently validates ownership and this relation. */
export function cardMatchesTeachingItem(templateIds:string[],targetId:string,templates:{id:string;musicSubjectId?:string|null;musicTrialMode?:string|null}[]) {
 if(!templateIds.length||templateIds.includes(targetId))return true;
 const subjectId=musicTeachingSubjectId(targetId);
 if(!subjectId)return false;
 const trial=targetId.startsWith("teaching-trial:");
 return templates.some(template=>templateIds.includes(template.id)&&template.musicSubjectId===subjectId&&(trial?!!template.musicTrialMode:!template.musicTrialMode));
}
