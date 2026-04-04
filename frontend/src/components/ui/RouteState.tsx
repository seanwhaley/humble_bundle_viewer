/**
 * Shared loading and error states for viewer routes.
 */
import { Loader2 } from "lucide-react";

import {
  ROUTE_ERROR_MESSAGE_CLASS,
  ROUTE_LOADING_CONTAINER_CLASS,
  ROUTE_LOADING_CONTENT_CLASS,
  ROUTE_LOADING_ICON_CLASS,
  ROUTE_LOADING_PULSE_DOT_CLASS,
} from "../../styles/page";

export function RouteLoadingState({
  label = "Loading view…",
  variant = "spinner",
}: {
  label?: string;
  variant?: "spinner" | "pulse";
}) {
  return (
    <div className={ROUTE_LOADING_CONTAINER_CLASS}>
      <div className={ROUTE_LOADING_CONTENT_CLASS}>
        {variant === "pulse" ?
          <span className={ROUTE_LOADING_PULSE_DOT_CLASS} />
        : <Loader2 className={ROUTE_LOADING_ICON_CLASS} />}
        <span>{label}</span>
      </div>
    </div>
  );
}

export function RouteErrorState({ message }: { message: string }) {
  return <div className={ROUTE_ERROR_MESSAGE_CLASS}>{message}</div>;
}
