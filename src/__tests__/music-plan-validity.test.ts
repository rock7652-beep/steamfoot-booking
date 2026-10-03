import {expect,it} from "vitest";
import {musicSchedulePatch} from "@/lib/music-plan-validity";
it("suggests 70 days for a new appointment plan",()=>expect(musicSchedulePatch("APPOINTMENT","35",false).musicValidityDaysPerTerm).toBe("70"));
it("suggests 35 days when returning to fixed",()=>expect(musicSchedulePatch("FIXED","70",false).musicValidityDaysPerTerm).toBe("35"));
it.each(["35","70","90",""])("preserves explicitly edited or existing days %s",days=>expect(musicSchedulePatch("APPOINTMENT",days,true)).toEqual({musicScheduleMode:"APPOINTMENT",musicValidityDaysPerTerm:days}));
