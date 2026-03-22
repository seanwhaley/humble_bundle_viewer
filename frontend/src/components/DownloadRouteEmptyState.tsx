/**
 * Shared empty-state notice for direct download routes with no matching items.
 */
import { ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "./ui/button";

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
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-black/20">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-white">
            No valid subproducts for this page
          </h3>
          <p className="text-sm text-slate-300">
            No valid subproducts are part of the current library selection for
            the <span className="font-medium text-slate-100">{routeLabel}</span>{" "}
            page.
          </p>
          <p className="text-sm text-slate-400">
            Direct links to this route still resolve, but the sidebar hides the
            menu item when the active library has no matching downloads for this
            page.
          </p>
          {suggestedRoutes.length > 0 && (
            <div className="space-y-3 pt-1">
              <p className="text-sm text-slate-300">
                Try one of the dedicated download pages instead:
              </p>
              <div className="flex flex-wrap gap-2">
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
