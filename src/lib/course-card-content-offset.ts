/** Keep a scrolled course label visible, bounded by its own duration frame. */
export function courseCardContentOffset(cardTop: number, cardHeight: number, contentHeight: number, viewportTop: number, padding = 3) {
  return Math.min(Math.max(0, viewportTop - cardTop - padding), Math.max(0, cardHeight - contentHeight - padding * 2));
}
