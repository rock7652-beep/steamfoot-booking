// Synthetic layout only; no authentication, database, or mutation controls.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { RetiredStoreSettingsNotice } from "../../src/components/retired-store-settings-notice";
createRoot(document.getElementById("root")!).render(
  <div className="md:pl-64"><main className="min-w-0 p-4"><RetiredStoreSettingsNotice storeId="synthetic-archived-spa" /></main></div>,
);
