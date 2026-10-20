const fail = () => { throw new Error("Invalid editorial content: only the reviewed article data schema is allowed"); };
function object(value, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !(key in value))) fail();
}
function text(value, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail();
}
function texts(value) {
  if (!Array.isArray(value) || value.length > 100) fail();
  value.forEach(item => text(item));
}
function href(value) {
  text(value);
  if (/[\s\\]/.test(value) || (!value.startsWith("/") && !value.startsWith("https://www.steamfoot.com/"))) fail();
  const url = new URL(value, "https://www.steamfoot.com");
  if (url.origin !== "https://www.steamfoot.com" || url.username || url.password || url.search ||
      !/^\/(?:apply|pricing(?:\/features(?:\/(?:music|fitness|slots))?)?|guides(?:\/[a-z0-9-]+)?)$/.test(url.pathname)) fail();
}
function link(value) {
  object(value, ["label", "href"], ["label", "href"]);
  text(value.label); href(value.href);
}

// Body links are data only: site-relative paths or absolute HTTPS URLs.
// Keep the narrower, existing CTA/feature destination policy unchanged.
function bodyLink(value) {
  object(value, ["label", "href"], ["label", "href"]);
  text(value.label); text(value.href);
  const address = value.href;
  if (/[\s\\<>\u0000-\u001f\u007f]/.test(address) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(address) ||
      !(address.startsWith("/") && !address.startsWith("//") || address.startsWith("https://"))) fail();
  let url;
  try { url = new URL(address, "https://www.steamfoot.com"); } catch { fail(); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) fail();
}
function paragraphs(value) {
  if (!Array.isArray(value) || value.length > 100) fail();
  for (const paragraph of value) {
    if (typeof paragraph === "string") { text(paragraph); continue; }
    object(paragraph, ["inlineParts"], ["inlineParts"]);
    const parts = paragraph.inlineParts;
    if (!Array.isArray(parts) || !parts.length || parts.length > 30) fail();
    parts.forEach(part => typeof part === "string" ? text(part) : bodyLink(part));
  }
}

// Parsed as JSON, never evaluated. Unknown keys and executable/configuration
// changes are rejected separately by the trusted release preflight.
export function parseEditorialGuides(value) {
  if (!Array.isArray(value) || value.length > 1000) fail();
  const ids = new Set();
  for (const guide of value) {
    object(guide, ["id", "category", "title", "seoTitle", "summary", "publishedDate", "status", "format", "feature", "featureName", "featureUrl", "featureLinkLabel", "showSummary", "primaryKeyword", "disclosure", "introduction", "sections", "conclusion", "callToAction"],
      ["id", "category", "title", "summary", "publishedDate", "status", "format", "feature", "featureName", "featureUrl", "introduction", "sections", "callToAction"]);
    text(guide.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.id) || guide.id.length > 120 || ids.has(guide.id)) fail();
    ids.add(guide.id);
    if (!["booking", "customers", "operations"].includes(guide.category) || guide.format !== "article" ||
        !["draft", "published"].includes(guide.status) || (guide.showSummary !== undefined && typeof guide.showSummary !== "boolean")) fail();
    for (const key of ["title", "summary", "feature", "featureName"]) text(guide[key]);
    for (const key of ["seoTitle", "featureLinkLabel", "primaryKeyword", "disclosure", "conclusion"]) if (guide[key] !== undefined) text(guide[key]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(guide.publishedDate) ||
        Number.isNaN(Date.parse(guide.publishedDate)) || new Date(guide.publishedDate).toISOString().split("T")[0] !== guide.publishedDate) fail();
    href(guide.featureUrl);
    texts(guide.introduction);
    if (!Array.isArray(guide.sections) || !guide.sections.length || guide.sections.length > 30) fail();
    for (const section of guide.sections) {
      object(section, ["heading", "paragraphs", "bullets", "trailingParagraphs", "link"], ["heading", "paragraphs"]);
      text(section.heading); paragraphs(section.paragraphs);
      for (const key of ["bullets", "trailingParagraphs"]) if (section[key] !== undefined) texts(section[key]);
      if (section.link !== undefined) link(section.link);
    }
    const cta = guide.callToAction;
    object(cta, ["text", "heading", "url", "label", "termsText", "termsLinkLabel", "inlineParts"], ["text"]);
    text(cta.text, true);
    for (const key of ["heading", "label", "termsText", "termsLinkLabel"]) if (cta[key] !== undefined) text(cta[key]);
    if (cta.url !== undefined) href(cta.url);
    if (cta.inlineParts !== undefined) {
      if (!Array.isArray(cta.inlineParts) || !cta.inlineParts.length || cta.inlineParts.length > 30 || cta.text !== "") fail();
      cta.inlineParts.forEach(part => typeof part === "string" ? text(part) : link(part));
    }
  }
  return value;
}

