import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  FolderOpen,
  LogOut,
  Archive,
  Camera,
  Image as ImageIcon,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { MjwLogo } from "@/components/mjw-logo";
import { cacheReportsList, listCachedReports, setReportStatus as repoSetReportStatus } from "@/lib/offline/repo";
import { subscribeChange, subscribeSync } from "@/lib/offline/sync";
import { OfflineIndicator } from "@/components/offline-indicator";

type Report = {
  id: string;
  report_name: string;
  site_name: string;
  site_code: string;
  report_date: string;
  planned_visit_date: string | null;
  due_date: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
  updated_at: string;
  inspector_name: string | null;
};

type Counts = {
  photos: number;
  totalAreas: number;
  completedAreas: number;
  needsWork: number;
  repairs: number;
};

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "Reports — MJW Site Report" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);

  async function load() {
    setLoading(true);
    // Paint cached list immediately
    try {
      const cached = await listCachedReports();
      if (cached.length) setReports(cached as Report[]);
    } catch { /* IDB unavailable */ }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      // Network/RLS failure — keep cached view
      console.warn(error.message);
      setLoading(false);
      return;
    }
    const rs = (data ?? []) as Report[];
    setReports(rs);
    try { await cacheReportsList(rs as any); } catch { /* ignore */ }
    const ids = rs.map((r) => r.id);
    if (ids.length) {
      const [{ data: secs }, { data: phs }] = await Promise.all([
        supabase.from("inspection_sections").select("report_id, status, repairs_required").in("report_id", ids),
        supabase.from("photos").select("report_id").in("report_id", ids),
      ]);
      const c: Record<string, Counts> = {};
      for (const id of ids) c[id] = { photos: 0, totalAreas: 0, completedAreas: 0, needsWork: 0, repairs: 0 };
      (secs ?? []).forEach((s: any) => {
        const cc = c[s.report_id];
        cc.totalAreas++;
        if (s.status) cc.completedAreas++;
        if (s.status === "Needs Work") cc.needsWork++;
        if (s.repairs_required) cc.repairs++;
      });
      (phs ?? []).forEach((p: any) => (c[p.report_id].photos += 1));
      setCounts(c);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const u1 = subscribeChange(() => { void load(); });
    const u2 = subscribeSync((s) => setOnline(s.online));
    return () => { u1(); u2(); };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function setStatus(id: string, status: Report["status"]) {
    await repoSetReportStatus(id, status);
    toast.success(`Report ${status}`);
  }

  const active = reports.filter((r) => r.status === "active");
  const completed = reports.filter((r) => r.status === "completed");
  const archived = reports.filter((r) => r.status === "archived");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MjwLogo size={28} />
            <div className="font-serif text-base text-slate-900">
              MJW <em className="not-italic" style={{ color: "var(--mjw-gold-lt)" }}>Site Report</em>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <OfflineIndicator />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        <div className="grid grid-cols-1 gap-3">
          {online ? (
            <Link to="/new">
              <Button className="w-full h-20 text-base font-semibold flex flex-col gap-1 bg-slate-900 hover:bg-slate-800">
                <Plus className="w-5 h-5" />
                Start New Report
              </Button>
            </Link>
          ) : (
            <Button disabled className="w-full h-20 text-base font-semibold flex flex-col gap-1" title="Connect to start a new report">
              <Plus className="w-5 h-5" />
              Start New Report
              <span className="text-[10px] font-normal opacity-70">Requires signal</span>
            </Button>
          )}
          <ContinueButton reports={active} />
        </div>

        <Tabs defaultValue="active">
          <TabsList className="w-full">
            <TabsTrigger value="active" className="flex-1">
              Active ({active.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">
              Completed ({completed.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="flex-1">
              Archived ({archived.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            <ReportList
              reports={active}
              counts={counts}
              loading={loading}
              emptyText="No active reports. Start a new one."
              onArchive={(id) => setStatus(id, "archived")}
            />
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            <ReportList
              reports={completed}
              counts={counts}
              loading={loading}
              emptyText="No completed reports yet."
              onArchive={(id) => setStatus(id, "archived")}
              onReopen={(id) => setStatus(id, "active")}
            />
          </TabsContent>
          <TabsContent value="archived" className="mt-4">
            <ReportList
              reports={archived}
              counts={counts}
              loading={loading}
              emptyText="Archive is empty."
              onReopen={(id) => setStatus(id, "active")}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ContinueButton({ reports }: { reports: Report[] }) {
  const navigate = useNavigate();
  function onClick() {
    if (reports.length === 0) {
      toast.message("No current report found. Start a new report first.");
      return;
    }
    // Most recent active
    navigate({ to: "/reports/$id", params: { id: reports[0].id } });
  }
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="w-full h-20 text-base font-semibold flex flex-col gap-1 border-slate-300"
    >
      <FolderOpen className="w-5 h-5" />
      Add to Current Report
    </Button>
  );
}

function ReportList({
  reports,
  counts,
  loading,
  emptyText,
  onArchive,
  onReopen,
}: {
  reports: Report[];
  counts: Record<string, Counts>;
  loading: boolean;
  emptyText: string;
  onArchive?: (id: string) => void;
  onReopen?: (id: string) => void;
}) {
  if (loading) return <div className="text-sm text-slate-500 py-6 text-center">Loading…</div>;
  if (reports.length === 0)
    return <div className="text-sm text-slate-500 py-6 text-center">{emptyText}</div>;
  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const c = counts[r.id] ?? { photos: 0, totalAreas: 0, completedAreas: 0, needsWork: 0, repairs: 0 };
        const pct = c.totalAreas ? Math.round((c.completedAreas / c.totalAreas) * 100) : 0;
        return (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 truncate">{r.report_name}</div>
                <div className="text-sm text-slate-600 truncate">{r.site_name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {r.site_code}
                  {r.planned_visit_date ? ` · Visit ${r.planned_visit_date}` : ` · ${r.report_date}`}
                  {r.due_date ? ` · Due ${r.due_date}` : ""}
                </div>
                {c.totalAreas > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      {c.completedAreas}/{c.totalAreas} areas · {pct}%
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-600 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> {c.photos}
                  </span>
                  {c.needsWork > 0 && (
                    <span className="text-red-700">⚠ {c.needsWork} needs work</span>
                  )}
                  {c.repairs > 0 && (
                    <span className="text-amber-700">🔧 {c.repairs} repair{c.repairs > 1 ? "s" : ""}</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Updated {new Date(r.updated_at).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Link to="/reports/$id" params={{ id: r.id }} className="flex-1">
                <Button size="sm" className="w-full bg-slate-900 hover:bg-slate-800">
                  Open
                </Button>
              </Link>
              {onReopen && (
                <Button size="sm" variant="outline" onClick={() => onReopen(r.id)}>
                  <ArchiveRestore className="w-4 h-4 mr-1" /> Reopen
                </Button>
              )}
              {onArchive && (
                <Button size="sm" variant="outline" onClick={() => onArchive(r.id)}>
                  <Archive className="w-4 h-4 mr-1" /> Archive
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}