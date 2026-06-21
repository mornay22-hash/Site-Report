export const DEFAULT_AREAS: string[] = [
  "Bathrooms",
  "Tenant signage",
  "Parking area",
  "Landscaping",
  "Upkeep",
  "Refuse area",
  "Tenant shopfront",
  "Compliance",
  "Lights",
  "Marketing / Signage",
  "Service providers",
  "General",
];

export const STATUS_OPTIONS = [
  "Needs Work",
  "Acceptable",
  "Good",
  "In Order",
  "Not Applicable",
] as const;
export type Status = (typeof STATUS_OPTIONS)[number];

export const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"] as const;
export type Priority = (typeof PRIORITY_OPTIONS)[number];

export const REPORT_TYPES = [
  "Routine Site Visit",
  "Monthly Inspection",
  "Compliance Follow-up",
  "Tenant / Area Walkthrough",
  "Maintenance Follow-up",
  "Other",
] as const;

export function statusTone(s: string | null | undefined): {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (s) {
    case "Needs Work":
      return { label: s, bg: "bg-red-50", text: "text-red-800", border: "border-red-300", dot: "bg-red-500" };
    case "Acceptable":
      return { label: s, bg: "bg-amber-50", text: "text-amber-900", border: "border-amber-300", dot: "bg-amber-500" };
    case "Good":
      return { label: s, bg: "bg-emerald-50", text: "text-emerald-900", border: "border-emerald-300", dot: "bg-emerald-500" };
    case "In Order":
      return { label: s, bg: "bg-stone-100", text: "text-stone-900", border: "border-stone-300", dot: "bg-stone-700" };
    case "Not Applicable":
      return { label: "N/A", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300", dot: "bg-slate-400" };
    default:
      return { label: "Set status", bg: "bg-white", text: "text-slate-500", border: "border-slate-300", dot: "bg-slate-300" };
  }
}

export function slugifyArea(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 24);
}