// Guarded service-worker registration. Only registers in production on the
// real published origin — never in Lovable preview, iframe, or dev. Supports
// `?sw=off` kill switch to fully unregister.

export function registerOfflineSW() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const refuse = shouldRefuse();
  if (refuse) {
    void unregisterAll();
    return;
  }

  // Use the SW emitted by vite-plugin-pwa
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
      console.warn("[mjw-sw] register failed", e);
    });
  });
}

function shouldRefuse(): boolean {
  try {
    if (!import.meta.env.PROD) return true;
    if (window.self !== window.top) return true;
    const host = window.location.hostname;
    if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
    if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
    if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
    if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
    if (new URL(window.location.href).searchParams.get("sw") === "off") return true;
    return false;
  } catch {
    return true;
  }
}

async function unregisterAll() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => {
          const u = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          return u.endsWith("/sw.js") || u.endsWith("/service-worker.js");
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}
