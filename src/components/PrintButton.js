"use client";

import { Printer } from "lucide-react";

// Triggers the browser print dialog → "Save as PDF" produces the Report Card.
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-primary btn-sm print:hidden">
      <Printer className="h-4 w-4" /> Print / Save as PDF
    </button>
  );
}
