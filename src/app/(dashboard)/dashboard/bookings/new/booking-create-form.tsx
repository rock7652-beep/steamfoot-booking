"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { getBookingSubmitErrors, type BookingSubmitErrors } from "./booking-submit-validation";
import { unstable_rethrow } from "next/navigation";
import { createBookingRequestKey, isBookingRequestKeyMismatch } from "@/lib/booking-request-key";
import { SubmitButton } from "@/components/submit-button";

type FieldName = "customer" | "treatment" | "slot";
type Errors = BookingSubmitErrors;

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

const BookingFormValidationContext = createContext<{
  errors: Errors;
  clearError: (field: FieldName) => void;
  calendarCustomerId: string | null;
  setCalendarCustomerId: (id: string | null) => void;
  calendarDate: string | null;
  setCalendarDate: (date: string) => void;
  submitting: boolean;
} | null>(null);

export function useBookingFormValidation() {
  const context = useContext(BookingFormValidationContext);
  if (!context) {
    throw new Error("useBookingFormValidation must be used inside BookingCreateForm");
  }
  return context;
}

interface BookingCreateFormProps {
  action: (formData: FormData) => Promise<void | { error: string }>;
  preserveOnFailure?: boolean;
  children: ReactNode;
}

export function BookingCreateSubmit() {
  const { submitting } = useBookingFormValidation();
  return <SubmitButton label={submitting ? "建立中..." : "確認建立"}
    pendingLabel="建立中..." disabled={submitting}
    className="bg-primary-600 text-white hover:bg-primary-700" />;
}

/**
 * Native validation cannot focus a hidden customerId or sr-only slot radio. Keep
 * those fields as normal form data, but validate them here with visible feedback.
 */
export function BookingCreateForm({ action, children, preserveOnFailure = false }: BookingCreateFormProps) {
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [errors, setErrors] = useState<Errors>({});
  const [calendarCustomerId, setCalendarCustomerId] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(createBookingRequestKey);

  const clearError = useCallback((field: FieldName) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const focusField = (form: HTMLFormElement, field: FieldName) => {
    const selector =
      field === "customer"
        ? '[data-booking-customer-search]'
        : field === "treatment"
          ? '[data-booking-treatment-section]'
          : '[data-booking-slot-section]';
    const target = form.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (field === "customer") target?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Opt-in only for STEAMFOOT. Manual submission avoids React's automatic
    // reset of uncontrolled inputs when an action returns a business error.
    if (preserveOnFailure) {
      event.preventDefault();
      if (submissionLock.current) return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const nextErrors = getBookingSubmitErrors({
      customerId: data.get("customerId"),
      slotTime: data.get("slotTime"),
      spaMode: data.get("spaMode"),
      treatmentIds: data.getAll("treatmentIds"),
    });

    if (Object.keys(nextErrors).length > 0) {
      event.preventDefault();
      setErrors(nextErrors);
      const isSpa = data.get("spaMode") === "on";
      focusField(form, isSpa
        ? nextErrors.treatment ? "treatment" : nextErrors.slot ? "slot" : "customer"
        : nextErrors.customer ? "customer" : nextErrors.treatment ? "treatment" : "slot");
      return;
    }

    if (preserveOnFailure) {
      submissionLock.current = true;
      setErrors({});
      setSubmitError(null);
      startTransition(async () => {
        try {
          const result = await action(data);
          if (result?.error) {
            if (isBookingRequestKeyMismatch(result.error)) {
              setRequestKey(createBookingRequestKey());
            }
            setSubmitError(result.error);
          }
        } catch (error) {
          unstable_rethrow(error);
          // The request might already have committed. Keep its key for retry.
          setSubmitError("暫時無法確認預約結果，內容已保留。請勿重新整理，可再次送出確認，系統會核對同一筆請求。");
        } finally {
          submissionLock.current = false;
        }
      });
    }
  };

  const value = useMemo(() => ({ errors, clearError, calendarCustomerId, setCalendarCustomerId, calendarDate, setCalendarDate, submitting }), [errors, clearError, calendarCustomerId, calendarDate, submitting]);

  return (
    <BookingFormValidationContext.Provider value={value}>
      <form action={preserveOnFailure ? undefined : async (data) => { await action(data); }} method={preserveOnFailure ? "post" : undefined} onSubmit={handleSubmit} noValidate className="space-y-6 pb-4" aria-busy={submitting}>
        {preserveOnFailure ? <>
          <input type="hidden" name="requestKey" value={requestKey} suppressHydrationWarning />
          {submitError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
          <fieldset disabled={!hydrated || submitting} className="min-w-0 space-y-6 border-0 p-0 m-0">{children}</fieldset>
        </> : children}
      </form>
    </BookingFormValidationContext.Provider>
  );
}
