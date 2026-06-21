import { supabase } from "@/integrations/supabase/client";
import { db, isLocalId, type OutboxItem, type PhotoRow, type SectionRow } from "./db";

type SyncState = {
  online: boolean;
  pending: number;
  failed: number;
  running: boolean;
};

const listeners = new Set<(s: SyncState) => void>();
let state: SyncState = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pending: 0,
  failed: 0,
  running: false,
};

function notify() {
  for (const fn of listeners) fn(state);
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getSyncState(): SyncState {
  return state;
}

const changeListeners = new Set<() => void>();
export function subscribeChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
export function emitChange() {
  for (const fn of changeListeners) fn();
}

async function refreshCounts() {
  try {
    const d = await db();
    const all = await d.getAll("outbox");
    state = {
      ...state,
      pending: all.length,
      failed: all.filter((x) => x.attempts >= 5).length,
    };
    notify();
  } catch {
    /* indexeddb not available (SSR) */
  }
}

export function initSync() {
  if (typeof window === "undefined") return;
  const setOnline = (v: boolean) => {
    state = { ...state, online: v };
    notify();
    if (v) triggerSync();
  };
  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("focus", () => triggerSync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") triggerSync();
  });
  refreshCounts();
  // Initial drain (in case there are pending items from previous session)
  if (navigator.onLine) triggerSync();
}

let draining = false;
let queued = false;

export function triggerSync() {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  if (draining) { queued = true; return; }
  void drain();
}

async function drain() {
  draining = true;
  state = { ...state, running: true };
  notify();
  try {
    while (true) {
      const d = await db();
      const items = (await d.getAllFromIndex("outbox", "by-created")).filter((i) => i.attempts < 5);
      if (!items.length) break;
      let progressed = false;
      for (const item of items) {
        if (!navigator.onLine) break;
        try {
          await processItem(item);
          await d.delete("outbox", item.id);
          progressed = true;
          await refreshCounts();
        } catch (e: any) {
          const next: OutboxItem = {
            ...item,
            attempts: item.attempts + 1,
            lastError: e?.message ?? String(e),
          };
          await d.put("outbox", next);
          await refreshCounts();
          if (isOfflineError(e)) {
            // stop the drain — wait for online event
            break;
          }
          // otherwise continue with next item
        }
      }
      if (!progressed) break;
    }
  } finally {
    draining = false;
    state = { ...state, running: false };
    notify();
    if (queued) { queued = false; triggerSync(); }
  }
}

function isOfflineError(e: any): boolean {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("network") || !navigator.onLine;
}

async function processItem(item: OutboxItem) {
  const d = await db();
  switch (item.type) {
    case "section.update": {
      const { id, patch } = item.payload as { id: string; patch: Partial<SectionRow> };
      if (isLocalId(id)) {
        // Section hasn't synced yet — find the most recent insert in outbox and merge patch
        const all = await d.getAll("outbox");
        const insertIdx = all.findIndex((x) => x.type === "section.insert" && (x.payload as any).tempId === id);
        if (insertIdx >= 0) {
          const ins = all[insertIdx];
          (ins.payload as any).row = { ...((ins.payload as any).row), ...patch };
          await d.put("outbox", ins);
          return;
        }
        return; // nothing to do
      }
      const clean = stripUndefined(patch);
      const { error } = await supabase.from("inspection_sections").update(clean as any).eq("id", id);
      if (error) throw error;
      return;
    }
    case "section.insert": {
      const { tempId, row } = item.payload as { tempId: string; row: SectionRow };
      const { id: _ignore, ...insertable } = row as any;
      const { data, error } = await supabase
        .from("inspection_sections")
        .insert(insertable)
        .select("*")
        .single();
      if (error) throw error;
      // Replace temp row with real row in cache, rewrite any photos pointing at tempId
      const real = data as SectionRow;
      await d.delete("sections", tempId);
      await d.put("sections", real);
      const linked = await d.getAllFromIndex("photos", "by-section", tempId);
      for (const p of linked) {
        await d.delete("photos", p.id);
        await d.put("photos", { ...p, section_id: real.id });
      }
      // Rewrite any pending outbox photo.upload entries referencing tempId
      const all = await d.getAll("outbox");
      for (const o of all) {
        if (o.type === "photo.upload" && (o.payload as any).sectionId === tempId) {
          (o.payload as any).sectionId = real.id;
          await d.put("outbox", o);
        }
      }
      emitChange();
      return;
    }
    case "section.delete": {
      const { id, paths } = item.payload as { id: string; paths: string[] };
      if (paths?.length) {
        await supabase.storage.from("report-photos").remove(paths);
      }
      const { error } = await supabase.from("inspection_sections").delete().eq("id", id);
      if (error && !String(error.message).toLowerCase().includes("not found")) throw error;
      return;
    }
    case "section.reorder": {
      const { map } = item.payload as { map: { id: string; sort_order: number }[] };
      await Promise.all(
        map.map((m) =>
          supabase.from("inspection_sections").update({ sort_order: m.sort_order }).eq("id", m.id),
        ),
      );
      return;
    }
    case "report.update": {
      const { id, patch } = item.payload as { id: string; patch: Record<string, unknown> };
      const { error } = await supabase.from("reports").update(stripUndefined(patch) as any).eq("id", id);
      if (error) throw error;
      return;
    }
    case "report.status": {
      const { id, patch } = item.payload as { id: string; patch: Record<string, unknown> };
      const { error } = await supabase.from("reports").update(stripUndefined(patch) as any).eq("id", id);
      if (error) throw error;
      return;
    }
    case "photo.upload": {
      const { tempId, sectionId, reportId, blobKey, userId } = item.payload as {
        tempId: string; sectionId: string; reportId: string; blobKey: string; userId: string;
      };
      if (isLocalId(sectionId)) {
        throw new Error("Waiting on section to sync first");
      }
      const blob = await d.get("photo_blobs", blobKey);
      if (!blob) {
        // blob gone — drop ghost photo row and stop
        await d.delete("photos", tempId);
        emitChange();
        return;
      }
      const { data: alloc, error: aErr } = await supabase.rpc("allocate_section_photo_number", { _section_id: sectionId });
      if (aErr) throw aErr;
      const row = (alloc as any[])[0];
      const photoNumber: string = row.photo_number;
      const seq: number = row.seq;
      const path = `${userId}/${reportId}/${photoNumber}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("report-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: ins, error: insErr } = await supabase.from("photos").insert({
        user_id: userId,
        report_id: reportId,
        section_id: sectionId,
        photo_number: photoNumber,
        seq,
        image_path: path,
        file_size: blob.size,
        sort_order: seq,
      }).select("*").single();
      if (insErr) throw insErr;
      // Swap temp row → real row, drop the blob
      await d.delete("photos", tempId);
      await d.delete("photo_blobs", blobKey);
      await d.put("photos", ins as PhotoRow);
      emitChange();
      return;
    }
    case "photo.delete": {
      const { id, path } = item.payload as { id: string; path: string };
      if (path) await supabase.storage.from("report-photos").remove([path]);
      const { error } = await supabase.from("photos").delete().eq("id", id);
      if (error && !String(error.message).toLowerCase().includes("not found")) throw error;
      return;
    }
    case "template.save": {
      const { tempId, name, areaNames, userId } = item.payload as {
        tempId: string; name: string; areaNames: string[]; userId: string;
      };
      const { data: tpl, error: tErr } = await supabase
        .from("inspection_templates")
        .insert({ user_id: userId, name, is_default: false, is_system: false })
        .select("*")
        .single();
      if (tErr) throw tErr;
      const itemInserts = (areaNames as string[]).map((area_name, idx) => ({
        template_id: tpl.id,
        area_name,
        sort_order: idx + 1,
      }));
      const { data: insertedItems, error: iErr } = await supabase
        .from("inspection_template_items")
        .insert(itemInserts)
        .select("*");
      if (iErr) throw iErr;
      // Replace temp IDs with real IDs in local cache
      const localDb = await db();
      const tx = localDb.transaction(["templates", "template_items"], "readwrite");
      await tx.objectStore("templates").delete(tempId);
      await tx.objectStore("templates").put({ ...tpl, _pending: false });
      const oldItems = await tx.objectStore("template_items").index("by-template").getAll(tempId);
      for (const oi of oldItems) await tx.objectStore("template_items").delete(oi.id);
      for (const ni of (insertedItems ?? [])) await tx.objectStore("template_items").put(ni);
      await tx.done;
      emitChange();
      return;
    }
    case "template.delete": {
      const { id } = item.payload as { id: string };
      const { error } = await supabase.from("inspection_templates").delete().eq("id", id);
      if (error && !String(error.message).toLowerCase().includes("not found")) throw error;
      return;
    }
  }
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}
