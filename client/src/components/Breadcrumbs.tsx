import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { type ReactNode } from "react";

export type Crumb = { label: string; to?: string };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav className="breadcrumb mb-1 flex flex-wrap items-center gap-1">
      {items.map((c, i) => (
        <span key={i} className="inline-flex max-w-[280px] items-center gap-1 truncate">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" strokeWidth={1.75} />}
          {c.to && i < items.length - 1
            ? <Link to={c.to} className="breadcrumb-link truncate">{c.label}</Link>
            : <span className={`truncate ${i === items.length - 1 ? "breadcrumb-current" : ""}`}>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
