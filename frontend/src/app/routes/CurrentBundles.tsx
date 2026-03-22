/**
 * Legacy route shim for the original current-bundles page.
 */
import { Navigate } from "react-router-dom";

export default function CurrentBundles() {
  return <Navigate to="/venue/bundles/games" replace />;
}
