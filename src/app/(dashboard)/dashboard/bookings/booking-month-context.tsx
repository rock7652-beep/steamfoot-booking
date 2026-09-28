"use client";
import { createContext, useContext } from "react";
export const BookingMonthContext = createContext<{
  navigate: (year: number, month: number) => void;
  invalidate: () => void;
  busy: (value: boolean) => void;
} | null>(null);
export const useBookingMonthNavigation = () => useContext(BookingMonthContext);
