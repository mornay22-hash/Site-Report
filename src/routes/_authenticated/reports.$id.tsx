import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Camera,
  Upload,
  CheckCircle2,
  Trash2,
  Pencil,
  X,
  Save,
  Loader2,
  Plus,
  FileArchive,
  FileText,
  Settings,
  ArrowUp,
  ArrowDown,
  Wrench,
  Image as ImageIcon,
  LayoutTemplate,
} from "lucide-react";
import { compressImage } from "@/lib/compress";
import { generateReportPdf, downloadBlob, type PdfReport } from "@/lib/pdf";
import { buildPhotosZip, zipFilename } from "@/lib/zip";
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  REPORT_TYPES,
  statusTone,
  slugifyArea,
} from "@/lib/templates";
import {
  fetchAndCacheReport,
  readCachedReport,
  patchSection as repoPatchSection,
  insertSection as repoInsertSection,
  deleteSection as repoDeleteSection,
  reorderSections as repoReorderSections,
  patchReport as repoPatchReport,
  setReportStatus as repoSetReportStatus,
  uploadPhotos as repoUploadPhotos,
  deletePhoto as repoDeletePhoto,
  getBlobUrl,
  saveTemplate as repoSaveTemplate,
} from "@/lib/offline/repo";
import { subscribeChange, subscribeSync } from "@/lib/offline/sync";
import { OfflineIndicator } from "@/components/offline-indicator";

type Report = {
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
};

type Section = {
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

type Photo = {
  id: string;
  section_id: string | null;
  entry_id: string | null;
  photo_number: string;
  seq: number;
  image_path: string;
  file_size: number;
  uploaded_at: string;
  caption: string | null;
};

export const Route = createFileRoute("/_authenticated/reports/$id")({
  head: () => ({ meta: [{ title: "Site Visit — MJW Site Report" }] }),
  component: CapturePage,
});

function CapturePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editReportOpen, setEditReportOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const blobUrlCache = useRef<Map<string, string>>(new Map());

  // Read current cache snapshot into local state
  const readLocal = useCallback(async () => {
    const { report: r, sections: ss, photos: ps } = await readCachedReport(id);
    if (r) setReport(r as Report);
    setSections(ss as Section[]);
    setPhotos(ps as Photo[]);
    // Resolve blob URLs for pending photos
    const next: Record<string, string> = { ...urlsRef.current };
    for (const p of ps as Photo[]) {
      const anyP = p as any;
      if (anyP._blobKey) {
        const key = `blob:${anyP._blobKey}`;
        if (!blobUrlCache.current.has(anyP._blobKey)) {
          const u = await getBlobUrl(anyP._blobKey);
          if (u) blobUrlCache.current.set(anyP._blobKey, u);
        }
        const u = blobUrlCache.current.get(anyP._blobKey);
        if (u) next[key] = u;
        // Use blob key as the photo's effective image_path lookup
        (p as any).__previewUrl = u ?? "";
      }
    }
    setUrls((cur) => ({ ...cur, ...next }));
  }, [id]);

  const urlsRef = useRef<Record<string, string>>({});
  useEffect(() => { urlsRef.current = urls; }, [urls]);

  const load = useCallback(async () => {
    setLoading(true);
    // Paint from cache immediately
    await readLocal();
    // Revalidate from network if online
    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const fresh = await fetchAndCacheReport(id);
        if (!fresh.report) {
          toast.error("Report not found");
          navigate({ to: "/" });
          return;
        }
        setUrls((cur) => ({ ...cur, ...fresh.signedUrls }));
        await readLocal();
      } catch (e) {
        // network/RLS error — keep cached view
        console.warn("revalidate failed", e);
      }
    }
    setLoading(false);
  }, [id, navigate, readLocal]);

  useEffect(() => {
    load();
  }, [load]);

  // Reflect repo changes (optimistic + sync results) in UI without full reload
  useEffect(() => {
    const unsub1 = subscribeChange(() => { void readLocal(); });
    const unsub2 = subscribeSync((s) => setOnline(s.online));
    return () => { unsub1(); unsub2(); };
  }, [readLocal]);

  // Revoke blob URLs on unmount
  useEffect(() => () => {
    for (const u of blobUrlCache.current.values()) URL.revokeObjectURL(u);
    blobUrlCache.current.clear();
  }, []);

  const readOnly = report?.status !== "active";

  const photosBySection = useMemo(() => {
    const m: Record<string, Photo[]> = {};
    for (const p of photos) {
      const key = p.section_id ?? "_unlinked";
      (m[key] ||= []).push(p);
    }
    return m;
  }, [photos]);

  // ------- Section CRUD -------
  async function saveSection(sectionId: string, patch: Partial<Section>) {
    await repoPatchSection(sectionId, patch as any);
  }

  async function deleteSection(s: Section) {
    if (!confirm(`Delete section "${s.area_name}"? Photos linked to this area will be removed.`)) return;
    await repoDeleteSection(s.id);
    toast.success("Section deleted");
  }

  async function moveSection(s: Section, dir: -1 | 1) {
    const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === s.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const reordered = [...sorted];
    reordered[idx] = swap;
    reordered[idx + dir] = s;
    await repoReorderSections(s.report_id, reordered as any);
  }

  async function addAdHoc() {
    if (!report) return;
    const name = prompt("Ad hoc item name (e.g. 'Broken light at Entrance')");
    if (!name || !name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? report.user_id;
    const maxOrder = Math.max(0, ...sections.map((s) => s.sort_order));
    const row = await repoInsertSection({
      user_id: userId,
      report_id: report.id,
      area_name: name.trim(),
      area_slug: slugifyArea(name),
      area_description: null,
      sort_order: maxOrder + 1,
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
      is_ad_hoc: true,
      category: null,
    } as any);
    setExpanded((e) => new Set(e).add(row.id));
  }

  // ------- Photo upload -------
  async function uploadPhotosTo(section: Section, files: FileList | null) {
    if (!files || !files.length || !report) return;
    await repoUploadPhotos(section as any, files);
    toast.success(navigator.onLine ? `Queued ${files.length} photo(s)` : `Saved offline — ${files.length} photo(s) will upload when signal returns`);
  }

  async function deletePhoto(p: Photo) {
    if (!confirm(`Delete photo ${p.photo_number === "PENDING" ? "(pending)" : p.photo_number}?`)) return;
    await repoDeletePhoto(p as any);
  }

  // ------- Summary -------
  const summary = useMemo(() => {
    const total = sections.length;
    const completed = sections.filter((s) => s.status).length;
    const needsWork = sections.filter((s) => s.status === "Needs Work").length;
    const repairs = sections.filter((s) => s.repairs_required).length;
    const urgent = sections.filter((s) => s.repairs_required && s.priority === "Urgent").length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, needsWork, repairs, urgent, pct, photos: photos.length };
  }, [sections, photos]);

  // ------- Finish -------
  async function finishReport() {
    if (!report) return;
    const missingStatus = sections.filter((s) => !s.status);
    if (missingStatus.length) {
      toast.error(`Set status on all ${missingStatus.length} remaining area(s) first.`);
      return;
    }
    const repairMissing = sections.filter(
      (s) => s.repairs_required && !(s.repair_description?.trim() || s.comments?.trim())
    );
    if (repairMissing.length) {
      toast.error(`Add a repair description or comment for ${repairMissing.length} repair item(s).`);
      return;
    }
    if (!report.site_name?.trim()) {
      toast.error("Report needs a site/building name.");
      return;
    }
    if (!report.planned_visit_date && !report.report_date) {
      toast.error("Report needs a visit date.");
      return;
    }
    await repoSetReportStatus(report.id, "completed");
    setFinishOpen(false);
    toast.success(navigator.onLine ? "Report completed" : "Marked complete — will sync when signal returns");
  }

  async function reopenReport() {
    if (!report) return;
    await repoSetReportStatus(report.id, "active");
    toast.success("Report reopened");
  }

  // ------- Template -------
  async function saveAsTemplate() {
    if (!report || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? report.user_id;
      const areaNames = [...sections]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => s.area_name);
      await repoSaveTemplate(templateName.trim(), areaNames, userId);
      toast.success(navigator.onLine ? "Template saved" : "Template saved — will sync when signal returns");
      setSaveTemplateOpen(false);
      setTemplateName("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  // ------- Export -------
  async function downloadPdf() {
    if (!report) return;
    setDownloading(true);
    try {
      // Build PDF entries: repairs first, then sections, then ad hoc.
      const entries: PdfReport["entries"] = [];
      let num = 0;
      const order = [...sections].sort((a, b) => a.sort_order - b.sort_order);
      const repairs = order.filter((s) => s.repairs_required);
      const normal = order.filter((s) => !s.is_ad_hoc && !s.repairs_required);
      const ad = order.filter((s) => s.is_ad_hoc && !s.repairs_required);
      const push = (s: Section, cat: string) => {
        num++;
        entries.push({
          id: s.id,
          entry_number: num,
          description: [
            s.status ? `Status: ${s.status}` : null,
            s.comments?.trim() || null,
          ].filter(Boolean).join("\n\n"),
          recommendation: [
            s.repairs_required ? `Repair required${s.priority ? ` (${s.priority})` : ""}: ${s.repair_description ?? ""}` : null,
            s.action_required?.trim() || null,
            s.assigned_to?.trim() ? `Assigned to: ${s.assigned_to}` : null,
            s.target_completion_date ? `Target: ${s.target_completion_date}` : null,
          ].filter(Boolean).join("\n") || null,
          item_name: s.area_name,
          created_at: new Date().toISOString(),
          priority: s.priority,
          category: cat,
          location: null,
        });
        // Re-tag photos to this synthetic entry id for grouping
      };
      for (const s of repairs) push(s, "Repairs Required");
      for (const s of normal) push(s, "Inspection Areas");
      for (const s of ad) push(s, "Ad Hoc Items");
      // Map photos by section -> entry id (entry id stays same as section id since we used s.id)
      const data: PdfReport = {
        report: {
          report_name: report.report_name,
          site_name: report.site_name,
          site_code: report.site_code,
          report_date: report.planned_visit_date || report.report_date,
          report_type: report.report_type,
          inspection_time: report.inspection_time,
          client_name: report.client_name,
          notes: report.notes,
          inspector_name: report.inspector_name,
          area: report.area,
        },
        entries,
        photos: photos.map((p) => ({
          id: p.id,
          entry_id: p.section_id ?? p.entry_id,
          photo_number: p.photo_number,
          image_url: urls[p.image_path] ?? "",
          file_size: p.file_size,
          uploaded_at: p.uploaded_at,
          caption: p.caption,
        })),
      };
      const blob = await generateReportPdf(data);
      const filename = `${report.site_code}_${data.report.report_date}_report.pdf`;
      downloadBlob(blob, filename);
    } catch (err: any) {
      toast.error(err?.message ?? "PDF generation failed");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadZip() {
    if (!report) return;
    if (photos.length === 0) {
      toast.message("No photos to download.");
      return;
    }
    setZipping(true);
    try {
      const blob = await buildPhotosZip(
        photos.map((p) => ({
          id: p.id,
          photo_number: p.photo_number,
          entry_id: p.section_id ?? p.entry_id,
          image_path: p.image_path,
          uploaded_at: p.uploaded_at,
          file_size: p.file_size,
        })),
        sections.map((s) => ({
          id: s.id,
          entry_number: s.sort_order,
          description: s.area_name + (s.comments ? ` — ${s.comments}` : ""),
        }))
      );
      downloadBlob(blob, zipFilename(report.site_code, report.planned_visit_date || report.report_date, report.report_name));
      toast.success("Photos ZIP downloaded");
    } catch (err: any) {
      toast.error(err?.message ?? "ZIP creation failed");
    } finally {
      setZipping(false);
    }
  }

  // ------- Render -------
  if (loading || !report) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        Loading report…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-2 py-2">
          <div className="flex items-center justify-between">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="w-4 h-4 mr-1" /> Reports
              </Button>
            </Link>
            <div className="flex items-center gap-1">
              <OfflineIndicator />
              <Button variant="outline" size="sm" onClick={downloadPdf} disabled={downloading || !online} title={!online ? "Connect to download PDF" : "Download PDF"}>
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={downloadZip} disabled={zipping || photos.length === 0 || !online} title={!online ? "Connect to download ZIP" : "Download Photos ZIP"}>
                {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">ZIP</span>
              </Button>
              {report.status === "active" ? (
                <Button size="sm" onClick={() => setFinishOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Finish
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={reopenReport}>Reopen</Button>
              )}
            </div>
          </div>
          <div className="px-2 mt-1">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-slate-900 truncate">{report.report_name}</div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditReportOpen(true)} title="Edit report details">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
              <span className="truncate">{report.site_name}</span>
              <span>·</span>
              <span>{report.site_code}</span>
              {report.planned_visit_date && (<><span>·</span><span>Visit {report.planned_visit_date}</span></>)}
              {report.status !== "active" && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] uppercase">{report.status}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Summary */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900">Report summary</div>
            <div className="text-xs text-slate-500">{report.report_type ?? "Site Visit"}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="Areas" value={`${summary.completed}/${summary.total}`} />
            <Stat label="Progress" value={`${summary.pct}%`} />
            <Stat label="Needs work" value={summary.needsWork} tone={summary.needsWork ? "red" : "neutral"} />
            <Stat label="Repairs" value={summary.repairs} tone={summary.repairs ? "amber" : "neutral"} />
            <Stat label="Urgent" value={summary.urgent} tone={summary.urgent ? "red" : "neutral"} />
            <Stat label="Photos" value={summary.photos} />
          </div>
          {(report.planned_visit_date || report.due_date) && (
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-600">
              {report.planned_visit_date && <span>Visit: <strong className="text-slate-900">{report.planned_visit_date}</strong></span>}
              {report.due_date && <span>Due: <strong className="text-slate-900">{report.due_date}</strong></span>}
            </div>
          )}
          {sections.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => { setTemplateName(""); setSaveTemplateOpen(true); }}
              >
                <LayoutTemplate className="w-3.5 h-3.5 mr-1" /> Save areas as template
              </Button>
            </div>
          )}
        </Card>

        {readOnly && (
          <Card className="p-3 text-sm text-slate-600 bg-amber-50 border-amber-200">
            This report is {report.status}. Reopen it to make changes.
          </Card>
        )}

        {/* Sections */}
        <div className="space-y-3">
          {sections.length === 0 && (
            <Card className="p-6 text-sm text-slate-500 text-center">
              No inspection areas yet. Add one below.
            </Card>
          )}
          {[...sections]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((s) => (
              <SectionCard
                key={s.id}
                section={s}
                photos={photosBySection[s.id] ?? []}
                urls={urls}
                readOnly={readOnly}
                expanded={expanded.has(s.id)}
                onToggle={() =>
                  setExpanded((e) => {
                    const n = new Set(e);
                    n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                    return n;
                  })
                }
                onPatch={(patch) => saveSection(s.id, patch)}
                onDelete={() => deleteSection(s)}
                onMove={(dir) => moveSection(s, dir)}
                onUpload={(files) => uploadPhotosTo(s, files)}
                onDeletePhoto={deletePhoto}
                onPreview={setPreviewUrl}
              />
            ))}
        </div>

        {!readOnly && (
          <Button onClick={addAdHoc} variant="outline" className="w-full h-12 border-dashed border-slate-300">
            <Plus className="w-4 h-4 mr-1" /> Add Ad Hoc Item
          </Button>
        )}
      </main>

      {/* Finish dialog */}
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this report?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-600">
            <p>{summary.completed}/{summary.total} areas · {summary.repairs} repairs · {summary.photos} photos</p>
            <p>You can reopen the report later if you need to make changes.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOpen(false)}>Cancel</Button>
            <Button onClick={finishReport} className="bg-slate-900 hover:bg-slate-800">Complete report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>This will save the current {sections.length} area name(s) as a reusable template for future reports.</p>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Shopping Centre Standard"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveAsTemplate(); } }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
            <Button
              disabled={!templateName.trim() || savingTemplate}
              onClick={saveAsTemplate}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditReportDialog
        open={editReportOpen}
        onOpenChange={setEditReportOpen}
        report={report}
        onSaved={load}
      />

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewUrl && <img src={previewUrl} alt="Preview" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "neutral" | "red" | "amber" }) {
  const cls =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function SectionCard({
  section,
  photos,
  urls,
  readOnly,
  expanded,
  onToggle,
  onPatch,
  onDelete,
  onMove,
  onUpload,
  onDeletePhoto,
  onPreview,
}: {
  section: Section;
  photos: Photo[];
  urls: Record<string, string>;
  readOnly: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Section>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onUpload: (files: FileList | null) => void;
  onDeletePhoto: (p: Photo) => void;
  onPreview: (url: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const tone = statusTone(section.status);

  // Local autosave for comments / repair description
  const [comments, setComments] = useState(section.comments ?? "");
  const [repairDesc, setRepairDesc] = useState(section.repair_description ?? "");
  const [action, setAction] = useState(section.action_required ?? "");
  const [assigned, setAssigned] = useState(section.assigned_to ?? "");
  const [target, setTarget] = useState(section.target_completion_date ?? "");
  const [savingState, setSavingState] = useState<"" | "saving" | "saved">("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setComments(section.comments ?? "");
    setRepairDesc(section.repair_description ?? "");
    setAction(section.action_required ?? "");
    setAssigned(section.assigned_to ?? "");
    setTarget(section.target_completion_date ?? "");
  }, [section.id]);

  function debounceSave(patch: Partial<Section>) {
    setSavingState("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await onPatch(patch);
      setSavingState("saved");
      window.setTimeout(() => setSavingState(""), 1200);
    }, 500);
  }

  const photoCount = photos.length;
  const hasComment = !!(section.comments && section.comments.trim());

  return (
    <Card className={`overflow-hidden ${section.repairs_required ? "border-amber-300" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-slate-50"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-slate-900 truncate">{section.area_name}</div>
            {section.is_ad_hoc && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] uppercase">Ad hoc</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${tone.bg} ${tone.text} ${tone.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} /> {tone.label}
            </span>
            {section.repairs_required && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Wrench className="w-3 h-3" /> Repair{section.priority ? ` · ${section.priority}` : ""}
              </span>
            )}
            {photoCount > 0 && (
              <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {photoCount}</span>
            )}
            {hasComment && <span>· Note</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
          {/* Status */}
          <div>
            <Label className="text-xs">Status</Label>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {STATUS_OPTIONS.map((opt) => {
                const t = statusTone(opt);
                const active = section.status === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onPatch({ status: opt })}
                    className={`text-[10px] sm:text-xs px-1 py-2 rounded border text-center font-medium ${
                      active ? `${t.bg} ${t.text} ${t.border}` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comments */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Comments</Label>
              <span className="text-[10px] text-slate-400 h-3">
                {savingState === "saving" && "Saving…"}
                {savingState === "saved" && "Saved"}
              </span>
            </div>
            <Textarea
              rows={2}
              disabled={readOnly}
              value={comments}
              onChange={(e) => { setComments(e.target.value); debounceSave({ comments: e.target.value }); }}
              placeholder="Add site observation, tenant concern, maintenance issue, or follow-up note…"
              className="resize-none"
            />
          </div>

          {/* Repairs */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`rep-${section.id}`}
              checked={section.repairs_required}
              disabled={readOnly}
              onCheckedChange={(v) => onPatch({ repairs_required: !!v })}
            />
            <Label htmlFor={`rep-${section.id}`} className="text-sm font-medium cursor-pointer">
              <Wrench className="w-3.5 h-3.5 inline mr-1" /> Repairs required
            </Label>
          </div>

          {section.repairs_required && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-3">
              <div>
                <Label className="text-xs">Repair description</Label>
                <Textarea rows={2} disabled={readOnly} value={repairDesc}
                  onChange={(e) => { setRepairDesc(e.target.value); debounceSave({ repair_description: e.target.value }); }}
                  placeholder="Describe the repair required…" className="resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select value={section.priority ?? ""} disabled={readOnly} onValueChange={(v) => onPatch({ priority: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Target date</Label>
                  <Input type="date" disabled={readOnly} value={target}
                    onChange={(e) => { setTarget(e.target.value); debounceSave({ target_completion_date: e.target.value || null }); }} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Assigned to</Label>
                <Input disabled={readOnly} value={assigned}
                  onChange={(e) => { setAssigned(e.target.value); debounceSave({ assigned_to: e.target.value || null }); }}
                  placeholder="Name or contractor" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id={`fu-${section.id}`} checked={section.follow_up_required} disabled={readOnly}
                  onCheckedChange={(v) => onPatch({ follow_up_required: !!v })} />
                <Label htmlFor={`fu-${section.id}`} className="text-xs cursor-pointer">Follow-up required</Label>
              </div>
            </div>
          )}

          {/* Action / assignment for non-repair items */}
          {!section.repairs_required && (
            <div>
              <Label className="text-xs">Action required (optional)</Label>
              <Input disabled={readOnly} value={action}
                onChange={(e) => { setAction(e.target.value); debounceSave({ action_required: e.target.value || null }); }}
                placeholder="Any follow-up action" />
            </div>
          )}

          {/* Photos */}
          <div>
            <Label className="text-xs">Photos ({photos.length})</Label>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-1">
                {photos.map((p) => (
                  <div key={p.id} className="relative aspect-square rounded-md overflow-hidden group">
                    {(() => {
                      const anyP = p as any;
                      const previewUrl = anyP.__previewUrl ?? urls[p.image_path] ?? null;
                      return previewUrl ? (
                        <button type="button" onClick={() => onPreview(previewUrl)} className="w-full h-full">
                          <img src={previewUrl} alt={p.photo_number} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-full h-full bg-slate-200 grid place-items-center text-[9px] text-slate-500">offline</div>
                      );
                    })()}
                    <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] px-1 py-0.5 truncate">
                      {(p as any)._pending ? "queued" : p.photo_number.split("-").slice(-1)[0]}
                    </div>
                    {(p as any)._pending && (
                      <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-amber-500/90 text-white text-[9px] font-medium">PENDING</div>
                    )}
                    {!readOnly && (
                      <button type="button" onClick={() => onDeletePhoto(p)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white grid place-items-center">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!readOnly && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button onClick={() => cameraRef.current?.click()} className="h-11 bg-slate-900 hover:bg-slate-800">
                  <Camera className="w-4 h-4 mr-1" /> Take photo
                </Button>
                <Button onClick={() => galleryRef.current?.click()} variant="outline" className="h-11 border-slate-300">
                  <Upload className="w-4 h-4 mr-1" /> From gallery
                </Button>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { onUpload(e.target.files); if (cameraRef.current) cameraRef.current.value = ""; }} />
                <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { onUpload(e.target.files); if (galleryRef.current) galleryRef.current.value = ""; }} />
              </div>
            )}
          </div>

          {/* Card footer actions */}
          {!readOnly && (
            <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(-1)} title="Move up">
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(1)} title="Move down">
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                const name = prompt("Rename area", section.area_name);
                if (name && name.trim() && name !== section.area_name) {
                  onPatch({ area_name: name.trim(), area_slug: slugifyArea(name) });
                }
              }} title="Rename">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} title="Delete">
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EditReportDialog({
  open,
  onOpenChange,
  report,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: Report;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    report_name: report.report_name,
    site_name: report.site_name,
    site_code: report.site_code,
    planned_visit_date: report.planned_visit_date ?? report.report_date ?? "",
    due_date: report.due_date ?? "",
    inspection_time: report.inspection_time ?? "",
    inspector_name: report.inspector_name ?? "",
    report_type: report.report_type ?? REPORT_TYPES[0],
    client_name: report.client_name ?? "",
    notes: report.notes ?? "",
    status: report.status as "active" | "completed" | "archived",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        report_name: report.report_name,
        site_name: report.site_name,
        site_code: report.site_code,
        planned_visit_date: report.planned_visit_date ?? report.report_date ?? "",
        due_date: report.due_date ?? "",
        inspection_time: report.inspection_time ?? "",
        inspector_name: report.inspector_name ?? "",
        report_type: report.report_type ?? REPORT_TYPES[0],
        client_name: report.client_name ?? "",
        notes: report.notes ?? "",
        status: report.status,
      });
    }
  }, [open, report]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.report_name.trim() || !form.site_name.trim() || !form.site_code.trim()) {
      toast.error("Report name, site name and site code are required");
      return;
    }
    setSaving(true);
    try {
      const updates = {
        report_name: form.report_name.trim(),
        site_name: form.site_name.trim(),
        site_code: form.site_code.trim().toUpperCase(),
        planned_visit_date: form.planned_visit_date || null,
        report_date: form.planned_visit_date || report.report_date,
        due_date: form.due_date || null,
        inspection_time: form.inspection_time || null,
        inspector_name: form.inspector_name.trim() || null,
        report_type: form.report_type,
        client_name: form.client_name.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };
      await repoPatchReport(report.id, updates as any);
      toast.success("Report saved");
      await onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit report details</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Report name *</Label>
            <Input value={form.report_name} onChange={(e) => setForm({ ...form, report_name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Site / building *</Label>
              <Input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Site code *</Label>
              <Input value={form.site_code} onChange={(e) => setForm({ ...form, site_code: e.target.value.toUpperCase() })} maxLength={8} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Planned visit date</Label>
              <Input type="date" value={form.planned_visit_date} onChange={(e) => setForm({ ...form, planned_visit_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Inspection time</Label>
              <Input type="time" value={form.inspection_time} onChange={(e) => setForm({ ...form, inspection_time: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Inspector</Label>
              <Input value={form.inspector_name} onChange={(e) => setForm({ ...form, inspector_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Report type</Label>
            <Select value={form.report_type} onValueChange={(v) => setForm({ ...form, report_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Landlord / client (optional)</Label>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-slate-900 hover:bg-slate-800">
              {saving ? "Saving…" : (<><Save className="w-4 h-4 mr-1" /> Save changes</>)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}