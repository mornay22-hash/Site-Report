import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, Building2 } from "lucide-react";
import { createReport } from "@/lib/repo";
import { generateSiteCode } from "@/lib/site-code";
import { REPORT_TYPES } from "@/lib/templates";
import { BUILDINGS } from "@/lib/buildings";

export const Route = createFileRoute("/new")({
  component: NewReportPage,
});

function NewReportPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [reportName, setReportName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [plannedVisitDate, setPlannedVisitDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [reportType, setReportType] = useState<string>(REPORT_TYPES[0]);
  const [area, setArea] = useState("");
  const [inspectorName, setInspectorName] = useState(() => localStorage.getItem("mjw-inspector") ?? "");
  const [loading, setLoading] = useState(false);

  function onBuildingSelect(value: string) {
    setSelectedBuilding(value);
    if (value === "__custom__") {
      setSiteName("");
      setSiteCode("");
      return;
    }
    const b = BUILDINGS.find((b) => b.code === value);
    if (!b) return;
    setSiteName(b.name);
    setSiteCode(b.code);
    // Auto-set report name if empty
    if (!reportName) {
      const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });
      setReportName(`${b.name} — ${month}`);
    }
  }

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

  const isCustom = selectedBuilding === "__custom__" || selectedBuilding === "";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-2 h-14 flex items-center">
          <Link to="/">
            <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
          <div className="font-semibold text-slate-900 ml-2">New Site Visit Report</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <Card className="p-5 shadow-sm">
          <form onSubmit={onSubmit} className="space-y-5">

            {/* Building selector */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-amber-500" />
                Select building *
              </Label>
              <Select value={selectedBuilding} onValueChange={onBuildingSelect}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-300 text-slate-900">
                  <SelectValue placeholder="Choose a building…" />
                </SelectTrigger>
                <SelectContent>
                  {BUILDINGS.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      <span className="font-medium">{b.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{b.code}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">
                    <span className="text-slate-500 italic">Enter manually…</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Site name + code — shown always but readonly when building selected */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-slate-600">Site / building name *</Label>
                <Input
                  value={siteName}
                  onChange={(e) => { setSiteName(e.target.value); if (isCustom && !siteCode) setSiteCode(generateSiteCode(e.target.value)); }}
                  readOnly={!isCustom}
                  className={!isCustom ? "bg-slate-50 text-slate-600" : ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Site code</Label>
                <Input
                  value={siteCode}
                  onChange={(e) => setSiteCode(e.target.value.toUpperCase())}
                  readOnly={!isCustom}
                  className={`font-mono ${!isCustom ? "bg-slate-50 text-slate-600" : ""}`}
                  maxLength={8}
                />
              </div>
            </div>

            <Divider />

            {/* Report name */}
            <Field label="Report name *">
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g. June 2026 Monthly Inspection"
                required
              />
            </Field>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned visit date">
                <Input type="date" value={plannedVisitDate} onChange={(e) => setPlannedVisitDate(e.target.value)} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>

            {/* Report type — full width, no overlap */}
            <Field label="Report type">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {REPORT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Area / section (optional)">
                <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. North Block" />
              </Field>
              <Field label="Inspector name">
                <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="Your name" />
              </Field>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2 border border-slate-200">
              ✓ 12 standard inspection areas preloaded · Works fully offline — no signal needed
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-200" />;
}
