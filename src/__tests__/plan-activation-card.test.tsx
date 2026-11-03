// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPlanActivationCard } from "@/lib/plan-activation-card";
import { PlanActivationCardPreview } from "@/components/admin/plan-activation-card-preview";
import { LINE_CARD_COLORS } from "@/lib/line-card-theme";

function leafTexts(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  if ("type" in node && node.type === "text" && "text" in node) return [String(node.text)];
  return Object.values(node).flatMap(value => Array.isArray(value) ? value.flatMap(leafTexts) : leafTexts(value));
}
describe("plan activation LINE card and actual preview", () => {
  it.each([
    {storeName:"蒸足館", customerName:"王小美", planName:"十次方案",quantity:10,unit:"次",expiresDate:"2027-01-31"},
    {storeName:"音樂教室",customerName:"學生甲",planName:"個別課",quantity:12,unit:"堂",expiresDate:null},
    {storeName:"運動教室",customerName:"學員甲",planName:"點數方案",quantity:100,unit:"點",expiresDate:null},
    {storeName:"美業門市",customerName:"顧客甲",planName:"肩頸保養",quantity:10,unit:"次",expiresDate:"2027-01-31"},
  ])("previews every delivered field for $storeName without live actions", value => {
    const message=buildPlanActivationCard(value);
    expect(message).toMatchObject({type:"flex",contents:{type:"bubble",header:{backgroundColor:LINE_CARD_COLORS.headerBackground}}});
    const container=document.createElement("div");
    container.innerHTML=renderToStaticMarkup(<PlanActivationCardPreview value={value}/>);
    try {
      const preview=container.querySelector('[aria-label="方案開通 LINE Flex 卡片預覽"]')!;
      for(const text of leafTexts(message.contents)) expect(preview.textContent).toContain(text);
      expect(preview.querySelectorAll("a,button,input")).toHaveLength(0);
      expect(message.altText).toContain(value.planName);
      expect(preview.textContent).toContain(`${value.quantity} ${value.unit}`);
      if(!value.expiresDate)expect(preview.textContent).toContain("無固定到期日，依方案使用規則");
    } finally {container.remove();}
  });
  it("bounds LINE altText by Unicode code points while preserving full card content",()=>{
    const value={storeName:"😀門市".repeat(100),customerName:"長姓名".repeat(100),planName:"超長方案".repeat(100),quantity:0,unit:"次",expiresDate:null};
    const card=buildPlanActivationCard(value);
    expect(Array.from(card.altText)).toHaveLength(400);
    expect(leafTexts(card.contents)).toContain(value.planName);
    expect(leafTexts(card.contents)).toContain("0 次");
    expect(card.altText).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
