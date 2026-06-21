import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, LayoutTemplate, FileX, List, Trash2 } from "lucide-react";
import { generateSiteCode } from "@/lib/site-code";
import { DEFAULT_AREAS, REPORT_TYPES, slugifyArea } from "@/lib/templates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchAndCacheTemplates,
  listCachedTemplates,
  deleteTemplate,
  getTemplateAreas,
} from "@/lib/offline/repo";
import type { TemplateRow } from "@/lib/offline/db";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({ meta: [{ title: "New Report — MJW Site Report" }] }),
  component: NewReportPage,
});

type TemplateChoice = "default" | "blank" | string; // string = template id

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
  const [inspectorName, setInspectorName] = useState("");
  const [loading, setLoading] = useState(false);

  // Template selection
  const [templateChoice, setTemplateChoice] = useState<TemplateChoice | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(true);
  const [userTemplates, setUserTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Show cached immediately
      try {
        const { templates } = await listCachedTemplates();
        setUserTemplates(templates.filter((t) => !t.is_system));
      } catch { /* ignore */ }
      // Then fetch fresh if online
      if (navigator.onLine) {
        try {
          const { templates } = await fetchAndCacheTemplates();
          setUserTemplates(templates.filter((t) => !t.is_system));
        } catch { /* ignore */ }
      }
      setTemplatesLoading(false);
    }
    void load();
  }, []);

  async function resolveAreas(): Promise<string[]> {
    if (templateChoice === "blank") return [];
    if (templateChoice === "default" || templateChoice === null) return DEFAULT_AREAS;
    return await getTemplateAreas(templateChoice);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rn = reportName.trim();
    const sn = siteName.trim();
    if (!rn) return toast.error("Report name is required");
    if (!sn) return toast.error("Site / building name is required");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const code = (siteCode.trim() || generateSiteCode(sn)).toUpperCase();
      const { data, error } = await supabase
        .from("reports")
        .insert({
          user_id: u.user.id,
          report_name: rn,
          site_name: sn,
          site_code: code,
          report_date: plannedVisitDate,
          planned_visit_date: plannedVisitDate || null,
          due_date: dueDate || null,
          report_type: reportType,
          area: area.trim() || null,
          inspector_name: inspectorName.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const areas = await resolveAreas();
      if (areas.length > 0) {
        const sectionRows = areas.map((name, idx) => ({
          user_id: u.user!.id,
          report_id: data.id,
          area_name: name,
          area_slug: slugifyArea(name),
          sort_order: idx + 1,
        }));
        const { error: secErr } = await supabase.from("inspection_sections").insert(sectionRows);
        if (secErr) toast.error("Created report but failed to preload sections: " + secErr.message);
      }
      navigate({ to: "/reports/$id", params: { id: data.id }, replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create report");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTemplate(tplId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteTemplate(tplId);
      setUserTemplates((prev) => prev.filter((t) => t.id !== tplId));
      if (templateChoice === tplId) setTemplateChoice("default");
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  }

  const chosenLabel =
    templateChoice === "blank"
      ? "Blank report"
      : templateChoice === "default" || templateChoice === null
        ? "12 standard areas"
        : userTemplates.find((t) => t.id === templateChoice)?.name ?? "Custom template";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Template selection dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>How would you like to start?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            <TemplateOption
              icon={<List className="w-5 h-5" />}
              title="Standard 12-area template"
              subtitle="Bathrooms, Parking, Landscaping…"
              selected={templateChoice === "default" || templateChoice === null}
              onClick={() => setTemplateChoice("default")}
            />
            {!templatesLoading && userTemplates.map((t) => (
              <TemplateOption
                key={t.id}
                icon={<LayoutTemplate className="w-5 h-5" />}
                title={t.name}
                subtitle="Saved template"
                selected={templateChoice === t.id}
                onClick={() => setTemplateChoice(t.id)}
                onDelete={(e) => handleDeleteTemplate(t.id, e)}
              />
            ))}
            <TemplateOption
              icon={<FileX className="w-5 h-5" />}
              title="Blank report"
              subtitle="Start with no pre-loaded areas"
              selected={templateChoice === "blank"}
              onClick={() => setTemplateChoice("blank")}
            />
          </div>
          <Button
            className="w-full mt-3 bg-slate-900 hover:bg-slate-800"
            onClick={() => {
              if (!templateChoice) setTemplateChoice("default");
              setShowTemplateDialog(false);
            }}
          >
            Continue
          </Button>
        </DialogContent>
      </Dialog>

      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-2 h-14 flex items-center">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
          <div className="font-semibold text-slate-900 ml-2">New Site Visit Report</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5">
        <Card className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Report name *">
              <Input value={reportName} onChange={(e) => setReportName(e.target.value)} required />
            </Field>
            <Field label="Site / building name *">
              <Input
                value={siteName}
                onChange={(e) => {
                  setSiteName(e.target.value);
                  if (!siteCode) setSiteCode(generateSiteCode(e.target.value));
                }}
                required
              />
            </Field>
            <Field label="Site code" hint="Used in photo numbers, e.g. CGC-2026-06-09-BATHROOMS-001">
              <Input
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder={generateSiteCode(siteName)}
              />
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
                  {REPORT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Area / section (optional)">
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </Field>
            <Field label="Inspector name (optional)">
              <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2 border border-slate-200">
              <span>Template: <strong>{chosenLabel}</strong></span>
              <button
                type="button"
                className="text-slate-600 underline underline-offset-2"
                onClick={() => setShowTemplateDialog(true)}
              >
                Change
              </button>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 text-base bg-slate-900 hover:bg-slate-800">
              {loading ? "Creating…" : "Create report"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

function TemplateOption({
  icon,
  title,
  subtitle,
  selected,
  onClick,
  onDelete,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
        selected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
      }`}
    >
      <span className={selected ? "text-white" : "text-slate-500"}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{title}</div>
        <div className={`text-xs truncate ${selected ? "text-slate-300" : "text-slate-500"}`}>{subtitle}</div>
      </div>
      {onDelete && (
        <span
          role="button"
          onClick={onDelete}
          className={`p-1 rounded hover:bg-red-100 hover:text-red-700 ${selected ? "text-slate-300" : "text-slate-400"}`}
          title="Delete template"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </span>
      )}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
