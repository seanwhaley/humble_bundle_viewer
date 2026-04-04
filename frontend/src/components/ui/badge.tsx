/**
 * Badge primitive for status and pill-style labels.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border transition-colors",
  {
    variants: {
      variant: {
        success:
          "border-status-success/40 bg-status-success/10 text-status-success-foreground",
        warning:
          "border-status-warning/40 bg-status-warning/10 text-status-warning-foreground",
        info: "border-status-info/40 bg-status-info/10 text-status-info-foreground",
        error:
          "border-status-error/40 bg-status-error/10 text-status-error-foreground",
        neutral:
          "border-status-neutral/80 bg-status-neutral/80 text-status-neutral-foreground",
        surface: "border-border bg-surface-overlay text-card-foreground",
        muted: "border-border bg-surface-inset text-muted-foreground",
      },
      size: {
        default: "px-2.5 py-1 text-[11px]",
        compact: "px-2.5 py-1 text-xs",
        tiny: "px-2 py-0.5 text-[10px]",
      },
      casing: {
        label: "font-semibold uppercase tracking-[0.16em]",
        ui: "font-medium normal-case tracking-normal",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "default",
      casing: "label",
    },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>;
type BadgeCasing = NonNullable<VariantProps<typeof badgeVariants>["casing"]>;

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  casing?: BadgeCasing;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      "aria-label": ariaLabel,
      casing,
      children,
      className,
      size,
      variant,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        aria-label={ariaLabel}
        className={cn(badgeVariants({ casing, size, variant }), className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };