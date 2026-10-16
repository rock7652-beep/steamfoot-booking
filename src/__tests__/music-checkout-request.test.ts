import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { withMusicCheckoutRequest, musicCheckoutPermission, measureMusicCheckout } from "@/server/services/music-checkout-request";

it("shares identical checks only within one checkout, including concurrent callers", async()=>{
  const check=vi.fn().mockResolvedValue({storeId:"a"});
  await withMusicCheckoutRequest(async timings=>{
    const results=await Promise.all([musicCheckoutPermission("transaction.create",check),musicCheckoutPermission("transaction.create",check)]);
    expect(results[0]).toBe(results[1]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(timings["authorization.reused"]).toBe(1);
  });
  await withMusicCheckoutRequest(async()=>{await musicCheckoutPermission("transaction.create",check);});
  expect(check).toHaveBeenCalledTimes(2);
});

it("does not reuse another permission or bypass its denial",async()=>{
  await withMusicCheckoutRequest(async()=>{
    await musicCheckoutPermission("transaction.create",async()=>({storeId:"a"}));
    const denied=vi.fn().mockRejectedValue(new Error("discount denied"));
    await expect(musicCheckoutPermission("transaction.discount",denied)).rejects.toThrow("discount denied");
    await expect(musicCheckoutPermission("transaction.discount",denied)).rejects.toThrow("discount denied");
    expect(denied).toHaveBeenCalledTimes(1);
  });
});

it("isolates overlapping requests, actors and stores",async()=>{
  const checkA=vi.fn().mockResolvedValue({storeId:"a",userId:"a"});
  const checkB=vi.fn().mockResolvedValue({storeId:"b",userId:"b"});
  const values=await Promise.all([withMusicCheckoutRequest(()=>musicCheckoutPermission("transaction.create",checkA)),withMusicCheckoutRequest(()=>musicCheckoutPermission("transaction.create",checkB))]);
  expect(values).toEqual([{storeId:"a",userId:"a"},{storeId:"b",userId:"b"}]);
});

it("rechecks a revoked permission in the next request",async()=>{
  const check=vi.fn().mockResolvedValueOnce({storeId:"a"}).mockRejectedValueOnce(new Error("revoked"));
  await withMusicCheckoutRequest(()=>musicCheckoutPermission("transaction.create",check));
  await expect(withMusicCheckoutRequest(()=>musicCheckoutPermission("transaction.create",check))).rejects.toThrow("revoked");
});

it("retains all calls outside the dedicated handler and records failed work",async()=>{
  const check=vi.fn().mockResolvedValue(true);
  await musicCheckoutPermission("transaction.create",check);
  await musicCheckoutPermission("transaction.create",check);
  expect(check).toHaveBeenCalledTimes(2);
  await withMusicCheckoutRequest(async timings=>{
    await expect(measureMusicCheckout("transaction.work",async()=>{throw new Error("rollback");})).rejects.toThrow("rollback");
    expect(timings["transaction.work"]).toBeGreaterThanOrEqual(0);
  });
});
