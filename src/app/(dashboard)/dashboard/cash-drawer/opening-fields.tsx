"use client";
import { useState } from "react";
export function OpeningFields() {
  const [book, setBook] = useState(""), [actual, setActual] = useState("");
  const differs = book !== "" && actual !== "" && Number(book) !== Number(actual);
  const input = "mt-1 min-h-11 w-full rounded-lg border border-earth-300 p-3 text-base";
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm">初始帳面金額（NT$）<input name="openingBookBalance" type="number" min={0} step={1} required value={book} onChange={e => setBook(e.target.value)} className={input} /></label>
    <label className="text-sm">實際點到金額（NT$）<input name="openingActualCash" type="number" min={0} step={1} required value={actual} onChange={e => setActual(e.target.value)} className={input} /></label>
    {differs && <label className="text-sm sm:col-span-2">差額原因<textarea name="note" required rows={2} className={input} /></label>}
  </div>;
}
