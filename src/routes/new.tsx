import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, Building2 } from "lucide-react";
import { createReport } from "@/lib/repo";
import { generateSiteCode } from "@/lib/site-code";
import { REPORT_TYPES } from "@/lib/templates";
import { BUILDINGS } from "@/lib/buildings";

export const Route = createFileRoute("/new")({ component: NewReportPage });

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
    if (value === "__custom__") { setSiteName(""); setSiteCode(""); return; }
    const b = BUILDINGS.find((b) => b.code === value);
    if (!b) return;
    setSiteName(b.name);
    setSiteCode(b.code);
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
        report_name: rn, site_name: sn,
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
    } finally { setLoading(false); }
  }

  const isCustom = selectedBuilding === "__custom__" || selectedBuilding === "";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <header className="sticky top-0 z-10 border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/">
            <button className="flex items-center gap-1 text-sm px-2 py-1.5 rounded-lg transition-colors hover:opacity-80"
              style={{ color: "var(--text-2)" }}>
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          </Link>
          <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>New Site Visit Report</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <div className="rounded-xl border p-5 space-y-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <form onSubmit={onSubmit} className="space-y-5">

            {/* Building selector */}
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-1)" }}>
                <Building2 className="w-4 h-4" style={{ color: "var(--mjw-gold)" }} />
                Select building *
              </label>
              <DarkSelect value={selectedBuilding} onValueChange={onBuildingSelect} placeholder="Choose a building…">
                {BUILDINGS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    <span>{b.name}</span>
                    <span className="ml-2 text-xs opacity-50">{b.code}</span>
                  </SelectItem>
                ))}
                <SelectItem value="__custom__"><span className="opacity-50 italic">Enter manually…</span></SelectItem>
              </DarkSelect>
            </div>

            {/* Site name + code */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <DarkLabel>Site / building name *</DarkLabel>
                <DarkInput value={siteName} readOnly={!isCustom}
                  onChange={(e) => { setSiteName(e.target.value); if (isCustom && !siteCode) setSiteCode(generateSiteCode(e.target.value)); }}
                  required />
              </div>
              <div className="space-y-1.5">
                <DarkLabel>Site code</DarkLabel>
                <DarkInput value={siteCode} readOnly={!isCustom} className="font-mono"
                  onChange={(e) => setSiteCode(e.target.value.toUpperCase())} maxLength={8} />
              </div>
            </div>

            <div className="border-t" style={{ borderColor: "var(--border)" }} />

            {/* Report name */}
            <div className="space-y-1.5">
              <DarkLabel>Report name *</DarkLabel>
              <DarkInput value={reportName} onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g. June 2026 Monthly Inspection" required />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <DarkLabel>Planned visit date</DarkLabel>
                <DarkInput type="date" value={plannedVisitDate} onChange={(e) => setPlannedVisitDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <DarkLabel>Due date</DarkLabel>
                <DarkInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            {/* Report type */}
            <div className="space-y-1.5">
              <DarkLabel>Report type</DarkLabel>
              <DarkSelect value={reportType} onValueChange={setReportType}>
                {REPORT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </DarkSelect>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <DarkLabel>Area / section (optional)</DarkLabel>
                <DarkInput value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. North Block" />
              </div>
              <div className="space-y-1.5">
                <DarkLabel>Inspector name</DarkLabel>
                <DarkInput value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="Your name" />
              </div>
            </div>

            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--bg-card-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
              ✓ 12 standard inspection areas preloaded · Works fully offline
            </p>

            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}>
              {loading ? "Creating…" : "Create report"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function DarkLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{children}</label>;
}

function DarkInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-10 px-3 rounded-lg text-sm outline-none transition-colors focus:ring-1 read-only:opacity-60 ${className}`}
      style={{
        background: "var(--bg-card-2)",
        border: "1px solid var(--border)",
        color: "var(--text-1)",
        colorScheme: "dark",
      }}
    />
  );
}

function DarkSelect({ value, onValueChange, placeholder, children }: {
  value: string; onValueChange: (v: string) => void; placeholder?: string; children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-10 w-full rounded-lg border text-sm"
        style={{ background: "var(--bg-card-2)", borderColor: "var(--border)", color: value ? "var(--text-1)" : "var(--text-3)" }}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={4}
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-1)" }}>
        {children}
      </SelectContent>
    </Select>
  );
}
