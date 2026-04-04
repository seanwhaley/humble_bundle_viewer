/**
 * Shared page introduction block for route-level headings.
 */
import type { ElementType, ReactNode } from "react";

import { cn } from "../../lib/utils";
import {
  PAGE_INTRO_CLASS,
  PAGE_INTRO_DESCRIPTION_CLASS,
  PAGE_INTRO_TITLE_CLASS,
} from "../../styles/page";

export function PageIntro({
  title,
  description,
  titleAs: TitleTag = "h2",
  className,
  titleClassName,
  descriptionClassName,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  titleAs?: ElementType;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn(PAGE_INTRO_CLASS, className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <TitleTag className={cn(PAGE_INTRO_TITLE_CLASS, titleClassName)}>
            {title}
          </TitleTag>
          {description && (
            <p className={cn(PAGE_INTRO_DESCRIPTION_CLASS, descriptionClassName)}>
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
    </div>
  );
}
