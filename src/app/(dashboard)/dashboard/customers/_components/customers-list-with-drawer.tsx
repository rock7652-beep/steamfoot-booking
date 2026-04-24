"use client";

import { useState, useId } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { CustomersTable, type CustomerRow } from "./customers-table";
import { CustomerQuickDrawerContent } from "./customer-quick-drawer-content";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  rows: CustomerRow[];
  searchQuery?: string;
  hasActiveFilters: boolean;
  basePath: string;
  plans: Plan[];
  canDiscount: boolean;
  staffOptions: StaffOption[];
  canAssign: boolean;
}

export function CustomersListWithDrawer({
  rows,
  searchQuery,
  hasActiveFilters,
  basePath,
  plans,
  canDiscount,
  staffOptions,
  canAssign,
}: Props) {
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const titleId = useId();

  return (
    <>
      <CustomersTable
        rows={rows}
        searchQuery={searchQuery}
        hasActiveFilters={hasActiveFilters}
        basePath={basePath}
        onQuickAssign={(row) => setSelected(row)}
        onEditAssignment={canAssign ? (row) => setSelected(row) : undefined}
      />

      <RightSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        labelledById={titleId}
        width={480}
      >
        {selected && (
          <CustomerQuickDrawerContent
            key={selected.id}
            customer={selected}
            plans={plans}
            canDiscount={canDiscount}
            staffOptions={staffOptions}
            canAssign={canAssign}
            onClose={() => setSelected(null)}
            titleId={titleId}
          />
        )}
      </RightSheet>
    </>
  );
}
