import type { ElementType, ReactNode } from "react";

import { cn } from "../../lib/utils";

export type PaneHeaderProps = {
  className?: string;
  eyebrow?: ReactNode;
  topRight?: ReactNode;
  topRightClassName?: string;
  title: ReactNode;
  titleAs?: ElementType;
  titleClassName?: string;
  note?: ReactNode;
  noteClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  footer?: ReactNode;
  footerClassName?: string;
};

/**
 * Shared pane-header layout used across viewer cards and route summaries.
 *
 * Structure:
 * - row 1: eyebrow/kicker on the left, status/actions on the right
 * - row 2: title spanning the full pane width
 * - row 3+: note/description/footer blocks
 */
export default function PaneHeader({
  className,
  description,
  descriptionClassName,
  eyebrow,
  footer,
  footerClassName,
  note,
  noteClassName,
  topRight,
  topRightClassName,
  title,
  titleAs: TitleTag = "h3",
  titleClassName,
}: PaneHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        <div className="min-w-0">{eyebrow}</div>
        <div
          className={cn(
            "flex min-w-0 flex-wrap justify-end gap-2 text-xs",
            topRightClassName,
          )}>
          {topRight}
        </div>
        <TitleTag
          className={cn(
            "col-span-2 min-w-0 text-lg font-semibold text-card-foreground",
            titleClassName,
          )}>
          {title}
        </TitleTag>
      </div>

      {note && (
        <div
          className={cn(
            "text-sm font-medium text-muted-foreground",
            noteClassName,
          )}>
          {note}
        </div>
      )}

      {description && (
        <div
          className={cn("text-sm text-muted-foreground", descriptionClassName)}>
          {description}
        </div>
      )}

      {footer && <div className={cn("pt-2", footerClassName)}>{footer}</div>}
    </div>
  );
}
