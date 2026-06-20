import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type ReportRow = {
  id: string;
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
  created_at: string;
  updated_at: string;
};

export type SectionRow = {
  id: string;
  report_id: string;
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
};

export type PhotoRow = {
  id: string;
  report_id: string;
  section_id: string | null;
  photo_number: string;
  seq: number;
  image_path: string;
  file_size: number;
  uploaded_at: string;
  caption: string | null;
  _blobKey?: string;
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
  meta: { key: string; value: unknown };
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
          d.createObjectStore("meta");
        }
      },
    });
  }
  return _dbp;
}

export function newId(prefix = "local") {
  return `${prefix}_${crypto.randomUUID()}`;
}
