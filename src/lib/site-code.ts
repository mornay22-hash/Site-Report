export function generateSiteCode(siteName: string): string {
  const cleaned = siteName.trim().replace(/[^A-Za-z0-9\s]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SITE";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
}