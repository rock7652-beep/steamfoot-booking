"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { getBookingSubmitErrors, type BookingSubmitErrors } from "./booking-submit-validation";

type FieldName = "customer" | "slot";
type Errors = BookingSubmitErrors;

const BookingFormValidationContext = createContext<{
  errors: Errors;
  clearError: (field: FieldName) => void;
} | null>(null);

export function useBookingFormValidation() {
  const context = useContext(BookingFormValidationContext);
  if (!context) {
    throw new Error("useBookingFormValidation must be used inside BookingCreateForm");
  }
  return context;
}

interface BookingCreateFormProps {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}

/**
 * Native validation cannot focus a hidden customerId or sr-only slot radio. Keep
 * those fields as normal form data, but validate them here with visible feedback.
 */
export function BookingCreateForm({ action, children }: BookingCreateFormProps) {
  const [errors, setErrors] = useState<Errors>({});

  const clearError = useCallback((field: FieldName) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const focusField = (form: HTMLFormElement, field: FieldName) => {
    const target = form.querySelector<HTMLElement>(
      field === "customer"
        ? '[data-booking-customer-search]'
        : '[data-booking-slot-section]',
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (field === "customer") target?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = new FormData(form);
    const nextErrors = getBookingSubmitErrors({
      customerId: data.get("customerId"),
      slotTime: data.get("slotTime"),
    });

    if (Object.keys(nextErrors).length > 0) {
      event.preventDefault();
      setErrors(nextErrors);
      focusField(form, nextErrors.customer ? "customer" : "slot");
    }
  };

  const value = useMemo(() => ({ errors, clearError }), [errors, clearError]);

  return (
    <BookingFormValidationContext.Provider value={value}>
      <form action={action} onSubmit={handleSubmit} noValidate className="space-y-6 pb-4">
        {children}
      </form>
    </BookingFormValidationContext.Provider>
  );
}
