import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { inventoryContext, inventoryData, inventoryExportEnabled } from "@/server/services/inventory";
import { requirePermission } from "@/lib/permissions";
import { requireDataExportFeature } from "@/lib/data-export-gate";
import { AppError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export async function GET(request?: Request) {
    try {
        const ctx = await inventoryContext();
        await requirePermission("report.export");
        if (!await inventoryExportEnabled(ctx.storeId))
            return new NextResponse("資料輸出已關閉", { status: 403 });
        const forbidden = await requireDataExportFeature(ctx.storeId);
        if (forbidden)
            return forbidden;
        const data = await inventoryData(ctx), book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet("商品庫存與盤點");
        sheet.columns = [{ header: "商品", key: "name", width: 32 }, { header: "帳面庫存", key: "stock", width: 16 }, { header: "預設售價", key: "price", width: 16 }, ...(ctx.canCost ? [{ header: "平均成本", key: "averageCost", width: 18 }] : []), { header: "使用狀態", key: "status", width: 14 }, { header: "實際盤點數量", key: "actual", width: 18 }, { header: "盤點備註", key: "note", width: 32 }];
        const query=new URL(request?.url||"https://inventory.local").searchParams.get("q")||"";
        for (const p of data.products.filter(p=>p.name.includes(query)))
            sheet.addRow({ ...p, averageCost:p.costPending?"待確認":p.averageCost,status: p.active ? "使用中" : "停用", actual: "", note: "" });
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
        const buffer = await book.xlsx.writeBuffer();
        return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=inventory.xlsx", "Cache-Control": "private, no-store" } });
    }
    catch (error) {
        return new NextResponse(error instanceof AppError ? error.message : "輸出失敗", { status: error instanceof AppError && error.code === "FORBIDDEN" ? 403 : 500 });
    }
}
