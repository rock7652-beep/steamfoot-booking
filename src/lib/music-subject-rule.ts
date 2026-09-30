import { z } from "zod";
export const musicSubjectRuleSchema=z.object({
  subjectId:z.string().min(1).max(150),
  classType:z.enum(["PRIVATE","SELF_ORGANIZED","GROUP"]),
  musicPricePerLesson:z.number().int().min(0).max(1000000),
  musicTermLessons:z.number().int().min(1).max(1000),
  musicValidityDaysPerTerm:z.number().int().min(1).max(3650),
  musicTeacherShare:z.number().finite().min(0).max(1).multipleOf(0.01).default(0.6),
  musicScheduleMode:z.enum(["FIXED","APPOINTMENT"]),
});
export type MusicSubjectRule=z.infer<typeof musicSubjectRuleSchema>;
export const musicClassLabel={PRIVATE:"個別課",SELF_ORGANIZED:"自組班",GROUP:"團體班"} as const;
