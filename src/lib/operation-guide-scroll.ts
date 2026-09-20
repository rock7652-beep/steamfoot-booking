/** Mobile Safari needs a fixed page and a bounded inner scroller, not only showModal(). */
export function lockGuideBackground(panel: HTMLDialogElement) {
  const body = document.body;
  const html = document.documentElement;
  const x = window.scrollX, y = window.scrollY;
  const properties = ["position", "top", "left", "width"] as const;
  const saved = properties.map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)] as const);
  const panelProperties = ["top", "bottom", "height", "max-height"] as const;
  const savedPanel = panelProperties.map(name => [name, panel.style.getPropertyValue(name), panel.style.getPropertyPriority(name)] as const);
  const previousOverscroll = html.style.overscrollBehavior;
  body.style.position = "fixed";
  body.style.top = `-${y}px`;
  body.style.left = `-${x}px`;
  body.style.width = "100%";
  html.style.overscrollBehavior = "none";
  let lastY = 0;
  const start = (event: TouchEvent) => { lastY = event.touches[0]?.clientY ?? 0; };
  const move = (event: TouchEvent) => {
    if (event.touches.length !== 1) return; // preserve pinch zoom
    const scroller = panel.querySelector<HTMLElement>("[data-guide-scroll]");
    const target = event.target;
    const currentY = event.touches[0].clientY;
    const delta = currentY - lastY;
    lastY = currentY;
    const within = target instanceof Node && scroller?.contains(target);
    const atTop = scroller && scroller.scrollTop <= 0 && delta > 0;
    const atBottom = scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && delta < 0;
    if ((!within || atTop || atBottom) && event.cancelable) event.preventDefault();
  };
  const viewport = window.visualViewport;
  const resize = () => {
    // Safari's keyboard shrinks/pans the visual viewport while bottom: 0 still
    // refers to the layout viewport. Anchor both edges within the visible area.
    const visibleHeight = viewport?.height ?? window.innerHeight;
    const height = Math.floor(visibleHeight * 0.85);
    panel.style.top = `${(viewport?.offsetTop ?? 0) + visibleHeight - height}px`;
    panel.style.bottom = "auto";
    panel.style.height = `${height}px`;
    panel.style.maxHeight = `${height}px`;
  };
  resize();
  viewport?.addEventListener("resize", resize);
  viewport?.addEventListener("scroll", resize);
  window.addEventListener("resize", resize);
  document.addEventListener("touchstart", start, { passive: true });
  document.addEventListener("touchmove", move, { passive: false });
  return () => {
    viewport?.removeEventListener("resize", resize);
    viewport?.removeEventListener("scroll", resize);
    window.removeEventListener("resize", resize);
    document.removeEventListener("touchstart", start);
    document.removeEventListener("touchmove", move);
    savedPanel.forEach(([name,value,priority]) => value ? panel.style.setProperty(name,value,priority) : panel.style.removeProperty(name));
    saved.forEach(([name,value,priority]) => value ? body.style.setProperty(name,value,priority) : body.style.removeProperty(name));
    html.style.overscrollBehavior = previousOverscroll;
    // Respect an underlying modal's existing fixed-body lock.
    if (saved[0][1] !== "fixed") window.scrollTo({ left: x, top: y, behavior: "instant" });
  };
}
