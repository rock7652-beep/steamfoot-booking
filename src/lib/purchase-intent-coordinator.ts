/**
 * Coordinates a single browser tab's purchase intent.  The server remains the
 * authority for authorization, idempotency, cancellation and the transaction.
 * No submitted form, payment detail or receipt is written to browser storage.
 */
export type PurchaseIntentStatus = "PREPARED" | "COMMITTED" | "CANCELLED";
export type PurchaseIntent = {
  status: PurchaseIntentStatus;
  requestKey: string;
  purchaseId: string | null;
};
type Result<T> = { success: true; data: T } | { success: false; error?: string };
export type PurchaseIntentTransport<T> = {
  prepare: (input: T, requestKey: string) => Promise<Result<PurchaseIntent>>;
  prepareAtomic?: (input: T, requestKey: string) => Promise<Result<{kind:"prepared"|"existing";intent:PurchaseIntent}>>;
  get: (customerId: string, requestKey: string) => Promise<Result<PurchaseIntent | null>>;
  getPending: (customerId: string) => Promise<Result<PurchaseIntent | null>>;
  cancel: (customerId: string, requestKey: string) => Promise<Result<PurchaseIntent>>;
  acknowledge: (customerId: string, requestKey: string) => Promise<Result<PurchaseIntent>>;
};
export type PurchaseIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PurchaseRecoveryState =
  | { kind: "none-known" }
  | { kind: "intent"; intent: PurchaseIntent; recovered?: boolean }
  | { kind: "uncertain"; reason: "storage" | "network" | "protocol" | "not-found" | "concurrent" | "rejected" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Construct one coordinator per tab and store/customer/family scope. */
export function createPurchaseIntentCoordinator<T>(options: {
  family: string;
  storeId: string;
  customerId: string;
  storage: PurchaseIntentStorage;
  randomUUID: () => string;
  transport: PurchaseIntentTransport<T>;
}) {
  const { family, storeId, customerId, storage, transport } = options;
  if ([family, storeId, customerId].some(value => !value || value.length > 200)) {
    throw new Error("Invalid purchase intent scope");
  }
  const storageKey = `purchase-intent:v1:${[family, storeId, customerId].map(encodeURIComponent).join(":")}`;
  const uncertain = (reason: Extract<PurchaseRecoveryState, { kind: "uncertain" }>["reason"]): PurchaseRecoveryState => ({ kind: "uncertain", reason });
  let busy = false;

  function read(): { key: string | null; valid: boolean } {
    try {
      const value = storage.getItem(storageKey);
      if (value === null) return { key: null, valid: true };
      const data: unknown = JSON.parse(value);
      if (!data || typeof data !== "object" || Array.isArray(data)) return { key: null, valid: false };
      const record = data as Record<string, unknown>;
      if (Object.keys(record).sort().join(",") !== "requestKey,v" || record.v !== 1 || typeof record.requestKey !== "string" || !uuid.test(record.requestKey)) return { key: null, valid: false };
      return { key: record.requestKey, valid: true };
    } catch { return { key: null, valid: false }; }
  }

  function remember(key: string): boolean {
    try {
      const previous = read();
      if (!previous.valid || (previous.key && previous.key !== key)) return false;
      if (!previous.key) storage.setItem(storageKey, JSON.stringify({ v: 1, requestKey: key }));
      const saved = read();
      return saved.valid && saved.key === key;
    } catch { return false; }
  }

  function validIntent(value: unknown, expectedKey?: string): value is PurchaseIntent {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<PurchaseIntent>;
    return typeof record.requestKey === "string" && uuid.test(record.requestKey)
      && (!expectedKey || record.requestKey === expectedKey)
      && (record.status === "PREPARED" || record.status === "COMMITTED" || record.status === "CANCELLED")
      && (record.status === "COMMITTED"
        ? typeof record.purchaseId === "string" && record.purchaseId.length > 0
        : record.purchaseId === null);
  }

  async function inspectInner(): Promise<PurchaseRecoveryState> {
    const local = read();
    if (!local.valid) return uncertain("storage");
    try {
      if (local.key) {
        const result = await transport.get(customerId, local.key);
        if (!result.success) return uncertain("network");
        // The original prepare can still arrive; a missing row never authorizes a new key.
        if (!result.data) return uncertain("not-found");
        if (!validIntent(result.data, local.key)) return uncertain("protocol");
        return { kind: "intent", intent: result.data };
      }
      const result = await transport.getPending(customerId);
      if (!result.success) return uncertain("network");
      if (!result.data) {
        // Another coordinator in this tab may have saved a key while the
        // authoritative pending lookup was in flight.
        const current = read();
        if (!current.valid) return uncertain("storage");
        return current.key ? uncertain("concurrent") : { kind: "none-known" };
      }
      // A committed transaction whose result was not acknowledged must remain
      // visible and block a second purchase even on a different device.
      if (!validIntent(result.data) || (result.data.status !== "PREPARED" && result.data.status !== "COMMITTED")) return uncertain("protocol");
      if (!remember(result.data.requestKey)) return uncertain("storage");
      return { kind: "intent", intent: result.data };
    } catch { return uncertain("network"); }
  }

  async function exclusive(work: () => Promise<PurchaseRecoveryState>): Promise<PurchaseRecoveryState> {
    if (busy) return uncertain("concurrent");
    busy = true;
    try { return await work(); } finally { busy = false; }
  }

  return {
    inspect: () => exclusive(inspectInner),
    /** Register only; never automatically submit a purchase or store its fields. */
    start: (input: T) => exclusive(async () => {
      if (!input || typeof input !== "object" || !("customerId" in input) || input.customerId !== customerId) return uncertain("protocol");
      const state = await inspectInner();
      if (state.kind !== "none-known") return state;
      let key: string;
      try { key = options.randomUUID(); } catch { return uncertain("storage"); }
      if (!uuid.test(key) || !remember(key)) return uncertain("storage");
      try {
        const result = await transport.prepare(input, key);
        if (!result.success) return uncertain("network");
        if (!validIntent(result.data, key)) return uncertain("protocol");
        return { kind: "intent", intent: result.data };
      } catch { return uncertain("network"); }
    }),
    /** The server atomically checks other devices and either prepares this key
     * or installs its cancellation barrier before returning another intent. */
    startAtomic: (input: T) => exclusive(async () => {
      if (!transport.prepareAtomic || !input || typeof input !== "object" || !("customerId" in input) || input.customerId !== customerId) return uncertain("protocol");
      const local = read();
      if (!local.valid) return uncertain("storage");
      if (local.key) {
        const state = await inspectInner();
        return state.kind === "intent" ? {...state,recovered:true} : state;
      }
      let key: string;
      try { key = options.randomUUID(); } catch { return uncertain("storage"); }
      if (!uuid.test(key) || !remember(key)) return uncertain("storage");
      try {
        const result = await transport.prepareAtomic(input, key);
        if (!result.success) return uncertain("network");
        const {kind,intent} = result.data;
        if (kind === "prepared") {
          if (!validIntent(intent, key)) return uncertain("protocol");
          const current = read();
          if (!current.valid || current.key !== key) return uncertain("concurrent");
          return {kind:"intent",intent};
        }
        if (kind !== "existing" || !validIntent(intent) || intent.requestKey === key || (intent.status !== "PREPARED" && intent.status !== "COMMITTED")) return uncertain("protocol");
        // Only this server response proves our key has a durable cancellation
        // tombstone. Never overwrite another coordinator's local key.
        const current = read();
        if (!current.valid || current.key !== key) return uncertain("concurrent");
        try {
          storage.setItem(storageKey, JSON.stringify({v:1,requestKey:intent.requestKey}));
          const saved = read();
          if (!saved.valid || saved.key !== intent.requestKey) return uncertain("storage");
        } catch { return uncertain("storage"); }
        return {kind:"intent",intent,recovered:true};
      } catch { return uncertain("network"); }
    }),
    /**
     * Re-register only the original key. The server must compare the complete
     * input against its stored fingerprint and enforce the cancellation barrier.
     * This method never submits the financial transaction.
     */
    retry: (input: T) => exclusive(async () => {
      if (!input || typeof input !== "object" || !("customerId" in input) || input.customerId !== customerId) return uncertain("protocol");
      const local = read();
      if (!local.valid) return uncertain("storage");
      if (!local.key) return uncertain("not-found");
      try {
        const previous = await transport.get(customerId, local.key);
        if (!previous.success) return uncertain("network");
        if (previous.data) {
          if (!validIntent(previous.data, local.key)) return uncertain("protocol");
          if (previous.data.status !== "PREPARED") return { kind: "intent", intent: previous.data };
        }
        const result = await transport.prepare(input, local.key);
        if (!result.success) return uncertain("rejected");
        if (!validIntent(result.data, local.key)) return uncertain("protocol");
        return { kind: "intent", intent: result.data };
      } catch { return uncertain("network"); }
    }),
    /** Cancellation is explicit; only the server can install the late-arrival barrier. */
    cancel: () => exclusive(async () => {
      const local = read();
      if (!local.valid) return uncertain("storage");
      if (!local.key) return uncertain("not-found");
      try {
        const result = await transport.cancel(customerId, local.key);
        if (!result.success) return uncertain("network");
        if (!validIntent(result.data, local.key) || result.data.status === "PREPARED") return uncertain("protocol");
        return { kind: "intent", intent: result.data };
      } catch { return uncertain("network"); }
    }),
    /** Clear only after a fresh server-confirmed terminal state is acknowledged. */
    acknowledge: (status: "COMMITTED" | "CANCELLED") => exclusive(async () => {
      if (status !== "COMMITTED" && status !== "CANCELLED") return uncertain("protocol");
      const local = read();
      if (!local.valid) return uncertain("storage");
      if (!local.key) return uncertain("not-found");
      let result: Result<PurchaseIntent | null>;
      try { result = await transport.get(customerId, local.key); } catch { return uncertain("network"); }
      if (!result.success) return uncertain("network");
      if (!result.data) return uncertain("not-found");
      if (!validIntent(result.data, local.key) || result.data.status !== status) return uncertain("protocol");
      if (status === "COMMITTED") {
        let acknowledged: Result<PurchaseIntent>;
        try { acknowledged = await transport.acknowledge(customerId, local.key); } catch { return uncertain("network"); }
        if (!acknowledged.success) return uncertain("network");
        if (!validIntent(acknowledged.data, local.key) || acknowledged.data.status !== "COMMITTED" || acknowledged.data.purchaseId !== result.data.purchaseId) return uncertain("protocol");
      }
      try {
        const current = read();
        if (!current.valid || current.key !== local.key) return uncertain("storage");
        storage.removeItem(storageKey);
        if (storage.getItem(storageKey) !== null) return uncertain("storage");
        return { kind: "none-known" };
      } catch { return uncertain("storage"); }
    }),
  };
}
