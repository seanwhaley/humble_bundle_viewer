/**
 * Compact link control for opening an external subproduct info page.
 */
import { ExternalLink, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Tooltip } from "./ui/tooltip";
import { buttonVariants } from "./ui/button";

interface SubproductInfoLinkProps {
  url?: string;
  label?: string;
  className?: string;
  icon?: LucideIcon;
  buttonLabel?: string;
  showLabel?: boolean;
  targetBlank?: boolean;
}

/**
 * Render a small external-link action when a subproduct info URL exists.
 */
export default function SubproductInfoLink({
  url,
  label = "Open linked product page",
  className,
  icon: Icon = ExternalLink,
  buttonLabel,
  showLabel = false,
  targetBlank = true,
}: SubproductInfoLinkProps) {
  if (!url) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  return (
    <Tooltip content={label}>
      <a
        href={url}
        target={targetBlank ? "_blank" : undefined}
        rel={targetBlank ? "noreferrer" : undefined}
        aria-label={label}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 gap-1 px-2 text-slate-300 hover:text-white",
          className
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {showLabel && buttonLabel ? (
          <span className="text-xs">{buttonLabel}</span>
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </a>
    </Tooltip>
  );
}
