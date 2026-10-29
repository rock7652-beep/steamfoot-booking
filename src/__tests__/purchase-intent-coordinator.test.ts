import { describe, expect, it, vi } from "vitest";
import { createPurchaseIntentCoordinator, type PurchaseIntent, type PurchaseIntentTransport } from "@/lib/purchase-intent-coordinator";

const key = "a6ddcb65-6218-4ef3-8ada-72f3ed06b601";
const otherKey = "b4ee88c2-43e2-4902-9b40-6f66e3c2b602";
const intent = (status: PurchaseIntent["status"], requestKey = key): PurchaseIntent => ({ status, requestKey, purchaseId: status === "COMMITTED" ? "purchase-1" : null });

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

type Input = { customerId: string; amount: number; transferLastFour: string };
function setup() {
  const storage = new MemoryStorage();
  const transport: PurchaseIntentTransport<Input> = {
    prepare: vi.fn(async () => ({ success: true, data: intent("PREPARED") })),
    get: vi.fn(async () => ({ success: true, data: intent("PREPARED") })),
    getPending: vi.fn(async () => ({ success: true, data: null })),
    cancel: vi.fn(async () => ({ success: true, data: intent("CANCELLED") })),
    acknowledge: vi.fn(async () => ({ success: true, data: intent("COMMITTED") })),
  };
  const make = (customerId = "customer-1", storeId = "store-1", randomUUID = () => key) => createPurchaseIntentCoordinator({
    family: "course", storeId, customerId, storage, randomUUID, transport,
  });
  return { storage, transport, make };
}

describe("purchase intent recovery coordinator", () => {
  it("checks server pending and persists only the key before prepare, not the payment", async () => {
    const { storage, transport, make } = setup();
    const input = { customerId: "customer-1", amount: 4800, transferLastFour: "9876" };
    vi.mocked(transport.prepare).mockImplementation(async (passed, requestKey) => {
      expect(passed).toEqual(input);
      expect(requestKey).toBe(key);
      expect([...storage.values.values()]).toEqual([JSON.stringify({ v: 1, requestKey: key })]);
      return { success: true, data: intent("PREPARED") };
    });
    expect(await make().start(input)).toEqual({ kind: "intent", intent: intent("PREPARED") });
    expect(transport.getPending).toHaveBeenCalledOnce();
    expect(JSON.stringify([...storage.values])).not.toContain("9876");
    expect(JSON.stringify([...storage.values])).not.toContain("4800");
  });

  it("fails closed without sending prepare when storage or pending reads fail", async () => {
    const { storage, transport, make } = setup();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    const input = { customerId: "customer-1", amount: 1, transferLastFour: "" };
    expect(await make().start(input)).toEqual({ kind: "uncertain", reason: "storage" });
    expect(transport.prepare).not.toHaveBeenCalled();
    vi.mocked(transport.getPending).mockRejectedValueOnce(new Error("offline"));
    expect(await make().start(input)).toEqual({ kind: "uncertain", reason: "network" });
    expect(transport.prepare).not.toHaveBeenCalled();
  });

  it("retains an uncertain key across a reload; missing row cannot create another key", async () => {
    const { storage, transport, make } = setup();
    vi.mocked(transport.prepare).mockRejectedValueOnce(new Error("lost reply"));
    const input = { customerId: "customer-1", amount: 1, transferLastFour: "" };
    expect(await make().start(input)).toEqual({ kind: "uncertain", reason: "network" });
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: null });
    expect(await make().start(input)).toEqual({ kind: "uncertain", reason: "not-found" });
    expect(transport.prepare).toHaveBeenCalledOnce();
    expect([...storage.values.values()]).toEqual([JSON.stringify({ v: 1, requestKey: key })]);
  });

  it("recovers PREPARED and COMMITTED after a reload without storing the form", async () => {
    const { storage, transport, make } = setup();
    const input = { customerId: "customer-1", amount: 4800, transferLastFour: "9876" };
    await make().start(input);
    expect(await make().inspect()).toEqual({ kind: "intent", intent: intent("PREPARED") });
    // A successful purchase occurs on the server while the original page closes.
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    expect(await make().inspect()).toEqual({ kind: "intent", intent: intent("COMMITTED") });
    expect(storage.values.size).toBe(1); // the operator has not acknowledged success
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    expect(await make().acknowledge("COMMITTED")).toEqual({ kind: "none-known" });
    expect(storage.values.size).toBe(0);
    expect(transport.prepare).toHaveBeenCalledOnce();
  });

  it("can cancel an unknown registration and retains its tombstone across reload", async () => {
    const { storage, transport, make } = setup();
    const input = { customerId: "customer-1", amount: 1, transferLastFour: "" };
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let serverState: PurchaseIntent | null = null;
    vi.mocked(transport.prepare).mockImplementation(async (_input, receivedKey) => {
      await delayed;
      // Model the server's required same-key cancellation barrier.
      if (serverState?.status === "CANCELLED") return { success: false, error: "cancelled" };
      serverState ??= intent("PREPARED", receivedKey);
      return { success: true, data: serverState };
    });
    vi.mocked(transport.get).mockImplementation(async () => ({ success: true, data: serverState }));
    vi.mocked(transport.cancel).mockImplementation(async (_customer, receivedKey) => {
      serverState = intent("CANCELLED", receivedKey);
      return { success: true, data: serverState };
    });
    const oldPage = make().start(input);
    await vi.waitFor(() => expect(transport.prepare).toHaveBeenCalledOnce());
    expect(await make().inspect()).toEqual({ kind: "uncertain", reason: "not-found" });
    expect(await make().cancel()).toEqual({ kind: "intent", intent: intent("CANCELLED") });
    release();
    expect(await oldPage).toEqual({ kind: "uncertain", reason: "network" });
    expect(await make().inspect()).toEqual({ kind: "intent", intent: intent("CANCELLED") });
    expect(storage.values.size).toBe(1);
    expect(await make().acknowledge("CANCELLED")).toEqual({ kind: "none-known" });
    expect(storage.values.size).toBe(0);
    expect(serverState).toEqual(intent("CANCELLED")); // the server tombstone remains
    expect(transport.prepare).toHaveBeenCalledOnce();
  });

  it("recovers an existing server-side pending key after a new tab starts", async () => {
    const { storage, transport, make } = setup();
    vi.mocked(transport.getPending).mockResolvedValueOnce({ success: true, data: intent("PREPARED", otherKey) });
    expect(await make().inspect()).toEqual({ kind: "intent", intent: intent("PREPARED", otherKey) });
    expect([...storage.values.values()]).toEqual([JSON.stringify({ v: 1, requestKey: otherKey })]);
    expect(transport.prepare).not.toHaveBeenCalled();
  });

  it("blocks a second device on a committed but unacknowledged purchase", async () => {
    const { storage, transport, make } = setup();
    vi.mocked(transport.getPending).mockResolvedValueOnce({ success: true, data: intent("COMMITTED", otherKey) });
    const controller = make();
    expect(await controller.start({ customerId: "customer-1", amount: 1, transferLastFour: "" })).toEqual({ kind: "intent", intent: intent("COMMITTED", otherKey) });
    expect(transport.prepare).not.toHaveBeenCalled();
    expect([...storage.values.values()]).toEqual([JSON.stringify({ v: 1, requestKey: otherKey })]);
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED", otherKey) });
    vi.mocked(transport.acknowledge).mockResolvedValueOnce({ success: true, data: intent("COMMITTED", otherKey) });
    expect(await controller.acknowledge("COMMITTED")).toEqual({ kind: "none-known" });
    expect(transport.acknowledge).toHaveBeenCalledWith("customer-1", otherKey);
    expect(storage.values.size).toBe(0);
  });

  it("does not clear a committed key when server acknowledgement fails or its response is lost", async () => {
    const { storage, transport, make } = setup();
    const controller = make();
    await controller.start({ customerId: "customer-1", amount: 1, transferLastFour: "" });
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    vi.mocked(transport.acknowledge).mockRejectedValueOnce(new Error("connection lost"));
    expect(await controller.acknowledge("COMMITTED")).toEqual({ kind: "uncertain", reason: "network" });
    expect(storage.values.size).toBe(1);
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    expect(await controller.acknowledge("COMMITTED")).toEqual({ kind: "none-known" });
    expect(storage.values.size).toBe(0);
  });

  it("rechecks the original input with the original key after a lost prepare response", async () => {
    const { transport, make } = setup();
    const input = { customerId: "customer-1", amount: 4800, transferLastFour: "9876" };
    vi.mocked(transport.prepare).mockRejectedValueOnce(new Error("lost reply"));
    expect(await make().start(input)).toEqual({ kind: "uncertain", reason: "network" });
    // No row does not prove failure: a delayed registration may still arrive.
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: null });
    expect(await make().retry(input)).toEqual({ kind: "intent", intent: intent("PREPARED") });
    expect(transport.prepare).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.prepare).mock.calls[1]).toEqual([input, key]);
  });

  it("keeps the key if the server rejects changed retry data", async () => {
    const { transport, storage, make } = setup();
    const input = { customerId: "customer-1", amount: 4800, transferLastFour: "9876" };
    await make().start(input);
    vi.mocked(transport.prepare).mockResolvedValueOnce({ success: false, error: "input mismatch" });
    expect(await make().retry({ ...input, amount: 1 })).toEqual({ kind: "uncertain", reason: "rejected" });
    expect(storage.values.size).toBe(1);
  });

  it("does not re-register when a previous request has already committed or cancelled", async () => {
    const { transport, make } = setup();
    const input = { customerId: "customer-1", amount: 1, transferLastFour: "" };
    await make().start(input);
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    expect(await make().retry(input)).toEqual({ kind: "intent", intent: intent("COMMITTED") });
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("CANCELLED") });
    expect(await make().retry(input)).toEqual({ kind: "intent", intent: intent("CANCELLED") });
    expect(transport.prepare).toHaveBeenCalledOnce();
  });

  it("requires explicit server-confirmed cancellation and rechecks before clearing", async () => {
    const { storage, transport, make } = setup();
    const controller = make();
    await controller.start({ customerId: "customer-1", amount: 1, transferLastFour: "" });
    expect(await controller.cancel()).toEqual({ kind: "intent", intent: intent("CANCELLED") });
    expect(storage.values.size).toBe(1);
    expect(await controller.acknowledge("CANCELLED")).toEqual({ kind: "uncertain", reason: "protocol" });
    expect(storage.values.size).toBe(1);
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("CANCELLED") });
    expect(await controller.acknowledge("CANCELLED")).toEqual({ kind: "none-known" });
    expect(storage.values.size).toBe(0);
  });

  it("keeps the confirmed purchase when commit wins a cancellation race", async () => {
    const { storage, transport, make } = setup();
    const controller = make();
    await controller.start({ customerId: "customer-1", amount: 1, transferLastFour: "" });
    vi.mocked(transport.cancel).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    expect(await controller.cancel()).toEqual({ kind: "intent", intent: intent("COMMITTED") });
    expect(transport.cancel).toHaveBeenCalledWith("customer-1", key);
    expect(storage.values.size).toBe(1);
  });

  it("blocks corrupted local records instead of silently issuing a new key", async () => {
    const { storage, transport, make } = setup();
    const controller = make();
    await controller.start({ customerId: "customer-1", amount: 1, transferLastFour: "" });
    const [storageKey] = storage.values.keys();
    storage.setItem(storageKey, JSON.stringify({ v: 1, requestKey: key, amount: 1 }));
    expect(await make().start({ customerId: "customer-1", amount: 1, transferLastFour: "" })).toEqual({ kind: "uncertain", reason: "storage" });
    expect(transport.prepare).toHaveBeenCalledOnce();
  });

  it("never clears when the original committed response is missing or malformed", async () => {
    const { storage, transport, make } = setup();
    const controller = make();
    await controller.start({ customerId: "customer-1", amount: 1, transferLastFour: "" });
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: { status: "COMMITTED", requestKey: key, purchaseId: null } });
    expect(await controller.acknowledge("COMMITTED")).toEqual({ kind: "uncertain", reason: "protocol" });
    expect(storage.values.size).toBe(1);
    vi.mocked(transport.get).mockResolvedValueOnce({ success: true, data: intent("COMMITTED") });
    expect(await controller.acknowledge("COMMITTED")).toEqual({ kind: "none-known" });
    expect(storage.values.size).toBe(0);
  });

  it("isolates store/customer scopes and rejects input for a different customer", async () => {
    const { storage, transport, make } = setup();
    const input = { customerId: "customer-1", amount: 1, transferLastFour: "" };
    expect(await make().start({ ...input, customerId: "customer-2" })).toEqual({ kind: "uncertain", reason: "protocol" });
    expect(transport.prepare).not.toHaveBeenCalled();
    await make().start(input);
    expect(await make("customer-2").inspect()).toEqual({ kind: "none-known" });
    expect(await make("customer-1", "store-2").inspect()).toEqual({ kind: "none-known" });
    expect(storage.values.size).toBe(1);
  });

  it("prevents two coordinators in one tab overwriting a key after concurrent pending checks", async () => {
    const { transport, make, storage } = setup();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(transport.getPending).mockImplementation(async () => { await pending; return { success: true, data: null }; });
    const input = { customerId: "customer-1", amount: 1, transferLastFour: "" };
    const first = make().start(input);
    const second = make("customer-1", "store-1", () => otherKey).start(input);
    release();
    const results = await Promise.all([first, second]);
    expect(results.filter(result => result.kind === "intent")).toHaveLength(1);
    expect(results.filter(result => result.kind === "uncertain")).toHaveLength(1);
    expect(transport.prepare).toHaveBeenCalledOnce();
    expect(storage.values.size).toBe(1);
  });

  it("prepares atomically without a second pending lookup", async () => {
    const {transport,make}=setup();
    transport.prepareAtomic=vi.fn(async()=>({success:true as const,data:{kind:"prepared" as const,intent:intent("PREPARED")}}));
    expect(await make().startAtomic({customerId:"customer-1",amount:1,transferLastFour:""})).toEqual({kind:"intent",intent:intent("PREPARED")});
    expect(transport.getPending).not.toHaveBeenCalled();
    expect(transport.prepare).not.toHaveBeenCalled();
  });

  it("adopts another device's unresolved intent only after the server has barred this key", async () => {
    const {transport,make,storage}=setup();
    transport.prepareAtomic=vi.fn(async()=>({success:true as const,data:{kind:"existing" as const,intent:intent("PREPARED",otherKey)}}));
    expect(await make().startAtomic({customerId:"customer-1",amount:1,transferLastFour:""})).toEqual({kind:"intent",intent:intent("PREPARED",otherKey),recovered:true});
    expect([...storage.values.values()]).toEqual([JSON.stringify({v:1,requestKey:otherKey})]);
  });

  it("retains a timed-out atomic key across reload and allows its explicit cancellation", async () => {
    const {transport,make,storage}=setup();
    transport.prepareAtomic=vi.fn(async()=>{throw new Error("lost reply")});
    expect(await make().startAtomic({customerId:"customer-1",amount:1,transferLastFour:""})).toEqual({kind:"uncertain",reason:"network"});
    vi.mocked(transport.get).mockResolvedValueOnce({success:true,data:null});
    expect(await make().inspect()).toEqual({kind:"uncertain",reason:"not-found"});
    expect(await make().cancel()).toEqual({kind:"intent",intent:intent("CANCELLED")});
    expect([...storage.values.values()]).toEqual([JSON.stringify({v:1,requestKey:key})]);
  });

  it("does not replace another coordinator's key with a late atomic conflict response", async () => {
    const {transport,make,storage}=setup();
    let finish!:(value:{success:true;data:{kind:"existing";intent:PurchaseIntent}})=>void;
    transport.prepareAtomic=vi.fn(()=>new Promise<{success:true;data:{kind:"existing";intent:PurchaseIntent}}>(resolve=>{finish=resolve;}));
    const result=make().startAtomic({customerId:"customer-1",amount:1,transferLastFour:""});
    await vi.waitFor(()=>expect(transport.prepareAtomic).toHaveBeenCalledOnce());
    const [storageKey]=storage.values.keys();storage.setItem(storageKey,JSON.stringify({v:1,requestKey:otherKey}));
    finish({success:true,data:{kind:"existing",intent:intent("PREPARED",otherKey)}});
    expect(await result).toEqual({kind:"uncertain",reason:"concurrent"});
    expect(JSON.parse(storage.getItem(storageKey)!).requestKey).toBe(otherKey);
  });
});
