export type ContentType = "text" | "link" | "image" | "pdf" | "audio";
export type ItemStatus = "capturing" | "processing" | "done" | "failed" | "archived";

export interface ItemSummary {
  id: string;
  created_at: string;
  content_type: ContentType;
  status: ItemStatus;
  source: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  tags: string[];
  action_items: string[];
  has_image: boolean;
  source_url: string | null;
  error_message: string | null;
}

export interface RelatedItem {
  id: string;
  title: string;
  content_type: ContentType;
  status: ItemStatus;
}

export interface ItemDetail extends ItemSummary {
  updated_at: string;
  enriched_at: string | null;
  raw_text: string | null;
  key_points: string[];
  related_ideas: string[];
  deep_analysis: string | null;
  extracted_text: string | null;
  model_used: string | null;
  image_url: string | null;
  file_url: string | null;
  related: RelatedItem[];
}

export interface ItemList {
  items: ItemSummary[];
  total: number;
}

export interface ItemQuery {
  status?: string;
  category?: string;
  tag?: string;
  q?: string;
  has_todo?: boolean;
  sort?: "newest" | "oldest";
}

export interface ItemPatch {
  status?: ItemStatus;
  title?: string | null;
  category?: string | null;
  tags?: string[];
  action_items?: string[];
}

export interface TagCount {
  name: string;
  count: number;
}

export interface AskSource {
  id: string;
  title: string;
}

export interface AskResponse {
  answer: string;
  sources: AskSource[];
}

export interface DigestResponse {
  days: number;
  item_count: number;
  recap: string;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface StatsResponse {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  by_source: Record<string, number>;
  top_categories: TagCount[];
  tokens_input: number;
  tokens_output: number;
  estimated_cost_usd: number;
  per_day: DayCount[];
}

export interface Meta {
  tags: TagCount[];
  categories: TagCount[];
  counts_by_status: Record<string, number>;
}
