import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({
  permission:vi.fn(),store:vi.fn(),feature:vi.fn(),worker:vi.fn(),
}));
vi.mock("@/lib/permissions",()=>({requirePermission:mocks.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:mocks.store}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:mocks.feature}));
vi.mock("@/server/services/customer-message-worker",()=>({runCustomerMessages:mocks.worker}));
import {customerMessageAccess} from "@/server/services/customer-message-access";
import {GET} from "@/app/api/cron/customer-messages/route";
import {NextRequest} from "next/server";
beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockResolvedValue({id:"manager",role:"MANAGER"});mocks.store.mockResolvedValue("shop-a");mocks.feature.mockResolvedValue(undefined);vi.stubEnv("CRON_SECRET","isolated-test-secret");mocks.worker.mockResolvedValue({processed:0,paused:true});});
afterEach(()=>vi.unstubAllEnvs());
describe("customer message authorization",()=>{
  it("requires both sending and customer viewing permissions",async()=>{await customerMessageAccess("shop-a");expect(mocks.permission.mock.calls.map(call=>call[0])).toEqual(["customer.message.send","customer.read"]);expect(mocks.feature).toHaveBeenCalledWith("shop-a","line_reminder");});
  it("rejects revoked permissions",async()=>{mocks.permission.mockRejectedValue(new Error("forbidden"));await expect(customerMessageAccess("shop-a")).rejects.toThrow("forbidden");expect(mocks.store).not.toHaveBeenCalled();});
  it("rejects stale store scope",async()=>{await expect(customerMessageAccess("shop-b")).rejects.toThrow("門市已切換");expect(mocks.feature).not.toHaveBeenCalled();});
  it("preserves write-store view restrictions",async()=>{mocks.store.mockRejectedValue(new Error("view-only"));await expect(customerMessageAccess("shop-a")).rejects.toThrow("view-only");});
  it("does not bypass store feature locks",async()=>{mocks.feature.mockRejectedValue(new Error("locked"));await expect(customerMessageAccess("shop-a")).rejects.toThrow("locked");});
});
describe("customer message cron authorization",()=>{
  it("does not call worker without configured secret",async()=>{vi.stubEnv("CRON_SECRET","");expect((await GET(new NextRequest("http://localhost/api/cron/customer-messages"))).status).toBe(500);expect(mocks.worker).not.toHaveBeenCalled();});
  it("does not call worker for unauthenticated requests",async()=>{expect((await GET(new NextRequest("http://localhost/api/cron/customer-messages"))).status).toBe(401);expect(mocks.worker).not.toHaveBeenCalled();});
  it("passes authorized requests to the pause-aware worker",async()=>{const response=await GET(new NextRequest("http://localhost/api/cron/customer-messages",{headers:{authorization:"Bearer isolated-test-secret"}}));expect(await response.json()).toMatchObject({ok:true,paused:true,processed:0});});
});
