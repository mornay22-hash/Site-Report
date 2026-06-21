import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export type ZipPhoto = {
  id: string;
  photo_number: string;
  entry_id: string | null;
  image_path: string;
  uploaded_at: string;
  file_size: number;
};
export type ZipEntry = {
  id: string;
  entry_number: number;
  description: string;
};

function sanitize(s: string) {
  return s
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function zipFilename(siteCode: string, reportDate: string, reportName: string) {
  return `${sanitize(siteCode)}_${reportDate}_${sanitize(reportName)}_Photos.zip`;
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export async function buildPhotosZip(
  photos: ZipPhoto[],
  entries: ZipEntry[]
): Promise<Blob> {
  const zip = new JSZip();
  // Sign URLs in one batch
  const paths = photos.map((p) => p.image_path);
  const { data: signed } = await supabase.storage
    .from("report-photos")
    .createSignedUrls(paths, 60 * 10);
  const urlByPath: Record<string, string> = {};
  (signed ?? []).forEach((s, i) => {
    if (s.signedUrl) urlByPath[paths[i]] = s.signedUrl;
  });

  const csvRows: string[] = [
    ["photo_number", "entry_number", "description", "uploaded_at", "file_size", "image_filename"]
      .map(csvEscape)
      .join(","),
  ];

  for (const p of photos) {
    const url = urlByPath[p.image_path];
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const filename = `${p.photo_number}.jpg`;
      zip.file(filename, blob);
      const entry = entries.find((e) => e.id === p.entry_id);
      csvRows.push(
        [
          p.photo_number,
          entry ? `Entry ${entry.entry_number}` : "Unlinked",
          entry ? entry.description : "",
          fmtDate(p.uploaded_at),
          `${Math.round(p.file_size / 1024)} KB`,
          filename,
        ]
          .map((v) => csvEscape(String(v ?? "")))
          .join(",")
      );
    } catch {
      /* skip broken */
    }
  }

  zip.file("photo_index.csv", csvRows.join("\n"));
  return zip.generateAsync({ type: "blob" });
}