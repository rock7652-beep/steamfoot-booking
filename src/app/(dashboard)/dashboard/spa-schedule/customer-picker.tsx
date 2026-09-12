"use client";

import { normalizePhone } from "@/lib/normalize";
import { useState } from "react";

type Customer = { id: string; name: string; phone: string };

export function SpaCustomerPicker({
  customers,
  value,
  locked,
  onChange,
  newCustomer,
  onNewCustomerChange,
  hasCompanions,
}: {
  customers: Customer[];
  value: string;
  locked: boolean;
  onChange: (id: string) => void;
  newCustomer?: { name: string; phone: string } | null;
  onNewCustomerChange?: (value: { name: string; phone: string } | null) => void;
  hasCompanions?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = customers.find((c) => c.id === value);
  const matches = customers.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function select(customer: Customer) {
    onNewCustomerChange?.(null);
    onChange(customer.id);
    setQuery("");
    setOpen(false);
  }
  const existingPhone = newCustomer
    ? customers.find(
        (c) =>
          normalizePhone(c.phone) === normalizePhone(newCustomer.phone) &&
          !!newCustomer.phone.trim(),
      )
    : undefined;
  if (newCustomer && onNewCustomerChange)
    return (
      <section
        aria-label="新顧客資料"
        className="space-y-3 rounded-lg bg-primary-50 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">新顧客聯絡資料</h3>
          <button
            type="button"
            className="text-primary-700 underline"
            onClick={() => onNewCustomerChange(null)}
          >
            改選既有顧客
          </button>
        </div>
        <label className="block">
          聯絡電話
          <input
            type="tel"
            autoComplete="tel"
            value={newCustomer.phone}
            onChange={(e) =>
              onNewCustomerChange({ ...newCustomer, phone: e.target.value })
            }
            placeholder="09 開頭，共 10 碼"
            className="mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2"
          />
        </label>
        {existingPhone && (
          <div
            role="status"
            className="rounded-lg border border-primary-200 bg-white p-3"
          >
            <p>此電話已有顧客：{existingPhone.name}</p>
            <button
              type="button"
              className="mt-2 text-primary-700 underline"
              onClick={() => select(existingPhone)}
            >
              使用這位顧客
            </button>
          </div>
        )}
        <label className="block">
          顧客稱呼
          <input
            value={newCustomer.name}
            maxLength={100}
            onChange={(e) =>
              onNewCustomerChange({ ...newCustomer, name: e.target.value })
            }
            placeholder="例如：陳小姐、林先生"
            className="mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2"
          />
        </label>
        <p className="text-sm text-earth-500">
          只需一位代表人的稱呼與電話。確認預約時一併建立顧客資料。
        </p>
      </section>
    );
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
        placeholder="輸入電話或稱呼，直接選擇顧客"
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
      {!locked && onNewCustomerChange && (
        <button
          type="button"
          className="text-primary-700 underline"
          onClick={() => {
            onChange("");
            onNewCustomerChange({
              name: /[a-zA-Z\u4e00-\u9fff]/.test(query) ? query : "",
              phone: /^[+\d\s()-]+$/.test(query) ? query : "",
            });
            setOpen(false);
          }}
        >
          ＋新顧客：填稱呼與電話
        </button>
      )}
      {(locked || hasCompanions) && (
        <p className="text-sm text-earth-500">
          整組只需一位代表人的稱呼與電話，同行者共用此聯絡資料。
        </p>
      )}
    </section>
  );
}
