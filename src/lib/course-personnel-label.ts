/** Only system-authored presentation text; never names, notes, IDs or saved snapshots. */
export type CoursePersonnelLabel = "老師" | "教練";
export function coursePersonnelText(text: string, label: CoursePersonnelLabel | null | undefined): string {
  if (!label) return text;
  return text.replace(/(?:教練|教師|老師)(?:[／/](?:教練|教師|老師))?/g, label)
    .replace(/(?:老師|教練)[／/](?:老師|教練)/g, label);
}

/** Beauty module default is 技師. Call only for authored UI copy. */
export function beautyPersonnelText(text:string,label:CoursePersonnelLabel|null|undefined){return label==='老師'?text.replace(/技師/g,'老師'):text;}
