export type SavedTemplate = {
  id: string;
  name: string;
  site_name: string;
  site_code: string;
  report_type: string;
  report_name_pattern: string; // e.g. "{site} - {month} (Night Report)"
  area: string;
  inspector_name: string;
  areas: string[]; // preset inspection area names
  created_at: string;
};

const KEY = "mjw-report-templates";

export function loadTemplates(): SavedTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveTemplate(t: Omit<SavedTemplate, "id" | "created_at">): SavedTemplate {
  const all = loadTemplates();
  const entry: SavedTemplate = { ...t, areas: t.areas ?? [], id: crypto.randomUUID(), created_at: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify([...all, entry]));
  return entry;
}

export function updateTemplate(id: string, patch: Partial<Omit<SavedTemplate, "id" | "created_at">>) {
  const all = loadTemplates().map((t) => t.id === id ? { ...t, ...patch } : t);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteTemplate(id: string) {
  const all = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function resolveTemplateName(pattern: string, siteName: string): string {
  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  return pattern.replace("{site}", siteName).replace("{month}", month);
}
