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
    created_at: string;
    priority: string | null;
    category: string | null;
    location: string | null;
  }>;
  photos: Array<{
    id: string;
    entry_id: string | null;
    photo_number: string;
    image_url: string;
    file_size: number;
    uploaded_at: string;
    caption: string | null;
  }>;
  disclaimer?: string | null;
};

// MJW brand
const BAR: [number, number, number] = [201, 162, 75];   // gold
const TEXT: [number, number, number] = [30, 33, 45];
const MUTED: [number, number, number] = [121, 131, 155]; // slate
const GOLD_DK: [number, number, number] = [154, 122, 46];

async function loadImage(
  url: string
): Promise<{ dataUrl: string; w: number; h: number } | null> {
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
  new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const DEFAULT_CATEGORY = "General Inspection Items";

function groupByCategory<T extends { category: string | null; entry_number: number }>(
  entries: T[]
): Array<{ section: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const key = (e.category && e.category.trim()) || DEFAULT_CATEGORY;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([section, items]) => ({
    section,
    items: items.sort((a, b) => a.entry_number - b.entry_number),
  }));
}

function drawHeaderFooter(
  doc: jsPDF,
  report: PdfReport["report"],
  margin: number
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i === 1) continue; // cover page: no header/footer
    // Header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const left = `MJW Site Report  ·  ${fmtDay(report.report_date)}`;
    doc.text(left, margin, 28);
    doc.text(report.site_name, pageW - margin, 28, { align: "right" });
    doc.setDrawColor(...BAR);
    doc.setLineWidth(0.5);
    doc.line(margin, 34, pageW - margin, 34);
    // Footer
    doc.text("MJW Site Report", margin, pageH - 20);
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 20, {
      align: "right",
    });
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
  if (y + needed > pageH - 40) {
    doc.addPage();
    return top;
  }
  return y;
}

function greyCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string
) {
  // Light card for printable cover
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

  // -------- Cover (white, print-friendly) --------
  doc.setFillColor(...BAR);
  doc.rect(0, 0, pageW, 4, "F");

  // Eyebrow
  doc.setTextColor(...GOLD_DK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text((data.report.report_type || "Site Inspection").toUpperCase(), margin, 200);

  // Title
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  const titleLines = doc.splitTextToSize(
    `${data.report.report_type || "Site Inspection"} Report`,
    pageW - margin * 2
  );
  doc.text(titleLines, margin, 240);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(...MUTED);
  const nameLines = doc.splitTextToSize(data.report.report_name, pageW - margin * 2);
  doc.text(nameLines, margin, 285);

  // Grey detail cards (2 cols × 2 rows)
  const cardW = (pageW - margin * 2 - 16) / 2;
  const cardH = 60;
  const startY = 340;
  greyCard(doc, margin, startY, cardW, cardH, "Site / Building", data.report.site_name);
  greyCard(
    doc,
    margin + cardW + 16,
    startY,
    cardW,
    cardH,
    "Report Date",
    `${fmtDay(data.report.report_date)}${
      data.report.inspection_time ? " · " + data.report.inspection_time.slice(0, 5) : ""
    }`
  );
  greyCard(
    doc,
    margin,
    startY + cardH + 12,
    cardW,
    cardH,
    "Inspector",
    data.report.inspector_name || "—"
  );
  greyCard(
    doc,
    margin + cardW + 16,
    startY + cardH + 12,
    cardW,
    cardH,
    "Site Code",
    data.report.site_code
  );
  greyCard(
    doc,
    margin,
    startY + (cardH + 12) * 2,
    cardW,
    cardH,
    "Total Items",
    String(data.entries.length)
  );
  greyCard(
    doc,
    margin + cardW + 16,
    startY + (cardH + 12) * 2,
    cardW,
    cardH,
    "Total Photos",
    String(data.photos.length)
  );

  if (data.report.client_name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(`Client / Landlord: ${data.report.client_name}`, margin, startY + (cardH + 12) * 3 + 12);
  }
  if (data.report.area) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(`Area / Section: ${data.report.area}`, margin, startY + (cardH + 12) * 3 + 28);
  }

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, pageH - 40);

  // -------- Table of Contents --------
  doc.addPage();
  let y = 60;
  sectionBar(doc, y, "Table of Contents", margin);
  y += 38;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  const tocRows: string[] = [];
  tocRows.push("Cover");
  tocRows.push("Table of Contents");
  if (grouped.length === 0) {
    tocRows.push("No inspection items recorded");
  } else {
    grouped.forEach((g, i) => tocRows.push(`${i + 1}. ${g.section}  (${g.items.length} item${g.items.length === 1 ? "" : "s"})`));
  }
  tocRows.push("Photo Register");
  if (data.disclaimer && data.disclaimer.trim()) tocRows.push("Disclaimer");
  for (const row of tocRows) {
    doc.text(row, margin + 4, y);
    y += 20;
  }

  // -------- Preload images --------
  const photoCache = new Map<string, { dataUrl: string; w: number; h: number }>();
  for (const p of data.photos) {
    if (!p.image_url) continue;
    const img = await loadImage(p.image_url);
    if (img) photoCache.set(p.id, img);
  }

  // -------- Detailed Sections --------
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

      // Item table (1 row)
      autoTable(doc, {
        startY: y,
        head: [["#", "Item", "Condition / Observation", "Recommendation / Action"]],
        body: [[String(e.entry_number), itemLabel, observation, recommendation]],
        styles: { fontSize: 9, cellPadding: 6, valign: "top", textColor: TEXT as any },
        headStyles: {
          fillColor: [241, 245, 249] as any,
          textColor: TEXT as any,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [250, 250, 250] as any },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 110 },
        },
        margin: { left: margin, right: margin },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Photo grid below item
      if (linked.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        y = ensureRoom(doc, y, 16);
        doc.text("Supporting Photos", margin, y);
        y += 6;

        const cols = linked.length === 1 ? 1 : linked.length === 2 ? 2 : linked.length === 4 ? 2 : 3;
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
              let dw = cellW;
              let dh = cellW / ratio;
              if (dh > cellH) {
                dh = cellH;
                dw = cellH * ratio;
              }
              const ox = x + (cellW - dw) / 2;
              const oy = y + (cellH - dh) / 2;
              try {
                doc.addImage(img.dataUrl, "JPEG", ox, oy, dw, dh);
              } catch {
                /* skip */
              }
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
      if (y > pageH - 120) {
        doc.addPage();
        y = 60;
        sectionBar(doc, y, `${group.section} (cont.)`, margin);
        y += 34;
      }
    }
  }

  // -------- Photo Register --------
  doc.addPage();
  y = 60;
  sectionBar(doc, y, "Photo Register", margin);
  y += 34;
  autoTable(doc, {
    startY: y,
    head: [["Photo #", "Section", "Item #", "Item", "Observation", "Uploaded", "Size"]],
    body: data.photos.map((p) => {
      const entry = data.entries.find((e) => e.id === p.entry_id);
      const section = entry?.category?.trim() || (entry ? DEFAULT_CATEGORY : "—");
      const itemNo = entry ? String(entry.entry_number) : "—";
      const itemName = entry?.item_name?.trim() || (entry ? `Item ${entry.entry_number}` : "—");
      const obs = entry
        ? entry.description.length > 60
          ? entry.description.slice(0, 57) + "…"
          : entry.description || "—"
        : "(unlinked)";
      return [
        p.photo_number,
        section,
        itemNo,
        itemName,
        obs,
        fmtDate(p.uploaded_at),
        `${(p.file_size / 1024).toFixed(0)} KB`,
      ];
    }),
    styles: { fontSize: 8, cellPadding: 4, textColor: TEXT as any },
    headStyles: { fillColor: [241, 245, 249] as any, textColor: TEXT as any, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] as any },
    margin: { left: margin, right: margin },
    theme: "grid",
  });

  // -------- Disclaimer (optional) --------
  if (data.disclaimer && data.disclaimer.trim()) {
    doc.addPage();
    y = 60;
    sectionBar(doc, y, "Disclaimer", margin);
    y += 38;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(data.disclaimer.trim(), pageW - margin * 2);
    doc.text(lines, margin, y);
  }

  // Headers / footers on all non-cover pages
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