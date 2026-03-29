/**
 * Button primitives with Tailwind variants.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const assignRef = <T,>(ref: React.Ref<T> | undefined, value: T | null) => {
  if (!ref) return;

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  (ref as React.MutableRefObject<T | null>).current = value;
};

const mergeRefs = <T,>(...refs: Array<React.Ref<T> | undefined>) =>
  (value: T | null) => {
    refs.forEach((ref) => assignRef(ref, value));
  };

// Variant map shared by all button instances.
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Styled button component with size/variant support.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }));

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }> & {
        ref?: React.Ref<HTMLElement>;
      };

      return React.cloneElement(child, {
        ...props,
        ref: mergeRefs(ref as React.Ref<HTMLElement>, child.ref),
        className: cn(classes, child.props.className),
      });
    }

    return (
      <button
        className={classes}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
