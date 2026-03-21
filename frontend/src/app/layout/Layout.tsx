/**
 * Primary application layout with sidebar navigation and content outlet.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  matchPath,
  useLocation,
} from "react-router-dom";
import {
  ShoppingCart,
  Key,
  Download,
  BookOpen,
  Gamepad2,
  Headphones,
  Film,
  Monitor,
  Network,
  LayoutDashboard,
  Menu,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Plug,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import {
  useOptionalLibraryData,
  useLibraryStatus,
  useViewerConfig,
} from "../../data/api";
import {
  buildExpiringKeyActionSummary,
  collectProductDownloads,
  computeLibraryTotals,
  getDownloadRouteVisibility,
  type DownloadRouteVisibility,
} from "../../data/selectors";
import { formatDateTime, formatNumber } from "../../utils/format";
import { getLinkExpirationSummary } from "../../utils/downloads";

type SidebarNavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
};

type RouteMeta = {
  title: string;
  subtitle: string;
};

const SIDEBAR_GROUPS: Array<{ heading: string; items: SidebarNavItem[] }> = [
  {
    heading: "Viewer",
    items: [{ to: "/", icon: LayoutDashboard, label: "Viewer Home" }],
  },
  {
    heading: "Current sales",
    items: [
      { to: "/venue/overview", icon: LayoutDashboard, label: "Sales Overview" },
      { to: "/venue/choice", icon: Sparkles, label: "Current Choice" },
      { to: "/venue/bundles/games", icon: Gamepad2, label: "Game Bundles" },
      { to: "/venue/bundles/books", icon: BookOpen, label: "Book Bundles" },
      {
        to: "/venue/bundles/software",
        icon: Monitor,
        label: "Software Bundles",
      },
    ],
  },
  {
    heading: "Purchases",
    items: [{ to: "/orders", icon: ShoppingCart, label: "Purchases" }],
  },
  {
    heading: "Downloads",
    items: [
      { to: "/ebooks", icon: BookOpen, label: "Ebooks" },
      { to: "/audiobooks", icon: Headphones, label: "Audiobooks" },
      { to: "/videos", icon: Film, label: "Videos" },
      { to: "/software", icon: Monitor, label: "Software" },
      { to: "/downloads", icon: Download, label: "Other" },
    ],
  },
  {
    heading: "Keys",
    items: [
      { to: "/expiring-keys", icon: AlertTriangle, label: "Expiring" },
      { to: "/steam-keys", icon: Key, label: "Steam" },
      { to: "/non-steam-keys", icon: Key, label: "Non-Steam" },
    ],
  },
  {
    heading: "Tools",
    items: [
      { to: "/setup", icon: Plug, label: "Setup" },
      { to: "/commands", icon: Terminal, label: "Command Center" },
      { to: "/structure", icon: Network, label: "Schema" },
    ],
  },
];

const DOWNLOAD_ROUTE_VISIBILITY_BY_PATH: Record<
  string,
  keyof DownloadRouteVisibility
> = {
  "/downloads": "downloads",
  "/software": "software",
  "/videos": "videos",
  "/ebooks": "ebooks",
  "/audiobooks": "audiobooks",
};

const DEFAULT_ROUTE_META: RouteMeta = {
  title: "HB Library Viewer",
  subtitle:
    "Browse captured purchases, downloads, keys, and media from one workspace.",
};

const humanizeSlug = (value?: string) => {
  if (!value) return "Unknown";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const getFilename = (value?: string) => {
  if (!value) return "library_products.json";
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || value;
};

const getRouteMeta = (pathname: string): RouteMeta => {
  const categoryMatch = matchPath("/category/:category", pathname);
  if (categoryMatch) {
    const category = humanizeSlug(categoryMatch.params.category);
    return {
      title: `${category} category`,
      subtitle: "Review purchases and content scoped to this category.",
    };
  }

  const venueBundleMatch = matchPath("/venue/bundles/:bundleType", pathname);
  if (venueBundleMatch) {
    const bundleType = venueBundleMatch.params.bundleType;
    const bundleTypeLabel =
      bundleType === "games" ? "Game bundles"
      : bundleType === "books" ? "Book bundles"
      : bundleType === "software" ? "Software bundles"
      : `${humanizeSlug(bundleType)} bundles`;
    return {
      title: bundleTypeLabel,
      subtitle:
        "Review live Humble bundle tiers for this current sales category, with tier overlap, ownership, pricing, and expiry signals from the shared backend analysis.",
    };
  }

  switch (pathname) {
    case "/venue/overview":
      return {
        title: "Sales Overview",
        subtitle:
          "Compare the current Choice package and live games, books, and software bundles from one filterable dashboard.",
      };
    case "/":
      return {
        title: "Viewer Home",
        subtitle:
          "Start with today’s buyer view, then move into owned-library signals, recent purchases, and download workflows.",
      };
    case "/orders":
      return {
        title: "Purchases",
        subtitle:
          "Review what each purchase contains and open related downloads, keys, and media.",
      };
    case "/current-bundles":
      return {
        title: "Current Bundles",
        subtitle:
          "Legacy shortcut that redirects to the new current sales bundle pages.",
      };
    case "/venue/choice":
      return {
        title: "Current Choice",
        subtitle:
          "Compare this month’s Humble Choice lineup against your captured library using the saved backend report.",
      };
    case "/downloads":
      return {
        title: "Other downloads",
        subtitle:
          "Browse direct-download content that is not already covered by the dedicated media pages.",
      };
    case "/software":
      return {
        title: "Software",
        subtitle:
          "Group software installers by title and platform/file-type variant.",
      };
    case "/videos":
      return {
        title: "Videos",
        subtitle: "Review video downloads grouped by title and file type.",
      };
    case "/ebooks":
      return {
        title: "Ebooks",
        subtitle:
          "Find ebook formats, compare file types, and sync selected titles locally.",
      };
    case "/audiobooks":
      return {
        title: "Audiobooks",
        subtitle:
          "Review audiobook formats and sync supported titles to a local folder.",
      };
    case "/steam-keys":
      return {
        title: "Steam keys",
        subtitle:
          "Inspect Steam redemption inventory and jump into reveal or follow-up workflows.",
      };
    case "/non-steam-keys":
      return {
        title: "Non-Steam keys",
        subtitle:
          "Review non-Steam redemption inventory such as Epic, GOG, and other claim types.",
      };
    case "/expiring-keys":
      return {
        title: "Expiring keys",
        subtitle:
          "Focus on keys that may need attention before their redemption window closes.",
      };
    case "/setup":
      return {
        title: "Library setup",
        subtitle:
          "Capture a fresh library file or point the viewer at an existing artifact.",
      };
    case "/commands":
      return {
        title: "Command Center",
        subtitle:
          "Run guided workflows and CLI-backed actions without leaving the viewer.",
      };
    case "/structure":
      return {
        title: "Schema",
        subtitle:
          "Inspect the normalized library shape used to power the viewer and tools.",
      };
    default:
      return DEFAULT_ROUTE_META;
  }
};

/**
 * Sidebar navigation item.
 */
const SidebarItem = ({
  to,
  icon: Icon,
  label,
  badge,
  collapsed,
}: {
  to: string;
  icon: any;
  label: string;
  badge?: string;
  collapsed: boolean;
}) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-slate-400 transition-all hover:text-slate-100 hover:bg-slate-800",
          isActive && "bg-indigo-600/10 text-indigo-400 font-medium",
          collapsed && "justify-center px-2",
        )
      }>
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {badge && (
            <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
              {badge}
            </span>
          )}
        </>
      )}
      {collapsed && badge && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400" />
      )}
    </NavLink>
  );
};

/**
 * Suspense fallback for lazy-loaded routes.
 */
const RouteFallback = () => (
  <div className="flex h-[50vh] items-center justify-center text-slate-400">
    <div className="flex items-center gap-3">
      <span className="h-2 w-2 animate-ping rounded-full bg-slate-500" />
      <span>Loading view…</span>
    </div>
  </div>
);

/**
 * Layout shell that renders the sidebar and the routed content.
 */
export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { data: libraryStatus } = useLibraryStatus();
  const { data: viewerConfig } = useViewerConfig();

  const isSetupRoute = location.pathname.startsWith("/setup");
  const isCommandsRoute = location.pathname.startsWith("/commands");
  const isCurrentSalesRoute =
    location.pathname.startsWith("/venue/") ||
    location.pathname === "/current-bundles";
  const shouldGate =
    libraryStatus && !libraryStatus.exists && !isSetupRoute && !isCommandsRoute;
  const routeMeta = useMemo(
    () => getRouteMeta(location.pathname),
    [location.pathname],
  );
  const { data: libraryData } = useOptionalLibraryData(
    libraryStatus?.exists === true,
  );
  const downloadRouteVisibility = useMemo(
    () =>
      libraryData ?
        getDownloadRouteVisibility(libraryData.products)
      : {
          downloads: true,
          software: true,
          videos: true,
          ebooks: true,
          audiobooks: true,
        },
    [libraryData],
  );
  const visibleSidebarGroups = useMemo(
    () =>
      SIDEBAR_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const routeKey = DOWNLOAD_ROUTE_VISIBILITY_BY_PATH[item.to];
          return routeKey ? downloadRouteVisibility[routeKey] : true;
        }),
      })).filter((group) => group.items.length > 0),
    [downloadRouteVisibility],
  );
  const currentLibraryName = getFilename(libraryStatus?.current_path);
  const capturedLabel = formatDateTime(libraryData?.captured_at);
  const expiringSoonMs =
    (viewerConfig?.link_expiry_warning_hours ?? 24) * 60 * 60 * 1000;
  const downloadExpirySummary = useMemo(
    () =>
      getLinkExpirationSummary(
        (libraryData?.products || []).flatMap((product) =>
          collectProductDownloads(product).map((download) => download.url),
        ),
        expiringSoonMs,
      ),
    [libraryData, expiringSoonMs],
  );
  const libraryTotals = useMemo(
    () => computeLibraryTotals(libraryData?.products || []),
    [libraryData],
  );
  const urgentKeysSummary = useMemo(
    () =>
      buildExpiringKeyActionSummary(libraryData?.products || [], 30, {
        assume_revealed_keys_redeemed:
          viewerConfig?.assume_revealed_keys_redeemed,
        ignore_revealed_status_for_expired_keys:
          viewerConfig?.ignore_revealed_status_for_expired_keys,
        ignore_revealed_status_for_unexpired_keys:
          viewerConfig?.ignore_revealed_status_for_unexpired_keys,
      }),
    [libraryData, viewerConfig],
  );
  const downloadExpiryBadge = useMemo(() => {
    switch (downloadExpirySummary.state) {
      case "upcoming":
        return {
          tone: "border-slate-700 bg-slate-950/80 text-slate-300",
          label: `Next download expiry ${formatDateTime(downloadExpirySummary.referenceMs)}`,
        };
      case "expiring":
        return {
          tone: "border-amber-500/30 bg-amber-500/10 text-amber-200",
          label: `Next download expiry ${formatDateTime(downloadExpirySummary.referenceMs)}`,
        };
      case "partialExpired":
        return {
          tone: "border-rose-500/30 bg-rose-500/10 text-rose-200",
          label: `Some downloads expired · next expiry ${formatDateTime(downloadExpirySummary.referenceMs)}`,
        };
      case "allExpired":
        return {
          tone: "border-rose-500/30 bg-rose-500/10 text-rose-200",
          label: `All known downloads expired ${formatDateTime(downloadExpirySummary.referenceMs)}`,
        };
      case "unknown":
      default:
        return {
          tone: "border-slate-700 bg-slate-950/80 text-slate-300",
          label: "Download expiry unknown",
        };
    }
  }, [downloadExpirySummary]);
  const showLibraryContext = Boolean(
    libraryStatus?.exists && libraryData && !isCurrentSalesRoute,
  );
  const showUrgentKeyBanner =
    showLibraryContext &&
    urgentKeysSummary.openActionCount > 0 &&
    (location.pathname === "/" || location.pathname === "/steam-keys");

  // Close mobile menu on navigate
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Reset the visible page to the top when switching routes so long-page scroll
  // positions do not carry over between menu selections.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300",
          collapsed ? "w-[60px]" : "w-64",
          // Mobile handling: off-screen by default, on-screen if open
          "-translate-x-full md:translate-x-0",
          mobileMenuOpen && "translate-x-0",
        )}>
        <div
          className={cn(
            "flex h-16 items-center border-b border-slate-800 px-4",
            collapsed ? "justify-center" : "justify-between",
          )}>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight text-white">
                HB Library Viewer
              </span>
              <span className="block truncate text-xs text-slate-400">
                Captured Humble Bundle workspace
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}>
            {collapsed ?
              <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(false)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-4">
            {visibleSidebarGroups.map((group) => (
              <div key={group.heading} className="space-y-1">
                {!collapsed && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {group.heading}
                  </p>
                )}
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    badge={
                      (
                        item.to === "/expiring-keys" &&
                        urgentKeysSummary.openActionCount > 0
                      ) ?
                        formatNumber(urgentKeysSummary.openActionCount)
                      : undefined
                    }
                    collapsed={collapsed}
                  />
                ))}
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          collapsed ?
            "md:ml-[60px] md:w-[calc(100%-60px)]"
          : "md:ml-64 md:w-[calc(100%-16rem)]",
        )}>
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-2.5 backdrop-blur md:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">
              Workspace
            </p>
            <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
              <h1 className="truncate text-base font-semibold text-white md:text-lg">
                {routeMeta.title}
              </h1>
              <p className="hidden truncate text-xs text-slate-400 xl:block">
                {routeMeta.subtitle}
              </p>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-5">
          {shouldGate ?
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-6 text-slate-100">
              <h2 className="text-xl font-semibold">Library data not found</h2>
              <p className="mt-2 text-sm text-slate-300">
                The viewer could not find a library file at
                <span className="mx-1 font-semibold text-slate-100">
                  {libraryStatus?.current_path}
                </span>
                . Run a new capture or select an existing file to continue.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild size="sm">
                  <Link to="/setup">Open setup</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/commands">Open command center</Link>
                </Button>
              </div>
            </div>
          : <div className="space-y-4">
              {showLibraryContext && (
                <section className="rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 shadow-sm shadow-black/20">
                  <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                          Active library
                        </span>
                        <span className="truncate text-sm font-medium text-slate-100">
                          {currentLibraryName}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {libraryStatus?.current_path}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-slate-300">
                        Captured {capturedLabel}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 ${downloadExpiryBadge.tone}`}>
                        {downloadExpiryBadge.label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {[
                      {
                        label: "Products",
                        value: formatNumber(libraryTotals.totalProducts),
                      },
                      {
                        label: "Subproducts",
                        value: formatNumber(libraryTotals.totalSubproducts),
                      },
                      {
                        label: "Files",
                        value: formatNumber(libraryTotals.totalFiles),
                      },
                      {
                        label: "Keys",
                        value: formatNumber(libraryTotals.totalKeys),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex min-w-[132px] flex-1 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 sm:flex-none">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {item.label}
                        </p>
                        <p className="shrink-0 text-base font-semibold text-white">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {showUrgentKeyBanner && (
                <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 shadow-sm shadow-black/20">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-amber-200">
                        <AlertTriangle className="h-4 w-4" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                          Expiring key warning
                        </p>
                      </div>
                      <p className="mt-1 text-sm font-medium text-white">
                        {formatNumber(urgentKeysSummary.openActionCount)}{" "}
                        unexpired key
                        {urgentKeysSummary.openActionCount === 1 ?
                          ""
                        : "s"}{" "}
                        still need attention.
                      </p>
                      <p className="mt-1 text-xs text-amber-50/90">
                        {formatNumber(urgentKeysSummary.openActionCount)} expire
                        within {urgentKeysSummary.thresholdDays} days
                        {urgentKeysSummary.nextExpiringDaysRemaining !== null ?
                          ` · next closes in ${urgentKeysSummary.nextExpiringDaysRemaining} day${urgentKeysSummary.nextExpiringDaysRemaining === 1 ? "" : "s"}`
                        : ""}
                        .
                        {urgentKeysSummary.expiredReferenceCount > 0 && (
                          <>
                            {" "}
                            Expired rows remain on the Expiring page as
                            reference only (
                            {formatNumber(
                              urgentKeysSummary.expiredReferenceCount,
                            )}
                            ).
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/expiring-keys">Review expiring keys</Link>
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </div>
          }
        </div>
      </main>
    </div>
  );
}
