import {expect,it} from "vitest";
import {musicPlanItems} from "@/lib/music-catalog";
const templates=[{id:"a1",name:"舊版本1",musicSubjectId:"a"},{id:"a2",name:"舊版本2",musicSubjectId:"a"},{id:"b",name:"另一項",musicSubjectId:"b"}];
const subjects=[{id:"a",name:"木吉他個別課"},{id:"b",name:"鋼琴個別課"}];
it("groups pricing versions by item identity while retaining separate instruments",()=>{
 expect(musicPlanItems(["a1","a2","b"],templates,subjects)).toEqual(subjects);
});
it("does not infer bindings from duplicate names or mutate historical templates",()=>{
 const before=JSON.stringify(templates);
 expect(musicPlanItems(["a1"],templates,[{id:"b",name:"舊版本1"}])).toEqual([{id:"a1",name:"舊版本1"}]);
 expect(JSON.stringify(templates)).toBe(before);
 expect(musicPlanItems(["missing"],templates,subjects)).toEqual([]);
});
