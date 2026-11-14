// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("@/components/health-trend-chart-loader",()=>({HealthTrendChartLoader:({trend}:{trend:unknown[]})=>createElement("div",{"data-chart-points":trend.length},"曲線")}));
import {CustomerHealthTracking} from "@/components/customer-health-tracking";
import type {HealthSummary} from "@/lib/health-service";
const record={measuredAt:"2026-11-14",weight:67.4,bmi:22,bodyFat:30.8,muscleMass:43.7,boneMass:2.5,visceralFat:8,bmr:1400,bodyWater:50,metabolicAge:40,note:"服務後"};
const summary:HealthSummary={latest:record,trend:[{...record,measuredAt:"2026-11-13"},record],alerts:[],meta:{totalRecords:2,daysSinceLastMeasure:0,firstMeasuredAt:"2026-11-13",recordIds:["old","new"]}};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);host=document.createElement("div");root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
it("directly lists all nine indices by date without an accordion or duplicate latest summary",async()=>{
  const edit=vi.fn();await act(async()=>root.render(createElement(CustomerHealthTracking,{summary,onEdit:edit})));
  expect(host.querySelector("details")).toBeNull();
  for(const label of ["體重","BMI","體脂肪","肌肉量","骨量","內臟脂肪","基礎代謝","體水分","體內年齡"])expect(host.textContent?.split(label).length).toBe(3);
  expect(host.textContent!.indexOf("2026/11/14")).toBeLessThan(host.textContent!.indexOf("2026/11/13"));
  expect(host.textContent).toContain("服務後");expect(host.querySelector("[data-chart-points]")?.getAttribute("data-chart-points")).toBe("2");
  await act(async()=>host.querySelector("button")!.click());expect(edit).toHaveBeenCalledWith("new");
});
it("keeps older editable records accessible beyond the chart's thirty-record window",async()=>{
  const records=Array.from({length:35},(_,i)=>({...record,id:`record-${i}`}));
  await act(async()=>root.render(createElement(CustomerHealthTracking,{summary:{...summary,meta:{...summary.meta,totalRecords:35}},records})));
  expect(host.querySelector("[data-chart-points]")?.getAttribute("data-chart-points")).toBe("2");
  for(let i=0;i<6;i++)await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.startsWith("載入更多"))!.click());
  expect(host.querySelectorAll("#health-history-records > div")).toHaveLength(35);
});
it("distinguishes no measurements from missing values",async()=>{
  await act(async()=>root.render(createElement(CustomerHealthTracking,{summary:{...summary,latest:null,trend:[]}})));
  expect(host.textContent).toContain("尚無量測紀錄");expect(host.querySelector("[data-chart-points]")).toBeNull();
});
