"use client";

import { useState } from "react";

type Customer = { id: string; name: string; phone: string };

export function SpaCustomerPicker({
  customers,
  value,
  locked,
  onChange,
}: {
  customers: Customer[];
  value: string;
  locked: boolean;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = customers.find((c) => c.id === value);
  const matches = customers.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function select(customer: Customer) {
    onChange(customer.id);
    setQuery("");
    setOpen(false);
  }
  return (
    <section
      className="relative space-y-2"
      aria-label="預約顧客"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor="spa-customer-picker" className="block font-semibold">
        顧客
      </label>
      <input
        id="spa-customer-picker"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && !locked}
        aria-controls="spa-customer-results"
        aria-activedescendant={
          open && matches[active] ? `spa-customer-option-${active}` : undefined
        }
        autoComplete="off"
        placeholder="輸入姓名或電話，直接選擇顧客"
        disabled={locked}
        className="w-full rounded-lg border border-earth-200 bg-white px-3 py-2"
        value={selected ? `${selected.name} · ${selected.phone}` : query}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange("");
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((n) =>
              Math.max(
                0,
                Math.min(
                  matches.length - 1,
                  n + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            select(matches[active]);
          }
        }}
      />
      {open && !locked && (
        <div
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-earth-200 bg-white p-1 shadow-lg"
          id="spa-customer-results"
          role="listbox"
          aria-label="符合的顧客"
        >
          {matches.length ? (
            matches.map((c, i) => (
              <button
                key={c.id}
                id={`spa-customer-option-${i}`}
                type="button"
                role="option"
                aria-selected={c.id === value}
                tabIndex={-1}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-primary-50 ${i === active ? "bg-primary-50" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(c)}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-sm text-earth-500">{c.phone}</span>
              </button>
            ))
          ) : (
            <p role="status" className="p-3 text-sm text-earth-500">
              找不到符合的顧客，請檢查姓名或電話。
            </p>
          )}
        </div>
      )}
      {locked && (
        <p className="text-sm text-earth-500">
          這組預約由 {selected?.name ?? "已選顧客"} 聯絡，同行者共用此聯絡資料。
        </p>
      )}
    </section>
  );
}
