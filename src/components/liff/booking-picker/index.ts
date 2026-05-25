/**
 * Shared LIFF Booking Picker barrel (PR-G3-pre)
 *
 * `MonthCalendar` + `SlotPicker` — booking-type-agnostic 共用元件，給
 * `/liff/trial-booking` 與 `/liff/member-booking` (PR-G3 主體) 共用。
 *
 * Type 與文案結構（`*Labels`）一併 re-export，方便 caller import 一次取齊。
 */

export { MonthCalendar } from "./month-calendar";
export type {
  MonthCalendarProps,
  MonthCalendarLabels,
  MonthDayInfo,
} from "./month-calendar";

export { SlotPicker } from "./slot-picker";
export type { SlotPickerProps, SlotPickerLabels } from "./slot-picker";
