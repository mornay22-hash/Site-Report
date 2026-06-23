import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FolderOpen, Archive, ArchiveRestore, Image as ImageIcon, Wrench, AlertTriangle, Trash2, Settings, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { OfflineIndicator } from "@/components/offline-indicator";
import { listReports, setReportStatus, getSections, getPhotos, deleteReport } from "@/lib/repo";
import { loadTemplates, deleteTemplate, updateTemplate, type SavedTemplate } from "@/lib/report-templates";
import { REPORT_TYPES } from "@/lib/templates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { syncReports } from "@/lib/sync";
import type { ReportRow, SectionRow } from "@/lib/db";

export const Route = createFileRoute("/")({ component: DashboardPage });

type Counts = { photos: number; totalAreas: number; completedAreas: number; needsWork: number; repairs: number };

function DashboardPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ReportRow | null>(null);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [deleteTplTarget, setDeleteTplTarget] = useState<SavedTemplate | null>(null);
  const [editTplTarget, setEditTplTarget] = useState<SavedTemplate | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rs = await listReports();
      setReports(rs);
      const c: Record<string, Counts> = {};
      await Promise.all(rs.map(async (r) => {
        const [secs, photos] = await Promise.all([getSections(r.id), getPhotos(r.id)]);
        c[r.id] = {
          photos: photos.length,
          totalAreas: secs.length,
          completedAreas: secs.filter((s: SectionRow) => s.status).length,
          needsWork: secs.filter((s: SectionRow) => s.status === "Needs Work").length,
          repairs: secs.filter((s: SectionRow) => s.repairs_required).length,
        };
      }));
      setCounts(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function reloadTemplates() {
    setTemplates(loadTemplates());
  }

  useEffect(() => {
    // Pull from cloud first, then load local
    setSyncing(true);
    syncReports()
      .then(() => load())
      .catch(() => load())
      .finally(() => setSyncing(false));
    reloadTemplates();
  }, []);

  async function manualSync() {
    setSyncing(true);
    const result = await syncReports();
    if (result.ok) { toast.success("Synced"); void load(); }
    else toast.error(`Sync failed: ${result.error}`);
    setSyncing(false);
  }

  async function archive(id: string, status: ReportRow["status"]) {
    await setReportStatus(id, status);
    toast.success(`Report ${status}`);
    void load();
    syncReports().catch(() => {});
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteReport(deleteTarget.id);
    toast.success("Report deleted");
    setDeleteTarget(null);
    void load();
  }

  function confirmDeleteTemplate() {
    if (!deleteTplTarget) return;
    deleteTemplate(deleteTplTarget.id);
    toast.success("Template deleted");
    setDeleteTplTarget(null);
    reloadTemplates();
  }

  const active = reports.filter((r) => r.status === "active");
  const completed = reports.filter((r) => r.status === "completed");
  const archived = reports.filter((r) => r.status === "archived");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="MJW" className="w-8 h-8 object-contain" />
            <span className="font-semibold text-base" style={{ color: "var(--text-1)" }}>
              MJW <span style={{ color: "var(--mjw-gold)" }}>Site Report</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={manualSync} disabled={syncing} title="Sync across devices"
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40"
              style={{ color: "var(--text-3)" }}>
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            </button>
            <OfflineIndicator />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/new" className="col-span-2 sm:col-span-1">
            <button className="w-full h-16 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:opacity-75"
              style={{ background: "var(--accent)", color: "#fff" }}>
              <Plus className="w-4 h-4" /> Start New Report
            </button>
          </Link>
          <button
            onClick={() => {
              if (!active.length) { toast.message("No active report. Start a new one first."); return; }
              navigate({ to: "/reports/$id", params: { id: active[0].id } });
            }}
            className="col-span-2 sm:col-span-1 w-full h-16 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border transition-colors hover:opacity-80"
            style={{ background: "var(--bg-card-2)", borderColor: "var(--border)", color: "var(--text-1)" }}>
            <FolderOpen className="w-4 h-4" style={{ color: "var(--mjw-gold)" }} />
            Continue Current Report
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active">
          <TabsList className="w-full rounded-xl p-1" style={{ background: "var(--bg-card)", border: `1px solid var(--border)` }}>
            {(["active", "completed", "archived", "settings"] as const).map((key) => {
              const count = key === "active" ? active.length : key === "completed" ? completed.length : key === "archived" ? archived.length : null;
              return (
                <TabsTrigger key={key} value={key}
                  className="flex-1 rounded-lg text-xs font-medium capitalize data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white"
                  style={{ color: "var(--text-2)" }}>
                  {key === "settings" ? <Settings className="w-3.5 h-3.5" /> : `${key} (${count})`}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {[
            { key: "active", list: active, empty: "No active reports — start one above.", showArchive: true },
            { key: "completed", list: completed, empty: "No completed reports yet.", showArchive: true, showReopen: true },
            { key: "archived", list: archived, empty: "Archive is empty.", showReopen: true, showDelete: true },
          ].map(({ key, list, empty, showArchive, showReopen, showDelete }) => (
            <TabsContent key={key} value={key} className="mt-3 space-y-3">
              {loading
                ? <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>Loading…</p>
                : !list.length
                  ? <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>{empty}</p>
                  : list.map((r) => <ReportCard key={r.id} report={r} counts={counts[r.id]}
                      showArchive={showArchive} showReopen={showReopen} showDelete={showDelete}
                      onArchive={() => archive(r.id, "archived")} onReopen={() => archive(r.id, "active")}
                      onDelete={() => setDeleteTarget(r)} />)
              }
            </TabsContent>
          ))}

          {/* Settings tab */}
          <TabsContent value="settings" className="mt-3 space-y-4">
            <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4" style={{ color: "var(--mjw-gold)" }} />
                <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Saved Report Templates</span>
              </div>
              <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>
                Templates let you pre-fill report details when creating a new report. Save them from the New Report page.
              </p>
              {templates.length === 0 ? (
                <p className="text-center py-6 text-sm" style={{ color: "var(--text-3)" }}>
                  No templates saved yet. When creating a new report, click "Save as Template" to store your settings.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"
                      style={{ background: "var(--bg-card-2)", borderColor: "var(--border)" }}>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                        <div className="text-xs mt-0.5 flex gap-2 flex-wrap" style={{ color: "var(--text-3)" }}>
                          <span className="font-mono" style={{ color: "var(--mjw-gold)" }}>{t.site_code}</span>
                          <span>{t.site_name}</span>
                          <span>{t.report_type}</span>
                        </div>
                        {t.report_name_pattern && (
                          <div className="text-xs mt-0.5 italic" style={{ color: "var(--text-3)" }}>Pattern: {t.report_name_pattern}</div>
                        )}
                        {(t.areas?.length ?? 0) > 0 && (
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{t.areas.length} preset areas</div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditTplTarget(t)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
                          style={{ background: "var(--bg-base)", color: "var(--text-3)" }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTplTarget(t)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
                          style={{ background: "var(--bg-base)", color: "var(--text-3)" }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete report confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-1)" }}>
          <DialogHeader>
            <DialogTitle>Delete Report?</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Are you sure you want to permanently delete <strong>{deleteTarget?.report_name}</strong>?
            This will remove all sections, photos, and data. This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <button onClick={() => setDeleteTarget(null)}
              className="h-9 px-4 rounded-lg text-sm border"
              style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--bg-card-2)" }}>
              Cancel
            </button>
            <button onClick={confirmDelete}
              className="h-9 px-4 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">
              Delete permanently
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit template dialog */}
      {editTplTarget && (
        <EditTemplateDialog
          template={editTplTarget}
          onClose={() => setEditTplTarget(null)}
          onSaved={() => { reloadTemplates(); setEditTplTarget(null); }}
        />
      )}

      {/* Delete template confirmation */}
      <Dialog open={!!deleteTplTarget} onOpenChange={(o) => { if (!o) setDeleteTplTarget(null); }}>
        <DialogContent style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-1)" }}>
          <DialogHeader>
            <DialogTitle>Delete Template?</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Delete the template <strong>{deleteTplTarget?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <button onClick={() => setDeleteTplTarget(null)}
              className="h-9 px-4 rounded-lg text-sm border"
              style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--bg-card-2)" }}>
              Cancel
            </button>
            <button onClick={confirmDeleteTemplate}
              className="h-9 px-4 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportCard({ report: r, counts: c, showArchive, showReopen, showDelete, onArchive, onReopen, onDelete }: {
  report: ReportRow; counts?: Counts;
  showArchive?: boolean; showReopen?: boolean; showDelete?: boolean;
  onArchive: () => void; onReopen: () => void; onDelete: () => void;
}) {
  const cc = c ?? { photos: 0, totalAreas: 0, completedAreas: 0, needsWork: 0, repairs: 0 };
  const pct = cc.totalAreas ? Math.round((cc.completedAreas / cc.totalAreas) * 100) : 0;

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate" style={{ color: "var(--text-1)" }}>{r.report_name}</div>
          <div className="text-sm truncate mt-0.5" style={{ color: "var(--text-2)" }}>{r.site_name}</div>
          <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: "var(--text-3)" }}>
            <span className="font-mono" style={{ color: "var(--mjw-gold)" }}>{r.site_code}</span>
            {r.planned_visit_date && <span>Visit {r.planned_visit_date}</span>}
            {r.due_date && <span>Due {r.due_date}</span>}
          </div>
        </div>
        {r.status !== "active" && (
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "var(--bg-card-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
            {r.status}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {cc.totalAreas > 0 && (
        <div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card-2)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : "var(--accent)" }} />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span>{cc.completedAreas}/{cc.totalAreas} areas · {pct}%</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {cc.photos}</span>
              {cc.needsWork > 0 && <span className="flex items-center gap-1 text-red-400"><AlertTriangle className="w-3 h-3" /> {cc.needsWork}</span>}
              {cc.repairs > 0 && <span className="flex items-center gap-1 text-amber-400"><Wrench className="w-3 h-3" /> {cc.repairs}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Link to="/reports/$id" params={{ id: r.id }} className="flex-1">
          <button className="w-full h-9 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff" }}>
            Open
          </button>
        </Link>
        {showReopen && (
          <button onClick={onReopen} className="h-9 px-3 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1"
            style={{ background: "var(--bg-card-2)", borderColor: "var(--border)", color: "var(--text-2)" }}>
            <ArchiveRestore className="w-3.5 h-3.5" /> Reopen
          </button>
        )}
        {showArchive && (
          <button onClick={onArchive} className="h-9 px-3 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1"
            style={{ background: "var(--bg-card-2)", borderColor: "var(--border)", color: "var(--text-2)" }}>
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
        )}
        {showDelete && (
          <button onClick={onDelete} className="h-9 px-3 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 flex items-center gap-1 text-red-400"
            style={{ background: "var(--bg-card-2)", borderColor: "var(--border)" }}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

function EditTemplateDialog({ template, onClose, onSaved }: {
  template: SavedTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [siteName, setSiteName] = useState(template.site_name);
  const [siteCode, setSiteCode] = useState(template.site_code);
  const [reportType, setReportType] = useState(template.report_type);
  const [reportNamePattern, setReportNamePattern] = useState(template.report_name_pattern);
  const [area, setArea] = useState(template.area);
  const [inspectorName, setInspectorName] = useState(template.inspector_name);
  const [areasText, setAreasText] = useState((template.areas ?? []).join("\n"));

  function onSave() {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    const areas = areasText.split("\n").map((l) => l.trim()).filter(Boolean);
    updateTemplate(template.id, {
      name: name.trim(),
      site_name: siteName.trim(),
      site_code: siteCode.trim().toUpperCase(),
      report_type: reportType,
      report_name_pattern: reportNamePattern.trim(),
      area: area.trim(),
      inspector_name: inspectorName.trim(),
      areas,
    });
    toast.success("Template updated");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-1)" }}>
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Template name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Site / building</Label>
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Site code</Label>
              <Input value={siteCode} onChange={(e) => setSiteCode(e.target.value.toUpperCase())} maxLength={8} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Report type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REPORT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Report name pattern</Label>
            <Input value={reportNamePattern} onChange={(e) => setReportNamePattern(e.target.value)} placeholder="{site} - {month}" />
            <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Use {"{site}"} and {"{month}"} as placeholders.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Area / section</Label>
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Inspector</Label>
              <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preset inspection areas (one per line)</Label>
            <Textarea
              rows={8}
              value={areasText}
              onChange={(e) => setAreasText(e.target.value)}
              placeholder={"Reception\nLobby\nParking\nRooftop\n..."}
              className="resize-none font-mono text-xs"
            />
            <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
              These areas will be automatically created when you start a report using this template.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--bg-card-2)" }}>
            Cancel
          </button>
          <button onClick={onSave}
            className="h-9 px-4 rounded-lg text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#fff" }}>
            Save template
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
