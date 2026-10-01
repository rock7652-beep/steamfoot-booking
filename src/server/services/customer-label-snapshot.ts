import { loadCustomerLabels } from "@/server/actions/customer-labels";
export async function customerLabelSnapshot(ids: string[]) {
  const unique = [...new Set(ids)];
  const batches = await Promise.all(Array.from({length: Math.max(1, Math.ceil(unique.length / 500))}, (_, i) => loadCustomerLabels(unique.slice(i * 500, (i + 1) * 500))));
  return {...batches[0], assignments: Object.assign({}, ...batches.map(batch => batch.assignments))};
}
