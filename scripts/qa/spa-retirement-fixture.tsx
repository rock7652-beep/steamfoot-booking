// Synthetic layout only: no database or submission capability.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { BookingTypes } from "../../src/app/pricing/booking-types";
import NewStoreForm from "../../src/app/hq/dashboard/stores/new/new-store-form";

const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(
  view === "hq"
    ? <main className="mx-auto max-w-2xl p-4"><NewStoreForm /></main>
    : <BookingTypes />,
);
