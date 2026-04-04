/**
 * Current sales route for reviewing the current Humble Choice month against the local library.
 */
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import StatTile from "../../components/StatTile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import PaneHeader from "../../components/ui/PaneHeader";
import {
  RouteErrorState,
  RouteLoadingState,
} from "../../components/ui/RouteState";
import {
  tableHeaderCellClass,
  tableHeaderSurfaceClass,
} from "../../components/ui/table";
import { useCurrentChoiceReport, useCurrentChoiceStatus } from "../../data/api";
import { formatNumber } from "../../utils/format";
import { SECTION_CARD_CLASS, TABLE_FRAME_CLASS } from "../../styles/roles";

const formatPercent = (value: number) =>
  value % 1 === 0 ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;

type ChoiceQuickFocus = "all" | "new" | "owned";

const CHOICE_QUICK_FOCUS_OPTIONS: Array<{
  id: ChoiceQuickFocus;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All games",
    description: "Review the full current month lineup.",
  },
  {
    id: "new",
    label: "New to you",
    description: "Show only games you do not already own.",
  },
  {
    id: "owned",
    label: "Already owned",
    description: "Show games that already overlap with your library.",
  },
];

export default function CurrentChoice() {
  const [quickFocus, setQuickFocus] = useState<ChoiceQuickFocus>("all");
  const {
    data: status,
    isLoading: isStatusLoading,
    error: statusError,
  } = useCurrentChoiceStatus();
  const {
    data: report,
    isLoading: isReportLoading,
    error: reportError,
  } = useCurrentChoiceReport(status?.report_exists === true);

  const games = report?.games || [];
  const filteredGames = useMemo(() => {
    if (quickFocus === "new") {
      return games.filter((game) => !game.owned);
    }

    if (quickFocus === "owned") {
      return games.filter((game) => game.owned);
    }

    return games;
  }, [games, quickFocus]);

  const quickFocusCounts = useMemo(
    () => ({
      all: games.length,
      new: games.filter((game) => !game.owned).length,
      owned: games.filter((game) => game.owned).length,
    }),
    [games],
  );

  if (isStatusLoading || (status?.report_exists && isReportLoading)) {
    return <RouteLoadingState label="Loading current Choice…" />;
  }

  if (statusError) {
    return <RouteErrorState message="Failed to load current Choice status." />;
  }

  if (status?.report_exists && reportError) {
    return (
      <RouteErrorState message="Failed to load the current Choice overlap report." />
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6">
      <Card surface="panel">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Month",
              value: report?.month_label || status?.month_label || "Current",
              subtitle: "Current Choice billing month",
            },
            {
              label: "Games",
              value: formatNumber(
                report?.total_titles ?? status?.game_count ?? 0,
              ),
              subtitle: "Games in the current Choice lineup",
            },
            {
              label: "New",
              value: formatNumber(report?.new_titles ?? 0),
              subtitle: "Titles not already in your library",
            },
            {
              label: "New share",
              value: formatPercent(report?.new_percent ?? 0),
              subtitle: "Share of the lineup that is new to you",
            },
            {
              label: "Price",
              value: report?.price_label || "Choice plan",
              subtitle: "Current monthly plan price",
            },
          ].map((item) => (
            <StatTile
              key={`${item.label}-${item.value}`}
              label={item.label}
              value={item.value}
              subtitle={item.subtitle}
            />
          ))}
        </CardContent>
      </Card>

      {!status?.report_exists && !report ?
        <Card surface="panel">
          <CardHeader>
            <PaneHeader
              title="No current Choice report yet"
              titleClassName="text-xl"
              description="Run the current sales Choice analysis from Command Center to capture the live membership page and compare this month’s games against your library."
              descriptionClassName="max-w-2xl"
            />
          </CardHeader>
        </Card>
      : <Card surface="panel">
          <CardHeader className="space-y-4">
            <PaneHeader
              title={`${report?.month_label || status?.month_label || "Current"} Choice lineup`}
              titleClassName="text-xl"
              description="Review each game in the current month and see whether the backend matched it against your captured library."
              eyebrow={
                <Badge variant="info" size="compact" casing="ui">
                  Current Choice
                </Badge>
              }
              topRight={
                <>
                  {report?.price_label && (
                    <Badge variant="neutral">{report.price_label}</Badge>
                  )}
                  {report?.page_url && (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={report.page_url}
                        target="_blank"
                        rel="noreferrer">
                        Open Choice page
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </>
              }
              topRightClassName="items-center"
            />

            <div className="flex flex-wrap gap-2">
              {CHOICE_QUICK_FOCUS_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={quickFocus === option.id ? "secondary" : "outline"}
                  onClick={() => setQuickFocus(option.id)}>
                  {option.label} ({quickFocusCounts[option.id]})
                </Button>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              {
                CHOICE_QUICK_FOCUS_OPTIONS.find(
                  (option) => option.id === quickFocus,
                )?.description
              }
            </p>
          </CardHeader>

          <CardContent>
            <div className={TABLE_FRAME_CLASS}>
              <table className="min-w-full table-fixed border-collapse text-left text-sm text-card-foreground">
                <thead className={tableHeaderSurfaceClass}>
                  <tr>
                    <th className={`w-[38%] px-4 py-3 ${tableHeaderCellClass}`}>
                      Game
                    </th>
                    <th className={`w-[18%] px-4 py-3 ${tableHeaderCellClass}`}>
                      Status
                    </th>
                    <th className={`px-4 py-3 ${tableHeaderCellClass}`}>
                      Matched library titles
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.length === 0 ?
                    <tr className="align-top border-t border-border">
                      <td
                        className="px-4 py-4 text-muted-foreground"
                        colSpan={3}>
                        No games match this quick view. Switch back to All games
                        to review the full current Choice lineup.
                      </td>
                    </tr>
                  : filteredGames.map((game) => (
                      <tr
                        key={game.title}
                        className="align-top border-t border-border">
                        <td className="px-4 py-4 text-card-foreground">
                          {game.title}
                        </td>
                        <td className="px-4 py-4 text-card-foreground">
                          <Badge
                            variant={game.owned ? "success" : "info"}
                            size="compact"
                            casing="ui">
                            {game.owned ? "Already owned" : "New this month"}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {game.matched_library_titles.length ?
                            game.matched_library_titles.join("; ")
                          : "—"}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      }
    </div>
  );
}
