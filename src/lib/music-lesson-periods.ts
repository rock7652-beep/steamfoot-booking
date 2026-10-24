export type MusicLessonSlot = { period: number; ordinal: number; bonus: boolean };
/** Old cards need an explicit purchased-period snapshot; never infer it from balance. */
export function musicLessonPeriodIssue(card: { musicTermSizes: readonly number[]; musicOpeningStateRequired: boolean }): string | null {
  return !card.musicOpeningStateRequired && !card.musicTermSizes.length
    ? "方案期別待確認，請先核對各期堂數" : null;
}
/** Snapshot sizes, never the current product catalog, define a purchased period. */
export function musicLessonSlots(sizes: readonly number[], bonus = 0): MusicLessonSlot[] {
  if (!sizes.length || sizes.length > 999 || sizes.some(n => !Number.isSafeInteger(n) || n < 1 || n > 1000) || !Number.isSafeInteger(bonus) || bonus < 0 || bonus > 1000) return [];
  return [...sizes.flatMap((n, index) => Array.from({ length: n }, (_, i) => ({ period: index + 1, ordinal: i + 1, bonus: false }))),
    ...Array.from({ length: bonus }, (_, i) => ({ period: sizes.length + 1, ordinal: i + 1, bonus: true }))];
}
export function nextMusicLessonSlot(sizes: readonly number[], bonus: number, occupied: readonly MusicLessonSlot[]) {
  return musicLessonSlots(sizes, bonus).find(slot => !occupied.some(item => item.period === slot.period && item.ordinal === slot.ordinal)) ?? null;
}
