/**
 * Shared empty-state notice for direct download routes with no matching items.
 */
import { ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "./ui/button";
import {
  EMPTY_STATE_ACTIONS_WRAP_CLASS,
  EMPTY_STATE_BODY_CLASS,
  EMPTY_STATE_ICON_CLASS,
  EMPTY_STATE_PANEL_CLASS,
  EMPTY_STATE_ROW_CLASS,
  EMPTY_STATE_STACK_CLASS,
  EMPTY_STATE_TITLE_CLASS,
} from "../styles/roles";
import { FLEX_ACTION_ROW_CLASS, SECTION_MUTED_TEXT_CLASS } from "../styles/page";

interface DownloadRouteEmptyStateProps {
  routeLabel: string;
  suggestedRoutes?: Array<{
    label: string;
    to: string;
  }>;
}

/**
 * Explain why a direct download route is available but has no matching items.
 */
export default function DownloadRouteEmptyState({
  routeLabel,
  suggestedRoutes = [],
}: DownloadRouteEmptyStateProps) {
  return (
    <div className={EMPTY_STATE_PANEL_CLASS}>
      <div className={EMPTY_STATE_ROW_CLASS}>
        <Info className={EMPTY_STATE_ICON_CLASS} />
        <div className={EMPTY_STATE_STACK_CLASS}>
          <h3 className={EMPTY_STATE_TITLE_CLASS}>
            No valid subproducts for this page
          </h3>
          <p className={EMPTY_STATE_BODY_CLASS}>
            No valid subproducts are part of the current library selection for
            the <span className="font-medium text-card-foreground">{routeLabel}</span>{" "}
            page.
          </p>
          <p className={SECTION_MUTED_TEXT_CLASS}>
            Direct links to this route still resolve, but the sidebar hides the
            menu item when the active library has no matching downloads for this
            page.
          </p>
          {suggestedRoutes.length > 0 && (
            <div className={EMPTY_STATE_ACTIONS_WRAP_CLASS}>
              <p className={EMPTY_STATE_BODY_CLASS}>
                Try one of the dedicated download pages instead:
              </p>
              <div className={FLEX_ACTION_ROW_CLASS}>
                {suggestedRoutes.map((route) => (
                  <Link
                    key={route.to}
                    to={route.to}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "gap-1.5",
                    })}>
                    {route.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
