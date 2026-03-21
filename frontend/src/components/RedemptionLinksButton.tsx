/**
 * Compact action control for opening one or more external redemption links.
 */

import { ChevronDown, ExternalLink } from "lucide-react";

import { RedemptionLink } from "../data/types";
import { cn } from "../lib/utils";
import { buttonVariants } from "./ui/button";
import { Tooltip } from "./ui/tooltip";

interface RedemptionLinksButtonProps {
  links?: RedemptionLink[];
  label?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Render a subtle external-link action for redemption-capable rows and purchases.
 */
export default function RedemptionLinksButton({
  links,
  label = "Redeem",
  compact = false,
  className,
}: RedemptionLinksButtonProps) {
  if (!links || links.length === 0) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  if (links.length === 1) {
    const link = links[0];
    return (
      <Tooltip content={link.label}>
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={link.label}
          className={cn(
            buttonVariants({ variant: compact ? "ghost" : "outline", size: "sm" }),
            compact ? "h-8 gap-1 px-2 text-slate-300 hover:text-white" : "gap-2",
            className
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {compact ? <span className="sr-only">{link.label}</span> : <span>{label}</span>}
        </a>
      </Tooltip>
    );
  }

  return (
    <details className={cn("relative inline-block text-left", className)}>
      <summary
        className={cn(
          buttonVariants({ variant: compact ? "ghost" : "outline", size: "sm" }),
          "list-none gap-1 px-2 marker:hidden [&::-webkit-details-marker]:hidden",
          compact ? "h-8 text-slate-300 hover:text-white" : "gap-2"
        )}
      >
        <Tooltip content={`${label} (${links.length})`}>
          <span className="inline-flex items-center gap-1">
            <ExternalLink className="h-3.5 w-3.5" />
            {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </Tooltip>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-slate-700 bg-slate-950/95 p-2 shadow-xl">
        <div className="px-2 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
          Redemption links
        </div>
        <div className="space-y-1">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start justify-between gap-2 rounded-md px-2 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{link.label}</span>
                {(link.region || link.kind === "instructions") && (
                  <span className="block text-xs text-slate-400">
                    {link.region || "Instructions"}
                  </span>
                )}
              </span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            </a>
          ))}
        </div>
      </div>
    </details>
  );
}