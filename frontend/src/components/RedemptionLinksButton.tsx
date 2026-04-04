/**
 * Compact action control for opening one or more external redemption links.
 */

import { ChevronDown, ExternalLink } from "lucide-react";

import { RedemptionLink } from "../data/types";
import { cn } from "../lib/utils";
import {
  COMPACT_EXTERNAL_LINK_CLASS,
  DISCLOSURE_TRIGGER_CLASS,
  POPUP_LINK_ITEM_CLASS,
  POPUP_LIST_CLASS,
  POPUP_PANEL_CLASS,
  POPUP_TITLE_CLASS,
  SECTION_HELP_TEXT_CLASS,
} from "../styles/roles";
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
    return <span className={SECTION_HELP_TEXT_CLASS}>—</span>;
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
            compact ? COMPACT_EXTERNAL_LINK_CLASS : "gap-2",
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
          DISCLOSURE_TRIGGER_CLASS,
          compact ? "h-8 text-muted-foreground hover:text-foreground" : "gap-2"
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
      <div className={POPUP_PANEL_CLASS}>
        <div className={POPUP_TITLE_CLASS}>
          Redemption links
        </div>
        <div className={POPUP_LIST_CLASS}>
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className={POPUP_LINK_ITEM_CLASS}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{link.label}</span>
                {(link.region || link.kind === "instructions") && (
                  <span className="block text-xs text-muted-foreground">
                    {link.region || "Instructions"}
                  </span>
                )}
              </span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>
    </details>
  );
}