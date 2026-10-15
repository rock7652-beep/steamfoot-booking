import type { ReactNode } from "react";

/** Shared fixed-column lists scroll locally in narrow panels without shrinking text. */
export function RosterTable({ label, columns, children }: { label: string; columns: string[]; children: ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border border-earth-200 focus-visible:outline-2 focus-visible:outline-primary-600">
    <table className="w-full min-w-[640px] table-fixed has-[form]:table-auto [&_form]:min-w-64 text-left text-sm [&_td]:break-words [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
      <caption className="sr-only">{label}</caption>
      <thead className="bg-earth-50 text-earth-600"><tr>{columns.map(column=><th key={column} scope="col" className="px-3 py-2 font-medium">{column}</th>)}</tr></thead>
      <tbody className="divide-y divide-earth-100 bg-white">{children}</tbody>
    </table>
  </div>;
}
