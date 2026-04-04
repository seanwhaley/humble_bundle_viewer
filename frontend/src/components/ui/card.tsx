/**
 * Shared card primitives for consistent panel surfaces.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const cardVariants = cva("border border-border text-card-foreground", {
  variants: {
    surface: {
      default: "bg-card",
      panel: "bg-surface-panel",
      strong: "bg-surface-panel-strong",
      inset: "bg-surface-inset",
      overlay: "bg-surface-overlay backdrop-blur",
    },
    radius: {
      default: "rounded-xl",
      compact: "rounded-lg",
      section: "rounded-2xl",
    },
    shadow: {
      default: "shadow-sm",
      none: "shadow-none",
      inner: "shadow-inner",
    },
    interactive: {
      true: "transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-surface-panel-strong hover:shadow-md",
      false: "",
    },
  },
  defaultVariants: {
    surface: "default",
    radius: "default",
    shadow: "default",
    interactive: false,
  },
});

type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, radius, shadow, surface, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        cardVariants({ interactive, radius, shadow, surface }),
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardContent, CardHeader, cardVariants };
