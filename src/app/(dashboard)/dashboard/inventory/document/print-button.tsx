"use client";
import { useEffect } from "react";
export function PrintButton({autoPrint=false}:{autoPrint?:boolean}) {
    useEffect(()=>{if(autoPrint) window.print();},[autoPrint]);
    return <button type="button" onClick={() => window.print()}>重新列印</button>;
}
