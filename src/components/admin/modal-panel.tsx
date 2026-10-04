"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { RightSheet } from "./right-sheet";

/** Nested confirmations share the panel focus/scroll stack and escape clipping ancestors. */
export function ModalPanel({
  open, onClose, labelledById, children, pending = false, width = 448,
}: {
  open: boolean;
  onClose: () => void;
  labelledById: string;
  children: ReactNode;
  pending?: boolean;
  width?: number;
}) {
  if (!open) return null;
  return createPortal(
    <RightSheet open presentation="centered" fitContent width={width}
      labelledById={labelledById} closeOnEscape={!pending}
      onClose={() => { if (!pending) onClose(); }}>
      {children}
    </RightSheet>,
    document.body,
  );
}
