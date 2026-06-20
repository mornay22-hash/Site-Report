import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { createReport } from "@/lib/repo";
import { generateSiteCode } from "@/lib/site-code";
import { REPORT_TYPES } from "@/lib/templates";

export const Route = createFileRoute("/new")({
  component: NewReportPage,
});

function NewReportPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [reportName, setReportName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [plannedVisitDate, setPlannedVisitDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [reportType, setReportType] = useState<string>(REPORT_TYPES[0]);
  const [area, setArea] = useState("");
  const [inspectorName, setInspectorName] = useState(() => localStorage.getItem("mjw-inspector") ?? "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rn = reportName.trim();
    const sn = siteName.trim();
    if (!rn) return toast.error("Report name is required");
    if (!sn) return toast.error("Site / building name is required");
    setLoading(true);
    try {
      if (inspectorName.trim()) localStorage.setItem("mjw-inspector", inspectorName.trim());
      const report = await createReport({
        report_name: rn,
        site_name: sn,
        site_code: siteCode.trim() || generateSiteCode(sn),
        planned_visit_date: plannedVisitDate || undefined,
        due_date: dueDate || undefined,
        report_type: reportType,
        area: area.trim() || undefined,
        inspector_name: inspectorName.trim() || undefined,
      });
      navigate({ to: "/reports/$id", params: { id: report.id }, replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-2 h-14 flex items-center">
          <Link to="/">
            <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
          <div className="font-semibold text-slate-900 ml-2">New Site Visit Report</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5">
        <Card className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Report name *">
              <Input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="e.g. June 2026 Site Visit" required />
            </Field>
            <Field label="Site / building name *">
              <Input value={siteName} onChange={(e) => { setSiteName(e.target.value); if (!siteCode) setSiteCode(generateSiteCode(e.target.value)); }} required />
            </Field>
            <Field label="Site code" hint="Auto-generated from site name. Used in photo numbering.">
              <Input value={siteCode} onChange={(e) => setSiteCode(e.target.value.toUpperCase())} maxLength={8} placeholder={generateSiteCode(siteName || "SITE")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned visit date">
                <Input type="date" value={plannedVisitDate} onChange={(e) => setPlannedVisitDate(e.target.value)} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Report type">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Area / section (optional)">
              <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. North Block" />
            </Field>
            <Field label="Inspector name">
              <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="Your name" />
            </Field>
            <p className="text-xs text-slate-500">
              12 standard inspection areas will be preloaded automatically. Works fully offline — no signal needed.
            </p>
            <Button type="submit" disabled={loading} className="w-full h-12 text-base bg-slate-900 hover:bg-slate-800">
              {loading ? "Creating…" : "Create report"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
