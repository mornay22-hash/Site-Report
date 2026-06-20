export function generateSiteCode(siteName: string): string {
  return siteName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w.slice(0, 2))
    .join("")
    .slice(0, 6)
    .padEnd(3, "X");
}
