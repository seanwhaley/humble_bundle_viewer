/**
 * Compact stat tile used for dashboard metrics.
 */
import { cn } from "../lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  docId?: string;
}

/**
 * Renders a labeled metric card, optionally clickable for filtering.
 */
export default function StatTile({
  label,
  value,
  subtitle,
  onClick,
  className,
  docId,
}: StatTileProps) {
  const tileClasses = cn(
    "bg-card text-card-foreground rounded-xl border border-border shadow-sm",
    onClick &&
      "cursor-pointer text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );

  const content = (
    <div className="p-4" data-doc-id={docId}>
      <div
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        data-doc-id={docId ? `${docId}-label` : undefined}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-bold tracking-tight"
        data-doc-id={docId ? `${docId}-value` : undefined}>
        {value}
      </div>
      {subtitle && (
        <div
          className="mt-1 text-xs text-muted-foreground"
          data-doc-id={docId ? `${docId}-subtitle` : undefined}>
          {subtitle}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" className={tileClasses} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={tileClasses}>{content}</div>;
}
