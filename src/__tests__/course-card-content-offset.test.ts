import { expect, it } from "vitest";
import { courseCardContentOffset } from "@/lib/course-card-content-offset";
it("leaves an upcoming card aligned to its start", () => expect(courseCardContentOffset(200, 140, 56, 100)).toBe(0));
it("keeps a partially scrolled card readable below the date header", () => expect(courseCardContentOffset(70, 140, 56, 100)).toBe(27));
it("stops at the end of its frame instead of covering the next class", () => expect(courseCardContentOffset(-200, 140, 56, 100)).toBe(78));
it("does not shift content in short or overflowing cards", () => expect(courseCardContentOffset(0, 44, 56, 100)).toBe(0));
