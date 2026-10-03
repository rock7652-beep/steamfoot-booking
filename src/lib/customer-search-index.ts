export interface CustomerSearchOption {
  id: string;
  name: string;
  phone: string;
  lineName: string | null;
}

export const CUSTOMER_INDEX_LIMIT = 2000;

export function normalizeCustomerSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function matchCustomerSearch(rows: CustomerSearchOption[], query: string, limit = 8) {
  const text = normalizeCustomerSearch(query);
  if (!text) return [];
  const phone = text.replace(/[\s()+-]/g, "");
  return rows.filter((row) =>
    normalizeCustomerSearch(row.name).includes(text) ||
    normalizeCustomerSearch(row.lineName ?? "").includes(text) ||
    (Boolean(phone) && row.phone.replace(/[\s()+-]/g, "").includes(phone)),
  ).slice(0, limit);
}
