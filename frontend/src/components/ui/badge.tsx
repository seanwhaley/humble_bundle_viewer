/**
 * Badge primitive for status and pill-style labels.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
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
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };