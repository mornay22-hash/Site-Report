import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type ReportRow = {
  id: string;
  user_id: string;
  report_name: string;
  site_name: string;
  site_code: string;
  report_date: string;
  planned_visit_date: string | null;
  due_date: string | null;
  report_type: string | null;
  inspection_time: string | null;
  client_name: string | null;
  notes: string | null;
  area: string | null;
  inspector_name: string | null;
  status: "active" | "completed" | "archived";
  completed_at: string | null;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SectionRow = {
  id: string;
  report_id: string;
  user_id: string;
  area_name: string;
  area_slug: string;
  area_description: string | null;
  sort_order: number;
  status: string | null;
  repairs_required: boolean;
  repair_description: string | null;
  priority: string | null;
  assigned_to: string | null;
  target_completion_date: string | null;
  estimated_cost: number | null;
  follow_up_required: boolean;
  comments: string | null;
  action_required: string | null;
  is_ad_hoc: boolean;
  category: string | null;
  // local-only flag for sections created offline (id is a temp uuid)
  _pending?: boolean;
};

export type PhotoRow = {
  id: string;
  user_id: string;
  report_id: string;
  section_id: string | null;
  entry_id: string | null;
  photo_number: string;
  seq: number;
  image_path: string;
  file_size: number;
  uploaded_at: string;
  caption: string | null;
  // local-only fields
  _pending?: boolean;
  _blobKey?: string;
};

export type OutboxItem = {
  id: string;
  type:
    | "section.update"
    | "section.insert"
    | "section.delete"
    | "section.reorder"
    | "report.update"
    | "report.status"
    | "photo.upload"
    | "photo.delete"
    | "template.save"
    | "template.delete";
  payload: Record<string, unknown>;
  reportId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: number;
};

export type TemplateRow = {
  id: string;
  user_id: string | null;
  name: string;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
  // local-only
  _pending?: boolean;
};

export type TemplateItemRow = {
  id: string;
  template_id: string;
  area_name: string;
  sort_order: number;
};

interface MJWDB extends DBSchema {
  reports: { key: string; value: ReportRow };
  sections: {
    key: string;
    value: SectionRow;
    indexes: { "by-report": string };
  };
  photos: {
    key: string;
    value: PhotoRow;
    indexes: { "by-section": string; "by-report": string };
  };
  photo_blobs: { key: string; value: Blob };
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: { "by-created": number };
  };
  meta: { key: string; value: unknown };
  templates: { key: string; value: TemplateRow };
  template_items: {
    key: string;
    value: TemplateItemRow;
    indexes: { "by-template": string };
  };
}

let _dbp: Promise<IDBPDatabase<MJWDB>> | null = null;

export function db(): Promise<IDBPDatabase<MJWDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  if (!_dbp) {
    _dbp = openDB<MJWDB>("mjw-offline", 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore("reports", { keyPath: "id" });
          const s = d.createObjectStore("sections", { keyPath: "id" });
          s.createIndex("by-report", "report_id");
          const p = d.createObjectStore("photos", { keyPath: "id" });
          p.createIndex("by-section", "section_id");
          p.createIndex("by-report", "report_id");
          d.createObjectStore("photo_blobs");
          const o = d.createObjectStore("outbox", { keyPath: "id" });
          o.createIndex("by-created", "createdAt");
          d.createObjectStore("meta");
        }
        if (oldVersion < 2) {
          d.createObjectStore("templates", { keyPath: "id" });
          const ti = d.createObjectStore("template_items", { keyPath: "id" });
          ti.createIndex("by-template", "template_id");
        }
      },
    });
  }
  return _dbp;
}

export function newId(prefix = "local") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function isLocalId(id: string) {
  return id.startsWith("local_");
}
