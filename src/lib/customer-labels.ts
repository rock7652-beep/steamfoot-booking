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
export type CustomerLabel = { id: string; categoryId: string; name: string; active: boolean };
export type LabelSnapshot = {
  available: boolean; enabled: boolean; canEdit: boolean; canManage: boolean;
  categories: LabelCategory[]; labels: CustomerLabel[];
  assignments: Record<string, string[]>;
};
export const EMPTY_LABELS: LabelSnapshot = { available: false, enabled: false, canEdit: false, canManage: false, categories: [], labels: [], assignments: {} };
