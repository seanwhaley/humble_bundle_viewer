/**
 * Product name cell renderer that handles truncation and bundle abbreviations.
 */
import { useState } from "react";
import { getCompactBundleName } from "../data/selectors";
import { Tooltip } from "./ui/tooltip";

/**
 * Condenses long bundle names and shows full text on hover.
 */
export const ProductCell = ({ getValue }: { getValue: () => any }) => {
  const [isTruncated, setIsTruncated] = useState(false);
  const val = getValue() as string;

  // Guard against null/undefined
  if (!val) return <span className="text-muted-foreground">–</span>;

  const compact = getCompactBundleName(val);

  if (compact.isAbbreviated) {
    return (
      <Tooltip
        content={
          <div className="font-normal text-xs">
            <span className="font-bold block text-muted-foreground mb-0.5 uppercase tracking-wider">
              {compact.prefix}
            </span>
            {compact.full}
          </div>
        }
      >
        <span className="block max-w-full whitespace-normal break-words">
          <span className="text-muted-foreground font-medium cursor-help border-b border-dotted border-muted-foreground/50">
            {compact.abbreviation}
          </span>
          <span className="text-muted-foreground font-normal">: </span>
          <span className="font-medium">{compact.suffix}</span>
        </span>
      </Tooltip>
    );
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
     const target = e.currentTarget;
     setIsTruncated(target.scrollWidth > target.clientWidth);
  };

  return (
    <Tooltip content={isTruncated ? val : null}>
      <span 
        className="font-medium block max-w-full whitespace-normal break-words" 
        onMouseEnter={handleMouseEnter}
      >
        {val}
      </span>
    </Tooltip>
  );
};
