/**
 * Compact summary strip for key inventory routes.
 */
import {
  METRIC_STRIP_CARD_CLASS,
  METRIC_STRIP_GRID_CLASS,
  METRIC_STRIP_HINT_CLASS,
  METRIC_STRIP_VALUE_CLASS,
  SECTION_EYEBROW_CLASS,
} from "../styles/roles";

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
    <div className={METRIC_STRIP_GRID_CLASS}>
      {items.map((item) => (
        <div key={item.label} className={METRIC_STRIP_CARD_CLASS}>
          <p className={SECTION_EYEBROW_CLASS}>{item.label}</p>
          <p className={METRIC_STRIP_VALUE_CLASS}>{item.value}</p>
          <p className={METRIC_STRIP_HINT_CLASS}>{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
