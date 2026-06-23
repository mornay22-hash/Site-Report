/**
 * Pure local repository — all reads/writes go directly to IndexedDB.
 * No network, no sync, no auth required.
 */
import { db, newId, type ReportRow, type SectionRow, type PhotoRow } from "./db";
import { compressImage } from "./compress";
import { generateSiteCode } from "./site-code";
import { slugifyArea, DEFAULT_AREAS } from "./templates";

// ---------- Reports ----------

export async function listReports(): Promise<ReportRow[]> {
  const d = await db();
  const all = await d.getAll("reports");
  return all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getReport(id: string): Promise<ReportRow | null> {
  const d = await db();
  return (await d.get("reports", id)) ?? null;
}

export async function createReport(input: {
  report_name: string;
  site_name: string;
  site_code?: string;
  planned_visit_date?: string;
  due_date?: string;
  report_type?: string;
  area?: string;
  inspector_name?: string;
  template_areas?: string[]; // custom preset areas from a saved template
}): Promise<ReportRow> {
  const d = await db();
  const now = new Date().toISOString();
  const id = newId("rep");
  const code = (input.site_code?.trim() || generateSiteCode(input.site_name)).toUpperCase();
  const row: ReportRow = {
    id,
    report_name: input.report_name,
    site_name: input.site_name,
    site_code: code,
    report_date: input.planned_visit_date || now.slice(0, 10),
    planned_visit_date: input.planned_visit_date || null,
    due_date: input.due_date || null,
    report_type: input.report_type || "Routine Site Visit",
    inspection_time: null,
    client_name: null,
    notes: null,
    area: input.area || null,
    inspector_name: input.inspector_name || null,
    status: "active",
    completed_at: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
  };
  await d.put("reports", row);

  // Preload areas: template_areas take priority; Monthly Inspection falls back to DEFAULT_AREAS
  const areasToLoad = input.template_areas?.length
    ? input.template_areas
    : (input.report_type || "").trim() === "Monthly Inspection"
      ? DEFAULT_AREAS
      : [];
  if (!areasToLoad.length) return row;
  const tx = d.transaction("sections", "readwrite");
  for (let i = 0; i < areasToLoad.length; i++) {
    const name = areasToLoad[i];
    const sec: SectionRow = {
      id: newId("sec"),
      report_id: id,
      area_name: name,
      area_slug: slugifyArea(name),
      area_description: null,
      sort_order: i + 1,
      status: null,
      repairs_required: false,
      repair_description: null,
      priority: null,
      assigned_to: null,
      target_completion_date: null,
      estimated_cost: null,
      follow_up_required: false,
      comments: null,
      action_required: null,
      is_ad_hoc: false,
      category: null,
    };
    await tx.store.put(sec);
  }
  await tx.done;
  return row;
}

export async function deleteReport(id: string) {
  const d = await db();
  // Delete all sections and their photos/blobs
  const sections = await d.getAllFromIndex("sections", "by-report", id);
  for (const s of sections) {
    const photos = await d.getAllFromIndex("photos", "by-section", s.id);
    for (const p of photos) {
      await d.delete("photos", p.id);
      if (p._blobKey) await d.delete("photo_blobs", p._blobKey);
    }
    await d.delete("sections", s.id);
  }
  // Delete any report-level photos not linked to a section
  const allPhotos = await d.getAllFromIndex("photos", "by-report", id);
  for (const p of allPhotos) {
    await d.delete("photos", p.id);
    if (p._blobKey) await d.delete("photo_blobs", p._blobKey);
  }
  await d.delete("reports", id);
  // Soft-delete in cloud (fire and forget) — imported lazily to avoid circular
  import("./sync").then(({ cloudDeleteReport }) => cloudDeleteReport(id).catch(() => {})).catch(() => {});
}

export async function patchReport(id: string, patch: Partial<ReportRow>) {
  const d = await db();
  const cur = await d.get("reports", id);
  if (!cur) return;
  await d.put("reports", { ...cur, ...patch, updated_at: new Date().toISOString() });
}

export async function setReportStatus(id: string, status: ReportRow["status"]) {
  await patchReport(id, {
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    archived_at: status === "archived" ? new Date().toISOString() : null,
  });
}

// ---------- Sections ----------

export async function getSections(reportId: string): Promise<SectionRow[]> {
  const d = await db();
  const all = await d.getAllFromIndex("sections", "by-report", reportId);
  return all.sort((a, b) => a.sort_order - b.sort_order);
}

export async function patchSection(id: string, patch: Partial<SectionRow>) {
  const d = await db();
  const cur = await d.get("sections", id);
  if (!cur) return;
  await d.put("sections", { ...cur, ...patch });
  // touch report's updated_at
  const rep = await d.get("reports", cur.report_id);
  if (rep) await d.put("reports", { ...rep, updated_at: new Date().toISOString() });
}

export async function insertSection(input: Omit<SectionRow, "id">): Promise<SectionRow> {
  const d = await db();
  const row: SectionRow = { ...input, id: newId("sec") };
  await d.put("sections", row);
  return row;
}

export async function deleteSection(id: string) {
  const d = await db();
  const sec = await d.get("sections", id);
  await d.delete("sections", id);
  // delete linked photos + blobs
  const photos = await d.getAllFromIndex("photos", "by-section", id);
  for (const p of photos) {
    await d.delete("photos", p.id);
    if (p._blobKey) await d.delete("photo_blobs", p._blobKey);
  }
  if (sec) {
    const rep = await d.get("reports", sec.report_id);
    if (rep) await d.put("reports", { ...rep, updated_at: new Date().toISOString() });
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
}

// ---------- Photos ----------

export async function getPhotos(reportId: string): Promise<PhotoRow[]> {
  const d = await db();
  return d.getAllFromIndex("photos", "by-report", reportId);
}

export async function addPhoto(section: SectionRow, file: File): Promise<PhotoRow> {
  const d = await db();
  const compressed = await compressImage(file);
  const id = newId("ph");
  const blobKey = `blob_${id}`;
  await d.put("photo_blobs", compressed, blobKey);

  // Count existing photos for this report to get a sequential number
  const existing = await d.getAllFromIndex("photos", "by-report", section.report_id);
  const seq = existing.length + 1;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const photoNumber = `${section.report_id.slice(-4).toUpperCase()}-${date}-${section.area_slug}-${String(seq).padStart(3, "0")}`;

  const row: PhotoRow = {
    id,
    report_id: section.report_id,
    section_id: section.id,
    photo_number: photoNumber,
    seq,
    image_path: blobKey,
    file_size: compressed.size,
    uploaded_at: new Date().toISOString(),
    caption: null,
    _blobKey: blobKey,
  };
  await d.put("photos", row);
  return row;
}

export async function deletePhoto(id: string) {
  const d = await db();
  const p = await d.get("photos", id);
  await d.delete("photos", id);
  if (p?._blobKey) await d.delete("photo_blobs", p._blobKey);
}

export async function getBlobUrl(blobKey: string): Promise<string | null> {
  const d = await db();
  const b = await d.get("photo_blobs", blobKey);
  if (!b) return null;
  return URL.createObjectURL(b);
}

export async function getPhotoUrl(photo: PhotoRow): Promise<string | null> {
  if (photo._blobKey) return getBlobUrl(photo._blobKey);
  return null;
}
