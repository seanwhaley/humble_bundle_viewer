/**
 * Data fetching hooks for the viewer API.
 */
import { useQuery } from "@tanstack/react-query";

import { LibraryData } from "./types";

export interface ViewerConfig {
  link_expiry_warning_hours: number;
  assume_revealed_keys_redeemed: boolean;
  ignore_revealed_status_for_expired_keys: boolean;
  ignore_revealed_status_for_unexpired_keys: boolean;
  managed_sync_max_parallel_downloads: number;
  managed_sync_manifest_history_entries: number;
}

export interface LibraryStatus {
  current_path: string;
  exists: boolean;
  default_save_dir: string;
  default_library_path: string;
}

export type CurrentBundleType = "games" | "books" | "software";

export interface CurrentBundleItem {
  title: string;
  price_label: string;
  price_value: number;
  price_kind: string;
  msrp_label: string | null;
  msrp_value: number | null;
  flavor_text: string | null;
  description: string | null;
}

export interface CurrentBundleTierOverlap {
  label: string;
  price_label: string;
  price_value: number;
  total_items: number;
  owned_items: number;
  new_items: number;
  owned_percent: number;
  missing_percent: number;
  added_items: number;
  added_owned_items: number;
  added_new_items: number;
  added_owned_percent: number;
  added_new_percent: number;
  added_titles: string[];
  added_owned_titles: string[];
  added_new_titles: string[];
  owned_titles: string[];
  new_titles: string[];
  msrp_total: number | null;
  msrp_known_items: number;
  savings_percent: number | null;
  value_multiple: number | null;
}

export interface CurrentBundleSummary {
  title: string;
  bundle_type: string;
  category: string;
  url: string;
  offer_ends_text: string | null;
  offer_ends_in_days: number | null;
  offer_ends_detail: string | null;
  items: CurrentBundleItem[];
  tiers: CurrentBundleTierOverlap[];
  top_tier_status: string;
  display_title: string | null;
  display_type: string | null;
  progression_summary: string | null;
}

export interface CurrentBundlesReport {
  generated_at: string;
  library_path: string;
  bundle_types: CurrentBundleType[];
  bundle_count: number;
  report_json_path: string;
  report_markdown_path: string;
  bundles: CurrentBundleSummary[];
}

export interface CurrentBundlesStatus {
  output_dir: string;
  report_json_path: string;
  report_markdown_path: string;
  library_path: string;
  bundle_types: CurrentBundleType[];
  report_exists: boolean;
  markdown_exists: boolean;
  generated_at: string | null;
  bundle_count: number | null;
}

export interface CurrentChoiceGame {
  title: string;
  owned: boolean;
  matched_library_titles: string[];
}

export interface CurrentChoiceReport {
  generated_at: string;
  month_label: string;
  page_url: string;
  page_html_path: string;
  snapshot_json_path: string;
  library_path: string;
  price_label: string | null;
  price_value: number | null;
  total_titles: number;
  owned_titles: number;
  new_titles: number;
  owned_percent: number;
  new_percent: number;
  report_json_path: string;
  report_markdown_path: string;
  games: CurrentChoiceGame[];
}

export interface CurrentChoiceStatus {
  output_dir: string;
  page_html_path: string;
  snapshot_json_path: string;
  report_json_path: string;
  report_markdown_path: string;
  library_path: string;
  report_exists: boolean;
  markdown_exists: boolean;
  generated_at: string | null;
  month_label: string | null;
  game_count: number | null;
}

/**
 * Fetch the normalized library dataset from the backend.
 */
const fetchLibrary = async (): Promise<LibraryData> => {
  const response = await fetch("/api/library");
  if (!response.ok) {
    throw new Error("Failed to load library data.");
  }
  return response.json();
};

const fetchLibraryStatus = async (): Promise<LibraryStatus> => {
  const response = await fetch("/api/library/status");
  if (!response.ok) {
    throw new Error("Failed to load library status.");
  }
  return response.json();
};

const fetchCurrentBundlesStatus = async (): Promise<CurrentBundlesStatus> => {
  const response = await fetch("/api/current-bundles/status");
  if (!response.ok) {
    throw new Error("Failed to load current bundle status.");
  }
  return response.json();
};

const fetchCurrentBundlesReport = async (): Promise<CurrentBundlesReport> => {
  const response = await fetch("/api/current-bundles");
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to load current bundle report.");
  }
  return response.json();
};

const fetchCurrentChoiceStatus = async (): Promise<CurrentChoiceStatus> => {
  const response = await fetch("/api/current-choice/status");
  if (!response.ok) {
    throw new Error("Failed to load current Choice status.");
  }
  return response.json();
};

const fetchCurrentChoiceReport = async (): Promise<CurrentChoiceReport> => {
  const response = await fetch("/api/current-choice");
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to load current Choice report.");
  }
  return response.json();
};

export const useLibraryStatus = () =>
  useQuery({
    queryKey: ["library-status"],
    queryFn: fetchLibraryStatus,
    staleTime: 30_000,
  });

export const useCurrentBundlesStatus = () =>
  useQuery({
    queryKey: ["current-bundles-status"],
    queryFn: fetchCurrentBundlesStatus,
    staleTime: 30_000,
  });

export const useCurrentBundlesReport = (enabled = true) =>
  useQuery({
    queryKey: ["current-bundles"],
    queryFn: fetchCurrentBundlesReport,
    enabled,
    retry: false,
  });

export const useCurrentChoiceStatus = () =>
  useQuery({
    queryKey: ["current-choice-status"],
    queryFn: fetchCurrentChoiceStatus,
    staleTime: 30_000,
  });

export const useCurrentChoiceReport = (enabled = true) =>
  useQuery({
    queryKey: ["current-choice"],
    queryFn: fetchCurrentChoiceReport,
    enabled,
    retry: false,
  });

/**
 * React Query hook for library data.
 */
export const useLibraryData = () =>
  useQuery({
    queryKey: ["library"],
    queryFn: fetchLibrary,
    enabled: true,
  });

export const useOptionalLibraryData = (enabled: boolean) =>
  useQuery({
    queryKey: ["library"],
    queryFn: fetchLibrary,
    enabled,
  });

const fetchViewerConfig = async (): Promise<ViewerConfig> => {
  const response = await fetch("/api/viewer/config");
  if (!response.ok) {
    throw new Error("Failed to load viewer configuration.");
  }
  return response.json();
};

export const useViewerConfig = () =>
  useQuery({
    queryKey: ["viewer-config"],
    queryFn: fetchViewerConfig,
    staleTime: 60_000,
  });
