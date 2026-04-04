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
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { RouteLoadingState } from "../../components/ui/RouteState";
import PaneHeader from "../../components/ui/PaneHeader";
import {
  useOptionalLibraryData,
  useLibraryStatus,
  useViewerConfig,
} from "../../data/api";
import { useRestoreStoredLibraryPath } from "../../data/librarySelection";
import {
  buildExpiringKeyActionSummary,
  collectProductDownloads,
  computeLibraryTotals,
  getDownloadRouteVisibility,
  type DownloadRouteVisibility,
} from "../../data/selectors";
import { formatDateTime, formatNumber } from "../../utils/format";
import { getLinkExpirationSummary } from "../../utils/downloads";
import { PageHeaderProvider, usePageHeaderState } from "./PageHeaderContext";
import {
  COMPACT_META_CLASS,
  LIBRARY_CONTEXT_METRICS_CLASS,
  LIBRARY_CONTEXT_METRIC_CLASS,
  LIBRARY_CONTEXT_PANEL_CLASS,
  METRIC_VALUE_CLASS,
  ROUTE_MESSAGE_INFO_CLASS,
  SECTION_EYEBROW_CLASS,
  TRUNCATED_TITLE_TEXT_CLASS,
} from "../../styles/roles";
import {
  APP_CONTENT_PAD_CLASS,
  APP_CONTENT_STACK_CLASS,
  APP_DESKTOP_ONLY_ACTION_CLASS,
  APP_HEADER_ACTIONS_CLASS,
  APP_HEADER_CLASS,
  APP_HEADER_EYEBROW_CLASS,
  APP_HEADER_IDENTITY_CLASS,
  APP_ICON_CLASS,
  APP_HEADER_SUBTITLE_CLASS,
  APP_HEADER_TITLE_BLOCK_CLASS,
  APP_HEADER_TITLE_CLASS,
  APP_HEADER_TITLE_ROW_CLASS,
  APP_MAIN_CLASS,
  APP_MAIN_COLLAPSED_CLASS,
  APP_MAIN_EXPANDED_CLASS,
  APP_MOBILE_ONLY_ACTION_CLASS,
  APP_MOBILE_BACKDROP_CLASS,
  APP_SHELL_CLASS,
  APP_SIDEBAR_BRAND_CLASS,
  APP_SIDEBAR_BRAND_SUBTITLE_CLASS,
  APP_SIDEBAR_BRAND_TITLE_CLASS,
  APP_SIDEBAR_CLASS,
  APP_SIDEBAR_GROUP_CLASS,
  APP_SIDEBAR_GROUP_HEADING_CLASS,
  APP_SIDEBAR_GROUPS_CLASS,
  APP_SIDEBAR_HEADER_CLASS,
  APP_SIDEBAR_HEADER_COLLAPSED_CLASS,
  APP_SIDEBAR_HEADER_EXPANDED_CLASS,
  APP_SIDEBAR_NAV_CLASS,
  APP_SIDEBAR_OFFSCREEN_CLASS,
  APP_SIDEBAR_ONSCREEN_CLASS,
  APP_SIDEBAR_WIDTH_COLLAPSED_CLASS,
  APP_SIDEBAR_WIDTH_EXPANDED_CLASS,
  SIDEBAR_ITEM_BADGE_CLASS,
  SIDEBAR_ITEM_DOT_CLASS,
  SIDEBAR_ITEM_LABEL_CLASS,
  getSidebarItemClass,
} from "../../styles/navigation";
import {
  DOWNLOAD_EXPIRY_BADGE_TONE_CLASS,
  DOWNLOAD_EXPIRY_BADGE_CLASS,
  WARNING_BANNER_CLASS,
  WARNING_BANNER_BODY_CLASS,
  WARNING_BANNER_DETAIL_CLASS,
  WARNING_BANNER_HEADER_CLASS,
  WARNING_BANNER_LAYOUT_CLASS,
  WARNING_BANNER_TITLE_CLASS,
} from "../../styles/status";
import {
  PAGE_ACTION_ROW_CLASS,
  ROUTE_MESSAGE_BODY_CLASS,
  ROUTE_MESSAGE_EMPHASIS_CLASS,
  ROUTE_MESSAGE_TITLE_CLASS,
} from "../../styles/page";

type SidebarNavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
};

type RouteMeta = {
  eyebrow?: string | null;
  title: string;
  subtitle: string;
  hideLibraryContext?: boolean;
};

const SIDEBAR_GROUPS: Array<{ heading: string; items: SidebarNavItem[] }> = [
  {
    heading: "Viewer",
    items: [{ to: "/", icon: LayoutDashboard, label: "Home" }],
  },
  {
    heading: "Current sales",
    items: [
      { to: "/sales", icon: LayoutDashboard, label: "Sales Overview" },
      { to: "/sales/choice", icon: Sparkles, label: "Current Choice" },
      { to: "/sales/games", icon: Gamepad2, label: "Game Bundles" },
      { to: "/sales/books", icon: BookOpen, label: "Book Bundles" },
      {
        to: "/sales/software",
        icon: Monitor,
        label: "Software Bundles",
      },
    ],
  },
  {
    heading: "Purchases",
    items: [{ to: "/library/purchases", icon: ShoppingCart, label: "Purchases" }],
  },
  {
    heading: "Downloads",
    items: [
      { to: "/library/ebooks", icon: BookOpen, label: "eBooks" },
      { to: "/library/audiobooks", icon: Headphones, label: "Audiobooks" },
      { to: "/library/videos", icon: Film, label: "Videos" },
      { to: "/library/software", icon: Monitor, label: "Software" },
      { to: "/library/other-downloads", icon: Download, label: "Other" },
    ],
  },
  {
    heading: "Keys",
    items: [
      { to: "/library/expiring-keys", icon: AlertTriangle, label: "Expiring" },
      { to: "/library/steam-keys", icon: Key, label: "Steam" },
      { to: "/library/other-keys", icon: Key, label: "Other Keys" },
    ],
  },
  {
    heading: "Tools",
    items: [
      { to: "/setup", icon: Plug, label: "Setup" },
      { to: "/command-center", icon: Terminal, label: "Command Center" },
      { to: "/schema", icon: Network, label: "Schema" },
    ],
  },
];

const DOWNLOAD_ROUTE_VISIBILITY_BY_PATH: Record<
  string,
  keyof DownloadRouteVisibility
> = {
  "/library/other-downloads": "downloads",
  "/library/software": "software",
  "/library/videos": "videos",
  "/library/ebooks": "ebooks",
  "/library/audiobooks": "audiobooks",
};

const DEFAULT_ROUTE_META: RouteMeta = {
  eyebrow: "Workspace",
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

const getRelativeSnapshotLabel = (value?: string | null) => {
  if (!value) {
    return "Snapshot unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Snapshot saved";
  }

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfSavedDay = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfSavedDay.getTime()) /
      (24 * 60 * 60 * 1000),
  );

  if (diffDays <= 0) {
    return "Captured today";
  }

  if (diffDays === 1) {
    return "Captured yesterday";
  }

  return `Captured ${diffDays} days old`;
};

const getRouteMeta = (pathname: string): RouteMeta => {
  const categoryMatch = matchPath("/library/category/:category", pathname);
  if (categoryMatch) {
    const category = humanizeSlug(categoryMatch.params.category);
    return {
      title: `${category} category`,
      subtitle: "Review purchases and content scoped to this category.",
    };
  }

  const salesBundleMatch = matchPath("/sales/:bundleType", pathname);
  if (
    salesBundleMatch &&
    ["games", "books", "software"].includes(
      salesBundleMatch.params.bundleType || "",
    )
  ) {
    const bundleType = salesBundleMatch.params.bundleType;
    const bundleTypeLabel =
      bundleType === "games" ? "Game Bundles"
      : bundleType === "books" ? "Book Bundles"
      : bundleType === "software" ? "Software Bundles"
      : `${humanizeSlug(bundleType)} bundles`;
    return {
      title: bundleTypeLabel,
      subtitle:
        "Review live Humble bundle tiers for this current sales category, with tier overlap, ownership, pricing, and expiry signals from the shared backend analysis.",
    };
  }

  switch (pathname) {
    case "/sales":
      return {
        title: "Sales Overview",
        subtitle:
          "Compare the current Choice package and live games, books, and software bundles from one filterable dashboard.",
      };
    case "/":
      return {
        eyebrow: null,
        title: "Home",
        subtitle:
          "Start with the library in scope, then scan live bundles and this month’s Choice before moving into deeper library workflows.",
        hideLibraryContext: true,
      };
    case "/library/purchases":
      return {
        title: "Purchases",
        subtitle:
          "Review what each purchase contains and open related downloads, keys, and media.",
        hideLibraryContext: true,
      };
    case "/sales/choice":
      return {
        title: "Current Choice",
        subtitle:
          "Compare this month’s Humble Choice lineup against your captured library using the saved backend report.",
      };
    case "/library/other-downloads":
      return {
        title: "Other downloads",
        subtitle:
          "Browse direct-download content that is not already covered by the dedicated media pages.",
        hideLibraryContext: true,
      };
    case "/library/software":
      return {
        title: "Software",
        subtitle:
          "Group software installers by title and platform/file-type variant.",
        hideLibraryContext: true,
      };
    case "/library/videos":
      return {
        title: "Videos",
        subtitle: "Review video downloads grouped by title and file type.",
        hideLibraryContext: true,
      };
    case "/library/ebooks":
      return {
        title: "eBooks",
        subtitle:
          "Find ebook formats, compare file types, and sync selected titles locally.",
        hideLibraryContext: true,
      };
    case "/library/audiobooks":
      return {
        title: "Audiobooks",
        subtitle:
          "Review audiobook formats and sync supported titles to a local folder.",
        hideLibraryContext: true,
      };
    case "/library/steam-keys":
      return {
        title: "Steam keys",
        subtitle:
          "Inspect Steam redemption inventory and jump into reveal or follow-up workflows.",
        hideLibraryContext: true,
      };
    case "/library/other-keys":
      return {
        title: "Other Keys",
        subtitle:
          "Review Other Keys redemption inventory, including Epic, GOG, and launcher-specific claim types.",
        hideLibraryContext: true,
      };
    case "/library/expiring-keys":
      return {
        title: "Expiring keys",
        subtitle:
          "Focus on keys that may need attention before their redemption window closes.",
        hideLibraryContext: true,
      };
    case "/setup":
      return {
        title: "Library setup",
        subtitle:
          "Capture a fresh library file or point the viewer at an existing artifact.",
      };
    case "/command-center":
      return {
        title: "Command Center",
        subtitle:
          "Run guided workflows and CLI-backed actions without leaving the viewer.",
      };
    case "/schema":
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
  icon: LucideIcon;
  label: string;
  badge?: string;
  collapsed: boolean;
}) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => getSidebarItemClass(isActive, collapsed)}>
      <Icon className={APP_ICON_CLASS} />
      {!collapsed && (
        <>
          <span className={SIDEBAR_ITEM_LABEL_CLASS}>{label}</span>
          {badge && (
            <span className={SIDEBAR_ITEM_BADGE_CLASS}>
              {badge}
            </span>
          )}
        </>
      )}
      {collapsed && badge && (
        <span className={SIDEBAR_ITEM_DOT_CLASS} />
      )}
    </NavLink>
  );
};

/**
 * Suspense fallback for lazy-loaded routes.
 */
const RouteFallback = () => <RouteLoadingState variant="pulse" />;

/**
 * Layout shell that renders the sidebar and the routed content.
 */
export default function Layout() {
  return (
    <PageHeaderProvider>
      <LayoutShell />
    </PageHeaderProvider>
  );
}

/**
 * Layout shell that consumes route-owned page-header actions.
 */
function LayoutShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { data: libraryStatus } = useLibraryStatus();
  const { data: viewerConfig } = useViewerConfig();
  const { actions } = usePageHeaderState();

  const isSetupRoute = location.pathname.startsWith("/setup");
  const isCommandsRoute = location.pathname.startsWith("/command-center");
  const isHomeRoute = location.pathname === "/";
  const isCurrentSalesRoute =
    location.pathname === "/sales" || location.pathname.startsWith("/sales/");
  const { isRestoring } = useRestoreStoredLibraryPath(libraryStatus);
  const isLibraryOptionalRoute =
    isSetupRoute || isCommandsRoute || isCurrentSalesRoute || isHomeRoute;
  const shouldGate =
    libraryStatus &&
    !libraryStatus.exists &&
    !isLibraryOptionalRoute &&
    !isRestoring;
  const routeMeta = useMemo(
    () => getRouteMeta(location.pathname),
    [location.pathname],
  );
  const headerEyebrow =
    routeMeta.eyebrow === undefined ?
      DEFAULT_ROUTE_META.eyebrow
    : routeMeta.eyebrow;
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
  const capturedLabel = getRelativeSnapshotLabel(libraryData?.captured_at);
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
          tone: DOWNLOAD_EXPIRY_BADGE_TONE_CLASS.upcoming,
          label: "Download expiry tracked",
        };
      case "expiring":
        return {
          tone: DOWNLOAD_EXPIRY_BADGE_TONE_CLASS.expiring,
          label: "Download links expiring soon",
        };
      case "partialExpired":
        return {
          tone: DOWNLOAD_EXPIRY_BADGE_TONE_CLASS.expired,
          label: "Some downloads expired",
        };
      case "allExpired":
        return {
          tone: DOWNLOAD_EXPIRY_BADGE_TONE_CLASS.expired,
          label: "All known downloads expired",
        };
      case "unknown":
      default:
        return {
          tone: DOWNLOAD_EXPIRY_BADGE_TONE_CLASS.unknown,
          label: "Download expiry unknown",
        };
    }
  }, [downloadExpirySummary]);
  const showLibraryContext = Boolean(
    libraryStatus?.exists &&
    libraryData &&
    !isCurrentSalesRoute &&
    !routeMeta.hideLibraryContext,
  );
  const showUrgentKeyBanner =
    showLibraryContext &&
    urgentKeysSummary.openActionCount > 0 &&
    (location.pathname === "/" || location.pathname === "/library/steam-keys");

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
    <div className={APP_SHELL_CLASS}>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className={APP_MOBILE_BACKDROP_CLASS}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          APP_SIDEBAR_CLASS,
          collapsed ? APP_SIDEBAR_WIDTH_COLLAPSED_CLASS : APP_SIDEBAR_WIDTH_EXPANDED_CLASS,
          // Mobile handling: off-screen by default, on-screen if open
          APP_SIDEBAR_OFFSCREEN_CLASS,
          mobileMenuOpen && APP_SIDEBAR_ONSCREEN_CLASS,
        )}>
        <div
          className={cn(
            APP_SIDEBAR_HEADER_CLASS,
            collapsed ? APP_SIDEBAR_HEADER_COLLAPSED_CLASS : APP_SIDEBAR_HEADER_EXPANDED_CLASS,
          )}>
          {!collapsed && (
            <div className={APP_SIDEBAR_BRAND_CLASS}>
              <span className={APP_SIDEBAR_BRAND_TITLE_CLASS}>
                HB Library Viewer
              </span>
              <span className={APP_SIDEBAR_BRAND_SUBTITLE_CLASS}>
                Captured Humble Bundle workspace
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={APP_DESKTOP_ONLY_ACTION_CLASS}
            onClick={() => setCollapsed(!collapsed)}>
            {collapsed ?
              <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={APP_MOBILE_ONLY_ACTION_CLASS}
            onClick={() => setMobileMenuOpen(false)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <nav className={APP_SIDEBAR_NAV_CLASS}>
          <div className={APP_SIDEBAR_GROUPS_CLASS}>
            {visibleSidebarGroups.map((group) => (
              <div key={group.heading} className={APP_SIDEBAR_GROUP_CLASS}>
                {!collapsed && (
                  <p className={APP_SIDEBAR_GROUP_HEADING_CLASS}>
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
                        item.to === "/library/expiring-keys" &&
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
          APP_MAIN_CLASS,
          collapsed ? APP_MAIN_COLLAPSED_CLASS : APP_MAIN_EXPANDED_CLASS,
        )}>
        <header className={APP_HEADER_CLASS}>
          <div className={APP_HEADER_IDENTITY_CLASS}>
            <Button
              variant="ghost"
              size="icon"
              className={APP_MOBILE_ONLY_ACTION_CLASS}
              onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className={APP_HEADER_TITLE_BLOCK_CLASS}>
              {headerEyebrow && (
                <p className={APP_HEADER_EYEBROW_CLASS}>
                  {headerEyebrow}
                </p>
              )}
              <div className={APP_HEADER_TITLE_ROW_CLASS}>
                <h1 className={APP_HEADER_TITLE_CLASS}>
                  {routeMeta.title}
                </h1>
                <p className={APP_HEADER_SUBTITLE_CLASS}>
                  {routeMeta.subtitle}
                </p>
              </div>
            </div>
          </div>
          {actions && <div className={APP_HEADER_ACTIONS_CLASS}>{actions}</div>}
        </header>

        <div className={APP_CONTENT_PAD_CLASS}>
          {isRestoring ?
            <RouteFallback />
          : shouldGate ?
            <div className={ROUTE_MESSAGE_INFO_CLASS}>
              <h2 className={ROUTE_MESSAGE_TITLE_CLASS}>Library data not found</h2>
              <p className={ROUTE_MESSAGE_BODY_CLASS}>
                The viewer could not find a library file at
                <span className={ROUTE_MESSAGE_EMPHASIS_CLASS}>
                  {libraryStatus?.current_path}
                </span>
                . Run a new capture or select an existing file to continue.
              </p>
              <div className={PAGE_ACTION_ROW_CLASS}>
                <Button asChild size="sm">
                  <Link to="/setup">Open setup</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/command-center">Open command center</Link>
                </Button>
              </div>
            </div>
          : <div className={APP_CONTENT_STACK_CLASS}>
              {showLibraryContext && (
                <section className={LIBRARY_CONTEXT_PANEL_CLASS}>
                  <PaneHeader
                    title={
                      <span
                        className={TRUNCATED_TITLE_TEXT_CLASS}
                        data-doc-id="layout-active-library-name">
                        {currentLibraryName}
                      </span>
                    }
                    titleAs="div"
                    titleClassName="text-sm font-medium"
                    description={libraryStatus?.current_path}
                    descriptionClassName="truncate text-xs"
                    eyebrow={
                      <Badge variant="success" size="compact" casing="ui">
                        Active library
                      </Badge>
                    }
                    topRight={
                      <>
                        <Badge
                          variant="neutral"
                          size="compact"
                          casing="ui"
                          id="layout-captured-at">
                          {capturedLabel}
                        </Badge>
                        <span
                          className={cn(
                            DOWNLOAD_EXPIRY_BADGE_CLASS,
                            downloadExpiryBadge.tone,
                          )}
                          data-doc-id="layout-download-expiry-label">
                          {downloadExpiryBadge.label}
                        </span>
                      </>
                    }
                    topRightClassName={COMPACT_META_CLASS}
                  />

                  <div className={LIBRARY_CONTEXT_METRICS_CLASS}>
                    {[
                      {
                        id: "products",
                        label: "Products",
                        value: formatNumber(libraryTotals.totalProducts),
                      },
                      {
                        id: "subproducts",
                        label: "Subproducts",
                        value: formatNumber(libraryTotals.totalSubproducts),
                      },
                      {
                        id: "files",
                        label: "Files",
                        value: formatNumber(libraryTotals.totalFiles),
                      },
                      {
                        id: "keys",
                        label: "Keys",
                        value: formatNumber(libraryTotals.totalKeys),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={LIBRARY_CONTEXT_METRIC_CLASS}>
                        <p className={SECTION_EYEBROW_CLASS}>
                          {item.label}
                        </p>
                        <p
                          className={METRIC_VALUE_CLASS}
                          data-doc-id={`layout-library-total-${item.id}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {showUrgentKeyBanner && (
                <section className={WARNING_BANNER_CLASS}>
                  <div className={WARNING_BANNER_LAYOUT_CLASS}>
                    <div>
                      <div className={WARNING_BANNER_HEADER_CLASS}>
                        <AlertTriangle className="h-4 w-4" />
                        <p className={WARNING_BANNER_TITLE_CLASS}>
                          Expiring key warning
                        </p>
                      </div>
                      <p className={WARNING_BANNER_BODY_CLASS}>
                        {formatNumber(urgentKeysSummary.openActionCount)}{" "}
                        unexpired key
                        {urgentKeysSummary.openActionCount === 1 ?
                          ""
                        : "s"}{" "}
                        still need attention.
                      </p>
                      <p className={WARNING_BANNER_DETAIL_CLASS}>
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

                    <div className={PAGE_ACTION_ROW_CLASS}>
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/library/expiring-keys">Review expiring keys</Link>
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
