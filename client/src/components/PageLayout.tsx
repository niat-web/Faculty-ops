import { type ReactNode } from "react";
import Breadcrumbs, { type Crumb } from "./Breadcrumbs";

export default function PageLayout({
  breadcrumbs,
  badge,
  title,
  subtitle,
  toolbar,
  children,
  className = "",
}: {
  breadcrumbs?: Crumb[];
  badge?: string;
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-0 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="pb-2 pt-1">{<Breadcrumbs items={breadcrumbs} />}</div>
      )}
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {badge && <div className="label-muted mb-1">{badge}</div>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle mt-1">{subtitle}</p>}
        </div>
        {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}
