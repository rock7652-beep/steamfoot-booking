// Synthetic UI only. The QA Vite runner replaces actions before bundling.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { PanelReadProvider } from "../../src/components/operations/panel-read-cache";
import { MemberConnectionEntry } from "../../src/components/member-connection-entry";
import { StoreMemberConnectionPanel } from "../../src/components/admin/store-member-connection-panel";
import { WorkOrderNotificationSetting } from "../../src/components/admin/work-order-notification-setting";
import { WorkOrderNotificationResult } from "../../src/components/admin/work-order-notification-result";

createRoot(document.getElementById("root")!).render(<PanelReadProvider><main className="mx-auto max-w-3xl space-y-5 p-5"><h1 className="text-xl font-semibold">本店會員與工單通知・合成測試</h1><MemberConnectionEntry slug="synthetic-a" basicId="@synthetic" /><WorkOrderNotificationSetting initialEnabled={false} /><StoreMemberConnectionPanel customerId="synthetic-customer-a" /><WorkOrderNotificationResult orderId="synthetic-order-a" /></main></PanelReadProvider>);
