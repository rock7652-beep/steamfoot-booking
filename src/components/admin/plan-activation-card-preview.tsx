import { LineCardPreview } from "@/app/(dashboard)/dashboard/reminders/line-card-preview";
import { planActivationCardPresentation } from "@/lib/plan-activation-card";
import type { PlanActivationSnapshot } from "@/lib/plan-activation-notification";
import { LINE_CARD_COLORS } from "@/lib/line-card-theme";

export function PlanActivationCardPreview({ value }: { value: PlanActivationSnapshot }) {
  const card = planActivationCardPresentation(value);
  return <div aria-label="方案開通 LINE Flex 卡片預覽" className="min-w-0 rounded-xl bg-earth-50 p-3">
    <LineCardPreview exactTitle title={card.title} subtitle={card.storeName} actions={[]} footer={<p className="break-words text-left" style={{color:LINE_CARD_COLORS.label}}>{card.footer}</p>}>
      <p>{card.greeting}</p>
      <dl className="space-y-3">{card.rows.map(row=><div key={row.label} className="grid min-w-0 grid-cols-[3fr_7fr] gap-4"><dt style={{color:LINE_CARD_COLORS.label}}>{row.label}</dt><dd className="min-w-0 break-words text-right">{row.value}</dd></div>)}</dl>
    </LineCardPreview>
  </div>;
}
