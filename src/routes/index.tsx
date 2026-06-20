import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FolderOpen, Archive, ArchiveRestore, Image as ImageIcon, Wrench, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { OfflineIndicator } from "@/components/offline-indicator";
import { listReports, setReportStatus, getSections, getPhotos } from "@/lib/repo";
import type { ReportRow, SectionRow } from "@/lib/db";

export const Route = createFileRoute("/")({ component: DashboardPage });

type Counts = { photos: number; totalAreas: number; completedAreas: number; needsWork: number; repairs: number };

function DashboardPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { void load(); }, []);

  async function archive(id: string, status: ReportRow["status"]) {
    await setReportStatus(id, status);
    toast.success(`Report ${status}`);
    void load();
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
          <OfflineIndicator />
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
            {[["active", active.length], ["completed", completed.length], ["archived", archived.length]].map(([key, count]) => (
              <TabsTrigger key={key} value={key as string}
                className="flex-1 rounded-lg text-xs font-medium capitalize data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white"
                style={{ color: "var(--text-2)" }}>
                {key} ({count})
              </TabsTrigger>
            ))}
          </TabsList>

          {[
            { key: "active", list: active, empty: "No active reports — start one above.", showArchive: true },
            { key: "completed", list: completed, empty: "No completed reports yet.", showArchive: true, showReopen: true },
            { key: "archived", list: archived, empty: "Archive is empty.", showReopen: true },
          ].map(({ key, list, empty, showArchive, showReopen }) => (
            <TabsContent key={key} value={key} className="mt-3 space-y-3">
              {loading
                ? <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>Loading…</p>
                : !list.length
                  ? <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>{empty}</p>
                  : list.map((r) => <ReportCard key={r.id} report={r} counts={counts[r.id]} showArchive={showArchive} showReopen={showReopen}
                      onArchive={() => archive(r.id, "archived")} onReopen={() => archive(r.id, "active")} />)
              }
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

function ReportCard({ report: r, counts: c, showArchive, showReopen, onArchive, onReopen }: {
  report: ReportRow; counts?: Counts;
  showArchive?: boolean; showReopen?: boolean;
  onArchive: () => void; onReopen: () => void;
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
      </div>
    </div>
  );
}
