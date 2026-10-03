export const LABEL_PALETTE = [
  "bg-orange-50 text-orange-900 border-orange-200",
  "bg-blue-50 text-blue-900 border-blue-200",
  "bg-purple-50 text-purple-900 border-purple-200",
  "bg-teal-50 text-teal-900 border-teal-200",
  "bg-pink-50 text-pink-900 border-pink-200",
  "bg-indigo-50 text-indigo-900 border-indigo-200",
  "bg-amber-50 text-amber-900 border-amber-200",
  "bg-slate-50 text-slate-900 border-slate-200",
] as const;
export function labelColor(number: number) {
  return LABEL_PALETTE[(Math.max(1, number) - 1) % LABEL_PALETTE.length];
}
export type LabelCategory = { id: string; name: string; number: number; position: number; active: boolean };
export type CustomerLabel = { id: string; categoryId: string; name: string; active: boolean; position?: number };
export type LabelSnapshot = {
  storeId?: string;
  fetchedAt?: number;
  clientRevision?: number;
  available: boolean; enabled: boolean; canEdit: boolean; canManage: boolean;
  categories: LabelCategory[]; labels: CustomerLabel[];
  assignments: Record<string, string[]>;
};
export const EMPTY_LABELS: LabelSnapshot = { available: false, enabled: false, canEdit: false, canManage: false, categories: [], labels: [], assignments: {} };

export type LabelMetadata = Pick<LabelSnapshot, "enabled" | "categories" | "labels">;
export type LabelManagementInput =
  | { action: "enable"; enabled: boolean }
  | { action: "category"; id?: string; name: string }
  | { action: "label"; id?: string; categoryId: string; name: string }
  | { action: "active"; kind: "category" | "label"; id: string; active: boolean }
  | { action: "order"; ids: string[] }
  | { action: "label-order"; categoryId: string; ids: string[] };

/** Pending creations remain local until the server assigns their permanent IDs. */
export function previewLabelManagement(data: LabelSnapshot, input: LabelManagementInput): LabelSnapshot {
  switch (input.action) {
    case "enable": return { ...data, enabled: input.enabled };
    case "category": {
      if (input.id) return { ...data, categories: data.categories.map(c => c.id === input.id ? { ...c, name: input.name.trim() } : c) };
      const number = Math.max(0, ...data.categories.map(c => c.number)) + 1;
      return { ...data, categories: [...data.categories, { id: "pending-category", name: input.name.trim(), number, position: Math.max(-1, ...data.categories.map(c => c.position)) + 1, active: true }] };
    }
    case "label": return { ...data, labels: input.id
      ? data.labels.map(l => l.id === input.id ? { ...l, name: input.name.trim(), categoryId: input.categoryId } : l)
      : [...data.labels, { id: "pending-label", categoryId: input.categoryId, name: input.name.trim(), active: true, position: Math.max(-1,...data.labels.filter(l=>l.categoryId===input.categoryId).map(l=>l.position??0))+1 }] };
    case "active": return input.kind === "category"
      ? { ...data, categories: data.categories.map(c => c.id === input.id ? { ...c, active: input.active } : c) }
      : { ...data, labels: data.labels.map(l => l.id === input.id ? { ...l, active: input.active } : l) };
    case "label-order": return { ...data, labels: data.labels.map(l => l.categoryId === input.categoryId ? { ...l, position: input.ids.indexOf(l.id) } : l).sort((a,b)=>(a.position??0)-(b.position??0)||a.name.localeCompare(b.name)) };
    case "order": return { ...data, categories: data.categories.map(c => ({ ...c, position: input.ids.indexOf(c.id) })) };
  }
}

// Requests and local edits share one browser sequence, independent of device time.
let labelRevision = 0;
export function nextCustomerLabelRevision() { return ++labelRevision; }
export function newerLabelSnapshot(current: LabelSnapshot, incoming: LabelSnapshot) {
  if (incoming.fetchedAt !== undefined && current.fetchedAt !== undefined && current.fetchedAt > incoming.fetchedAt) return true;
  if (current.clientRevision !== undefined || incoming.clientRevision !== undefined) return (current.clientRevision ?? 0) > (incoming.clientRevision ?? 0);
  return incoming.fetchedAt !== undefined && (current.fetchedAt ?? 0) > incoming.fetchedAt;
}

const receivedLabelSnapshots = new WeakMap<LabelSnapshot, LabelSnapshot>();
/** Give newly received RSC data an order once; cached objects retain that order. */
export function receiveCustomerLabelSnapshot(snapshot: LabelSnapshot) {
  if (typeof window === "undefined" || snapshot.clientRevision !== undefined) return snapshot;
  let received = receivedLabelSnapshots.get(snapshot);
  if (!received) { received = { ...snapshot, clientRevision: nextCustomerLabelRevision() }; receivedLabelSnapshots.set(snapshot, received); }
  return received;
}
