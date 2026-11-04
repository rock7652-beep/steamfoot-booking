export const beautyServiceTypes = ['massage', 'facial', 'nails', 'lashes'] as const;
export type BeautyServiceType = typeof beautyServiceTypes[number];

// Editable examples for ordinary nonmedical services, never automatic consent.
export const beautyServiceTemplates: Record<BeautyServiceType, { label: string; text: string }> = {
  massage: { label: '按摩', text: '服務說明：一般非醫療放鬆按摩，操作部位、力道及使用產品於服務前確認，不涉及疾病診斷或治療。\n可能反應：局部痠痛、壓痛、泛紅或產品刺激；力道過強或持續疼痛時應立即告知並停止調整。\n事前溝通：如有傷口、近期受傷或手術、懷孕或其他可能影響操作安全的情況，請私下提供必要資訊；有疑慮時先尋求醫療專業評估。\n服務後照護：留意身體反應，避免立即進行造成不適的活動；疼痛持續、腫脹或異常反應應尋求醫療協助。' },
  facial: { label: '美容', text: '服務說明：一般非醫療清潔、保養及美容服務；產品、操作部位與方式於服務前說明確認。\n可能反應：泛紅、乾燥、刺癢、敏感或接觸性過敏；曾使用無不適仍可能出現新反應。\n事前溝通：如有皮膚破損、過敏、近期換膚或其他皮膚處置，請私下告知必要資訊，由服務人員評估是否調整或暫緩。\n服務後照護：依當次產品及操作方式提供清潔、保濕與防曬說明；避免自行使用可能刺激的產品，異常持續時就醫。' },
  nails: { label: '美甲', text: '服務說明：指甲修整、凝膠或其他已說明的美甲服務；使用產品、卸除及操作方式於服務前確認。\n可能反應：磨甲或卸甲造成不適、甲面變薄、皮膚或甲周刺激，以及產品過敏；照燈若灼熱應立即告知。\n事前溝通：如有甲周傷口、紅腫、疑似感染或過往凝膠及黏著產品過敏，請先告知，必要時暫緩並尋求專業評估。\n服務後照護：避免摳剝或強行拔除，卸除及修補應依說明處理；出現疼痛、腫脹或甲面異常應停止使用並就醫。' },
  lashes: { label: '美睫', text: '服務說明：已說明的睫毛嫁接、整理或卸除服務；使用膠材、操作方式及預期外觀於服務前確認。\n可能反應：膠材或用品引起刺癢、流淚、眼周紅腫及過敏；操作不當可能造成自然睫毛損傷，異常時立即停止。\n事前溝通：如有眼睛不適、眼周傷口、近期眼部處置或膠材過敏，請私下告知必要資訊；是否移除隱形眼鏡及暫緩操作應於服務前確認。\n服務後照護：依當次膠材及操作提供清潔、碰水與卸除說明，不自行拉扯；持續紅腫、疼痛或視力變化應立即尋求醫療協助。' },
};

export type BeautyServiceSelection = { selected: BeautyServiceType[]; content: Partial<Record<BeautyServiceType, string>> };
export function toggleBeautyService(current: BeautyServiceSelection | undefined, type: BeautyServiceType, checked: boolean): BeautyServiceSelection {
  const content = { ...current?.content };
  if (checked && !content[type]?.trim()) content[type] = beautyServiceTemplates[type].text;
  const selected = beautyServiceTypes.filter(key => key === type ? checked : current?.selected.includes(key));
  return { selected, content };
}
