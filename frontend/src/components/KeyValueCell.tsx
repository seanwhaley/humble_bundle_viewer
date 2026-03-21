/**
 * KeyValueCell
 *
 * Shared table cell renderer for sensitive key values. It keeps values hidden
 * by default and reveals/copies them on demand to reduce accidental exposure.
 */
import { useState, type MouseEvent } from "react";
import { Copy } from "lucide-react";

import { Button } from "./ui/button";

export interface KeyValueCellProps {
  /** Key value to reveal; undefined renders a placeholder. */
  value?: string;
  /** Label used when the value is hidden. */
  revealLabel?: string;
}

export default function KeyValueCell({
  value,
  revealLabel = "Reveal",
}: KeyValueCellProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) {
    return <span>–</span>;
  }

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={revealed ? "outline" : "default"}
        onClick={() => setRevealed((prev) => !prev)}
        className="h-7 text-xs"
      >
        {revealed ? value : revealLabel}
      </Button>
      {revealed && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy key"}
        >
          <Copy className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
