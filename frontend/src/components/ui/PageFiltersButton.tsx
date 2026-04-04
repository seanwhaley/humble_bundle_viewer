import { SlidersHorizontal } from "lucide-react";

import { Badge } from "./badge";
import { Button } from "./button";

export default function PageFiltersButton({
  activeCount,
  expanded,
  label = "Filters",
  onClick,
}: {
  activeCount?: number;
  expanded: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={expanded ? "secondary" : "outline"}
      size="sm"
      className="h-8 gap-2 text-xs"
      aria-expanded={expanded}
      onClick={onClick}>
      <SlidersHorizontal className="h-4 w-4" />
      {label}
      {(activeCount ?? 0) > 0 && (
        <Badge variant="surface" size="tiny" casing="ui">
          {activeCount}
        </Badge>
      )}
    </Button>
  );
}
