/**
 * Shared frame for chart surfaces and empty states.
 */
import { type ReactNode } from "react";

import { cn } from "../../lib/utils";
import {
  CHART_EMPTY_STATE_CLASS,
  CHART_PANEL_CLASS,
  CHART_TITLE_CLASS,
} from "../../styles/roles";

interface ChartFrameProps {
  title?: string;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  emptyMessage?: string;
  emptyHeightClassName?: string;
}

export default function ChartFrame({
  title,
  children,
  className,
  titleClassName,
  emptyMessage,
  emptyHeightClassName = "h-[240px]",
}: ChartFrameProps) {
  return (
    <div className={cn(CHART_PANEL_CLASS, className)}>
      {title && (
        <div className={cn(CHART_TITLE_CLASS, titleClassName)}>{title}</div>
      )}
      {emptyMessage ?
        <div className={cn(CHART_EMPTY_STATE_CLASS, emptyHeightClassName)}>
          {emptyMessage}
        </div>
      : children}
    </div>
  );
}
