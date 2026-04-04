/**
 * Compact stat tile used for dashboard metrics.
 */
import type { VariantProps } from "class-variance-authority";

import { cardVariants } from "./ui/card";
import { cn } from "../lib/utils";
import {
  METRIC_LABEL_CLASS,
  STAT_TILE_CONTENT_CLASS,
  STAT_TILE_INTERACTIVE_CLASS,
  STAT_TILE_SUBTITLE_CLASS,
  STAT_TILE_VALUE_CLASS,
} from "../styles/roles";

interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  docId?: string;
  surface?: VariantProps<typeof cardVariants>["surface"];
  shadow?: VariantProps<typeof cardVariants>["shadow"];
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
  surface = "inset",
  shadow = "none",
}: StatTileProps) {
  const tileClasses = cn(
    cardVariants({
      surface,
      shadow,
      interactive: Boolean(onClick),
    }),
    onClick && STAT_TILE_INTERACTIVE_CLASS,
    className,
  );

  const content = (
    <div className={STAT_TILE_CONTENT_CLASS} data-doc-id={docId}>
      <div
        className={METRIC_LABEL_CLASS}
        data-doc-id={docId ? `${docId}-label` : undefined}>
        {label}
      </div>
      <div
        className={STAT_TILE_VALUE_CLASS}
        data-doc-id={docId ? `${docId}-value` : undefined}>
        {value}
      </div>
      {subtitle && (
        <div
          className={STAT_TILE_SUBTITLE_CLASS}
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
