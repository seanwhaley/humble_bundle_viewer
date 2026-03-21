/**
 * Current sales route for reviewing the current Humble Choice month against the local library.
 */
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import { useCurrentChoiceReport, useCurrentChoiceStatus } from "../../data/api";
import { formatNumber } from "../../utils/format";

const formatPercent = (value: number) =>
  value % 1 === 0 ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;

export default function VenueChoice() {
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

  if (isStatusLoading || (status?.report_exists && isReportLoading)) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load current Choice status.
      </div>
    );
  }

  if (status?.report_exists && reportError) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load the current Choice overlap report.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm shadow-black/20">
        <div className="flex flex-wrap gap-2">
          {[
            {
              label: "Month",
              value: report?.month_label || status?.month_label || "Current",
            },
            {
              label: "Games",
              value: formatNumber(
                report?.total_titles ?? status?.game_count ?? 0,
              ),
            },
            { label: "New", value: formatNumber(report?.new_titles ?? 0) },
            {
              label: "New share",
              value: formatPercent(report?.new_percent ?? 0),
            },
            { label: "Price", value: report?.price_label || "Choice plan" },
          ].map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300">
              <span>{item.label}:</span>{" "}
              <span className="font-semibold text-slate-100">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      {!status?.report_exists && !report ?
        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
          <h3 className="text-xl font-semibold text-white">
            No current Choice report yet
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Run the current sales Choice analysis from Command Center to capture
            the live membership page and compare this month’s games against your
            library.
          </p>
        </section>
      : <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">
                {report?.month_label || status?.month_label || "Current"} Choice
                lineup
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Review each game in the current month and see whether the
                backend matched it against your captured library.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {report?.price_label && (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
                  {report.price_label}
                </span>
              )}
              {report?.page_url && (
                <Button asChild size="sm" variant="outline">
                  <a href={report.page_url} target="_blank" rel="noreferrer">
                    Open Choice page
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
            <table className="min-w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-900/80 text-slate-300">
                <tr>
                  <th className="w-[38%] px-4 py-3 font-medium">Game</th>
                  <th className="w-[18%] px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">
                    Matched library titles
                  </th>
                </tr>
              </thead>
              <tbody>
                {(report?.games || []).map((game) => (
                  <tr
                    key={game.title}
                    className="border-t border-slate-800 align-top">
                    <td className="px-4 py-4 text-white">{game.title}</td>
                    <td className="px-4 py-4 text-slate-200">
                      <span
                        className={
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium " +
                          (game.owned ?
                            "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : "border-indigo-500/40 bg-indigo-500/10 text-indigo-200")
                        }>
                        {game.owned ? "Already owned" : "New this month"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {game.matched_library_titles.length ?
                        game.matched_library_titles.join("; ")
                      : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  );
}
