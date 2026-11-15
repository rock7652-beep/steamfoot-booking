// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { observeSummarySelection, readTimedCustomerJson, reportSummaryCommit } from "@/lib/customer-read-timing";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("separates waiting for headers, body decode and handler timing without logging data", async () => {
  window.history.replaceState(null,"","/dashboard/customers?customerReadTiming=1");
  let now=0;
  vi.spyOn(performance,"now").mockImplementation(()=>now);
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  const data={success:true,data:{name:"private-name",phone:"private-phone",health:"private-health"}};
  const signal=new AbortController().signal;
  const fetch=vi.fn(async()=>{now=100;return {ok:true,headers:new Headers({"Server-Timing":"summary;dur=35","X-private":"private-token"}),json:async()=>{now=125;return data;}};});
  vi.stubGlobal("fetch",fetch);
  expect(await readTimedCustomerJson("summary","/private-customer-id",{cache:"no-store",credentials:"same-origin",signal},"read failed")).toBe(data);
  expect(fetch).toHaveBeenCalledWith("/private-customer-id",{cache:"no-store",credentials:"same-origin",signal});
  expect(JSON.parse(log.mock.calls[0][1])).toEqual({event:"request",operation:"summary",outcome:"success",elapsedMs:125,headersMs:100,bodyMs:25,handlerMs:35});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|name|phone|health|token/);
});

it("stays silent without explicit opt-in and preserves HTTP failures", async () => {
  window.history.replaceState(null,"","/dashboard/customers");
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,headers:new Headers()})));
  await expect(readTimedCustomerJson("primary","/read",{},"same error")).rejects.toThrow("same error");
  expect(log).not.toHaveBeenCalled();
});

it("does not log raw network errors and does not treat denied data as success", async()=>{
  window.history.replaceState(null,"","/dashboard/customers?customerReadTiming=1");
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  const error=new Error("private-network-detail");
  vi.stubGlobal("fetch",vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ok:true,headers:new Headers({"Server-Timing":"untrusted-private-header"}),json:async()=>({success:false,error:"private-denial"})}));
  await expect(readTimedCustomerJson("summary","/read",{},"read failed")).rejects.toBe(error);
  expect((await readTimedCustomerJson<{success:boolean}>("summary","/read",{},"read failed")).success).toBe(false);
  const rows=log.mock.calls.map(call=>JSON.parse(call[1]));
  expect(rows.map(row=>row.outcome)).toEqual(["request-error","application-error"]);
  expect(JSON.stringify(rows)).not.toContain("private");
});

it("reports each tracked selection only once and does not mix separate promises",()=>{
  window.history.replaceState(null,"","/dashboard/customers?customerReadTiming=1");
  vi.spyOn(performance,"now").mockReturnValue(500);
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  const first=observeSummarySelection(Promise.resolve("first"),100);
  const second=observeSummarySelection(Promise.resolve("second"),300);
  reportSummaryCommit(second);reportSummaryCommit(second);reportSummaryCommit(first);
  expect(log.mock.calls.map(call=>JSON.parse(call[1]).selectionToCommitMs)).toEqual([200,400]);
});

it('logs only allowlisted finite numeric proxy durations',async()=>{
 window.history.replaceState(null,'','/dashboard/customers?customerReadTiming=1');
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,headers:new Headers({'X-Customer-Proxy-Timing':JSON.stringify({total:500,'proxy.authentication':490,'session.staffState':450,'proxy.retiredStore':-1,'private-name':'private-value','proxy.authentication.count':1})}),json:async()=>({success:true})})));
 await readTimedCustomerJson('summary','/private-url',{},'read failed');
 expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({proxyMs:500,proxyAuthMs:490,proxyStaffStateMs:450});
 expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|proxyRetiredStoreMs|count/);
});

it.each(['invalid-private-header','null','[]','{"total":"private"}', '{"total":1e999}', 'x'.repeat(4097)])('does not break a read on an invalid proxy header',async header=>{
 window.history.replaceState(null,'','/dashboard/customers?customerReadTiming=1');
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,headers:new Headers({'X-Customer-Proxy-Timing':header}),json:async()=>({success:true})})));
 expect(await readTimedCustomerJson('summary','/read',{},'failed')).toEqual({success:true});
 expect(JSON.parse(log.mock.calls[0][1])).not.toHaveProperty('proxyMs');
 expect(JSON.stringify(log.mock.calls)).not.toContain('private');
});
