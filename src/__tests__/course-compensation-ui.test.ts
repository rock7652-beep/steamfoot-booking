// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),save:vi.fn()}));
vi.mock("@/server/actions/course-compensation",()=>({readCourseCompensation:m.read,saveCourseCompensation:m.save}));
import {CourseCompensationEditor} from "@/components/admin/course-compensation-editor";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);m.save.mockResolvedValue({success:true});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("shows one fixed fee defaulting to zero without a mode selector",async()=>{m.read.mockResolvedValue({success:true,defaults:[{mode:"HOUR",value:600}],rules:[],revision:0});await act(async()=>root.render(createElement(CourseCompensationEditor,{templateId:"c",staffId:"s"})));expect(host.querySelectorAll('input[type="checkbox"],input[type="radio"]')).toHaveLength(0);expect((host.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("0");await act(async()=>(host.querySelector("button") as HTMLButtonElement).click());expect(m.save).toHaveBeenCalledWith({templateId:"c",staffId:"s",rules:[{mode:"CLASS",value:0}],revision:0});});
it("keeps an existing individual fixed rate",async()=>{m.read.mockResolvedValue({success:true,defaults:[],rules:[{mode:"CLASS",value:600}],revision:2});await act(async()=>root.render(createElement(CourseCompensationEditor,{templateId:"c",staffId:"s"})));expect((host.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("600");});
it("does not silently convert a historical hourly rate into a per-class amount",async()=>{m.read.mockResolvedValue({success:true,defaults:[],rules:[{mode:"HOUR",value:600}],revision:2});await act(async()=>root.render(createElement(CourseCompensationEditor,{templateId:"c",staffId:"s"})));expect((host.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("0");expect(host.textContent).toContain("舊計酬方式已停用");});
