import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfReport = {
  report: {
    report_name: string;
    site_name: string;
    site_code: string;
    report_date: string;
    inspection_time?: string | null;
    report_type?: string | null;
    inspector_name: string | null;
    area: string | null;
    client_name?: string | null;
    notes?: string | null;
  };
  entries: Array<{
    id: string;
    entry_number: number;
    description: string;
    recommendation?: string | null;
    item_name?: string | null;
    priority: string | null;
    category: string | null;
  }>;
  photos: Array<{
    id: string;
    entry_id: string | null;
    photo_number: string;
    image_url: string;  // blob:// URL works here
    file_size: number;
    uploaded_at: string;
    caption: string | null;
  }>;
};

const BAR: [number, number, number] = [201, 162, 75];
const TEXT: [number, number, number] = [30, 33, 45];
const MUTED: [number, number, number] = [121, 131, 155];
const GOLD_DK: [number, number, number] = [154, 122, 46];

async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });

const DEFAULT_CATEGORY = "General Inspection Items";

function groupByCategory<T extends { category: string | null; entry_number: number }>(entries: T[]) {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const key = (e.category?.trim()) || DEFAULT_CATEGORY;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([section, items]) => ({ section, items: items.sort((a, b) => a.entry_number - b.entry_number) }));
}

function drawHeaderFooter(doc: jsPDF, report: PdfReport["report"], margin: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i === 1) continue;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`MJW Site Report  ·  ${fmtDay(report.report_date)}`, margin, 28);
    doc.text(report.site_name, pageW - margin, 28, { align: "right" });
    doc.setDrawColor(...BAR);
    doc.setLineWidth(0.5);
    doc.line(margin, 34, pageW - margin, 34);
    doc.text("MJW Site Report", margin, pageH - 20);
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 20, { align: "right" });
    doc.setDrawColor(...BAR);
    doc.line(margin, pageH - 30, pageW - margin, pageH - 30);
    doc.setTextColor(...TEXT);
  }
}

function sectionBar(doc: jsPDF, y: number, text: string, margin: number) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BAR);
  doc.rect(margin, y, pageW - margin * 2, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(text.toUpperCase(), margin + 8, y + 15);
  doc.setTextColor(...TEXT);
}

function ensureRoom(doc: jsPDF, y: number, needed: number, top = 48): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 40) { doc.addPage(); return top; }
  return y;
}

function greyCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string) {
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x + 10, y + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TEXT);
  const lines = doc.splitTextToSize(value || "—", w - 20);
  doc.text(lines.slice(0, 2), x + 10, y + 32);
}

export async function generateReportPdf(data: PdfReport): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const grouped = groupByCategory(data.entries);

  // Cover page
  doc.setFillColor(...BAR);
  doc.rect(0, 0, pageW, 4, "F");
  doc.setTextColor(...GOLD_DK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text((data.report.report_type || "Site Inspection").toUpperCase(), margin, 200);
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  const titleLines = doc.splitTextToSize(`${data.report.report_type || "Site Inspection"} Report`, pageW - margin * 2);
  doc.text(titleLines, margin, 240);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(data.report.report_name, pageW - margin * 2), margin, 285);

  const cardW = (pageW - margin * 2 - 16) / 2;
  const cardH = 60;
  const startY = 340;
  greyCard(doc, margin, startY, cardW, cardH, "Site / Building", data.report.site_name);
  greyCard(doc, margin + cardW + 16, startY, cardW, cardH, "Report Date", `${fmtDay(data.report.report_date)}${data.report.inspection_time ? " · " + data.report.inspection_time.slice(0, 5) : ""}`);
  greyCard(doc, margin, startY + cardH + 12, cardW, cardH, "Inspector", data.report.inspector_name || "—");
  greyCard(doc, margin + cardW + 16, startY + cardH + 12, cardW, cardH, "Site Code", data.report.site_code);
  greyCard(doc, margin, startY + (cardH + 12) * 2, cardW, cardH, "Total Items", String(data.entries.length));
  greyCard(doc, margin + cardW + 16, startY + (cardH + 12) * 2, cardW, cardH, "Total Photos", String(data.photos.length));
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, pageH - 40);

  // Table of contents
  doc.addPage();
  let y = 60;
  sectionBar(doc, y, "Table of Contents", margin);
  y += 38;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  ["Cover", "Table of Contents", ...grouped.map((g, i) => `${i + 1}. ${g.section}  (${g.items.length} item${g.items.length === 1 ? "" : "s"})`), "Photo Register"].forEach((row) => {
    doc.text(row, margin + 4, y);
    y += 20;
  });

  // Preload images (blob:// URLs work with fetch)
  const photoCache = new Map<string, { dataUrl: string; w: number; h: number }>();
  for (const p of data.photos) {
    if (!p.image_url) continue;
    const img = await loadImage(p.image_url);
    if (img) photoCache.set(p.id, img);
  }

  // Sections
  for (const group of grouped) {
    doc.addPage();
    y = 60;
    sectionBar(doc, y, group.section, margin);
    y += 34;
    for (const e of group.items) {
      const linked = data.photos.filter((p) => p.entry_id === e.id);
      const observation = (e.description || "").trim() || "—";
      const recommendation = (e.recommendation || "").trim() || "—";
      const itemLabel = e.item_name?.trim() || `Item ${e.entry_number}`;
      autoTable(doc, {
        startY: y,
        head: [["#", "Item", "Condition / Observation", "Recommendation / Action"]],
        body: [[String(e.entry_number), itemLabel, observation, recommendation]],
        styles: { fontSize: 9, cellPadding: 6, valign: "top", textColor: TEXT as any },
        headStyles: { fillColor: [241, 245, 249] as any, textColor: TEXT as any, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 110 } },
        margin: { left: margin, right: margin },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      if (linked.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        y = ensureRoom(doc, y, 16);
        doc.text("Supporting Photos", margin, y);
        y += 6;
        const cols = linked.length === 1 ? 1 : linked.length === 2 ? 2 : 3;
        const gap = 8;
        const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
        const cellH = cols === 1 ? 200 : cols === 2 ? 170 : 130;
        for (let i = 0; i < linked.length; i += cols) {
          const row = linked.slice(i, i + cols);
          y = ensureRoom(doc, y, cellH + 22);
          for (let j = 0; j < row.length; j++) {
            const p = row[j];
            const x = margin + j * (cellW + gap);
            const img = photoCache.get(p.id);
            doc.setDrawColor(220, 220, 220);
            doc.rect(x, y, cellW, cellH);
            if (img) {
              const ratio = img.w / img.h;
              let dw = cellW, dh = cellW / ratio;
              if (dh > cellH) { dh = cellH; dw = cellH * ratio; }
              try { doc.addImage(img.dataUrl, "JPEG", x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh); } catch { /* skip */ }
            }
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...MUTED);
            doc.text(p.photo_number, x + 2, y + cellH + 12);
          }
          y += cellH + 18;
        }
        doc.setTextColor(...TEXT);
      }
      y += 6;
      if (y > pageH - 120) { doc.addPage(); y = 60; sectionBar(doc, y, `${group.section} (cont.)`, margin); y += 34; }
    }
  }

  // Photo register
  doc.addPage();
  y = 60;
  sectionBar(doc, y, "Photo Register", margin);
  y += 34;
  autoTable(doc, {
    startY: y,
    head: [["Photo #", "Section", "Item", "Uploaded", "Size"]],
    body: data.photos.map((p) => {
      const entry = data.entries.find((e) => e.id === p.entry_id);
      return [p.photo_number, entry?.category || "—", entry?.item_name || "—", fmtDate(p.uploaded_at), `${(p.file_size / 1024).toFixed(0)} KB`];
    }),
    styles: { fontSize: 8, cellPadding: 4, textColor: TEXT as any },
    headStyles: { fillColor: [241, 245, 249] as any, textColor: TEXT as any, fontStyle: "bold" },
    margin: { left: margin, right: margin },
    theme: "grid",
  });

  drawHeaderFooter(doc, data.report, margin);
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
