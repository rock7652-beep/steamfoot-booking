import {
  POTENTIAL_TAG_LABEL,
  getCustomerPotentialTag,
  type CustomerPotentialTag,
  type PotentialTagInput,
} from "@/lib/customer-potential-tag";

/**
 * 顧客潛力 badge（後台專用）
 *
 * 給定 tag 或 shareCount/visitCount/totalPoints 任一形式皆可。
 * size="sm" 用於列表, size="md" 用於詳情頁。
 * none 時不 render 任何 DOM。
 */
interface Props {
  tag?: CustomerPotentialTag;
  input?: PotentialTagInput;
  size?: "sm" | "md";
}

export function CustomerPotentialBadge({ tag, input, size = "sm" }: Props) {
  const resolved = tag ?? (input ? getCustomerPotentialTag(input) : "none");
  if (resolved === "none") return null;

  const label = POTENTIAL_TAG_LABEL[resolved];
  const sizeCls =
    size === "md"
      ? "px-2 py-0.5 text-xs"
      : "px-1.5 py-0.5 text-[10px]";

  const colorCls =
    resolved === "future_owner_watch"
      ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
      : "bg-primary-50 text-primary-700";

  return (
    <span className={`inline-flex items-center rounded font-medium ${sizeCls} ${colorCls}`}>
      {label}
    </span>
  );
}
