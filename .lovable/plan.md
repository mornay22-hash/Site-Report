
# Offline-First Site Capture

Make the MJW Site Report app fully usable on site without signal. Open reports, change statuses, type comments, take photos — everything queues locally and syncs automatically when signal returns.

## What works offline

- Open the app from the home-screen icon with no signal (cached app shell).
- View any report you opened at least once while online (cached in IndexedDB).
- Set section status, toggle Repairs Required, edit repair fields, type comments, change priority/assigned/target date.
- Take photos with the camera and pick from gallery — multiple per section.
- Add Ad Hoc Items.
- Reorder, rename, delete sections.
- "Finish Report" (queued).
- A sync indicator in the header shows: Online / Offline / Syncing N changes / N photos pending.

PDF generation, ZIP export, and creating a brand-new report still require signal (they need a freshly generated server-side site code and bulk template seeding); we'll clearly disable those buttons when offline with a "needs connection" tooltip.

## How it works (technical)

**PWA shell** — install `vite-plugin-pwa` with `registerType: "autoUpdate"`, `NetworkFirst` for HTML, `CacheFirst` for hashed assets, `devOptions.enabled: false`, `injectRegister: null`. Register only from a guarded wrapper that refuses inside Lovable preview/iframe/dev and supports `?sw=off` kill switch. Add `/sw.js` kill-switch worker contract per the PWA skill.

**Manifest** — `public/manifest.webmanifest` with name "MJW Site Report", standalone display, theme colors matching current brand, icons (192/512/maskable) generated from the MJW logo.

**Local store (IndexedDB via `idb`)** — `src/lib/offline/db.ts` with object stores:
- `reports` — cached report rows, keyed by id
- `sections` — cached inspection_sections, keyed by id, indexed by report_id
- `photos` — cached photo metadata, indexed by section_id
- `photo_blobs` — actual image Blobs, keyed by local photo id (so they survive offline)
- `outbox` — queued mutations: `{ id, type, payload, attempts, lastError, createdAt }` where type is one of `section.update | section.insert | section.delete | section.reorder | photo.upload | photo.delete | report.update | report.complete`

**Data layer** — `src/lib/offline/repo.ts` wraps every Supabase call used by the report screen:
- Reads: try IndexedDB first, then network; on network success, refresh the cache. Cache is hydrated on first online load of a report.
- Writes: apply optimistically to IndexedDB, enqueue an outbox entry, return immediately. UI reads from IndexedDB so changes are visible regardless of network state.
- Photos: compress to Blob (existing `src/lib/compress.ts`), store Blob in `photo_blobs`, write a placeholder `photos` row with a temp id and `pending: true`, enqueue upload. UI renders from the local Blob URL until the real upload finishes, then swaps to the storage URL.

**Sync engine** — `src/lib/offline/sync.ts`:
- Listens to `window.online/offline`, `visibilitychange`, and a manual "Sync now" button.
- Drains the outbox in order, FIFO per report.
- Per entry: call the corresponding Supabase op; on success, mark complete and reconcile temp ids → real ids in cache; on failure, exponential backoff with max attempts and a visible "needs attention" state.
- Conflict policy: last-write-wins on scalar fields (status, comments, etc.). For photo uploads, ids are client-generated and never collide. We surface conflicts only if the server rejects (e.g. section was deleted on another device) — those go to a "Couldn't sync" tray with a retry/discard action.

**Auth offline** — Supabase session is already persisted in localStorage; user stays signed in offline. New sign-in still needs network.

**UI changes** — small additions only:
- `OfflineIndicator` in the report header (pill: green Online / amber Syncing N / grey Offline / red N failed).
- "Make available offline" check on the dashboard (auto-true for any report you open).
- Disabled state + tooltip on Export PDF / Export ZIP / New Report when offline.

## Out of scope (still)

- Background Sync API (we use foreground sync on focus/online events — Background Sync isn't available on iOS Safari, which is the primary device).
- Multi-device merge UI beyond last-write-wins + a "couldn't sync" tray.
- Offline creation of brand-new reports (requires server-side template seed and site-code allocation).
- Email/notifications.

## File changes

New:
- `public/manifest.webmanifest`
- `public/sw.js` (kill-switch stub for old SW paths if needed)
- `src/lib/offline/db.ts`
- `src/lib/offline/repo.ts`
- `src/lib/offline/sync.ts`
- `src/lib/offline/register-sw.ts` (guarded registrar)
- `src/components/offline-indicator.tsx`
- `src/assets/pwa-icon-192.png`, `pwa-icon-512.png`, `pwa-icon-maskable.png` (from existing MJW logo)

Edited:
- `vite.config.ts` — add `vite-plugin-pwa`
- `src/routes/__root.tsx` — add manifest/theme meta tags, wire registrar + global sync engine
- `src/routes/_authenticated/reports.$id.tsx` — swap direct supabase calls for `repo.ts`, render local blob URLs for pending photos, show indicator
- `src/routes/_authenticated/index.tsx` — read cached report list when offline, show offline indicator
- `package.json` — add `idb`, `vite-plugin-pwa`, `workbox-window`

No database migration is needed — all offline state is client-side.

## Validation

After build, drive the live preview with Playwright: open a report online, toggle DevTools offline, change a status + add a comment + add a photo, confirm UI updates and indicator says "1 pending"; go online, confirm it syncs and reads back from server.
