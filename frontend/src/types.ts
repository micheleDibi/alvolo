export type ContentType = "text" | "link" | "image";
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
  has_image: boolean;
  source_url: string | null;
  error_message: string | null;
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
}

export interface ItemList {
  items: ItemSummary[];
  total: number;
}
