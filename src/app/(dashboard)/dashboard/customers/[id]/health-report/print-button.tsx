"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: "8px 20px",
        background: "#4a7c3f",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      列印 / 儲存 PDF
    </button>
  );
}
