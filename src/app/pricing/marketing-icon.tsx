type IconKind = "store" | "return" | "stores" | "chat" | "calendar";

export function MarketingIcon({ kind }: { kind: IconKind }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 shrink-0 text-[#153B31]">
    {kind === "store" && <><path d="M3 10h18l-2-6H5l-2 6ZM5 10v10h14V10M10 20v-6h4v6" /><path stroke="#967039" d="M8 4v6m8-6v6" /></>}
    {kind === "return" && <><circle cx="12" cy="9" r="3" /><path d="M7 18c0-5 10-5 10 0" /><path stroke="#967039" d="M20 7a9 9 0 1 1-7-4m4 0h4v4" /></>}
    {kind === "stores" && <><path d="M2 11h8V4H2v7Zm12 0h8V4h-8v7ZM6 11v4h12v-4M12 15v5" /><path stroke="#967039" d="M9 20h6M5 7h2m10 0h2" /></>}
    {kind === "chat" && <><path d="M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v4l5-4h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path stroke="#967039" d="M7 9h10M7 13h6" /></>}
    {kind === "calendar" && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /><path stroke="#967039" d="m8 15 3 3 5-5" /></>}
  </svg>;
}
