import { createClient } from "@supabase/supabase-js";
import { db } from "./db";
import type { ReportRow, SectionRow } from "./db";

const SUPABASE_URL = "https://yifokzyznixmgsvvdmzd.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZm9renl6bml4bWdzdnZkbXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1ODIwMzAsImV4cCI6MjA5NzE1ODAzMH0.0hyfFsyMaYOUAwidThKKMqDRm_t7Yc-7XwkrPAIrZjY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const LAST_SYNC_KEY = "mjw-site-report-last-sync";

function getLastSync(): string {
  return localStorage.getItem(LAST_SYNC_KEY) ?? "1970-01-01T00:00:00.000Z";
}

function setLastSync() {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

/** Push all local reports+sections to Supabase (upsert). */
export async function pushToCloud() {
  const d = await db();
  const reports = await d.getAll("reports");
  if (!reports.length) return;

  // Upsert reports
  const { error: re } = await supabase
    .from("site_report_reports")
    .upsert(reports.map((r) => ({ ...r, deleted_at: null })), { onConflict: "id" });
  if (re) throw re;

  // Upsert all sections
  const allSections: SectionRow[] = [];
  for (const r of reports) {
    const secs = await d.getAllFromIndex("sections", "by-report", r.id);
    allSections.push(...secs);
  }
  if (allSections.length) {
    const { error: se } = await supabase
      .from("site_report_sections")
      .upsert(allSections.map((s) => ({ ...s, updated_at: new Date().toISOString(), deleted_at: null })), { onConflict: "id" });
    if (se) throw se;
  }
}

/** Pull any reports+sections updated since last sync from Supabase into IndexedDB. */
export async function pullFromCloud() {
  const since = getLastSync();
  const d = await db();

  // Pull reports updated since last sync
  const { data: remoteReports, error: re } = await supabase
    .from("site_report_reports")
    .select("*")
    .gt("updated_at", since)
    .is("deleted_at", null);
  if (re) throw re;

  for (const r of remoteReports ?? []) {
    const local = await d.get("reports", r.id);
    // Only overwrite if remote is newer
    if (!local || r.updated_at > local.updated_at) {
      await d.put("reports", r as ReportRow);
    }
  }

  // Pull sections for those reports
  const reportIds = (remoteReports ?? []).map((r: any) => r.id);
  if (reportIds.length) {
    const { data: remoteSections, error: se } = await supabase
      .from("site_report_sections")
      .select("*")
      .in("report_id", reportIds)
      .is("deleted_at", null);
    if (se) throw se;

    for (const s of remoteSections ?? []) {
      await d.put("sections", s as SectionRow);
    }
  }

  // Also handle remote deletes (deleted_at set)
  const { data: deleted } = await supabase
    .from("site_report_reports")
    .select("id")
    .gt("updated_at", since)
    .not("deleted_at", "is", null);
  for (const row of deleted ?? []) {
    const local = await d.get("reports", row.id);
    if (local) await d.delete("reports", row.id);
  }

  setLastSync();
}

/** Soft-delete a report in the cloud (sets deleted_at). */
export async function cloudDeleteReport(id: string) {
  const now = new Date().toISOString();
  await supabase
    .from("site_report_reports")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id);
}

/** Full sync: pull first, then push local changes. */
export async function syncReports(): Promise<{ ok: boolean; error?: string }> {
  try {
    await pullFromCloud();
    await pushToCloud();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Sync failed" };
  }
}
