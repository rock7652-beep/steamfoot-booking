/**
 * Health Report 專用 layout — 無 sidebar，純列印用
 */
export default function HealthReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AI 健康評估報告</title>
        <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif;
    color: #1a1a1a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    @page {
      size: A4;
      margin: 15mm 12mm;
    }
  }

  @media screen {
    body { background: #f3f3f3; }
    .report-container {
      max-width: 800px;
      margin: 20px auto;
      background: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 8px;
      overflow: hidden;
    }
  }
`;
