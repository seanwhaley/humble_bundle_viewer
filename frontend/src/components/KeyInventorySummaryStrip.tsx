/**
 * Compact summary strip for key inventory routes.
 */

interface KeyInventorySummaryItem {
  label: string;
  value: number;
  hint: string;
}

interface KeyInventorySummaryStripProps {
  items: KeyInventorySummaryItem[];
}

export default function KeyInventorySummaryStrip({
  items,
}: KeyInventorySummaryStripProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-sm shadow-black/10">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {item.label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {item.value}
          </p>
          <p className="mt-1 text-sm text-slate-400">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
