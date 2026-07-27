import { type ReactNode } from "react";

export default function TableShell({
  title,
  action,
  children,
  footer,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`table-shell ${className}`}>
      {(title || action) && (
        <div className="table-shell-header flex items-center justify-between gap-3">
          {title && <h2 className="table-shell-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
      {footer && <div className="table-pagination">{footer}</div>}
    </div>
  );
}
