import { useEffect, useState } from "react";
import { subscribeSync, triggerSync } from "@/lib/offline/sync";
import { Cloud, CloudOff, Loader2, AlertTriangle } from "lucide-react";

export function OfflineIndicator() {
  const [s, setS] = useState({ online: true, pending: 0, failed: 0, running: false });
  useEffect(() => subscribeSync(setS), []);

  const offline = !s.online;
  const hasPending = s.pending > 0;
  const hasFailed = s.failed > 0;

  const tone = offline
    ? "bg-slate-100 text-slate-700 border-slate-300"
    : hasFailed
    ? "bg-red-50 text-red-800 border-red-300"
    : s.running || hasPending
    ? "bg-amber-50 text-amber-900 border-amber-300"
    : "bg-emerald-50 text-emerald-800 border-emerald-300";

  const label = offline
    ? `Offline${hasPending ? ` · ${s.pending} pending` : ""}`
    : hasFailed
    ? `${s.failed} failed`
    : s.running
    ? `Syncing${hasPending ? ` ${s.pending}` : "…"}`
    : hasPending
    ? `${s.pending} pending`
    : "Online";

  const Icon = offline ? CloudOff : hasFailed ? AlertTriangle : s.running ? Loader2 : Cloud;

  return (
    <button
      type="button"
      onClick={() => triggerSync()}
      title={offline ? "Working offline — changes are queued and will sync when signal returns" : "Click to sync now"}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-medium ${tone}`}
    >
      <Icon className={`w-3 h-3 ${s.running ? "animate-spin" : ""}`} />
      <span>{label}</span>
    </button>
  );
}
