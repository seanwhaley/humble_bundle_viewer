/**
 * Typed maintenance command contracts shared by Command Center workflows.
 */

export type MaintenanceCommandStatus = "success" | "error";

export interface MaintenanceCommandResponse<TDetails> {
  command: string;
  status: MaintenanceCommandStatus;
  message: string;
  details: TDetails;
}

export interface OrderModelCommandDetails {
  output_path: string;
  payload_count: number;
  missing_paths: string[];
}

export interface LibraryArtifactCommandDetails {
  output_path: string;
  total_products: number;
}

export interface ViewerSchemaCommandDetails {
  output_path: string;
}

export interface SubproductPageDomainSummary {
  host: string;
  requested_urls: number;
  fetched_pages: number;
  reused_pages: number;
  failed_pages: number;
  skipped_pages: number;
  failure_breakdown: Record<string, number>;
  domain_status_breakdown: Record<string, number>;
}

export interface SubproductPageCacheCommandDetails {
  requested_urls: number;
  processed_urls: number;
  fetched_pages: number;
  reused_pages: number;
  failed_pages: number;
  skipped_pages: number;
  failure_limit: number | null;
  aborted: boolean;
  manifest_path: string;
  elapsed_seconds: number;
  failure_breakdown: Record<string, number>;
  domain_summaries: SubproductPageDomainSummary[];
}

export interface SubproductMetadataCommandDetails {
  processed_entries: number;
  extracted_entries: number;
  fallback_only_entries: number;
  html_read_failures: number;
  output_path: string;
  elapsed_seconds: number;
  report_path: string | null;
}

export interface CurrentBundlesCommandDetails {
  output_dir: string;
  index_html_path: string;
  bundle_links_path: string;
  catalog_json_path: string;
  report_json_path: string;
  report_markdown_path: string;
  bundle_types: string[];
  bundle_count: number;
  library_path: string;
  generated_at: string;
}

export interface CurrentChoiceCommandDetails {
  output_dir: string;
  page_html_path: string;
  snapshot_json_path: string;
  report_json_path: string;
  report_markdown_path: string;
  month_label: string;
  game_count: number;
  library_path: string;
  generated_at: string;
}

export type OrderModelCommandResponse =
  MaintenanceCommandResponse<OrderModelCommandDetails>;
export type LibraryArtifactCommandResponse =
  MaintenanceCommandResponse<LibraryArtifactCommandDetails>;
export type ViewerSchemaCommandResponse =
  MaintenanceCommandResponse<ViewerSchemaCommandDetails>;
export type SubproductPageCacheCommandResponse =
  MaintenanceCommandResponse<SubproductPageCacheCommandDetails>;
export type SubproductMetadataCommandResponse =
  MaintenanceCommandResponse<SubproductMetadataCommandDetails>;
export type CurrentBundlesCommandResponse =
  MaintenanceCommandResponse<CurrentBundlesCommandDetails>;
export type CurrentChoiceCommandResponse =
  MaintenanceCommandResponse<CurrentChoiceCommandDetails>;

export const postMaintenanceCommand = async <TDetails>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<MaintenanceCommandResponse<TDetails>> => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Command failed.");
  }
  return data as MaintenanceCommandResponse<TDetails>;
};
