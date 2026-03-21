/**
 * Shared data model for the normalized library payload.
 */
export interface Download {
  platform?: string;
  name?: string;
  size_bytes?: number;
  url?: string;
  checksums?: Record<string, string> | null;
  /** File extension inferred from name or URL. */
  file_type?: string;
  /** Backend-derived download family for viewer UI. */
  display_category?: string;
  /** Primary backend-derived content label such as EPUB, MP3, or Linux 64-bit. */
  content_label?: string;
  /** Backend-derived package label such as ZIP, DEB, DMG, or Installer. */
  package_label?: string | null;
  /** Unique backend-derived label intended for buttons, filters, and selections. */
  display_label?: string;
  /** Optional secondary detail for viewer display. */
  display_detail?: string | null;
}

export interface Key {
  /** Platform identifier (steam, epic, etc.). */
  key_type?: string;
  /** Human-friendly platform name. */
  key_type_human_name?: string;
  /** Display name for the key entry. */
  human_name?: string;
  /** Machine name for matching subproducts. */
  machine_name?: string;
  gamekey?: string;
  keyindex?: number;
  /** Revealed key value when present (sensitive). */
  redeemed_key_val?: string;
  is_expired?: boolean;
  is_gift?: boolean;
  direct_redeem?: boolean;
  sold_out?: boolean;
  steam_app_id?: number | string;
  num_days_until_expired?: number;
  /** Raw external redemption instructions from Humble, when present. */
  custom_instructions_html?: string;
  /** Humble display hint for showing custom instructions in the library. */
  show_custom_instructions_in_user_libraries?: boolean;
  /** Humble layout hint for standalone key presentation. */
  display_separately?: boolean;
  /** Humble expansion hint for important key actions. */
  auto_expand?: boolean;
  /** Visibility flag from the API payload. */
  visible?: boolean;
  /** Optional class name from the API payload. */
  class_name?: string;
}

export interface RedemptionLink {
  id: string;
  label: string;
  url: string;
  kind: "redeem" | "instructions";
  region?: string;
}

export interface Payee {
  human_name?: string;
  machine_name?: string;
}

export interface SubproductPageDetails {
  url?: string;
  final_url?: string;
  replacement_url?: string;
  page_title?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  authors?: string[];
  publisher?: string;
  series?: string;
  language?: string;
  image_url?: string;
  tags?: string[];
  isbns?: string[];
  source_host?: string;
  status_code?: number;
  content_type?: string;
  html_path?: string;
  recovery_method?: string;
  extracted_at?: string;
}

/**
 * Subproduct inside a bundle or subscription order.
 */
export interface Subproduct {
  human_name?: string;
  machine_name?: string;
  url?: string;
  downloads?: Download[];
  keys?: Key[];
  payee?: Payee | null;
  page_details?: SubproductPageDetails | null;
}

/**
 * Top-level product entry representing an order or bundle.
 */
export interface Product {
  product_name?: string;
  machine_name?: string;
  category?: string;
  gamekey?: string;
  amount_spent?: number;
  created_at?: string;
  keys?: Key[];
  downloads?: Download[];
  subproducts?: Subproduct[];
}

/**
 * Root payload returned by the backend API.
 */
export interface LibraryData {
  products: Product[];
  total_products?: number;
  captured_at?: string;
}

export interface SuborderItem {
  id: string;
  parentGamekey?: string;
  parentName?: string;
  parentCategory?: string;
  subproductName?: string;
  subproductMachine?: string;
  infoUrl?: string;
  viewerPagePath?: string;
  authorSummary?: string;
  descriptionSnippet?: string;
  publisher?: string;
  downloads: Download[];
  keys: Key[];
  totalBytes: number;
  platformSummary: string;
  product: Product;
}

export interface FlattenedDownload {
  id: string;
  productName?: string;
  productCategory?: string;
  platform?: string;
  fileType?: string;
  sizeBytes?: number;
  url?: string;
  orderName?: string;
  dateAcquired?: string;
}

export interface FlattenedKey {
  id: string;
  productName?: string;
  productCategory?: string;
  keyType?: string;
  keyName?: string;
  keyValue?: string;
  redemptionLinks: RedemptionLink[];
  status: string[];
  steamAppId?: string | number;
  dateAcquired?: string;
  numDaysUntilExpired?: number;
}
