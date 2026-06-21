import { supabase } from "@/integrations/supabase/client";
import {
  db,
  isLocalId,
  newId,
  type OutboxItem,
  type PhotoRow,
  type ReportRow,
  type SectionRow,
  type TemplateItemRow,
  type TemplateRow,
} from "./db";
import { compressImage } from "@/lib/compress";
import { triggerSync, emitChange } from "./sync";

/** Hydrate cache from server for one report. */
export async function fetchAndCacheReport(reportId: string): Promise<{
  report: ReportRow | null;
  sections: SectionRow[];
  photos: PhotoRow[];
  signedUrls: Record<string, string>;
}> {
  const [{ data: r }, { data: ss }, { data: ps }] = await Promise.all([
    supabase.from("reports").select("*").eq("id", reportId).single(),
    supabase.from("inspection_sections").select("*").eq("report_id", reportId).order("sort_order"),
    supabase.from("photos").select("*").eq("report_id", reportId).order("seq"),
  ]);
  const d = await db();
  const tx = d.transaction(["reports", "sections", "photos"], "readwrite");
  if (r) await tx.objectStore("reports").put(r as ReportRow);
  // Replace cached server rows for this report (but keep pending local rows)
  const sStore = tx.objectStore("sections");
  const sIdx = sStore.index("by-report");
  const oldSecs = await sIdx.getAll(reportId);
  for (const old of oldSecs) {
    if (!old._pending) await sStore.delete(old.id);
  }
  for (const s of (ss ?? []) as SectionRow[]) await sStore.put(s);

  const pStore = tx.objectStore("photos");
  const pIdx = pStore.index("by-report");
  const oldPhotos = await pIdx.getAll(reportId);
  for (const old of oldPhotos) {
    if (!old._pending) await pStore.delete(old.id);
  }
  for (const p of (ps ?? []) as PhotoRow[]) await pStore.put(p);
  await tx.done;

  // Sign URLs for online viewing
  const signed: Record<string, string> = {};
  const paths = ((ps ?? []) as PhotoRow[]).map((p) => p.image_path).filter(Boolean);
  if (paths.length) {
    const { data: sg } = await supabase.storage.from("report-photos").createSignedUrls(paths, 60 * 60);
    (sg ?? []).forEach((s, i) => { if (s.signedUrl) signed[paths[i]] = s.signedUrl; });
  }
  return {
    report: (r as ReportRow) ?? null,
    sections: ((ss ?? []) as SectionRow[]).slice().sort((a, b) => a.sort_order - b.sort_order),
    photos: (ps ?? []) as PhotoRow[],
    signedUrls: signed,
  };
}

/** Read from local cache (used when offline or as initial paint). */
export async function readCachedReport(reportId: string): Promise<{
  report: ReportRow | null;
  sections: SectionRow[];
  photos: PhotoRow[];
}> {
  const d = await db();
  const report = (await d.get("reports", reportId)) ?? null;
  const sections = (await d.getAllFromIndex("sections", "by-report", reportId)).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const photos = await d.getAllFromIndex("photos", "by-report", reportId);
  return { report, sections, photos };
}

export async function listCachedReports(): Promise<ReportRow[]> {
  const d = await db();
  return (await d.getAll("reports")).sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}

export async function cacheReportsList(rs: ReportRow[]) {
  const d = await db();
  const tx = d.transaction("reports", "readwrite");
  for (const r of rs) await tx.store.put(r);
  await tx.done;
}

async function enqueue(item: Omit<OutboxItem, "id" | "attempts" | "lastError" | "createdAt">) {
  const d = await db();
  const full: OutboxItem = {
    ...item,
    id: newId("ob"),
    attempts: 0,
    lastError: null,
    createdAt: Date.now(),
  };
  await d.put("outbox", full);
  emitChange();
  triggerSync();
}

// ---------- Sections ----------

export async function patchSection(sectionId: string, patch: Partial<SectionRow>) {
  const d = await db();
  const cur = await d.get("sections", sectionId);
  if (cur) await d.put("sections", { ...cur, ...patch });
  emitChange();
  await enqueue({ type: "section.update", payload: { id: sectionId, patch }, reportId: cur?.report_id ?? null });
}

export async function insertSection(input: Omit<SectionRow, "id"> & { id?: string }) {
  const d = await db();
  const id = input.id ?? newId("sec");
  const row: SectionRow = {
    ...(input as SectionRow),
    id,
    _pending: true,
  };
  await d.put("sections", row);
  emitChange();
  await enqueue({ type: "section.insert", payload: { tempId: id, row: stripLocal(row) }, reportId: row.report_id });
  return row;
}

export async function deleteSection(sectionId: string) {
  const d = await db();
  const cur = await d.get("sections", sectionId);
  await d.delete("sections", sectionId);
  // also drop photos linked locally
  const linked = await d.getAllFromIndex("photos", "by-section", sectionId);
  for (const p of linked) {
    await d.delete("photos", p.id);
    if (p._blobKey) await d.delete("photo_blobs", p._blobKey);
  }
  emitChange();
  if (cur && !isLocalId(sectionId)) {
    await enqueue({ type: "section.delete", payload: { id: sectionId, paths: linked.filter((p) => !p._pending).map((p) => p.image_path) }, reportId: cur.report_id });
  }
}

export async function reorderSections(reportId: string, ordered: SectionRow[]) {
  const d = await db();
  const tx = d.transaction("sections", "readwrite");
  for (let i = 0; i < ordered.length; i++) {
    const cur = await tx.store.get(ordered[i].id);
    if (cur) await tx.store.put({ ...cur, sort_order: i + 1 });
  }
  await tx.done;
  emitChange();
  const map = ordered.map((s, i) => ({ id: s.id, sort_order: i + 1 })).filter((m) => !isLocalId(m.id));
  if (map.length) await enqueue({ type: "section.reorder", payload: { map }, reportId });
}

// ---------- Report ----------

export async function patchReport(reportId: string, patch: Partial<ReportRow>) {
  const d = await db();
  const cur = await d.get("reports", reportId);
  if (cur) await d.put("reports", { ...cur, ...patch });
  emitChange();
  await enqueue({ type: "report.update", payload: { id: reportId, patch }, reportId });
}

export async function setReportStatus(reportId: string, status: ReportRow["status"]) {
  const d = await db();
  const cur = await d.get("reports", reportId);
  const patch: Partial<ReportRow> = {
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    archived_at: status === "archived" ? new Date().toISOString() : null,
  };
  if (cur) await d.put("reports", { ...cur, ...patch });
  emitChange();
  await enqueue({ type: "report.status", payload: { id: reportId, status, patch }, reportId });
}

// ---------- Photos ----------

export async function uploadPhotos(section: SectionRow, files: FileList | File[]) {
  const d = await db();
  const list = Array.from(files);
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? section.user_id;
  for (const file of list) {
    try {
      const compressed = await compressImage(file);
      const tempId = newId("ph");
      const blobKey = `blob_${tempId}`;
      await d.put("photo_blobs", compressed, blobKey);
      const row: PhotoRow = {
        id: tempId,
        user_id: userId,
        report_id: section.report_id,
        section_id: section.id,
        entry_id: null,
        photo_number: "PENDING",
        seq: 0,
        image_path: "",
        file_size: compressed.size,
        uploaded_at: new Date().toISOString(),
        caption: null,
        _pending: true,
        _blobKey: blobKey,
      };
      await d.put("photos", row);
      emitChange();
      await enqueue({
        type: "photo.upload",
        payload: { tempId, sectionId: section.id, reportId: section.report_id, blobKey, userId },
        reportId: section.report_id,
      });
    } catch (e) {
      console.error("compress failed", e);
    }
  }
}

export async function deletePhoto(p: PhotoRow) {
  const d = await db();
  await d.delete("photos", p.id);
  if (p._blobKey) await d.delete("photo_blobs", p._blobKey);
  emitChange();
  if (!p._pending && p.image_path) {
    await enqueue({
      type: "photo.delete",
      payload: { id: p.id, path: p.image_path },
      reportId: p.report_id,
    });
  }
}

export async function getBlobUrl(blobKey: string): Promise<string | null> {
  const d = await db();
  const b = await d.get("photo_blobs", blobKey);
  if (!b) return null;
  return URL.createObjectURL(b);
}

function stripLocal<T extends Record<string, unknown>>(row: T): T {
  const { _pending, _blobKey, ...rest } = row as Record<string, unknown>;
  return rest as T;
}

// ---------- Templates ----------

export async function fetchAndCacheTemplates(): Promise<{ templates: TemplateRow[]; items: TemplateItemRow[] }> {
  const [{ data: tpls }, { data: items }] = await Promise.all([
    supabase.from("inspection_templates").select("*").order("created_at"),
    supabase.from("inspection_template_items").select("*").order("sort_order"),
  ]);
  const d = await db();
  const tx = d.transaction(["templates", "template_items"], "readwrite");
  const tStore = tx.objectStore("templates");
  const iStore = tx.objectStore("template_items");
  for (const t of (tpls ?? []) as TemplateRow[]) await tStore.put(t);
  for (const i of (items ?? []) as TemplateItemRow[]) await iStore.put(i);
  await tx.done;
  return { templates: (tpls ?? []) as TemplateRow[], items: (items ?? []) as TemplateItemRow[] };
}

export async function listCachedTemplates(): Promise<{ templates: TemplateRow[]; items: TemplateItemRow[] }> {
  const d = await db();
  const templates = await d.getAll("templates");
  const items = await d.getAll("template_items");
  return { templates, items };
}

export async function saveTemplate(name: string, areaNames: string[], userId: string): Promise<TemplateRow> {
  const d = await db();
  const tempId = newId("tpl");
  const now = new Date().toISOString();
  const tplRow: TemplateRow = {
    id: tempId,
    user_id: userId,
    name,
    is_default: false,
    is_system: false,
    created_at: now,
    _pending: true,
  };
  const itemRows: TemplateItemRow[] = areaNames.map((area_name, idx) => ({
    id: newId("ti"),
    template_id: tempId,
    area_name,
    sort_order: idx + 1,
  }));
  const tx = d.transaction(["templates", "template_items"], "readwrite");
  await tx.objectStore("templates").put(tplRow);
  for (const i of itemRows) await tx.objectStore("template_items").put(i);
  await tx.done;
  emitChange();
  await enqueue({ type: "template.save", payload: { tempId, name, areaNames, userId }, reportId: null });
  return tplRow;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const d = await db();
  const items = await d.getAllFromIndex("template_items", "by-template", templateId);
  const tx = d.transaction(["templates", "template_items"], "readwrite");
  await tx.objectStore("templates").delete(templateId);
  for (const i of items) await tx.objectStore("template_items").delete(i.id);
  await tx.done;
  emitChange();
  if (!isLocalId(templateId)) {
    await enqueue({ type: "template.delete", payload: { id: templateId }, reportId: null });
  }
}

export async function getTemplateAreas(templateId: string): Promise<string[]> {
  const d = await db();
  const items = (await d.getAllFromIndex("template_items", "by-template", templateId))
    .sort((a, b) => a.sort_order - b.sort_order);
  return items.map((i) => i.area_name);
}
