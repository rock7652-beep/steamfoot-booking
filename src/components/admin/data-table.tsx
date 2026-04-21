import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

interface DataTableProps {
  children: ReactNode;
  className?: string;
}

export function DataTable({ children, className = "" }: DataTableProps) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-base">{children}</table>
    </div>
  );
}

interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
}

export function TH({ className = "", align = "left", children, ...rest }: THProps) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={`h-12 border-b border-earth-200 bg-earth-50 px-3 text-sm font-semibold text-earth-700 ${alignClass} ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
  number?: boolean;
}

export function TD({
  className = "",
  align,
  number = false,
  children,
  ...rest
}: TDProps) {
  const resolvedAlign = align ?? (number ? "right" : "left");
  const alignClass =
    resolvedAlign === "right"
      ? "text-right"
      : resolvedAlign === "center"
        ? "text-center"
        : "text-left";
  const numberClass = number ? "tabular-nums" : "";
  return (
    <td
      className={`h-14 border-b border-earth-100 px-3 align-middle text-earth-800 ${alignClass} ${numberClass} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}

interface TRProps {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function TR({ children, onClick, selected = false, className = "" }: TRProps) {
  const clickable = !!onClick;
  return (
    <tr
      onClick={onClick}
      className={`${clickable ? "cursor-pointer" : ""} ${
        selected ? "bg-primary-50" : "hover:bg-earth-50"
      } ${className}`}
    >
      {children}
    </tr>
  );
}
