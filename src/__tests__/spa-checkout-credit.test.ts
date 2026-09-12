import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "../../generated/spa-client";
import { deductSpaCredit, readSpaCreditOptions, assertNoPriorSpaSettlement } from "@/server/spa-checkout-credit";
const booking={id:"B",storeId:"S",customerId:"C",bookingDate:new Date("2026-09-10T00:00:00Z")};
function mockTx(){const query=vi.fn(),execute=vi.fn();return {query,execute,tx:{$queryRaw:query,$executeRaw:execute} as unknown as Prisma.TransactionClient};}
describe("SPA credit ledger",()=>{
 it("subtracts stored value and records a signed debit with the resulting balance",async()=>{const m=mockTx();m.query.mockResolvedValue([{id:"W",balance:200}]);expect(await deductSpaCredit(m.tx,booking,"STORED_VALUE","W",1800)).toEqual({balanceAfter:200,uses:null});expect(m.query.mock.calls[0].slice(1)).toEqual([1800,"W","S","C",1800]);expect(m.execute.mock.calls[0].slice(2)).toEqual(["W","S","C","B",-1800,200]);});
 it("rejects insufficient or foreign wallets without writing a ledger entry",async()=>{const m=mockTx();m.query.mockResolvedValue([]);await expect(deductSpaCredit(m.tx,booking,"STORED_VALUE","foreign",1800)).rejects.toThrow();expect(m.execute).not.toHaveBeenCalled();});
 it("locks entitlement then deducts the count of matching service items",async()=>{const m=mockTx();m.query.mockResolvedValueOnce([{id:"E"}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"E",name:"療程",available:4,uses:2}]).mockResolvedValueOnce([{remainingUses:2}]);expect(await deductSpaCredit(m.tx,booking,"ENTITLEMENT","E",1800)).toEqual({balanceAfter:2,uses:2});expect(m.execute.mock.calls[0].slice(2)).toEqual(["S","E","B",2]);});
 it("rejects expired, ineligible or exhausted entitlements",async()=>{const m=mockTx();m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);await expect(deductSpaCredit(m.tx,booking,"ENTITLEMENT","E",1800)).rejects.toThrow();expect(m.execute).not.toHaveBeenCalled();});
 it("does not offer credits already reserved elsewhere",async()=>{const m=mockTx();m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"E",name:"療程",available:0,uses:1}]);expect((await readSpaCreditOptions(m.tx,booking)).entitlements).toEqual([]);});
 it("blocks legacy SPA settlement and reserved entitlements",async()=>{const m=mockTx();m.query.mockResolvedValue([{found:true}]);await expect(assertNoPriorSpaSettlement(m.tx,booking)).rejects.toThrow();});
 it("propagates ledger insertion failures so the enclosing transaction rolls back",async()=>{const m=mockTx();m.query.mockResolvedValue([{id:"W",balance:200}]);m.execute.mockRejectedValue(new Error("ledger failed"));await expect(deductSpaCredit(m.tx,booking,"STORED_VALUE","W",1800)).rejects.toThrow("ledger failed");});
});
